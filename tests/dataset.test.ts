import { describe, expect, it } from 'vitest';
import { ACTIONS, EVENTS, GRID, ROOM_SPAWN, Tile, newWorld, render, step } from '../src/game';
import { FRAME_BYTES, runEpisode } from '../src/dataset/episode';
import { firstStep } from '../src/dataset/explorer';

const EPISODES = [1, 2, 3, 4, 5, 6, 7, 8].map((world) => runEpisode(world, 400));

describe('episodes', () => {
  it('are the same for the same world', () => {
    expect(runEpisode(3, 100)).toEqual(runEpisode(3, 100));
  });

  it('record one more frame than steps, and one action and event per step', () => {
    for (const episode of EPISODES) {
      expect(episode.frames.length).toBe((episode.steps + 1) * FRAME_BYTES);
      expect(episode.actions).toHaveLength(episode.steps);
      expect(episode.events).toHaveLength(episode.steps);
      expect(episode.scenes).toHaveLength(episode.steps + 1);
      expect(episode.screens).toHaveLength(episode.steps + 1);
    }
  });

  it('replay to the same frames through the game rules', () => {
    const episode = EPISODES[0];
    let state = newWorld(episode.world);
    expect(episode.frames.subarray(0, FRAME_BYTES)).toEqual(render(state));
    for (let t = 0; t < episode.steps; t++) {
      const result = step(state, ACTIONS[episode.actions[t]]);
      state = result.state;
      expect(EVENTS[episode.events[t]]).toBe(result.event);
      expect(episode.frames.subarray((t + 1) * FRAME_BYTES, (t + 2) * FRAME_BYTES)).toEqual(render(state));
    }
  });

  it('contain every kind of event and every action', () => {
    const events = new Set(EPISODES.flatMap((episode) => episode.events));
    const actions = new Set(EPISODES.flatMap((episode) => episode.actions));
    expect([...events].sort()).toEqual(EVENTS.map((_, i) => i));
    expect([...actions].sort()).toEqual(ACTIONS.map((_, i) => i));
  });

  it('spend time both outside and inside, and visit several screens', () => {
    for (const episode of EPISODES) {
      const inside = episode.scenes.filter((scene) => scene === 1).length / episode.scenes.length;
      expect(inside).toBeLessThan(0.6);
      const screens = new Set(episode.screens.map(([x, y]) => `${x},${y}`));
      expect(screens.size).toBeGreaterThan(3);
    }
    const inside = EPISODES.flatMap((episode) => episode.scenes).filter((scene) => scene === 1).length;
    expect(inside).toBeGreaterThan(0);
  });
});

describe('explorer path finding', () => {
  it('finds the first step of a shortest walk around obstacles', () => {
    const tiles: Tile[] = new Array(GRID * GRID).fill(Tile.Floor);
    // A wall straight up from the spawn forces a detour.
    tiles[5 * GRID + 3] = Tile.Wall;
    expect(firstStep(tiles, ROOM_SPAWN, { row: 4, col: 3 })).toMatch(/left|right/);
    expect(firstStep(tiles, ROOM_SPAWN, ROOM_SPAWN)).toBeNull();
  });
});
