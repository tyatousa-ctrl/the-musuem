# THE MUSEUM — Build Brief for Claude Code

**WebXR multiplayer VR game · 2–4 players · Meta Quest Browser first, desktop second · GitHub repo · Render deployment**

You (Claude Code) are the engineer and technical artist on this project. This document is the product specification and the build plan. Read it fully before writing code. Put a copy at `docs/BRIEF.md`, and create a short `CLAUDE.md` at the repo root that points to it and restates section 2 (the non-negotiables) and section 3 (how to work).

One museum, built with real care, is the shared playground for four different game modes. The museum is the star. If a player puts on the headset, walks up the steps, passes through the doors and does not involuntarily look up, the build has not succeeded yet, no matter how many features work.

---

## Contents

1. Vision and the feeling we are after
2. Non-negotiables
3. How to work on this project
4. Tech stack and architecture decisions
5. Repository structure
6. The museum: layout, rooms, routes
7. Art direction: making it feel like the Met
8. Asset pipeline and where to get high-quality assets
9. Rendering, lighting and the Quest performance budget
10. Audio
11. Player: locomotion, hands, grabbing, input
12. Networking, parties and invite links
13. Menus and UI
14. Game mode framework
15. Mode: Capture the Relic
16. Mode: Artifact Hunt
17. Mode: Crowd Control
18. Mode: Insurance Fraud
19. Shared combat and KO
20. Shared world interaction and destructibles
21. Deployment on Render
22. Testing, debugging and self-review
23. Milestones with exit criteria
24. Tunables
25. Defaults chosen where the original brief was silent, and questions for the human

---

## 1. Vision and the feeling we are after

The Museum is a 2–4 player WebXR game set inside a large, stylised New York museum that borrows the grandeur and spatial drama of the Metropolitan Museum of Art. It is not a 1:1 replica and must never claim to be the Met. It should feel like the Met's cousin: same limestone, same light, same hush, same sense that the building is far bigger than you.

Tone: playful, tactile, atmospheric, competitive, instantly readable. Think "night at the museum with your friends and no adult supervision". No military realism. No firearms. Fun comes from physical VR actions (smashing glass, grabbing, throwing, shoving), movement, discovery, chaos and clear objectives.

Design pillars, in priority order when they conflict:

1. **Presence.** Scale, light and sound make the player believe the space.
2. **Comfort and frame rate.** A beautiful room at 45 fps is a failed room.
3. **Readability.** A new player understands what to do within seconds.
4. **Map mastery.** Route knowledge is the long-term skill. Hidden routes are learnable, so strategy evolves from discovery into predicting where an opponent will be.
5. **Scope discipline.** One museum, shared systems, four modes that reuse them.

Audience: small groups of friends. Primary target: Meta Quest Browser via WebXR. Secondary: desktop browser for development, QA, spectating and non-VR play-testing.

---

## 2. Non-negotiables

Do not remove or quietly stub any of these to make development easier. If one is blocking you, stop and tell the human.

- Real-time multiplayer for 2–4 players with a server-authoritative match state.
- WebXR immersive VR on Quest Browser, plus working desktop controls.
- Party invite links (`/party/<slug>`). No typed room codes, ever.
- Join-in-progress for every mode, following the rules in section 12.
- One shared museum and one shared set of systems (networking, interaction, KO, breakables, NPC agents) reused by all modes.
- Modular mode architecture: adding a fifth mode must not require editing the other four.
- Server URL and environment settings are configurable between local and Render. Nothing hard-coded.
- No firearms, no graphic violence. KO is a playful daze.
- Stable VR frame rate beats visual excess every time.

---

## 3. How to work on this project

**Build in milestones.** Section 23 lists them. Finish one, verify it, commit, update `docs/PROGRESS.md`, then move on. Do not start game modes before the museum shell, locomotion and networking are solid.

**Keep three living documents.**

- `docs/PROGRESS.md`: what is done, what is in progress, known issues.
- `docs/DECISIONS.md`: every meaningful technical choice, one paragraph each, with the reason. When you deviate from this brief, log it here.
- `docs/HEADSET_TESTS.md`: a checklist the human runs in the headset after each milestone. You cannot put on a Quest, so be precise about what they should look at and what "good" looks like.

**Be honest about what you verified.** Say "verified on desktop via automated test", "verified by screenshot", or "not verified in headset". Never report VR behaviour as working when you have only reasoned about it.

**Check current docs before using an API.** Library versions move. Before wiring up Three.js XR features, Colyseus rooms, or the Render Blueprint, read the current official documentation and pin exact versions in `package.json`. At the time of writing, Colyseus is on the 0.17 line (automatic reconnection, `defineServer()`), with newer releases appearing; pin whatever is the latest stable when you start and note it in `DECISIONS.md`.

**When something is underspecified,** choose the simplest design that preserves the gameplay rules here and keeps iteration easy. Log the choice. Section 25 lists defaults already chosen for you.

**Look at your own work.** For anything visual, capture screenshots from the camera bookmarks (section 22) and critique them against section 7 before calling a room done. Iterate at least twice on each hero space.

**Placeholders are fine, dead ends are not.** Use placeholder art freely, but always behind the asset manifest (section 8) so better assets drop in without code changes.

**Don't overbuild.** No accounts, no progression, no cosmetics, no settings beyond what section 13 lists, until the first-playable criteria in section 23 are met.

---

## 4. Tech stack and architecture decisions

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript everywhere | Shared types between client and server. |
| Client rendering | Three.js with `WebGLRenderer` + WebXR | Use the WebGL renderer for XR unless you confirm the WebGPU path is stable in Quest Browser. Log the decision. |
| Build | Vite | `VITE_SERVER_URL` env var for the server address. |
| Collision | `three-mesh-bvh` against simplified collision meshes | Capsule-vs-BVH for the player. No general physics engine for locomotion. |
| Small physics | Lightweight custom kinematics for thrown objects and debris | Add Rapier (WASM) only if a mode truly needs it; if you do, keep it off the render thread's critical path. |
| Server | Node.js + Colyseus | One Colyseus room per party, alive across lobby and all modes. |
| Shared code | `shared/` workspace | Map data, tunables, message types, pure rules functions. |
| Tests | Vitest for rules, Playwright for client smoke tests, headless bot clients for the server | See section 22. |
| Deploy | Render: static site (client) + web service (server), via `render.yaml` | Section 21. |

**Authority model.** The server owns: scores, timers, team assignment, relic state, KO and respawn state, NPC/tourist state, destructible state, tool state, round state and the active mode. Clients own their own head and hand poses (VR poses cannot be server-simulated); the server sanity-checks them (max speed, inside map bounds, not inside walls at coarse resolution) and rejects impossible claims. Every gameplay-relevant action is a *request* from the client ("I hit case 12 with speed 3.1 m/s") that the server validates against positions, cooldowns and state before applying.

**Rules as pure functions.** Put each mode's rules in `shared/` or `server/` as deterministic functions over state (`applyEvent(state, event) → state`). The Colyseus room is a thin shell that feeds events in and syncs state out. This is what makes the modes unit-testable without a browser.

---

## 5. Repository structure

```
the-museum/
  CLAUDE.md
  README.md
  render.yaml
  package.json                # npm workspaces: client, server, shared, tools
  docs/
    BRIEF.md  PROGRESS.md  DECISIONS.md  HEADSET_TESTS.md  CREDITS.md
  shared/
    src/
      config/tunables.ts      # every gameplay number lives here
      map/                    # rooms, portals, spawns, zones, waypoint graph, case + artifact slots
      net/                    # message names, payload types, enums
      rules/                  # pure rules helpers shared by client prediction and server
  client/
    index.html
    public/assets/            # processed, shippable assets only
    src/
      main.ts
      core/                   # renderer, XR session, loop, asset manifest loader, quality tiers
      world/                  # museum kit (parametric architecture), room builders, portals, lighting
      player/                 # rig, locomotion, hands, grab, input abstraction, desktop controls
      multiplayer/            # Colyseus client, party URL handling, remote avatars, interpolation
      interaction/            # grabbables, breakables, doors, tools, hit detection
      npc/                    # instanced agent rendering (tourists, guards)
      modes/
        capture-the-relic/
        artifact-hunt/
        crowd-control/
        insurance-fraud/
      ui/                     # personal menu, lobby panel, HUD, world-space text
      audio/
      debug/                  # perf HUD, camera bookmarks, dev panel
  server/
    src/
      index.ts
      rooms/PartyRoom.ts
      state/                  # Colyseus schemas
      systems/                # ko, breakables, agents, teams, spawn, timers
      modes/                  # one folder per mode, each implementing ServerMode
      http/                   # party create / lookup, health check
  tools/
    fetch-met-art.ts          # pulls CC0 artwork + plaque metadata
    process-assets.ts         # gltf-transform: simplify, meshopt, KTX2
    bake-lighting.ts          # build-time AO / sky-light bake
    measure-routes.ts         # checks route lengths against the route rule
  assets-src/                 # raw downloads, not shipped (gitignored or LFS)
```

---

## 6. The museum: layout, rooms, routes

Build the museum shell before any game mode. Work in metres, 1 unit = 1 m. The player is about 1.7 m tall; scale everything from that. Ceilings should be much higher than feels reasonable. That is the point.

### 6.1 Site plan

The entrance faces east onto the avenue, as the Met's does. North is "uptown".

```
                                N (uptown)
   +--------------------------------------------------------+
   |              NORTH COURT  (Temple Court)               |   Base A
   |        sandstone temple, reflecting pool, glass wall   |
   +-----------+------------------+-------------------------+
   |           |                  |                         |
   |   ART     |    DINOSAUR      |     EGYPT WING          |
   | GALLERIES |      HALL        |  tomb corridors,        |
   |  (west    |  (central nave,  |  hidden passages        |
   |  enfilade)|   skylit, long)  |                         |
   |           |                  +-------------------------+
   |           |   grand stair    |      GRAND LOBBY        |=== steps === AVENUE (E)
   |           |   + arch  <------+  three domes, balcony   |    plaza, fountains
   |           |                  +-------------------------+
   |           |                  |  WORLD CULTURES WING    |
   |           |                  |  dioramas, tall forms,  |
   |           |                  |  layered cover          |
   +-----------+------------------+-------------------------+
   |              SOUTH COURT  (Glass Court)                |   Base B
   |        sculpture court, slanted glass wall             |
   +--------------------------------------------------------+
        Below everything: SERVICE LEVEL (corridors, freight, stairwells)
        Above the lobby:  UPPER BALCONY, bridging to the Dinosaur Hall catwalk
```

Target footprint roughly 110 m north–south by 85 m east–west. Treat every dimension in this section as a starting point: adjust for fun and for performance, and record changes in `DECISIONS.md`.

### 6.2 Rooms

**Exterior and steps (spawn).** Players spawn on broad stone steps facing a Beaux-Arts facade: three tall arched bays, paired Corinthian columns on high pedestals between them, a heavy cornice, long banners hanging between the columns, flanking fountains on the plaza. Behind the player: the avenue with moving yellow cabs and buses (simple looping instanced vehicles), a row of street trees, apartment buildings across the street, a skyline silhouette beyond. A hot-dog cart and a few street lamps sell "Upper East Side" in one glance. The player must be able to read "big New York museum" before taking a step. The exterior is a vista: detailed only where the player can walk, cheap cards and low-poly blocks beyond.

**Grand Lobby.** The social hub and the first "wow". About 46 × 22 m, ceiling 20 m. Three shallow domes in a row, each with a round skylight; giant arches on all sides; a balcony ringing the second level; pale limestone everywhere; an octagonal information desk in the centre; oversized flower arrangements in wall niches; a monumental stair on the west side leading up and through to the Dinosaur Hall. Tall entrance windows and glazed doors keep the avenue visible from inside. The lobby floating menu (section 13) lives here. Doors: north to Egypt, south to World Cultures, west to the grand stair.

**Dinosaur Hall (fast, exposed).** The central spine: a long skylit nave, about 75 × 20 m, ceiling 18 m, running north–south and connecting directly to the antechambers of both courts. Two or three huge mounted skeletons on plinths, ribcages and legs usable as partial cover, long clean sightlines, an elevated catwalk along both sides reachable by stairs and from the Upper Balcony. (The real Met has no dinosaurs. This wing is our invention; give it the same limestone and vaulting so it belongs to the building.)

**Art Galleries (tactical).** A west-side enfilade of 7–9 connected rooms running north–south, parallel to the Dinosaur Hall, with cross-doors into it at two or three points. Coloured damask-style walls, gilded frames, skylit coved ceilings, benches, free-standing partition walls, sculpture on plinths. Lots of corners, multiple exits per room, ambush cover. One larger sculpture gallery with a barrel-vaulted skylight breaks up the rhythm.

**World Cultures Wing (dense, winding).** South-east block between the lobby and the South Court. Tall carved forms, masks and figures in cases, large dioramas, platforms at different heights, a suspended long canoe overhead. Cover is layered and paths braid: there are always two ways around any exhibit. Darker walls with pools of spotlight.

**Egypt Wing (slow, hidden).** North-east block between the lobby and the North Court. Narrow, low, tomb-like corridors, a walk-through mastaba chapel, sarcophagi, statue rows, small side chambers. Contains at least two concealed passages (a pivoting false door; a crawl-height shaft behind a sarcophagus) that connect to the service level or shortcut between corridors.

**North Court (Base A).** A vast bright room: a sandstone temple and gateway on a raised platform, a still reflecting pool in front, and one entire wall of slanted glass looking out to park trees. The contrast with the tight Egypt corridors is the drama.

**South Court (Base B).** A matching scale court with a slanted glass wall, monumental sculpture and carved poles, a mezzanine on one side. Different character from the North Court but equal in size, cover and number of entrances so Capture the Relic stays fair.

**Upper Balcony.** Rings the lobby at second-floor level, with views down into it. Bridges west to the Dinosaur Hall catwalk and has small stairs down into Egypt and World Cultures. An overlook and an alternate crossing.

**Service level and staff areas.** Painted concrete block, exposed pipes, fluorescent tubes, fire doors, a freight lift, crates, a security office, a conservation lab. A basement corridor loop under the public floors with stairwells or lift access near each court, the lobby, Egypt (hidden) and World Cultures (a door at the back of a diorama). Deliberately ugly: the contrast makes the galleries feel grander.

### 6.3 Route design rule

Every major objective path, and base-to-base in particular, must offer three meaningful choices:

- **Fast:** Dinosaur Hall. Shortest, obvious, exposed, easy to intercept.
- **Tactical:** Art Galleries (west) or lobby-side galleries (east). Moderate length, more cover, more corners, multiple exits.
- **Hidden:** Service level and concealed passages. Clearly longer, hard to find at first, safe from sightlines.

Write `tools/measure-routes.ts` to compute path lengths on the waypoint graph. Targets: tactical is 1.25–1.5× the fast route, hidden is 1.6–2.0×. Base A→B and B→A must be within 10% of each other on every route type. Run it in CI and whenever the map changes.

### 6.4 Map data

The map is data, not just meshes. `shared/map/` defines, for use by both client and server:

- Rooms (id, bounds, floor heights) and portals between them (doors, arches, stairs).
- Spawn points: exterior steps, lobby return points, team bases.
- Zones: base capture zones, restricted areas, exits, choke points.
- A waypoint graph for NPC navigation and route measurement, with one-way "visitor circuit" directions for Crowd Control.
- Slots: display-case positions, artifact candidate positions, tool spawn positions, destructible ids with insured values.
- Doors and barriers with their default states.

Client room builders read the same data, so geometry, gameplay and the server can never disagree about where a door is.

### 6.5 How to build the geometry

You do not have a 3D artist. Build the architecture procedurally from a **parametric kit** in `client/src/world/kit/`, then merge it per room:

- Column (base, fluted shaft, simplified Corinthian or Doric capital) from lathe + instancing.
- Round arch and arcade; pier; pilaster.
- Barrel vault and coffered ceiling; saucer dome with oculus; skylight lantern with mullions.
- Cornice, architrave, skirting and door surround, each extruded from a 2D moulding profile.
- Balustrade, stair flight, plinth, display case (intact, cracked, shattered variants), bench, stanchion and rope, picture frame, wall label.

Mouldings matter more than polygons. A flat wall with a proper skirting, a dado line and a deep cornice reads as architecture; a box does not. Bevel large edges so they catch light.

Each room is a builder function keyed by room id. Structure it so a hand-modelled `.glb` for that room id can replace the procedural version later with no other code changes; collision always comes from a separate simplified mesh.

---

## 7. Art direction: making it feel like the Met

The feeling comes from a short list of things. Get these right before adding any detail.

1. **Scale.** Doors 4–5 m tall, columns 10 m+, ceilings 15–20 m in halls. Use human-scale objects (benches, stanchions, a desk, labels at eye height) so the eye can measure the room.
2. **Limestone and light.** Warm pale limestone walls, honed marble or terrazzo floors with a soft sheen, daylight falling from above through skylights. Gentle gradients, soft contact shadows, slightly warm key and cool fill.
3. **Contrast between rooms.** Bright lobby → tight dark Egypt corridors → blazing glass court. Jewel-coloured painting galleries. Raw concrete back-of-house. Every threshold should change the light, the colour and the sound.
4. **Real art.** Real public-domain paintings in gilded frames with real wall labels (title, artist, date, medium). This single detail does more than any shader. See section 8.
5. **Museum furniture.** Brass stanchions with velvet rope, wood-and-leather benches, glass vitrines with thin bronze frames, label rails, discreet signage, floor plan stands, a coat check, donation boxes.
6. **Atmosphere.** Dust motes in skylight shafts (a few cheap additive quads), faint reflections on the floor, the hum of a big room.
7. **Life outside.** Through every window: moving traffic on the avenue side, trees and sky on the park side.

Style: stylised realism. Clean, slightly simplified forms with believable materials, not cartoon and not photoreal. Avoid noisy textures; let lighting and proportion do the work.

Legal and tone guardrails: do not use the Met's name, logo or signage in-game. The building is an original design "inspired by". Artworks are credited on their labels and in `docs/CREDITS.md`. Insured values in Insurance Fraud are obviously fictional game numbers.

**Visual review loop.** For each hero space (exterior, lobby, Dinosaur Hall, both courts), take screenshots from its bookmarks and ask: Does it read as monumental? Is there a clear focal point? Is the light coming from somewhere? Are there three depth layers? Would a stranger say "museum" in one second? Fix and repeat.

---

## 8. Asset pipeline and where to get high-quality assets

### 8.1 The manifest

All assets load through `client/public/assets/manifest.json`: logical id → file, type, quality tier, licence, source URL. Code asks for `painting.european.014` or `prop.bench.oak`, never a path. Swapping a placeholder for a better model is a manifest edit. Missing assets fall back to a generated placeholder and log a warning; the game must always boot.

Every third-party asset gets a line in `docs/CREDITS.md` with title, author, source URL and licence. Use CC0 wherever possible. Do not ship anything with an unclear licence.

### 8.2 Sources

Check the licence on each individual item; collections are mostly, not universally, CC0.

| Need | Source | Notes |
|---|---|---|
| Paintings, drawings, object photos, plaque metadata | **The Met Collection API** (`metmuseum.github.io`, served from `collectionapi.metmuseum.org`) | No API key. Use only objects where `isPublicDomain` is true; those images are CC0. Be polite with request rate. |
| Scanned sculptures and objects | **The Met's Open Access 3D models** (published 2026, most are CC0) | Download from the object pages. The API may not expose model URLs, so ask the human to download a shortlist into `assets-src/met3d/`. Scans are heavy and must be decimated. |
| Fossils, skeletons, natural history, more sculpture | **Smithsonian 3D Open Access** (`3d.si.edu/cc0`) | CC0 per object. Look here first for dinosaur and mammal skeletons. |
| PBR materials: limestone, marble, terrazzo, wood, brass, concrete | **Poly Haven**, **ambientCG** | CC0. Downscale hard for Quest. |
| Sky and environment lighting | **Poly Haven HDRIs** | CC0. Use for the sky dome and to derive ambient light, not as a runtime PBR environment on Quest. |
| Low-poly props, vehicles, street furniture, placeholders | **Kenney**, **Quaternius** | CC0. Good for avenue traffic and background dressing. |
| Other models | Sketchfab filtered to CC0 | Needs a login to download; treat as a human task. |
| Sound effects | Kenney audio, Freesound filtered to CC0 | Glass, alarms, footsteps, crowd murmur, impacts. |
| Music | Public-domain classical recordings | Check the recording's licence, not just the composition's. |

### 8.3 Real art on the walls

Write `tools/fetch-met-art.ts`:

1. Call the departments endpoint to confirm ids, then search with `hasImages=true` (and highlights first) per relevant department: European paintings, Egyptian art, the Africa/Oceania/Americas department, Greek and Roman, arms and armour.
2. Fetch each object; keep it only if `isPublicDomain` is true and it has a primary image.
3. Download the smaller image variant, resize so the long edge is at most 1024 px (512 for small works), pack into atlases, encode to KTX2.
4. Write `paintings.json`: id, title, artist, date, medium, real-world dimensions, aspect ratio, atlas rect, object URL. The frame is sized from the real dimensions so a huge canvas is huge and a miniature is small.
5. Generate the wall label from the metadata and render labels into a text atlas.

Images are fetched at build time and shipped with the game. Never hot-link at runtime. If the network is unavailable where you are running, generate procedural placeholder canvases with the same data shape and leave a note in `PROGRESS.md` for the human to run the script.

Aim for 80–150 works. Curate by room: a hall of large European canvases, a room of portraits, Egyptian reliefs and papyri in the Egypt wing, textiles and carved works for World Cultures.

### 8.4 3D model processing

`tools/process-assets.ts` uses gltf-transform to weld, simplify, compress geometry with Meshopt, resize textures and convert them to KTX2, then writes to `client/public/assets/` and updates the manifest. Budgets per asset:

| Class | Triangles | Texture |
|---|---|---|
| Hero piece (temple, skeleton, major sculpture) | 15k–40k | one 2048 or two 1024 |
| Medium exhibit | 2k–8k | 1024 or shared atlas |
| Small prop / relic / tool | 300–2k | 512 or atlas |
| Tourist / guard NPC | 300–800, instanced | shared atlas |

If no suitable skeleton scan is available, build stylised skeletons procedurally (spine spline, rib loops, limb bones as tapered capsules). A strong silhouette matters more than anatomical accuracy.

---

## 9. Rendering, lighting and the Quest performance budget

Quest is a mobile GPU rendering two eyes. Design for it from the first commit; do not plan to "optimise later".

### 9.1 Budget (starting targets, validate on device)

- Frame rate: 72 fps minimum, never dipping in the lobby; 90 where achievable.
- Draw calls: ≤ 150 in view. Triangles: ≤ 350k in view.
- No real-time shadow maps on Quest. No post-processing passes on Quest.
- At most one real-time directional light; everything else baked or faked.
- Textures in KTX2, atlased, mipmapped. Watch total GPU texture memory.
- Enable fixed foveated rendering and tune the XR framebuffer scale; expose both in the debug panel.
- Zero per-frame allocations in the main loop. Pool vectors, particles and audio nodes.

### 9.2 Techniques

- **Room and portal culling.** The single biggest win in a museum. Render the current room plus rooms visible through open portals; hide everything else. Derive it from the map data.
- **Merge and instance.** Merge static geometry per room per material. Use `InstancedMesh` (or `BatchedMesh`) for columns, frames, benches, stanchions, NPCs, traffic.
- **Baked light.** `tools/bake-lighting.ts` precomputes ambient occlusion and sky/skylight contribution at build time (ray-casting with `three-mesh-bvh`), stored as vertex colours first and low-resolution lightmaps for hero rooms if needed. Materials on Quest are unlit-plus-baked or Lambert, not full PBR.
- **Fake the expensive things.** Light shafts are additive gradient quads. Floor sheen is a low-resolution per-room cubemap captured once and frozen. Contact shadows under props and players are blob decals. Glass is a cheap fresnel-tinted transparent material, sorted carefully, with cracks as decal overlays.
- **Vistas.** The street and the park are low-poly geometry plus image cards beyond a short distance.
- **LOD.** Two levels for hero meshes. Paintings far away use lower mips automatically; make sure atlases have mip padding.
- **Quality tiers.** `quest`, `desktop`, `desktop-high`. Desktop may add real shadows, PBR and a light bloom so screenshots and spectating look great. Tier selection is automatic with a manual override.

### 9.3 Perf HUD

A toggleable in-world panel (and desktop overlay) showing fps, frame time, draw calls, triangles, visible rooms, NPC count and network round-trip. Build it in milestone 1 and keep it working.

---

## 10. Audio

Sound is half of presence, and it is cheap on Quest.

- **Room acoustics.** Each room has a reverb preset (convolution or a cheap feedback network): long bright tail in the lobby, longer still in the courts, short and dead in Egypt corridors, boxy in service corridors. Crossfade at portals.
- **Ambience beds.** Distant murmur and footsteps in the lobby, street noise near the entrance, water in the North Court, ventilation hum in the service level.
- **Footsteps** by surface (marble, wood, concrete, metal catwalk), for local and remote players. Hearing an opponent's footsteps on the catwalk is gameplay.
- **Positional one-shots:** glass crack, glass shatter, alarm (per-case, loud, directional, audible across several rooms), relic pickup and drop, shove impact, KO jingle, tool hits, tourist reactions.
- **Music:** light, looping, separate bus. Lobby theme between rounds, per-mode tension layers.
- Two independent buses with independent controls: **Music** and **FX**. Both togglable from the personal menu and the lobby panel. Persist the preference locally.
- Audio must start after the user gesture that enters VR or clicks "Play".

---

## 11. Player: locomotion, hands, grabbing, input

### 11.1 Input abstraction

All gameplay reads **actions**, never raw buttons: `move`, `turn`, `sprint`, `grabLeft`, `grabRight`, `useLeft`, `useRight`, `menuToggle`, `jump/climb` (if used), `uiPoint`, `uiSelect`. A bindings table maps device inputs to actions for Quest Touch controllers, generic `xr-standard` gamepads, and keyboard/mouse. Rebinding is a data change.

**Menu button caveat.** The brief calls for the left-hand menu button to toggle the personal menu. Browsers do not always expose that button to WebXR. In milestone 2, add a debug readout of every button index on both controllers and ask the human to press the left menu button in the headset and report what fires. Bind it if it is exposed. Regardless, ship a fallback so the menu is always reachable: press-and-hold Y on the left controller for half a second, and a small wrist button on the left forearm that the right hand can poke. Log the result in `DECISIONS.md`.

### 11.2 VR locomotion and comfort

- Smooth locomotion on the left stick, head-relative by default (option: hand-relative).
- Snap turn on the right stick by default (30° or 45°); smooth turn as an option.
- Sprint by clicking the left stick; modest speed, optional stamina (tunable, default off).
- Comfort vignette during movement, on by default, adjustable.
- Capsule collision against the collision mesh, with step-up for stairs and slide along walls. The player's real-world head movement must not let them see or walk through walls: fade to black when the head is inside geometry and push the rig back.
- Stairs are ramps in the collision mesh. No jumping in the first build; reach catwalks by stairs and ladders. Hand-over-hand climbing is a stretch goal.
- Recenter/reset orientation from the personal menu.
- Seated and standing both supported; height is calibrated on VR entry.

### 11.3 Hands and grabbing

- Simple stylised gloves following the controllers, with open, grip and point poses.
- Grip button grabs the nearest grabbable in a small sphere around the hand; release drops; release with velocity throws. Compute throw velocity from the last few frames of hand motion.
- One object per hand. Some objects are two-handed (sledgehammer).
- Punch and shove detection uses hand velocity plus overlap (section 19).
- Haptic pulses on grab, hit, glass crack and shatter.
- Distance interaction for UI only, via a ray from the hand.

### 11.4 Desktop controls

WASD + mouse look, Shift to sprint, E / left click to grab or use with the right hand, Q for the left hand, hold and release to throw, F to shove, Esc or Tab for the personal menu. The desktop player has a visible avatar with simulated hands so mixed sessions work. Desktop is a first-class test target: every mode must be completable on desktop.

Add a `?spectate=1` free-fly camera for capture and debugging.

### 11.5 Avatars

Head (with a simple face or visor so facing direction reads), two hands, and a floating torso inferred from head position. Team colour on the torso and gloves. Name tag above the head in the lobby. A dazed state with circling stars for KO. Keep avatars under about 3k triangles.

---

## 12. Networking, parties and invite links

### 12.1 Party lifecycle

- A party is one Colyseus room that persists across the lobby, every mode and between-round transitions. Changing mode never changes rooms.
- "Create party" calls the server, which returns a short slug. The client navigates to `/party/<slug>`. The host sees a "Copy invite link" button and, in VR, the link shown on the lobby panel.
- Opening `/party/<slug>` joins that exact party automatically. No code entry. The internal Colyseus room id stays invisible.
- If the party's room no longer exists (server restart, everyone left a while ago), opening the link recreates the party under the same slug, and the first arrival becomes host. The link never dead-ends.
- Opening the site root offers one button: "Start a party".
- Empty parties are kept alive for a grace period (tunable, default 10 minutes) before disposal.
- Host leaves → the longest-present remaining player becomes host. Announce it.
- Max 4 players. A fifth visitor gets a friendly "party is full, spectate?" option (spectating is a stretch goal; a clear "full" message is enough for first playable).

### 12.2 Identity and reconnection

- On first visit the client generates a persistent `playerId` and display name, stored in `localStorage`. No accounts.
- On an unexpected disconnect, the server keeps the player's seat (team, score, mode role) for a reconnection window (tunable, default 60 seconds) and marks the avatar as "reconnecting". Use Colyseus's built-in reconnection support.
- Reloading the page or reopening the same link within the window restores the same seat. After the window, the player rejoins under the join-in-progress rules below.
- If a carrier disconnects, the relic or mode object drops at their last position immediately.

### 12.3 Join-in-progress rules

| Mode | Rule |
|---|---|
| Lobby | Join immediately, spawn on the exterior steps. |
| Capture the Relic | Join the team with fewer players; if even, random. Spawn at team base on a safe respawn. |
| Artifact Hunt | Join immediately, inherit the current world state. No retroactive credit for earlier finds. |
| Crowd Control | Join immediately as another security player while the current wave continues. |
| Insurance Fraud | Spectate until the next round (a timed score contest is unfair to join halfway). Give spectators a free-fly view and the live scoreboard. |

### 12.4 State, messages and rates

- **Schema state** (auto-synced): party (members, host, selected mode, settings), round (phase, timer, scores, teams), players (pose, team, status, held object ids), mode-specific state, breakables, agents.
- **Poses:** head and both hands (position + quaternion). Client sends at about 20 Hz; remote avatars render about 100 ms in the past and interpolate. Quantise if bandwidth needs it.
- **Server tick:** 20 Hz for game logic, 10 Hz for NPC agents with client-side interpolation. All timers run on server time; clients display server-time-corrected countdowns.
- **Requests** (client → server): `grab`, `release{velocity}`, `hitBreakable{id, speed}`, `shove{targetId, impulse}`, `selectMode`, `startRound`, `setSetting`, `leaveParty`.
- **Events** (server → clients, for one-shot feedback): `glassCracked`, `glassShattered`, `alarm`, `ko`, `scored`, `announcement`.
- Give the local player instant feedback (predict the grab, play the hit sound), then reconcile with the server's answer. If the server rejects, snap back gracefully.
- Only the host can change authoritative party and game settings; everyone can see them. The server enforces this, not the UI.

### 12.5 Round flow

`LOBBY → COUNTDOWN (5 s, players moved to mode spawns) → PLAYING → ROUND_END (results, 10 s) → LOBBY`. Returning to the lobby keeps the party intact and places everyone in the Grand Lobby near the floating panel.

---

## 13. Menus and UI

All in-VR UI is world-space. No flat page overlays in the headset. On desktop, the same panels render in-world, with a thin DOM layer allowed only for the pre-join landing page.

### 13.1 Personal menu

Toggled by `menuToggle` (section 11.1). Press once to open, again to close.

- Appears about 1.2–1.5 m in front of the player at chest height, tilted toward them, never closer than 0.75 m to the face. It stays where it was opened and re-places itself if the player walks away.
- Opening it never pauses the shared world or disconnects the player. Show a small "menu open" icon on that player's avatar so others know why they stopped moving.
- Items: Resume, Music (toggle + volume), FX (toggle + volume), Recenter, Leave party (with confirm).
- Later, not now: comfort settings beyond the basics, locomotion options, captions.
- Large type, high contrast, generous hit targets. Usable with either hand's ray.

### 13.2 Lobby floating menu

A persistent physical object in the Grand Lobby, near the information desk: a large free-standing illuminated panel, styled like a museum wayfinding totem. Part of the world. Players walk up and use it by ray or by touching it.

- Current party members, with host marked.
- The invite link (short and readable) and a "copy link" action on desktop.
- Game mode selection: four cards, each with a name, one-line pitch and player-count note.
- Round settings where relevant (round length, score limit, FFA or teams for Artifact Hunt).
- Start Round (host only).
- Music and FX toggles.
- Non-hosts see everything, with host-only controls visibly locked.
- A vote system is explicitly deferred. Do not build it for first playable.

### 13.3 HUD

Minimal and diegetic where possible. A wrist display on the non-dominant arm shows timer, score and mode status. Big moments ("RELIC STOLEN", "YOUR RELIC IS HOME") appear as brief world-anchored announcements plus audio. Desktop gets a conventional corner HUD.

### 13.4 Onboarding

No tutorial level. Each mode shows a five-second, three-line "how to play" card during the countdown. The first time a player approaches a display case or tool, a small ghost-hand hint shows the gesture.

---

## 14. Game mode framework

Each mode is a module on both sides, registered by id.

```ts
// server
interface ServerMode {
  id: ModeId;
  minPlayers: number; maxPlayers: number;
  joinPolicy: 'immediate' | 'spectateUntilNextRound';
  onEnter(ctx: ModeContext): void;                 // set up state, spawn objects, assign teams
  onPlayerJoin(ctx, player, midRound: boolean): void;
  onPlayerLeave(ctx, player): void;
  onRequest(ctx, player, type: string, payload: unknown): void;
  tick(ctx, dtMs: number): void;
  isRoundOver(ctx): RoundResult | null;
  onExit(ctx): void;                               // restore the museum to neutral
}

// client
interface ClientMode {
  id: ModeId;
  enter(world, net, ui): void;
  update(dt: number): void;
  exit(): void;
}
```

`ModeContext` exposes the shared systems: teams, spawns, KO, breakables, grabbables, agents, timers, announcements, map data, tunables. Modes use these and do not reimplement them.

`onExit` must leave the museum clean: cases resealed, objects removed, doors reset, NPCs despawned. The same room should feel different in each mode, through what is placed in it and how it is lit and scored, not through separate map copies.

---

## 15. Mode: Capture the Relic

Competitive capture-the-flag. Each team guards a relic in a glass display case at its base. To steal one you must physically smash the glass, which triggers an alarm, then grab the relic and carry it home.

**Teams.** 2v2 ideal. 1v1 and 2v1 supported (the short-handed team gets a faster respawn, tunable). One player alone can start a practice round with no opponent.

**Bases.** Team A: North Court. Team B: South Court. Each base has the relic case, a clearly marked capture zone and safe respawn points out of sight of the case.

**Relics.** Two distinct, readable objects (for example a golden falcon and a jade mask), softly glowing in team colour, each sized to fill one hand.

**Rules.**

- Breaking the case takes a clear physical action: a fast punch or a strike with a held object. First valid hit cracks the glass with a sharp sound; the second shatters it and starts the alarm. The alarm is loud, positional, audible across neighbouring rooms, and announced to both teams.
- The relic occupies one of the carrier's hands. The carrier can drop it or throw it deliberately; a teammate can catch it or pick it up.
- If the carrier is KO'd, the relic drops at that exact spot and the player respawns at base.
- If a defender touches their own dropped relic, it returns to its case instantly and the case reseals.
- A dropped relic never returns just because time passes.
- A team can score only while its own relic is at home. Score by carrying the enemy relic into your capture zone.
- If both relics are out, the match becomes two simultaneous manhunts. Announce it.
- Respawn delay 3–5 seconds (default 4).
- Combat is KO and knockback (section 19), never death.

**Relic state machine (server).** `HOME → CARRIED(playerId) → DROPPED(position) | IN_FLIGHT → DROPPED → CARRIED | HOME`. Every transition is validated and emits an event.

**Win condition.** First to 3 captures, or highest score when the 8-minute timer ends; sudden death on a tie. All tunable.

**Anti-stalemate (tunable, default on).** A carried relic hums audibly and pulses its glow, so hiding forever is hard. This is a nudge, not an auto-return.

**Vertical slice order.** Glass smash → relic grab, drop, throw → KO and respawn → return rule → scoring → round flow → join-in-progress.

---

## 16. Mode: Artifact Hunt

Competitive (free-for-all) or team-based exploration. Valuable artifacts are hidden around the museum; players race to find and secure them.

- Each round, the server places about 12 artifacts chosen from 40+ candidate slots defined in map data, so layouts differ every round.
- Difficulty tiers by placement: obvious (on a plinth in plain view), tucked (behind exhibits, on catwalks, inside open cases), hidden (service corridors, concealed passages, behind an interactable such as a sliding panel or a sarcophagus lid).
- Scoring by rarity: Common 1, Rare 3, Legendary 5. If playtests show plain counting is enough, the tunables can flatten this.
- **Securing:** grab the artifact and carry it to the Registrar's Desk in the Grand Lobby. This creates traffic through the hub and chances to intercept. A KO forces a drop. One artifact per hand.
- New players are not helpless: the wrist display has a warmer/colder indicator for the nearest unfound artifact, weakened for higher tiers.
- Round ends when all artifacts are secured or the timer (default 6 minutes) expires.
- Join-in-progress: immediate, current world state, no retroactive credit.

---

## 17. Mode: Crowd Control

Co-op. Players are museum security managing waves of tourists who are going the wrong way.

**Core loop.** The museum has a one-way visitor circuit (floor arrows and signs, defined on the waypoint graph). Tourists enter in waves and many of them walk against it or toward places they should not be. Physically touching a tourist makes them turn around and walk the other way. The challenge is redirecting flow, not fighting. Tourists are never hurt; they react with comic indignation.

**Tourist types.**

| Type | Behaviour |
|---|---|
| Normal | Redirects on one touch. |
| Kid | Runs. May ignore the first touch or veer off again after a few seconds. |
| Group | Followers trail a leader; redirect the leader and the group follows. |
| Stubborn | Needs multiple touches. |
| Lost | Picks poor routes, wanders toward restricted areas. |
| Tour guide | Pulls a cluster of nearby tourists along behind them. |
| Influencer | Stops in choke points to film, causing jams until moved along. |

**Tools.** Stanchions and ropes players can pick up and place, doors that open and close, moveable signs that bias routing, barriers. All are shared world interactables reused from other modes.

**Scoring.** Points for tourists correctly routed through to the exit; penalties for congestion (too many agents in a choke zone for too long), blocked exits, and breaches of restricted areas. Five waves of rising difficulty, a star rating at the end. Fail if the congestion or breach meter fills.

**Implementation.** Agents are simulated on the server on the waypoint graph with simple separation and following, at 10 Hz, and interpolated on clients. Render with instancing and a vertex-shader walk bob; no skeletal animation on Quest. Cap around 40 simultaneous agents on Quest and validate on device. Build the agent system as a shared system: Insurance Fraud's guards reuse it.

Join-in-progress: immediate, as another security player.

---

## 18. Mode: Insurance Fraud

Competitive timed destruction. Every destructible object shows its insured value. Run up the biggest insurance bill before the timer ends.

- Every destructible has an insured value on a visible tag, and hit points and a required tool class scaled to that value.
- Tools: museum mallet, crowbar, fire axe, sledgehammer (two-handed), fire extinguisher, a rolling object (cart or stone ball), a ceremonial prop weapon. Each has durability and limited spawns. Players can race for scarce tools and steal them (a KO forces a drop).
- **Security Level** is personal, 0–5, and rises as you damage expensive things. Escalation: your position is revealed to others, doors near you close, alarms sound, then guards pursue. Being caught costs time: you are escorted to the security office and held for a few seconds, then released. Never eliminated. Security Level decays slowly when you lie low.
- **Ultra-high-value objects** (a mounted skeleton, the temple gateway, a giant canvas) need multi-step destruction: for example loosen three anchor cables, then topple. Other players can interrupt, or land the final step and take the credit. Default credit split: 60% to whoever completes the final step, 40% shared among earlier contributors by steps done (tunable).
- Round length default 5 minutes. Highest total wins.
- Join-in-progress: spectate until the next round.

**Design constraint: walking straight to the most expensive object must not be the winning strategy.** Value, tool durability, access time, security attention and interruption risk all have to matter. Write a small simulation test that plays a few simple strategies (greedy-highest-value, nearest-first, tool-first) against the economy in `tunables.ts` and fails if greedy-highest-value wins by a wide margin.

---

## 19. Shared combat and KO

Simple, physical, readable, non-graphic.

- **Shove:** an open-hand push. Hand overlapping another player's torso with velocity above a threshold applies knockback in the push direction, and a little daze.
- **Bonk:** a strike with a held object (tool, stanchion, prop). More daze, more knockback, scaled by swing speed with a cap.
- **Daze meter:** fills with hits, drains over time. Full meter = KO.
- **KO:** stars circle the head, a comic sound plays, the screen fades for the victim, any carried relic or mode object drops at that spot, and the player respawns at their team or base spawn after a short delay. Brief spawn protection.
- Knockback is as strategically useful as daze: shoving a carrier off a catwalk, or away from a capture zone, should be a real play.
- Per-attacker hit cooldown to prevent spam. The server validates every hit claim against distance, cooldown and state.
- Utility gadgets are a stretch goal. No guns of any kind.

Remote players receive knockback as a server-driven impulse on their rig. Apply it with comfort in mind: short, smooth, with the vignette.

---

## 20. Shared world interaction and destructibles

- Important objects are physically grabbable wherever feasible.
- **Grabbable:** id, grab points, one- or two-handed, mass class, throwable flag. The server owns who holds what.
- **Breakable:** id, hit points, stage (`intact → cracked → shattered`), required tool class, insured value. The client swaps pre-authored stage meshes and spawns pooled shard particles; no runtime fracturing. Glass cases visibly crack and break.
- **Door / barrier / sign / rope:** stateful, server-owned, usable by every mode.
- One registry on the server (`systems/breakables.ts`, `systems/grabbables.ts`) used by all four modes. Capture the Relic's case, Insurance Fraud's vases and Artifact Hunt's sliding panels are the same system with different data.
- The museum offers cover, hiding spots, elevation, shortcuts and discoverable service routes in every wing.

---

## 21. Deployment on Render

Two services defined in `render.yaml`, auto-deployed from the GitHub main branch. Verify field names against Render's current Blueprint documentation before committing; this is a sketch.

```yaml
services:
  - type: web
    name: the-museum-server
    runtime: node
    rootDir: .
    buildCommand: npm ci && npm run build -w shared -w server
    startCommand: npm run start -w server
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: CLIENT_ORIGIN        # for CORS
        sync: false

  - type: web
    name: the-museum-client
    runtime: static
    buildCommand: npm ci && npm run build -w shared -w client
    staticPublishPath: client/dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html   # so /party/<slug> loads the app
    envVars:
      - key: VITE_SERVER_URL
        sync: false
```

Notes:

- WebXR needs HTTPS; Render provides it. Use `wss://` for the socket in production.
- The server listens on the port Render provides in `PORT`.
- Render's free web services spin down after 15 minutes without traffic and take a while to wake, and in-memory party state is lost on restart. The "recreate party from slug" behaviour in section 12 covers this. Show a friendly "waking the museum…" state while the first connection is pending. Recommend a paid instance for real play sessions and say so in the README.
- One region, closest to the players.
- README must document: prerequisites, `npm install`, running client and server locally, environment variables, testing on a Quest on the local network (HTTPS or port forwarding), the desktop XR emulator option, deploying to Render step by step, and the asset scripts.

---

## 22. Testing, debugging and self-review

- **Rules tests (Vitest):** every mode's rules as pure functions. Cover every Capture the Relic rule in section 15 with a named test, including "cannot score while own relic is away", "defender touch returns relic", "no auto-return over time", "KO drops relic at exact position".
- **Server bot tests:** headless Colyseus clients join a party by slug, play a scripted round, disconnect and reconnect, join mid-round in each mode. Assert the join-in-progress table.
- **Client smoke tests (Playwright):** load the app, create a party, open the invite link in a second context, see two avatars, start a round on desktop controls. Run headless with software WebGL.
- **Camera bookmarks:** named camera poses per room (`lobby.entrance`, `lobby.balcony`, `dino.nave`, `north.court`, …) reachable by URL parameter. A script captures all of them to `docs/screens/` so you can review visuals and the human can see progress.
- **URL debug flags:** `?room=`, `?mode=`, `?bots=3`, `?perf=1`, `?spectate=1`, `?quality=quest`, `?nomusic=1`.
- **Dev panel:** live-edit tunables on desktop.
- **XR emulation:** use a WebXR emulator on desktop to exercise the VR code path. It is not a substitute for the headset.
- **Headset checklist:** after each milestone, write what to test in `docs/HEADSET_TESTS.md`: comfort, scale, frame rate in the worst room, menu reachability, grab feel, audio.

---

## 23. Milestones with exit criteria

Do them in order. Each ends with a commit, updated docs and a headset checklist.

**M0 — Scaffold.** Workspaces, TypeScript, Vite client, Colyseus server, shared package, lint, tests, `render.yaml`, README skeleton, CI. *Done when* client and server run locally with one command and a blank scene connects to the server.

**M1 — Museum shell.** Architecture kit; exterior steps and facade with avenue; Grand Lobby; Dinosaur Hall; Art Galleries; Egypt Wing; World Cultures Wing; both courts; Upper Balcony; at least one service corridor loop. Collision meshes, map data, portal culling, baked lighting v1, perf HUD, camera bookmarks. Placeholder exhibits are fine. *Done when* you can fly and walk the whole building on desktop, `measure-routes` passes, the screenshot set looks like a museum, and the budget holds on the `quest` tier.

**M2 — Locomotion and hands.** VR rig, smooth move, snap turn, comfort vignette, wall and stair collision, hands, grabbing and throwing of test objects, desktop controls, input abstraction, button-index debug readout. *Done when* a player can walk from the steps to both courts by all three routes, in VR and on desktop.

**M3 — Multiplayer and parties.** Party creation, invite-link joining, slug recreation, avatars with head and hand sync, interpolation, host migration, disconnect and reconnect. Deploy to Render. *Done when* two browsers on the Render URL join the same party from one link without typing anything and see each other's heads and hands.

**M4 — Menus.** Personal menu on the menu action with fallbacks; lobby floating panel with members, mode selection, settings, host-only start; independent Music and FX toggles; round flow state machine with a stub mode. *Done when* the host can pick a mode and start and end a stub round, and everyone returns to the lobby as a party.

**M5 — Capture the Relic vertical slice.** Breakable cases, alarm, relics, carry, drop, throw, KO system, respawn, return rule, scoring, win condition, join-in-progress. *Done when* a full match plays start to finish and all rules tests pass.

> **First playable = M0–M5.** Acceptance criteria:
> - A player can load the Render URL in a supported browser.
> - A Quest user can enter VR through WebXR.
> - A player spawns on the museum steps and can walk into the Grand Lobby.
> - At least two players join the same party from the same invite link without typing a code.
> - Players see each other's head and hand movement.
> - The host can select a mode and start a round from the lobby floating menu.
> - The menu action opens a personal settings menu.
> - Music and FX toggle independently.
> - Capture the Relic plays from start to finish with scoring and respawns.
> - Returning to the lobby preserves the party for the next mode or round.

**M6 — Artifact Hunt.** Slots, randomised placement, tiers, Registrar's Desk, warmer/colder hint, FFA and teams.

**M7 — Crowd Control.** Shared agent system, visitor circuit, tourist types, tools, waves, scoring, instanced rendering.

**M8 — Insurance Fraud.** Destructible catalogue with values, tools with durability, Security Level and guards, multi-step objects, economy simulation test.

**M9 — Polish.** Real artworks and scanned sculptures via the asset pipeline, lighting pass on hero rooms, full audio pass, music, effects, onboarding cards, map readability (signage, colour-coded wings), performance pass on device, visual identity.

Art upgrades do not need to wait for M9. If the Met art script works early, run it early: real paintings on the walls improve every screenshot and every playtest.

---

## 24. Tunables

Every gameplay number lives in `shared/config/tunables.ts`, typed and commented, editable live through the dev panel. Starting values:

| Key | Default |
|---|---|
| Walk / sprint speed | 2.6 / 4.2 m/s |
| Snap turn angle | 45° |
| Pose send rate / interpolation delay | 20 Hz / 100 ms |
| Reconnection window | 60 s |
| Empty party grace | 10 min |
| Countdown / results duration | 5 s / 10 s |
| Punch speed to damage glass | 2.5 m/s |
| Glass hits to shatter | 2 |
| Shove speed threshold | 1.5 m/s |
| Daze to KO | 3 bonks or about 5 shoves |
| Respawn delay | 4 s (3 s for a short-handed team) |
| Spawn protection | 2 s |
| CTR score limit / time limit | 3 / 8 min |
| Carrier speed multiplier | 0.9 |
| Artifact Hunt artifacts / time | 12 / 6 min |
| Artifact values C / R / L | 1 / 3 / 5 |
| Crowd Control waves / max agents | 5 / 40 |
| Insurance Fraud time | 5 min |
| Security hold time when caught | 8 s |
| Ultra-object credit split (final / contributors) | 60 / 40 |

These are guesses to be corrected by playtesting. Do not treat them as requirements.

---

## 25. Defaults chosen, and questions for the human

**Defaults this brief has chosen where the original was silent.** Follow them unless told otherwise:

- Bases are the North and South Courts; the Dinosaur Hall is the central fast lane.
- Museum geometry is procedural from a parametric kit, replaceable per room by modelled assets later.
- Client-authoritative poses with server sanity checks; server-authoritative everything else.
- Artifact Hunt artifacts are secured by delivery to a desk in the lobby.
- The carried relic hums and pulses (anti-stalemate), with no timed auto-return.
- Insurance Fraud capture is a short hold in the security office.
- No jumping, no climbing, no bots, no voting, no spectator mode beyond Insurance Fraud late-joiners, for first playable.
- Voice chat is out of scope; friends are expected to use their own.

**Raise these with the human as you reach them. Do not block on them.**

1. Does the left menu button fire in Quest Browser? (Needs a headset test in M2.)
2. Which Met and Smithsonian 3D scans should be the hero pieces? They need to download them into `assets-src/`.
3. Free or paid Render instance for playtests?
4. A name for the museum to put on the facade banners.
5. Preferred music direction.
6. Whether desktop players should be allowed in competitive rounds with VR players, or only for testing.

---

*Build the building first. Make it beautiful, make it fast, then let people loose in it.*
