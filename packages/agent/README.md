# @vibesui/agent（规则驱动 Agent 引擎）

该包负责把自然语言输入转换为结构化操作建议，供前端执行。

## 主要职责

- 解析用户输入与页面上下文
- 识别意图（PAY / REDEEM / CLAIM / STATUS / HELP）
- 输出步骤列表与建议动作
- 可选接入 LLM 增强模式（默认关闭）

## 开发命令

```bash
pnpm --filter @vibesui/agent dev
pnpm --filter @vibesui/agent build
pnpm --filter @vibesui/agent test
```

## 设计原则

- 默认规则优先，保证可控性与可解释性
- 交易执行权限始终由前端钱包签名控制
- 结果结构化输出，方便 UI 直接渲染
