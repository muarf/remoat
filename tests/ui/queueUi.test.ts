import {
    buildInterruptUI,
    safeCallbackKey,
    INTERRUPT_QUEUE_PREFIX,
    INTERRUPT_STEER_PREFIX,
    INTERRUPT_STOP_PREFIX,
    INTERRUPT_DISCARD_PREFIX,
    INTERRUPT_NOW_PREFIX,
} from '../../src/ui/queueUi';

describe('queueUi', () => {
    describe('safeCallbackKey', () => {
        it('leaves short keys untouched', () => {
            const key = 'ws:my-project';
            expect(safeCallbackKey(key)).toBe(key);
        });

        it('truncates keys that would exceed Telegram 64-byte callback_data limit', () => {
            const longKey = 'ws:' + 'a'.repeat(100);
            const safe = safeCallbackKey(longKey);
            expect(safe.length).toBeLessThanOrEqual(64 - INTERRUPT_DISCARD_PREFIX.length);
            expect(`${INTERRUPT_DISCARD_PREFIX}${safe}`.length).toBeLessThanOrEqual(64);
        });
    });

    describe('buildInterruptUI', () => {
        it('builds 4 buttons in 2 rows with English labels', () => {
            const channelKey = 'ws:test-workspace';
            const prompt = 'Can you analyze the disk usage?';

            const { text, keyboard } = buildInterruptUI(channelKey, prompt);

            expect(text).toContain('Antigravity is busy');
            expect(text).toContain('Can you analyze the disk usage?');

            // Keyboard buttons structure: 2 rows of 2 buttons
            const buttons = keyboard.inline_keyboard as any[][];
            expect(buttons).toHaveLength(2);

            // Row 1: Queue and Send anyway
            expect(buttons[0]).toHaveLength(2);
            expect(buttons[0][0].text).toBe('⏳ Queue');
            expect(buttons[0][0].callback_data).toBe(`${INTERRUPT_QUEUE_PREFIX}${safeCallbackKey(channelKey)}`);

            expect(buttons[0][1].text).toBe('⚡ Send anyway');
            expect(buttons[0][1].callback_data).toBe(`${INTERRUPT_STEER_PREFIX}${safeCallbackKey(channelKey)}`);

            // Row 2: Stop & Replace and Discard
            expect(buttons[1]).toHaveLength(2);
            expect(buttons[1][0].text).toBe('🛑 Stop & Replace');
            expect(buttons[1][0].callback_data).toBe(`${INTERRUPT_STOP_PREFIX}${safeCallbackKey(channelKey)}`);

            expect(buttons[1][1].text).toBe('🗑 Discard');
            expect(buttons[1][1].callback_data).toBe(`${INTERRUPT_DISCARD_PREFIX}${safeCallbackKey(channelKey)}`);

            // Verify all callback_data are <= 64 bytes
            for (const row of buttons) {
                for (const btn of row) {
                    expect(btn.callback_data.length).toBeLessThanOrEqual(64);
                }
            }
        });

        it('truncates very long prompt preview in text', () => {
            const longPrompt = 'x'.repeat(200);
            const { text } = buildInterruptUI('ws:demo', longPrompt);
            expect(text).toContain('…');
            expect(text.length).toBeLessThan(longPrompt.length);
        });

        it('maintains backwards compatibility alias INTERRUPT_NOW_PREFIX', () => {
            expect(INTERRUPT_NOW_PREFIX).toBe('interrupt:now:');
        });
    });
});
