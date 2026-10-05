/**
 * Named camera poses per room (brief §22). Reachable with ?cam=<id>.
 * `npm run screens` captures every bookmark to docs/screens/.
 * pos is the eye position; yaw/pitch in degrees (yaw 0 looks north, 90 west, 180 south, 270 east).
 */
export interface Bookmark { id: string; pos: [number, number, number]; yaw: number; pitch: number }

export const BOOKMARKS: Bookmark[] = [
  { id: 'exterior.steps', pos: [56, -0.6, 0], yaw: 90, pitch: 12 },
  { id: 'exterior.avenue', pos: [74, -0.8, 30], yaw: 112, pitch: 8 },
  { id: 'greathall.entrance', pos: [36.5, 1.65, 0], yaw: 90, pitch: 12 },
  { id: 'greathall.length', pos: [25.5, 1.65, 24], yaw: 0, pitch: 14 },
  { id: 'greathall.balcony', pos: [37.5, 9.65, 22], yaw: 45, pitch: -10 },
  { id: 'greathall.dome', pos: [25.5, 1.65, 4], yaw: 90, pitch: 60 },
  { id: 'greathall.elevator', pos: [19, 1.65, -24], yaw: 75, pitch: 0 },
  { id: 'grandstair.foot', pos: [16, 1.65, 0], yaw: 90, pitch: 16 },
  { id: 'grandstair.landing', pos: [-1, 9.65, 7], yaw: 250, pitch: -16 },
  { id: 'dino.nave', pos: [-12, 1.65, 46], yaw: 0, pitch: 10 },
  { id: 'dino.catwalk', pos: [-3.5, 9.65, -40], yaw: 160, pitch: -14 },
  { id: 'arms.hall', pos: [5, 1.65, -14], yaw: 0, pitch: 4 },
  { id: 'cultures.hall', pos: [5, 1.65, 14], yaw: 180, pitch: 8 },
  { id: 'american.wing', pos: [-25, 1.65, -14], yaw: 60, pitch: 6 },
  { id: 'sculpture.court', pos: [-25, 1.65, 0], yaw: 90, pitch: 6 },
  { id: 'modern.gallery', pos: [-25, 1.65, 48], yaw: 45, pitch: 4 },
  { id: 'paintings.enfilade', pos: [-50, 9.65, -48], yaw: 180, pitch: 2 },
  { id: 'egypt.mastaba', pos: [14, 1.65, -38.75], yaw: 270, pitch: 2 },
  { id: 'greek.hall', pos: [13.5, 1.65, 39], yaw: 270, pitch: 8 },
  { id: 'north.court', pos: [-12, 1.65, -51.5], yaw: 340, pitch: 10 },
  { id: 'north.temple', pos: [10, 1.65, -55], yaw: 300, pitch: 8 },
  { id: 'south.court', pos: [-12, 1.65, 51.5], yaw: 180, pitch: 10 },
  { id: 'service.corridor', pos: [24, -4.35, -40], yaw: 180, pitch: 0 },
];
