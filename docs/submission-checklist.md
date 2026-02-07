# 评审提交检查清单

本清单用于提交前逐项对照比赛硬性要求。

## 1）项目开始时间（>= 2026-01-27）

- 在公开仓库提供可验证提交历史
- 建议命令：

```bash
git log --reverse --format=%aI | head -1
```

- 确保首个提交时间不早于 `2026-01-27`

## 2）Move 版本要求（2024）

- 检查 `packages/move/Move.toml`：
  - `edition = "2024.beta"`
- 本地验证：

```bash
pnpm move:build
pnpm move:test
```

## 3）官方 Sui SDK（最新）

- 项目统一使用官方 `@mysten/sui`
- 如三方依赖仍使用旧导入符号，通过兼容层处理，不在业务代码继续扩散旧 API

## 4）可运行产品与线上可访问地址

- 本地可运行：

```bash
pnpm install
pnpm dev
```

- 必须提供线上可访问 dApp URL（评委可打开）
- 建议目标地址（GitHub Pages）：`https://2658183739.github.io/vibecoding-vrm-sui/`
- 必须提供核心功能演示（视频或现场演示）

## 5）开源要求

公开仓库必须至少包含：
- `packages/move`（合约）
- `apps/web`（前端核心逻辑）
- `packages/agent`（Agent 核心逻辑）
- 根 README（部署与运行说明）

## 6）AI 使用披露（强制）

必须提供：
- 工具与模型版本：`ai-disclosure/tools.md`
- 精确 prompt 记录：`ai-disclosure/prompts/*.md`
- 敏感信息必须打码（如 `sk-***`）

## 7）最终提交包建议

- 仓库地址（公开）
- 线上访问地址
- 演示视频链接
- 关键交易截图（含 digest 与 Explorer）
- AI 披露文件路径说明
