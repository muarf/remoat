import { InlineKeyboard } from 'grammy';
import { InteractiveQuestionInfo } from '../services/interactiveQuestionDetector';
import { escapeHtml } from '../utils/telegramFormatter';

export const QUESTION_OPT_PREFIX = 'q_opt:';
export const QUESTION_SKIP_PREFIX = 'q_skip:';
export const QUESTION_SUBMIT_PREFIX = 'q_sub:';

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Truncate a workspace key to fit Telegram callback limit (64 bytes).
 */
function safeKey(key: string, maxLen = 30): string {
    return key.length > maxLen ? key.slice(0, maxLen) : key;
}

/**
 * Build the message text and keyboard for an interactive question or MCP permission prompt.
 */
export function buildQuestionUI(
    info: InteractiveQuestionInfo,
    projectName: string,
): { text: string; keyboard: InlineKeyboard } {
    const isPermission =
        info.title.toLowerCase().includes('permission') ||
        info.title.toLowerCase().includes('mcp') ||
        info.title.toLowerCase().includes('allow');

    let text = isPermission
        ? `🔒 <b>Permission Required</b>\n\n`
        : `❓ <b>Agent Question</b>\n\n`;

    text += `<b>${escapeHtml(info.title)}</b>\n`;
    if (info.subtitle) {
        text += `<code>${escapeHtml(info.subtitle)}</code>\n`;
    }
    text += `\n`;

    if (info.options.length > 0) {
        text += `<b>Options:</b>\n`;
        info.options.forEach((opt, idx) => {
            const num = idx < NUMBER_EMOJIS.length ? `${idx + 1}.` : `•`;
            text += `${num} ${escapeHtml(opt.text)}\n`;
        });
        text += `\n`;
    }

    text += `<b>Workspace:</b> ${escapeHtml(projectName)}`;

    const keyboard = new InlineKeyboard();
    const projectKey = safeKey(projectName);

    info.options.forEach((opt, idx) => {
        const emoji = idx < NUMBER_EMOJIS.length ? NUMBER_EMOJIS[idx] : `🔹`;
        // Shorten label if too long for a single button
        let label = opt.text;
        if (label.length > 28) {
            label = label.slice(0, 27) + '…';
        }
        keyboard.text(`${emoji} ${label}`, `${QUESTION_OPT_PREFIX}${projectKey}:${opt.id}`).row();
    });

    if (info.isMultiSelect && info.hasSubmit) {
        keyboard.text('✅ Submit', `${QUESTION_SUBMIT_PREFIX}${projectKey}`).row();
    }

    if (info.hasSkip) {
        keyboard.text('⏭️ Skip', `${QUESTION_SKIP_PREFIX}${projectKey}`);
    }

    return { text, keyboard };
}
