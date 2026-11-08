// The model's world: the world model plus a small memory of places.
//
// The model only sees its own last frame and the action. Around it, this keeps the
// last frame drawn at each place (each screen, and each screen's room). Where the
// player is comes only from the model's events: enter, exit, and cross in the
// direction of the action. When the model goes back to a place it has drawn before,
// the saved frame is given to the model as the known part of the next frame, and the
// model only draws the blocks with the player in them (where the player was, and
// where it puts the player now). As play() in the training project's rollout.

import type { DrawOptions, Grid, WorldModel } from './worldModel';

const SCREEN_STEP: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface Place {
  x: number;
  y: number;
  inRoom: boolean;
}

export interface DreamStep {
  grid: Grid;
  frame: Uint8Array;
  event: string;
  /** Whether the step went back to a place drawn before. */
  recalled: boolean;
}

function key(place: Place): string {
  return `${place.x},${place.y},${place.inRoom ? 'room' : 'map'}`;
}

export class DreamWorld {
  private current: Grid;
  private here: Place = { x: 0, y: 0, inRoom: false };
  private readonly memory = new Map<string, Grid>();

  constructor(
    private readonly model: WorldModel,
    start: Grid,
  ) {
    this.current = Int32Array.from(start);
  }

  /** Starts from a frame of palette indices, such as the real game's first frame. */
  static fromFrame(model: WorldModel, frame: ArrayLike<number>): DreamWorld {
    return new DreamWorld(model, model.codebook.encode(frame));
  }

  get grid(): Grid {
    return this.current;
  }

  get frame(): Uint8Array {
    return this.model.codebook.decode(this.current);
  }

  get place(): Place {
    return { ...this.here };
  }

  /** How many places the memory holds. */
  get remembered(): number {
    return this.memory.size;
  }

  async step(action: string, options: Omit<DrawOptions, 'start'> = {}): Promise<DreamStep> {
    const { info, codebook, mask } = this.model;
    const actionId = info.actions.indexOf(action);
    if (actionId < 0) throw new Error(`unknown action ${action}`);
    const drawn = await this.model.drawNext(this.current, actionId, options);
    const event = info.events[drawn.event];

    this.memory.set(key(this.here), this.current);
    let there = this.here;
    if (event === 'enter') there = { ...this.here, inRoom: true };
    else if (event === 'exit') there = { ...this.here, inRoom: false };
    else if (event === 'cross' && action in SCREEN_STEP) {
      const [dx, dy] = SCREEN_STEP[action];
      there = { x: this.here.x + dx, y: this.here.y + dy, inRoom: this.here.inRoom };
    }

    let grid = drawn.grid;
    const saved = key(there) === key(this.here) ? undefined : this.memory.get(key(there));
    if (saved) {
      const start = saved.map((block, cell) => (codebook.isPlayer[block] || codebook.isPlayer[drawn.grid[cell]] ? mask : block));
      grid = (await this.model.drawNext(this.current, actionId, { ...options, start })).grid;
    }
    this.here = there;
    this.current = grid;
    return { grid, frame: codebook.decode(grid), event, recalled: saved !== undefined };
  }
}
