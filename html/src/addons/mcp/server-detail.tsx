// MCP Server Detail View
// Shows detailed information about a selected MCP server

import { Component, h } from 'preact';
import type { MCPServer } from './index';

interface Props {
    server: MCPServer;
}

export class MCPServerDetail extends Component<Props> {
    render({ server }: Props) {
        // Status color mapping
        const statusColor = server.status === 'connected' ? '#4CAF50' : server.status === 'error' ? '#f44336' : '#888';

        // Status display text
        const statusText =
            server.status === 'connected' ? '🟢 Connected' : server.status === 'error' ? '🔴 Error' : '⚫ Disabled';

        return (
            <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 max-w-[900px] max-h-[80vh] bg-[#2d2d2d] border-2 border-red-500 rounded-lg p-5 z-[1000] font-mono overflow-auto">
                {/* Header */}
                <div class="mb-5 pb-4 border-b border-gray-700">
                    <div class="flex items-center gap-3 mb-2">
                        <span class="text-2xl font-bold text-blue-500">{server.displayName || server.name}</span>
                        <span
                            class={`px-2 py-1 text-xs rounded text-white ${
                                server.type === 'local' ? 'bg-gray-700' : 'bg-blue-900'
                            }`}
                        >
                            {server.type}
                        </span>
                    </div>
                    <div class="flex items-center gap-2 text-sm">
                        <span style={{ color: statusColor }}>{statusText}</span>
                    </div>
                </div>

                {/* Configuration Section */}
                <div class="mb-5">
                    <h3 class="text-blue-500 text-base mb-3 font-bold">Configuration</h3>
                    <div class="bg-[#252525] p-3 rounded-md text-xs">
                        {server.configPath && (
                            <div class="mb-2">
                                <span class="text-gray-500">Config Path: </span>
                                <span class="text-white">{server.configPath}</span>
                            </div>
                        )}
                        {server.command && (
                            <div class="mb-2">
                                <span class="text-gray-500">Command: </span>
                                <span class="text-white">{server.command}</span>
                            </div>
                        )}
                        {server.args && server.args.length > 0 && (
                            <div>
                                <span class="text-gray-500">Arguments: </span>
                                <span class="text-white">{server.args.join(' ')}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Capabilities Section */}
                {server.capabilities && server.capabilities.length > 0 && (
                    <div class="mb-5">
                        <h3 class="text-blue-500 text-base mb-3 font-bold">Capabilities</h3>
                        <div class="flex gap-2 flex-wrap">
                            {server.capabilities.map(cap => (
                                <span key={cap} class="px-3 py-1.5 bg-blue-900 text-white text-xs rounded">
                                    {cap}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tools Section */}
                {server.toolsCount !== undefined && server.toolsCount > 0 && (
                    <div class="mb-5">
                        <h3 class="text-blue-500 text-base mb-3 font-bold">Tools ({server.toolsCount})</h3>
                        <div class="bg-[#252525] p-3 rounded-md text-xs text-gray-500 italic">
                            Tool list will be available when server detail API is implemented
                        </div>
                    </div>
                )}

                {/* Actions Section */}
                {server.actions && server.actions.length > 0 && (
                    <div class="mb-5">
                        <h3 class="text-blue-500 text-base mb-3 font-bold">Actions</h3>
                        <div class="flex flex-col gap-2">
                            {server.actions.map((action, i) => {
                                const isSelected = i === server.selectedActionIndex;
                                return (
                                    <div
                                        key={action.label}
                                        class={`p-2 rounded cursor-pointer ${
                                            isSelected
                                                ? 'bg-[#3d3d3d] border border-blue-500'
                                                : 'bg-[#2a2a2a] border border-gray-700'
                                        }`}
                                    >
                                        <span class={isSelected ? 'text-blue-500' : 'text-white'}>
                                            {isSelected ? '❯ ' : '  '}
                                            {action.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Help Text */}
                <div class="mt-5 pt-4 border-t border-gray-700 text-center text-xs text-gray-500">Esc Back to List</div>
            </div>
        );
    }
}
