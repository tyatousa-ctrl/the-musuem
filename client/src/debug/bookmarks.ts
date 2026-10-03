/**
 * Named camera poses per room (brief §22). Reachable with ?cam=<id>.
 * `npm run screens` captures every bookmark to docs/screens/.
 * pos is the eye position; yaw/pitch in degrees (yaw 0 looks north, 90 looks west).
 */
export interface Bookmark { id: string; pos: [number, number, number]; yaw: number; pitch: number }

export const BOOKMARKS: Bookmark[] = [
  { id: 'exterior.steps', pos: [56, -0.6, 0], yaw: 90, pitch: 12 },
  { id: 'exterior.avenue', pos: [74, -0.8, 30], yaw: 112, pitch: 8 },
  { id: 'lobby.entrance', pos: [36, 1.65, 0], yaw: 90, pitch: 14 },
  { id: 'lobby.balcony', pos: [30, 8.65, -9.5], yaw: 120, pitch: -12 },
  { id: 'lobby.dome', pos: [16, 1.65, 4], yaw: 90, pitch: 55 },
  { id: 'lobby.stair', pos: [20, 1.65, -6.8], yaw: 90, pitch: 10 },
  { id: 'dino.nave', pos: [-16, 1.65, 33], yaw: 8, pitch: 10 },
  { id: 'dino.catwalk', pos: [-8.5, 8.65, -30], yaw: 165, pitch: -14 },
  { id: 'gallery.enfilade', pos: [-32, 1.65, -34], yaw: 180, pitch: 2 },
  { id: 'gallery.wall', pos: [-31, 1.65, -22], yaw: 90, pitch: 4 },
  { id: 'gallery.sculpture', pos: [-29, 1.65, 5.5], yaw: 120, pitch: 10 },
  { id: 'egypt.corridor', pos: [-4, 1.65, -34], yaw: 270, pitch: 0 },
  { id: 'egypt.mastaba', pos: [3, 1.65, -21], yaw: 270, pitch: 2 },
  { id: 'cultures.hall', pos: [14, 1.65, 13.5], yaw: 200, pitch: 8 },
  { id: 'north.court', pos: [-16, 1.65, -39], yaw: 330, pitch: 10 },
  { id: 'north.temple', pos: [5, 1.65, -43], yaw: 300, pitch: 8 },
  { id: 'south.court', pos: [-16, 1.65, 39], yaw: 200, pitch: 10 },
  { id: 'service.corridor', pos: [12, -4.35, -20], yaw: 180, pitch: 0 },
];
