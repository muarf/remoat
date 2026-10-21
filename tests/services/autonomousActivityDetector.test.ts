import {
    AutonomousActivityDetector,
    AutonomousActivityInfo,
    DETECT_AUTONOMOUS_SCRIPT,
} from '../../src/services/autonomousActivityDetector';
import { CdpService } from '../../src/services/cdpService';

describe('AutonomousActivityDetector', () => {
    let mockCdp: jest.Mocked<CdpService>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockCdp = {
            isConnected: jest.fn().mockReturnValue(true),
            call: jest.fn(),
            getContexts: jest.fn().mockReturnValue([{ id: 42, name: 'main', origin: 'vscode-file://' }]),
            getPrimaryContextId: jest.fn().mockReturnValue(42),
            on: jest.fn(),
            off: jest.fn(),
        } as unknown as jest.Mocked<CdpService>;
    });

    afterEach(async () => {
        jest.clearAllTimers();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('primes on first poll without triggering callbacks', async () => {
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: false,
                    turnCount: 5,
                    latestTextPreview: 'Existing message',
                    latestTextLength: 16,
                } as AutonomousActivityInfo,
            },
        });

        const onAutonomousStart = jest.fn();
        const onAutonomousResponse = jest.fn();
        const detector = new AutonomousActivityDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            isMonitored: () => false,
            onAutonomousStart,
            onAutonomousResponse,
        });

        detector.start();
        await detector.checkActivity();

        expect(onAutonomousStart).not.toHaveBeenCalled();
        expect(onAutonomousResponse).not.toHaveBeenCalled();
        detector.stop();
    });

    test('triggers onAutonomousStart when isGenerating becomes true while unmonitored', async () => {
        // Poll 1: priming
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: false,
                    turnCount: 2,
                    latestTextPreview: 'Previous answer',
                    latestTextLength: 15,
                } as AutonomousActivityInfo,
            },
        });
        // Poll 2: agent wakes up and starts generating autonomously
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: true,
                    turnCount: 2,
                    latestTextPreview: 'Previous answer',
                    latestTextLength: 15,
                } as AutonomousActivityInfo,
            },
        });

        const onAutonomousStart = jest.fn();
        const onAutonomousResponse = jest.fn();
        const detector = new AutonomousActivityDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            isMonitored: () => false,
            onAutonomousStart,
            onAutonomousResponse,
        });

        detector.start();
        await detector.checkActivity();
        expect(onAutonomousStart).not.toHaveBeenCalled();

        await detector.checkActivity();
        expect(onAutonomousStart).toHaveBeenCalledTimes(1);
        expect(onAutonomousResponse).not.toHaveBeenCalled();
        detector.stop();
    });

    test('skips triggering when isMonitored() returns true', async () => {
        // Poll 1: priming
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: false,
                    turnCount: 2,
                    latestTextPreview: 'Previous answer',
                    latestTextLength: 15,
                } as AutonomousActivityInfo,
            },
        });
        // Poll 2: generating, but workspace is already monitored by Telegram
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: true,
                    turnCount: 2,
                    latestTextPreview: 'Previous answer',
                    latestTextLength: 15,
                } as AutonomousActivityInfo,
            },
        });

        const onAutonomousStart = jest.fn();
        const onAutonomousResponse = jest.fn();
        const detector = new AutonomousActivityDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            isMonitored: () => true, // Actively monitored!
            onAutonomousStart,
            onAutonomousResponse,
        });

        detector.start();
        await detector.checkActivity();
        await detector.checkActivity();

        expect(onAutonomousStart).not.toHaveBeenCalled();
        expect(onAutonomousResponse).not.toHaveBeenCalled();
        detector.stop();
    });

    test('triggers onAutonomousResponse when unmonitored response completes directly', async () => {
        // Poll 1: priming
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: false,
                    turnCount: 2,
                    latestTextPreview: 'Answer 1',
                    latestTextLength: 8,
                } as AutonomousActivityInfo,
            },
        });
        // Poll 2: completed autonomous response appeared
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: false,
                    turnCount: 3,
                    latestTextPreview: 'Autonomous answer 2',
                    latestTextLength: 19,
                } as AutonomousActivityInfo,
            },
        });

        const onAutonomousStart = jest.fn();
        const onAutonomousResponse = jest.fn();
        const detector = new AutonomousActivityDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            isMonitored: () => false,
            onAutonomousStart,
            onAutonomousResponse,
        });

        detector.start();
        await detector.checkActivity();
        await detector.checkActivity();

        expect(onAutonomousStart).not.toHaveBeenCalled();
        expect(onAutonomousResponse).toHaveBeenCalledWith({
            preview: 'Autonomous answer 2',
            length: 19,
        });
        detector.stop();
    });

    test('ignores messages marked via addSeenText', async () => {
        // Poll 1: priming
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: false,
                    turnCount: 1,
                    latestTextPreview: 'Answer 1',
                    latestTextLength: 8,
                } as AutonomousActivityInfo,
            },
        });
        // Poll 2: response that was already recorded by addSeenText
        mockCdp.call.mockResolvedValueOnce({
            result: {
                value: {
                    isGenerating: false,
                    turnCount: 2,
                    latestTextPreview: 'Already sent via Telegram',
                    latestTextLength: 25,
                } as AutonomousActivityInfo,
            },
        });

        const onAutonomousResponse = jest.fn();
        const detector = new AutonomousActivityDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            isMonitored: () => false,
            onAutonomousResponse,
        });

        detector.start();
        await detector.checkActivity();

        // Mark as already seen
        detector.addSeenText('Already sent via Telegram', 25);

        await detector.checkActivity();
        expect(onAutonomousResponse).not.toHaveBeenCalled();
        detector.stop();
    });
});
