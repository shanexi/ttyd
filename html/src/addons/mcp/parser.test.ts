import { describe, it, expect } from 'vitest';
import { parseMCPDialog, parseMCPServerDetail } from './parser';

describe('parseMCPDialog', () => {
    it('should parse server list with first server selected', () => {
        const input = `Manage MCP servers
2 servers

Local MCPs (/Users/shane/.claude.json [project: /Users/shane/conductor/workspaces/ttyd/chicago])
› browsermcp · ○ disabled

User MCPs (/Users/shane/.claude.json)
  chrome-devtools · ✓ connected

https://code.claude.com/docs/en/mcp for help

↑↓ to navigate · Enter to confirm · Esc to cancel`;

        const result = parseMCPDialog(input);

        expect(result.servers).toHaveLength(2);
        expect(result.selectedIndex).toBe(0);

        expect(result.servers[0]).toMatchObject({
            name: 'browsermcp',
            status: 'disabled',
            type: 'local',
        });

        expect(result.servers[1]).toMatchObject({
            name: 'chrome-devtools',
            status: 'connected',
            type: 'user',
        });
    });

    it('should parse server list with second server selected', () => {
        const input = `Manage MCP servers
2 servers

Local MCPs (/Users/shane/.claude.json)
  browsermcp · ○ disabled

User MCPs (/Users/shane/.claude.json)
› chrome-devtools · ✓ connected`;

        const result = parseMCPDialog(input);

        expect(result.servers).toHaveLength(2);
        expect(result.selectedIndex).toBe(1);
    });

    it('should handle single server', () => {
        const input = `Manage MCP servers
1 server

User MCPs (/Users/shane/.claude.json)
› chrome-devtools · ✓ connected`;

        const result = parseMCPDialog(input);

        expect(result.servers).toHaveLength(1);
        expect(result.selectedIndex).toBe(0);
        expect(result.servers[0].name).toBe('chrome-devtools');
    });

    it('should handle alternate selection marker (❯)', () => {
        const input = `Manage MCP servers
1 server

User MCPs (/Users/shane/.claude.json)
❯ chrome-devtools · ✓ connected`;

        const result = parseMCPDialog(input);

        expect(result.selectedIndex).toBe(0);
    });

    it('should handle status indicators without explicit text', () => {
        const input = `User MCPs (/Users/shane/.claude.json)
› test-server · ○`;

        const result = parseMCPDialog(input);

        expect(result.servers).toHaveLength(1);
        expect(result.servers[0].status).toBe('disabled');
    });

    it('should handle connected status with checkmark', () => {
        const input = `User MCPs (/Users/shane/.claude.json)
› test-server · ✓`;

        const result = parseMCPDialog(input);

        expect(result.servers).toHaveLength(1);
        expect(result.servers[0].status).toBe('connected');
    });

    it('should return empty array on invalid input', () => {
        const result = parseMCPDialog('invalid content');

        expect(result.servers).toEqual([]);
        expect(result.selectedIndex).toBe(0);
    });

    it('should handle empty input', () => {
        const result = parseMCPDialog('');

        expect(result.servers).toEqual([]);
        expect(result.selectedIndex).toBe(0);
    });
});

describe('parseMCPServerDetail', () => {
    it('should parse connected server detail', () => {
        const input = `Chrome-devtools MCP Server v2.1.17
        Sonnet 4.5 · API Usage Billing
Status: ✓ connected
Command: npx
Args: chrome-devtools-mcp@latest
Config location: /Users/shane/.claude.json

❯ 1. View tools
  2. Reconnect
  3. Disable

↑↓ to navigate · Enter to select · Esc to cancel`;

        const result = parseMCPServerDetail(input);

        expect(result.server).toBeTruthy();
        expect(result.server?.name).toBe('chrome-devtools');
        expect(result.server?.status).toBe('connected');
        expect(result.server?.command).toBe('npx');
        expect(result.server?.args).toEqual(['chrome-devtools-mcp@latest']);
        expect(result.server?.configPath).toBe('/Users/shane/.claude.json');

        expect(result.server?.actions).toHaveLength(3);
        expect(result.server?.selectedActionIndex).toBe(0);

        expect(result.server?.actions?.[0]).toMatchObject({
            label: 'View tools',
            action: 'view_tools',
        });
    });

    it('should parse disabled server detail', () => {
        const input = `Browsermcp MCP Server
Status: ○ disabled
Command: npx
Args: @browsermcp/mcp@latest
Config location: /Users/shane/.claude.json [project: /Users/shane/conductor/workspaces/ttyd/chicago]

❯ 1. Enable`;

        const result = parseMCPServerDetail(input);

        expect(result.server?.name).toBe('browsermcp');
        expect(result.server?.status).toBe('disabled');
        expect(result.server?.actions).toHaveLength(1);
        expect(result.server?.actions?.[0].action).toBe('enable');
    });

    it('should parse server with second action selected', () => {
        const input = `Test MCP Server
Status: ✓ connected
Command: npx
Args: test@latest
Config location: /Users/test/.claude.json

  1. View tools
❯ 2. Reconnect
  3. Disable`;

        const result = parseMCPServerDetail(input);

        expect(result.server?.selectedActionIndex).toBe(1);
        expect(result.server?.actions?.[1].action).toBe('reconnect');
    });

    it('should handle box drawing characters', () => {
        const input = `│ Chrome-devtools MCP Server │
│ Status: ✓ connected │
│ Command: npx │`;

        const result = parseMCPServerDetail(input);

        expect(result.server?.name).toBe('chrome-devtools');
        expect(result.server?.status).toBe('connected');
        expect(result.server?.command).toBe('npx');
    });

    it('should return null on invalid input', () => {
        const result = parseMCPServerDetail('invalid content');

        expect(result.server).toBeNull();
        expect(result.tools).toEqual([]);
    });

    it('should handle config location with project path', () => {
        const input = `Test MCP Server
Status: ○ disabled
Config location: /Users/shane/.claude.json [project: /Users/shane/conductor/workspaces/ttyd]`;

        const result = parseMCPServerDetail(input);

        expect(result.server?.configPath).toBe('/Users/shane/.claude.json');
    });
});
