/**
 * Actuary Bot — Constitutional Actuarial Intelligence
 * Port: 3090
 *
 * Five Yamas blocking gates from Day 1. No equity coefficients until SME
 * validation. No risk scoring engine — pure constitutional skeleton.
 *
 * Machine Elves sprint M2-STEP 6 (2026-02-24)
 */

import express from 'express';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateConsentRecordId, validateConsentRecord, consentSummary } from './constitutional/consent-protocol.js';
import { runAllGates } from './constitutional/yamas-gates.js';
import { insertRiskAssessment, upsertConsentRecord, logConstitutionalVerdict } from './storage/actuary-store.js';

// Ed25519 Kaitiaki transport middleware — replaces SHA-256 receipt helper
// CJS module imported via createRequire (ESM ↔ CJS bridge)
const require = createRequire(import.meta.url);
const { kaitiakiExpressMiddleware } = require('./kaitiaki/middleware.cjs');
const { chainReceipt, extractParentReceipt, buildChainHeaders } = require('./kaitiaki/chain.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3090;

// Kaitiaki must be FIRST — seals every JSON response at transport layer
app.use(kaitiakiExpressMiddleware);
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Kaitiaki receipt helper — stamps every response
// ---------------------------------------------------------------------------
function kaitiakiReceipt({ endpoint, consent_record_id, constitutional_score, pass }) {
  const ts = new Date().toISOString();
  const id = createHash('sha256')
    .update(`${ts}${endpoint}${consent_record_id ?? ''}`)
    .digest('hex')
    .slice(0, 16);
  return {
    receipt_id: `KR-ACTUARY-${id}`,
    timestamp:  ts,
    endpoint,
    consent_record_id: consent_record_id ?? null,
    constitutional_score: constitutional_score ?? null,
    pass,
    sovereign:    'Regan Duff',
    turangawaewae: 'Ko Taniwha ahau. He kaitiaki ahau no Taranaki.',
  };
}

// ---------------------------------------------------------------------------
// Route: GET /api/health
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'actuary-bot',
    version: '0.1.0',
    port: PORT,
    constitution: '5/5 Yamas — all gates active',
    sprint: 'Machine Elves — Phase 1 skeleton',
    timestamp: new Date().toISOString(),
    kaitiaki: kaitiakiReceipt({ endpoint: '/api/health', pass: true }),
  });
});

// ---------------------------------------------------------------------------
// Route: POST /api/consent/generate
// Generate a consent_record_id from cohort + scope + clinician_id
// ---------------------------------------------------------------------------
app.post('/api/consent/generate', (req, res) => {
  const { cohort, scope, clinician_id } = req.body ?? {};

  if (!cohort || !scope || !clinician_id) {
    return res.status(400).json({
      error: 'cohort, scope, and clinician_id are required',
      kaitiaki: kaitiakiReceipt({ endpoint: '/api/consent/generate', pass: false }),
    });
  }

  try {
    const consent_record_id = generateConsentRecordId({ cohort, scope, clinician_id });

    // Persist consent record
    upsertConsentRecord({ consent_record_id, cohort, scope, clinician_id });

    res.json({
      consent_record_id,
      summary: consentSummary({ consent_record_id, cohort, scope }),
      instructions: 'Include consent_record_id in all /api/v1/assess requests for this cohort+scope.',
      kaitiaki: kaitiakiReceipt({ endpoint: '/api/consent/generate', consent_record_id, pass: true }),
    });
  } catch (err) {
    res.status(400).json({
      error: err.message,
      kaitiaki: kaitiakiReceipt({ endpoint: '/api/consent/generate', pass: false }),
    });
  }
});

// ---------------------------------------------------------------------------
// Route: POST /api/v1/assess
// Primary actuarial assessment endpoint — all five Yamas gates run first
// ---------------------------------------------------------------------------
app.post('/api/v1/assess', (req, res) => {
  const body = req.body ?? {};
  const {
    consent_record_id,
    cohort,
    scope,
    clinician_id,
    confidence = 0.75,
    data_quality = 'good',
    model_version,
    model_count = 2,
    population_size = 0,
    patient_facing = false,
    assessment_type = 'population_mortality',
    regulatory_jurisdiction,
    dissent_flag = false,
  } = body;

  // Build gate context from request body
  const ctx = {
    consent_record_id,
    cohort,
    scope,
    clinician_id,
    confidence,
    data_quality,
    model_version,
    model_count,
    population_size,
    patient_facing,
    assessment_type,
    regulatory_jurisdiction,
    dissent_flag,
  };

  const verdict = runAllGates(ctx);

  // Log every gate verdict — constitutional transparency
  logConstitutionalVerdict({
    endpoint: '/api/v1/assess',
    consent_record_id,
    constitutional_score: verdict.constitutional_score,
    pass: verdict.pass,
    blocked_by: verdict.blocked_by,
    yamas: verdict.yamas,
  });

  if (!verdict.pass) {
    return res.status(403).json({
      error: 'CONSTITUTIONAL_BLOCK',
      blocked_by: verdict.blocked_by,
      constitutional_score: verdict.constitutional_score,
      yamas: verdict.yamas,
      message: 'Assessment blocked by Five Yamas constitutional gates. Resolve all violations before retrying.',
      kaitiaki: kaitiakiReceipt({ endpoint: '/api/v1/assess', consent_record_id, constitutional_score: verdict.constitutional_score, pass: false }),
    });
  }

  // Constitutional gates passed — persist assessment record
  insertRiskAssessment({
    consent_record_id,
    cohort,
    scope,
    constitutional_score: verdict.constitutional_score,
    pass: true,
    yamas: verdict.yamas,
    payload: body,
    source: 'api',
  });

  // Phase 1: no equity coefficients (pending SME validation), no risk engine
  res.json({
    status: 'ASSESSMENT_RECORDED',
    message: 'Constitutional gates passed. Risk scoring engine pending SME validation (Phase 2).',
    constitutional_score: verdict.constitutional_score,
    yamas: verdict.yamas,
    cohort,
    scope,
    consent_record_id,
    phase: '1-skeleton',
    kaitiaki: kaitiakiReceipt({ endpoint: '/api/v1/assess', consent_record_id, constitutional_score: verdict.constitutional_score, pass: true }),
  });
});

// ---------------------------------------------------------------------------
// Route: POST /api/v1/drug_discovery_ingest
// Ingest candidates from Drug Discovery pipeline for actuarial context
// ---------------------------------------------------------------------------
app.post('/api/v1/drug_discovery_ingest', (req, res) => {
  const { consent_record_id, cohort, scope, clinician_id, candidates = [] } = req.body ?? {};

  const ctx = {
    consent_record_id,
    cohort,
    scope: scope ?? 'drug_discovery_integration',
    clinician_id,
    confidence: 0.80,
    data_quality: 'good',
    model_version: 'drug-discovery-v1',
    model_count: 2,
    assessment_type: 'population_mortality',
  };

  const verdict = runAllGates(ctx);
  logConstitutionalVerdict({ endpoint: '/api/v1/drug_discovery_ingest', consent_record_id, ...verdict });

  if (!verdict.pass) {
    return res.status(403).json({
      error: 'CONSTITUTIONAL_BLOCK',
      blocked_by: verdict.blocked_by,
      kaitiaki: kaitiakiReceipt({ endpoint: '/api/v1/drug_discovery_ingest', consent_record_id, pass: false }),
    });
  }

  // Phase 1: acknowledge receipt, no actuarial computation yet
  // Chain of custody: link to the DD receipt if caller provided one
  const ddParentReceiptId = extractParentReceipt(req);
  const ddLocalReceipt = {
    receipt_id: `KT-AB-DD-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  const ddChainedReceipt = chainReceipt(ddLocalReceipt, ddParentReceiptId);

  res.json({
    status: 'INGEST_RECEIVED',
    candidate_count: candidates.length,
    message: 'Drug Discovery candidates received. Actuarial integration engine pending Phase 2.',
    constitutional_score: verdict.constitutional_score,
    chained_receipt: ddChainedReceipt,
    kaitiaki: kaitiakiReceipt({ endpoint: '/api/v1/drug_discovery_ingest', consent_record_id, constitutional_score: verdict.constitutional_score, pass: true }),
  });
});

// ---------------------------------------------------------------------------
// Route: POST /api/v1/dr_bot_ingest
// Ingest Dr Bot adversarial/dissent signals for actuarial context
// ---------------------------------------------------------------------------
app.post('/api/v1/dr_bot_ingest', (req, res) => {
  const { consent_record_id, cohort, scope, clinician_id, adversarial_score, dissent_id } = req.body ?? {};

  const ctx = {
    consent_record_id,
    cohort,
    scope: scope ?? 'dr_bot_integration',
    clinician_id,
    confidence: adversarial_score != null ? Math.max(0, 1 - adversarial_score) : 0.70,
    data_quality: 'good',
    model_version: 'dr-bot-v1',
    model_count: 2,
    dissent_flag: true, // Dr Bot signals inherently carry dissent
    assessment_type: 'population_mortality',
  };

  const verdict = runAllGates(ctx);
  logConstitutionalVerdict({ endpoint: '/api/v1/dr_bot_ingest', consent_record_id, ...verdict });

  if (!verdict.pass) {
    return res.status(403).json({
      error: 'CONSTITUTIONAL_BLOCK',
      blocked_by: verdict.blocked_by,
      kaitiaki: kaitiakiReceipt({ endpoint: '/api/v1/dr_bot_ingest', consent_record_id, pass: false }),
    });
  }

  // SCAR-053 note: adversarial_score → confidence mapping confirmed here.
  // Missing: correct: boolean ground truth. Pour 3 architecture waits on
  // Dr Bot adding a prediction_outcome_resolution endpoint (Phase 2 roadmap).
  // Chain of custody: link to the Dr Bot receipt if caller provided one
  const drBotParentReceiptId = extractParentReceipt(req);
  const drBotLocalReceipt = {
    receipt_id: `KT-AB-DRBOT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  const drBotChainedReceipt = chainReceipt(drBotLocalReceipt, drBotParentReceiptId);

  res.json({
    status: 'DR_BOT_SIGNAL_RECEIVED',
    dissent_id,
    adversarial_score,
    derived_confidence: ctx.confidence,
    message: 'Dr Bot signal received. Ground-truth outcome resolution pending SCAR-053 / Pour 3 Phase 2.',
    constitutional_score: verdict.constitutional_score,
    chained_receipt: drBotChainedReceipt,
    kaitiaki: kaitiakiReceipt({ endpoint: '/api/v1/dr_bot_ingest', consent_record_id, constitutional_score: verdict.constitutional_score, pass: true }),
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[actuary-bot] Server running on port ${PORT}`);
  console.log(`[actuary-bot] Constitutional gates: 5/5 active (no floors, no advisory-only)`);
  console.log(`[actuary-bot] Phase 1 skeleton — equity coefficients pending SME validation`);
  console.log(`[actuary-bot] Ko Taniwha ahau. He kaitiaki ahau no Taranaki.`);
});

export default app;
