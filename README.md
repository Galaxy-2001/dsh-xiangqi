# 中国象棋（dsh-xiangqi）

在 DeepSeek Harness 里跟模型下一盘中国象棋：你执红方点棋盘走子；模型执黑方，
被你叫醒后调用 `xiangqi` 工具应招。

项目维护：[Galaxy-2001](https://github.com/Galaxy-2001) · AI 协作贡献：
[DeepSeek](https://www.deepseek.com/) 与 [Codex](https://github.com/codex)。
具体分工和提交署名见 [贡献者](CONTRIBUTORS.md)。

## 安装与验证环境

需要先安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，
并配置可以正常对话、调用工具的模型。本插件没有额外的运行时 npm 依赖。

当前验证环境为 Windows 桌面端 DSH **0.2.1-rc.3**。0.1.0 已实测开局、双方走棋、
对话应招与悔棋；0.1.1 的状态修复已通过自动化回归测试，完整桌面回归仍待进行。
其他 DSH 版本、macOS 和 Linux 尚未实际验证。

从 [v0.1.1 发布页](https://github.com/Galaxy-2001/dsh-xiangqi/releases/tag/v0.1.1)
下载 `dsh-xiangqi-0.1.1.tgz`，在它所在的目录执行：

```powershell
dsh plugin --profile desktop add ./dsh-xiangqi-0.1.1.tgz
```

Web 版将 `desktop` 替换为 `web`。回到 DSH 的「插件」页面启用中国象棋；
若界面提示重启或刷新，按提示操作。DSH 的命令转发入口已用本机 `dsh plugin --help`
核对；首次干净环境安装尚未实际验证。

从源码开发和打包：

```powershell
npm run check
npm test
npm pack
```

`npm pack` 会先运行语法检查和测试。`private: true` 仅防止误发到 npm 公共仓库，
不影响生成 `.tgz` 或通过 GitHub 分发源码。测试使用 Node.js 内置模块，无需安装测试框架。

## 入口与位置

- **左侧栏**：「插件 / 插件市场 / 自动化任务」那一排下面多一个棋子图标「中国象棋」。
- 点左侧栏图标后：主区域短暂切到象棋页，随后**自动回到对话**，并把棋盘放进
  **右侧栏**常驻（右栏 tab 关闭后，可在象棋页点「右侧栏常驻」重新打开）。
- 主区域的大棋盘页面也可直接使用（底部有「右侧栏常驻」「返回对话」按钮）。

## 使用

1. 安装并启用插件后刷新 Harness 页面，加载 Client 代码。
2. 点左侧栏的棋子图标 → 右栏出现「中国象棋」棋盘。
3. 点 **开始对局**（会在对话里告诉模型新开了一盘）。
4. 点选自己的红棋，再点目标交叉点落子。
5. 每走一步，这步会作为一条用户消息送进当前对话并唤醒模型，模型用
   `xiangqi` 工具查看局面、走黑棋；棋盘轮询到新状态后自动刷新。
6. 支持 **悔棋**（回到自己上一次走棋之前）、**重新开局** / **认输** / **提醒对手**（模型没反应时）。
   - 悔棋会撤到"轮到你走"的局面：如果刚走完一步就悔，撤 2 手（对方 + 你）；如果对手正在思考就悔，撤 1 手。

## 模型侧工具

工具 `xiangqi`，参数：

| 参数 | 说明 |
| --- | --- |
| `action` | `status`（默认，看局面 + 合法走法）、`move`、`new`、`resign` |
| `from` / `to` | `move` 时的起终点坐标，如 `h0`、`h2` |
| `reason` | 认输 / 重开的简短原因（可选） |

坐标约定：列 `a-i` 从左到右（红方视角），行 `0-9` 从下到上，`0` 是红方底线。
`status` 会直接给出模型当前的**全部合法走法**（形如 `h0h2`），方便模型挑选。

## 文件

| 文件 | 作用 |
| --- | --- |
| `engine.js` | 象棋规则引擎：走法生成、自将过滤、将帅照面、将军 / 将死 / 困毙判定、文本盘面 |
| `index.js` | Host 半：`xiangqi` 工具、`/plugins/dsh-xiangqi/*` HTTP RPC、唤醒模型（`agent.followup`） |
| `client.js` | Client 半：左侧栏入口、主区域棋盘页、右侧栏常驻棋盘 |
| `test-engine.mjs` | 规则引擎自检：`node test-engine.mjs` |
| `test-client-state.mjs` | 会话切换、响应乱序和重复请求的隔离回归测试 |

## HTTP 接口

| 路径 | 说明 |
| --- | --- |
| `GET /plugins/dsh-xiangqi/state?sessionId=` | 读当前会话棋局与合法走法 |
| `POST /plugins/dsh-xiangqi/move` | 用户落子（body: sessionId/from/to），成功后唤醒模型 |
| `POST /plugins/dsh-xiangqi/new` | 开新局（`announce:false` 可不打扰模型） |
| `POST /plugins/dsh-xiangqi/undo` | 悔棋，回到轮红方的局面 |
| `POST /plugins/dsh-xiangqi/resign` | 用户认输 |
| `POST /plugins/dsh-xiangqi/nudge` | 提醒模型走棋 |
| `GET/POST /plugins/dsh-xiangqi/diag` | 前端「打开右栏」流程的诊断上报（最近 40 条），排查 UI 用 |

## 说明

- 棋局按会话保存在 `~/.dsh/xiangqi/games.json`，插件重载或重启 DSH 后自动恢复；
  每手落子都会写入存档，悔棋栈也会一起保存。
- 用户走棋的消息以 `source.kind = "user"` 投递，因此会显示为对话里的普通
  用户消息；模型可见、可重建。
- 规则引擎是纯函数、无依赖；Host/Client 两侧都不依赖 Harness 内部包。
- 右侧栏是「会话作用域」的：点左侧栏入口时必须先切回对话再打开右栏，否则
  右栏拿不到当前会话（这就是之前按钮没反应的原因）。

## 当前范围

- 适用于本机单用户的 DSH 对话。HTTP 接口只接收回环地址请求，并校验 Host / Origin。
- 与 AI 的对弈会使用当前会话的模型调用；费用和响应时间取决于模型配置。
- 规则引擎覆盖基本走法、自将过滤、将帅照面、将军、将死和困毙；尚未实现重复局面、
  长将长捉等竞赛裁判规则，也没有棋钟或内置专业象棋搜索引擎。
- 棋局保存在用户的 DSH 数据目录，源码仓库和插件包不包含棋局、聊天记录或账号配置。
- 前端状态回归使用可控异步请求和轻量 hooks 测试环境，不等同于完整 DSH 界面测试。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
