# @vibesui/agent (Rule-Driven Agent Engine)

This package is responsible for converting natural language inputs into structured action suggestions for frontend execution.

## Main Responsibilities

- Parse user input and page context
- Identify intents (PAY / REDEEM / CLAIM / STATUS / HELP)
- Output step lists and suggested actions
- Optional LLM enhancement mode (default off)
- Provide local automation capabilities (Local Automation Planner / Guard / Runner)

## Development Commands

```bash
pnpm --filter @vibesui/agent dev
pnpm --filter @vibesui/agent build
pnpm --filter @vibesui/agent test
```

## Design Principles

- Default rules have priority to ensure controllability and explainability
- Transaction execution permissions are always controlled by frontend wallet signature
- Structured output results for direct UI rendering
- Local automation prioritizes "Plan Generation + Risk Guard" before execution
