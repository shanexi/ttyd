/**
 * Slash Menu Addon
 *
 * 扫描终端 buffer 检测 slash 命令菜单，用 preact 渲染 React 组件
 * 完全自管理 UI，不依赖外部组件
 */

import { Terminal, ITerminalAddon, IBufferLine } from '@xterm/xterm';
import { render, h } from 'preact';
import { parseSlashMenu } from './parser';
import { SlashDropdown } from './dropdown';

// ============================================================================
// Types
// ============================================================================

export interface SlashCommand {
    command: string; // e.g. "/mcp"
    description: string; // e.g. "Manage MCP servers"
    handler?: () => void;
}

// ============================================================================
// Addon
// ============================================================================

export class SlashMenuAddon implements ITerminalAddon {
    private _terminal?: Terminal;
    private _terminalContainer?: HTMLElement;
    private _overlayContainer?: HTMLElement;
    private _scanTimeout?: ReturnType<typeof setTimeout>;

    activate(terminal: Terminal): void {
        this._terminal = terminal;
        console.log('[SlashMenuAddon] Addon activated');

        // 获取 terminal 的 DOM 容器（延迟获取，等 terminal.open() 完成）
        setTimeout(() => {
            const element = (terminal as { element?: HTMLElement }).element;
            this._terminalContainer = element?.parentElement || undefined;
            if (!this._terminalContainer) {
                console.warn('[SlashMenuAddon] Terminal container not found');
                return;
            }

            // 创建 overlay 容器
            this._overlayContainer = document.createElement('div');
            this._overlayContainer.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                pointer-events: none;
                z-index: 100;
            `;

            this._terminalContainer.appendChild(this._overlayContainer);
            console.log('[SlashMenuAddon] Overlay container created');
        }, 100);

        // 监听终端输出解析完成
        terminal.onWriteParsed(() => {
            if (this._scanTimeout) {
                clearTimeout(this._scanTimeout);
            }
            this._scanTimeout = setTimeout(() => {
                this._scanForSlashMenu();
            }, 50);
        });
    }

    private _scanForSlashMenu(): void {
        try {
            this._scanForSlashMenuImpl();
        } catch (error) {
            console.error('[SlashMenuAddon] Error scanning for slash menu:', error);
        }
    }

    private _scanForSlashMenuImpl(): void {
        if (!this._terminal) return;

        const buffer = this._terminal.buffer.active;

        // 扫描可见区域及往上几行
        const startY = Math.max(0, buffer.viewportY - 10);
        const endY = Math.min(buffer.length, buffer.viewportY + this._terminal.rows);

        // 查找连续的 slash 命令块（至少 3 个连续命令）
        let consecutiveCommands: Array<{ text: string; isBlueHighlight: boolean }> = [];
        let consecutiveCount = 0;
        let bestBlock: Array<{ text: string; isBlueHighlight: boolean }> = [];

        for (let y = startY; y < endY; y++) {
            const line = buffer.getLine(y);
            if (!line) continue;

            const text = this._getLineText(line);

            // 检测 Slash 命令行（格式：/command description 或 ❯ /command description）
            if (text.match(/^\s*[❯›]?\s*\/[a-z-]+\s+/)) {
                // 检测该行是否有蓝色高亮（fg color = 4 或类似蓝色）
                const isBlueHighlight = this._isLineBlueHighlighted(line);
                consecutiveCommands.push({ text, isBlueHighlight });
                consecutiveCount++;
            } else if (consecutiveCount > 0) {
                // 遇到非命令行，检查是否是有效块
                if (consecutiveCount >= 3 && consecutiveCommands.length > bestBlock.length) {
                    bestBlock = [...consecutiveCommands];
                }
                // 重置
                consecutiveCommands = [];
                consecutiveCount = 0;
            }
        }

        // 检查最后一个块
        if (consecutiveCount >= 3 && consecutiveCommands.length > bestBlock.length) {
            bestBlock = [...consecutiveCommands];
        }

        // 至少需要 3 个命令才算有效菜单
        if (bestBlock.length >= 3) {
            // 找到蓝色高亮的行作为 selectedIndex
            let selectedIndex = 0;
            for (let i = 0; i < bestBlock.length; i++) {
                if (bestBlock[i].isBlueHighlight) {
                    selectedIndex = i;
                    break;
                }
            }

            const commandTexts = bestBlock.map(item => item.text);
            const { commands } = parseSlashMenu(commandTexts.join('\n'));
            if (commands.length >= 3) {
                console.log(
                    '[SlashMenuAddon] Detected slash menu:',
                    commands.length,
                    'commands, selectedIndex:',
                    selectedIndex
                );
                this._renderSlashMenu(commands, selectedIndex);
            }
        } else {
            // 没有检测到 slash menu，清理 overlay
            this._clearOverlay();
        }
    }

    private _renderSlashMenu(commands: SlashCommand[], selectedIndex: number): void {
        if (!this._overlayContainer) return;

        this._overlayContainer.style.pointerEvents = 'auto';
        render(
            h(SlashDropdown, {
                commands,
                selectedIndex,
                onSelect: () => {}, // Slash menu is read-only, selection handled by backend
                inputValue: '', // Not needed for buffer-triggered menu
            }),
            this._overlayContainer
        );
    }

    private _clearOverlay(): void {
        if (!this._overlayContainer) return;

        this._overlayContainer.style.pointerEvents = 'none';
        render(null, this._overlayContainer);
    }

    private _isLineBlueHighlighted(line: IBufferLine): boolean {
        // 检查该行的命令部分（前 20 个字符）是否有蓝色前景色
        // Claude Code 使用蓝色（fg=4 或 fg=12）高亮选中项
        for (let x = 0; x < Math.min(20, line.length); x++) {
            const cell = line.getCell(x);
            if (!cell) continue;

            const fg = cell.getFgColor();
            // 蓝色：标准蓝色 (4), 亮蓝色 (12), 或 RGB 蓝色
            if (fg === 4 || fg === 12 || fg === 0x5555ff || fg === 0x0000ff) {
                return true;
            }

            // 检查 RGB 蓝色（如果是 RGB 颜色模式）
            if (typeof fg === 'number' && fg > 16) {
                // 提取 RGB 分量
                const r = (fg >> 16) & 0xff;
                const g = (fg >> 8) & 0xff;
                const b = fg & 0xff;
                // 判断是否是蓝色系（b 显著大于 r 和 g）
                if (b > 100 && b > r + 50 && b > g + 50) {
                    return true;
                }
            }
        }
        return false;
    }

    private _getLineText(line: IBufferLine): string {
        let text = '';
        for (let x = 0; x < line.length; x++) {
            const cell = line.getCell(x);
            if (cell) {
                text += cell.getChars() || ' ';
            }
        }
        return text.trimEnd();
    }

    dispose(): void {
        if (this._scanTimeout) {
            clearTimeout(this._scanTimeout);
        }

        // Clean up overlay
        if (this._overlayContainer) {
            render(null, this._overlayContainer);
            this._overlayContainer.remove();
            this._overlayContainer = undefined;
        }
    }
}
