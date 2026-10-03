# CLAUDE.md

The full product spec and build plan is **[docs/BRIEF.md](docs/BRIEF.md)**. Read it before changing anything substantial. Living docs: `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/HEADSET_TESTS.md`, `docs/CREDITS.md`.

## Non-negotiables (brief §2)

- Real-time multiplayer for 2–4 players with a server-authoritative match state.
- WebXR immersive VR on Quest Browser, plus working desktop controls.
- Party invite links (`/party/<slug>`). No typed room codes, ever.
- Join-in-progress for every mode, following the rules in brief §12.
- One shared museum and one shared set of systems (networking, interaction, KO, breakables, NPC agents) reused by all modes.
- Modular mode architecture: adding a fifth mode must not require editing the other four.
- Server URL and environment settings are configurable between local and Render. Nothing hard-coded.
- No firearms, no graphic violence. KO is a playful daze.
- Stable VR frame rate beats visual excess every time.

If one of these is blocking you, stop and tell the human.

## How to work (brief §3)

- **Milestones** (brief §23), in order. Finish, verify, commit, update `docs/PROGRESS.md`, then move on. No game modes before shell, locomotion and networking are solid.
- **Log decisions** in `docs/DECISIONS.md` (one paragraph each, with the reason), including every deviation from the brief.
- **Headset checklist** in `docs/HEADSET_TESTS.md` after each milestone.
- **Be honest about verification**: "verified by automated test", "verified by screenshot", or "not verified in headset".
- **Check current docs** for Three.js XR, Colyseus and Render before using an API; pin exact versions.
- **Underspecified?** Pick the simplest design that preserves the rules, and log it.
- **Look at your own work**: capture bookmark screenshots (`npm run screens`) and critique against brief §7.
- **Placeholders behind the asset manifest**, never dead ends.
- **Don't overbuild**: no accounts, progression, cosmetics or extra settings before first playable.

## Commands

- `npm run dev` — server (:2567) + client (:5173)
- `npm test` — Vitest (rules, map, server)
- `npm run typecheck`
- `npm run measure-routes` — route-length rule (brief §6.3)
- `npm run screens` — capture camera bookmarks to `docs/screens/` (needs `npm run dev` running)
- Every gameplay number lives in `shared/src/config/tunables.ts`.
