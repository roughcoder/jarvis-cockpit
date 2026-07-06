# Plan: Jarvis-First Cockpit

Date: 2026-07-06

Status: draft plan for the next Jarvis Cockpit implementation slices.

Scope: make `jarvis-cockpit` a project-first operator UI for Jarvis-managed
engineering work. Jarvis projects, project conversations, project memory, worker
dispatch, and worker state are the primary product model. Upstream T3 concepts
remain only where they are internal plumbing or explicitly labelled legacy/debug
surfaces.

## Product Direction

Jarvis Cockpit should open into a live Jarvis operating surface:

- Projects are the primary navigation unit.
- Project conversations are daily-use chat surfaces, not settings utilities.
- Worker sessions and runs are work artifacts under a project.
- Project memory and files are visible context for project conversations.
- All durable Jarvis state changes go through Jarvis APIs.
- Fixture mode and stale cached state are impossible to confuse with live
  workers.

## Non-Goals

- Do not preserve legacy local-project onboarding as the default cockpit path.
- Do not fall back to fixture mode when the brain is disconnected.
- Do not show repo-only UX when Jarvis projects are missing.
- Do not locally hide, archive, delete, or mutate Jarvis state after failed
  Jarvis writes.
- Do not merge native Cockpit `t3-code` MCP and Jarvis `mcp-serve` into one
  ambiguous status.

## Current Decisions

### Project Conversations Become Primary

Decision: project conversations should be opened from the main shell/sidebar and
rendered in the main chat surface. Normal Jarvis worker sessions remain visible
as work sessions under projects, but they should not be the top-level organizing
model.

Rationale: Jarvis memory and files are project-shaped. Starting from runs or
worker sessions makes users manage implementation artifacts instead of the
project they are operating.

### Settings Projects Becomes Admin

Decision: `/settings/projects` remains for registry/admin tasks: project
create/update/archive/delete, repository configuration, file/memory management,
and diagnostics. It should not be the primary place to talk to Jarvis.

### Brain Disconnection Is Explicit

Decision: keep the shell useful for diagnosis, but block live Jarvis actions
behind a clear reconnect state. Last-known data may be shown only when labelled
stale.

### Fixture Mode Is Dev/Demo Only

Decision: fixture mode must use loud, persistent labelling. Worker cards and
start-work buttons must use simulation language when fixture mode is active.

### Worker Readiness Is Incremental

Decision: show current reported worker status now, and add richer readiness
checks as Jarvis exposes them. The UI must distinguish `reported healthy` from
`readiness not reported`.

### Activity Feed Needs Jarvis Ownership

Decision: a complete project activity feed should come from a Jarvis endpoint.
Short-term Cockpit can show recent conversations, files, and memory summaries in
their local sections, but should not invent a durable activity log.

## Phase 1: Connection, Onboarding, And Fixture Clarity

Goal: the app has one honest entry state for live Jarvis, disconnected Jarvis,
empty Jarvis, and fixture mode.

Work:

- Add a brain connection surface with:
  - base URL
  - auth mode
  - OAuth configured/usable state
  - token fallback state
  - last successful snapshot time
  - last failure class and message
- Replace legacy pairing/default local onboarding in Jarvis cockpit mode with:
  - connected brain state
  - reconnect brain state
  - first project onboarding
- If no active projects exist, offer to create the default `Jarvis` project:
  - `roughcoder/jarvis`
  - `roughcoder/jarvis-cockpit`
- Add fixture mode banner and fixture language:
  - `Fixture mode`
  - `Simulate work`
  - `No live workers`
- Prevent fixture workers from using normal live-worker styling.

Acceptance:

- Browser opens with a disconnected brain and shows reconnect UI, not pairing.
- Browser opens with no projects and offers default project creation.
- Browser opens in fixture mode and displays persistent fixture labelling.
- No fixture dispatch copy says or implies live worker execution.

Dogfood:

- `agent-browser` screenshot for disconnected/reconnect state.
- `agent-browser` screenshot for no-project onboarding.
- `agent-browser` screenshot for fixture mode warning.

## Phase 2: Project-First Sidebar And Shell

Goal: projects are the default navigation shape.

Work:

- Rework sidebar sections to lead with Jarvis projects.
- Under each project show:
  - project conversations
  - active/recent work sessions
  - archived/stale indicators where supported
- Remove visible `runs-first` assumptions from the main empty state and sidebar.
- Keep legacy/local T3 project entry points only behind explicit legacy/debug
  affordances.
- Main empty state should prompt:
  - open a project conversation
  - start project work
  - create first project when none exist

Acceptance:

- With live Jarvis projects, the sidebar top-level concept is project.
- A user can select a project and see conversations/work for that project.
- No default cockpit path asks for a local folder or local clone.

Dogfood:

- Browser screenshot of project-first sidebar.
- Browser smoke opening a project from sidebar.
- Browser smoke starting work from a selected project.

## Phase 3: Start Work And Worker Dispatch

Goal: dispatch work to Jarvis workers with visible project, repo, and worker
compatibility.

Work:

- Make `Create project` a first-class command in the start-work modal.
- Start-work modal shows:
  - selected project
  - selected repo
  - selected worker or auto
  - compatibility status
  - engine support
- Use Jarvis validation where available:
  - `POST /v1/work/validate`
  - show `missing`, `missing_authority`, and validation reasons
- Worker dispatch cards update live without manual refresh.
- Show dispatch progress and terminal states for Mac mini and laptop workers.
- Avoid sending Cockpit-local draft branch names as Jarvis branch overrides.

Acceptance:

- User can dispatch to Mac mini with selected project/repo and see progress.
- User can dispatch to laptop with selected project/repo and see progress.
- Incompatible project/repo/worker combinations are visibly blocked or warned.
- Fixture mode dispatches use simulation copy only.

Dogfood:

- Browser dispatch to Mac mini.
- Browser dispatch to laptop.
- Screenshot or report for validation failure state.

## Phase 4: Project Management UX

Goal: project CRUD is safe, validated, and understandable.

Work:

- Replace raw repository textarea with structured repository editor:
  - add row
  - remove row
  - remote/name fields
  - default repo toggle
  - validation
- Validation rules:
  - at least one repo
  - exactly one default repo
  - no duplicate remotes
  - non-empty repo name and remote
- Add confirmations for:
  - project archive
  - project delete
  - file retract
- Improve project write failures:
  - network
  - auth
  - missing authority
  - missing route/API version
  - validation
- Show permissions/capabilities once Jarvis exposes effective permissions.

Acceptance:

- Create, update, archive, delete project flows are browser-tested.
- Multi-repo editing does not require manually editing line syntax.
- Destructive project/file actions require confirmation.
- 403 errors preserve missing authority details.

Dogfood:

- Browser create/update/delete temp project.
- Browser multi-repo update.
- Browser invalid repo validation.
- Browser destructive confirmation.

## Phase 5: Main-Surface Project Conversations

Goal: project conversations feel like normal Codex conversations.

Work:

- Route project conversations into the main chat surface.
- Add open/resume project conversations from sidebar.
- Add new project conversation from project context.
- Conversation send state:
  - pending
  - streaming/progressive response where supported
  - completed
  - failed with retry
- Preserve project context visibly:
  - project name
  - selected repo/default repo
  - memory summary or context drawer
  - files/context links
- Add archive/unarchive when Jarvis exposes routes:
  - archive success removes/hides conversation normally
  - route-gap UI is removed once API is live

Acceptance:

- User can create a project conversation and talk to Codex/Jarvis from the main
  chat surface.
- User can resume an existing project conversation from sidebar.
- Send failures are recoverable with retry.
- Project memory/context is visible enough to explain why this is not a generic
  chat.
- Archive works end-to-end when Jarvis API exists.

Dogfood:

- Browser create conversation.
- Browser send turn.
- Browser resume conversation after navigation.
- Browser archive conversation after Jarvis route lands.

Jarvis dependency:

- `POST /v1/projects/{project_id}/threads/{thread_id}/archive`
- archived thread state or archived list support if unarchive/history is needed

## Phase 6: Worker/Fleet Readiness

Goal: worker failures are visible and actionable from Cockpit.

Work:

- Worker cards show:
  - startable repos
  - active sessions
  - queue/capacity
  - capabilities
  - last failure
  - last seen
- Add readiness rows:
  - Codex installed
  - Codex authenticated
  - repo checkout valid
  - package manager availability
  - browser/dev-server capability
- Add `Send test job` per worker.
- Clearly show laptop sandbox/browser-dev-server limitations when readiness
  cannot support browser dogfood.

Acceptance:

- Worker setup problems are visible without reading server logs.
- Mac mini and laptop cards expose enough state to explain dispatch readiness.
- Test job can be sent and inspected.

Dogfood:

- Browser worker card screenshot.
- Browser send-test-job to Mac mini.
- Browser send-test-job to laptop.

Jarvis dependency:

- richer worker readiness diagnostics, or cockpit continues to display
  `not reported` for unavailable checks

## Phase 7: MCP And Diagnostics

Goal: MCP and diagnostic surfaces are accurate, not aspirational.

Work:

- Keep native Cockpit `t3-code` MCP separate from Jarvis `mcp-serve`.
- Add tests proving Codex receives `mcp_servers.t3-code` config and bearer env.
- Add Jarvis MCP status when Jarvis exposes it:
  - tool list
  - server status
  - token/principal status
  - active Codex-session configuration status
- Add setup guidance or one-click config for Jarvis MCP inside Codex once token
  APIs exist.
- API capability page:
  - supported project routes
  - memory routes
  - conversation routes
  - worker dispatch routes
  - MCP routes
- Add redacted diagnostics export.

Acceptance:

- MCP page clearly distinguishes `t3-code` and `jarvis mcp-serve`.
- Codex MCP injection has unit/integration coverage.
- Diagnostics export contains no secrets.
- Missing API capabilities are shown as missing, not inferred as working.

Dogfood:

- Browser MCP status page.
- Browser diagnostics page.
- Verify exported diagnostics are redacted.

Jarvis dependency:

- MCP status/token APIs if Cockpit should manage Jarvis MCP directly
- capability or catalog expansion for route discovery

## Phase 8: Polish And Regression Dogfood

Goal: the product feels coherent and remains testable.

Work:

- Replace raw timestamps with relative time and absolute tooltip.
- Improve empty states for:
  - projects
  - files
  - memory
  - conversations
  - workers
- Improve toast copy across Jarvis actions.
- Keep dogfood reports as regression fixtures.
- Add targeted unit tests for each new UI logic layer.

Acceptance:

- Empty states tell the user what they can do next.
- Timestamps are readable without losing precision.
- Error copy identifies route/auth/permission/network/validation classes.
- New dogfood reports cover core flows.

## API Dependencies To Track

Already documented or partly available:

- project CRUD
- project memory writes
- project files
- `POST /v1/work/validate`
- worker snapshot/catalog data

Still required or recommended:

- project conversation archive
- project conversation archived state
- project effective permissions
- route/capability discovery
- worker readiness diagnostics
- project activity feed
- Jarvis MCP status/token APIs

## Verification Baseline

Every phase must include:

- relevant focused unit tests
- `vp check`
- `vp run typecheck`
- browser dogfood with `agent-browser`
- screenshots/reports under `dogfood-output/`
- no claimed completion without live browser evidence when the feature is
  user-facing

## Delivery Order

Recommended order:

1. Phase 1: connection/onboarding/fixture clarity
2. Phase 2: project-first sidebar and shell
3. Phase 3: start work and worker dispatch
4. Phase 4: project management UX
5. Phase 5: main-surface project conversations
6. Phase 6: worker/fleet readiness
7. Phase 7: MCP and diagnostics
8. Phase 8: polish and regression dogfood

This order removes misleading states first, then moves the main workflows into
their correct product surfaces, then deepens diagnostics and polish.
