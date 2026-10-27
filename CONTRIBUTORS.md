# 贡献者

这个象棋插件由维护者与 DeepSeek、Codex 协作完成。

| 贡献者 | 参与内容 |
| --- | --- |
| [Galaxy-2001](https://github.com/Galaxy-2001) | 项目发起与维护、玩法需求、实际体验反馈和发布决策。 |
| [DeepSeek](https://www.deepseek.com/)（AI 开发助手） | 在 DSH 中协助完成象棋插件的初版开发。 |
| [Codex](https://github.com/codex)（AI 开发助手） | 发布前代码审查、会话与异步状态修复、回归测试、打包文档及宣传视频制作。 |

这里记录的是实际协作贡献，不表示本项目由 DeepSeek 或 OpenAI 官方发布或背书。

## 提交署名

Codex 协助完成的提交使用已核实的共同作者信息：

```text
Co-authored-by: Codex <noreply@openai.com>
```

DeepSeek 已列入本文件、README 和 package.json 的贡献者信息，初始提交也保留
`AI-Contributor: DeepSeek` 署名。

2026-10-27 核查时，社区的
[共同作者插件](https://github.com/shelken/dsh-co-authored-by/blob/94f2083df65d0e1f0ecc1be79a16c6daa576bf59/src/config.ts)
使用 `noreply@deepseek.com`，公开提交中也有
[`deepseek-harness@users.noreply.github.com`](https://github.com/Lewiscowles1986/note-taking-app/commit/a1e812c1f0b49de64eadcc890ee5981a4a4b03ab)
的用例。但通过 GitHub API 核对这两种邮箱的共同作者记录时，`user` 都为 `null`，
尚未确认它们对应 DSH / DeepSeek 官方 GitHub 账号。因此保留上述贡献说明，
不保证 GitHub 自动贡献者统计会显示 DeepSeek。

GitHub 的账户关联规则见
[共同作者文档](https://docs.github.com/en/pull-requests/how-tos/commit-changes/creating-a-commit-with-multiple-authors)。
