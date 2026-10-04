# Credits

## Third-party assets

None shipped yet. Every texture, model, sound and piece of music in the current build is generated procedurally by the game's own code.

When assets are added through `client/public/assets/manifest.json`, list each one here with:

- title
- author
- source URL
- licence (CC0 preferred)

## Artworks

The galleries currently show procedural placeholder canvases.

`npm run fetch-art` replaces them with public-domain works from The Metropolitan Museum of Art Open Access collection (CC0). It writes one line per work to `docs/CREDITS-art.md`, and each work's wall label in-game shows its title, artist, date and medium.

The game is not affiliated with or endorsed by the Met. The building is an original design.

## Libraries

| Library | Licence |
|---|---|
| three.js | MIT |
| three-mesh-bvh | MIT |
| Colyseus | MIT |
| Vite | MIT |
| Vitest | MIT |
| Playwright | Apache-2.0 |
| TypeScript | Apache-2.0 |
