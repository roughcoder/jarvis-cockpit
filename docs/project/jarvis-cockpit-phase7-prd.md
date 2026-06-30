# PRD: Jarvis Cockpit Phase 7

Status: ralplan draft
Date: 2026-06-30
Context: `.omx/specs/deep-interview-jarvis-cockpit-autopilot.md`
Source plan: `.omx/plans/t3-phase7-agentic-cockpit-plan.md`

## Requirements Summary

Adapt the T3 Code fork at `/Users/neilbarton/Development/jarvis-cockpit` into `jarvis-cockpit`, an operator UI for Jarvis-managed engineering work. Jarvis owns orchestration state; the T3 fork provides projection, controls, and operator workflows.

First executable slice:

1. Add typed Jarvis wire contracts and fixtures in the T3 fork.
2. Add server-side Jarvis configuration and a connector/client abstraction.
3. Add fixture-backed read-only projection mapping from Jarvis runs/sessions/events into T3-visible project/thread/timeline shapes.
4. Add enough web surface to see Jarvis runs/sessions and open a timeline without spawning provider runtimes.
5. Add command-bridge scaffolding and tests proving Jarvis-backed work routes to Jarvis, not `ProviderService`.
6. Verify in browser with `agent-browser` and capture evidence.

## RALPLAN-DR Summary

### Principles

- Jarvis is source of truth.
- T3 is an operator projection and control surface, not a competing orchestrator.
- Typed contracts precede UI assumptions.
- Missing Jarvis interfaces become explicit blocker packets, not guessed behavior.
- Browser evidence is part of each meaningful delivery slice.

### Decision Drivers

- Preserve T3's existing orchestration/thread UI shape where possible.
- Keep the fork useful before all Jarvis aggregate APIs are complete.
- Avoid direct provider runtime spawning for Jarvis-backed work.

### Viable Options

Option A: Map Jarvis into T3's existing orchestration projection.

- Pros: reuses shell/thread streams, timeline, pending input/approval UI, and command flow.
- Cons: requires careful guardrails so projected Jarvis state does not become a second durable T3 model.

Option B: Build a separate Jarvis dashboard inside T3.

- Pros: lower coupling to T3 internals in the first UI slice.
- Cons: duplicates navigation, selection, timeline, pending controls, state sync, and command plumbing.

Decision: Option A. Reject Option B because it creates parallel UI state and makes later command/timeline integration harder.

## Acceptance Criteria

- `JARVIS_COCKPIT_ENABLED` can be off without changing existing T3 behavior.
- Jarvis server token remains server-side only.
- Fixture data can render at least one run with multiple worker sessions.
- Session events render in stable chronological order.
- Unknown Jarvis event types render as neutral activity rows, not crashes.
- Pending approval and input states are represented in projection state.
- Jarvis-backed command tests assert `ProviderService` is not called.
- Native T3 sessions still route through current provider behavior.
- Local dev smoke passes through the pairing flow using `agent-browser`.
- Any missing live Jarvis endpoint produces a missing-spec packet before implementation guesses a contract.

## Implementation Steps

1. Contracts and fixtures:
   - Add `packages/contracts/src/jarvis.ts`.
   - Export it from `packages/contracts/src/index.ts`.
   - Add decode tests for fixture snapshots, event pages, malformed events, and opaque provider payloads.

2. Server config and connector:
   - Add server-only Jarvis config fields for enabled mode, base URL, token, and fixture mode.
   - Add `apps/server/src/jarvis/JarvisClient.ts` with HTTP and fixture implementations.
   - Add typed error mapping for auth/not-found/server failures.

3. Projection mapping:
   - Add `JarvisProjectionMapper` and `JarvisSessionEventMapper`.
   - Map `OrchestrationRun` to T3 project/thread shell shapes.
   - Map `WorkerSession` to T3 session/thread identifiers.
   - Map `SessionEvent[]` to timeline/detail rows or neutral activity rows where no richer type exists.

4. Shell/detail integration:
   - Add `JarvisProjectionService` or equivalent layer that can feed existing shell/thread subscriptions.
   - Keep projection read-through and ephemeral.
   - Add a degraded/unreachable Jarvis state.

5. Command bridge scaffold:
   - Add `JarvisCommandBridge`.
   - Route Jarvis-backed turn/input/approval/interrupt/stop/resume commands to Jarvis client.
   - Add tests that native T3 sessions keep existing provider behavior.

6. Web surface:
   - Reuse existing project/thread navigation where practical.
   - Add Jarvis-specific empty/error/loading states only where existing UI is insufficient.
   - Add a first Start Work wizard only after the read-only projection is working.

7. Verification:
   - Run targeted tests after each slice.
   - Run `pnpm typecheck`, `pnpm lint`, and relevant tests before handoff.
   - Run `agent-browser` smoke after UI changes.
   - Run `dogfood` for dashboard/timeline/start/control workflows.

## Risks And Mitigations

- Risk: live Jarvis aggregate APIs are incomplete.
  Mitigation: fixture client plus missing-spec packets for exact absent contracts.

- Risk: T3 accidentally becomes authority.
  Mitigation: read-through projection, Jarvis ID provenance, command bridge tests, no UI-only final decisions.

- Risk: existing provider flow is hard to bypass safely.
  Mitigation: add narrow Jarvis-backed detection and tests before broad command routing.

- Risk: browser auth pairing wastes time.
  Mitigation: follow the local smoke protocol in the Phase 7 plan exactly.

## Event Compatibility Rule

Wire contracts should accept unknown Jarvis event envelopes when required envelope fields are valid. The UI mapper should render unsupported known or unknown event types as neutral activity rows. Malformed required fields still fail schema decode.

## ADR

Decision: Use T3's existing orchestration projection model as the UI projection layer for Jarvis state.

Drivers: reuse mature T3 UI/runtime plumbing; preserve Jarvis authority; enable fixture-backed progress before all Jarvis APIs are live.

Alternatives considered: separate Jarvis dashboard inside T3; direct provider-spawning T3 mode; full custom cockpit outside T3.

Why chosen: existing T3 shells, timelines, pending controls, and provider command boundaries are close to the desired operator experience.

Consequences: implementation must clearly separate Jarvis-backed sessions from native T3-backed sessions, and tests must prevent provider runtime leakage.

Follow-ups: live aggregate API integration, start wizard, artifact/evidence panels, richer dogfood scenarios.

## Available Agent Types And Staffing Guidance

- Main leader: owns sequencing, integration, state, and blocker packets.
- Explorer: map T3 provider/orchestration state and Jarvis endpoint contracts.
- Worker: implement disjoint slices after consensus.
- Architect: review projection/authority boundaries.
- Critic: review plan/test adequacy and blocker discipline.
- Verifier/test-engineer: run typecheck/tests/browser smoke/dogfood.

Recommended execution: `$ultragoal` as the durable goal owner, optionally using `$team` inside implementation slices if contracts, server connector, and web UI can be split without overlapping write sets.

Ralph fallback: only if explicitly requested for a narrow persistent single-owner verification loop.

## Goal-Mode Follow-Up Suggestions

- `$ultragoal`: default for this implementation.
- `$team`: useful inside Ultragoal after the first contracts/client slice if server and UI lanes are independent.
- `$autoresearch-goal`: not recommended; this is implementation, not research.
- `$performance-goal`: not recommended unless later UI polling or timeline rendering has measurable performance targets.

## Changelog

- Initial ralplan PRD derived from Phase 7 plan and deep-interview spec.
- Applied Architect guardrail: unknown valid event envelopes are accepted at the wire layer and rendered neutrally at the UI layer; malformed required fields still fail.
