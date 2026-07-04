# Jarvis Cockpit Project Docs

This directory records the Phase 7 fork plan for turning this T3 Code fork into
`jarvis-cockpit`, the operator UI for Jarvis-managed engineering work.

Jarvis remains the orchestration source of truth. The cockpit reads Jarvis
`OrchestrationRun`, `WorkerSession`, `SessionEvent`, worker registry, health, and
artifact data, then posts operator actions back to Jarvis. The fork must not
spawn Codex or Claude directly for Jarvis-managed work, and it must not create a
second durable project model.

## Current Build

- [Current state and end goal](./jarvis-cockpit-current-state-and-end-goal.md):
  live capabilities, known gaps, run commands, and the target product shape.
- [Progress log](./jarvis-cockpit-phase7-progress.md): what this branch has
  implemented and verified so far.
- [Phase 7 plan](./jarvis-cockpit-phase7-plan.md): full implementation plan for
  adapting T3 into the Jarvis cockpit.
- [Phase 7 PRD](./jarvis-cockpit-phase7-prd.md): product requirements,
  acceptance criteria, boundaries, and RALPLAN decision record.
- [Phase 7 test spec](./jarvis-cockpit-phase7-test-spec.md): required
  contract, server, web, browser, and dogfood verification.
- [Deep-interview spec](./jarvis-cockpit-phase7-deep-interview-spec.md):
  original scope, constraints, and missing-spec packet rules.
- [Worker-session pivot](./agentic-worker-session-pivot.md): Jarvis-side pivot
  from one-shot jobs to live durable provider sessions.
- [Onboarding pivot](./jarvis-cockpit-onboarding-pivot-plan.md): product and
  implementation plan for replacing upstream local-project onboarding with a
  Jarvis-first `Start work` flow.

## Contract Reference

- [Jarvis worker sessions API](../reference/jarvis-worker-sessions-api.md):
  worker-session resources, endpoints, event types, and UI integration notes
  copied from the current Jarvis worker-sessions branch.
- [Jarvis fleet deployment](https://github.com/roughcoder/jarvis/blob/main/docs/FLEET.md):
  upstream fleet roles, development vs installed mode, service supervision,
  `jarvis fleet-status --json`, and network binding expectations for real
  brain/worker/intercom deployments.

## Implemented In This Branch

The current implementation is no longer read-only. It includes the read
projection foundation plus a working live start-work path:

- shared Jarvis contracts and fixtures;
- server-side Jarvis client and fixture mode;
- projection from Jarvis runs, sessions, and events into T3 shell/thread models;
- HTTP and WebSocket read-path integration;
- guardrails so Jarvis-managed thread ids do not trigger native T3 branch sync;
- Jarvis write dispatch for start, turn, approval, input, interrupt, stop,
  archive, checkpoint restore, and resume paths;
- a Jarvis-first `Start work -> Describe work` UI path;
- a synthetic `Start Jarvis work` anchor for zero-run and terminal-run states;
- compatibility with the current live Jarvis v1 projection values;
- verification and dogfood summary in the progress log.

The next slices should expose the full catalog-driven start-work wizard, proxy
Jarvis SSE events through the server-side auth boundary, and add richer
approval/input/control and artifact/evidence surfaces.
Any missing Jarvis-side contract should be handled as a missing-spec packet, not
guessed inside the UI.
