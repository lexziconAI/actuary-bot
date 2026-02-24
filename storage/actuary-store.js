/**
 * actuary-store.js — SQLite persistence for Actuary Bot
 *
 * Three tables:
 *   risk_assessments   — every completed actuarial assessment (immutable ledger)
 *   consent_records    — consent record IDs with metadata (audit trail)
 *   constitutional_log — every gate verdict (full transparency)
 *
 * Machine Elves sprint M2-STEP 5 (2026-02-24)
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'actuary-bot.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS risk_assessments (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                   TEXT    NOT NULL DEFAULT (datetime('now')),
    consent_record_id    TEXT    NOT NULL,
    cohort               TEXT    NOT NULL,
    scope                TEXT    NOT NULL,
    constitutional_score REAL    NOT NULL,
    pass                 INTEGER NOT NULL,
    yamas_json           TEXT    NOT NULL,
    payload_json         TEXT,
    source               TEXT
  );

  CREATE TABLE IF NOT EXISTS consent_records (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               TEXT    NOT NULL DEFAULT (datetime('now')),
    consent_record_id TEXT   NOT NULL UNIQUE,
    cohort           TEXT    NOT NULL,
    scope            TEXT    NOT NULL,
    clinician_hash   TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS constitutional_log (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                   TEXT    NOT NULL DEFAULT (datetime('now')),
    endpoint             TEXT    NOT NULL,
    consent_record_id    TEXT,
    constitutional_score REAL,
    pass                 INTEGER NOT NULL,
    blocked_by_json      TEXT,
    yamas_json           TEXT
  );
`;

// ---------------------------------------------------------------------------
// Singleton DB
// ---------------------------------------------------------------------------
let _db = null;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(SCHEMA);
    console.log(`[actuary-store] Database initialised at ${DB_PATH}`);
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Risk assessments
// ---------------------------------------------------------------------------
export function insertRiskAssessment({ consent_record_id, cohort, scope, constitutional_score, pass, yamas, payload, source }) {
  getDb().prepare(`
    INSERT INTO risk_assessments (consent_record_id, cohort, scope, constitutional_score, pass, yamas_json, payload_json, source)
    VALUES (@consent_record_id, @cohort, @scope, @constitutional_score, @pass, @yamas_json, @payload_json, @source)
  `).run({
    consent_record_id,
    cohort,
    scope,
    constitutional_score,
    pass: pass ? 1 : 0,
    yamas_json:   JSON.stringify(yamas ?? {}),
    payload_json: payload ? JSON.stringify(payload) : null,
    source:       source ?? null,
  });
}

// ---------------------------------------------------------------------------
// Consent records
// ---------------------------------------------------------------------------
export function upsertConsentRecord({ consent_record_id, cohort, scope, clinician_id }) {
  // Store hash of clinician_id — not raw PII in logs
  const clinician_hash = createHash('sha256').update(String(clinician_id)).digest('hex').slice(0, 16);
  getDb().prepare(`
    INSERT OR REPLACE INTO consent_records (consent_record_id, cohort, scope, clinician_hash)
    VALUES (@consent_record_id, @cohort, @scope, @clinician_hash)
  `).run({ consent_record_id, cohort, scope, clinician_hash });
}

// ---------------------------------------------------------------------------
// Constitutional log — every gate verdict
// ---------------------------------------------------------------------------
export function logConstitutionalVerdict({ endpoint, consent_record_id, constitutional_score, pass, blocked_by, yamas }) {
  getDb().prepare(`
    INSERT INTO constitutional_log (endpoint, consent_record_id, constitutional_score, pass, blocked_by_json, yamas_json)
    VALUES (@endpoint, @consent_record_id, @constitutional_score, @pass, @blocked_by_json, @yamas_json)
  `).run({
    endpoint,
    consent_record_id: consent_record_id ?? null,
    constitutional_score: constitutional_score ?? null,
    pass: pass ? 1 : 0,
    blocked_by_json: JSON.stringify(blocked_by ?? []),
    yamas_json:      JSON.stringify(yamas ?? {}),
  });
}

export { getDb };
