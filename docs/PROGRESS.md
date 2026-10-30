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
| Sprint: desktop Shift (now 12.6 m/s vs walk 4.2 m/s, see below); VR stick-click toggle that stays on while moving | browser (measured speeds), unit (`client/test/xr-input.test.ts`) |
| Budgets: every bookmark ≤ 150 draw calls (worst 142) | screenshot run (`docs/screens/perf.tsv`) |

Not verified in headset.

### M7 — Crowd Control: done (not verified in headset)

| Item | Status |
|---|---|
| Shared agent system: ground-floor navigation over rooms, portals and exhibits (`shared/rules/agents.ts`), synced NPCs on the server (`AgentSystem`), simulated at 10 Hz | unit, bot |
| One-way visitor circuit in map data (Great Hall → Arms and Armor → Dinosaur Hall → Sculpture Court → Modern → Dinosaur Hall → Africa/Oceania/Americas → Great Hall exit), with floor arrows, ENTRANCE and EXIT signs | unit (every leg walkable), browser |
| Four closed areas (Egypt, the staff stair, both courts) with red rings and STAFF ONLY signs; detour paths for lost visitors | unit |
| Tourist types: normal, kid (runs, may ignore the first touch, strays again), group (followers walk the leader's trail), stubborn (3 touches), lost (heads for closed areas), tour guide (gathers nearby visitors), influencer (stops to film in doorways) | unit |
| Touching: VR hands or walking into a tourist; desktop click taps the tourist in front. Strays turn around; on-route tourists just get huffy | unit, bot, browser |
| Tools: 6 brass stanchions that link into velvet ropes (ropes block; strays turn back at them) and 3 "Please follow the arrows" signs, all shared grabbables | unit, bot, browser |
| Scoring: +1 per visitor out of the exit, −1 per visitor leaving by the entrance, −2 per visitor entering a closed area; congestion meter (jammed doorways, people stuck at ropes) and breach meter; either full fails the round; 0–3 stars | unit |
| Five waves of rising size and difficulty; cap of 40 tourists at once | unit |
| Instanced rendering: the whole crowd is 7 draw calls with a procedural walk bob, mood markers over heads, comic speech bubbles and sounds | browser (`tools/smoke/crowd-desktop.ts`: 41 draws in the Great Hall with the crowd) |
| Join-in-progress: immediately, as another security guard; the wave continues | bot |

Not done for M7: doors as a crowd tool (none sit on the circuit yet), recorded voice lines.

### M8 — Insurance Fraud: done (not verified in headset)

| Item | Status |
|---|---|
| Destructible catalogue in tunables (value, hit points, tool needed) and 46 placed destructibles, including three ultra-high-value pieces (Mammoth skeleton, Giant Canvas, Lion Gate) each held by three anchors | unit |
| Tools with damage, durability, swing speed and limited restocks: mallets, crowbars, extinguisher, ceremonial mace, fire axe, sledgehammer, stone ball (thrown) | unit, bot |
| Breakables generalised: CTR cases and destructibles are one system; modes decide damage | bot (CTR and Fraud) |
| Credit: regular objects pay as you damage them; ultras pay 60% to the finisher, 40% by anchors loosened | unit |
| Security Level 0–5 from recent damage, decaying when you lie low; level 2 reveals you, 3 sounds alarms, 4–5 send guards (shared agent system, grid A* routing) who catch you and hold you in the security office | unit, bot |
| Economy simulation: greedy-highest-value does not beat the other strategies (it loses clearly) | unit |
| Join-in-progress: spectate until the next round | bot |
| Client: one-draw-call models for every destructible (vases to the Mammoth skeleton), price tags on the nearest six, lean-on-damage and rubble, collision for big pieces | browser (`tools/smoke/fraud-desktop.ts`) |
| Tools: models that point forward from the hand, labels on nearby racks, sledgehammer slows you | browser |
| Guards (shared NPC renderer), beacons with stars over wanted players, "+$26,000" pop-ups, smash sounds, HUD with bill, rank, Security Level and tool | browser |
| Full loop on desktop controls: bare-hand vase, mallet bust, Security Level 4, guard chases and catches, held in the security office | browser |
| Spectators: free-fly camera on desktop and a live scoreboard on the HUD | not verified in a browser |
| Budget: 57 draw calls in the Great Hall mid-round | browser |

### Extra modes (requested): Hide and Seek, Fix the Exhibit — done (not verified in headset)

| Item | Status |
|---|---|
| Hide and Seek: 10-minute round, one random seeker blindfolded for 45 s, hiders call out ("cuck-oo", loud and positional) every 2 minutes with a 10 s warning, a touch (VR) or click (desktop) tags a hider who then joins the seekers, seekers win by finding everyone, hiders still hidden at the end win | bot, browser |
| Hide and Seek: no name tags over hiders for seekers; late joiners seek | bot (late join not covered) |
| Fix the Exhibit: 10 pieces in the Sculpture Court; 10 s to memorise with a countdown in the bottom-right corner, 3 s eyes closed (black), 2 minutes to put it back | bot, browser |
| Fix the Exhibit: a piece dropped within a foot (0.3048 m) of its spot clicks into place (gold ring and click); percentage score at the end | bot, browser |
| Fix the Exhibit: no copying. Every player has a private set of pieces (only the owner sees or moves them), a different jumble, and other players are invisible during the round; late joiners spectate | bot, browser |
| Countdown in the bottom-right of your view (desktop screen corner; VR card fixed low-right in the headset view) | browser (desktop) |

### Playtest pass, Free Roam, museum map (requested)

| Item | Status |
|---|---|
| Played every mode on desktop controls in real browsers: two players joining, walking, sprinting, stairs, elevators, Capture the Relic, Artifact Hunt, Crowd Control, Insurance Fraud, Hide and Seek, Fix the Exhibit | browser (all `tools/smoke/*`) |
| How-to-play card for every mode at the start of each round (title, goal, desktop and VR controls), 12 s | browser (`roam-map-desktop.ts`) |
| Free Roam (was Free Tour): no timer; HUD names your room and counts rooms visited; host ends it from the menu | browser |
| Museum map: all three floors side by side, your floor highlighted ("YOU ARE HERE"), your position and facing, friends, rooms visited, stairs, elevators, doorways. One button opens it and the same button closes it: M or the on-screen Map button (desktop), X on the left controller (VR), or Map in the menu | browser (desktop), unit; VR not verified in headset |
| Menu: Map button; End round · back to lobby (host, during a round); fixed overlapping volume labels and clipped buttons | browser |

### Full test pass (requested)

| Check | Result |
|---|---|
| Unit and bot tests (rules, map, server, client): 84, including a sweep of every mode for join-mid-round (active / seeker counting / spectating as designed) and the host leaving mid-round (host hands over, round carries on, party returns intact) | pass |
| Lint, typecheck, route-length rule, production build | pass |
| Production builds as on Render (built server with `NODE_ENV=production` and CORS limited to the client; built client served statically): landing page "Start a party", invite link, second browser joins, both see each other, only the host can start, round, End round, party intact | browser (`tools/smoke/landing-flow.ts`) |
| Every mode on desktop controls in real browsers: two players, movement, Capture the Relic, Artifact Hunt, Crowd Control, Insurance Fraud, Hide and Seek, Fix the Exhibit, Free Roam and the map | browser (all `tools/smoke/*`) |
| Frame budget at Quest quality, empty museum: all 23 bookmarks ≤ 150 draw calls (worst 131) | screenshot run |
| Frame budget during every mode at the six busiest views, Quest quality: all ≤ 150 draw calls (worst 146, Crowd Control from the Great Hall balcony) | browser (`tools/smoke/mode-perf.ts`) |

Found and fixed during the pass:
- **Over budget during modes.** In-round draw calls reached 233 (Insurance Fraud in the Dinosaur Hall) because moving things ignored room culling. Fixed by:
  - culling objects, breakables and doors by room and distance;
  - showing the elevator panels only near their cab;
  - gloves in 4 draw calls instead of 7 (per player, local and remote);
  - merging every multi-part object into one draw call;
  - drawing all velvet ropes in one instanced batch;
  - drawing no NPC batches when there are no NPCs;
  - merging the closed-area rings; removing the lobby test props during rounds;
  - not drawing upstairs galleries when their only doorway is high overhead.
- **A pre-existing culling gap.** The Great Hall didn't draw the Dinosaur Hall seen through the doorway at the top of the Grand Staircase. Fixed with a one-way "see-through" doorway hint in map data.
- **Map floor detection.** On the front plaza the map put you on the Service level.

### Playtest feedback round: elevators, climbing, guards, everything breakable (requested)

| Item | Status |
|---|---|
| Basement: the service stairwells had a solid wall over the top of the stairs, so you couldn't climb out. Fixed: you can walk down and back up | browser (`movement-desktop.ts`) |
| Elevators: real cabs that sit at one floor, with sliding doors on every floor; pushable floor buttons inside and a call button by each door (fingertip in VR, look + E / click on desktop); everyone in the cab rides together; requests queue | bot, browser |
| Elevators: the Great Hall cabs were half inside the wall (their buttons were buried) and blocked the balcony. Moved clear, with landings so you can walk round them | unit (clearance), browser |
| Jump (Space / A), climb walls (VR: grip and pull hand over hand; desktop: hold Space at a wall), pull up onto ledges | browser (jump onto the desk, climb a 3.6 m partition); VR not verified in headset |
| Insurance Fraud guards: always on patrol (3 downstairs, 1 upstairs), vision cones drawn on the floor (blocked by walls and exhibits, same code as the server's check), HUD warning when one can see you | bot, browser |
| Guards react only to strikes they see or hear close by (heavier tools carry further): first strike, they come to look; second, they chase. Break line of sight and they search, then return to patrol | bot, browser |
| Caught: locked in the cells downstairs (barred gates on the security office), free to move inside; the gates open when your time is up. The basement is otherwise open | bot, browser |
| Everything breakable: every painting on the gallery walls (≈180, small price tags by each frame, upstairs included) and the exhibits (knights, statues, sculptures, cases, sarcophagi, skeletons, the temple…) | unit, browser |
| Temple room to match the Met: the Temple of Dendur (Sackler Wing) from the reference photos | screenshot (`north.temple`, `north.dendur`) |

### Faster walk and run (requested)

| Item | Status |
|---|---|
| Walk 4.2 m/s (the old run speed), run 12.6 m/s (three times that) | browser (`movement-desktop.ts` measures both) |
| Movement is split into steps of at most 0.2 m with a collision check between them, so a full run can't pass through a wall | browser (sprint into the Great Hall walls) |
| Server's pose speed limit raised from 12 to 16 m/s so running isn't rejected as cheating | unit/bot suite passes; not tested on Render |
| Insurance Fraud guards chase at 5.5 m/s (was 3.4): you still escape by running, not by walking | bot, browser (`fraud-desktop.ts`) |

### Temple pool and Crowd Control in the lobby (requested)

| Item | Status |
|---|---|
| Temple of Dendur: the reflecting pool is much bigger and wraps round both sides of the temple platform; a little stone bridge with balustrades crosses the south arm up onto the platform. The water can't be waded | screenshot (`north.pool`, `north.bridge`, `north.temple`) |
| Crowd Control plays in the Great Hall only: tourists come in by the north front door, loop round the information desk past the foot of the Grand Staircase, and leave by the south door. Lost ones head for the Egyptian wing, the staff-only staircase or the Greek galleries | unit (circuit walkable), bot, browser (`crowd-desktop.ts`: nobody leaves the hall) |
| Every player gets a baton in their right hand (a late joiner too; it's theirs and nobody else can take it). Swing it into a tourist's head (VR) or click a head (desktop): the tourist sees stars for 1.6 s, and a stray turns straight round, stubborn or not. Bonk a well-behaved tourist and they just stand dazed in the way | unit, bot (reach check), browser (stars drawn) |
| VR: a hit buzzes the controller (a sharp knock, then a short rebound buzz) | not verified in headset |
| Desktop: with the baton in your right hand, E carries stanchions and signs in your left; clicking empty air swings instead of throwing the baton away | browser |
| Perf: Crowd Control's worst view is now the Great Hall balcony at 150 draw calls (the budget) because the whole crowd is in one room | browser (`mode-perf.ts`) |

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
