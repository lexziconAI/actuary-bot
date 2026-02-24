/**
 * shared/kaitiaki/middleware.js — Kaitiaki Transport Layer
 *
 * Attaches a Kaitiaki Seal v3 (sealSync — Ed25519 + PoSC chain,
 * no network I/O) to every JSON response. Receipts are structural,
 * not optional. A developer cannot forget provenance by forgetting
 * to call Kaitiaki — it fires at the transport layer, before bytes
 * leave the process.
 *
 * Exports:
 *   kaitiakiExpressMiddleware — app.use() for Express servers
 *   kaitiakiWrapResponse(data, domain) — helper for Cloudflare Workers
 *
 * Turangawaewae Protocol v3 — Regan Duff / Axiom Intelligence
 */

'use strict';

const { createHash, randomBytes }               = require('node:crypto');
const { readFileSync, writeFileSync,
        existsSync, mkdirSync }                 = require('node:fs');
const { join }                                  = require('node:path');

// tweetnacl resolves from shared/kaitiaki/node_modules/tweetnacl
const nacl = require('tweetnacl');

// ─── Crypto helpers ─────────────────────────────────────────────────────────

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hexToBigInt(hex) {
  return BigInt('0x' + hex.slice(0, 16));
}

/** Arnold Cat Map — second-order temporal entanglement for PoSC spine */
function arnoldTransform(aHash, bHash) {
  const P  = BigInt('0xffffffffffffffffffffffffffffff61');
  const x  = (2n * hexToBigInt(aHash) + hexToBigInt(bHash)) % P;
  const y  = (hexToBigInt(aHash) + hexToBigInt(bHash)) % P;
  const combined = x.toString(16).padStart(32, '0') + y.toString(16).padStart(32, '0');
  return sha256(Buffer.from(combined, 'hex'));
}

// ─── Keypair persistence ─────────────────────────────────────────────────────

const KEY_DIR  = join(__dirname, '.kaitiaki-middleware');
const KEY_FILE = join(KEY_DIR, 'keypair.json');

function loadOrCreateKeypair() {
  try {
    if (!existsSync(KEY_DIR)) mkdirSync(KEY_DIR, { recursive: true });
  } catch { /* fs unavailable (e.g. Cloudflare Workers) — fall through to ephemeral keypair */ }

  try {
    if (existsSync(KEY_FILE)) {
      const raw = JSON.parse(readFileSync(KEY_FILE, 'utf-8'));
      return {
        publicKey: new Uint8Array(Buffer.from(raw.publicKey, 'hex')),
        secretKey: new Uint8Array(Buffer.from(raw.secretKey, 'hex')),
      };
    }
  } catch { /* regenerate below */ }

  const kp = nacl.sign.keyPair();
  try {
    writeFileSync(KEY_FILE, JSON.stringify({
      publicKey: Buffer.from(kp.publicKey).toString('hex'),
      secretKey: Buffer.from(kp.secretKey).toString('hex'),
    }, null, 2));
  } catch { /* non-fatal — key will regenerate on next start */ }

  return kp;
}

// ─── Shared seal state (module-level — PoSC chain is continuous) ─────────────

const keypair       = loadOrCreateKeypair();
const PUBLIC_KEY    = Buffer.from(keypair.publicKey).toString('hex');
const GENESIS_HASH  = sha256('turangawaewae_transport_' + PUBLIC_KEY.slice(0, 16));

let chainPosition   = 0;
let prevState       = GENESIS_HASH;
let prevPrevState   = GENESIS_HASH;

// ─── Core seal (sealSync — no network I/O) ───────────────────────────────────

function sealTransport(payload, domain) {
  const ts        = Date.now();
  const receiptId = `KT-${ts}-${randomBytes(2).toString('hex')}`;

  // Layer 1 — Double Helix: SHA-256(payload) ⊕ SHA-256(domain+ts) → Ed25519
  const cotHash      = sha256(JSON.stringify(payload));
  const parseHash    = sha256(`${domain}|${ts}`);
  const artifactHash = sha256(cotHash + parseHash);
  const sigBytes     = nacl.sign.detached(Buffer.from(artifactHash, 'hex'), keypair.secretKey);
  const signature    = Buffer.from(sigBytes).toString('hex');

  // Layer 2 — PoSC Spine: Arnold Cat Map over previous two states
  const arnold = arnoldTransform(prevPrevState, prevState);
  const state  = sha256(artifactHash + arnold);
  chainPosition += 1;

  const posc = {
    state,
    previous_state:  prevState,
    chain_position:  chainPosition,
    genesis_hash:    GENESIS_HASH,
  };

  // Advance the chain
  prevPrevState = prevState;
  prevState     = state;

  // Layer 3 — Seven Seals (local entropy — sealSync variant, no network)
  const seals = {
    artifact_hash:    artifactHash,
    drand_beacon:     sha256('local_drand_' + ts),
    geonet_entropy:   sha256('local_geonet_' + ts),
    sadi_fingerprint: sha256(`${domain}|${artifactHash}`),
    posc_link: {
      state:           posc.state,
      previous_state:  posc.previous_state,
      chain_position:  posc.chain_position,
    },
  };

  return {
    receipt_id:    receiptId,
    version:       '3.0-transport',
    timestamp:     new Date(ts).toISOString(),
    public_key:    PUBLIC_KEY,
    layers:        { helix: { artifact_hash: artifactHash, signature, public_key: PUBLIC_KEY }, posc, seals },
    sovereign:     'Regan Duff',
    protocol:      'Turangawaewae Protocol v3',
  };
}

/** Compact receipt summary embedded in response body */
function compactReceipt(full) {
  return {
    receipt_id:      full.receipt_id,
    signature:       full.layers.helix.signature,
    artifact_hash:   full.layers.helix.artifact_hash,
    public_key:      full.public_key,
    chain_position:  full.layers.posc.chain_position,
    timestamp:       full.timestamp,
  };
}

// ─── Express middleware ──────────────────────────────────────────────────────

/**
 * Mount as the FIRST app.use() before any routes.
 * Shadows res.json on every request so every JSON response carries
 * a Kaitiaki receipt. Receipt failure is non-fatal — response still
 * goes out, error logged.
 *
 * Arrays:  receipt injected as X-Kaitiaki-Receipt-Id header only
 *           (body contract preserved)
 * Objects: receipt added as _kaitiaki field in response body
 */
function kaitiakiExpressMiddleware(req, res, next) {
  const _originalJson = res.json.bind(res);

  res.json = function kaitiakiJson(data) {
    try {
      const domain  = `${req.method} ${req.path}`;
      const receipt = sealTransport(data, domain);
      const compact = compactReceipt(receipt);

      // Header always — works for arrays, primitives, objects
      res.setHeader('X-Kaitiaki-Receipt-Id',      compact.receipt_id);
      res.setHeader('X-Kaitiaki-Chain-Position',  String(compact.chain_position));
      res.setHeader('X-Kaitiaki-Public-Key',      compact.public_key.slice(0, 16) + '...');

      // Body injection for plain objects only
      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        return _originalJson({ ...data, _kaitiaki: compact });
      }
    } catch (err) {
      // Never block a response — provenance is structural but not fragile
      console.error('[kaitiaki-middleware] seal error (non-fatal):', err.message);
    }

    return _originalJson(data);
  };

  next();
}

// ─── Cloudflare Workers wrapper ───────────────────────────────────────────────

/**
 * Call in place of JSON.stringify() when building a Worker Response.
 * Returns enriched data with _kaitiaki field (plain objects) or
 * original data unchanged (arrays/primitives).
 *
 * Usage:
 *   const body = kaitiakiWrapResponse(result, 'POST /api/diagnose');
 *   return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
 */
function kaitiakiWrapResponse(data, domain = 'cloudflare-worker') {
  try {
    const receipt = sealTransport(data, domain);
    const compact = compactReceipt(receipt);

    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      return { ...data, _kaitiaki: compact };
    }
  } catch { /* non-fatal */ }

  return data;
}

module.exports = { kaitiakiExpressMiddleware, kaitiakiWrapResponse };
