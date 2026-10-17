import {
    InteractiveQuestionDetector,
    InteractiveQuestionInfo,
    DETECT_QUESTION_SCRIPT,
    buildSelectAndSubmitScript,
    CLICK_SKIP_SCRIPT,
} from '../../src/services/interactiveQuestionDetector';
import { CdpService } from '../../src/services/cdpService';

describe('InteractiveQuestionDetector', () => {
    let mockCdp: jest.Mocked<CdpService>;

    beforeEach(() => {
        mockCdp = {
            isConnected: jest.fn().mockReturnValue(true),
            call: jest.fn(),
            getContexts: jest.fn().mockReturnValue([{ id: 42, name: 'main', origin: 'vscode-file://' }]),
            getPrimaryContextId: jest.fn().mockReturnValue(42),
            on: jest.fn(),
            off: jest.fn(),
        } as unknown as jest.Mocked<CdpService>;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('calls onQuestionRequired callback when question is detected', async () => {
        const detectedInfo: InteractiveQuestionInfo = {
            title: 'Allow using this MCP tool?',
            subtitle: 'jules/get_bash_outputs',
            options: [
                { id: '1', text: 'Yes, allow this time', selected: false },
                { id: '2', text: 'Yes, always allow', selected: false },
                { id: '3', text: 'No', selected: false },
            ],
            hasSkip: true,
            hasSubmit: true,
        };

        mockCdp.call.mockResolvedValueOnce({
            result: { value: detectedInfo },
        });

        const onQuestionRequired = jest.fn();
        const detector = new InteractiveQuestionDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onQuestionRequired,
        });

        const result = await detector.checkQuestion();
        expect(result).toEqual(detectedInfo);
        expect(onQuestionRequired).toHaveBeenCalledWith(detectedInfo);
        expect(detector.getLastDetectedInfo()).toEqual(detectedInfo);
    });

    test('does not call callback when no question exists', async () => {
        mockCdp.call.mockResolvedValueOnce({
            result: { value: null },
        });

        const onQuestionRequired = jest.fn();
        const detector = new InteractiveQuestionDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onQuestionRequired,
        });

        const result = await detector.checkQuestion();
        expect(result).toBeNull();
        expect(onQuestionRequired).not.toHaveBeenCalled();
        expect(detector.getLastDetectedInfo()).toBeNull();
    });

    test('does not call callback multiple times for identical question info', async () => {
        const detectedInfo: InteractiveQuestionInfo = {
            title: 'Allow tool?',
            options: [{ id: '1', text: 'Yes', selected: false }],
            hasSkip: false,
            hasSubmit: true,
        };

        mockCdp.call.mockResolvedValue({
            result: { value: detectedInfo },
        });

        const onQuestionRequired = jest.fn();
        const detector = new InteractiveQuestionDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onQuestionRequired,
        });

        await detector.checkQuestion();
        await detector.checkQuestion();

        expect(onQuestionRequired).toHaveBeenCalledTimes(1);
    });

    test('selectAndSubmit() executes script via CDP', async () => {
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { ok: true } },
        });

        const detector = new InteractiveQuestionDetector({
            cdpService: mockCdp,
            onQuestionRequired: jest.fn(),
        });

        const success = await detector.selectAndSubmit('1');
        expect(success).toBe(true);
        expect(mockCdp.call).toHaveBeenCalledWith(
            'Runtime.evaluate',
            expect.objectContaining({
                expression: expect.stringContaining('interaction-continue-button'),
            })
        );
    });

    test('skip() executes skip script via CDP', async () => {
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { ok: true } },
        });

        const detector = new InteractiveQuestionDetector({
            cdpService: mockCdp,
            onQuestionRequired: jest.fn(),
        });

        const success = await detector.skip();
        expect(success).toBe(true);
        expect(mockCdp.call).toHaveBeenCalledWith(
            'Runtime.evaluate',
            expect.objectContaining({
                expression: expect.stringContaining('interaction-skip-button'),
            })
        );
    });

    test('calls onResolved when question disappears after detection', async () => {
        const detectedInfo: InteractiveQuestionInfo = {
            title: 'Confirm',
            options: [{ id: '1', text: 'Yes', selected: false }],
            hasSkip: true,
            hasSubmit: true,
        };

        mockCdp.call
            .mockResolvedValueOnce({ result: { value: detectedInfo } })
            .mockResolvedValueOnce({ result: { value: null } });

        const onQuestionRequired = jest.fn();
        const onResolved = jest.fn();
        const detector = new InteractiveQuestionDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onQuestionRequired,
            onResolved,
        });

        await detector.checkQuestion();
        expect(detector.getLastDetectedInfo()).toEqual(detectedInfo);

        await detector.checkQuestion();
        expect(detector.getLastDetectedInfo()).toBeNull();
        expect(onResolved).toHaveBeenCalledTimes(1);
    });

    test('stops polling cleanly after stop()', () => {
        const detector = new InteractiveQuestionDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onQuestionRequired: jest.fn(),
        });

        detector.start();
        expect(detector.isActive()).toBe(true);

        detector.stop();
        expect(detector.isActive()).toBe(false);
    });
});
