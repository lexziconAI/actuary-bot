// src/advisor/gate-explainer.js
// Human-readable gate explanations

const EXPLANATIONS = {
  ahimsa: {
    forbidden_type: (ctx) =>
      `BLOCKED: Assessment type "${ctx.assessment_type}" is permanently blocked — it has caused discriminatory harm. ` +
      `Use a non-discriminatory scope instead.`,
    equity_missing: (ctx) =>
      `WARNING: Population ${ctx.population_size} exceeds 10,000 — equity_flag required. ` +
      `Example: "age-stratified" or "sex-adjusted".`,
    patient_facing: () =>
      `NOTE: Patient-facing assessments reduce Ahimsa from 0.95 to 0.80. ` +
      `Ensure other gates score well to keep composite above 0.60.`,
  },
  satya: {
    low_confidence: (ctx) =>
      `WARNING: Model confidence ${ctx.confidence} is below the 0.60 minimum. ` +
      `Use a better-calibrated model or improve training data.`,
    no_model_version: () =>
      `WARNING: No model_version specified. Name the model used (e.g. "cox-ph-v2.1").`,
    poor_data: (ctx) =>
      `WARNING: Data quality "${ctx.data_quality}" fails Satya gate. ` +
      `Only 'good', 'high', or 'excellent' pass.`,
  },
  asteya: {
    no_consent: () =>
      `BLOCKED: No consent_record_id — no analysis without consent. ` +
      `Generate a consent record with your cohort, scope, and clinician ID.`,
    invalid_consent: () =>
      `BLOCKED: Consent record does not match cohort/scope/clinician. ` +
      `Generate a new consent record with the current parameters.`,
  },
  brahmacharya: {
    invalid_scope: (ctx) =>
      `BLOCKED: Scope "${ctx.scope}" is not in the validated whitelist. ` +
      `Valid scopes: life_insurance_pricing, health_insurance_risk, reinsurance_modelling, ` +
      `population_mortality, drug_discovery_integration, dr_bot_integration.`,
    no_jurisdiction: () =>
      `NOTE: No regulatory_jurisdiction. Adding one (e.g. "nz-privacy", "eu-gdpr") ` +
      `improves Brahmacharya from 0.70 to 0.90.`,
  },
  aparigraha: {
    single_model: () =>
      `WARNING: model_count=1 with no dissent_flag. Aparigraha requires at least 2 models ` +
      `or dissent_flag=true for ensemble diversity.`,
    no_dissent: () =>
      `NOTE: No dissent_flag. If alternative interpretations exist, setting dissent_flag=true ` +
      `improves Aparigraha from 0.72 to 0.80.`,
  },
};

const FORBIDDEN_TYPES = ['genetic_exclusion', 'racial_profiling', 'disability_penalty'];

function explainGates(gateResult, ctx) {
  if (!gateResult) return [];
  const explanations = [];

  // Ahimsa
  if (!gateResult.ahimsa?.pass) {
    if (FORBIDDEN_TYPES.includes(ctx.assessment_type)) {
      explanations.push(EXPLANATIONS.ahimsa.forbidden_type(ctx));
    }
    if ((ctx.population_size || 0) > 10000 && !ctx.equity_flag) {
      explanations.push(EXPLANATIONS.ahimsa.equity_missing(ctx));
    }
  } else if (ctx.patient_facing) {
    explanations.push(EXPLANATIONS.ahimsa.patient_facing());
  }

  // Satya
  if (!gateResult.satya?.pass) {
    if ((ctx.confidence || 0) < 0.60) explanations.push(EXPLANATIONS.satya.low_confidence(ctx));
    if (!ctx.model_version) explanations.push(EXPLANATIONS.satya.no_model_version());
    if (!['good', 'high', 'excellent'].includes(ctx.data_quality)) {
      explanations.push(EXPLANATIONS.satya.poor_data(ctx));
    }
  }

  // Asteya
  if (!gateResult.asteya?.pass) {
    if (!ctx.consent_record_id) {
      explanations.push(EXPLANATIONS.asteya.no_consent());
    } else {
      explanations.push(EXPLANATIONS.asteya.invalid_consent());
    }
  }

  // Brahmacharya
  if (!gateResult.brahmacharya?.pass) {
    explanations.push(EXPLANATIONS.brahmacharya.invalid_scope(ctx));
  } else if (!ctx.regulatory_jurisdiction) {
    explanations.push(EXPLANATIONS.brahmacharya.no_jurisdiction());
  }

  // Aparigraha
  if ((gateResult.aparigraha?.score || 1) < 0.75) {
    if ((ctx.model_count || 1) < 2 && !ctx.dissent_flag) {
      explanations.push(EXPLANATIONS.aparigraha.single_model());
    } else if (!ctx.dissent_flag) {
      explanations.push(EXPLANATIONS.aparigraha.no_dissent());
    }
  }

  return explanations;
}

export { explainGates, EXPLANATIONS };
