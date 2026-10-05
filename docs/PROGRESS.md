# Progress

Last updated: 2026-10-04.

**Status:** M0–M5 (first playable) and M6 (Artifact Hunt) are built. Everything below is verified on desktop. Nothing has been verified in a headset yet. The first job for the human is to run [HEADSET_TESTS.md](HEADSET_TESTS.md) on a Quest.

How each item was verified:

- **unit** — Vitest
- **bot** — headless Colyseus clients against a real server
- **browser** — Playwright with real Chromium and software WebGL, using desktop controls
- **screenshot** — `npm run screens`
- **not verified in headset** — reasoned only

## Milestones

### M0 — Scaffold: done

| Item | Status |
|---|---|
| npm workspaces (shared, server, client, tools); strict TypeScript; Vite; Colyseus 0.18.9 | Done |
| ESLint; Vitest | Done |
| `render.yaml`; CI workflow (`.github/workflows/ci.yml`) | Written |
| `npm run dev` starts server and client together; a blank scene connects | browser |
| CI | Not yet run on GitHub |
| `render.yaml` | Not checked against live Render docs (network blocked here); see DECISIONS |

### M1 — Museum shell: done, with gaps listed below

| Item | Status |
|---|---|
| Parametric kit: columns, arches, mouldings, domes, vaults, coffers, stairs, balustrades, vitrines, frames, benches | Done |
| Exterior: steps, Beaux-Arts facade, banners, avenue traffic, trees, buildings, skyline | screenshot |
| Grand Lobby, Upper Balcony, Dinosaur Hall + catwalks, 7 Art Galleries, Egypt (4 corridors, mastaba, secret door, crawl shaft), World Cultures, North Court, South Court | screenshot |
| Service level: stairs from both courts, corridor loop, security office, conservation lab | screenshot |
| Map data in `shared/src/map` (rooms, portals, platforms, stairs, rails, blocks, doors, spawns, zones, slots) | Used by client, server and tools |
| Collision (capsule vs BVH), portal culling, analytic baked lighting v1, perf HUD, camera bookmarks | Done |
| `measure-routes` passes: fast 104 m; tactical west ×1.40; tactical east ×1.38; hidden ×1.69; A→B = B→A | unit, CI |
| Budget, every bookmark at `quest` tier | ≤ 131 draw calls, ≤ 168k triangles (budget 150 / 350k). Desktop numbers only; on-device fps not measured. |

### M2 — Locomotion and hands: done on desktop, VR not verified in headset

| Item | Status |
|---|---|
| Input action layer with a bindings table (keyboard/mouse, `xr-standard` gamepads) | Done |
| Smooth head-relative locomotion, sprint, snap turn (45°), smooth-turn option | Done |
| Comfort vignette; head-in-wall fade and push-back | Done |
| Ramp stairs; no sliding on slopes; desktop crouch for the crawl shaft | Done |
| Gloves with grip/point poses; throw velocity from hand history; haptics | Done |
| Desktop walking, grabbing, punching, throwing | browser |
| Menu fallbacks: hold Y for 0.5 s, plus a left-wrist poke button | Done |
| Button-index readout (`?buttons`) | Done |
| VR behaviour | **Not verified in headset** |

### M3 — Multiplayer and parties: done locally; not deployed

| Item | Status |
|---|---|
| Start a party → `/party/<slug>`; second browser joins from the link with no typing; both see each other move | browser |
| 4-player cap with a friendly "party full" (no twin room); host migration; seat restored on rejoin within 60 s | bot |
| Empty party kept 10 min; party recreated under the same slug if gone | Done |
| Pose streaming at 20 Hz; remote avatars interpolated about 100 ms behind | browser |
| Render deploy | **Not done.** Needs the human to connect the repo in Render (README → Deploy). |

### M4 — Menus: done

| Item | Status |
|---|---|
| Personal menu: Resume, Music/FX toggles and volume, comfort vignette, Recenter, Leave with confirm | Done |
| Lobby totem: members with host crown, invite link + copy, five mode cards (three locked as "coming soon"), settings, host-only Start, Music/FX | Done |
| Host-only actions enforced on the server | bot |
| Round flow LOBBY → COUNTDOWN → PLAYING → ROUND_END → LOBBY with the Free Tour stub mode | bot, browser |

### M5 — Capture the Relic: done

| Item | Status |
|---|---|
| Breakable cases (crack → shatter + positional alarm), relics, carry, drop, throw, catch | Done |
| Defender-touch return, no auto-return, score only while your relic is home, both-out manhunt announcement | unit (named test per rule) |
| KO (daze meter, stars, fade), respawn (4 s; 3 s short-handed), spawn protection, knockback | unit, bot |
| Win at score limit; time-up with sudden death | unit |
| Join-in-progress: smaller team, base spawn | bot |
| Full match on desktop controls in two browsers: smash, steal, carry home, score, results, back to lobby | browser (`tools/smoke/ctr-desktop.ts`) |
| Carried-relic hum and pulse (anti-stalemate) | Done |

### M6 — Artifact Hunt: done on desktop, not verified in headset

| Item | Status |
|---|---|
| 43 candidate slots in map data (re-placed for the new layout): 17 obvious, 14 tucked (catwalks, balconies, behind partitions/exhibits), 12 hidden (service level, past the secret door, through the crawl shaft) | unit (each slot is inside its room and not inside an exhibit) |
| 12 artifacts per round (5 obvious, 4 tucked, 3 hidden), different every round | unit, bot |
| Rarity scoring: common 1, rare 3, legendary 5 | unit |
| Securing by carrying an artifact into the Registrar's Desk ring in the lobby | bot, browser |
| KO forces a drop (shared combat system) | Done |
| Warmer/colder hint on the wrist / desktop HUD, weaker for hidden artifacts, plus a soft tick that speeds up as you get warmer | unit, browser |
| Free-for-all or teams (host setting on the totem); time limit (default 6 min) | Done |
| Round ends when all are secured or time runs out | unit |
| Join-in-progress: immediate, current world state, no retroactive credit | bot |
| Full find → grab (E) → deliver → score on desktop controls | browser (`tools/smoke/hunt-desktop.ts`) |

### Met-style layout, second floor, elevators (requested between M6 and M7)

| Item | Status |
|---|---|
| Wider Great Hall (27 × 56 m, three domes, balcony ring at 8 m) with a 16 × 5 m hanging "Welcome to The Museum" banner | screenshot (`greathall.entrance`) |
| Met-style plan: Great Hall → Grand Staircase → Dinosaur Hall spine; Egypt north, Greek & Roman south; Arms & Armor, World Cultures, American Wing, Sculpture Court, Modern wings; north/south courts | screenshot (23 bookmarks), route rule |
| Second floor at 8 m: Great Hall balcony, Asian Art, Musical Instruments, a 10-room European Paintings grid, catwalks and bridges over the Dinosaur Hall, court mezzanines | unit (≥10 upstairs rooms) |
| Stairs to floor 2: Grand Staircase, two Dinosaur Hall catwalk stairs, two court stairs | unit, browser (sprinted up the Grand Staircase to y 7.9) |
| Four elevators (two in the Great Hall, two in the courts), server-validated teleport with a fade and a ding; button panel in VR, E on desktop | unit, bot, browser (up to 8 m and back down) |
| Five route types between bases: fast 126 m; west 1.30×, east 1.32×, upper floor 1.44×, service 1.77× | `npm run measure-routes` |
| Sprint: desktop Shift 4.2 m/s vs walk 2.6 m/s; VR stick-click toggle that stays on while moving | browser (measured speeds), unit (`client/test/xr-input.test.ts`) |
| Budgets: every bookmark ≤ 150 draw calls (worst 142) | screenshot run (`docs/screens/perf.tsv`) |

Not verified in headset.

### M7–M9: not started

Crowd Control and Insurance Fraud are listed as "coming soon" on the lobby totem. Their join-in-progress rules will be added with each mode.

## Known gaps and issues

- **Art.** The Met API and image hosts are blocked from the build environment, so the galleries show procedural placeholder paintings. **Human: run `npm run fetch-art` once**, check the result, and commit `client/public/assets/art/` and `docs/CREDITS-art.md`. The script is written against the documented API but has not been run.
- **Asset pipeline.** No KTX2 yet: textures are procedural canvases; art atlases are JPEG, or KTX2 if `toktx` is installed. `tools/process-assets.ts` (gltf-transform) and `tools/bake-lighting.ts` (raycast AO) are **not written yet**. Lighting v1 is an analytic vertex bake (see DECISIONS).
- **Service-level access.** Missing: a hidden link from Egypt down to service, and doors into service from the lobby and the World Cultures diorama. Today, service is reached only from the two court stairwells. Egypt's two concealed passages (the pivot door and the crawl shaft) connect Egypt corridors to each other.
- **Throwing off catwalks.** Catwalk and balcony railings collide, so a shove can't knock a carrier off a catwalk yet (brief §19).
- **Physics.** Thrown objects use simple server kinematics with a crude wall test. They can rest on top of exhibits but do not bounce.
- **Audio.** Remote footsteps use the remote player's height to pick the surface. Audio is fully synthesised: no recorded SFX or music yet.
- **Atmosphere.** Not done: dust motes, floor reflections/sheen cubemap, LOD.
- **Quality tiers.** `desktop-high` differs only in pixel ratio: no real-time shadows or bloom yet.
- **Placeholder name.** The facade inscription reads "THE MUSEUM" until a name is chosen.
- **Not built (brief §25 defaults).** Voice chat, bots, spectating a full party.
