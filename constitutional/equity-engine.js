/**
 * equity-engine.js — Actuary Bot Phase 2 Scaffold
 *
 * Equity coefficient application for actuarial risk scoring.
 * Implements Te Tiriti-aligned adjustments for Māori and Pacific peoples.
 *
 * STATUS: PROVISIONAL SCAFFOLD
 * SME_CLEARANCE = false — DO NOT USE IN PRODUCTION
 *
 * All coefficients below are PROVISIONAL placeholders.
 * They must be reviewed and validated by:
 *   - Te Whatu Ora (Health New Zealand) clinical epidemiologists
 *   - Māori health equity specialists (e.g., Te ORA advisory panel)
 *   - Pacific health equity specialists (e.g., Le Va advisory panel)
 *   - An independent biostatistician
 *
 * This engine WILL NOT ACTIVATE until SME_CLEARANCE = true.
 * Setting SME_CLEARANCE = true without the above validation is a
 * constitutional violation (Ahimsa — non-harm to vulnerable populations).
 *
 * Phase 2 — Actuary Bot Equity Engine
 * Sprint: beta/sprint-drug-completion-shared-yamas (2026-02-24)
 * SCAR reference: SCAR-054 (Aparigraha advisory→blocking, 5/5 gates live)
 */

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION GUARD — DO NOT REMOVE
// This must remain false until formal SME validation is complete.
// ─────────────────────────────────────────────────────────────────────────────
const SME_CLEARANCE = false;

// ─────────────────────────────────────────────────────────────────────────────
// PROVISIONAL EQUITY COEFFICIENTS
//
// Each coefficient is a multiplier applied to the base actuarial risk score.
// > 1.0 = elevated risk (condition historically underdiagnosed or underfunded)
// < 1.0 = reduced base risk (condition has protective population factors)
//
// ALL VALUES ARE PROVISIONAL — sourced from published NZ epidemiology studies
// as placeholders only. Must be replaced with validated figures before use.
//
// Sources consulted during scaffolding (NOT authoritative for production):
//  - NZ Health Survey 2022/23 (Stats NZ / Te Whatu Ora)
//  - He Ara Oranga (Mental Health and Addiction Inquiry 2018)
//  - Pacific Peoples' Health Report 2024 (Te Whatu Ora)
// ─────────────────────────────────────────────────────────────────────────────
const PROVISIONAL_EQUITY_COEFFICIENTS = {
  // ── Māori (Tangata Whenua) ──────────────────────────────────────────────
  maori: {
    gout: {
      coefficient: 1.35,
      validated: false,
      note: 'PROVISIONAL — Māori have significantly higher gout prevalence (est. 3-5x general population). Source: NZ Gout Longitudinal Study placeholder.',
    },
    rheumatic_fever: {
      coefficient: 1.80,
      validated: false,
      note: 'PROVISIONAL — Acute rheumatic fever incidence in Māori children estimated 8-15x general population in high-deprivation areas. Source: ARF surveillance reports placeholder.',
    },
    type2_diabetes: {
      coefficient: 1.45,
      validated: false,
      note: 'PROVISIONAL — Type 2 diabetes prevalence approximately 1.5-2x general population. Source: NZ Health Survey 2022/23 placeholder.',
    },
    cardiovascular: {
      coefficient: 1.30,
      validated: false,
      note: 'PROVISIONAL — Cardiovascular disease mortality rates approximately 1.3-1.5x general population after age standardisation. Source: NZHIS placeholder.',
    },
    sudi: {
      coefficient: 2.10,
      validated: false,
      note: 'PROVISIONAL — Sudden Unexpected Death in Infancy rates approximately 2-3x general population. This coefficient is particularly sensitive — requires specialist SME validation before any actuarial use. Source: Plunket/MoH SUDI monitoring placeholder.',
    },
  },

  // ── Pacific Peoples ─────────────────────────────────────────────────────
  pacific: {
    gout: {
      coefficient: 1.65,
      validated: false,
      note: 'PROVISIONAL — Pacific peoples have highest gout prevalence of any NZ ethnic group (est. 5-8x general population). Coefficient is aggregate across Samoan, Tongan, Cook Island, Niuean populations — disaggregated data required. Source: NZ Gout Longitudinal Study placeholder.',
    },
    rheumatic_fever: {
      coefficient: 2.20,
      validated: false,
      note: 'PROVISIONAL — ARF incidence in Pacific children is among the highest globally in NZ context. Population-disaggregated (Samoan vs Tongan vs Cook Island) coefficients needed. Source: ARF surveillance placeholder.',
    },
    type2_diabetes: {
      coefficient: 1.60,
      validated: false,
      note: 'PROVISIONAL — Type 2 diabetes prevalence 1.5-2x general population across Pacific sub-groups, with variation. Source: NZ Health Survey 2022/23 placeholder.',
    },
    cardiovascular: {
      coefficient: 1.40,
      validated: false,
      note: 'PROVISIONAL — Cardiovascular disease burden elevated, partly mediated by high rheumatic heart disease rates. Source: NZHIS placeholder.',
    },
    sudi: {
      coefficient: 1.75,
      validated: false,
      note: 'PROVISIONAL — SUDI rates elevated in Pacific communities. Coefficient is aggregate — disaggregated data by Pacific ethnicity required. Source: MoH SUDI monitoring placeholder.',
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED CONDITIONS — must match keys in PROVISIONAL_EQUITY_COEFFICIENTS
// ─────────────────────────────────────────────────────────────────────────────
const SUPPORTED_CONDITIONS = new Set([
  'gout',
  'rheumatic_fever',
  'type2_diabetes',
  'cardiovascular',
  'sudi',
]);

// ─────────────────────────────────────────────────────────────────────────────
// applyEquityCoefficients
//
// Apply Te Tiriti-aligned equity coefficients to a base actuarial risk score.
//
// @param {number} baseRiskScore    — Raw actuarial risk score (0.0 – 1.0)
// @param {Object} cohortFlags      — Ethnicity flags from consent context
//   @param {boolean} [cohortFlags.maori]    — Tangata Whenua flag
//   @param {boolean} [cohortFlags.pacific]  — Pacific peoples flag
// @param {string}  condition       — Medical condition key (see SUPPORTED_CONDITIONS)
//
// @returns {{
//   adjusted_score:    number,
//   coefficient_applied: number,
//   sme_clearance:     boolean,
//   provisional:       boolean,
//   warning:           string | null,
//   cohort_matched:    string | null,
//   condition:         string,
//   note:              string | null,
// }}
// ─────────────────────────────────────────────────────────────────────────────
export function applyEquityCoefficients(baseRiskScore, cohortFlags = {}, condition) {
  // ── SME Production Guard ─────────────────────────────────────────────────
  if (!SME_CLEARANCE) {
    console.warn(
      '[EQUITY-ENGINE] ⚠️  SME_CLEARANCE=false — returning base score unmodified. ' +
      'Equity coefficients are PROVISIONAL and have NOT been validated by ' +
      'Te Whatu Ora, Māori health equity SMEs, or Pacific health equity SMEs. ' +
      'This engine must not be used in production risk scoring until SME_CLEARANCE=true.'
    );
    return {
      adjusted_score: baseRiskScore,
      coefficient_applied: 1.0,
      sme_clearance: false,
      provisional: true,
      warning: 'SME_CLEARANCE=false — equity coefficients not applied. Base score returned unchanged.',
      cohort_matched: null,
      condition,
      note: 'Set SME_CLEARANCE=true only after formal validation by Te Whatu Ora and designated Māori/Pacific health equity advisors.',
    };
  }

  // ── Condition Validation ─────────────────────────────────────────────────
  if (!SUPPORTED_CONDITIONS.has(condition)) {
    return {
      adjusted_score: baseRiskScore,
      coefficient_applied: 1.0,
      sme_clearance: true,
      provisional: false,
      warning: `Condition '${condition}' not in SUPPORTED_CONDITIONS — no equity coefficient available.`,
      cohort_matched: null,
      condition,
      note: null,
    };
  }

  // ── Cohort Matching (priority: Māori > Pacific > none) ──────────────────
  // Te Tiriti priority: Tangata Whenua first.
  // Note: a person may identify as both Māori and Pacific — use Māori coefficient.
  let cohortKey = null;
  if (cohortFlags.maori) {
    cohortKey = 'maori';
  } else if (cohortFlags.pacific) {
    cohortKey = 'pacific';
  }

  // No equity cohort match — return base score unchanged
  if (!cohortKey) {
    return {
      adjusted_score: baseRiskScore,
      coefficient_applied: 1.0,
      sme_clearance: true,
      provisional: false,
      warning: null,
      cohort_matched: null,
      condition,
      note: 'No equity cohort flags set — base score returned.',
    };
  }

  // ── Apply Coefficient ────────────────────────────────────────────────────
  const entry = PROVISIONAL_EQUITY_COEFFICIENTS[cohortKey][condition];
  const coefficient = entry.coefficient;
  const adjustedScore = Math.min(1.0, baseRiskScore * coefficient);

  return {
    adjusted_score: adjustedScore,
    coefficient_applied: coefficient,
    sme_clearance: true,
    provisional: entry.validated === false,
    warning: entry.validated === false
      ? `PROVISIONAL coefficient applied — not yet validated by SME panel.`
      : null,
    cohort_matched: cohortKey,
    condition,
    note: entry.note,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// equityEngineSummary — Introspection / health check
// ─────────────────────────────────────────────────────────────────────────────
export function equityEngineSummary() {
  const cohorts = Object.keys(PROVISIONAL_EQUITY_COEFFICIENTS);
  const allConditions = new Set();
  let totalCoefficients = 0;
  let validatedCount = 0;

  for (const cohort of cohorts) {
    for (const [cond, entry] of Object.entries(PROVISIONAL_EQUITY_COEFFICIENTS[cohort])) {
      allConditions.add(cond);
      totalCoefficients++;
      if (entry.validated) validatedCount++;
    }
  }

  return {
    sme_clearance: SME_CLEARANCE,
    status: SME_CLEARANCE ? 'ACTIVE' : 'SCAFFOLD_ONLY',
    cohorts,
    supported_conditions: [...SUPPORTED_CONDITIONS],
    total_coefficients: totalCoefficients,
    validated_coefficients: validatedCount,
    provisional_coefficients: totalCoefficients - validatedCount,
    activation_requirement: 'SME validation from Te Whatu Ora + Māori health equity + Pacific health equity advisors',
    sprint: 'beta/sprint-drug-completion-shared-yamas',
    phase: 'Phase 2 scaffold',
  };
}
