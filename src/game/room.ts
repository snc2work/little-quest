// The inside of the hut. For now every hut has this same room.

import { GRID, Tile, type Layout, type Player, type Position } from './types';

const LEGEND: Record<string, Tile> = {
  W: Tile.Wall,
  F: Tile.Floor,
  D: Tile.ExitDoor,
  T: Tile.Table,
  B: Tile.Bed,
  O: Tile.Barrel,
};

const ROWS = [
  'WWWWWWWW',
  'WFFFFFBW',
  'WFTTFFFW',
  'WFFFFFFW',
  'WFFFFFFW',
  'WFFFFFOW',
  'WFFFFFFW',
  'WWWDWWWW',
];

function parse(rows: readonly string[]): Layout {
  if (rows.length !== GRID || rows.some((row) => row.length !== GRID)) {
    throw new Error('Room layout must be GRID x GRID');
  }
  return rows.flatMap((row) => [...row].map((ch) => LEGEND[ch]));
}

export const ROOM_TILES: Layout = parse(ROWS);

/** The exit door in the bottom wall. */
export const ROOM_EXIT: Position = { row: GRID - 1, col: 3 };

/** Where the player appears on entering: just above the exit, facing into the room. */
export const ROOM_SPAWN: Player = { row: GRID - 2, col: 3, facing: 'up' };
