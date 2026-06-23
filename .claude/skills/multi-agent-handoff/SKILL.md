---
name: multi-agent-handoff
description: Coordinate scoped handoffs between Codex, Claude Code, Google Antigravity, Google AI Studio, or another coding agent in a shared repository.
---
# Multi Agent Handoff

Use this skill when Claude Code coordinates with Codex, Google Antigravity, Google AI Studio, or another coding agent in this repository, especially for handoffs, MCP-mediated review, or resumed work.


## Entry Point Rule

There is no fixed lead agent. The agent that receives the user request becomes the temporary orchestrator for that task. It may call the other agent through MCP for a scoped review, implementation, comparison, or verification step, then returns the consolidated result to the user.
## Procedure

1. Read `CLAUDE.md`, `AGENTS.md`, and `AI_WORKFLOW.md` before making changes.
2. Identify the active role: writer, reviewer, explorer, or verifier.
3. Confirm that only one agent is writing to the active branch or file set.
4. Before edits, inspect current git status and relevant files.
5. Keep changes scoped to the current task and avoid unrelated refactors.
6. Run the verification commands listed in `AGENTS.md` when the changed surface makes them relevant.
7. End with a handoff note if another agent or session should continue.

## Handoff Format

English and Italian handoff labels are equivalent; keep the content complete even if the field labels differ.

```text
Objective:
Branch/worktree:
Files changed:
Commands run:
Verification:
Decisions:
Open risks:
Requested next step:
```

## Constraints

- Do not create automatic Claude -> Codex -> Claude loops.
- Do not expose secrets through MCP, prompts, commits, logs, or skill files.
- Do not force-push `main`.
- Do not let multiple agents write the same files at the same time.
