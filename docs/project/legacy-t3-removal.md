# Legacy T3 Provider Removal

This fork is Jarvis-only at the product level. The built-in upstream T3 provider stacks for Grok/xAI, Cursor Agent, and OpenCode were removed so the cockpit no longer probes, updates, configures, or presents provider engines that Jarvis does not use.

Removed surfaces:

- Server provider drivers, adapters, provider snapshots, ACP extensions, text-generation backends, runtime helpers, tests, and mock/probe scripts for Grok/xAI, Cursor Agent, and OpenCode.
- Built-in driver registration and runtime wiring that caused startup version probes or maintenance/update runners for those removed providers.
- Contracts settings schemas/defaults and model/display defaults that advertised removed built-in providers.
- Web provider picker, provider settings metadata, provider icons, tests, docs, marketing copy/assets, and dependency lockfile entries that existed only for the removed provider stacks.

Codex and Claude remain the only built-in provider engines. Jarvis-managed work should continue to route through Jarvis engine selection rather than resurrecting direct T3 provider spawning for removed upstream products.

## 2026-07-19: Mobile and marketing apps

Jarvis Cockpit no longer carries the upstream T3 `apps/mobile` Expo app or the
`apps/marketing` Astro site. Future upstream merges should prefer keeping those
directories deleted and should not reintroduce the root marketing scripts, mobile
native lint script, mobile EAS preview workflow, Expo/Metro catalog entries, or
mobile-only patch files unless Jarvis explicitly gains a new mobile product.
