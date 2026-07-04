# Test Spec: Jarvis Cockpit Phase 7

Status: ralplan draft
Date: 2026-06-30
Related PRD: `.omx/plans/prd-jarvis-cockpit-phase7.md`

## Test Strategy

Use layered verification:

- Contract tests prove Jarvis wire schemas and fixtures.
- Server tests prove config, client, projection mapping, and command routing.
- Web tests prove dashboard/timeline/wizard/control rendering.
- Browser smoke proves the app physically opens and changed flows work.
- Dogfood reports prove operator workflows with repro evidence after meaningful UI groups.

## Unit And Contract Tests

Contracts:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/contracts test -- jarvis
```

Required cases:

- Valid run/session/event fixtures decode.
- Malformed required fields fail.
- Unknown provider payloads remain opaque.
- Unknown event envelopes with valid required fields decode and map to neutral UI activity rows.
- Unknown or malformed required fields fail schema decode.

Server:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter t3 test -- JarvisClient JarvisProjectionMapper JarvisSessionEventMapper JarvisCommandBridge
```

Required cases:

- Bearer token attaches only in server client.
- HTTP 401/403/404/5xx map to typed errors.
- One run with two worker sessions maps to one project and two thread shells.
- Missing repo/cwd/artifacts use deterministic fallback labels.
- Approval/input session events set pending UI flags.
- Jarvis-backed turn, approval, input, interrupt, stop, and resume call Jarvis client.
- Jarvis-backed commands do not call `ProviderService`.
- Native T3-backed commands still call existing provider paths.

Web:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/web test -- jarvis StartWorkWizard MessagesTimeline
```

Required cases:

- Fixture dashboard renders mixed run/session statuses.
- Empty state renders when Jarvis is connected but no runs exist.
- Error/degraded state renders when Jarvis is unreachable.
- Timeline renders `turn.started`, `turn.waiting_provider`, approval, input, failed, interrupted, and stopped events.
- Controls show loading and rejection states.

## Repo Checks

Run before any final handoff:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm lint
volta run --node 24.13.1 --pnpm 10.24.0 pnpm build
```

Run full tests where feasible:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm test
```

Known baseline risk: full workspace test has previously shown a timing/flaky failure in `apps/web/src/components/chat/MessagesTimeline.test.tsx`, while the targeted web test passed. Re-check before attributing failure to this work.

## Browser Smoke

Start dev server:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm dev
```

Issue dev pairing token:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 node apps/server/dist/bin.mjs auth pairing create \
  --base-dir /Users/neilbarton/.t3 \
  --dev-url https://cockpit.localhost \
  --base-url https://cockpit.localhost \
  --json
```

Open with a fresh browser session and wait:

```bash
agent-browser --session jarvis-cockpit-smoke open 'https://cockpit.localhost/pair#token=TOKEN'
agent-browser --session jarvis-cockpit-smoke wait --load networkidle
agent-browser --session jarvis-cockpit-smoke wait 10000
agent-browser --session jarvis-cockpit-smoke get url
agent-browser --session jarvis-cockpit-smoke snapshot -i
agent-browser --session jarvis-cockpit-smoke screenshot --annotate /Users/neilbarton/Development/jarvis-cockpit/dogfood-output/screenshots/<slice>.png
```

Expected baseline: URL is `https://cockpit.localhost/` and shell shows `Projects`, `No projects yet`, `Add project`, and settings controls.

## Dogfood Scope

Run dogfood after these UI groups:

- Read-only dashboard.
- Session detail timeline.
- Start work wizard.
- Approval/input/control surfaces.

Output directory:

```text
/Users/neilbarton/Development/jarvis-cockpit/dogfood-output/
```

## Missing-Spec Blocker Tests

When a Jarvis API is missing, produce a missing-spec packet instead of guessing. Packet acceptance checks:

- Identifies exact missing endpoint/field/event/decision.
- Explains why T3 cannot safely proceed.
- Proposes one or more contract shapes.
- Lists T3 files/tests waiting on it.
- Includes fixture recommendation if safe.
- Gives the other agent concrete acceptance checks.

## Expanded E2E Acceptance

After live Jarvis endpoints are available:

- Start Jarvis worker API.
- Start T3 in Jarvis mode.
- Load runs/sessions.
- Open session with dummy events.
- Send turn and observe `turn.started` plus `turn.waiting_provider`.
- Resolve input/approval and observe event updates.
- Interrupt/stop and observe status changes in dashboard and detail.
- Verify no T3 provider runtime is spawned for Jarvis-backed sessions.
