# Deep Interview Spec: jarvis-cockpit Autopilot

## Metadata

- Profile: quick
- Context type: brownfield
- Final ambiguity: 0.18
- Threshold: 0.30
- Context snapshot: `.omx/context/jarvis-cockpit-autopilot-20260630T201802Z.md`
- Plan source: `.omx/plans/t3-phase7-agentic-cockpit-plan.md`

## Intent

Turn the T3 Code fork into `jarvis-cockpit`, the operator UI for Jarvis-managed engineering work.

## Desired Outcome

The fork should expose Jarvis runs, worker sessions, timelines, approvals/input, start-work, and control workflows while preserving Jarvis as the source of truth.

## In Scope

- Jarvis connector/client layer in the T3 server.
- Typed Jarvis contracts and fixtures where live APIs are incomplete.
- Read-only run/session dashboard.
- Session detail timeline over canonical Jarvis `SessionEvent[]`.
- Input and approval controls.
- Start work wizard.
- Interrupt, stop, resume, and send-turn controls.
- Browser verification with `agent-browser` and dogfood evidence for operator workflows.

## Out Of Scope

- Replacing Jarvis orchestration.
- T3-native durable project model for Jarvis-managed work.
- Direct T3 spawning of Codex/Claude for Jarvis-managed work.
- UI-only final authority decisions.
- Guessing missing Jarvis contracts.

## Decision Boundaries

Codex may choose local implementation mechanics in the fork when they are consistent with existing T3 patterns.

Codex must pause and provide a missing-spec packet for any missing or unstable Jarvis-side interface, event, field, command, or authority decision.

Missing-spec packets must include:

1. Blocker title.
2. Missing interface or requirement.
3. Why it blocks the T3 fork.
4. Proposed contract shape or options.
5. Exact files/workflows waiting on it.
6. Temporary fixture/mock recommendation, if safe.
7. Acceptance checks the other agent should satisfy.

## Constraints

- Use Volta-pinned `node 24.13.1` and `pnpm 10.24.0`.
- Validate with typecheck/lint/build/tests proportional to the change.
- After each meaningful change group, verify changed browser workflows with `agent-browser`.
- Use `dogfood` for operator workflow changes.
- Preserve the pairing smoke lessons from the Phase 7 plan.

## Testable Acceptance Criteria

Primary criteria are the twelve acceptance criteria in `.omx/plans/t3-phase7-agentic-cockpit-plan.md`.

Additional acceptance criteria:

- The first runnable slices can be demonstrated in the local fork.
- Browser smoke evidence is captured under `/Users/neilbarton/Development/jarvis-cockpit/dogfood-output/`.
- Blockers produce missing-spec packets instead of guessed contracts.

## Brownfield Evidence

- T3 has existing orchestration projections, shell/thread streams, command schemas, pending approval/user-input UI, and timeline rendering that can be reused.
- Jarvis has worker-session APIs and append-only session events, but aggregate run APIs may be incomplete.
- The local fork builds and runs.
