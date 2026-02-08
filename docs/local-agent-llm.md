# Local Agent LLM 可选增强说明

## 1. 启用与关闭

编辑 `apps/local-agent/.env.local`（可由 `.env.example` 复制）：

```bash
# 关闭（默认）
LLM_PROVIDER=none
LLM_API_KEY=
```

```bash
# 开启 OpenAI 增强
LLM_PROVIDER=openai
LLM_API_KEY=your_key
LLM_MODEL=gpt-4o-mini
```

```bash
# 开启 Anthropic 增强
LLM_PROVIDER=anthropic
LLM_API_KEY=your_key
LLM_MODEL=claude-3-5-sonnet-latest
```

重启本地服务：

```bash
pnpm --filter @vibesui/local-agent dev
```

## 2. 安全规则（固定）

- LLM 只做自然语言解析：`text -> {intent, slots}`
- `intent` 仅允许：`PAY | REDEEM | CLAIM | STATUS | HELP`
- `slots` 必须类型合法且来源可验证（显式输入或上下文）
- 任一校验不通过：自动回退规则引擎
- LLM 绝不直接生成交易，不直接决定金额/地址

## 3. 可测试用例

> 统一调用接口：`POST http://127.0.0.1:3777/agent/parse`

### 用例 A：帮我打开这个发票并支付

```bash
curl -X POST http://127.0.0.1:3777/agent/parse ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"帮我打开这个发票并支付\",\"context\":{\"invoiceId\":\"0x1234abcd5678ef90\",\"url\":\"http://localhost:5173/#/pay/0x1234abcd5678ef90\"}}"
```

预期：
- `intent = PAY`
- `slots` 中允许出现 `invoiceId/url`（来自上下文）

### 用例 B：把我 BrandUSD 全部赎回（T+1）

```bash
curl -X POST http://127.0.0.1:3777/agent/parse ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"把我 BrandUSD 全部赎回（T+1）\",\"context\":{\"stableCoinType\":\"0x2::sui::SUI\"}}"
```

预期：
- `intent = REDEEM`
- `slots.all = true`

### 用例 C：查一下这笔 digest 状态

```bash
curl -X POST http://127.0.0.1:3777/agent/parse ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"查一下这笔 digest 状态\",\"context\":{\"digest\":\"8kG...exampleDigest...9f\"}}"
```

预期：
- `intent = STATUS`
- `slots.digest` 允许来自上下文


