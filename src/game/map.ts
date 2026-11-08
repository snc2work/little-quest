// Generation of the outdoor world, one screen at a time.
//
// Neighbouring screens share their edge: the tiles along a boundary are drawn
// from that boundary alone, so the last column of one screen and the first
// column of the next are the same. If the player can stand on an edge tile, the
// tile across the boundary is walkable too, and rivers and paths that reach an
// edge carry on in the next screen.

import { Prng, hashInts } from '../lib/prng';
import {
  DELTAS,
  GRID,
  HUT_KINDS,
  Tile,
  inBounds,
  isWalkable,
  tileAt,
  type Direction,
  type GameMap,
  type Hut,
  type Layout,
  type Player,
  type Position,
} from './types';

// Salts that keep the random streams of different things apart.
const SALT_CORNER = 1;
const SALT_VERTICAL = 2;
const SALT_HORIZONTAL = 3;
const SALT_SCREEN = 4;
const SALT_START = 5;

const LAST = GRID - 1;
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];
/** Each boundary leaves at least this many tiles open to walk across. */
const MIN_OPEN = 2;
const RIVER_CHANCE = 30;
const PATH_CHANCE = 35;
const HUT_CHANCE = 50;
const MAX_ATTEMPTS = 40;

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

/** The tile at a screen corner, shared by the four screens that meet there. Never walkable. */
function cornerTile(world: number, x: number, y: number): Tile {
  return new Prng(hashInts(world, SALT_CORNER, x, y)).int(10) < 7 ? Tile.Tree : Tile.Rock;
}

/** The six tiles between the corners of a boundary. */
function boundaryMiddle(rng: Prng): Tile[] {
  const cells: Tile[] = Array.from({ length: GRID - 2 }, () => {
    if (rng.int(10) >= 4) return Tile.Grass;
    return rng.int(3) === 0 ? Tile.Rock : Tile.Tree;
  });
  if (rng.int(100) < RIVER_CHANCE) cells[1 + rng.int(cells.length - 2)] = Tile.Water;
  if (rng.int(100) < PATH_CHANCE) {
    const at = 1 + rng.int(cells.length - 2);
    if (cells[at] !== Tile.Water) cells[at] = Tile.Path;
  }
  const open = () => cells.filter((tile) => tile === Tile.Grass || tile === Tile.Path).length;
  while (open() < MIN_OPEN) {
    const at = rng.int(cells.length);
    if (cells[at] !== Tile.Water) cells[at] = Tile.Grass;
  }
  return cells;
}

/** Tiles down the boundary on the left side of screen (x, y), top to bottom. */
function verticalBoundary(world: number, x: number, y: number): Tile[] {
  const rng = new Prng(hashInts(world, SALT_VERTICAL, x, y));
  return [cornerTile(world, x, y), ...boundaryMiddle(rng), cornerTile(world, x, y + 1)];
}

/** Tiles along the boundary on the top side of screen (x, y), left to right. */
function horizontalBoundary(world: number, x: number, y: number): Tile[] {
  const rng = new Prng(hashInts(world, SALT_HORIZONTAL, x, y));
  return [cornerTile(world, x, y), ...boundaryMiddle(rng), cornerTile(world, x + 1, y)];
}

/** The edge tiles of a screen by tile index; every one is shared with a neighbour. */
function edgeTiles(world: number, x: number, y: number): Map<number, Tile> {
  const edges = new Map<number, Tile>();
  const top = horizontalBoundary(world, x, y);
  const bottom = horizontalBoundary(world, x, y + 1);
  const left = verticalBoundary(world, x, y);
  const right = verticalBoundary(world, x + 1, y);
  for (let i = 0; i < GRID; i++) {
    edges.set(i, top[i]);
    edges.set(LAST * GRID + i, bottom[i]);
    edges.set(i * GRID, left[i]);
    edges.set(i * GRID + LAST, right[i]);
  }
  return edges;
}

/** The interior neighbour of an edge tile, where a river or path coming in starts. */
function inward(index: number): Position {
  const row = Math.floor(index / GRID);
  const col = index % GRID;
  return { row: Math.min(LAST - 1, Math.max(1, row)), col: Math.min(LAST - 1, Math.max(1, col)) };
}

function interior(row: number, col: number): boolean {
  return row >= 1 && row <= LAST - 1 && col >= 1 && col <= LAST - 1;
}

/** Visits the tiles of a wandering line from a to b inside the interior, both ends included. */
function meander(rng: Prng, a: Position, b: Position, visit: (row: number, col: number) => void): void {
  let { row, col } = a;
  visit(row, col);
  for (let steps = 0; steps < 40 && (row !== b.row || col !== b.col); steps++) {
    const moves: Position[] = [];
    if (row !== b.row) moves.push({ row: row + Math.sign(b.row - row), col });
    if (col !== b.col) moves.push({ row, col: col + Math.sign(b.col - col) });
    let next = moves[rng.int(moves.length)];
    if (rng.int(10) < 3) {
      const side = rng.int(2) ? 1 : -1;
      const wiggle = row !== b.row ? { row, col: col + side } : { row: row + side, col };
      if (interior(wiggle.row, wiggle.col)) next = wiggle;
    }
    row = next.row;
    col = next.col;
    visit(row, col);
  }
}

interface Options {
  rivers: boolean;
  scatter: boolean;
}

function tryGenerate(world: number, x: number, y: number, rng: Prng, wantHut: boolean, options: Options): GameMap | null {
  const tiles: Tile[] = new Array(GRID * GRID).fill(Tile.Grass);
  const edges = edgeTiles(world, x, y);
  for (const [index, tile] of edges) tiles[index] = tile;
  const fixed = new Set<number>(edges.keys());
  const set = (row: number, col: number, tile: Tile) => {
    tiles[row * GRID + col] = tile;
    fixed.add(row * GRID + col);
  };

  // The hut keeps one free ring of tiles from the edges, so it never walls in an edge tile.
  let hut: Hut | null = null;
  if (wantHut) {
    const row = 2 + rng.int(3); // 2..4, so the door front is at most row 6
    const col = 2 + rng.int(2); // 2..3, so the right wall is at most column 5
    const kind = HUT_KINDS[rng.int(HUT_KINDS.length)];
    hut = { row, col, kind, door: { row: row + 1, col: col + 1 }, doorFront: { row: row + 2, col: col + 1 } };
    set(row, col, Tile.RoofLeft);
    set(row, col + 1, Tile.RoofMid);
    set(row, col + 2, Tile.RoofRight);
    set(row + 1, col, Tile.HutWallLeft);
    set(row + 1, col + 1, Tile.HutDoor);
    set(row + 1, col + 2, Tile.HutWallRight);
    set(row + 2, col + 1, Tile.Path);
  }

  const paint = (tile: Tile) => (row: number, col: number) => {
    const index = row * GRID + col;
    if (!fixed.has(index) && tiles[index] === Tile.Grass) tiles[index] = tile;
  };
  const crossings = (tile: Tile) => [...edges].filter(([, t]) => t === tile).map(([index]) => inward(index));

  // Rivers join the river crossings on the edges; a lone crossing ends in the
  // middle of the screen. Each river keeps one shallow tile, a ford.
  if (options.rivers) {
    const rivers = crossings(Tile.Water);
    const ends = rivers.length === 1 ? [{ row: 2 + rng.int(GRID - 4), col: 2 + rng.int(GRID - 4) }] : rivers.slice(1);
    for (const end of rivers.length > 0 ? ends : []) {
      const drawn: Position[] = [];
      meander(rng, rivers[0], end, (row, col) => {
        const index = row * GRID + col;
        if (fixed.has(index) || tiles[index] !== Tile.Grass) return;
        tiles[index] = Tile.Water;
        drawn.push({ row, col });
      });
      if (drawn.length >= 3) {
        const ford = drawn[1 + rng.int(drawn.length - 2)];
        tiles[ford.row * GRID + ford.col] = Tile.Grass;
      }
    }
  }

  // Paths join the path crossings, and the hut door if there is one.
  const paths = crossings(Tile.Path);
  const hub = hut ? hut.doorFront : paths.shift();
  if (hub) for (const end of paths) meander(rng, hub, end, paint(Tile.Path));

  // Trees and rocks on the grass that is left.
  if (options.scatter) {
    const density = 5 + rng.int(16); // percent
    for (let row = 1; row < LAST; row++) {
      for (let col = 1; col < LAST; col++) {
        const index = row * GRID + col;
        if (fixed.has(index) || tiles[index] !== Tile.Grass || rng.int(100) >= density) continue;
        tiles[index] = rng.int(10) < 7 ? Tile.Tree : Tile.Rock;
      }
    }
  }

  // Every open edge tile and the hut door must be reachable from each other.
  const required = [...edges].filter(([, tile]) => isWalkable(tile)).map(([index]) => index);
  if (hut) required.push(hut.doorFront.row * GRID + hut.doorFront.col);
  const first = required[0];
  const reachable = new Set(
    reachableFrom(tiles, { row: Math.floor(first / GRID), col: first % GRID }).map((p) => p.row * GRID + p.col),
  );
  if (!required.every((index) => reachable.has(index))) return null;

  return { world, x, y, tiles, hut };
}

/**
 * Generates the screen at (x, y) of a world. The same arguments always give the
 * same screen. The start screen (0, 0) always has a hut.
 */
export function generateScreen(world: number, x: number, y: number): GameMap {
  const rng = new Prng(hashInts(world, SALT_SCREEN, x, y));
  const wantHut = (x === 0 && y === 0) || rng.int(100) < HUT_CHANCE;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Later attempts drop the trees and rocks, which are what usually blocks the way.
    const map = tryGenerate(world, x, y, rng, wantHut, { rivers: true, scatter: attempt < MAX_ATTEMPTS / 2 });
    if (map) return map;
  }
  // Without rivers and scatter the interior is open grass around the hut, which
  // always connects every edge tile.
  const plain = tryGenerate(world, x, y, rng, wantHut, { rivers: false, scatter: false });
  if (!plain) throw new Error(`Could not generate screen (${x}, ${y}) of world ${world}`);
  return plain;
}

/** A random walkable tile on a screen to start from, connected to its open edges. */
export function startOn(map: GameMap): Player {
  const rng = new Prng(hashInts(map.world, SALT_START, map.x, map.y));
  const from = map.hut ? map.hut.doorFront : firstOpenEdge(map);
  const reachable = reachableFrom(map.tiles, from);
  const spot = reachable[rng.int(reachable.length)];
  return { ...spot, facing: DIRECTIONS[rng.int(DIRECTIONS.length)] };
}

function firstOpenEdge(map: GameMap): Position {
  for (let i = 0; i < GRID; i++) {
    for (const [row, col] of [
      [0, i],
      [LAST, i],
      [i, 0],
      [i, LAST],
    ]) {
      if (isWalkable(tileAt(map.tiles, row, col))) return { row, col };
    }
  }
  throw new Error('A screen with no open edge');
}
