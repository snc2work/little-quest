import { describe, expect, it } from 'vitest';
import {
  GRID,
  PALETTE,
  ROOM_SPAWN,
  ROOM_TILES,
  SCREEN,
  Tile,
  generateMap,
  isWalkable,
  newWorld,
  reachableFrom,
  render,
  step,
  tileAt,
  type Action,
  type GameMap,
  type Player,
  type WorldState,
} from '../src/game';

const SEEDS = Array.from({ length: 300 }, (_, i) => i);

/** A world with an all-grass map, the hut at the top left and the player placed by hand. */
function worldOn(map: GameMap, player: Player): WorldState {
  return { scene: 'map', map, mapPlayer: player, roomPlayer: { ...ROOM_SPAWN } };
}

function openMap(): GameMap {
  const tiles: Tile[] = new Array(GRID * GRID).fill(Tile.Grass);
  tiles.splice(0, 3, Tile.RoofLeft, Tile.RoofMid, Tile.RoofRight);
  tiles.splice(GRID, 3, Tile.HutWall, Tile.HutDoor, Tile.HutWall);
  return { seed: -1, tiles, hut: { row: 0, col: 0 }, door: { row: 1, col: 1 }, doorFront: { row: 2, col: 1 } };
}

function play(state: WorldState, actions: readonly Action[]): WorldState {
  return actions.reduce((current, action) => step(current, action).state, state);
}

describe('map generation', () => {
  it('gives the same map for the same seed', () => {
    expect(generateMap(42)).toEqual(generateMap(42));
  });

  it('gives different maps for different seeds', () => {
    const layouts = new Set(SEEDS.map((seed) => generateMap(seed).map.tiles.join(',')));
    expect(layouts.size).toBeGreaterThan(SEEDS.length * 0.95);
  });

  it('puts the hut door above walkable grass that the player can reach', () => {
    for (const seed of SEEDS) {
      const { map, start } = generateMap(seed);
      expect(tileAt(map.tiles, map.door.row, map.door.col)).toBe(Tile.HutDoor);
      expect(tileAt(map.tiles, map.doorFront.row, map.doorFront.col)).toBe(Tile.Grass);
      const reachable = reachableFrom(map.tiles, map.doorFront);
      expect(reachable).toContainEqual({ row: start.row, col: start.col });
      expect(isWalkable(tileAt(map.tiles, start.row, start.col))).toBe(true);
    }
  });
});

describe('movement', () => {
  it('moves one tile and turns to face the move', () => {
    const { state, event } = step(worldOn(openMap(), { row: 4, col: 4, facing: 'up' }), 'right');
    expect(event).toBe('move');
    expect(state.mapPlayer).toEqual({ row: 4, col: 5, facing: 'right' });
  });

  it('stays put on "none"', () => {
    const world = worldOn(openMap(), { row: 4, col: 4, facing: 'left' });
    const { state, event } = step(world, 'none');
    expect(event).toBe('stay');
    expect(state).toEqual(world);
  });

  it('bumps at the screen edge, turning without moving', () => {
    const { state, event } = step(worldOn(openMap(), { row: 7, col: 7, facing: 'up' }), 'down');
    expect(event).toBe('bump');
    expect(state.mapPlayer).toEqual({ row: 7, col: 7, facing: 'down' });
  });

  it('bumps into trees, rocks and the hut walls', () => {
    const map = openMap();
    const tiles = [...map.tiles];
    tiles[5 * GRID + 5] = Tile.Tree;
    tiles[5 * GRID + 3] = Tile.Rock;
    const blocked = { ...map, tiles };
    expect(step(worldOn(blocked, { row: 4, col: 5, facing: 'up' }), 'down').event).toBe('bump');
    expect(step(worldOn(blocked, { row: 4, col: 3, facing: 'up' }), 'down').event).toBe('bump');
    expect(step(worldOn(blocked, { row: 2, col: 0, facing: 'down' }), 'up').event).toBe('bump');
    expect(step(worldOn(blocked, { row: 1, col: 3, facing: 'down' }), 'left').event).toBe('bump');
  });
});

describe('going in and out of the hut', () => {
  it('enters the room by stepping up from the door front', () => {
    const { state, event } = step(worldOn(openMap(), { row: 2, col: 1, facing: 'left' }), 'up');
    expect(event).toBe('enter');
    expect(state.scene).toBe('room');
    expect(state.roomPlayer).toEqual(ROOM_SPAWN);
  });

  it('does not enter from any other direction', () => {
    expect(step(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }), 'left').event).toBe('move');
    expect(step(worldOn(openMap(), { row: 1, col: 2, facing: 'up' }), 'left').event).toBe('bump');
  });

  it('leaves by stepping down from the spawn, back in front of the door', () => {
    const inside = play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }), ['up']);
    const { state, event } = step(inside, 'down');
    expect(event).toBe('exit');
    expect(state.scene).toBe('map');
    expect(state.mapPlayer).toEqual({ row: 2, col: 1, facing: 'down' });
    expect(state.map).toBe(inside.map);
  });

  it('walks and bumps inside the room by the room layout', () => {
    const inside = play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }), ['up', 'up', 'up', 'up']);
    expect(inside.roomPlayer).toEqual({ row: 3, col: 3, facing: 'up' });
    // The table is right above.
    expect(step(inside, 'up').event).toBe('bump');
    expect(tileAt(ROOM_TILES, 2, 3)).toBe(Tile.Table);
  });

  it('only exits from the spawn tile', () => {
    const inside = play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }), ['up', 'right']);
    expect(step(inside, 'down').event).toBe('bump');
  });
});

describe('rendering', () => {
  it('draws a 32x32 frame of palette indices', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const frame = render(newWorld(seed));
      expect(frame.length).toBe(SCREEN * SCREEN);
      expect(Math.max(...frame)).toBeLessThan(PALETTE.length);
    }
  });

  it('changes only around the player when it moves', () => {
    const world = worldOn(openMap(), { row: 4, col: 4, facing: 'right' });
    const before = render(world);
    const after = render(step(world, 'right').state);
    for (let i = 0; i < before.length; i++) {
      if (before[i] === after[i]) continue;
      const col = Math.floor((i % SCREEN) / 4);
      const row = Math.floor(i / SCREEN / 4);
      expect(row).toBe(4);
      expect([4, 5]).toContain(col);
    }
  });

  it('shows which way the player faces', () => {
    const world = worldOn(openMap(), { row: 4, col: 4, facing: 'right' });
    expect(render(step(world, 'none').state)).toEqual(render(world));
    expect(render(step(world, 'up').state)).not.toEqual(render(world));
  });
});
