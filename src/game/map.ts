// Random generation of the outdoor map: grass, trees, rocks and one hut.

import { Prng } from '../lib/prng';
import {
  DELTAS,
  GRID,
  Tile,
  inBounds,
  isWalkable,
  tileAt,
  type Direction,
  type GameMap,
  type Layout,
  type Player,
  type Position,
} from './types';

const HUT_WIDTH = 3;
const HUT_HEIGHT = 2;
/** The player must be able to reach at least this many tiles, including the door front. */
const MIN_REACHABLE = 12;
const MAX_ATTEMPTS = 100;
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export interface GeneratedMap {
  map: GameMap;
  start: Player;
}

/** Tiles reachable on foot from a position, in BFS order. */
export function reachableFrom(tiles: Layout, from: Position): Position[] {
  const seen = new Set<number>([from.row * GRID + from.col]);
  const order: Position[] = [from];
  for (let i = 0; i < order.length; i++) {
    const { row, col } = order[i];
    for (const direction of DIRECTIONS) {
      const r = row + DELTAS[direction].dr;
      const c = col + DELTAS[direction].dc;
      const key = r * GRID + c;
      if (!inBounds(r, c) || seen.has(key) || !isWalkable(tileAt(tiles, r, c))) continue;
      seen.add(key);
      order.push({ row: r, col: c });
    }
  }
  return order;
}

function tryGenerate(seed: number, rng: Prng): GeneratedMap | null {
  const tiles: Tile[] = new Array(GRID * GRID).fill(Tile.Grass);
  const set = (row: number, col: number, tile: Tile) => {
    tiles[row * GRID + col] = tile;
  };

  // The hut, with room below the door for the player to stand.
  const hut = { row: rng.int(GRID - HUT_HEIGHT), col: rng.int(GRID - HUT_WIDTH + 1) };
  const door = { row: hut.row + 1, col: hut.col + 1 };
  const doorFront = { row: door.row + 1, col: door.col };
  set(hut.row, hut.col, Tile.RoofLeft);
  set(hut.row, hut.col + 1, Tile.RoofMid);
  set(hut.row, hut.col + 2, Tile.RoofRight);
  set(hut.row + 1, hut.col, Tile.HutWall);
  set(door.row, door.col, Tile.HutDoor);
  set(hut.row + 1, hut.col + 2, Tile.HutWall);

  // Water only goes on grass and never in front of the door.
  const setWater = (row: number, col: number) => {
    if (!inBounds(row, col) || tiles[row * GRID + col] !== Tile.Grass) return;
    if (row === doorFront.row && col === doorFront.col) return;
    set(row, col, Tile.Water);
  };
  const water = rng.int(3); // 0: none, 1: pond, 2: river
  if (water === 1) {
    const height = 2 + rng.int(2);
    const width = 2 + rng.int(2);
    const top = rng.int(GRID - height + 1);
    const left = rng.int(GRID - width + 1);
    for (let row = top; row < top + height; row++) {
      for (let col = left; col < left + width; col++) setWater(row, col);
    }
  } else if (water === 2) {
    // A one-tile river across the screen that wanders sideways. Where it would
    // hit the hut it is skipped, which leaves a gap to cross.
    const vertical = rng.int(2) === 0;
    let offset = rng.int(GRID);
    for (let along = 0; along < GRID; along++) {
      if (vertical) setWater(along, offset);
      else setWater(offset, along);
      offset = Math.min(GRID - 1, Math.max(0, offset + rng.int(3) - 1));
    }
  }

  // A dirt path from the door that wanders down until it meets something.
  let cursor = { ...doorFront };
  set(cursor.row, cursor.col, Tile.Path);
  for (let length = 0; length < GRID * 2; length++) {
    const roll = rng.int(10);
    const direction: Direction = roll < 6 ? 'down' : roll < 8 ? 'left' : 'right';
    const row = cursor.row + DELTAS[direction].dr;
    const col = cursor.col + DELTAS[direction].dc;
    if (!inBounds(row, col) || tiles[row * GRID + col] !== Tile.Grass) {
      if (direction === 'down') break;
      continue;
    }
    set(row, col, Tile.Path);
    cursor = { row, col };
  }

  // Scatter trees and rocks over the remaining grass at a per-map density.
  const density = 10 + rng.int(16); // percent
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (tiles[row * GRID + col] !== Tile.Grass) continue;
      if (row === doorFront.row && col === doorFront.col) continue;
      if (rng.int(100) >= density) continue;
      set(row, col, rng.int(10) < 7 ? Tile.Tree : Tile.Rock);
    }
  }

  const reachable = reachableFrom(tiles, doorFront);
  if (reachable.length < MIN_REACHABLE) return null;

  const spot = reachable[rng.int(reachable.length)];
  const start: Player = { ...spot, facing: DIRECTIONS[rng.int(DIRECTIONS.length)] };
  return { map: { seed, tiles, hut, door, doorFront }, start };
}

/** Generates a map and a start position from a seed. The same seed gives the same map. */
export function generateMap(seed: number): GeneratedMap {
  const rng = new Prng(seed, 1);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const generated = tryGenerate(seed, rng);
    if (generated) return generated;
  }
  throw new Error(`Could not generate a map for seed ${seed}`);
}
