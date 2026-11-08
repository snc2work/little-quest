// The insides of the huts. Each map's hut gets its own random room. The hut kind
// sets the style (walls, floor, furniture); the layout and whether there is a
// chest are random.

import { reachableFrom } from './map';
import { Prng } from '../lib/prng';
import { DELTAS, GRID, Tile, inBounds, isWalkable, type HutKind, type Position, type Room, type Player } from './types';

/** The exit door in the bottom wall, the same in every room. */
export const ROOM_EXIT: Position = { row: GRID - 1, col: 3 };

/** Where the player appears on entering: just above the exit, facing into the room. */
export const ROOM_SPAWN: Player = { row: GRID - 2, col: 3, facing: 'up' };

/** Percent of rooms that have a chest. */
export const CHEST_CHANCE = 40;

interface RoomStyle {
  wall: Tile;
  floor: Tile;
  furniture: readonly Tile[];
  /** Most pillars or bits of inner wall. */
  maxPillars: number;
  fireplace: boolean;
  pool: boolean;
}

const STYLES: Record<HutKind, RoomStyle> = {
  cabin: {
    wall: Tile.Wall,
    floor: Tile.Floor,
    furniture: [Tile.Table, Tile.Bed, Tile.Barrel, Tile.Pot],
    maxPillars: 1,
    fireplace: true,
    pool: false,
  },
  stone: {
    wall: Tile.StoneWall,
    floor: Tile.DirtFloor,
    furniture: [Tile.Crate, Tile.Barrel, Tile.Pot],
    maxPillars: 4,
    fireplace: false,
    pool: false,
  },
  moss: {
    wall: Tile.Wall,
    floor: Tile.Floor,
    furniture: [Tile.Plant, Tile.Bed, Tile.Pot],
    maxPillars: 2,
    fireplace: false,
    pool: false,
  },
  bath: {
    wall: Tile.StoneWall,
    floor: Tile.Floor,
    furniture: [Tile.Barrel, Tile.Pot, Tile.Plant],
    maxPillars: 2,
    fireplace: false,
    pool: true,
  },
};

const MAX_TRIES = 20;
const MAX_ATTEMPTS = 100;
const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

function tryGenerate(kind: HutKind, rng: Prng): Room | null {
  const style = STYLES[kind];
  const tiles: Tile[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const border = row === 0 || col === 0 || row === GRID - 1 || col === GRID - 1;
      tiles.push(border ? style.wall : style.floor);
    }
  }
  tiles[ROOM_EXIT.row * GRID + ROOM_EXIT.col] = Tile.ExitDoor;
  const floorCount = () => tiles.filter(isWalkable).length;

  // Puts a blocking tile on the floor, unless that would cut off any floor from
  // the spawn or leave the tile with no floor next to it.
  const place = (row: number, col: number, tile: Tile): boolean => {
    const index = row * GRID + col;
    if (tiles[index] !== style.floor || (row === ROOM_SPAWN.row && col === ROOM_SPAWN.col)) return false;
    tiles[index] = tile;
    const hasFloorNext = DIRECTIONS.some((d) => {
      const r = row + DELTAS[d].dr;
      const c = col + DELTAS[d].dc;
      return inBounds(r, c) && isWalkable(tiles[r * GRID + c]);
    });
    if (hasFloorNext && reachableFrom(tiles, ROOM_SPAWN).length === floorCount()) return true;
    tiles[index] = style.floor;
    return false;
  };
  const placeSomewhere = (tile: Tile): boolean => {
    for (let i = 0; i < MAX_TRIES; i++) {
      if (place(1 + rng.int(GRID - 2), 1 + rng.int(GRID - 2), tile)) return true;
    }
    return false;
  };

  if (style.fireplace && rng.int(2) === 0) {
    tiles[1 + rng.int(GRID - 2)] = Tile.Fireplace;
  }
  if (style.pool) {
    const width = 2 + rng.int(3);
    const height = 1 + rng.int(2);
    const top = 1 + rng.int(GRID - 3 - height);
    const left = 1 + rng.int(GRID - 1 - width);
    for (let row = top; row < top + height; row++) {
      for (let col = left; col < left + width; col++) place(row, col, Tile.Water);
    }
  }
  const pillars = rng.int(style.maxPillars + 1);
  for (let i = 0; i < pillars; i++) placeSomewhere(style.wall);
  const furniture = 2 + rng.int(4);
  for (let i = 0; i < furniture; i++) placeSomewhere(style.furniture[rng.int(style.furniture.length)]);
  // The chest goes last so nothing can wall it in afterwards.
  if (rng.int(100) < CHEST_CHANCE && !placeSomewhere(Tile.Chest)) return null;

  return { tiles, wall: style.wall, floor: style.floor };
}

/** Generates the room of a map's hut. The same seed and kind give the same room. */
export function generateRoom(seed: number, kind: HutKind): Room {
  const rng = new Prng(seed, 2);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const room = tryGenerate(kind, rng);
    if (room) return room;
  }
  throw new Error(`Could not generate a room for seed ${seed}`);
}
