// The insides of the huts. Each hut kind has one fixed room, so the room that
// appears can be told from the hut seen on the map.

import { GRID, Tile, type HutKind, type Layout, type Player, type Position } from './types';

const LEGEND: Record<string, Tile> = {
  W: Tile.Wall,
  S: Tile.StoneWall,
  F: Tile.Floor,
  U: Tile.DirtFloor,
  D: Tile.ExitDoor,
  T: Tile.Table,
  B: Tile.Bed,
  O: Tile.Barrel,
  C: Tile.Crate,
  L: Tile.Plant,
  P: Tile.Fireplace,
  X: Tile.Water,
};

const ROOM_ROWS: Record<HutKind, readonly string[]> = {
  // Log cabin: a fireplace, a table, a bed and a barrel.
  cabin: [
    'WWPWWWWW',
    'WFFFFFBW',
    'WFTTFFFW',
    'WFFFFFFW',
    'WFFFFFFW',
    'WFFFFFOW',
    'WFFFFFFW',
    'WWWDWWWW',
  ],
  // Stone storehouse: a dirt floor, crates and barrels, and a short inner wall.
  stone: [
    'SSSSSSSS',
    'SOOUUCCS',
    'SUUUUUUS',
    'SCUSSUOS',
    'SCUUUUUS',
    'SUUOUUCS',
    'SUUUUUUS',
    'SSSDSSSS',
  ],
  // Moss hut: potted plants in the corners, two beds and a table.
  moss: [
    'WWWWWWWW',
    'WLFFFFLW',
    'WFFBBFFW',
    'WFFFFFFW',
    'WLFTTFLW',
    'WFFFFFFW',
    'WLFFFFLW',
    'WWWDWWWW',
  ],
  // Bath house: stone walls around a pool.
  bath: [
    'SSSSSSSS',
    'SFFFFFFS',
    'SFXXXXFS',
    'SFXXXXFS',
    'SFFFFFFS',
    'SOFFFFOS',
    'SFFFFFFS',
    'SSSDSSSS',
  ],
};

function parse(rows: readonly string[]): Layout {
  if (rows.length !== GRID || rows.some((row) => row.length !== GRID)) {
    throw new Error('Room layout must be GRID x GRID');
  }
  return rows.flatMap((row) => [...row].map((ch) => LEGEND[ch]));
}

const ROOMS = Object.fromEntries(
  Object.entries(ROOM_ROWS).map(([kind, rows]) => [kind, parse(rows)]),
) as Record<HutKind, Layout>;

export function roomTiles(kind: HutKind): Layout {
  return ROOMS[kind];
}

/** The exit door in the bottom wall, the same in every room. */
export const ROOM_EXIT: Position = { row: GRID - 1, col: 3 };

/** Where the player appears on entering: just above the exit, facing into the room. */
export const ROOM_SPAWN: Player = { row: GRID - 2, col: 3, facing: 'up' };
