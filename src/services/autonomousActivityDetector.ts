import { createHash } from 'node:crypto';
import { logger } from '../utils/logger';
import { CdpService } from './cdpService';

/** Autonomous activity information detected from the DOM */
export interface AutonomousActivityInfo {
    /** True if the assistant is currently generating or thinking */
    isGenerating: boolean;
    /** Number of assistant turns in the DOM */
    turnCount: number;
    /** Preview of latest assistant response text */
    latestTextPreview: string;
    /** Length of latest assistant response text */
    latestTextLength: number;
}

export interface AutonomousActivityDetectorOptions {
    /** CDP service instance */
    cdpService: CdpService;
    /** Poll interval in milliseconds (default: 2000ms) */
    pollIntervalMs?: number;
    /** Function to check whether this workspace is currently actively monitored */
    isMonitored: () => boolean;
    /** Callback when autonomous generation starts while unmonitored */
    onAutonomousStart?: () => Promise<void> | void;
    /** Callback when an unmonitored autonomous response is completed */
    onAutonomousResponse?: (info: { preview: string; length: number }) => Promise<void> | void;
}

/**
 * Script to detect autonomous assistant generation or completed response in Antigravity.
 */
export const DETECT_AUTONOMOUS_SCRIPT = `(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    const scope = panel || document;

    // 1. Detect if currently generating or thinking
    let isGenerating = false;
    const cancelBtn = scope.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
    if (cancelBtn) {
        isGenerating = true;
    } else {
        const normalize = (value) => (value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const STOP_PATTERNS = [
            /^stop$/,
            /^stop generating$/,
            /^stop response$/,
            /^cancel(\\s*\\(.*\\))?$/,
            /^annuler$/,
            /^停止$/,
            /^生成を停止$/,
            /^応答を停止$/,
        ];
        const isStopLabel = (value) => {
            const n = normalize(value);
            return n ? STOP_PATTERNS.some((re) => re.test(n)) : false;
        };
        const buttons = scope.querySelectorAll('button, [role="button"]');
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if ([btn.textContent || '', btn.getAttribute('aria-label') || '', btn.getAttribute('title') || ''].some(isStopLabel)) {
                isGenerating = true;
                break;
            }
        }
    }

    if (!isGenerating) {
        const thinkingSpinner = scope.querySelector('.antigravity-agent-side-panel [class*="thinking"], .antigravity-agent-side-panel [class*="spinner"], [data-testid*="thinking"]');
        if (thinkingSpinner) {
            isGenerating = true;
        }
    }

    // 2. Count assistant turns & inspect latest assistant output
    const assistantTurns = scope.querySelectorAll('[data-message-author-role="assistant"]');
    const turnCount = assistantTurns.length;
    let latestText = '';
    if (turnCount > 0) {
        const lastTurn = assistantTurns[turnCount - 1];
        const textNode = lastTurn.querySelector('.rendered-markdown, .leading-relaxed.select-text, .prose') || lastTurn;
        latestText = (textNode.textContent || '').replace(/\\r/g, '').trim();
    }

    return {
        isGenerating,
        turnCount,
        latestTextPreview: latestText.slice(0, 120),
        latestTextLength: latestText.length,
    };
})()`;

/**
 * Compute short hash of text and length for deduplication.
 */
function computeTextHash(input: string): string {
    return createHash('sha256').update(input.trim()).digest('hex').slice(0, 16);
}

/**
 * Detects autonomous assistant activity (reactive wakeup, background task completion, cron/timer)
 * when no user prompt or external IDE message triggered it.
 */
export class AutonomousActivityDetector {
    private readonly cdpService: CdpService;
    private readonly pollIntervalMs: number;
    private readonly isMonitored: () => boolean;
    private readonly onAutonomousStart?: () => Promise<void> | void;
    private readonly onAutonomousResponse?: (info: { preview: string; length: number }) => Promise<void> | void;

    private pollTimer: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private isPriming: boolean = false;
    private wasGenerating: boolean = false;
    private lastSeenTurnCount: number = 0;
    private lastSeenTextHash: string | null = null;
    private readonly seenHashes = new Set<string>();
    private static readonly MAX_SEEN_HASHES = 50;

    constructor(options: AutonomousActivityDetectorOptions) {
        this.cdpService = options.cdpService;
        this.pollIntervalMs = options.pollIntervalMs ?? 2000;
        this.isMonitored = options.isMonitored;
        this.onAutonomousStart = options.onAutonomousStart;
        this.onAutonomousResponse = options.onAutonomousResponse;
    }

    /** Add hash of a text to seen hashes to prevent echo/duplicate */
    addSeenText(text: string, length?: number): void {
        const len = length ?? text.length;
        const hash = computeTextHash(text.slice(0, 120) + ':' + len);
        this.addToSeenHashes(hash);
        this.lastSeenTextHash = hash;
    }

    /** Start monitoring. First poll primes baseline without triggering callbacks. */
    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isPriming = true;
        this.wasGenerating = false;
        this.lastSeenTurnCount = 0;
        this.lastSeenTextHash = null;
        this.seenHashes.clear();
        this.schedulePoll();
    }

    /** Stop monitoring. */
    stop(): void {
        this.isRunning = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /** Returns whether monitoring is currently active. */
    isActive(): boolean {
        return this.isRunning;
    }

    /** Manually trigger one check (useful for testing) */
    async checkActivity(): Promise<void> {
        await this.poll();
    }

    private addToSeenHashes(hash: string): void {
        if (this.seenHashes.size >= AutonomousActivityDetector.MAX_SEEN_HASHES) {
            const oldest = this.seenHashes.values().next().value;
            if (oldest !== undefined) {
                this.seenHashes.delete(oldest);
            }
        }
        this.seenHashes.add(hash);
    }

    private schedulePoll(): void {
        if (!this.isRunning) return;
        this.pollTimer = setTimeout(async () => {
            await this.poll();
            if (this.isRunning) {
                this.schedulePoll();
            }
        }, this.pollIntervalMs);
    }

    private async poll(): Promise<void> {
        try {
            const contextId = this.cdpService.getPrimaryContextId();
            const callParams: Record<string, unknown> = {
                expression: DETECT_AUTONOMOUS_SCRIPT,
                returnByValue: true,
                awaitPromise: false,
            };
            if (contextId !== null) {
                callParams.contextId = contextId;
            }

            const result = await this.cdpService.call('Runtime.evaluate', callParams);
            const info: AutonomousActivityInfo | null = result?.result?.value ?? null;
            if (!info) return;

            const textHash = computeTextHash(info.latestTextPreview + ':' + info.latestTextLength);

            // 1. Priming: seed current DOM state
            if (this.isPriming) {
                this.isPriming = false;
                this.lastSeenTurnCount = info.turnCount;
                this.lastSeenTextHash = textHash;
                this.wasGenerating = info.isGenerating;
                this.addToSeenHashes(textHash);
                logger.debug(`[AutonomousActivityDetector] Primed with turns=${info.turnCount}, generating=${info.isGenerating}`);
                return;
            }

            // 2. If actively monitored by promptDispatcher or UserMessageDetector, update state and skip
            if (this.isMonitored()) {
                this.lastSeenTurnCount = info.turnCount;
                this.lastSeenTextHash = textHash;
                this.wasGenerating = info.isGenerating;
                this.addToSeenHashes(textHash);
                return;
            }

            // 3. Autonomous generation just started while unmonitored
            if (info.isGenerating && !this.wasGenerating) {
                this.wasGenerating = true;
                logger.info('[AutonomousActivityDetector] Autonomous activity detected: agent started generating');
                if (this.onAutonomousStart) {
                    await Promise.resolve(this.onAutonomousStart());
                }
                return;
            }

            // 4. Completed response appeared while unmonitored
            if (!info.isGenerating) {
                this.wasGenerating = false;
                const isAlreadySeen = this.seenHashes.has(textHash);
                const isNew = (info.turnCount > this.lastSeenTurnCount || textHash !== this.lastSeenTextHash)
                    && !isAlreadySeen
                    && info.latestTextLength > 0;

                if (isNew) {
                    logger.info(`[AutonomousActivityDetector] Autonomous response completed: turns=${info.turnCount}, len=${info.latestTextLength}`);
                    this.lastSeenTurnCount = info.turnCount;
                    this.lastSeenTextHash = textHash;
                    this.addToSeenHashes(textHash);
                    if (this.onAutonomousResponse) {
                        await Promise.resolve(this.onAutonomousResponse({
                            preview: info.latestTextPreview,
                            length: info.latestTextLength,
                        }));
                    }
                } else if (isAlreadySeen) {
                    this.lastSeenTurnCount = info.turnCount;
                    this.lastSeenTextHash = textHash;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('WebSocket is not connected') || message.includes('WebSocket disconnected')) return;
            logger.error('[AutonomousActivityDetector] Error during polling:', error);
        }
    }
}
