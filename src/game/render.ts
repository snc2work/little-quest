// Draws the world as a 32x32 image of palette indices.
// This image is exactly what the world model sees and predicts, so the drawing
// must stay deterministic and pixel-exact.

import { ROOM_TILES } from './room';
import { GRID, SCREEN, TILE, Tile, type Direction, type Layout, type Player, type WorldState } from './types';

/** The palette. A frame stores indices into this list. */
export const PALETTE = [
  '#000000', // 0 black: doorway, eyes
  '#4caf50', // 1 grass
  '#1e5a2c', // 2 dark green: tree crowns, blanket
  '#8c8c8c', // 3 gray: rocks, fireplace
  '#a0602c', // 4 brown: logs, table, barrel
  '#e0453a', // 5 red: the player
  '#ecd6a8', // 6 beige: floor
  '#4a2c14', // 7 dark brown: trunks, door, edges
  '#3b6fd6', // 8 blue: water
  '#c9a467', // 9 tan: path, thatch, floor seams, fire
] as const;

/** A frame: SCREEN * SCREEN palette indices in row-major order. */
export type Frame = Uint8Array;

// Pixel art. Each character is a palette index; "." in a sprite is transparent.
const CHARS: Record<string, number> = { k: 0, g: 1, G: 2, s: 3, b: 4, r: 5, e: 6, d: 7, w: 8, p: 9 };

const TILE_ART: Record<Tile, readonly string[]> = {
  [Tile.Grass]: ['gggg', 'gggg', 'gggg', 'gggg'],
  [Tile.Tree]: ['gGGg', 'GGGG', 'GGGG', 'gddg'],
  [Tile.Rock]: ['gssg', 'ssss', 'ssss', 'gssg'],
  // The hut is a log cabin with a thatched roof, 3x2 tiles:
  //   ggggddddgggg
  //   ggdppppppdgg
  //   gdppbppbppdg
  //   dddddddddddd
  //   gbbbbbbbbbbg
  //   gbkbbkkbbkbg
  //   gddddkkddddg
  //   gbbbbkkbbbbg
  [Tile.RoofLeft]: ['gggg', 'ggdp', 'gdpp', 'dddd'],
  [Tile.RoofMid]: ['dddd', 'pppp', 'bppb', 'dddd'],
  [Tile.RoofRight]: ['gggg', 'pdgg', 'ppdg', 'dddd'],
  [Tile.HutWallLeft]: ['gbbb', 'gbkb', 'gddd', 'gbbb'],
  [Tile.HutDoor]: ['bbbb', 'bkkb', 'dkkd', 'bkkb'],
  [Tile.HutWallRight]: ['bbbg', 'bkbg', 'dddg', 'bbbg'],
  // Inside the cabin: log walls, a plank floor and a stone fireplace.
  [Tile.Floor]: ['eeee', 'eeee', 'eeee', 'pppp'],
  [Tile.Wall]: ['bbbb', 'dddd', 'bbbb', 'dddd'],
  [Tile.ExitDoor]: ['bkkb', 'dkkd', 'bkkb', 'dkkd'],
  [Tile.Fireplace]: ['ssss', 'skks', 'spps', 'ssss'],
  [Tile.Table]: ['bbbb', 'bbbb', 'dddd', 'deed'],
  [Tile.Bed]: ['dddd', 'deed', 'GGGG', 'GGGG'],
  [Tile.Barrel]: ['ebbe', 'bddb', 'bddb', 'ebbe'],
  [Tile.Water]: ['wwww', 'wwww', 'wwww', 'wwww'],
  [Tile.Path]: ['pppp', 'pppp', 'pppp', 'pppp'],
};

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

export function renderScene(tiles: Layout, player: Player): Frame {
  const frame: Frame = new Uint8Array(SCREEN * SCREEN);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      drawArt(frame, TILE_ART[tiles[row * GRID + col]], row, col);
    }
  }
  drawArt(frame, PLAYER_ART[player.facing], player.row, player.col);
  return frame;
}

export function render(state: WorldState): Frame {
  return state.scene === 'room'
    ? renderScene(ROOM_TILES, state.roomPlayer)
    : renderScene(state.map.tiles, state.mapPlayer);
}
