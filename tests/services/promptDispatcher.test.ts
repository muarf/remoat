import { PromptDispatcher } from '../../src/services/promptDispatcher';

describe('PromptDispatcher', () => {
    it('invokes the send implementation via send()', async () => {
        const sendPromptImpl = jest.fn().mockResolvedValue(undefined);
        const dispatcher = new PromptDispatcher({
            bridge: {} as any,
            modeService: {} as any,
            modelService: {} as any,
            sendPromptImpl,
        });

        const req = {
            channel: { chatId: 12345, threadId: 1 } as any,
            prompt: 'hello',
            cdp: { getCurrentWorkspaceName: () => 'TestProject' } as any,
            inboundImages: [],
            options: { foo: 'bar' } as any,
        };

        await dispatcher.send(req);

        expect(sendPromptImpl).toHaveBeenCalledWith(
            {} as any,
            req.channel,
            'hello',
            req.cdp,
            {} as any,
            {} as any,
            [],
            req.options,
        );
    });

    it('resets workspace lock via resetWorkspaceLock', async () => {
        let resolveFirst: () => void;
        const firstDone = new Promise<void>(r => { resolveFirst = r; });

        const sendPromptImpl = jest.fn()
            .mockImplementationOnce(async () => { await firstDone; })
            .mockImplementationOnce(async () => { });

        const dispatcher = new PromptDispatcher({
            bridge: {} as any,
            modeService: {} as any,
            modelService: {} as any,
            sendPromptImpl,
        });

        const channel = { chatId: 12345, threadId: 1 } as any;
        const cdp = { getCurrentWorkspaceName: () => 'TestProject' } as any;

        // Start first long-running request
        const p1 = dispatcher.send({ channel, prompt: 'long-run', cdp });
        await new Promise(r => setTimeout(r, 10));
        expect(dispatcher.isBusy(channel, cdp)).toBe(true);
        expect(sendPromptImpl).toHaveBeenCalledTimes(1);

        // Force reset the lock
        dispatcher.resetWorkspaceLock('ws:TestProject');
        expect(dispatcher.isBusy(channel, cdp)).toBe(false);

        // Second request should start immediately without waiting for first to resolve
        const p2 = dispatcher.send({ channel, prompt: 'new-run', cdp });
        await new Promise(r => setTimeout(r, 10));
        expect(sendPromptImpl).toHaveBeenCalledTimes(2);

        // Clean up
        resolveFirst!();
        await Promise.all([p1, p2]);
    });
});
