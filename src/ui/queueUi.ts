import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../utils/telegramFormatter';

export const INTERRUPT_QUEUE_PREFIX = 'interrupt:queue:';
export const INTERRUPT_STEER_PREFIX = 'interrupt:steer:';
export const INTERRUPT_STOP_PREFIX = 'interrupt:stop:';
export const INTERRUPT_DISCARD_PREFIX = 'interrupt:discard:';

/** Backwards compatibility alias for older callback references */
export const INTERRUPT_NOW_PREFIX = 'interrupt:now:';

/** Telegram callback_data max is 64 bytes. Truncate the key to fit the longest prefix. */
const MAX_CB_KEY_LEN = 64 - INTERRUPT_DISCARD_PREFIX.length;

/** Truncate a workspace key to fit within Telegram's 64-byte callback_data limit. */
export function safeCallbackKey(key: string): string {
    return key.length > MAX_CB_KEY_LEN ? key.substring(0, MAX_CB_KEY_LEN) : key;
}

/**
 * Build the interrupt keyboard shown when the user sends a message
 * while Antigravity is still generating a response or executing a task.
 *
 * 4 Buttons:
 *   [ ⏳ Queue ]       [ ⚡ Send anyway ]
 *   [ 🛑 Stop & Replace ] [ 🗑 Discard ]
 */
export function buildInterruptUI(channelKey: string, prompt: string): { text: string; keyboard: InlineKeyboard } {
    const preview = prompt.length > 80 ? prompt.slice(0, 80) + '…' : prompt;
    const cbKey = safeCallbackKey(channelKey);

    const text =
        `⏳ <b>Antigravity is busy.</b>\n\n` +
        `<i>${escapeHtml(preview)}</i>\n\n` +
        `Choose what to do with your message:`;

    const keyboard = new InlineKeyboard()
        .text('⏳ Queue', `${INTERRUPT_QUEUE_PREFIX}${cbKey}`)
        .text('⚡ Send anyway', `${INTERRUPT_STEER_PREFIX}${cbKey}`)
        .row()
        .text('🛑 Stop & Replace', `${INTERRUPT_STOP_PREFIX}${cbKey}`)
        .text('🗑 Discard', `${INTERRUPT_DISCARD_PREFIX}${cbKey}`);

    return { text, keyboard };
}
