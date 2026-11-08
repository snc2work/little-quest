// Draws the world as a 32x32 image of palette indices.
// This image is exactly what the world model sees and predicts, so the drawing
// must stay deterministic and pixel-exact.

import { roomTiles } from './room';
import {
  GRID,
  SCREEN,
  TILE,
  Tile,
  type Direction,
  type HutKind,
  type Layout,
  type Player,
  type WorldState,
} from './types';

/** The palette. A frame stores indices into this list. */
export const PALETTE = [
  '#000000', // 0 black: doorway, eyes
  '#4caf50', // 1 grass, moss
  '#1e5a2c', // 2 dark green: tree crowns, moss roof, blankets, plants
  '#8c8c8c', // 3 gray: rocks, stone walls, fireplace
  '#a0602c', // 4 brown: logs, table, barrel
  '#e0453a', // 5 red: the player
  '#ecd6a8', // 6 beige: floor
  '#4a2c14', // 7 dark brown: trunks, door, edges
  '#3b6fd6', // 8 blue: water, bath house roof
  '#c9a467', // 9 tan: path, thatch, dirt floor, floor seams, fire
] as const;

/** A frame: SCREEN * SCREEN palette indices in row-major order. */
export type Frame = Uint8Array;

// Pixel art. Each character is a palette index; "." in a sprite is transparent.
const CHARS: Record<string, number> = { k: 0, g: 1, G: 2, s: 3, b: 4, r: 5, e: 6, d: 7, w: 8, p: 9 };

const TILE_ART: Record<Tile, readonly string[]> = {
  [Tile.Grass]: ['gggg', 'gggg', 'gggg', 'gggg'],
  [Tile.Tree]: ['gGGg', 'GGGG', 'GGGG', 'gddg'],
  [Tile.Rock]: ['gssg', 'ssss', 'ssss', 'gssg'],
  // Hut tiles are drawn from HUT_ART by kind; these are never used.
  [Tile.RoofLeft]: [],
  [Tile.RoofMid]: [],
  [Tile.RoofRight]: [],
  [Tile.HutWallLeft]: [],
  [Tile.HutDoor]: [],
  [Tile.HutWallRight]: [],
  // Room tiles.
  [Tile.Floor]: ['eeee', 'eeee', 'eeee', 'pppp'],
  [Tile.Wall]: ['bbbb', 'dddd', 'bbbb', 'dddd'],
  [Tile.StoneWall]: ['ssds', 'ssss', 'dsss', 'ssss'],
  [Tile.DirtFloor]: ['pppp', 'pbpp', 'pppp', 'pppb'],
  [Tile.ExitDoor]: ['bkkb', 'dkkd', 'bkkb', 'dkkd'],
  [Tile.Fireplace]: ['ssss', 'skks', 'spps', 'ssss'],
  [Tile.Crate]: ['dddd', 'dbbd', 'dbbd', 'dddd'],
  [Tile.Plant]: ['eGGe', 'GGGG', 'eGGe', 'ebbe'],
  [Tile.Table]: ['bbbb', 'bbbb', 'dddd', 'deed'],
  [Tile.Bed]: ['dddd', 'deed', 'GGGG', 'GGGG'],
  [Tile.Barrel]: ['ebbe', 'bddb', 'bddb', 'ebbe'],
  [Tile.Water]: ['wwww', 'wwww', 'wwww', 'wwww'],
  [Tile.Path]: ['pppp', 'pppp', 'pppp', 'pppp'],
};

// Each hut is 3x2 tiles (12x8 pixels). The doorway is always in the middle of the
// bottom row, so walking in works the same way for every kind.
const HUT_ART: Record<HutKind, readonly string[]> = {
  // Log cabin with a thatched roof.
  cabin: [
    'ggggddddgggg',
    'ggdppppppdgg',
    'gdppbppbppdg',
    'dddddddddddd',
    'gbbbbbbbbbbg',
    'gbkbbkkbbkbg',
    'gddddkkddddg',
    'gbbbbkkbbbbg',
  ],
  // Stone storehouse with a shingle roof.
  stone: [
    'gggddddddggg',
    'gdbdbdbdbdbg',
    'dbdbdbdbdbdb',
    'dddddddddddd',
    'gssssssssssg',
    'gsksdkkdsksg',
    'gsdsdkkdsdsg',
    'gsssdkkdsssg',
  ],
  // Moss hut with a roof of leaves.
  moss: [
    'ggggGGGGgggg',
    'ggGGGGGGGGgg',
    'gGGgGGGGgGGg',
    'GGGGGGGGGGGG',
    'gbbbbbbbbbbg',
    'gbbbbkkbbbbg',
    'gddddkkddddg',
    'gbbbbkkbbbbg',
  ],
  // Half-timbered bath house with a blue roof.
  bath: [
    'gggwwwwwwggg',
    'ggwwwwwwwwgg',
    'gwwwwwwwwwwg',
    'dddddddddddd',
    'gbbbbbbbbbbg',
    'gebebkkbebeg',
    'gebebkkbebeg',
    'gbbbbkkbbbbg',
  ],
};

/** Where each hut tile sits in the 3x2 hut. */
const HUT_PARTS: Partial<Record<Tile, { row: number; col: number }>> = {
  [Tile.RoofLeft]: { row: 0, col: 0 },
  [Tile.RoofMid]: { row: 0, col: 1 },
  [Tile.RoofRight]: { row: 0, col: 2 },
  [Tile.HutWallLeft]: { row: 1, col: 0 },
  [Tile.HutDoor]: { row: 1, col: 1 },
  [Tile.HutWallRight]: { row: 1, col: 2 },
};

// Catch typos in the pixel art as soon as the module loads.
for (const [tile, art] of Object.entries(TILE_ART)) {
  if (HUT_PARTS[Number(tile) as Tile]) continue;
  if (art.length !== TILE || art.some((line) => line.length !== TILE)) throw new Error(`Bad art for tile ${tile}`);
}
for (const [kind, art] of Object.entries(HUT_ART)) {
  if (art.length !== 2 * TILE || art.some((line) => line.length !== 3 * TILE)) throw new Error(`Bad art for hut ${kind}`);
}

function tileArt(tile: Tile, hutKind: HutKind): readonly string[] {
  const part = HUT_PARTS[tile];
  if (!part) return TILE_ART[tile];
  const rows = HUT_ART[hutKind].slice(part.row * TILE, part.row * TILE + TILE);
  return rows.map((line) => line.slice(part.col * TILE, part.col * TILE + TILE));
}

// The player is a red ball whose eyes sit on the side it faces.
const PLAYER_ART: Record<Direction, readonly string[]> = {
  up: ['.kk.', 'rrrr', 'rrrr', '.rr.'],
  down: ['.rr.', 'rrrr', 'rrrr', '.kk.'],
  left: ['.rr.', 'krrr', 'krrr', '.rr.'],
  right: ['.rr.', 'rrrk', 'rrrk', '.rr.'],
};

function drawArt(frame: Frame, art: readonly string[], row: number, col: number): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const ch = art[y][x];
      if (ch === '.') continue;
      frame[(row * TILE + y) * SCREEN + col * TILE + x] = CHARS[ch];
    }
  }
}

/** Draws a scene. hutKind picks the look of any hut tiles in the layout. */
export function renderScene(tiles: Layout, player: Player, hutKind: HutKind = 'cabin'): Frame {
  const frame: Frame = new Uint8Array(SCREEN * SCREEN);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      drawArt(frame, tileArt(tiles[row * GRID + col], hutKind), row, col);
    }
  }
  drawArt(frame, PLAYER_ART[player.facing], player.row, player.col);
  return frame;
}

export function render(state: WorldState): Frame {
  return state.scene === 'room'
    ? renderScene(roomTiles(state.map.hutKind), state.roomPlayer)
    : renderScene(state.map.tiles, state.mapPlayer, state.map.hutKind);
}
