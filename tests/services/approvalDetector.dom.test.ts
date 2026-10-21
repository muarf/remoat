/**
 * @jest-environment jsdom
 *
 * Pure-DOM verification of DETECT_APPROVAL_SCRIPT.
 * Verifies that:
 * 1. Historical or in-progress tool outputs (e.g. "Ran gh run view...", "Running 7 commands")
 *    are NEVER detected as approval dialogs (false-positive prevention).
 * 2. Shell commands with "run" in their text (e.g. "npm run build") are ignored.
 * 3. Legitimate approval dialogs (Allow Once / Deny, Always Allow, Run / Reject) are properly detected.
 * 4. Fallback to document.body is disabled (elements must be within a common approval container/dialog).
 */

import { DETECT_APPROVAL_SCRIPT, ApprovalInfo } from '../../src/services/approvalDetector';

beforeAll(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get(this: HTMLElement) {
            return this.closest('[data-test-hidden]') ? null : (this.parentElement || document.body);
        },
    });
});

afterEach(() => {
    document.body.innerHTML = '';
});

function evalApprovalScript(): ApprovalInfo | null {
    // Indirect eval in jsdom global scope
    return (0, eval)(DETECT_APPROVAL_SCRIPT);
}

describe('DETECT_APPROVAL_SCRIPT - DOM verification', () => {
    describe('False positive prevention (command lines & execution status)', () => {
        test('ignores completed tool execution widget: "Ran gh run view ..."', () => {
            document.body.innerHTML = `
                <div class="tool-call-container">
                    <button>Ran gh run view 39656710395 --log-failed</button>
                    <button>RejectShift+Alt+⌫</button>
                </div>
            `;
            expect(evalApprovalScript()).toBeNull();
        });

        test('ignores running tool execution counter: "Running 7 commands"', () => {
            document.body.innerHTML = `
                <div class="tool-call-container">
                    <button>Running 7 commands</button>
                    <button>RejectShift+Alt+⌫</button>
                </div>
            `;
            expect(evalApprovalScript()).toBeNull();
        });

        test('ignores shell command buttons containing "run": "npm run build"', () => {
            document.body.innerHTML = `
                <div class="terminal-widget">
                    <button>npm run build</button>
                    <button>Reject</button>
                </div>
            `;
            expect(evalApprovalScript()).toBeNull();
        });

        test('ignores shell command buttons containing "run": "cargo run --release"', () => {
            document.body.innerHTML = `
                <div class="terminal-widget">
                    <button>cargo run --release</button>
                    <button>Deny</button>
                </div>
            `;
            expect(evalApprovalScript()).toBeNull();
        });

        test('ignores buttons when separated without common dialog container (no document.body fallback)', () => {
            document.body.innerHTML = `
                <div class="sidebar">
                    <button>Run</button>
                </div>
                <div class="editor-header">
                    <button>Reject</button>
                </div>
                <p class="description">MCP server description in sidebar</p>
            `;
            // Because there is no common dialog/modal ancestor (only document.body), this must be null
            expect(evalApprovalScript()).toBeNull();
        });
    });

    describe('Legitimate approval dialogs detection', () => {
        test('detects Allow Once and Deny inside modal dialog', () => {
            document.body.innerHTML = `
                <div role="dialog" class="permission-modal">
                    <p class="description">Allow write access to config.json?</p>
                    <button>Allow Once</button>
                    <button>Deny</button>
                </div>
            `;
            const result = evalApprovalScript();
            expect(result).not.toBeNull();
            expect(result?.approveText).toBe('Allow Once');
            expect(result?.denyText).toBe('Deny');
            expect(result?.alwaysAllowText).toBe('');
            expect(result?.description).toBe('Allow write access to config.json?');
        });

        test('detects Always Allow / Allow This Conversation inside dialog', () => {
            document.body.innerHTML = `
                <div role="dialog" class="permission-modal">
                    <div class="description">Execute terminal command?</div>
                    <button>Allow Once</button>
                    <button>Allow This Conversation</button>
                    <button>Deny</button>
                </div>
            `;
            const result = evalApprovalScript();
            expect(result).not.toBeNull();
            expect(result?.approveText).toBe('Allow Once');
            expect(result?.alwaysAllowText).toBe('Allow This Conversation');
            expect(result?.denyText).toBe('Deny');
            expect(result?.description).toBe('Execute terminal command?');
        });

        test('detects genuine Run / Reject action verb button in permission container', () => {
            document.body.innerHTML = `
                <div class="approval-container">
                    <p class="description">Run bash script on your system?</p>
                    <button>Run</button>
                    <button>Reject</button>
                </div>
            `;
            const result = evalApprovalScript();
            expect(result).not.toBeNull();
            expect(result?.approveText).toBe('Run');
            expect(result?.denyText).toBe('Reject');
            expect(result?.description).toBe('Run bash script on your system?');
        });

        test('detects Japanese approval buttons (許可 / 拒否)', () => {
            document.body.innerHTML = `
                <div role="dialog">
                    <p class="description">ファイルの変更を許可しますか？</p>
                    <button>今回のみ許可</button>
                    <button>常に許可</button>
                    <button>拒否</button>
                </div>
            `;
            const result = evalApprovalScript();
            expect(result).not.toBeNull();
            expect(result?.approveText).toBe('今回のみ許可');
            expect(result?.alwaysAllowText).toBe('常に許可');
            expect(result?.denyText).toBe('拒否');
            expect(result?.description).toBe('ファイルの変更を許可しますか？');
        });
    });
});
