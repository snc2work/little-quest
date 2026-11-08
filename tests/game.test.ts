import { describe, expect, it } from 'vitest';
import {
  GRID,
  PALETTE,
  HUT_KINDS,
  ROOM_EXIT,
  ROOM_SPAWN,
  SCREEN,
  Tile,
  generateMap,
  generateRoom,
  isWalkable,
  newWorld,
  reachableFrom,
  render,
  renderScene,
  step,
  tileAt,
  type Action,
  type GameMap,
  type Player,
  type Room,
  type WorldState,
} from '../src/game';

const SEEDS = Array.from({ length: 300 }, (_, i) => i);

/** A world with a hand-made map and room, and the player placed by hand. */
function worldOn(map: GameMap, player: Player, room: Room = emptyRoom()): WorldState {
  return { scene: 'map', map, room, mapPlayer: player, roomPlayer: { ...ROOM_SPAWN } };
}

/** A log-walled room with nothing inside, plus the given tiles. */
function emptyRoom(extra: Record<string, Tile> = {}): Room {
  const tiles: Tile[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const border = row === 0 || col === 0 || row === GRID - 1 || col === GRID - 1;
      tiles.push(extra[`${row},${col}`] ?? (border ? Tile.Wall : Tile.Floor));
    }
  }
  tiles[ROOM_EXIT.row * GRID + ROOM_EXIT.col] = Tile.ExitDoor;
  return { tiles, wall: Tile.Wall, floor: Tile.Floor };
}

function openMap(): GameMap {
  const tiles: Tile[] = new Array(GRID * GRID).fill(Tile.Grass);
  tiles.splice(0, 3, Tile.RoofLeft, Tile.RoofMid, Tile.RoofRight);
  tiles.splice(GRID, 3, Tile.HutWallLeft, Tile.HutDoor, Tile.HutWallRight);
  return { seed: -1, tiles, hut: { row: 0, col: 0 }, hutKind: 'cabin', door: { row: 1, col: 1 }, doorFront: { row: 2, col: 1 } };
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

  it('puts the start of a path below the hut door, where the player can reach', () => {
    for (const seed of SEEDS) {
      const { map, start } = generateMap(seed);
      expect(tileAt(map.tiles, map.door.row, map.door.col)).toBe(Tile.HutDoor);
      expect(tileAt(map.tiles, map.doorFront.row, map.doorFront.col)).toBe(Tile.Path);
      const reachable = reachableFrom(map.tiles, map.doorFront);
      expect(reachable).toContainEqual({ row: start.row, col: start.col });
      expect(isWalkable(tileAt(map.tiles, start.row, start.col))).toBe(true);
    }
  });

  it('makes some maps with ponds or rivers, and paths longer than one tile', () => {
    const counts = SEEDS.map((seed) => {
      const { tiles } = generateMap(seed).map;
      return { water: tiles.filter((t) => t === Tile.Water).length, path: tiles.filter((t) => t === Tile.Path).length };
    });
    const withWater = counts.filter((c) => c.water > 0).length;
    expect(withWater).toBeGreaterThan(SEEDS.length * 0.4);
    expect(withWater).toBeLessThan(SEEDS.length * 0.9);
    expect(counts.filter((c) => c.path > 1).length).toBeGreaterThan(SEEDS.length * 0.5);
  });
});

describe('movement', () => {
  it('moves one tile and turns to face the move', () => {
    const { state, event } = step(worldOn(openMap(), { row: 4, col: 4, facing: 'up' }), 'right');
    expect(event).toBe('move');
    expect(state.mapPlayer).toEqual({ row: 4, col: 5, facing: 'right' });
  });

  it('walks on the path', () => {
    const map = openMap();
    const tiles = [...map.tiles];
    tiles[5 * GRID + 4] = Tile.Path;
    const { event } = step(worldOn({ ...map, tiles }, { row: 4, col: 4, facing: 'up' }), 'down');
    expect(event).toBe('move');
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

  it('bumps into trees, rocks, water and the hut walls', () => {
    const map = openMap();
    const tiles = [...map.tiles];
    tiles[5 * GRID + 5] = Tile.Tree;
    tiles[5 * GRID + 3] = Tile.Rock;
    tiles[5 * GRID + 7] = Tile.Water;
    const blocked = { ...map, tiles };
    expect(step(worldOn(blocked, { row: 4, col: 5, facing: 'up' }), 'down').event).toBe('bump');
    expect(step(worldOn(blocked, { row: 4, col: 3, facing: 'up' }), 'down').event).toBe('bump');
    expect(step(worldOn(blocked, { row: 4, col: 7, facing: 'up' }), 'down').event).toBe('bump');
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
    const room = emptyRoom({ '3,3': Tile.Barrel });
    const inside = play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }, room), ['up', 'up', 'up']);
    expect(inside.roomPlayer).toEqual({ row: 4, col: 3, facing: 'up' });
    expect(step(inside, 'up').event).toBe('bump');
  });

  it('only exits from the spawn tile', () => {
    const inside = play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }), ['up', 'right']);
    expect(step(inside, 'down').event).toBe('bump');
  });
});

describe('chests', () => {
  const room = emptyRoom({ '5,4': Tile.Chest });
  const nextToChest = () => play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }, room), ['up']);

  it('opens a chest by bumping into it, without moving', () => {
    const beside = worldOn(openMap(), { row: 2, col: 1, facing: 'up' }, emptyRoom({ '6,4': Tile.Chest }));
    const inside = step(beside, 'up').state;
    const { state, event } = step(inside, 'right');
    expect(event).toBe('open');
    expect(state.roomPlayer).toEqual({ row: 6, col: 3, facing: 'right' });
    expect(tileAt(state.room.tiles, 6, 4)).toBe(Tile.OpenChest);
  });

  it('turns the chest into an open chest that still blocks the way', () => {
    // The chest is up and to the right of the spawn; walk up first, then bump right.
    const below = play(nextToChest(), ['up']);
    expect(below.roomPlayer).toEqual({ row: 5, col: 3, facing: 'up' });
    const { state, event } = step(below, 'right');
    expect(event).toBe('open');
    expect(tileAt(state.room.tiles, 5, 4)).toBe(Tile.OpenChest);
    expect(step(state, 'right').event).toBe('bump');
  });

  it('keeps the chest open after leaving and coming back', () => {
    const opened = play(nextToChest(), ['up', 'right', 'down', 'down', 'up']);
    expect(opened.scene).toBe('room');
    expect(tileAt(opened.room.tiles, 5, 4)).toBe(Tile.OpenChest);
  });
});

describe('rooms', () => {
  const worlds = SEEDS.map((seed) => newWorld(seed));

  it('gives the same room for the same map', () => {
    expect(newWorld(42).room).toEqual(newWorld(42).room);
  });

  it('makes a different room for almost every map', () => {
    const layouts = new Set(worlds.map((world) => world.room.tiles.join(',')));
    expect(layouts.size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('keeps the exit and the spawn, and lets the player reach all the floor', () => {
    for (const { room } of worlds) {
      expect(tileAt(room.tiles, ROOM_EXIT.row, ROOM_EXIT.col)).toBe(Tile.ExitDoor);
      expect(tileAt(room.tiles, ROOM_SPAWN.row, ROOM_SPAWN.col)).toBe(room.floor);
      expect(reachableFrom(room.tiles, ROOM_SPAWN)).toHaveLength(room.tiles.filter(isWalkable).length);
    }
  });

  it('puts a chest in some rooms, always next to the floor', () => {
    let withChest = 0;
    for (const { room } of worlds) {
      const index = room.tiles.indexOf(Tile.Chest);
      if (index < 0) continue;
      withChest += 1;
      const row = Math.floor(index / GRID);
      const col = index % GRID;
      const next = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ].filter(([r, c]) => isWalkable(tileAt(room.tiles, r, c)));
      expect(next.length).toBeGreaterThan(0);
    }
    expect(withChest).toBeGreaterThan(SEEDS.length * 0.3);
    expect(withChest).toBeLessThan(SEEDS.length * 0.5);
  });

  it('styles the room by the hut kind', () => {
    for (const { map, room } of worlds) {
      expect(room).toEqual(generateRoom(map.seed, map.hutKind));
      const stoneWalls = map.hutKind === 'stone' || map.hutKind === 'bath';
      expect(room.wall).toBe(stoneWalls ? Tile.StoneWall : Tile.Wall);
    }
  });

  it('uses every hut kind and draws each one differently', () => {
    const kinds = new Set(worlds.map((world) => world.map.hutKind));
    expect([...kinds].sort()).toEqual([...HUT_KINDS].sort());
    const player = { row: 7, col: 7, facing: 'down' } as const;
    const huts = HUT_KINDS.map((kind) => renderScene(openMap().tiles, player, kind).join(','));
    expect(new Set(huts).size).toBe(HUT_KINDS.length);
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

  it('draws furniture over the room floor', () => {
    const plank = emptyRoom({ '3,3': Tile.Barrel });
    const dirt: Room = { ...plank, tiles: plank.tiles.map((t) => (t === Tile.Floor ? Tile.DirtFloor : t)), floor: Tile.DirtFloor };
    const a = renderScene(plank.tiles, ROOM_SPAWN, 'cabin', plank.floor);
    const b = renderScene(dirt.tiles, ROOM_SPAWN, 'cabin', dirt.floor);
    // The barrel's corner pixel shows the floor under it.
    const corner = 3 * 4 * SCREEN + 3 * 4;
    expect(a[corner]).not.toBe(b[corner]);
  });

  it('shows which way the player faces', () => {
    const world = worldOn(openMap(), { row: 4, col: 4, facing: 'right' });
    expect(render(step(world, 'none').state)).toEqual(render(world));
    expect(render(step(world, 'up').state)).not.toEqual(render(world));
  });
});
