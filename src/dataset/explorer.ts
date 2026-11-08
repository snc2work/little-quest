// An automatic player that walks around to make training data. It is allowed to
// look at the real game state; only the recorded images and actions go into the
// data. It mixes purposeful trips (to a hut door, a chest, the room exit or the
// edge of the screen) with random steps, so the data has plenty of moves, bumps,
// waits and every kind of event.

import { Prng } from '../lib/prng';
import {
  DELTAS,
  GRID,
  ROOM_SPAWN,
  Tile,
  inBounds,
  isWalkable,
  reachableFrom,
  tileAt,
  type Action,
  type Direction,
  type Layout,
  type Position,
  type WorldState,
} from '../game';

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];
const ACTIONS: readonly Action[] = ['none', 'up', 'down', 'left', 'right'];

/** Chances in percent, per step. */
const RANDOM_STEP = 20;
const WAIT = 5;
/** Inside a room, the explorer looks around for at least MIN and at most MAX steps before heading out. */
const MIN_ROOM_STEPS = 8;
const MAX_ROOM_STEPS = 40;

interface Goal {
  scene: WorldState['scene'];
  screen: string;
  target: Position;
  /** Pressed once the target is reached: into a door, a chest or off the edge. */
  final: Direction | null;
}

function screenOf(state: WorldState): string {
  return `${state.map.x},${state.map.y}`;
}

function tilesOf(state: WorldState): Layout {
  return state.scene === 'room' && state.room ? state.room.tiles : state.map.tiles;
}

function playerOf(state: WorldState): Position {
  return state.scene === 'room' ? state.roomPlayer : state.mapPlayer;
}

/** The first step of a shortest walk from one tile to another, or null if there is none. */
export function firstStep(tiles: Layout, from: Position, to: Position): Direction | null {
  if (from.row === to.row && from.col === to.col) return null;
  const key = (p: Position) => p.row * GRID + p.col;
  const firstMove = new Map<number, Direction>();
  const queue: Position[] = [from];
  const seen = new Set([key(from)]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const direction of DIRECTIONS) {
      const next = { row: current.row + DELTAS[direction].dr, col: current.col + DELTAS[direction].dc };
      if (!inBounds(next.row, next.col) || seen.has(key(next)) || !isWalkable(tileAt(tiles, next.row, next.col))) continue;
      seen.add(key(next));
      firstMove.set(key(next), i === 0 ? direction : (firstMove.get(key(current)) as Direction));
      if (next.row === to.row && next.col === to.col) return firstMove.get(key(next)) ?? null;
      queue.push(next);
    }
  }
  return null;
}

export class Explorer {
  private readonly rng: Prng;
  private goal: Goal | null = null;
  private roomSteps = 0;

  constructor(seed: number) {
    this.rng = new Prng(seed, 3);
  }

  next(state: WorldState): Action {
    this.roomSteps = state.scene === 'room' ? this.roomSteps + 1 : 0;
    if (this.goal && (this.goal.scene !== state.scene || this.goal.screen !== screenOf(state))) this.goal = null;
    if (state.scene === 'room' && this.roomSteps > MAX_ROOM_STEPS && this.goal?.final !== 'down') this.goal = null;

    const roll = this.rng.int(100);
    if (roll < WAIT) return 'none';
    if (roll < WAIT + RANDOM_STEP) return ACTIONS[1 + this.rng.int(4)];

    this.goal ??= this.chooseGoal(state);
    const player = playerOf(state);
    const { target, final } = this.goal;
    if (player.row === target.row && player.col === target.col) {
      this.goal = null;
      return final ?? ACTIONS[this.rng.int(ACTIONS.length)];
    }
    const direction = firstStep(tilesOf(state), player, target);
    if (!direction) {
      this.goal = null;
      return ACTIONS[1 + this.rng.int(4)];
    }
    return direction;
  }

  private chooseGoal(state: WorldState): Goal {
    const tiles = tilesOf(state);
    const reachable = reachableFrom(tiles, playerOf(state));
    const pick = <T>(items: readonly T[]): T => items[this.rng.int(items.length)];
    const goal = (target: Position, final: Direction | null): Goal => ({
      scene: state.scene,
      screen: screenOf(state),
      target,
      final,
    });
    const wander = () => goal(pick(reachable), null);
    const roll = this.rng.int(100);

    if (state.scene === 'room') {
      if (this.roomSteps > MAX_ROOM_STEPS) return goal(ROOM_SPAWN, 'down');
      const mayLeave = this.roomSteps >= MIN_ROOM_STEPS;
      if (mayLeave && roll >= 85) return goal(ROOM_SPAWN, 'down');
      // Stand next to a closed chest and push into it.
      const chests: Goal[] = [];
      for (const spot of reachable) {
        for (const direction of DIRECTIONS) {
          const r = spot.row + DELTAS[direction].dr;
          const c = spot.col + DELTAS[direction].dc;
          if (inBounds(r, c) && tileAt(tiles, r, c) === Tile.Chest) chests.push(goal(spot, direction));
        }
      }
      if (chests.length > 0 && roll < 70) return pick(chests);
      return roll < 70 || !mayLeave ? wander() : goal(ROOM_SPAWN, 'down');
    }

    // Not straight back in after just coming out of the door.
    const hut = state.map.hut;
    const player = playerOf(state);
    const atDoor = hut && player.row === hut.doorFront.row && player.col === hut.doorFront.col;
    if (hut && !atDoor && roll < 30) return goal(hut.doorFront, 'up');
    if (roll < 75) {
      // Walk off an open edge of the screen.
      const exits: Goal[] = [];
      for (const spot of reachable) {
        if (spot.row === 0) exits.push(goal(spot, 'up'));
        if (spot.row === GRID - 1) exits.push(goal(spot, 'down'));
        if (spot.col === 0) exits.push(goal(spot, 'left'));
        if (spot.col === GRID - 1) exits.push(goal(spot, 'right'));
      }
      if (exits.length > 0) return pick(exits);
    }
    return wander();
  }
}
