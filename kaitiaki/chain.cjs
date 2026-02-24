/**
 * @file shared/kaitiaki/chain.js
 * @description Utilities for building and propagating Kaitiaki receipt chains.
 *
 * Enables cross-system provenance tracing: receipts form a linked list so
 * you can trace AB → DD → DrBot through chain_root + parent_receipt_id.
 *
 * No external dependencies. CommonJS module (module.exports).
 * Receipt IDs follow the KT-{ts}-{4hex} format from middleware.js.
 *
 * Turangawaewae Protocol v3 — Regan Duff / Axiom Intelligence
 */

'use strict';

/**
 * Enriches a receipt object with chain-of-custody metadata.
 *
 * Handles two calling conventions:
 *   chainReceipt(receipt, 'KT-1234-abcd')           — string receipt_id only (depth lost)
 *   chainReceipt(receipt, parentReceiptObject)       — full parent receipt (depth propagated)
 *
 * When a string is passed the parent's chain_depth cannot be determined, so
 * this call starts depth at 1. When the full parent receipt is passed, depth
 * = parent.chain_depth + 1 and chain_root is propagated from the parent.
 *
 * @param {Object} currentReceipt - Receipt being created. Must have a string receipt_id.
 * @param {string|Object|null|undefined} parentReceiptOrId - The parent receipt (object)
 *   or parent receipt_id (string), or falsy to start a new chain.
 * @returns {Object} currentReceipt mutated in-place with:
 *   - parent_receipt_id {string|null}
 *   - chain_depth {number}  (0 = root, 1 = one hop, etc.)
 *   - chain_root {string}   (receipt_id of the chain's origin)
 */
function chainReceipt(currentReceipt, parentReceiptOrId) {
  if (!currentReceipt || typeof currentReceipt.receipt_id !== 'string') {
    throw new TypeError('currentReceipt must be an object with a string receipt_id');
  }

  const ownId = currentReceipt.receipt_id;

  // Normalise: accept either a full receipt object or a bare receipt_id string
  let parentId   = null;
  let parentDepth = null;
  let parentRoot = null;

  if (parentReceiptOrId && typeof parentReceiptOrId === 'object') {
    // Full parent receipt passed — depth and root can be propagated
    parentId    = parentReceiptOrId.receipt_id ?? null;
    parentDepth = typeof parentReceiptOrId.chain_depth === 'number'
      ? parentReceiptOrId.chain_depth
      : 0;
    parentRoot  = parentReceiptOrId.chain_root ?? parentId;
  } else if (typeof parentReceiptOrId === 'string' && parentReceiptOrId.trim() !== '') {
    // Only the receipt_id string was passed — depth cannot be propagated
    parentId    = parentReceiptOrId;
    parentDepth = 0;           // conservative: we don't know the parent's depth
    parentRoot  = parentReceiptOrId;
  }

  const hasParent = Boolean(parentId);

  currentReceipt.parent_receipt_id = hasParent ? parentId : null;

  if (!hasParent) {
    // This receipt is the chain root
    currentReceipt.chain_depth = 0;
    currentReceipt.chain_root  = ownId;
  } else {
    // Extend the chain: depth = parent's depth + 1
    currentReceipt.chain_depth = parentDepth + 1;
    currentReceipt.chain_root  = parentRoot;
  }

  return currentReceipt;
}

/**
 * Extracts the parent receipt ID from an incoming HTTP request.
 *
 * Checks in order:
 *   1. req.body?.parent_receipt_id  (parsed JSON body)
 *   2. req.headers['x-kaitiaki-parent-receipt']  (Node.js lowercases header names)
 *
 * @param {Object} req - HTTP request object (Express-style or raw http.IncomingMessage
 *   with a pre-parsed body attached).
 * @returns {string|null} Parent receipt ID if found, otherwise null.
 */
function extractParentReceipt(req) {
  if (!req) return null;

  // Body (parsed JSON — works for Express req.body and raw servers with manual parse)
  const fromBody = req.body?.parent_receipt_id;
  if (typeof fromBody === 'string' && fromBody.trim() !== '') {
    return fromBody;
  }

  // Header (Node.js lowercases all header names)
  const fromHeader = req.headers?.['x-kaitiaki-parent-receipt'];
  if (typeof fromHeader === 'string' && fromHeader.trim() !== '') {
    return fromHeader;
  }

  return null;
}

/**
 * Builds HTTP headers to propagate the chain to the next downstream service.
 *
 * Usage with fetch():
 *   const headers = buildChainHeaders(localReceipt.receipt_id);
 *   await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: ... });
 *
 * @param {string} receiptId - The current system's receipt ID to pass as parent.
 * @returns {{ 'X-Kaitiaki-Parent-Receipt': string }} Header object.
 */
function buildChainHeaders(receiptId) {
  if (typeof receiptId !== 'string' || receiptId.trim() === '') {
    throw new TypeError('receiptId must be a non-empty string');
  }
  return {
    'X-Kaitiaki-Parent-Receipt': receiptId,
  };
}

module.exports = {
  chainReceipt,
  extractParentReceipt,
  buildChainHeaders,
};
