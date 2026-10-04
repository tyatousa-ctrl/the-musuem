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
