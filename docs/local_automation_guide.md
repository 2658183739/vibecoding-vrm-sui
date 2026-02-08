# Local Automation Module Guide

## Goal

Introduce an independent local automation capability line while retaining the existing `stable-layer-sdk` + `@mysten/sui` transaction main link:

- Generate Task Plan first
- Then perform Risk Guard Check
- Finally Execute (Supports Dry Run)

This capability is used for long-term open-source evolution, independent of the competition context.

## Architecture

### 1. Agent Side (`packages/agent/src/local-automation.ts`)

- `LocalAutomationPlanner`: Converts natural language goals into structured plans (steps)
- `LocalAutomationGuard`: Validates plan risks and command whitelists
- `InMemoryLocalAutomationRunner`: Executes plans (Currently defaults to simulation)
- `localAutomationToMarkdown`: Outputs auditable Markdown reports

### 2. Web Side (`apps/web/src/lib/localAutomation.ts`)

- Responsible for calling planner / guard / runner
- Manages local history records (`localStorage`)
- Supports exporting Markdown audit logs

### 3. UI Page (`apps/web/src/pages/AutomationPage.tsx`)

- Route: `#/automation`
- Input task goals and execution strategies
- Display guard results, execution results, history, and export buttons

## Usage

1. Open `#/automation`
2. Input task goal, e.g., "Organize Downloads and output report"
3. Configure whitelist command prefixes (e.g., `node,git,ffmpeg,tar,pnpm`)
4. Click "Generate Plan"
5. Check Guard Results
6. Click "Execute Plan"
7. Export Markdown

## Security Boundaries

- Shell steps not in command whitelist will be blocked
- High-risk steps require approval by default
- Network-bound steps (`git/browser`) blocked when `allowNetwork=false`
- Dry Run mode enabled by default to prevent accidental operations

## Future Iteration Suggestions

1. Connect runner to real local executor (with permission isolation)
2. Add task rollback strategies
3. Add signed audit logs (Local hash chain or on-chain anchoring)
4. Link with Agent interaction actions (Direct execution after plan generation)
