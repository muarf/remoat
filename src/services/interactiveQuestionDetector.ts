import { logger } from '../utils/logger';
import { CdpService } from './cdpService';

export interface QuestionOption {
    /** Option identifier (e.g. "1", "2", "__write_in__") */
    id: string;
    /** Option display text (e.g. "Yes, allow this time") */
    text: string;
    /** Whether option is currently selected in Antigravity */
    selected: boolean;
    /** Whether this is a write-in / custom option ("No", "Other") */
    isWriteIn?: boolean;
}

export interface InteractiveQuestionInfo {
    /** Question title (e.g. "Allow using this MCP tool?" or agent question) */
    title: string;
    /** Optional subtitle / target tool (e.g. "jules/get_bash_outputs") */
    subtitle?: string;
    /** Options list */
    options: QuestionOption[];
    /** Whether multi-select is enabled */
    isMultiSelect?: boolean;
    /** Whether Skip button is present */
    hasSkip: boolean;
    /** Whether Submit / Continue button is present */
    hasSubmit: boolean;
    /** Whether Submit is disabled */
    submitDisabled?: boolean;
}

export interface InteractiveQuestionDetectorOptions {
    cdpService: CdpService;
    pollIntervalMs?: number;
    onQuestionRequired: (info: InteractiveQuestionInfo) => void;
    onResolved?: () => void;
}

/**
 * Script to detect and extract interactive questions (MCP permission requests, ask_question tool)
 */
export const DETECT_QUESTION_SCRIPT = `(() => {
    const continueBtn = document.querySelector('button[data-testid="interaction-continue-button"]');
    const skipBtn = document.querySelector('button[data-testid="interaction-skip-button"]');
    const radiogroup = document.querySelector('div[role="radiogroup"], [class*="ask-opt"]');

    if (!continueBtn && !skipBtn && !radiogroup) return null;

    const anchor = continueBtn || skipBtn || radiogroup;
    const container = anchor.closest('.outline-none.flex.flex-col, [role="dialog"], .antigravity-agent-side-panel') || document.body;

    // 1. Title / Question
    let title = '';
    const titleEl = container.querySelector('div.flex.min-w-0.text-sm, h3, [class*="question"]');
    if (titleEl) {
        title = (titleEl.textContent || '').trim();
    }
    if (!title && container.innerText.includes('Allow using this MCP tool')) {
        title = 'Allow using this MCP tool?';
    }

    // 2. Subtitle / Target Tool (e.g. jules/get_bash_outputs)
    let subtitle = '';
    const targetEl = container.querySelector('textarea[aria-label="Edit permission target"], .font-mono.text-xs, textarea.font-mono');
    if (targetEl) {
        subtitle = (targetEl.value || targetEl.textContent || '').trim();
    }

    // 3. Options
    const options = [];
    const optionLabels = Array.from(container.querySelectorAll('label[for*="ask-opt"], label:has(input[type="radio"]), label:has(input[type="checkbox"])'));

    if (optionLabels.length > 0) {
        for (const lbl of optionLabels) {
            const input = lbl.querySelector('input') || document.getElementById(lbl.getAttribute('for') || '');
            const id = input ? (input.value || input.id) : '';
            const checked = input ? input.checked : false;

            let text = '';
            const spans = Array.from(lbl.querySelectorAll('span'));
            if (spans.length >= 2) {
                text = (spans[spans.length - 1].textContent || '').trim();
            } else {
                text = (lbl.textContent || '').trim();
            }

            if (text) {
                options.push({
                    id: id || String(options.length + 1),
                    text,
                    selected: checked,
                    isWriteIn: (id || '').includes('write_in'),
                });
            }
        }
    } else {
        const inputs = Array.from(container.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        for (let i = 0; i < inputs.length; i++) {
            const inp = inputs[i];
            const parentLabel = inp.closest('label') || inp.parentElement;
            const text = (parentLabel?.textContent || '').trim();
            options.push({
                id: inp.value || String(i + 1),
                text: text || \`Option \${i + 1}\`,
                selected: inp.checked,
                isWriteIn: (inp.id || '').includes('write_in'),
            });
        }
    }

    if (options.length === 0 && !continueBtn) return null;

    return {
        title: title || 'Permission / Question Required',
        subtitle: subtitle || undefined,
        options,
        hasSkip: !!skipBtn,
        hasSubmit: !!continueBtn,
        submitDisabled: continueBtn ? continueBtn.disabled : false,
    };
})()`;

/**
 * Script to select an option and click Submit in one action
 */
export function buildSelectAndSubmitScript(optionId: string): string {
    return `(() => {
        let selected = false;
        const inputs = Array.from(document.querySelectorAll('input[id*="ask-opt"], input[type="radio"], input[type="checkbox"]'));
        const targetInput = inputs.find(inp => inp.value === ${JSON.stringify(optionId)} || inp.id.endsWith('-' + ${JSON.stringify(optionId)}));
        if (targetInput) {
            const label = targetInput.closest('label') || document.querySelector('label[for="' + targetInput.id + '"]');
            if (label && typeof label.click === 'function') {
                label.click();
                selected = true;
            } else if (typeof targetInput.click === 'function') {
                targetInput.click();
                selected = true;
            }
        }

        if (!selected) {
            const labels = Array.from(document.querySelectorAll('label'));
            const targetLabel = labels.find(l => (l.textContent || '').trim().includes(${JSON.stringify(optionId)}));
            if (targetLabel && typeof targetLabel.click === 'function') {
                targetLabel.click();
                selected = true;
            }
        }

        const submitBtn = document.querySelector('button[data-testid="interaction-continue-button"]');
        if (submitBtn && typeof submitBtn.click === 'function') {
            submitBtn.click();
            return { ok: true, method: 'testid' };
        }
        const anySubmit = Array.from(document.querySelectorAll('button')).find(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            return t.includes('submit') || t.includes('continue');
        });
        if (anySubmit && typeof anySubmit.click === 'function') {
            anySubmit.click();
            return { ok: true, method: 'text-fallback' };
        }

        return { ok: selected };
    })()`;
}

/**
 * Script to click Skip button
 */
export const CLICK_SKIP_SCRIPT = `(() => {
    const skipBtn = document.querySelector('button[data-testid="interaction-skip-button"]');
    if (skipBtn && typeof skipBtn.click === 'function') {
        skipBtn.click();
        return { ok: true, method: 'testid' };
    }
    const anySkip = Array.from(document.querySelectorAll('button')).find(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        return t.includes('skip');
    });
    if (anySkip && typeof anySkip.click === 'function') {
        anySkip.click();
        return { ok: true, method: 'text-fallback' };
    }
    return { ok: false, error: 'Skip button not found' };
})()`;

export class InteractiveQuestionDetector {
    private cdpService: CdpService;
    private pollIntervalMs: number;
    private onQuestionRequired: (info: InteractiveQuestionInfo) => void;
    private onResolved?: () => void;

    private pollTimer: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private lastDetectedKey: string | null = null;
    private lastDetectedInfo: InteractiveQuestionInfo | null = null;

    constructor(options: InteractiveQuestionDetectorOptions) {
        this.cdpService = options.cdpService;
        this.pollIntervalMs = options.pollIntervalMs ?? 1500;
        this.onQuestionRequired = options.onQuestionRequired;
        this.onResolved = options.onResolved;
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastDetectedKey = null;
        this.lastDetectedInfo = null;
        this.schedulePoll();
    }

    async stop(): Promise<void> {
        this.isRunning = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    getLastDetectedInfo(): InteractiveQuestionInfo | null {
        return this.lastDetectedInfo;
    }

    /**
     * Poll once and return detected info (public for testing and manual checks).
     */
    async checkQuestion(): Promise<InteractiveQuestionInfo | null> {
        await this.poll();
        return this.lastDetectedInfo;
    }

    isActive(): boolean {
        return this.isRunning;
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
                expression: DETECT_QUESTION_SCRIPT,
                returnByValue: true,
                awaitPromise: false,
            };
            if (contextId !== null) callParams.contextId = contextId;

            const result = await this.cdpService.call('Runtime.evaluate', callParams);
            const info: InteractiveQuestionInfo | null = result?.result?.value ?? null;

            if (info && info.options.length > 0) {
                const optKey = info.options.map(o => `${o.id}:${o.text}`).join('|');
                const key = `${info.title}::${info.subtitle ?? ''}::${optKey}`;

                if (key !== this.lastDetectedKey) {
                    this.lastDetectedKey = key;
                    this.lastDetectedInfo = info;
                    Promise.resolve(this.onQuestionRequired(info)).catch((err) => {
                        logger.error('[InteractiveQuestionDetector] onQuestionRequired callback failed:', err);
                    });
                }
            } else {
                const wasDetected = this.lastDetectedKey !== null;
                this.lastDetectedKey = null;
                this.lastDetectedInfo = null;
                if (wasDetected && this.onResolved) {
                    this.onResolved();
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('WebSocket is not connected') || message.includes('WebSocket disconnected')) {
                return;
            }
            logger.debug('[InteractiveQuestionDetector] Error during polling:', error);
        }
    }

    /**
     * Select an option by its ID and click Submit immediately (1-tap workflow).
     */
    async selectAndSubmit(optionId: string): Promise<boolean> {
        try {
            const result = await this.runEvaluateScript(buildSelectAndSubmitScript(optionId));
            return result?.ok === true;
        } catch (error) {
            logger.error('[InteractiveQuestionDetector] Error in selectAndSubmit:', error);
            return false;
        }
    }

    /**
     * Click the Skip button.
     */
    async skip(): Promise<boolean> {
        try {
            const result = await this.runEvaluateScript(CLICK_SKIP_SCRIPT);
            return result?.ok === true;
        } catch (error) {
            logger.error('[InteractiveQuestionDetector] Error in skip:', error);
            return false;
        }
    }

    private async runEvaluateScript(expression: string): Promise<any> {
        const contextId = this.cdpService.getPrimaryContextId();
        const callParams: Record<string, unknown> = {
            expression,
            returnByValue: true,
            awaitPromise: false,
        };
        if (contextId !== null) callParams.contextId = contextId;
        const result = await this.cdpService.call('Runtime.evaluate', callParams);
        return result?.result?.value;
    }
}
