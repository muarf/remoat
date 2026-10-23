import { buildQuestionUI, QUESTION_OPT_PREFIX, QUESTION_SKIP_PREFIX, QUESTION_SUBMIT_PREFIX } from '../../src/ui/questionUi';
import { InteractiveQuestionInfo } from '../../src/services/interactiveQuestionDetector';

describe('questionUi', () => {
    test('builds UI for MCP permission prompt with icon, options, and skip', () => {
        const info: InteractiveQuestionInfo = {
            title: 'Allow using this MCP tool?',
            subtitle: 'jules/get_bash_outputs',
            options: [
                { id: '1', text: 'Yes, allow this time', selected: false },
                { id: '2', text: 'Yes, always allow', selected: false },
                { id: '3', text: 'No, reject', selected: false },
            ],
            hasSkip: true,
            hasSubmit: true,
        };

        const { text, keyboard } = buildQuestionUI(info, 'my-workspace');

        expect(text).toContain('🔒 <b>Permission Required</b>');
        expect(text).toContain('Allow using this MCP tool?');
        expect(text).toContain('jules/get_bash_outputs');
        expect(text).toContain('1. Yes, allow this time');
        expect(text).toContain('my-workspace');

        // Check keyboard buttons (filtering any trailing empty rows from grammy)
        const rows = (keyboard as any).inline_keyboard.filter((r: any) => r.length > 0);
        expect(rows.length).toBe(4); // 3 options + 1 skip
        expect(rows[0][0].callback_data).toBe(`${QUESTION_OPT_PREFIX}my-workspace:1`);
        expect(rows[1][0].callback_data).toBe(`${QUESTION_OPT_PREFIX}my-workspace:2`);
        expect(rows[2][0].callback_data).toBe(`${QUESTION_OPT_PREFIX}my-workspace:3`);
        expect(rows[3][0].callback_data).toBe(`${QUESTION_SKIP_PREFIX}my-workspace`);
        expect(rows[3][0].text).toContain('Skip');
    });

    test('builds UI for agent question without skip', () => {
        const info: InteractiveQuestionInfo = {
            title: 'Which database framework should we use?',
            options: [
                { id: 'prisma', text: 'Prisma ORM', selected: false },
                { id: 'drizzle', text: 'Drizzle ORM', selected: false },
            ],
            hasSkip: false,
            hasSubmit: true,
        };

        const { text, keyboard } = buildQuestionUI(info, 'project-x');

        expect(text).toContain('❓ <b>Agent Question</b>');
        expect(text).toContain('Which database framework should we use?');
        expect(text).not.toContain('<code>');

        const rows = (keyboard as any).inline_keyboard.filter((r: any) => r.length > 0);
        expect(rows.length).toBe(2);
        expect(rows[0][0].callback_data).toBe(`${QUESTION_OPT_PREFIX}project-x:prisma`);
        expect(rows[1][0].callback_data).toBe(`${QUESTION_OPT_PREFIX}project-x:drizzle`);
    });

    test('builds UI for multi-select question with Submit button', () => {
        const info: InteractiveQuestionInfo = {
            title: 'Select multiple features to enable',
            options: [
                { id: '1', text: 'Feature A', selected: false },
                { id: '2', text: 'Feature B', selected: false },
            ],
            isMultiSelect: true,
            hasSkip: true,
            hasSubmit: true,
        };

        const { keyboard } = buildQuestionUI(info, 'my-ws');
        const rows = (keyboard as any).inline_keyboard.filter((r: any) => r.length > 0);
        expect(rows.length).toBe(4); // 2 options + 1 submit + 1 skip
        expect(rows[2][0].callback_data).toBe(`${QUESTION_SUBMIT_PREFIX}my-ws`);
        expect(rows[2][0].text).toContain('Submit');
        expect(rows[3][0].callback_data).toBe(`${QUESTION_SKIP_PREFIX}my-ws`);
    });
});
