import type { ModeId } from '@museum/shared';
import { createCrowdMode } from './crowd/index.js';
import { createCtrMode } from './ctr/index.js';
import { createHuntMode } from './hunt/index.js';
import { createTourMode } from './tour/index.js';
import type { ServerMode } from './types.js';

/**
 * Mode registry. Adding a mode means adding a folder and one line here;
 * no other mode changes. Modes listed in MODE_CATALOG without a factory are
 * shown on the lobby panel as "coming soon".
 */
export const MODE_FACTORIES: Partial<Record<ModeId, () => ServerMode>> = {
  ctr: createCtrMode,
  artifactHunt: createHuntMode,
  crowdControl: createCrowdMode,
  tour: createTourMode,
};
