import { describe, expect, it } from 'vitest';
import { floorOf } from '../src/ui/minimap';

describe('map floor detection', () => {
  it('knows which floor you are on', () => {
    expect(floorOf(0)).toBe('ground');
    expect(floorOf(1.2)).toBe('ground'); // temple podium, steps
    expect(floorOf(8)).toBe('upper'); // galleries, balconies, catwalks
    expect(floorOf(-6)).toBe('service');
    expect(floorOf(-2.4)).toBe('ground'); // the front plaza, outside the entrance
  });
});
