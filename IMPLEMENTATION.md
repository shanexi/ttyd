# Core + Plugin 架构说明

**最后更新**: 2026-01-28
**状态**: ✅ 已完成重构

---

## 🆕 最近更新 (2026-01-28)

### CustomInputAddon 完全自包含
- ✅ 将 custom input 逻辑从 Terminal 组件完全移入 CustomInputAddon
- ✅ Addon 自己创建并管理 InputBox UI（使用 preact render）
- ✅ Addon 自己管理状态（inputValue）
- ✅ Addon 自己处理所有事件（input, keydown, submit）
- ✅ 使用 `position: fixed` 固定在底部，避免布局问题

### Terminal 组件简化
- ❌ 删除了容器尺寸检查和布局等待逻辑
- ❌ 删除了所有 custom input 相关的 state 和 ref
- ❌ 删除了 WebGL 渲染器加载后的终端刷新逻辑
- ✅ 只保留最小功能：容器 + Zmodem 文件上传弹窗

### MCP Parser 测试
- ✅ 添加了 vitest 测试框架
- ✅ 创建了 14 个 parser 单元测试（`src/addons/mcp/parser.test.ts`）
- ✅ 修复了 MCP Server List 检测 bug（空行处理问题）

---

## 🎯 架构概览

ttyd 前端采用 **Core + Plugin** 架构，核心组件保持简洁，所有功能通过独立的 xterm.js addon 插件实现。

### 设计原则

1. **关注点分离**: Core 只负责基础功能，Plugin 封装具体特性
2. **自包含插件**: 每个插件完全自管理（UI、状态、事件、清理）
3. **零依赖回调**: 插件不依赖外部状态或回调，直接操作 DOM
4. **标准接口**: 所有插件实现 xterm.js 的 `ITerminalAddon` 接口

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│  Terminal (React Component)                              │
│  └── Xterm (Core)                                       │
│       ├── terminal.loadAddon(customInputAddon)    ←─────┼─ 插件加载
│       ├── terminal.loadAddon(mcpAddon)                  │
│       └── terminal.loadAddon(slashMenuAddon)            │
└─────────────────────────────────────────────────────────┘
                           │
                           ├─────────────────────┐
                           ▼                     ▼
              ┌────────────────────┐   ┌────────────────────┐
              │  MCPAddon          │   │  SlashMenuAddon    │
              ├────────────────────┤   ├────────────────────┤
              │ • 扫描 buffer       │   │ • 扫描 buffer       │
              │ • 检测特征          │   │ • 检测特征          │
              │ • 解析数据          │   │ • 解析数据          │
              │ • 创建 overlay      │   │ • 创建 overlay      │
              │ • render() UI       │   │ • render() UI       │
              │ • 清理资源          │   │ • 清理资源          │
              └────────────────────┘   └────────────────────┘
```

---

## 📦 Core 层

### 1. Terminal Component (`html/src/components/terminal/index.tsx`)

**职责**: 最小化的 React 容器组件

```typescript
class Terminal extends Component {
    state: State = {
        modal: false,  // Zmodem file upload dialog
    };

    render() {
        return (
            <div ref={c => this.container = c}>
                {/* Addons render overlays here */}
                <Modal show={modal}>
                    {/* Zmodem file upload */}
                </Modal>
            </div>
        );
    }

    async componentDidMount() {
        await this.xterm.refreshToken();
        this.xterm.open(this.container);
        this.xterm.connect();
    }
}
```

**只做的事**:
1. 提供 DOM 容器给 xterm
2. 管理 Zmodem 文件上传弹窗

**不做的事**:
- ❌ 不管理 MCP/Slash menu 状态
- ❌ 不渲染 MCP/Slash menu UI
- ❌ 不处理 MCP/Slash menu 事件
- ❌ 不管理 custom input (已移到 CustomInputAddon)

### 2. Xterm Core (`html/src/components/terminal/xterm/index.ts`)

**职责**: xterm.js 包装器，负责 addon 生命周期管理

```typescript
class Xterm {
    // Built-in addons
    private fitAddon = new FitAddon();
    private overlayAddon = new OverlayAddon();
    private clipboardAddon = new ClipboardAddon();
    private webLinksAddon = new WebLinksAddon();

    // Custom addons
    private customInputAddon = new CustomInputAddon();
    private mcpAddon = new MCPAddon();
    private slashMenuAddon = new SlashMenuAddon();

    // Conditional addons (loaded dynamically)
    private webglAddon?: WebglAddon;
    private canvasAddon?: CanvasAddon;
    private zmodemAddon?: ZmodemAddon;

    open(parent: HTMLElement) {
        const terminal = new Terminal(this.options.termOptions);

        // Load addons in order
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(overlayAddon);
        terminal.loadAddon(clipboardAddon);
        terminal.loadAddon(webLinksAddon);
        terminal.loadAddon(this.customInputAddon);
        terminal.loadAddon(this.mcpAddon);
        terminal.loadAddon(this.slashMenuAddon);

        terminal.open(parent);
        fitAddon.fit();
    }
}
```

**加载顺序重要性**:
1. **基础 addons 先加载** - fitAddon, overlayAddon 等
2. **功能 addons 后加载** - customInputAddon, mcpAddon, slashMenuAddon
3. **条件 addons 动态加载** - 根据配置和环境加载渲染器、Zmodem 等

**只做的事**:
1. 初始化 terminal
2. 按顺序加载 addons
3. WebSocket 通信管理
4. 处理渲染器切换 (DOM → Canvas → WebGL)

**不做的事**:
- ❌ 不包含功能特定的逻辑（MCP、Slash menu）
- ❌ 不创建 overlay 容器（由 addons 自己创建）
- ❌ 不管理 UI 状态（由 addons 自己管理）

---

## 🔌 Plugin 层

### 插件接口

所有插件必须实现 xterm.js 的 `ITerminalAddon` 接口：

```typescript
interface ITerminalAddon {
    activate(terminal: Terminal): void;
    dispose(): void;
}
```

### 插件生命周期

```
1. 构造 (constructor)
   ↓
2. 激活 (activate) ← terminal.loadAddon() 时调用
   ├─ 获取 terminal 实例
   ├─ 创建 DOM 容器
   ├─ 注册事件监听
   └─ 初始化状态
   ↓
3. 运行 (runtime)
   ├─ 扫描 buffer
   ├─ 检测特征
   ├─ 渲染 UI
   └─ 处理事件
   ↓
4. 销毁 (dispose) ← terminal.dispose() 时调用
   ├─ 清理 DOM
   ├─ 移除监听器
   └─ 释放资源
```

### 插件加载顺序

**在 `Xterm.open()` 中按顺序加载**:

```typescript
// 1. 基础功能 addons（xterm.js 官方）
terminal.loadAddon(fitAddon);           // 自适应尺寸
terminal.loadAddon(overlayAddon);       // 覆盖层显示
terminal.loadAddon(clipboardAddon);     // 剪贴板支持
terminal.loadAddon(webLinksAddon);      // URL 链接检测

// 2. 自定义功能 addons
terminal.loadAddon(customInputAddon);   // 自定义输入框
terminal.loadAddon(mcpAddon);           // MCP 对话框
terminal.loadAddon(slashMenuAddon);     // Slash 命令菜单

// 3. 条件加载 addons（根据配置动态加载）
if (enableZmodem) {
    terminal.loadAddon(zmodemAddon);    // 文件传输
}
if (enableImages) {
    terminal.loadAddon(imageAddon);     // 图片显示
}
if (enableUnicode11) {
    terminal.loadAddon(unicode11Addon); // Unicode 11 支持
}

// 4. 渲染器 addons（按优先级加载）
// WebGL > Canvas > DOM (默认)
switch (rendererType) {
    case 'webgl':
        terminal.loadAddon(webglAddon);
        break;
    case 'canvas':
        terminal.loadAddon(canvasAddon);
        break;
}
```

**重要提示**:
- ⚠️ 加载顺序很重要：基础 addons 必须先加载
- ⚠️ CustomInputAddon 必须在 MCP/SlashMenu 之前加载（它禁用 xterm 按键捕获）
- ⚠️ 渲染器 addons 最后加载（可能需要替换默认渲染器）

---

## 🧩 现有插件详解

### 1. MCPAddon

**功能**: 检测 MCP 服务器列表/详情，渲染自定义 UI 覆盖原生输出

**文件**: `html/src/addons/mcp/index.ts`

**实现细节**:

```typescript
export class MCPAddon implements ITerminalAddon {
    private _terminal?: Terminal;
    private _overlayContainer?: HTMLElement;

    activate(terminal: Terminal): void {
        this._terminal = terminal;

        // 延迟获取 DOM 容器（等 terminal.open() 完成）
        setTimeout(() => {
            const container = terminal.element.parentElement;

            // 创建自己的 overlay 容器
            this._overlayContainer = document.createElement('div');
            this._overlayContainer.style.cssText = `
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                z-index: 100;
            `;
            container.appendChild(this._overlayContainer);
        }, 100);

        // 监听终端输出
        terminal.onWriteParsed(() => {
            this._scanForMCPDialog();
        });
    }

    private _scanForMCPDialog(): void {
        const buffer = this._terminal.buffer.active;

        // 扫描可见区域
        for (let y = startY; y < endY; y++) {
            const line = buffer.getLine(y);
            const text = this._getLineText(line);

            // 检测特征
            if (text.includes('Manage MCP servers')) {
                // 收集完整内容
                const content = this._collectDialogContent(y);

                // 解析数据
                const { servers, selectedIndex } = parseMCPDialog(content);

                // 渲染 UI
                this._renderServerList(servers, selectedIndex);
            }
        }
    }

    private _renderServerList(servers, selectedIndex): void {
        // 使用 preact render() 渲染 React 组件
        render(
            h(MCPServerList, { servers, selectedIndex }),
            this._overlayContainer
        );
    }

    dispose(): void {
        // 清理 UI
        if (this._overlayContainer) {
            render(null, this._overlayContainer);
            this._overlayContainer.remove();
        }
    }
}
```

**关键特性**:
- ✅ 自己创建 overlay 容器
- ✅ 自己管理 UI 渲染
- ✅ 自己清理资源
- ✅ 零外部依赖

**检测机制**:
- 文本特征: `"Manage MCP servers"` (Server List), `" MCP Server"` (Detail)
- 完成标记: `"esc to cancel"`, `"↑↓ to navigate"`
- 关闭标记: `"MCP dialog dismissed"`

**UI 技术栈**:
- Preact `render()` + React 组件
- Tailwind CSS

---

### 2. SlashMenuAddon

**功能**: 检测 slash 命令菜单，渲染下拉列表

**文件**: `html/src/addons/slash-menu/index.ts`

**实现细节**:

```typescript
export class SlashMenuAddon implements ITerminalAddon {
    private _overlayContainer?: HTMLElement;

    activate(terminal: Terminal): void {
        // 创建 overlay 容器（在底部）
        this._overlayContainer = document.createElement('div');
        this._overlayContainer.style.cssText = `
            position: absolute;
            bottom: 0;  /* 在 custom input 上方 */
            left: 0; right: 0;
            pointer-events: none;
            z-index: 100;
        `;

        // 监听终端输出
        terminal.onWriteParsed(() => {
            this._scanForSlashMenu();
        });
    }

    private _scanForSlashMenu(): void {
        // 查找连续的 slash 命令块（至少 3 个命令）
        let consecutiveCommands = [];

        for (let y = startY; y < endY; y++) {
            const text = this._getLineText(buffer.getLine(y));

            // 检测 slash 命令: /command description
            if (text.match(/^\s*[❯›]?\s*\/[a-z-]+\s+/)) {
                // 检测蓝色高亮 → selectedIndex
                const isSelected = this._isLineBlueHighlighted(line);
                consecutiveCommands.push({ text, isSelected });
            }
        }

        // 至少 3 个命令才渲染菜单
        if (consecutiveCommands.length >= 3) {
            const { commands } = parseSlashMenu(content);
            const selectedIndex = consecutiveCommands.findIndex(c => c.isSelected);

            this._renderSlashMenu(commands, selectedIndex);
        } else {
            this._clearOverlay();  // 没有检测到，清理 UI
        }
    }

    private _isLineBlueHighlighted(line: IBufferLine): boolean {
        // 检测 ANSI 蓝色前景色（fg=4, fg=12, RGB 蓝色）
        for (let x = 0; x < line.length; x++) {
            const cell = line.getCell(x);
            const fg = cell.getFgColor();

            if (fg === 4 || fg === 12 || fg === 0x5555ff) {
                return true;
            }
        }
        return false;
    }
}
```

**关键特性**:
- ✅ 检测连续命令块（避免误检历史命令）
- ✅ 通过 ANSI 颜色检测选中状态
- ✅ 自动显示/隐藏 UI

**检测机制**:
- 文本特征: 连续 3+ 行匹配 `/[a-z-]+ description`
- 选中检测: ANSI 蓝色前景色 (fg=4, 12)
- 自动清理: 不再检测到时清除 UI

---

### 3. CustomInputAddon

**功能**: 自定义输入框（完全自包含，包括 UI + 状态 + 事件处理）

**文件**: `html/src/addons/custom-input/index.ts`

**实现细节**:

```typescript
export class CustomInputAddon implements ITerminalAddon {
    private _terminal?: Terminal;
    private _terminalContainer?: HTMLElement;
    private _inputContainer?: HTMLElement;
    private _inputElement?: HTMLTextAreaElement;
    private _inputValue = '';
    private _socket?: WebSocket;

    activate(terminal: Terminal): void {
        this._terminal = terminal;

        // 禁用 xterm 按键捕获（当 custom input 获得焦点时）
        terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
            if (this._inputElement &&
                document.activeElement === this._inputElement) {
                return false;  // 不让 xterm 处理
            }
            return true;  // 让 xterm 正常处理
        });

        // 延迟获取容器并渲染 UI
        setTimeout(() => {
            this._terminalContainer = terminal.element.parentElement;
            this._inputContainer = document.createElement('div');
            this._terminalContainer.appendChild(this._inputContainer);
            this._renderInputBox();
        }, 100);
    }

    private _renderInputBox(): void {
        // 使用 preact render() 渲染 InputBox 组件
        render(
            h(InputBox, {
                value: this._inputValue,
                onInput: (value) => this._handleInput(value),
                onSubmit: () => this._handleSubmit(),
                inputRef: (el) => { this._inputElement = el; }
            }),
            this._inputContainer
        );
    }

    private _handleInput(value: string): void {
        // Shadow sync - 增量发送字符
        if (value.length > this._inputValue.length) {
            const newChars = value.slice(this._inputValue.length);
            this._sendData(newChars);
        } else if (value.length < this._inputValue.length) {
            this._sendData('\x7f'); // Backspace
        }
        this._inputValue = value;
        this._renderInputBox();
    }

    setSocket(socket: WebSocket): void {
        this._socket = socket;
    }

    dispose(): void {
        if (this._inputContainer) {
            render(null, this._inputContainer);
            this._inputContainer.remove();
        }
    }
}
```

**InputBox 组件** (在 addon 内部定义):
```typescript
class InputBox extends Component<InputBoxProps> {
    render({ value, inputRef }: InputBoxProps) {
        return h('div', {
            class: 'fixed bottom-0 left-0 right-0 p-2 bg-[#1e1e1e] z-10'
        },
            h('textarea', {
                ref: inputRef,
                value: value,
                onInput: this.handleInput,
                onKeyDown: this.handleKeyDown,
                class: 'w-full min-h-[60px] ...',
            })
        );
    }
}
```

**关键特性**:
- ✅ 自己创建 UI（textarea + 容器）
- ✅ 自己管理状态（inputValue）
- ✅ 自己处理事件（input, keydown, submit）
- ✅ Shadow sync（增量发送字符到后端）
- ✅ 使用 `position: fixed` 固定在底部
- ✅ 完全自包含，零外部依赖

---

## 🔄 数据流

### MCP Dialog 数据流

```
后端输出 ANSI
    ↓
xterm.write(data)
    ↓
terminal.onWriteParsed() 触发
    ↓
MCPAddon._scanForMCPDialog()
    ├─ 扫描 buffer
    ├─ 检测 "Manage MCP servers"
    ├─ 收集完整内容
    └─ parseMCPDialog(content)
           ↓
      { servers, selectedIndex }
           ↓
      render(h(MCPServerList, {...}), overlay)
           ↓
      用户看到自定义 UI
```

### Slash Menu 数据流

```
用户在 custom input 输入 "/"
    ↓
Terminal.handleInput() 发送到后端 (shadow sync)
    ↓
后端输出 slash 命令列表 (ANSI)
    ↓
terminal.onWriteParsed() 触发
    ↓
SlashMenuAddon._scanForSlashMenu()
    ├─ 扫描 buffer
    ├─ 检测连续命令块
    ├─ 检测蓝色高亮 (selectedIndex)
    └─ parseSlashMenu(content)
           ↓
      { commands, selectedIndex }
           ↓
      render(h(SlashDropdown, {...}), overlay)
           ↓
      用户看到命令菜单

用户按上/下箭头
    ↓
customInputAddon.sendKeyToBackend('ArrowUp')
    ↓
后端更新选中状态，输出新 ANSI
    ↓
SlashMenuAddon 检测新的 selectedIndex
    ↓
UI 自动更新
```

---

## 🏗️ 如何创建新插件

### 步骤 1: 创建插件类

```typescript
// html/src/lib/my-feature-addon.ts
import { Terminal, ITerminalAddon } from '@xterm/xterm';
import { render, h } from 'preact';
import { MyFeatureUI } from '../components/my-feature-ui';

export class MyFeatureAddon implements ITerminalAddon {
    private _terminal?: Terminal;
    private _overlayContainer?: HTMLElement;

    activate(terminal: Terminal): void {
        this._terminal = terminal;

        // 1. 创建 overlay 容器
        setTimeout(() => {
            const container = terminal.element.parentElement;
            this._overlayContainer = document.createElement('div');
            this._overlayContainer.style.cssText = `
                position: absolute;
                /* 根据需要定位 */
                pointer-events: none;
                z-index: 100;
            `;
            container.appendChild(this._overlayContainer);
        }, 100);

        // 2. 监听终端输出
        terminal.onWriteParsed(() => {
            this._detect();
        });
    }

    private _detect(): void {
        const buffer = this._terminal.buffer.active;

        // 3. 扫描 buffer，检测特征
        for (let y = startY; y < endY; y++) {
            const line = buffer.getLine(y);
            const text = this._getLineText(line);

            if (text.includes('MY_FEATURE_MARKER')) {
                // 4. 解析数据
                const data = this._parseData(text);

                // 5. 渲染 UI
                this._renderUI(data);
            }
        }
    }

    private _renderUI(data: any): void {
        render(
            h(MyFeatureUI, { data }),
            this._overlayContainer
        );
    }

    dispose(): void {
        // 6. 清理资源
        if (this._overlayContainer) {
            render(null, this._overlayContainer);
            this._overlayContainer.remove();
        }
    }
}
```

### 步骤 2: 注册插件

```typescript
// html/src/components/terminal/xterm/index.ts
import { MyFeatureAddon } from '../../../lib/my-feature-addon';

export class Xterm {
    private myFeatureAddon = new MyFeatureAddon();

    open(parent: HTMLElement) {
        terminal.loadAddon(this.myFeatureAddon);
    }
}
```

### 步骤 3: 创建 UI 组件

```typescript
// html/src/components/my-feature-ui.tsx
import { Component, h } from 'preact';

export class MyFeatureUI extends Component<{ data: any }> {
    render({ data }) {
        return (
            <div class="fixed top-1/2 left-1/2 ...">
                {/* 使用 Tailwind CSS */}
            </div>
        );
    }
}
```

---

## 📋 插件开发规范

### 必须做的事 (MUST)

1. ✅ **实现 `ITerminalAddon` 接口**
   ```typescript
   class MyAddon implements ITerminalAddon {
       activate(terminal: Terminal): void { }
       dispose(): void { }
   }
   ```

2. ✅ **自己创建 overlay 容器**
   ```typescript
   this._overlayContainer = document.createElement('div');
   container.appendChild(this._overlayContainer);
   ```

3. ✅ **清理资源**
   ```typescript
   dispose(): void {
       render(null, this._overlayContainer);
       this._overlayContainer.remove();
   }
   ```

4. ✅ **错误处理**
   ```typescript
   try {
       this._detect();
   } catch (error) {
       console.error('[MyAddon] Error:', error);
       this._clearUI();  // fallback 到原生终端
   }
   ```

### 不要做的事 (MUST NOT)

1. ❌ **不要修改 Core**
   - 不要在 `Xterm` 类中添加功能逻辑
   - 不要在 `Terminal` 组件中添加状态

2. ❌ **不要依赖回调**
   ```typescript
   // ❌ 错误
   class BadAddon {
       public onDetected?: (data) => void;
   }

   // ✅ 正确
   class GoodAddon {
       private _render(data): void {
           render(h(UI, { data }), this._overlay);
       }
   }
   ```

3. ❌ **不要依赖外部状态**
   ```typescript
   // ❌ 错误
   class BadAddon {
       constructor(private appState: AppState) { }
   }

   // ✅ 正确
   class GoodAddon {
       private _state: LocalState = {};
   }
   ```

### 最佳实践

1. **使用节流 (Throttling)**
   ```typescript
   terminal.onWriteParsed(() => {
       if (this._timeout) clearTimeout(this._timeout);
       this._timeout = setTimeout(() => this._scan(), 50);
   });
   ```

2. **延迟获取 DOM 容器**
   ```typescript
   activate(terminal: Terminal): void {
       setTimeout(() => {
           this._container = terminal.element.parentElement;
       }, 100);
   }
   ```

3. **使用 try-catch 保护**
   ```typescript
   private _scan(): void {
       try {
           this._scanImpl();
       } catch (error) {
           console.error('[Addon] Error:', error);
           this._fallbackToNative();
       }
   }
   ```

4. **提供 fallback**
   ```typescript
   if (data.length === 0) {
       console.warn('[Addon] Parsing failed, clearing UI');
       this._clearOverlay();  // 用户可以看到原生输出
   }
   ```

---

## 🆚 对比：重构前 vs 重构后

### Terminal Component

| 重构前 | 重构后 |
|--------|--------|
| State: 4 个字段 | State: 1 个字段 |
| `slashCommands`, `slashSelectedIndex` | ❌ 删除（移到 addon） |
| `inputValue`, `inputRef` | ❌ 删除（移到 CustomInputAddon） |
| 渲染 `<SlashDropdown>` | ❌ 删除（addon 自己渲染） |
| 渲染 `<textarea>` | ❌ 删除（CustomInputAddon 自己渲染） |
| `onSlashMenuDetected` 回调 | ❌ 删除（addon 直接渲染） |
| `selectSlashCommand()` 方法 | ❌ 删除 |
| `handleInput()`, `handleKeyDown()` | ❌ 删除（移到 CustomInputAddon） |
| `componentDidMount()` 容器检查 | ✅ 简化（删除了布局等待逻辑） |
| 200+ 行代码 | ~80 行代码 |

### Xterm Core

| 重构前 | 重构后 |
|--------|--------|
| `onSlashMenuDetected` setter | ❌ 删除 |
| 回调桥接逻辑 | ❌ 删除 |
| `customInputElement` 属性 | ✅ 移到 CustomInputAddon |
| `sendKeyToBackend()` 方法 | ✅ 移到 CustomInputAddon |
| 30+ 行 slash menu 代码 | 0 行 |

### Addon 对比

| 功能 | 重构前 | 重构后 |
|------|--------|--------|
| **MCP** | ❌ 通过回调 → Terminal 渲染 | ✅ 自管理 UI |
| **Slash Menu** | ❌ 通过回调 → Terminal 渲染 | ✅ 自管理 UI |
| **Custom Input** | ❌ 代码在 xterm/index.ts | ✅ 独立 addon |

---

## 📊 架构优势

### 1. 关注点分离

**问题**: 重构前，Terminal 组件既管理基础 UI，又管理 MCP/Slash menu 状态和渲染

**解决**: 每个功能封装在独立插件中

```
重构前:
Terminal = 基础 UI + MCP 逻辑 + Slash menu 逻辑 + ...

重构后:
Terminal = 基础 UI
MCPAddon = MCP 逻辑
SlashMenuAddon = Slash menu 逻辑
```

### 2. 可维护性

**新增功能**:
```bash
# 重构前: 需要修改多个文件
Terminal.tsx        # 添加状态
xterm/index.ts      # 添加检测逻辑
NewFeatureUI.tsx    # 添加 UI 组件

# 重构后: 只需一个文件
new-feature-addon.ts  # 包含所有逻辑
```

**修改功能**:
```bash
# 重构前: 影响范围大
Terminal.tsx        # 修改状态管理
xterm/index.ts      # 修改检测逻辑
UI 组件              # 修改渲染

# 重构后: 影响范围小
mcp-addon.ts        # 只修改这一个文件
```

### 3. 可测试性

```typescript
// 重构前: 需要 mount 整个 Terminal 组件
const wrapper = mount(<Terminal {...props} />);

// 重构后: 直接测试 addon
const addon = new MCPAddon();
const mockTerminal = createMockTerminal();
addon.activate(mockTerminal);
```

### 4. 可扩展性

添加新功能（如图片预览、文件拖拽）只需：
1. 创建新 addon 文件
2. 在 `xterm/index.ts` 中加载
3. 零影响现有代码

### 5. 代码复用

Addon 可以在不同项目中复用：
```typescript
// 其他 xterm.js 项目也可以使用
terminal.loadAddon(new MCPAddon());
```

---

## 🚀 未来扩展

### 可插拔功能

使用这套架构，可以轻松添加：

1. **图片预览 Addon**
   - 检测图片路径输出
   - 渲染图片预览浮层

2. **代码高亮 Addon**
   - 检测代码块标记
   - 使用 Decoration API 添加语法高亮

3. **链接预览 Addon**
   - 检测 URL
   - Hover 显示预览卡片

4. **执行进度 Addon**
   - 检测进度输出
   - 渲染进度条

### 动态加载

可以实现插件的动态加载/卸载：

```typescript
class PluginManager {
    private plugins = new Map<string, ITerminalAddon>();

    loadPlugin(name: string, addon: ITerminalAddon) {
        this.terminal.loadAddon(addon);
        this.plugins.set(name, addon);
    }

    unloadPlugin(name: string) {
        const addon = this.plugins.get(name);
        addon?.dispose();
        this.plugins.delete(name);
    }
}
```

---

## 📝 总结

### 核心价值

1. **Clean Core**: Terminal 和 Xterm 保持简洁，只负责基础功能
2. **Self-contained Plugins**: 每个插件完全自管理，零外部依赖
3. **Easy to Extend**: 添加新功能只需创建新 addon
4. **Easy to Test**: 插件可以独立测试
5. **Easy to Maintain**: 修改一个功能只影响一个文件

### 技术栈

- **Core**: React (Preact) + xterm.js
- **Plugins**: ITerminalAddon + Preact render()
- **UI**: React Components + Tailwind CSS
- **Detection**: Buffer scanning + ANSI parsing

### 文件结构

```
html/src/
├── components/
│   ├── terminal/
│   │   ├── index.tsx           # Terminal 组件 (Core)
│   │   └── xterm/
│   │       ├── index.ts        # Xterm 类 (Core + addon loader)
│   │       └── addons/
│   │           ├── overlay.ts  # 内置 overlay addon
│   │           └── zmodem.ts   # Zmodem 文件传输
│   ├── app.tsx                 # App 根组件
│   └── modal/
│       └── modal.tsx           # Zmodem 文件选择弹窗
├── addons/
│   ├── custom-input/
│   │   └── index.ts            # Custom input 插件 (完全自包含)
│   ├── mcp/
│   │   ├── index.ts            # MCP 插件
│   │   ├── parser.ts           # MCP 解析器
│   │   ├── parser.test.ts      # Parser 单元测试
│   │   ├── server-list.tsx     # Server list UI 组件
│   │   └── server-detail.tsx   # Server detail UI 组件
│   └── slash-menu/
│       ├── index.ts            # Slash menu 插件
│       ├── parser.ts           # Slash menu 解析器
│       └── dropdown.tsx        # Dropdown UI 组件
├── style/
│   ├── index.scss              # 全局样式
│   └── tailwind.css            # Tailwind 入口
└── index.tsx                   # 应用入口
```

---

**下一步**: 可以考虑将插件抽取到独立的 npm 包，供其他 xterm.js 项目使用。
