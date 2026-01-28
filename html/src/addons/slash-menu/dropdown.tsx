// Slash Command Dropdown Component
// Displays slash commands detected by SlashMenuAddon (buffer scanning)
// UI rendered by React, data from addon

import { Component, h } from 'preact';
import type { SlashCommand } from './index';

interface Props {
    commands: SlashCommand[];
    selectedIndex: number;
    onSelect?: (command: SlashCommand) => void;
    inputValue?: string;
}

export class SlashDropdown extends Component<Props> {
    render({ commands, selectedIndex }: Props) {
        if (commands.length === 0) {
            return null;
        }

        return (
            <div class="fixed bottom-20 left-5 right-5 max-h-96 bg-[#2d2d2d] border-2 border-red-500 rounded-lg p-3 z-[1000] overflow-auto font-mono">
                {commands.map((cmd, i) => (
                    <div
                        key={cmd.command}
                        class={`py-2 px-3 cursor-pointer rounded mb-1 flex gap-5 ${
                            i === selectedIndex ? 'bg-gray-700 text-blue-500' : 'bg-transparent text-white'
                        }`}
                    >
                        <span class={`font-bold ${i === selectedIndex ? 'text-blue-500' : 'text-gray-500'}`}>
                            {cmd.command}
                        </span>
                        <span class="text-gray-500">{cmd.description}</span>
                    </div>
                ))}
            </div>
        );
    }
}
