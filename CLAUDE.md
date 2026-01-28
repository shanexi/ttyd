# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ttyd is a web-based terminal sharing tool that runs a terminal over WebSocket. It consists of:
- **Backend (C)**: WebSocket server using libwebsockets + libuv, PTY management
- **Frontend (TypeScript/Preact)**: Terminal UI using xterm.js with custom overlays

## Build Commands

### Backend (C)
```bash
# Build from scratch
mkdir -p build && cd build
cmake ..
make

# Install
sudo make install

# Cross-compile (see scripts/cross-build.sh)
BUILD_TARGET=arm ./scripts/cross-build.sh
```

### Frontend (TypeScript/Preact)
```bash
cd html

# Development server (port 9000, proxies to ttyd on 7681)
yarn start

# Production build (generates html.h for embedding)
yarn build

# Linting
yarn run check  # Check for issues
yarn run fix    # Auto-fix issues

# Just inline HTML (without rebuilding)
yarn inline
```

### Full Production Build
```bash
cd html
yarn build  # This runs webpack, then gulp to generate src/html.h
cd ../build
make        # Recompile backend with new html.h
```

## Architecture

### Backend (C) - WebSocket Protocol

**Key files**:
- `src/server.c` - Main server logic, libuv event loop
- `src/protocol.c` - WebSocket protocol handlers, PTY I/O
- `src/pty.c` - PTY process management
- `src/http.c` - HTTP handlers
- `src/html.h` - **Generated** from frontend build (gzipped HTML)

**Message protocol** (defined in `src/server.h`):
- Client → Server: `INPUT ('0')`, `RESIZE_TERMINAL ('1')`, `PAUSE ('2')`, `RESUME ('3')`, `JSON_DATA ('{')
- Server → Client: `OUTPUT ('0')`, `SET_WINDOW_TITLE ('1')`, `SET_PREFERENCES ('2')`

**Dependencies**: libwebsockets (with libuv support), libuv, json-c, zlib, OpenSSL/mbedtls

### Frontend (TypeScript/Preact) - Custom UI Architecture

**Entry point**: `html/src/index.tsx` → `App` component → `Terminal` component

**Key architecture pattern**: The frontend has **custom UI overlays** that intercept and replace certain terminal outputs:

#### MCP Dialog ANSI-Driven System
Located in `html/src/components/terminal/xterm/index.ts` (`writeData()` and `analyzeBuffer()` methods):

```
Terminal Output Flow:
WebSocket → writeData() → ANSI Detection → analyzeBuffer() → Parse → UI Update

Data Flow:
1. writeData() detects MCP dialog markers in ANSI output
2. Schedules analyzeBuffer() to extract content from terminal buffer
3. Parser extracts structured data (servers, selection index)
4. Callback updates React state with parsed data
5. React renders custom UI overlay (semi-transparent, shows native output below)
```

**Text detection markers**:
- Dialog/Detail: `"Manage MCP servers"`, `" MCP Server"` + (`"Status:"` or `"Command:"`)
- Completion: `"esc to cancel"` or `"↑↓ to navigate"`
- Dismissal: `"MCP dialog dismissed"`

**Key principle**: Native terminal output is NOT suppressed. Custom UI is a semi-transparent overlay (`rgba(30, 30, 30, 0.85)`) that allows native output to show through.

#### UI State Inference
No explicit state manager. UI type is inferred from data shape in render():
- `MCPServer[]` → Server list overlay
- `MCPServer` (single) → Server detail overlay
- `SlashCommandType[]` → Slash command dropdown (future)
- `null` → Normal terminal view

**Navigation**: All keys forwarded to backend via `sendKeyToBackend()` for shadow sync

#### Shadow Sync Pattern
When user presses navigation keys (Arrow/Enter/Escape) in custom UI:
1. Frontend: Forward key to backend via `sendKeyToBackend(key)`
2. Backend: Updates native dialog state and outputs new ANSI
3. Frontend: Detects ANSI, parses new state, updates UI

Implementation: `xterm/index.ts` → `sendKeyToBackend(key)` maps keys to terminal sequences and sends binary payload `[INPUT, sequence]`

Example: Escape key → `\x1b` → Backend outputs "MCP dialog dismissed" → Frontend sets `uiData = null` → UI disappears

#### Parser System
`html/src/addons/mcp/parser.ts` - Parses terminal output (ANSI-stripped) into structured data:
- `parseMCPDialog()` - Extracts server list from native dialog text
- `parseMCPServerDetail()` - Parses individual server information

**Fragility**: Relies on specific text patterns. If backend changes output format, parsers break.

### Component Hierarchy
```
App (app.tsx)
└── Terminal (terminal/index.tsx) - Minimal React container
    └── Xterm (terminal/xterm/index.ts) - xterm.js wrapper + addon loader
        ├── CustomInputAddon (addons/custom-input/index.ts)
        │   └── InputBox component (renders in fixed overlay)
        ├── MCPAddon (addons/mcp/index.ts)
        │   ├── MCPServerList (addons/mcp/server-list.tsx)
        │   └── MCPServerDetail (addons/mcp/server-detail.tsx)
        └── SlashMenuAddon (addons/slash-menu/index.ts)
            └── SlashDropdown (addons/slash-menu/dropdown.tsx)
```

### Build Pipeline (Frontend)
```
1. webpack (webpack.config.js)
   - TypeScript → JavaScript
   - SCSS → CSS
   - Output: dist/index.html + assets

2. gulp inline (gulpfile.js)
   - Inline all CSS/JS into HTML
   - Output: dist/inline.html

3. gulp default (gulpfile.js)
   - Gzip dist/inline.html
   - Convert to C header array
   - Output: src/html.h (embedded in binary)
```

## Development Workflow

### Running Development Environment
```bash
# Terminal 1: Run ttyd backend
cd build
./ttyd bash

# Terminal 2: Run frontend dev server
cd html
yarn start

# Open browser: http://localhost:9000
# Frontend proxies WebSocket to backend on 7681
```

### Making Frontend Changes
1. Edit files in `html/src/`
2. Webpack dev server hot-reloads automatically
3. For production: `yarn build` to regenerate `src/html.h`, then rebuild backend

### Making Backend Changes
1. Edit files in `src/`
2. Rebuild: `cd build && make`
3. Run: `./ttyd bash`

## Testing

**CI Workflows**:
- `.github/workflows/backend.yml` - Cross-compilation for multiple architectures
- `.github/workflows/frontend.yml` - Runs `yarn check` and `yarn build`

**Unit Tests**:
- `yarn test` - Run vitest tests
- Parser tests: `src/addons/mcp/parser.test.ts` (14 tests for MCP dialog parsing)
- More addon parser tests should follow the same pattern

## Architecture Refactoring: UIStateManager → Pure ANSI-Driven

### Background

Initial implementation used a stack-based `UIStateManager` class that maintained explicit UI states (`normal`, `slash_menu`, `mcp_server_list`, etc.) in frontend JavaScript. This created dual sources of truth: UI state in the state manager AND the actual terminal state in Claude Code backend.

### Problems with Original Approach

1. **Dual State Management**: Frontend maintained its own UI state independent of backend
2. **Synchronization Complexity**: Required manual coordination between frontend state and backend terminal state
3. **State Stack Overhead**: Used history stack for navigation that duplicated backend's native navigation
4. **Unnecessary Abstraction**: `UIStateManager` was an extra layer when backend already manages state

### Refactored Architecture (Pure ANSI-Driven)

**Core Principle**: All UI state is derived from ANSI output parsing, not managed locally.

```typescript
// Before: Explicit state enum
interface State {
    uiState: 'normal' | 'slash_menu' | 'mcp_server_list' | 'mcp_server_detail';
    uiData: unknown;
}

// After: Inferred from data type
interface State {
    uiData: MCPServer[] | MCPServer | SlashCommandType[] | null;
}

// UI type inference in render():
const isServerList = Array.isArray(uiData) && 'status' in uiData[0];
const isServerDetail = !Array.isArray(uiData) && uiData && 'status' in uiData;
const isSlashMenu = Array.isArray(uiData) && 'command' in uiData[0];
```

### Data Flow

**Shadow Sync Pattern** (user interaction → backend → ANSI → UI update):

1. User presses arrow/enter/escape keys
2. Frontend forwards key to backend via `sendKeyToBackend(key)`
3. Backend updates native Claude Code dialog
4. Backend outputs new ANSI with updated state (e.g., selection markers `❯`)
5. Frontend `writeData()` detects ANSI patterns → triggers `analyzeBuffer()`
6. Parser extracts structured data from ANSI (including `selectedIndex` from `❯` markers)
7. Callback updates React state: `setState({ uiData: parsedData })`
8. React re-renders custom UI to match backend state

**Key insight**: Frontend never maintains selection index locally. It always comes from parsing backend ANSI output.

### Implementation Details

#### 1. Detection and Triggering

```typescript
// xterm/index.ts - writeData()
const text = typeof data === 'string' ? data : this.textDecoder.decode(data);

// Detect MCP dialog triggers
if (text.includes('Manage MCP servers') ||
    text.includes(' MCP Server') ||
    text.includes('MCP dialog dismissed')) {
    // Schedule buffer analysis
    setTimeout(() => this.analyzeBuffer(), 100);
}
```

#### 2. Buffer Analysis and Parsing

```typescript
// analyzeBuffer() - Extract content from terminal buffer
private analyzeBuffer() {
    const buffer = this.terminal.buffer.active;

    // Check for dismissal first
    if (text.includes('MCP dialog dismissed')) {
        this.onMcpDialogDetected(text);
        return;
    }

    // Find dialog completion marker
    const isDialogComplete = text.includes('esc to cancel');
    if (isDialogComplete) {
        // Collect full dialog content
        const dialogLines = this.collectDialogLines(buffer, lineIndex);
        this.onMcpDialogDetected(dialogLines.join('\n'));
    }
}
```

#### 3. Parser Extracts State

```typescript
// mcp-parser.ts
export function parseMCPDialog(content: string): {
    servers: MCPServer[];
    selectedIndex: number
} {
    // Parse selection from ❯ marker in ANSI output
    const isSelected = line.match(/^[❯›]/);
    if (isSelected) {
        selectedIndex = servers.length;
    }
    return { servers, selectedIndex };
}
```

#### 4. React State Update

```typescript
// Terminal component
this.xterm.onMcpDialogDetected = (content: string) => {
    const { servers, selectedIndex } = parseMCPDialog(stripped);
    this.setState({
        uiData: servers,      // Data determines UI type
        selectedIndex,        // From backend, not local
    });
};
```

### Key Design Decisions

1. **No Local State Management**: Removed `UIStateManager` class entirely
2. **Type-Based UI Inference**: Render logic infers UI from `uiData` shape instead of explicit state enum
3. **Single Source of Truth**: Backend (Claude Code) is authoritative, frontend just reflects
4. **Accept UI Latency**: Small delay between keypress and UI update is acceptable tradeoff for simpler architecture
5. **Unified Key Forwarding**: Single `sendKeyToBackend()` method handles all navigation keys

### Benefits

- **Simpler Mental Model**: "Backend controls everything, we just display it"
- **Less Code**: Removed entire `UIStateManager` class and related complexity
- **Better Sync**: Impossible for frontend state to diverge from backend
- **Easier Debugging**: Single data flow path to trace
- **Future-Proof**: Adding new UI types (slash menu, etc.) follows same pattern

### Common Pitfalls

1. **Detection Timing**: Must use `setTimeout(() => analyzeBuffer(), 100)` to ensure terminal buffer is fully written
2. **Dismissal Detection**: Remember to add dismissal text patterns to detection triggers
3. **Parser Robustness**: Text-based parsing is brittle - be defensive with regex and fallbacks
4. **Box Drawing Characters**: Must strip (e.g., `│╭╮╯╰─`) before parsing
5. **@bind Decorator**: Required for methods passed to setTimeout/callbacks

### Testing Strategy

Since tests are manual, verify:
1. Open dialog → see custom UI with correct data
2. Arrow up/down → UI selection updates to match backend
3. Press Enter → transitions to detail view
4. Press Escape → UI dismisses (check both dialog and dismissal message)
5. Check console logs for ANSI detection and parsing

## Important Notes

### Custom UI Maintenance Considerations
The custom MCP UI overlay system (see `IMPLEMENTATION.md`) has known technical debt:
- Text pattern matching is brittle (breaks if backend changes output)
- Dual detection logic exists but only text matching is active
- Multi-layer state synchronization (xterm state + UI state + state manager)
- Shadow sync required for Escape key (frontend + backend coordination)

**Before modifying UI overlay logic**:
1. Read `IMPLEMENTATION.md` for full context
2. Be aware that suppression happens in `writeData()`, not in terminal buffer
3. Test both frontend state changes AND backend synchronization

### File Modification Patterns
- Frontend HTML is generated - edit `html/src/template.html`, not `dist/index.html`
- `src/html.h` is generated - don't edit directly, rebuild frontend instead
- Keep ANSI parsing logic in sync with actual terminal output format
- **Addon Architecture**: All UI overlays and custom features are implemented as xterm.js addons in `html/src/addons/`
- **Test Data**: Parser test data is hardcoded in `*.test.ts` files (see Issue 016 for future recording workflow)

### Addon File Structure
```
html/src/addons/
├── custom-input/
│   └── index.ts           # Custom input box addon (self-contained UI + state)
├── mcp/
│   ├── index.ts           # MCP dialog detection + overlay rendering
│   ├── parser.ts          # Parse ANSI output → structured data
│   ├── parser.test.ts     # Parser unit tests (14 tests)
│   ├── server-list.tsx    # Server list UI component
│   └── server-detail.tsx  # Server detail UI component
└── slash-menu/
    ├── index.ts           # Slash command detection + dropdown
    ├── parser.ts          # Parse slash menu output
    └── dropdown.tsx       # Dropdown UI component
```

### Cross-Platform Support
Backend supports: macOS, Linux, FreeBSD/OpenBSD, OpenWrt, Windows
Frontend targets: Modern browsers with WebGL2 support

## Key Dependencies

**Backend**: libwebsockets ≥3.2.0 (with LWS_WITH_LIBUV=ON), libuv, json-c, zlib
**Frontend**: @xterm/xterm 5.x, Preact 10.x, TypeScript 5.x, Webpack 5.x
