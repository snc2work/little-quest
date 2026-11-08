// Plays one episode with the explorer and records it as training data:
// every frame, and the action and event between each pair of frames.

import { ACTIONS, EVENTS, SCREEN, newWorld, render, step } from '../game';
import { Explorer } from './explorer';

export const FRAME_BYTES = SCREEN * SCREEN;

export interface Episode {
  world: number;
  steps: number;
  /** steps + 1 frames of SCREEN * SCREEN palette indices, back to back. */
  frames: Uint8Array;
  /** Index into ACTIONS for each step. */
  actions: number[];
  /** Index into EVENTS for each step. */
  events: number[];
  /** For each frame: 0 outside, 1 inside a room. For analysis only, not a model input. */
  scenes: number[];
  /** For each frame: the screen [x, y]. For analysis only, not a model input. */
  screens: [number, number][];
}

/** The explorer's seed is the world number, so an episode is fixed by its world. */
export function runEpisode(world: number, steps: number): Episode {
  const explorer = new Explorer(world);
  const frames = new Uint8Array((steps + 1) * FRAME_BYTES);
  const actions: number[] = [];
  const events: number[] = [];
  const scenes: number[] = [];
  const screens: [number, number][] = [];

  let state = newWorld(world);
  const record = (index: number) => {
    frames.set(render(state), index * FRAME_BYTES);
    scenes.push(state.scene === 'room' ? 1 : 0);
    screens.push([state.map.x, state.map.y]);
  };
  record(0);
  for (let t = 0; t < steps; t++) {
    const action = explorer.next(state);
    const result = step(state, action);
    state = result.state;
    actions.push(ACTIONS.indexOf(action));
    events.push(EVENTS.indexOf(result.event));
    record(t + 1);
  }
  return { world, steps, frames, actions, events, scenes, screens };
}
