/**
 * MCP Addon
 *
 * 扫描终端 buffer 检测 MCP dialog，用 preact 渲染 React 组件
 * 完全自管理 UI，不依赖外部组件
 */

import { Terminal, ITerminalAddon, IBufferLine } from '@xterm/xterm';
import { render, h } from 'preact';
import { parseMCPDialog, parseMCPServerDetail } from './parser';
import { MCPServerList } from './server-list';
import { MCPServerDetail } from './server-detail';

// ============================================================================
// Types
// ============================================================================

export interface MCPServer {
    name: string; // e.g. "chrome-devtools"
    displayName?: string; // e.g. "Chrome-devtools MCP Server"
    status: 'connected' | 'disabled' | 'error';
    type: 'local' | 'user';
    configPath: string;
    command?: string; // e.g. "npx"
    args?: string[]; // e.g. ["chrome-devtools-mcp@latest"]
    capabilities?: string[]; // e.g. ["tools"]
    toolsCount?: number; // e.g. 26
    actions?: ServerAction[]; // Available actions for this server
    selectedActionIndex?: number; // Currently selected action
}

export interface ServerAction {
    label: string; // e.g. "View tools"
    action: 'view_tools' | 'reconnect' | 'disable' | 'enable';
}

export interface MCPData {
    servers: MCPServer[];
    selectedServer?: MCPServer;
}

// ============================================================================
// Addon
// ============================================================================

export class MCPAddon implements ITerminalAddon {
    private _terminal?: Terminal;
    private _terminalContainer?: HTMLElement;
    private _overlayContainer?: HTMLElement;
    private _scanTimeout?: ReturnType<typeof setTimeout>;

    activate(terminal: Terminal): void {
        this._terminal = terminal;
        console.log('[MCPAddon] Addon activated');

        // 获取 terminal 的 DOM 容器（延迟获取，等 terminal.open() 调用后）
        setTimeout(() => {
            const element = (terminal as { element?: HTMLElement }).element;
            this._terminalContainer = element?.parentElement || undefined;
            if (!this._terminalContainer) {
                console.warn('[MCPAddon] Terminal container not found');
                return;
            }

            // 创建 overlay 容器
            this._overlayContainer = document.createElement('div');
            this._overlayContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 100;
            `;

            // Ensure parent has position context
            if (
                this._terminalContainer.style.position !== 'absolute' &&
                this._terminalContainer.style.position !== 'relative'
            ) {
                this._terminalContainer.style.position = 'relative';
            }

            this._terminalContainer.appendChild(this._overlayContainer);
            console.log('[MCPAddon] Overlay container created');
        }, 100);

        // 监听终端输出解析完成
        terminal.onWriteParsed(() => {
            if (this._scanTimeout) {
                clearTimeout(this._scanTimeout);
            }
            this._scanTimeout = setTimeout(() => {
                this._scanForMCPDialog();
            }, 50);
        });
        console.log('[MCPAddon] onWriteParsed listener registered');
    }

    private _scanForMCPDialog(): void {
        try {
            this._scanForMCPDialogImpl();
        } catch (error) {
            console.error('[MCPAddon] Error scanning for MCP dialog:', error);
        }
    }

    private _scanForMCPDialogImpl(): void {
        if (!this._terminal) return;

        const buffer = this._terminal.buffer.active;

        // 扫描可见区域及往上几行
        const startY = Math.max(0, buffer.viewportY - 10);
        const endY = Math.min(buffer.length, buffer.viewportY + this._terminal.rows);

        let foundDialogLine = -1;
        let foundDetailLine = -1;
        let foundDismissalLine = -1;

        // DEBUG: 显示扫描范围
        const debugLines: string[] = [];

        // 查找标记
        for (let y = startY; y < endY; y++) {
            const line = buffer.getLine(y);
            if (!line) continue;

            const text = this._getLineText(line);

            // DEBUG: 收集所有非空行用于调试
            if (text.trim()) {
                debugLines.push(`[${y}] ${text.substring(0, 80)}`);
            }

            // 检测 dismissal
            if (text.includes('MCP dialog dismissed')) {
                foundDismissalLine = y;
                break;
            }

            // 检测 Server List: "Manage MCP servers"
            // 必须有完整的标题文本
            if (text.includes('Manage MCP servers')) {
                foundDialogLine = y;
                console.log('[MCPAddon] Found "Manage MCP servers" at line', y);
            }

            // 检测 Server Detail: " MCP Server" (带空格)
            // 必须是在标题位置（不是 List 的一部分）
            if (text.includes(' MCP Server') && !text.includes('Manage MCP servers')) {
                foundDetailLine = y;
                console.log('[MCPAddon] Found "MCP Server" at line', y);
            }
        }

        // DEBUG: 如果没有找到任何标记，输出所有扫描的行
        if (foundDialogLine < 0 && foundDetailLine < 0 && foundDismissalLine < 0 && debugLines.length > 0) {
            console.log('[MCPAddon] No MCP markers found. Scanned lines:', debugLines.slice(0, 20));
        }

        // Priority: Dismissal > Detail > List
        // 但如果同时检测到 List 和 Detail，优先 List（更新的内容）
        if (foundDismissalLine >= 0) {
            console.log('[MCPAddon] Detected MCP dialog dismissal');
            this._clearOverlay();
            return;
        }

        // 如果同时有 List 和 Detail，检查哪个更靠近当前视口底部（更新）
        if (foundDialogLine >= 0 && foundDetailLine >= 0) {
            // List 在 Detail 之后出现，说明用户按了 Esc 回到 List
            if (foundDialogLine > foundDetailLine) {
                console.log('[MCPAddon] Detected MCP dialog at line', foundDialogLine, '(back from detail)');
                this._parseMCPServerList(foundDialogLine);
                return;
            }
        }

        if (foundDetailLine >= 0) {
            console.log('[MCPAddon] Detected MCP Server Detail at line', foundDetailLine);
            this._parseMCPServerDetail(foundDetailLine);
            return;
        }

        if (foundDialogLine >= 0) {
            console.log('[MCPAddon] Detected MCP dialog at line', foundDialogLine);
            this._parseMCPServerList(foundDialogLine);
            return;
        }
    }

    private _parseMCPServerList(startLine: number): void {
        if (!this._terminal) return;

        const buffer = this._terminal.buffer.active;
        const lines: string[] = [];

        // 收集所有相关行，直到遇到 footer 或结束
        // Dialog 中间有空行，不能在空行处停止
        for (let y = startLine; y < buffer.length && y < buffer.viewportY + this._terminal.rows; y++) {
            const line = buffer.getLine(y);
            if (!line) break;

            const text = this._getLineText(line);

            // 遇到 footer（帮助文本）时停止
            if (text.includes('↑↓ to navigate') || text.includes('https://code.claude.com')) {
                break;
            }

            lines.push(text);
        }

        const content = lines.join('\n');

        // DEBUG: 输出原始内容用于测试
        console.log('[MCPAddon] Raw buffer content for testing:');
        console.log('---START---');
        console.log(content);
        console.log('---END---');
        console.log('[MCPAddon] Content length:', content.length, 'lines:', lines.length);

        const { servers, selectedIndex } = parseMCPDialog(content);

        if (servers.length > 0) {
            console.log('[MCPAddon] Parsed', servers.length, 'servers, selectedIndex:', selectedIndex);
            console.log('[MCPAddon] Servers:', servers);
            this._renderServerList(servers, selectedIndex);
        } else {
            console.warn('[MCPAddon] Parsing returned 0 servers');
            console.warn('[MCPAddon] Failed to parse content:', content.substring(0, 200));
        }
    }

    private _parseMCPServerDetail(startLine: number): void {
        if (!this._terminal) return;

        const buffer = this._terminal.buffer.active;
        const lines: string[] = [];

        // 收集所有相关行，直到遇到 footer 或结束
        // Detail 中间有空行，不能在空行处停止
        for (let y = startLine; y < buffer.length && y < buffer.viewportY + this._terminal.rows; y++) {
            const line = buffer.getLine(y);
            if (!line) break;

            const text = this._getLineText(line);

            // 遇到 footer（帮助文本）时停止
            if (text.includes('↑↓ to navigate') || text.includes('Esc to cancel')) {
                break;
            }

            lines.push(text);
        }

        const content = lines.join('\n');
        const { server } = parseMCPServerDetail(content);

        if (server) {
            console.log('[MCPAddon] Parsed server detail:', server.name);
            this._renderServerDetail(server);
        } else {
            console.warn('[MCPAddon] Server detail parsing failed');
        }
    }

    private _renderServerList(servers: MCPServer[], selectedIndex: number): void {
        if (!this._overlayContainer) return;

        this._overlayContainer.style.pointerEvents = 'auto';
        render(h(MCPServerList, { servers, selectedIndex }), this._overlayContainer);
    }

    private _renderServerDetail(server: MCPServer): void {
        if (!this._overlayContainer) return;

        this._overlayContainer.style.pointerEvents = 'auto';
        render(h(MCPServerDetail, { server }), this._overlayContainer);
    }

    private _clearOverlay(): void {
        if (!this._overlayContainer) return;

        this._overlayContainer.style.pointerEvents = 'none';
        render(null, this._overlayContainer);
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
