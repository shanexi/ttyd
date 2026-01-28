// Slash Menu Parser - Extract commands from terminal output

import type { SlashCommand } from './index';

/**
 * Parse slash command menu
 * Format: "/command Description"
 * Selection: ❯ or › indicates selected command
 */
export function parseSlashMenu(content: string): { commands: SlashCommand[]; selectedIndex: number } {
    const commands: SlashCommand[] = [];
    const lines = content.split('\n');
    let selectedIndex = 0;

    for (const line of lines) {
        const isSelected = line.match(/^[❯›]/);
        const cleanLine = line.replace(/^[❯›]\s*/, '').trim();
        const match = cleanLine.match(/^\s*(\/?[a-z-]+)\s+(.+)$/);

        if (match) {
            const [, rawCommand, description] = match;
            let command = rawCommand;
            if (!command.startsWith('/')) {
                command = '/' + command;
            }

            if (isSelected) {
                selectedIndex = commands.length;
            }

            commands.push({
                command: command.trim(),
                description: description.trim(),
            });
        }
    }

    return { commands, selectedIndex };
}
