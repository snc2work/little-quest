// Shared constants and types of the game.

/** The screen is SCREEN x SCREEN pixels. */
export const SCREEN = 32;
/** Each tile is TILE x TILE pixels. */
export const TILE = 4;
/** The world is a GRID x GRID grid of tiles, exactly one screen. */
export const GRID = SCREEN / TILE;

/** Actions in a fixed order; the index is the action id used in data and models. */
export const ACTIONS = ['none', 'up', 'down', 'left', 'right'] as const;
export type Action = (typeof ACTIONS)[number];
export type Direction = Exclude<Action, 'none'>;

export const DELTAS: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

/** Tile kinds. Only Grass, Path, Floor and DirtFloor can be walked on. */
export const Tile = {
  Grass: 0,
  Tree: 1,
  Rock: 2,
  RoofLeft: 3,
  RoofMid: 4,
  RoofRight: 5,
  HutWallLeft: 6,
  HutDoor: 7,
  Floor: 8,
  Wall: 9,
  ExitDoor: 10,
  Table: 11,
  Bed: 12,
  Barrel: 13,
  Water: 14,
  Path: 15,
  HutWallRight: 16,
  Fireplace: 17,
  StoneWall: 18,
  DirtFloor: 19,
  Crate: 20,
  Plant: 21,
  Chest: 22,
  OpenChest: 23,
  Pot: 24,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export function isWalkable(tile: Tile): boolean {
  return tile === Tile.Grass || tile === Tile.Path || tile === Tile.Floor || tile === Tile.DirtFloor;
}

export interface Position {
  row: number;
  col: number;
}

export interface Player extends Position {
  facing: Direction;
}

/** A GRID x GRID tile layout in row-major order. */
export type Layout = readonly Tile[];

export function tileAt(layout: Layout, row: number, col: number): Tile {
  return layout[row * GRID + col];
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID && col >= 0 && col < GRID;
}

export type Scene = 'map' | 'room';

/**
 * Kinds of hut. Each kind looks different from outside and sets the style of its
 * room (walls, floor, furniture). What is inside is random for each map.
 */
export const HUT_KINDS = ['cabin', 'stone', 'moss', 'bath'] as const;
export type HutKind = (typeof HUT_KINDS)[number];

export interface GameMap {
  seed: number;
  tiles: Layout;
  /** Top-left tile of the 3x2 hut. */
  hut: Position;
  hutKind: HutKind;
  /** The hut's door tile. */
  door: Position;
  /** The tile below the door; stepping up from here enters the hut. */
  doorFront: Position;
}

export interface Room {
  tiles: Layout;
  wall: Tile;
  floor: Tile;
}

export interface WorldState {
  scene: Scene;
  map: GameMap;
  /** The inside of this map's hut. Opened chests stay open. */
  room: Room;
  /** The player on the map. Kept while inside, so leaving puts them back by the door. */
  mapPlayer: Player;
  /** The player in the room. */
  roomPlayer: Player;
}

/**
 * What a step did. "enter" and "exit" switch the scene; these are the signals the
 * world model will have to predict along with the next image. "open" is bumping
 * into a closed chest, which opens it.
 */
export type StepEvent = 'stay' | 'move' | 'bump' | 'open' | 'enter' | 'exit';

export interface StepResult {
  state: WorldState;
  event: StepEvent;
}
