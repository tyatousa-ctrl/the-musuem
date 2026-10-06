# Decisions

One paragraph per meaningful choice, with the reason. Deviations from the brief are marked **(deviation)**.

**Colyseus 0.18.9 rather than 0.17 (deviation, minor).** The brief says to pin the latest stable at start time. That is 0.18.9 (`@colyseus/sdk` 0.18.5, `@colyseus/schema` 5.0.36). I read the installed type definitions, since the online docs were unreachable from the build environment. `defineServer`/`defineRoom`, `onDrop`/`onReconnect` + `allowReconnection`, and `filterBy` behave as the brief expects. Schema state uses the `schema({...})` builder rather than decorators, so no `experimentalDecorators` setting is needed. Every schema field has an explicit `.default()`: fields without one start `undefined`, and that caused a `NaN` hit counter during development.

**Other pinned versions.** three 0.186.1, three-mesh-bvh 0.9.15, Vite 8.3.2, TypeScript 5.9.3, Vitest 5.0.3, Playwright 1.56.1 (matching the preinstalled Chromium 1194).

**Parties by slug via `filterBy(['slug'])`.** `POST /api/party` only mints a slug. The first `joinOrCreate('party', { slug })` creates the room, and later joins find it. A link to a dead party simply creates it again under the same slug, so links never dead-end. The 4-player cap is enforced in `onAuth` (throwing `party_full`) with `maxClients = 8`. If the room locked at 4, matchmaking would create a second room with the same slug for the fifth visitor.

**Seats keyed by persistent `playerId`, not session id.** Players live in `state.players` under their localStorage id. A reload or a reopened link inside the 60 s window rebinds the new session to the old seat: team, score and role survive. A pending `allowReconnection` is rejected, and its `onLeave` is ignored because a newer session owns the seat. Colyseus' own automatic reconnection covers network blips.

**Client-owned poses, server sanity checks.** The server rejects pose jumps above `maxPoseSpeed` (12 m/s) and positions outside every room, except during a 1.5 s grace after server-initiated teleports. Server teleports are messages; the client moves its own rig. Hit and grab claims are validated against the hand position from the last accepted pose. Desktop "reach" sends a pose with the hand at the target immediately before the claim.

**WebGL renderer, not WebGPU.** WebGL + WebXR is the stable path in Quest Browser. WebGPU-in-XR was not verified, so it isn't used.

**Static world is unlit with a vertex-colour "bake" (deviation from §9.2 "raycast bake").** Every static mesh uses `MeshBasicMaterial` with a small tiling procedural texture × baked vertex colour. Geometry is merged per room per material, at about 10–25 draws per room. The v1 bake is analytic, computed at load time: hemisphere sky/ground light, one directional term, per-room "light pools" (skylight spots, exhibit spots, fluorescent tubes) and height-based contact darkening. It is cheap on Quest and needs no build step, but it has no real occlusion. `tools/bake-lighting.ts` (BVH ray-cast AO) remains the planned v2. Dynamic objects (avatars, relics, props) use Lambert with one hemisphere and one directional light.

**Geometry subdivision for the bake.** Boxes subdivide about every 2 m so vertex light has resolution. Distant exterior boxes (city blocks, skyline, roads) do not: subdividing them had pushed exterior views to about 930k triangles. Now every bookmark measures ≤ 168k triangles and ≤ 131 draw calls.

**Walls sit inside room bounds; adjacent rooms are back to back.** Each room builds its own four walls, 0.5 m thick, inside its bounds, cutting openings for portals on its edges. Shared walls are therefore 1 m thick, which reads as monumental masonry. Every room's walls always render inside that room, whichever neighbour is culled.

**Map dimensions differ slightly from the brief (deviation, minor).** The footprint is 84 m E–W × 120 m N–S; the courts are 23 m deep to give the bases room. The lobby is 46 × 22 m and runs E–W across the east block. Egypt is split into four corridor "rooms" so the waypoint graph (complete graph per room) can't shortcut through walls. Facade doors are at z −8/0/+8 so paired columns clear the bays. Route results: fast 104 m, tactical west ×1.40, tactical east ×1.38, hidden ×1.69, A→B = B→A.

**Railings collide (deviation from the spirit of §19).** Balcony and catwalk railings block walking, so nobody falls 7 m by accident (comfort). As a result, a shove can't throw a carrier off a catwalk yet. A future option: knockback above a threshold vaults low rails.

**Stairs are ramps** in collision, with stepped visuals. On walkable surfaces (normal.y > 0.55) the capsule is lifted straight up rather than pushed along the normal, which stops slow sliding down the front steps.

**Menu button.** Quest Browser may not expose the left menu button to WebXR. Any button index above 5 that fires is bound and its index shown in the `?buttons` readout. Two fallbacks always work: hold Y for 0.5 s, and poke the left-wrist button with the right hand. Pending: the human's headset test result for the real button.

**Desktop combat.** Clicking with an intact case or a player within about 2 m in front of you punches or bonks. With an empty view, a held object is thrown. F shoves. Desktop reach is a little generous (2 m to a case centre), because the relic pedestal keeps the body 0.7 m from the glass. The server still checks the hand is within 1.1 m of the case.

**Audio is synthesised (deviation from §8.2 sources).** SFX, ambience beds, room reverbs (generated impulse responses) and a gentle generative music loop are all WebAudio. This avoids licensing questions and download weight. Any buffer can be replaced by a CC0 recording later.

**Art.** `tools/fetch-met-art.ts` uses headless Chromium (already installed for Playwright) to resize images and pack 2048² atlases, so no native image library is needed. It emits KTX2 only if `toktx` is installed; otherwise it ships JPEG atlases (deviation from "KTX2 everywhere", for now). The network policy blocked the Met API from the build environment, so the shipped build uses procedural placeholder canvases with the same data shape (brief §8.3 fallback).

**Asset manifest.** `client/public/assets/manifest.json` maps logical ids to files. `file: null` means "use the procedural placeholder". Skeleton models declared with a file are loaded after the build and placed where the procedural skeleton would have been.

**`render.yaml` not verified against live docs.** Render's docs were unreachable from the build environment, so I wrote the Blueprint from my knowledge of the spec: `runtime: node|static`, `staticPublishPath`, `routes` rewrite, and `envVars` with `fromService.property: host`. The client accepts a bare host for `VITE_SERVER_URL`, and the server accepts bare hosts in `CLIENT_ORIGIN`. Check the first deploy log.

**CORS.** `CLIENT_ORIGIN` is not set by the Blueprint: Render's first sync rejected `fromService` pointing at the static site. Set it by hand in the dashboard once the client URL is known; until then the server allows any origin. Colyseus answers CORS for matchmaking and Express routes itself, permissively by default. When `CLIENT_ORIGIN` is set, `matchMaker.controller.getCorsHeaders` restricts it to that origin.

**Modes are registries on both sides.** The server has `MODE_FACTORIES` and the client has `CLIENT_MODES`, one line per mode. A mode only touches `ModeContext`: shared systems, teams, announcements, teleports. Capture the Relic rules are pure functions in `shared/src/rules/ctr.ts`; the server mode is glue. **Free Tour** is the stub mode from M4. It stays, because a timed wander is useful for practice.

**Team names.** Team A is the **Falcons** (gold, North Court, Golden Falcon relic). Team B is the **Masks** (jade, South Court, Jade Mask relic).

**Desktop players in competitive rounds.** Allowed for now (open question 6). Desktop reach and click-to-punch are tuned so they are neither helpless nor dominant.

**Artifact rarity follows placement tier.** Obvious slots hold commons (1 point), tucked slots rares (3), hidden slots legendaries (5). The brief describes tiers and rarities separately. Tying them keeps "harder to find, worth more" readable at a glance, and the values in `tunables.ts` can still flatten scoring. Each round picks 12 of 42 slots as 5 obvious, 4 tucked and 3 hidden.

**Registrar's Desk is the lobby information desk.** It is a 4.5 m delivery ring around the desk, stored as a `desk` zone in map data. Delivery happens automatically when a carrier's feet enter the ring; there is no extra button to press.

**Warmer/colder is client-side.** The hint is computed on the client from synced artifact positions using `hintHeat` in `shared/rules/hunt.ts`. Each tier has a range (obvious 40 m, tucked 24 m, hidden 12 m), and vertical distance counts double. A determined player could read positions from network traffic. That is acceptable for a friends-only game.

**Met-style floor plan.** At the human's request (with a Met floor plan for reference) the museum was rebuilt to follow the Met's layout: entrance on the east facade, a wide Great Hall, the Grand Staircase straight ahead, and a long central hall behind it (our Dinosaur Hall, standing in for the Met's Medieval hall). Wings sit to the north and south, and there is a second floor at 8 m. The relic bases moved to the north and south courts at (-12, ±63). The fast route runs down the Dinosaur Hall; flank routes go through the west wings, through Egypt/Great Hall/Greek, over the upstairs paintings grid, and through the service level. All of them satisfy the brief §6.3 ratios.

**Elevators are short teleports with a fade.** A moving cab in VR causes motion sickness and is a physics problem (players standing on a moving floor). Each elevator is a cab at every stop. Pressing a floor asks the server, which checks that you are in the cab at a stop, moves you, and tells the client to cut to black for 0.3 s and play a ding. You keep your facing. That is comfortable, cheap and cheat-resistant. Stairs remain the "real" way up, and they are faster for a sprinting player.

**Only grand openings extend visibility two rooms.** With longer sightlines the Dinosaur Hall reached 173 draw calls. Portal culling now only looks two rooms deep through 'grand' and 'arch' openings; ordinary doors show just the next room. Worst bookmark is now 142 draws.

**Banner spelling.** The banner reads "Welcome to The Museum", using the same `MUSEUM_NAME` as the facade inscription. The request spelled it "Musuem" (as the repo name does); it is a one-line change if that spelling is intended.

**Touching only redirects strays.** The brief says a touch makes a tourist "turn around". Taken literally, every accidental bump would send happy visitors the wrong way, which is especially likely on desktop, where walking into someone counts. So a touch turns around tourists who are walking the wrong way or heading into a closed area. A tourist already on the route just reacts with comic indignation ("Hey!"). Group followers ignore touches; you have to turn the leader.

**Players and tourists don't collide.** Being pushed around by NPCs in VR is uncomfortable, and so is getting stuck against a crowd. Tourists don't steer around players, and players pass through them; walking into one counts as a touch. Stanchions, ropes and exhibits do block tourists.

**Ropes are implied by stanchions.** There is no separate rope object to manage. Every standing stanchion links to its nearest neighbours within 2.6 m (at most two ropes each), on both the server and the client, using the same function. A rope blocks tourists. A stray who walks into one takes the hint and turns around; a visitor on the route waits, and waiting adds to the congestion meter, which covers the brief's "blocked exits" penalty.

**CPU walk bob instead of a vertex shader.** The brief asks for a vertex-shader walk bob. With at most 40 tourists, setting each instance's matrix on the CPU (a bob, a sway and a hop when huffy) is negligible, and it avoids patching Three.js shaders. There is still no skeletal animation, and the whole crowd is seven instanced draw calls.

**Desktop tap.** Desktop players can't reach out, so a click taps the tourist in front of them (within 1.8 m). It is sent as a `touchAgent` request, and the server checks that the tourist is within 2 m of the player. VR touches are detected on the server from hand poses, so VR needs no extra message.

**Doors are not a Crowd Control tool yet.** The only door in the museum is Egypt's secret door, and it is not on the circuit. Stanchions, ropes and signs cover the brief's routing tools for now. Fire doors on the circuit can be added as map data later without code changes to the mode.

**The client relays every server event.** `Net` used a hand-kept list of event names, so the new `crowd` event was silently dropped. It now relays every key of `ServerEvents`, and the list is checked by the type system.

