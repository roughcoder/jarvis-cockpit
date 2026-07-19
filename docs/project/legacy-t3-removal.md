# Legacy T3 Removal Notes

## 2026-07-19: Mobile and marketing apps

Jarvis Cockpit no longer carries the upstream T3 `apps/mobile` Expo app or the
`apps/marketing` Astro site. Future upstream merges should prefer keeping those
directories deleted and should not reintroduce the root marketing scripts, mobile
native lint script, mobile EAS preview workflow, Expo/Metro catalog entries, or
mobile-only patch files unless Jarvis explicitly gains a new mobile product.
