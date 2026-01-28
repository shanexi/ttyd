// MCP Server List Component
// Displays list of MCP servers with status indicators

import { Component, h } from 'preact';
import type { MCPServer } from './index';

interface Props {
    servers: MCPServer[];
    selectedIndex: number;
}

export class MCPServerList extends Component<Props> {
    render({ servers, selectedIndex }: Props) {
        if (servers.length === 0) {
            return null;
        }

        return (
            <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 max-w-[800px] max-h-[600px] bg-[#2d2d2d] border-2 border-red-500 rounded-lg p-4 z-[1000] overflow-auto font-mono">
                <div class="mb-4 flex justify-between">
                    <h3 class="m-0 text-white text-base">MCP Servers</h3>
                    <span class="text-gray-500 text-xs">
                        {servers.length} server{servers.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div class="flex flex-col gap-2">
                    {servers.map((server, i) => {
                        const isSelected = i === selectedIndex;
                        const statusColor =
                            server.status === 'connected' ? '#4CAF50' : server.status === 'error' ? '#f44336' : '#888';

                        return (
                            <div
                                key={server.name}
                                class={`p-3 rounded-md cursor-pointer transition-all ${
                                    isSelected
                                        ? 'bg-[#3d3d3d] border border-blue-500'
                                        : 'bg-[#2a2a2a] border border-gray-700'
                                }`}
                            >
                                <div class="flex items-center gap-3 mb-2">
                                    {/* Status indicator */}
                                    <div
                                        class="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ background: statusColor }}
                                    />
                                    {/* Server name */}
                                    <span class={`font-bold text-sm ${isSelected ? 'text-blue-500' : 'text-white'}`}>
                                        {server.displayName || server.name}
                                    </span>
                                    {/* Type badge */}
                                    <span
                                        class={`px-2 py-0.5 text-xs rounded ${
                                            server.type === 'local' ? 'bg-gray-700' : 'bg-blue-900'
                                        } text-gray-300`}
                                    >
                                        {server.type}
                                    </span>
                                    {/* Status text */}
                                    <span class="text-xs ml-auto" style={{ color: statusColor }}>
                                        {server.status}
                                    </span>
                                </div>
                                {/* Server details */}
                                <div class="flex flex-col gap-1 pl-5">
                                    {server.configPath && (
                                        <div class="text-[11px] text-gray-500">
                                            <span class="text-gray-600">Config:</span> {server.configPath}
                                        </div>
                                    )}
                                    {server.command && (
                                        <div class="text-[11px] text-gray-500">
                                            <span class="text-gray-600">Command:</span> {server.command}
                                            {server.args && server.args.length > 0 && ` ${server.args.join(' ')}`}
                                        </div>
                                    )}
                                    {server.toolsCount !== undefined && (
                                        <div class="text-[11px] text-gray-500">
                                            <span class="text-gray-600">Tools:</span> {server.toolsCount}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div class="mt-3 p-2 bg-[#3d3d3d] rounded text-[11px] text-gray-500 text-center">
                    ↑↓ Navigate • Enter Select • Esc Close
                </div>
            </div>
        );
    }
}
