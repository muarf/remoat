import {
    UserMessageDetector,
    UserMessageInfo,
    DETECT_USER_MESSAGE_SCRIPT,
} from '../../src/services/userMessageDetector';
import { CdpService } from '../../src/services/cdpService';

describe('UserMessageDetector', () => {
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

    test('primes on first poll without triggering onUserMessage', async () => {
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'Initial message already in chat' } },
        });

        const onUserMessage = jest.fn();
        const detector = new UserMessageDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onUserMessage,
        });

        detector.start();
        await detector.checkUserMessage();

        expect(onUserMessage).not.toHaveBeenCalled();
        await detector.stop();
    });

    test('calls onUserMessage when a new message appears after priming', async () => {
        // First poll: primed
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'Initial message' } },
        });
        // Second poll: new message
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'New message typed in IDE' } },
        });

        const onUserMessage = jest.fn();
        const detector = new UserMessageDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onUserMessage,
        });

        detector.start();
        await detector.checkUserMessage();
        expect(onUserMessage).not.toHaveBeenCalled();

        await detector.checkUserMessage();
        expect(onUserMessage).toHaveBeenCalledWith({ text: 'New message typed in IDE' });
        await detector.stop();
    });

    test('ignores echo messages sent by Remoat', async () => {
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'Initial message' } },
        });
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'Message from Remoat bot' } },
        });

        const onUserMessage = jest.fn();
        const detector = new UserMessageDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onUserMessage,
        });

        detector.addEchoHash('Message from Remoat bot');

        detector.start();
        await detector.checkUserMessage();
        await detector.checkUserMessage();

        expect(onUserMessage).not.toHaveBeenCalled();
        await detector.stop();
    });

    test('does not trigger twice for the same user message', async () => {
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'Initial message' } },
        });
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'Second message' } },
        });
        mockCdp.call.mockResolvedValueOnce({
            result: { value: { text: 'Second message' } },
        });

        const onUserMessage = jest.fn();
        const detector = new UserMessageDetector({
            cdpService: mockCdp,
            pollIntervalMs: 50,
            onUserMessage,
        });

        detector.start();
        await detector.checkUserMessage();
        await detector.checkUserMessage();
        await detector.checkUserMessage();

        expect(onUserMessage).toHaveBeenCalledTimes(1);
        await detector.stop();
    });
});
