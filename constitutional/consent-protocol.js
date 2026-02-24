/**
 * consent-protocol.js — Actuary Bot Consent Protocol
 *
 * Consent is not a field. It is a protocol.
 *
 * Every risk assessment carries a consent_record_id — a hash of the
 * cohort, scope, and authorising clinician. Without a valid consent record,
 * no assessment is performed. This is Asteya (non-stealing): we do not
 * take data or run analysis without informed consent from those whose
 * health and futures are at stake.
 *
 * Machine Elves sprint M2-STEP 3 (2026-02-24)
 */

import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Consent record ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic consent_record_id from the three pillars of
 * informed consent: who is being assessed (cohort), what is being assessed
 * (scope), and who authorises it (clinician_id).
 *
 * The same inputs always produce the same ID — making consent auditable
 * and reproducible. If any pillar changes, the ID changes.
 *
 * @param {{ cohort: string, scope: string, clinician_id: string }} params
 * @returns {string} — SHA-256 hex prefixed with 'CR-'
 */
export function generateConsentRecordId({ cohort, scope, clinician_id }) {
  if (!cohort || !scope || !clinician_id) {
    throw new Error('CONSENT_ERROR: cohort, scope, and clinician_id are all required');
  }
  // Canonical form: alphabetical order prevents trivial parameter-swap collisions
  const canonical = JSON.stringify({
    cohort:       String(cohort).trim().toLowerCase(),
    scope:        String(scope).trim().toLowerCase(),
    clinician_id: String(clinician_id).trim(),
  });
  const hash = createHash('sha256').update(canonical).digest('hex');
  return `CR-${hash.slice(0, 32)}`;
}

// ---------------------------------------------------------------------------
// Consent record validation
// ---------------------------------------------------------------------------

/**
 * Validate that a consent_record_id was generated from the given inputs.
 * Returns { valid, reason }.
 *
 * @param {string} consent_record_id
 * @param {{ cohort: string, scope: string, clinician_id: string }} params
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateConsentRecord(consent_record_id, { cohort, scope, clinician_id }) {
  if (!consent_record_id || typeof consent_record_id !== 'string') {
    return { valid: false, reason: 'CONSENT_INVALID: consent_record_id is missing or not a string' };
  }
  if (!consent_record_id.startsWith('CR-')) {
    return { valid: false, reason: 'CONSENT_INVALID: consent_record_id must begin with CR-' };
  }

  let expected;
  try {
    expected = generateConsentRecordId({ cohort, scope, clinician_id });
  } catch (err) {
    return { valid: false, reason: `CONSENT_INVALID: ${err.message}` };
  }

  if (consent_record_id !== expected) {
    return {
      valid: false,
      reason: `CONSENT_INVALID: consent_record_id does not match cohort+scope+clinician_id hash`,
    };
  }

  return { valid: true, reason: 'CONSENT_VALID' };
}

// ---------------------------------------------------------------------------
// Consent summary (for audit trail)
// ---------------------------------------------------------------------------

/**
 * Build a human-readable consent summary for logging.
 * Does NOT include clinician_id in the summary — only the hash — to avoid
 * leaking PII into logs that may have broader access.
 *
 * @param {{ consent_record_id: string, cohort: string, scope: string }} params
 * @returns {string}
 */
export function consentSummary({ consent_record_id, cohort, scope }) {
  return `consent=${consent_record_id} cohort=${cohort} scope=${scope}`;
}
