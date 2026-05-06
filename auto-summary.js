/**
 * TunnelVision Auto-Summary
 * Tracks message count and fires a dedicated background summarize generation
 * after every N messages. The background call's sole instruction is to call
 * TunnelVision_Summarize — no competing prompts, no model discretion.
 *
 * Unlike the old instruction-injection approach, this guarantees summarization
 * happens at the configured interval regardless of what the model does in the
 * main generation.
 */

import { eventSource, event_types, setExtensionPrompt, extension_prompt_types, generateQuietPrompt } from '../../../../script.js';
import { getContext } from '../../../st-context.js';
import { getSettings } from './tree-store.js';
import { getActiveTunnelVisionBooks } from './tool-registry.js';

const TV_AUTOSUMMARY_KEY = 'tunnelvision_autosummary';

/** Message count since last summary, keyed by chatId */
const counters = new Map();

let _autoSummaryInitialized = false;
let _summaryInFlight = false;

export function initAutoSummary() {
    if (_autoSummaryInitialized) return;
    _autoSummaryInitialized = true;

    if (event_types.MESSAGE_RECEIVED) {
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    }
    if (event_types.MESSAGE_SENT) {
        eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    }
    if (event_types.GENERATION_ENDED) {
        eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);
    }
    if (event_types.CHAT_CHANGED) {
        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    }
}

function getChatId() {
    try {
        return getContext().chatId || null;
    } catch {
        return null;
    }
}

function onMessageSent() {
    const settings = getSettings();
    if (!settings.autoSummaryEnabled || settings.globalEnabled === false) return;
    const chatId = getChatId();
    if (!chatId) return;
    counters.set(chatId, (counters.get(chatId) || 0) + 1);
}

function onMessageReceived() {
    const settings = getSettings();
    if (!settings.autoSummaryEnabled || settings.globalEnabled === false) return;
    const chatId = getChatId();
    if (!chatId) return;
    counters.set(chatId, (counters.get(chatId) || 0) + 1);
}

async function onGenerationEnded() {
    const settings = getSettings();
    if (!settings.autoSummaryEnabled || settings.globalEnabled === false) return;
    if (_summaryInFlight) return;

    const chatId = getChatId();
    if (!chatId) return;

    const count = counters.get(chatId) || 0;
    const interval = settings.autoSummaryInterval || 20;
    if (count < interval) return;

    const activeBooks = getActiveTunnelVisionBooks();
    if (activeBooks.length === 0) return;

    const disabled = settings.disabledTools || {};
    if (disabled['TunnelVision_Summarize']) {
        console.warn('[TunnelVision] Auto-summary threshold reached but TunnelVision_Summarize is disabled.');
        return;
    }

    // Fire a dedicated background generation whose only job is to call TunnelVision_Summarize.
    // Optimistically reset the counter now so a second GENERATION_ENDED (from this call)
    // doesn't re-trigger immediately.
    counters.set(chatId, 0);
    _summaryInFlight = true;

    try {
        const prompt = `[INSTRUCTION: You MUST call TunnelVision_Summarize this turn. Summarize the last ~${count} messages into a single concise but complete scene summary with a descriptive title. After calling the tool, output nothing else.]`;
        console.log(`[TunnelVision] Auto-summary firing after ${count} messages`);
        await generateQuietPrompt(prompt);
    } catch (e) {
        console.error('[TunnelVision] Auto-summary background generation failed:', e);
        // Restore the count so it retries next turn
        counters.set(chatId, count);
    } finally {
        _summaryInFlight = false;
    }
}

function onChatChanged() {
    // Clear any stale injected prompt from previous session
    setExtensionPrompt(TV_AUTOSUMMARY_KEY, '', extension_prompt_types.IN_PROMPT, 0);
}

export function markAutoSummaryComplete() {
    const chatId = getChatId();
    if (!chatId) return;
    counters.set(chatId, 0);
    console.log('[TunnelVision] Auto-summary complete — counter reset');
}

/** Get the current counter for the active chat. Used by UI. */
export function getAutoSummaryCount() {
    const chatId = getChatId();
    if (!chatId) return 0;
    return counters.get(chatId) || 0;
}

/** Reset the counter for the active chat. Used by UI and diagnostics. */
export function resetAutoSummaryCount() {
    const chatId = getChatId();
    if (!chatId) return;
    counters.set(chatId, 0);
}
