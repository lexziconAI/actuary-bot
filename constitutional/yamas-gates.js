/**
 * yamas-gates.js — Five Yamas Constitutional Gates for Actuary Bot
 *
 * All five gates BLOCK from Day 1. No floors. No advisory-only gates.
 * A gate that doesn't block is not a gate — it's a checkbox.
 *
 * Constitutional scoring:
 *   C = 0.25*Ahimsa + 0.25*Satya + 0.15*Asteya + 0.20*Brahmacharya + 0.15*Aparigraha
 *   brahmacharya < 0.5 → AUTOMATIC REJECT (regardless of composite)
 *   C < 0.6 → REJECT
 *
 * Machine Elves sprint M2-STEP 4 (2026-02-24)
 */

import { validateConsentRecord } from './consent-protocol.js';

// ---------------------------------------------------------------------------
// Gate 1 — AHIMSA (non-harm)
// Does this assessment risk harming the individual or community?
// ---------------------------------------------------------------------------

/**
 * @param {{ equity_flag?: string, population_size?: number, patient_facing?: boolean, assessment_type?: string }} ctx
 * @returns {{ pass: boolean, score: number, reason: string }}
 */
export function ahimsaGate(ctx) {
  const { equity_flag, population_size = 0, patient_facing = false, assessment_type = '' } = ctx;

  // Block discriminatory assessment types
  const FORBIDDEN_TYPES = ['genetic_exclusion', 'racial_profiling', 'disability_penalty'];
  if (FORBIDDEN_TYPES.includes(assessment_type)) {
    return { pass: false, score: 0.0, reason: `AHIMSA_VIOLATION: assessment_type '${assessment_type}' is prohibited` };
  }

  // Block unflagged equity concerns on large populations
  if (population_size > 10000 && !equity_flag) {
    return { pass: false, score: 0.0, reason: 'AHIMSA_VIOLATION: large-population assessment requires equity_flag' };
  }

  // Patient-facing assessments require explicit high-confidence path (enforced in Satya)
  const score = patient_facing ? 0.80 : 0.95;
  return { pass: true, score, reason: 'AHIMSA_PASS' };
}

// ---------------------------------------------------------------------------
// Gate 2 — SATYA (truthfulness)
// Are the confidence and data quality claims accurate?
// ---------------------------------------------------------------------------

/**
 * @param {{ confidence?: number, data_quality?: string, model_version?: string }} ctx
 * @returns {{ pass: boolean, score: number, reason: string }}
 */
export function satyaGate(ctx) {
  const { confidence = 0, data_quality = 'unknown', model_version } = ctx;

  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return { pass: false, score: 0.0, reason: 'SATYA_VIOLATION: confidence must be a number in [0, 1]' };
  }

  if (confidence < 0.60) {
    return { pass: false, score: 0.0, reason: `SATYA_VIOLATION: confidence ${confidence.toFixed(3)} < minimum 0.60` };
  }

  if (data_quality === 'unknown' || data_quality === 'poor') {
    return { pass: false, score: 0.0, reason: `SATYA_VIOLATION: data_quality '${data_quality}' is insufficient for actuarial assessment` };
  }

  if (!model_version) {
    return { pass: false, score: 0.0, reason: 'SATYA_VIOLATION: model_version must be declared (prevents hidden model drift)' };
  }

  const score = Math.min(1.0, confidence * 1.1); // slight boost for declared model version
  return { pass: true, score, reason: 'SATYA_PASS' };
}

// ---------------------------------------------------------------------------
// Gate 3 — ASTEYA (non-stealing / consent)
// Has valid consent been provided?
// ---------------------------------------------------------------------------

/**
 * @param {{ consent_record_id?: string, cohort?: string, scope?: string, clinician_id?: string }} ctx
 * @returns {{ pass: boolean, score: number, reason: string }}
 */
export function asteyaGate(ctx) {
  const { consent_record_id, cohort, scope, clinician_id } = ctx;

  if (!consent_record_id) {
    return { pass: false, score: 0.0, reason: 'ASTEYA_VIOLATION: consent_record_id is required — no analysis without consent' };
  }

  const validation = validateConsentRecord(consent_record_id, { cohort, scope, clinician_id });
  if (!validation.valid) {
    return { pass: false, score: 0.0, reason: `ASTEYA_VIOLATION: ${validation.reason}` };
  }

  return { pass: true, score: 0.95, reason: 'ASTEYA_PASS' };
}

// ---------------------------------------------------------------------------
// Gate 4 — BRAHMACHARYA (ethical boundaries / domain guard)
// Is this request within the validated scope of actuarial practice?
// ---------------------------------------------------------------------------

const VALIDATED_SCOPES = new Set([
  'life_insurance_pricing',
  'health_insurance_risk',
  'reinsurance_modelling',
  'population_mortality',
  'drug_discovery_integration',
  'dr_bot_integration',
]);

/**
 * @param {{ scope?: string, regulatory_jurisdiction?: string }} ctx
 * @returns {{ pass: boolean, score: number, reason: string }}
 */
export function brahmaacharyaGate(ctx) {
  const { scope, regulatory_jurisdiction } = ctx;

  if (!scope) {
    return { pass: false, score: 0.0, reason: 'BRAHMACHARYA_VIOLATION: scope is required' };
  }

  if (!VALIDATED_SCOPES.has(scope)) {
    return {
      pass: false,
      score: 0.0,
      reason: `BRAHMACHARYA_VIOLATION: scope '${scope}' is not in validated scope list. ` +
              `Validated scopes: ${[...VALIDATED_SCOPES].join(', ')}`,
    };
  }

  // Regulatory jurisdiction adds provenance (advisory — but absence reduces score)
  const score = regulatory_jurisdiction ? 0.90 : 0.70;
  return { pass: true, score, reason: 'BRAHMACHARYA_PASS' };
}

// ---------------------------------------------------------------------------
// Gate 5 — APARIGRAHA (non-hoarding / diversity)
// Does this assessment avoid monopolising a single model's view?
// ---------------------------------------------------------------------------

/**
 * @param {{ model_count?: number, dissent_flag?: boolean }} ctx
 * @returns {{ pass: boolean, score: number, reason: string }}
 */
export function aparigrahaGate(ctx) {
  const { model_count = 1, dissent_flag = false } = ctx;

  // Single-model assessments with no dissent flag are blocked
  // Actuarial decisions should never rest on one model's opinion alone
  if (model_count < 2 && !dissent_flag) {
    return {
      pass: false,
      score: 0.0,
      reason: 'APARIGRAHA_VIOLATION: assessments must use ≥2 models or carry explicit dissent_flag=true',
    };
  }

  const score = model_count >= 3 ? 0.95 : (dissent_flag ? 0.80 : 0.72);
  return { pass: true, score, reason: 'APARIGRAHA_PASS' };
}

// ---------------------------------------------------------------------------
// Composite gate — runs all five, returns structured verdict
// ---------------------------------------------------------------------------

/**
 * Run all five Yamas gates and compute a composite constitutional score.
 *
 * @param {Object} ctx — merged request context (consent, cohort, scope, etc.)
 * @returns {{
 *   pass: boolean,
 *   constitutional_score: number,
 *   yamas: Object,
 *   blocked_by: string[],
 *   receipt_fields: Object
 * }}
 */
export function runAllGates(ctx) {
  const ahimsa      = ahimsaGate(ctx);
  const satya       = satyaGate(ctx);
  const asteya      = asteyaGate(ctx);
  const brahmacharya = brahmaacharyaGate(ctx);
  const aparigraha  = aparigrahaGate(ctx);

  const scores = { ahimsa, satya, asteya, brahmacharya, aparigraha };
  const blocked_by = Object.entries(scores)
    .filter(([, r]) => !r.pass)
    .map(([name, r]) => `${name}: ${r.reason}`);

  // Brahmacharya is a hard-block — if it fails, composite is 0
  const brahmaAuto = !brahmacharya.pass;

  const constitutional_score = brahmaAuto ? 0 :
    0.25 * (ahimsa.score)       +
    0.25 * (satya.score)        +
    0.15 * (asteya.score)       +
    0.20 * (brahmacharya.score) +
    0.15 * (aparigraha.score);

  const pass = blocked_by.length === 0 && constitutional_score >= 0.60;

  return {
    pass,
    constitutional_score: Math.round(constitutional_score * 1000) / 1000,
    yamas: {
      ahimsa:       { score: ahimsa.score,       pass: ahimsa.pass,       reason: ahimsa.reason },
      satya:        { score: satya.score,         pass: satya.pass,         reason: satya.reason },
      asteya:       { score: asteya.score,        pass: asteya.pass,        reason: asteya.reason },
      brahmacharya: { score: brahmacharya.score,  pass: brahmacharya.pass,  reason: brahmacharya.reason },
      aparigraha:   { score: aparigraha.score,    pass: aparigraha.pass,    reason: aparigraha.reason },
    },
    blocked_by,
    receipt_fields: {
      constitutional_score,
      gate_timestamp: new Date().toISOString(),
      brahmacharya_auto_reject: brahmaAuto,
    },
  };
}
