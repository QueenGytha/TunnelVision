/**
 * TunnelVision Embedding Cache
 * Stub implementation — embedding similarity scoring is not available in this build.
 * smart-context.js dynamically imports this module and checks isEmbeddingAvailable()
 * before calling getEmbeddingSimilarityBoosts(), so returning false is safe.
 */

export function isEmbeddingAvailable() {
    return false;
}

/**
 * @param {Array} _candidates
 * @param {string} _recentText
 * @returns {Promise<Map>}
 */
export async function getEmbeddingSimilarityBoosts(_candidates, _recentText) {
    return new Map();
}
