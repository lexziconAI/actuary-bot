// src/advisor/advisor-chat.js
// Assessment Advisor — conversational interface to the Five Yamas gates

import { callCerebras, regexGodExtract } from './llm-caller.js';
import { AssessmentAccumulator } from './field-accumulator.js';
import { explainGates } from './gate-explainer.js';
import { runAllGates } from '../../constitutional/yamas-gates.js';
import { generateConsentRecordId } from '../../constitutional/consent-protocol.js';

const sessions = new Map();

const FIELD_EXTRACTION_PROMPT = `You extract actuarial assessment parameters from a researcher's message.
Output ONLY XML tags for fields that are MENTIONED. Skip fields not discussed.

<COHORT>population being studied, e.g. "nz-smokers-40-65"</COHORT>
<SCOPE>assessment type, e.g. "population_mortality"</SCOPE>
<CLINICIAN_ID>name or identifier of the requesting actuary</CLINICIAN_ID>
<MODEL_VERSION>name and version of the actuarial model</MODEL_VERSION>
<CONFIDENCE>number 0-1</CONFIDENCE>
<DATA_QUALITY>good/high/excellent/poor/unknown</DATA_QUALITY>
<MODEL_COUNT>number of models in ensemble</MODEL_COUNT>
<POPULATION_SIZE>integer</POPULATION_SIZE>
<PATIENT_FACING>true/false</PATIENT_FACING>
<ASSESSMENT_TYPE>type of assessment</ASSESSMENT_TYPE>
<REGULATORY_JURISDICTION>e.g. "nz-privacy"</REGULATORY_JURISDICTION>
<EQUITY_FLAG>equity consideration statement</EQUITY_FLAG>
<DISSENT_FLAG>true/false</DISSENT_FLAG>
<STOP_SIGNAL>true if user wants to submit now</STOP_SIGNAL>

Scope mapping:
- mortality/death rates/survival → "population_mortality"
- life insurance pricing → "life_insurance_pricing"
- health insurance risk → "health_insurance_risk"
- reinsurance modelling → "reinsurance_modelling"
- drug discovery → "drug_discovery_integration"
- dr bot → "dr_bot_integration"

Only output tags for information PRESENT in the message.`;

function buildSystemPrompt(acc, completeness, gateResult, explanations) {
  const known = acc.toSummary() || '  (none yet)';
  const missing = acc.getMissing();

  const gateStatus = gateResult
    ? Object.entries(gateResult.yamas || {})
        .map(([k, v]) => `  ${k}: ${v?.pass ? 'PASS' : 'BLOCK'} score=${(v?.score ?? 0).toFixed(2)}`)
        .join('\n')
    : '  (not yet simulated — provide more fields)';

  const issues = explanations?.length > 0
    ? explanations.map((e, i) => `  ${i + 1}. ${e}`).join('\n')
    : '  No blocking issues';

  return `You are the Assessment Advisor — a constitutional actuarial assistant.
Help the actuary build a valid assessment through conversation.

KNOWN FIELDS:
${known}

FIELDS STILL REQUIRED:
${missing.length > 0 ? missing.map(f => `  MISSING: ${f}`).join('\n') : '  All required fields present'}

GATE SIMULATION:
${gateStatus}

CURRENT ISSUES:
${issues}

CONSENT: ${acc.consentGenerated ? 'Generated' : 'Not yet generated'}
${acc.needsEquityFlag() ? 'WARNING: Population > 10,000 — equity_flag required' : ''}
COMPLETENESS: ${completeness.score}% (${completeness.state})

RULES:
1. NEVER ask about a field already gathered.
2. If a gate blocks, explain WHY and how to fix — plain language only.
3. Keep responses to 2-3 sentences max.
4. If all required fields are set, offer to generate consent.
5. If consent is generated and gates pass, recommend submitting.
6. End each response with: <HINT>next most important thing</HINT>
7. NEVER use markdown formatting. No asterisks, no hashes, no bullet points, no bold, no italics. Plain conversational sentences only.`;
}

function scoreCompleteness(acc) {
  const WEIGHTS = {
    cohort: 20, scope: 20, clinician_id: 10, consent_record_id: 15,
    model_version: 15, confidence: 5, regulatory_jurisdiction: 5,
    equity_flag: 5, population_size: 3, model_count: 2,
  };

  let score = 0, max = 0;
  for (const [field, weight] of Object.entries(WEIGHTS)) {
    max += weight;
    const v = acc.fields[field];
    if (v?.value !== null && v?.source !== 'default' && v?.value !== '') score += weight;
    else if (v?.source === 'default') score += weight * 0.3;
  }

  const pct = Math.min(100, Math.round((score / max) * 100));
  let state = 'GATHERING';
  if (acc.stopSignalled) state = 'SUBMIT_NOW';
  else if (pct >= 80 && acc.consentGenerated) state = 'READY';
  else if (pct >= 50) state = 'BUILDING';

  return { score: pct, state, missing: acc.getMissing() };
}

async function handleAdvisorTurn(sessionId, message, history = []) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new AssessmentAccumulator());
  }
  const acc = sessions.get(sessionId);
  acc.turnCount++;

  // Field extraction via Regex God
  const extracted = await regexGodExtract(FIELD_EXTRACTION_PROMPT, message);

  // Update accumulator from extracted fields
  const fieldMap = {
    COHORT: 'cohort', SCOPE: 'scope', CLINICIAN_ID: 'clinician_id',
    MODEL_VERSION: 'model_version', CONFIDENCE: 'confidence',
    DATA_QUALITY: 'data_quality', MODEL_COUNT: 'model_count',
    POPULATION_SIZE: 'population_size', PATIENT_FACING: 'patient_facing',
    ASSESSMENT_TYPE: 'assessment_type', REGULATORY_JURISDICTION: 'regulatory_jurisdiction',
    EQUITY_FLAG: 'equity_flag', DISSENT_FLAG: 'dissent_flag',
  };

  for (const [xmlTag, fieldName] of Object.entries(fieldMap)) {
    if (extracted[xmlTag] !== undefined && extracted[xmlTag] !== '') {
      let val = extracted[xmlTag];
      if (fieldName === 'confidence') val = parseFloat(val) || 0.75;
      if (['model_count', 'population_size'].includes(fieldName)) val = parseInt(val) || 0;
      if (['patient_facing', 'dissent_flag'].includes(fieldName)) val = val === 'true';
      acc.update(fieldName, val, 'chat');
    }
  }
  if (extracted.STOP_SIGNAL === 'true') acc.stopSignalled = true;

  // Gate simulation (deterministic — no LLM needed)
  // runAllGates returns { pass, constitutional_score, yamas: {ahimsa, satya, asteya, brahmacharya, aparigraha}, blocked_by }
  const ctx = acc.getFieldValues();
  let gateResult = null;
  let explanations = [];
  try {
    gateResult = runAllGates(ctx);
    acc.lastGateSimulation = gateResult;
    // explainGates expects flat { ahimsa, satya, ... } — pull from yamas
    const flatGates = gateResult.yamas || {};
    explanations = explainGates(flatGates, ctx);
  } catch (e) {
    // Expected when required fields are missing (e.g. consent validation throws)
    console.error('[Advisor] Gate sim error (expected if fields missing):', e.message);
  }

  const completeness = scoreCompleteness(acc);

  // Chat response via Cerebras
  const systemPrompt = buildSystemPrompt(acc, completeness, gateResult, explanations);
  const chatResult = await callCerebras([
    { role: 'system', content: systemPrompt },
    ...history.slice(-8),
    { role: 'user', content: message },
  ], { temperature: 0.5, max_tokens: 500 });

  let response = '';
  let hint = null;

  if (chatResult.fallback || chatResult.error || !chatResult.content) {
    const missing = acc.getMissing();
    if (missing.length > 0) {
      response = `Please provide: ${missing.slice(0, 2).join(', ')}.`;
      hint = `Provide: ${missing[0]}`;
    } else if (!acc.consentGenerated) {
      response = `All fields gathered. Click "Generate Consent Record" to proceed.`;
      hint = 'Generate consent record';
    } else {
      response = `Ready to submit. Click "Submit Assessment".`;
      hint = 'Click Submit Assessment';
    }
  } else {
    response = chatResult.content;
    const hintMatch = response.match(/<HINT>([\s\S]*?)<\/HINT>/);
    if (hintMatch) {
      hint = hintMatch[1].trim();
      response = response.replace(/<HINT>[\s\S]*?<\/HINT>/, '').trim();
    }
  }

  // Build gate simulation output for frontend — pull from yamas structure
  let gateSimulation = null;
  if (gateResult) {
    const y = gateResult.yamas || {};
    gateSimulation = {
      pass: gateResult.pass,
      composite_score: gateResult.constitutional_score,
      gates: {
        ahimsa:       { score: y.ahimsa?.score,       pass: y.ahimsa?.pass },
        satya:        { score: y.satya?.score,         pass: y.satya?.pass },
        asteya:       { score: y.asteya?.score,        pass: y.asteya?.pass },
        brahmacharya: { score: y.brahmacharya?.score,  pass: y.brahmacharya?.pass },
        aparigraha:   { score: y.aparigraha?.score,    pass: y.aparigraha?.pass },
      },
    };
  }

  return {
    response,
    hint,
    completeness,
    gateSimulation,
    explanations,
    fields: acc.getFieldValues(),
    consentGenerated: acc.consentGenerated,
    needsEquityFlag: acc.needsEquityFlag(),
    turnNumber: acc.turnCount,
    sessionId,
  };
}

async function handleConsentGeneration(sessionId) {
  const acc = sessions.get(sessionId);
  if (!acc) return { error: 'No active session' };

  const { cohort, scope, clinician_id } = acc.getFieldValues();
  if (!cohort || !scope || !clinician_id) {
    return { error: 'Need cohort, scope, and clinician_id first' };
  }

  try {
    const consent_record_id = generateConsentRecordId({ cohort, scope, clinician_id });
    acc.update('consent_record_id', consent_record_id, 'generated');
    acc.consentGenerated = true;
    return { consent_record_id, cohort, scope, clinician_id };
  } catch (e) {
    return { error: e.message };
  }
}

function clearSession(sessionId) {
  sessions.delete(sessionId);
}

export { handleAdvisorTurn, handleConsentGeneration, clearSession };
