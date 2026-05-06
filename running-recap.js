/**
 * TunnelVision Running Recap
 *
 * Maintains a cumulative narrative of everything that has happened in the story,
 * injected unconditionally into every prompt. Not keyword-gated. Not conditionally
 * selected. Always there.
 *
 * Updated whenever TunnelVision_Summarize creates a new scene summary.
 * If the recap grows beyond MAX_RECAP_CHARS, a background LLM call condenses it.
 *
 * Storage: chat_metadata.tunnelvision_running_recap
 * Injection: setExtensionPrompt at GENERATION_STARTED
 */

import { getContext } from '../../../st-context.js';
import { getSettings } from './tree-store.js';
import { generateAnalytical } from './agent-utils.js';

const METADATA_KEY = 'tunnelvision_running_recap';
const MAX_RECAP_CHARS = 6000;
const CONDENSATION_TARGET = 3000;

const INJECTION_HEADER = [
    '[Story So Far — A running record of everything that has happened in this story.',
    'Use this as your memory of past scenes. Do not repeat it verbatim; let it inform your writing naturally.]',
].join('\n');

// ── Storage ───────────────────────────────────────────────────────

function getStorage() {
    try {
        return getContext().chatMetadata?.[METADATA_KEY] || null;
    } catch {
        return null;
    }
}

function setStorage(data) {
    try {
        const context = getContext();
        if (!context.chatMetadata) return;
        context.chatMetadata[METADATA_KEY] = data;
        context.saveMetadataDebounced?.();
    } catch {
        /* metadata not available */
    }
}

export function getRunningRecapContent() {
    return getStorage()?.content || '';
}

// ── Update ────────────────────────────────────────────────────────

let _condensationInFlight = false;

/**
 * Append a new scene summary to the running recap.
 * Called by TunnelVision_Summarize after creating a summary entry.
 */
export function appendToRunningRecap(title, summaryText) {
    const existing = getStorage()?.content || '';
    const entry = `### ${title}\n${summaryText.trim()}`;
    const updated = existing ? `${existing}\n\n${entry}` : entry;

    setStorage({ content: updated, updatedAt: Date.now() });
    console.log(`[TunnelVision] Running recap updated (${updated.length} chars)`);

    if (updated.length > MAX_RECAP_CHARS && !_condensationInFlight) {
        _condenseRunningRecap(updated);
    }
}

async function _condenseRunningRecap(currentContent) {
    _condensationInFlight = true;
    try {
        const settings = getSettings();
        if (settings.globalEnabled === false) return;

        const prompt = [
            'You are condensing a running story recap. Combine the following scene summaries into a single cohesive narrative.',
            `Target length: approximately ${CONDENSATION_TARGET} characters.`,
            'Preserve all significant events, character developments, decisions made, and plot outcomes.',
            'Write in past tense, third person. Output only the condensed recap text, no preamble.',
            '',
            currentContent,
        ].join('\n');

        console.log('[TunnelVision] Condensing running recap...');
        const condensed = await generateAnalytical({ prompt });
        if (condensed && condensed.trim()) {
            setStorage({ content: condensed.trim(), updatedAt: Date.now() });
            console.log(`[TunnelVision] Running recap condensed to ${condensed.length} chars`);
        }
    } catch (e) {
        console.error('[TunnelVision] Running recap condensation failed:', e);
    } finally {
        _condensationInFlight = false;
    }
}

// ── Injection ─────────────────────────────────────────────────────

/**
 * Build the prompt text to inject. Returns empty string if no recap exists.
 */
export function buildRunningRecapPrompt() {
    const content = getRunningRecapContent();
    if (!content) return '';
    return `${INJECTION_HEADER}\n\n${content}`;
}

/**
 * Clear the running recap for the current chat. Called on chat change.
 */
export function clearRunningRecap() {
    setStorage(null);
}
