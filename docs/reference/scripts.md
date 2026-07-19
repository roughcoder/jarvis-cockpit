# Scripts

- `pnpm dev` — Starts contracts, server, and web through Portless at
  `https://cockpit.localhost`.
- `pnpm dev:app` — Starts the same web/server stack directly, without Portless.
- `pnpm dev:server` — Starts just the WebSocket server.
- `pnpm dev:web` — Starts just the Vite dev server for the web app.
- Dev commands default `T3CODE_HOME` to `~/.t3`.
- Override server CLI-equivalent flags from root dev commands with `--`, for example:
  `pnpm dev:app -- --base-dir ~/.t3-2`.
- `pnpm start` — Runs the production server (serves built web app as static files).
- `pnpm build` — Builds contracts, web app, and server through Vite+.
- `pnpm typecheck` — Strict TypeScript checks for all packages.
- `pnpm test` — Runs workspace tests.
- `pnpm dist:desktop:artifact -- --platform <mac|linux|win> --target <target> --arch <arch>` — Builds a desktop artifact for a specific platform/target/arch.
- `pnpm dist:desktop:dmg` — Builds a shareable macOS `.dmg` into `./release`.
- `pnpm dist:desktop:dmg:x64` — Builds an Intel macOS `.dmg`.
- `pnpm dist:desktop:linux` — Builds a Linux AppImage into `./release`.
- `pnpm dist:desktop:win` — Builds a Windows NSIS installer into `./release`.

## Desktop `.dmg` packaging notes

- Default build is unsigned/not notarized for local sharing.
- The DMG build uses `assets/macos-icon-1024.png` as the production app icon source.
- Desktop production windows load the bundled UI from `t3code://app/index.html` (not a `127.0.0.1` document URL).
- Desktop packaging includes `apps/server/dist` (the `t3` backend) and starts it on loopback with an auth token for WebSocket/API traffic.
- Your tester can still open it on macOS by right-clicking the app and choosing **Open** on first launch.
- To keep staging files for debugging package contents, run: `pnpm dist:desktop:dmg -- --keep-stage`
- To allow code-signing/notarization when configured in CI/secrets, add: `--signed`.
- Signed macOS builds also require `T3CODE_APPLE_TEAM_ID` and
  `T3CODE_MACOS_PROVISIONING_PROFILE`.
- Windows `--signed` uses Azure Trusted Signing and expects:
  `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, and `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`.
- Azure authentication env vars are also required (for example service principal with secret):
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

## Running multiple dev instances

`pnpm dev` uses Portless and normally does not require remembering ports. The
stable browser URL is `https://cockpit.localhost`; linked git worktrees may get a
Portless worktree subdomain.

For direct dev-runner commands, set `T3CODE_DEV_INSTANCE` to any value to
deterministically shift all dev ports together.

- Default direct ports: server `13773`, web `5733`
- Shifted ports: `base + offset` (offset is hashed from `T3CODE_DEV_INSTANCE`)
- Example: `T3CODE_DEV_INSTANCE=branch-a pnpm dev:desktop`

If you want full control instead of hashing, set `T3CODE_PORT_OFFSET` to a numeric offset.
