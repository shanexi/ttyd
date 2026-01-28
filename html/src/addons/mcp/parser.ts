// MCP Dialog Parser - Extract server data from terminal output

import type { MCPServer, ServerAction } from './index';

/**
 * Parse MCP dialog output to extract server list
 *
 * Actual format from Claude Code:
 * ```
 * Manage MCP servers
 * 2 servers
 *
 * Local MCPs (/Users/shane/.claude.json [project]:
 *   /Users/shane/conductor/workspaces/ttyd/chicago])
 * › browsermcp  ○ disabled
 *
 * User MCPs (/Users/shane/.claude.json)
 *   chrome-devtools ・ ✓ connected
 * ```
 */
export function parseMCPDialog(content: string): { servers: MCPServer[]; selectedIndex: number } {
    try {
        return parseMCPDialogImpl(content);
    } catch (error) {
        console.error('[parseMCPDialog] Parsing error:', error);
        // Fallback: 返回空结果，让调用者 fallback 到原生终端
        return { servers: [], selectedIndex: 0 };
    }
}

function parseMCPDialogImpl(content: string): { servers: MCPServer[]; selectedIndex: number } {
    const servers: MCPServer[] = [];
    const lines = content.split('\n');
    let selectedIndex = 0;

    let currentType: 'local' | 'user' = 'local';
    let currentConfigPath = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines, headers, and help text
        if (!line || line.startsWith('Manage MCP') || line.startsWith('https://') || line.startsWith('↑↓')) {
            continue;
        }

        // Detect section headers
        // Format: "Local MCPs (/path/to/config)" or "User MCPs (/path/to/config)"
        if (line.startsWith('Local MCPs')) {
            currentType = 'local';
            const configMatch = line.match(/\(([^)]+)\)/);
            if (configMatch) {
                currentConfigPath = configMatch[1].split('[')[0].trim();
            }
            continue;
        }
        if (line.startsWith('User MCPs')) {
            currentType = 'user';
            const configMatch = line.match(/\(([^)]+)\)/);
            if (configMatch) {
                currentConfigPath = configMatch[1];
            }
            continue;
        }

        // Parse server line
        // Actual format: "❯ browsermcp · ◯ disabled" or "  chrome-devtools · ✔ connected"
        // Selection indicator: ❯ or › (both used in different contexts)
        // Status indicators: ◯ ○ (disabled), ✔ ✓ (connected)

        // Check if this line is selected
        const isSelected = line.match(/^[❯›]/);

        // Remove selection indicator if present (❯ or ›)
        const cleanLine = line.replace(/^[❯›]\s*/, '').trim();

        // Skip lines that are continuations (just paths or config info)
        if (!cleanLine || cleanLine.length < 3) {
            continue;
        }

        // Try to match: "servername · status_indicator status_text"
        // Format: "browsermcp · ◯ disabled" or "chrome-devtools · ✔ connected"
        const serverMatch = cleanLine.match(/^([a-zA-Z0-9_-]+)\s*[·・]\s*([◯○✔✓]?)\s*(connected|disabled|error)?/);

        if (serverMatch) {
            const [, name, indicator, explicitStatus] = serverMatch;

            // Determine status from indicator or explicit text
            let status: 'connected' | 'disabled' | 'error' = 'disabled';
            if (explicitStatus) {
                status = explicitStatus as 'connected' | 'disabled' | 'error';
            } else if (indicator === '✔' || indicator === '✓') {
                status = 'connected';
            } else if (indicator === '◯' || indicator === '○') {
                status = 'disabled';
            }

            // If this line is selected, record the index
            if (isSelected) {
                selectedIndex = servers.length; // Index of the server we're about to push
            }

            servers.push({
                name,
                displayName: name,
                status,
                type: currentType,
                configPath: currentConfigPath,
            });
        }
    }

    return { servers, selectedIndex };
}

/**
 * Parse server detail view (Layer 3)
 * Actual format from Claude Code:
 * ```
 * Browsermcp MCP Server v2.1.17
 *         Sonnet 4.5 · API Usage Billing
 * Status: ◯ disabled
 * Command: npx
 * Args: @browsermcpsmcp@latest
 * Config location: /Users/shane/.claude.json [project:
 *                 /Users/shane/conductor/workspaces/ttyd/chicago]
 *
 * ☑ 1. Enable
 * ```
 */
export function parseMCPServerDetail(content: string): {
    server: MCPServer | null;
    tools: Array<{ name: string; description: string }>;
} {
    try {
        return parseMCPServerDetailImpl(content);
    } catch (error) {
        console.error('[parseMCPServerDetail] Parsing error:', error);
        // Fallback: 返回 null，让调用者 fallback 到原生终端
        return { server: null, tools: [] };
    }
}

function parseMCPServerDetailImpl(content: string): {
    server: MCPServer | null;
    tools: Array<{ name: string; description: string }>;
} {
    const lines = content.split('\n');
    let server: MCPServer | null = null;

    // Extract server info
    let name = '';
    let status: 'connected' | 'disabled' | 'error' = 'disabled';
    let command = '';
    let args: string[] = [];
    let configPath = '';
    const actions: ServerAction[] = [];
    let selectedActionIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        // Remove box drawing characters (│, ╭, ╮, ╯, ╰, ─) and trim
        const line = lines[i].replace(/[│╭╮╯╰─]/g, '').trim();

        // Parse server name from title: "Servername MCP Server"
        if (line.includes(' MCP Server')) {
            const nameMatch = line.match(/^([^\s]+)\s+MCP Server/);
            if (nameMatch) {
                name = nameMatch[1].toLowerCase();
            }
        }

        // Parse status: "Status: ◯ disabled" or "Status: ✔ connected"
        if (line.startsWith('Status:')) {
            if (line.includes('disabled') || line.includes('◯') || line.includes('○')) {
                status = 'disabled';
            } else if (line.includes('connected') || line.includes('✔') || line.includes('✓')) {
                status = 'connected';
            } else if (line.includes('error')) {
                status = 'error';
            }
        }

        // Parse command: "Command: npx"
        if (line.startsWith('Command:')) {
            command = line.replace('Command:', '').trim();
        }

        // Parse args: "Args: @browsermcpsmcp@latest"
        if (line.startsWith('Args:')) {
            const argsStr = line.replace('Args:', '').trim();
            args = argsStr ? [argsStr] : [];
        }

        // Parse config location: "Config location: /path/to/file"
        if (line.startsWith('Config location:')) {
            const pathMatch = line.match(/Config location:\s*(.+?)(?:\s*\[|$)/);
            if (pathMatch) {
                configPath = pathMatch[1].trim();
            }
        }

        // Parse actions: "❯ 1. View tools", "2. Reconnect", "3. Disable"
        const actionMatch = line.match(/^([❯›]?)\s*\d+\.\s*(.+)$/);
        if (actionMatch) {
            const [, selectedMarker, label] = actionMatch;
            const isSelected = selectedMarker === '❯' || selectedMarker === '›';

            if (isSelected) {
                selectedActionIndex = actions.length;
            }

            // Map label to action type
            let actionType: 'view_tools' | 'reconnect' | 'disable' | 'enable' = 'view_tools';
            const lowerLabel = label.toLowerCase();
            if (lowerLabel.includes('view tools')) {
                actionType = 'view_tools';
            } else if (lowerLabel.includes('reconnect')) {
                actionType = 'reconnect';
            } else if (lowerLabel.includes('disable')) {
                actionType = 'disable';
            } else if (lowerLabel.includes('enable')) {
                actionType = 'enable';
            }

            actions.push({
                label: label.trim(),
                action: actionType,
            });
        }
    }

    if (name) {
        server = {
            name,
            displayName: name.charAt(0).toUpperCase() + name.slice(1),
            status,
            type: 'local', // Default to local, could parse from config path
            configPath,
            command,
            args,
            actions: actions.length > 0 ? actions : undefined,
            selectedActionIndex: actions.length > 0 ? selectedActionIndex : undefined,
        };
    }

    return {
        server,
        tools: [], // Tools list not available in this view
    };
}
