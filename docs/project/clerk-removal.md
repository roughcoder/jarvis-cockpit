# Clerk / T3 Connect removal

Jarvis Cockpit is a fork of [T3 Code](https://github.com/pingdotgg/t3code). Upstream ships a hosted
cloud product — "T3 Connect" — whose identity layer is [Clerk](https://clerk.com). In the Jarvis
world, auth is the Jarvis pairing token, `JarvisOAuth`, and MCP OAuth. The Clerk lane was dead
weight, so this fork removed it along with the T3 Connect features it powered.

This document exists for one reason: **this fork still merges from the upstream T3 remote**, and
upstream still develops the code removed here. It records what went, what deliberately stayed, and
where merge conflicts will land.

## Verified before removal

`apps/server/src/jarvis/*` contains **zero** Clerk references. No Jarvis-mode surface consumed a
Clerk-backed identity. `JarvisOAuth` and the MCP OAuth lane are entirely independent of Clerk and
were not touched.

## Dependencies removed

Removed from `pnpm-workspace.yaml` (both the `catalog:` versions and the `overrides:` pins), plus the
six `@clerk/clerk-js>@...` wallet-exclusion overrides that only existed to keep Clerk's Solana and
Coinbase wallet integrations out of installs:

| Package                    | Was used by                             |
| -------------------------- | --------------------------------------- |
| `@clerk/backend`           | `infra/relay` (token verification)      |
| `@clerk/clerk-js`          | `apps/web` (vite `optimizeDeps`)        |
| `@clerk/electron`          | `apps/desktop`, `apps/web`              |
| `@clerk/electron-passkeys` | `apps/desktop` (macOS/Windows passkeys) |
| `@clerk/expo`              | `apps/mobile`                           |
| `@clerk/react`             | `apps/web`                              |
| `@clerk/shared`            | transitive pin                          |

The `@clerk/clerk-js` entry in `apps/web/vite.config.ts` `optimizeDeps` was the source of the
`Failed to resolve dependency: @clerk/clerk-js` warning at dev startup. That warning is gone.

## Environment variables removed

- `T3CODE_CLERK_PUBLISHABLE_KEY` (and its `VITE_` / `EXPO_PUBLIC_` mirrors)
- `T3CODE_CLERK_JWT_TEMPLATE` (and mirrors)
- `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID`
- `T3CODE_CLERK_PASSKEY_RP_DOMAINS`
- `T3CODE_RELAY_URL` — retained in `.env.example` only for the mobile agent-awareness push lane,
  which still speaks to an externally-hosted relay; the in-repo relay worker is gone.

CI-side, the `production` GitHub environment no longer needs `CLERK_PUBLISHABLE_KEY`,
`CLERK_JWT_AUDIENCE`, `CLERK_JWT_TEMPLATE`, `CLERK_CLI_OAUTH_CLIENT_ID`, `CLERK_SECRET_KEY`, or
`CLERK_PASSKEY_RP_DOMAINS`.

## Features that are now gone

- **T3 Connect sign-in** — the sidebar sign-in/avatar, the auth prompt, and the mobile clients user
  profile page.
- **Relay environment linking** — linking a local environment to a cloud account, and the managed
  relay session/account state that backed it.
- **Managed cloud environments** — the hosted tunnel endpoints upstream provisions per account,
  including relay environment _discovery_ (`client-runtime/src/relay/discovery.ts` and its atoms) and
  the mobile "connect a cloud environment" list.
- **The `/api/connect/*` HTTP API group** — `EnvironmentConnectHttpApi` (link-proof, relay-config,
  link-state, unlink, preferences, mint-credential, `/api/t3-connect/health`) is gone from
  `packages/contracts/src/environmentHttp.ts` and from `EnvironmentHttpApi`.
- **The `t3 connect` CLI command** and its cloud-link reconciliation on server boot.
- **The cloud waitlist** enrolment flow (mobile).
- **macOS/Windows passkeys** — passkeys were implemented entirely by `@clerk/electron-passkeys`.
  There is no passkey support without Clerk.
- **`infra/relay`** — the entire Cloudflare Worker control plane, plus
  `.github/workflows/deploy-relay.yml` and the `relay_public_config` job in `release.yml`.

Entry points were removed rather than left rendering disabled panes. `hasCloudPublicConfig()` could
never return true again once the Clerk keys were gone, so it was deleted along with the UI it gated
instead of being left as a permanently-false feature flag.

## Two things typecheck did not catch

Both were found by actually booting `pnpm dev:app`, not by the type gates. Worth remembering if this
removal is ever extended.

1. **The server failed to boot** with
   `HttpApiGroup "connect" not found ... Available groups: metadata, orchestration, auth`. Deleting
   `connectHttpApiLayer` (the _implementation_) left `EnvironmentConnectHttpApi` in the API
   _definition_, and Effect's `HttpApi` only resolves group implementations at runtime. Typecheck was
   green. Fixed by removing the group from the contract.
2. **Relay environment discovery** was bundled into the shared `Connection.layer`, so every consumer
   of that layer transitively required `CloudSession | ManagedRelayClient | ManagedRelayDpopSigner`
   even though nothing on the web side could supply them any more.

The lesson for future upstream merges: a green `typecheck` is not sufficient evidence that this
excision is intact. Boot the dev server.

## Deliberately kept

These look like part of the removed lane but are load-bearing elsewhere. **Do not delete them in a
future cleanup pass without re-checking these consumers.**

| Kept                                                                      | Why                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/relay.ts`                                         | `apps/server/src/relay/AgentAwarenessRelay.ts` imports it; live Jarvis orchestration via `OrchestrationReactor`.                                                                                                             |
| `packages/client-runtime/src/relay/*`                                     | `apps/mobile/src/features/agent-awareness/*` depends on `ManagedRelay` for push + live activities.                                                                                                                           |
| `apps/server/src/cloud/config.ts`, `environmentKeys.ts`                   | Consumed by `AgentAwarenessRelay`.                                                                                                                                                                                           |
| `apps/server/src/cloud/traceRelayRequest.ts`, `relayTracing.ts`           | Consumed by `apps/server/src/http.ts` and `src/auth/http.ts`.                                                                                                                                                                |
| `packages/shared/src/relayTracing.ts`                                     | Client relay tracing, independent of Clerk.                                                                                                                                                                                  |
| `apps/mobile/src/features/cloud/{dpop,managedRelayLayer,publicConfig}.ts` | Consumed by mobile agent-awareness and observability; only their Clerk-specific fields were stripped.                                                                                                                        |
| macOS entitlements + provisioning-profile signing                         | The entitlements plist also carries the hardened-runtime keys Electron needs (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`). Only the passkey `associated-domains` entitlement was dropped. |

## macOS signing: what changed

Passkeys were implemented entirely by `@clerk/electron-passkeys`, so the whole passkey lane went:
the native binary staging step, the RP-domain resolution, and the
`com.apple.developer.associated-domains` entitlement.

The mac **signing** lane is otherwise untouched. `T3CODE_APPLE_TEAM_ID` and
`T3CODE_MACOS_PROVISIONING_PROFILE` are still required for `--signed` builds, the provisioning
profile is still validated and passed to electron-builder, and the entitlements plist still carries
`com.apple.application-identifier`, `com.apple.developer.team-identifier`, and the three
hardened-runtime keys Electron needs (`allow-jit`, `allow-unsigned-executable-memory`,
`disable-library-validation`).

Apple requires signed entitlements to be a subset of the profile's, and we removed an entitlement
rather than adding one, so **existing provisioning profiles keep working**. The App ID's profile no
longer needs the Associated Domains capability and can be regenerated without it whenever
convenient — this is not urgent. The signed-build path could not be exercised in this branch; it
needs a real signed macOS build to confirm end to end.

## Deliberate naming residue: `clerkToken`

`packages/client-runtime/src/relay/managedRelay.ts`, `managedRelayState.ts`, and
`apps/mobile/src/features/agent-awareness/remoteRegistration.ts` still use the parameter name
`clerkToken` for what is really just the relay bearer token. This was left alone on purpose: those
modules survive (mobile agent-awareness needs them), and a ~80-site rename inside files we intend to
keep merging from upstream would create ongoing conflict noise for a cosmetic gain. `grep -i clerk`
will therefore still match there, plus one explanatory comment in `connection/resolver.ts`.

The `CloudSession` capability that used to carry this token is **gone** — it was removed once relay
environment discovery was deleted and nothing else consumed it.

The lane is inert regardless. Mobile `remoteRegistration` takes an injected `tokenProvider`, which
was supplied by the deleted Clerk auth provider and now yields `null`, so every relay call
short-circuits before sending. That is the intended "collapse to signed-out" behaviour, not an
oversight.

## Where upstream merges will conflict

Ranked by how much pain to expect.

1. **`pnpm-workspace.yaml`** — near-certain conflict on every upstream dependency bump. Upstream keeps
   the Clerk catalog entries and wallet overrides on the same snapshot train. Resolution: drop all
   `@clerk/*` lines, keep upstream's non-Clerk changes.
2. **`pnpm-lock.yaml`** — conflicts constantly. Resolution: take upstream's lockfile, then re-run
   `pnpm install` on this branch to re-derive it without Clerk. Never hand-merge.
3. **`.github/workflows/release.yml`** — upstream will keep editing the `relay_public_config` job and
   the `T3CODE_CLERK_*` env blocks this fork deleted. Resolution: delete their re-additions; keep any
   unrelated signing/publishing changes.
4. **`apps/web/src/main.tsx`, `src/lib/runtime.ts`, `src/components/settings/*`** — upstream keeps
   `ManagedRelayAuthProvider`, `hasCloudPublicConfig`, and the T3 Connect settings entries. Expect
   re-added imports pointing at files that no longer exist here.
5. **`apps/server/src/server.ts`** — the Effect layer composition. Upstream's cloud layers
   (`CloudManagedEndpointRuntime`, `CloudCliTokenManager`, `CloudCliState`, `connectHttpApiLayer`)
   were removed from the merge list here. This one needs care: a bad merge produces a layer graph that
   typechecks but fails at boot.
6. **`scripts/lib/public-config.ts` and `scripts/build-desktop-artifact.ts`** — the Clerk fields and
   the passkey signing lane. Note this fork also renamed `MacPasskey*` symbols to `MacSigning*` /
   `renderMacEntitlements`, so upstream diffs in that file will not apply cleanly.
7. **Deleted files** — git will report modify/delete conflicts whenever upstream touches
   `infra/relay/**`, `apps/web/src/cloud/**`, `apps/web/src/components/clerk/**`,
   `apps/mobile/src/features/cloud/**` (the deleted subset), `apps/desktop/src/app/DesktopClerk.ts`,
   `packages/shared/src/relayAuth.ts`, or `docs/cloud/**`. Resolution is almost always `git rm` again.

## If T3 Connect is ever wanted back

Revert this branch's merge commit rather than reconstructing it by hand — the removal spans
dependency pins, build defines, CI job graph, and Effect layer wiring, and partial restoration will
produce a service graph that compiles but does not boot.
