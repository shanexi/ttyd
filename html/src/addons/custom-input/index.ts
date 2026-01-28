/**
 * Custom Input Addon
 *
 * 自管理的自定义输入框 addon：
 * 1. 创建和渲染输入框 UI
 * 2. 管理输入状态和事件
 * 3. 禁用 xterm 按键捕获当输入框获得焦点
 * 4. Shadow sync - 同步输入到后端
 */

import { Terminal, ITerminalAddon } from '@xterm/xterm';
import { render, h } from 'preact';
import { Component } from 'preact';

enum Command {
    INPUT = '0',
}

// ============================================================================
// UI Component
// ============================================================================

interface InputBoxProps {
    onInput: (value: string) => void;
    onSubmit: () => void;
    value: string;
    inputRef: (el: HTMLTextAreaElement | null) => void;
}

class InputBox extends Component<InputBoxProps> {
    handleInput = (e: Event) => {
        const target = e.target as HTMLTextAreaElement;
        this.props.onInput(target.value);
    };

    handleKeyDown = (e: KeyboardEvent) => {
        // Enter without Shift sends the message
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.props.onSubmit();
        }
    };

    render({ value, inputRef }: InputBoxProps) {
        return h(
            'div',
            { class: 'fixed bottom-0 left-0 right-0 p-2 bg-[#1e1e1e] z-10' },
            h('textarea', {
                ref: inputRef,
                value: value,
                onInput: this.handleInput,
                onKeyDown: this.handleKeyDown,
                placeholder: 'Type your message... (Enter to send, / for commands)',
                class: 'w-full min-h-[60px] bg-[#2d2d2d] text-white border-none p-2 font-mono text-sm resize-y outline-none rounded',
            })
        );
    }
}

// ============================================================================
// Addon
// ============================================================================

export class CustomInputAddon implements ITerminalAddon {
    private _terminal?: Terminal;
    private _terminalContainer?: HTMLElement;
    private _inputContainer?: HTMLElement;
    private _inputElement?: HTMLTextAreaElement;
    private _socket?: WebSocket;
    private _inputValue = '';

    activate(terminal: Terminal): void {
        this._terminal = terminal;
        console.log('[CustomInputAddon] Addon activated');

        // Attach custom key handler to disable xterm key handling when custom input is focused
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        terminal.attachCustomKeyEventHandler((_event: KeyboardEvent) => {
            if (this._inputElement && document.activeElement === this._inputElement) {
                return false; // Don't let xterm handle
            }
            return true; // Let xterm handle normally
        });

        // 获取 terminal 的 DOM 容器（延迟获取，等 terminal.open() 完成）
        setTimeout(() => {
            // terminal.element.parentElement 是 #terminal-container (body 的直接子元素)
            const element = (terminal as { element?: HTMLElement }).element;
            this._terminalContainer = element?.parentElement || undefined;
            if (!this._terminalContainer) {
                console.warn('[CustomInputAddon] Terminal container not found');
                return;
            }

            // 创建 input 容器
            // 注意：Input 使用 position: fixed 固定在底部，不占用 DOM 流位置
            this._inputContainer = document.createElement('div');
            this._terminalContainer.appendChild(this._inputContainer);

            this._renderInputBox();
            console.log('[CustomInputAddon] Input box rendered');
        }, 100);
    }

    private _renderInputBox(): void {
        if (!this._inputContainer) return;

        render(
            h(InputBox, {
                value: this._inputValue,
                onInput: (value: string) => this._handleInput(value),
                onSubmit: () => this._handleSubmit(),
                inputRef: (el: HTMLTextAreaElement | null) => {
                    this._inputElement = el || undefined;
                },
            }),
            this._inputContainer
        );
    }

    private _handleInput(value: string): void {
        const prevValue = this._inputValue;
        this._inputValue = value;
        this._renderInputBox();

        // Sync input to backend for slash command detection (shadow sync)
        // Send only the new characters (incremental sync)
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            return;
        }

        if (value.length > prevValue.length) {
            // User typed new character(s)
            const newChars = value.slice(prevValue.length);
            this._sendData(newChars);
        } else if (value.length < prevValue.length) {
            // User deleted character(s) - send backspace
            const deleteCount = prevValue.length - value.length;
            for (let i = 0; i < deleteCount; i++) {
                this._sendData('\x7f'); // ASCII DEL (backspace)
            }
        }
    }

    private _handleSubmit(): void {
        if (!this._inputValue.trim()) return;

        // Send to ttyd via socket
        this._sendData(this._inputValue);
        setTimeout(() => {
            this._sendData('\r');
        }, 100);

        // Clear input
        this._inputValue = '';
        this._renderInputBox();
    }

    private _sendData(data: string): void {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            console.warn('[CustomInputAddon] Cannot send data - socket not ready');
            return;
        }

        const payload = new Uint8Array(1 + data.length);
        payload[0] = Command.INPUT.charCodeAt(0);
        for (let i = 0; i < data.length; i++) {
            payload[i + 1] = data.charCodeAt(i);
        }
        this._socket.send(payload);
    }

    /**
     * Set the WebSocket reference for sending data
     */
    setSocket(socket: WebSocket): void {
        this._socket = socket;
    }

    /**
     * Send key to backend for shadow sync
     * Used by slash menu and MCP dialogs to forward navigation keys
     */
    sendKeyToBackend(key: string): void {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            console.warn('[CustomInputAddon] Cannot send key to backend - socket not ready');
            return;
        }

        // Map key names to terminal sequences
        const keyMap: { [key: string]: string } = {
            Escape: '\x1b',
            Enter: '\r',
            ArrowUp: '\x1b[A',
            ArrowDown: '\x1b[B',
            ArrowRight: '\x1b[C',
            ArrowLeft: '\x1b[D',
        };

        const sequence = keyMap[key];
        if (!sequence) {
            console.warn('[CustomInputAddon] Unknown key:', key);
            return;
        }

        const payload = new Uint8Array(1 + sequence.length);
        payload[0] = Command.INPUT.charCodeAt(0);
        for (let i = 0; i < sequence.length; i++) {
            payload[i + 1] = sequence.charCodeAt(i);
        }
        this._socket.send(payload);
    }

    dispose(): void {
        // Clean up input container
        if (this._inputContainer) {
            render(null, this._inputContainer);
            this._inputContainer.remove();
            this._inputContainer = undefined;
        }
    }
}
