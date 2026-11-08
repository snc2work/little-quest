import { describe, expect, it } from 'vitest';
import {
  GRID,
  HUT_KINDS,
  PALETTE,
  ROOM_EXIT,
  ROOM_SPAWN,
  SCREEN,
  Tile,
  generateScreen,
  isWalkable,
  newWorld,
  reachableFrom,
  render,
  renderScene,
  roomOf,
  screenKey,
  step,
  tileAt,
  type Action,
  type GameMap,
  type Player,
  type Room,
  type WorldState,
} from '../src/game';

const LAST = GRID - 1;
/** A block of screens around the start of a few worlds. */
const SCREENS: GameMap[] = [1, 2, 3].flatMap((world) =>
  Array.from({ length: 49 }, (_, i) => generateScreen(world, (i % 7) - 3, Math.floor(i / 7) - 3)),
);
const ROOMS = SCREENS.map(roomOf).filter((room): room is Room => room !== null);

/** A hand-made screen: open grass with the hut at the top left. */
function openMap(): GameMap {
  const tiles: Tile[] = new Array(GRID * GRID).fill(Tile.Grass);
  tiles.splice(0, 3, Tile.RoofLeft, Tile.RoofMid, Tile.RoofRight);
  tiles.splice(GRID, 3, Tile.HutWallLeft, Tile.HutDoor, Tile.HutWallRight);
  return {
    world: 1,
    x: 0,
    y: 0,
    tiles,
    hut: { row: 0, col: 0, kind: 'cabin', door: { row: 1, col: 1 }, doorFront: { row: 2, col: 1 } },
  };
}

/** A log-walled room with nothing inside, plus the given tiles. */
function emptyRoom(extra: Record<string, Tile> = {}): Room {
  const tiles: Tile[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const border = row === 0 || col === 0 || row === LAST || col === LAST;
      tiles.push(extra[`${row},${col}`] ?? (border ? Tile.Wall : Tile.Floor));
    }
  }
  tiles[ROOM_EXIT.row * GRID + ROOM_EXIT.col] = Tile.ExitDoor;
  return { tiles, wall: Tile.Wall, floor: Tile.Floor };
}

function worldOn(map: GameMap, player: Player, room: Room | null = emptyRoom()): WorldState {
  return { world: map.world, scene: 'map', map, room, rooms: {}, mapPlayer: player, roomPlayer: { ...ROOM_SPAWN } };
}

function play(state: WorldState, actions: readonly Action[]): WorldState {
  return actions.reduce((current, action) => step(current, action).state, state);
}

function roomTiles(state: WorldState) {
  if (!state.room) throw new Error('No room');
  return state.room.tiles;
}

const column = (map: GameMap, col: number) => Array.from({ length: GRID }, (_, row) => tileAt(map.tiles, row, col));
const row = (map: GameMap, r: number) => Array.from({ length: GRID }, (_, col) => tileAt(map.tiles, r, col));

describe('screens', () => {
  it('gives the same screen for the same world and position', () => {
    expect(generateScreen(7, 2, -1)).toEqual(generateScreen(7, 2, -1));
  });

  it('gives different screens at different positions', () => {
    const layouts = new Set(SCREENS.map((map) => map.tiles.join(',')));
    expect(layouts.size).toBe(SCREENS.length);
  });

  it('shares each edge with the neighbouring screen', () => {
    for (const map of SCREENS) {
      const right = generateScreen(map.world, map.x + 1, map.y);
      const below = generateScreen(map.world, map.x, map.y + 1);
      expect(column(map, LAST)).toEqual(column(right, 0));
      expect(row(map, LAST)).toEqual(row(below, 0));
    }
  });

  it('leaves at least two tiles open on every edge', () => {
    for (const map of SCREENS) {
      for (const edge of [row(map, 0), row(map, LAST), column(map, 0), column(map, LAST)]) {
        expect(edge.filter(isWalkable).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('connects every open edge tile and the hut door on the screen', () => {
    for (const map of SCREENS) {
      const open: [number, number][] = [];
      for (let i = 0; i < GRID; i++) {
        for (const [r, c] of [
          [0, i],
          [LAST, i],
          [i, 0],
          [i, LAST],
        ]) {
          if (isWalkable(tileAt(map.tiles, r, c))) open.push([r, c]);
        }
      }
      if (map.hut) open.push([map.hut.doorFront.row, map.hut.doorFront.col]);
      const reachable = reachableFrom(map.tiles, { row: open[0][0], col: open[0][1] });
      for (const [r, c] of open) expect(reachable).toContainEqual({ row: r, col: c });
    }
  });

  it('puts a hut on about half of the screens, always on the start screen', () => {
    const withHut = SCREENS.filter((map) => map.hut).length;
    expect(withHut).toBeGreaterThan(SCREENS.length * 0.35);
    expect(withHut).toBeLessThan(SCREENS.length * 0.65);
    for (const world of [1, 2, 3, 4, 5]) expect(generateScreen(world, 0, 0).hut).not.toBeNull();
    for (const map of SCREENS) {
      if (!map.hut) continue;
      expect(tileAt(map.tiles, map.hut.door.row, map.hut.door.col)).toBe(Tile.HutDoor);
      expect(tileAt(map.tiles, map.hut.doorFront.row, map.hut.doorFront.col)).toBe(Tile.Path);
    }
  });

  it('has rivers and paths, some of them crossing edges', () => {
    const count = (tile: Tile) => SCREENS.filter((map) => map.tiles.includes(tile)).length;
    expect(count(Tile.Water)).toBeGreaterThan(SCREENS.length * 0.3);
    expect(count(Tile.Path)).toBeGreaterThan(SCREENS.length * 0.5);
    const onEdge = (tile: Tile) => SCREENS.filter((map) => column(map, LAST).includes(tile)).length;
    expect(onEdge(Tile.Water)).toBeGreaterThan(0);
    expect(onEdge(Tile.Path)).toBeGreaterThan(0);
  });

  it('starts the player on a walkable tile of the start screen', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = newWorld(seed);
      expect(world.map.x).toBe(0);
      expect(world.map.y).toBe(0);
      expect(isWalkable(tileAt(world.map.tiles, world.mapPlayer.row, world.mapPlayer.col))).toBe(true);
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

  it('walks on paths', () => {
    const map = openMap();
    const tiles = [...map.tiles];
    tiles[5 * GRID + 4] = Tile.Path;
    expect(step(worldOn({ ...map, tiles }, { row: 4, col: 4, facing: 'up' }), 'down').event).toBe('move');
  });
});

describe('walking to the next screen', () => {
  /** A real screen of world 1, with the player on an open tile of the given edge. */
  function atEdge(side: 'up' | 'down' | 'left' | 'right'): { world: WorldState; player: Player } {
    for (const map of SCREENS.filter((m) => m.world === 1)) {
      for (let i = 1; i < LAST; i++) {
        const [r, c] = { up: [0, i], down: [LAST, i], left: [i, 0], right: [i, LAST] }[side];
        if (!isWalkable(tileAt(map.tiles, r, c))) continue;
        const player: Player = { row: r, col: c, facing: side };
        return { world: worldOn(map, player, roomOf(map)), player };
      }
    }
    throw new Error('No open edge');
  }

  it.each(['up', 'down', 'left', 'right'] as const)('crosses the %s edge onto the next screen', (side) => {
    const { world, player } = atEdge(side);
    const { state, event } = step(world, side);
    expect(event).toBe('cross');
    const dx = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    const dy = side === 'up' ? -1 : side === 'down' ? 1 : 0;
    expect(state.map).toEqual(generateScreen(1, world.map.x + dx, world.map.y + dy));
    const arrival = {
      row: side === 'up' ? LAST : side === 'down' ? 0 : player.row,
      col: side === 'left' ? LAST : side === 'right' ? 0 : player.col,
      facing: side,
    };
    expect(state.mapPlayer).toEqual(arrival);
    expect(isWalkable(tileAt(state.map.tiles, arrival.row, arrival.col))).toBe(true);
  });

  it('comes back to the same screen the other way', () => {
    const { world } = atEdge('right');
    const back = play(world, ['right', 'left']);
    expect(back.map).toEqual(world.map);
    expect(back.mapPlayer.row).toBe(world.mapPlayer.row);
    expect(back.mapPlayer.col).toBe(world.mapPlayer.col);
  });
});

describe('going in and out of huts', () => {
  it('enters the room by stepping up from the door front', () => {
    const { state, event } = step(worldOn(openMap(), { row: 2, col: 1, facing: 'left' }), 'up');
    expect(event).toBe('enter');
    expect(state.scene).toBe('room');
    expect(state.roomPlayer).toEqual(ROOM_SPAWN);
  });

  it('does not enter from any other direction', () => {
    expect(step(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }), 'left').event).toBe('move');
    expect(step(worldOn(openMap(), { row: 1, col: 3, facing: 'up' }), 'left').event).toBe('bump');
  });

  it('leaves by stepping down from the spawn, back in front of the door', () => {
    const inside = play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }), ['up']);
    const { state, event } = step(inside, 'down');
    expect(event).toBe('exit');
    expect(state.scene).toBe('map');
    expect(state.mapPlayer).toEqual({ row: 2, col: 1, facing: 'down' });
  });

  it('walks and bumps inside the room by its layout, and exits only from the spawn', () => {
    const room = emptyRoom({ '3,3': Tile.Barrel });
    const inside = play(worldOn(openMap(), { row: 2, col: 1, facing: 'up' }, room), ['up', 'up', 'up']);
    expect(inside.roomPlayer).toEqual({ row: 4, col: 3, facing: 'up' });
    expect(step(inside, 'up').event).toBe('bump');
    expect(step(play(inside, ['right', 'down']), 'down').event).toBe('move');
  });
});

describe('chests', () => {
  it('opens a chest by bumping into it, without moving', () => {
    const world = worldOn(openMap(), { row: 2, col: 1, facing: 'up' }, emptyRoom({ '6,4': Tile.Chest }));
    const { state, event } = step(step(world, 'up').state, 'right');
    expect(event).toBe('open');
    expect(state.roomPlayer).toEqual({ row: 6, col: 3, facing: 'right' });
    expect(tileAt(roomTiles(state), 6, 4)).toBe(Tile.OpenChest);
    expect(step(state, 'right').event).toBe('bump');
  });

  it('keeps the chest open after leaving the screen and coming back', () => {
    // A real screen with a hut and an open right edge; the test gives it a room with a chest.
    const map = SCREENS.find((m) => m.world === 1 && m.hut && column(m, LAST).some(isWalkable));
    if (!map?.hut) throw new Error('No suitable screen');
    let world = worldOn(map, { ...map.hut.doorFront, facing: 'up' }, emptyRoom({ '6,4': Tile.Chest }));
    world = play(world, ['up', 'right', 'down']);
    expect(world.scene).toBe('map');
    expect(tileAt(roomTiles(world), 6, 4)).toBe(Tile.OpenChest);

    // Off to the next screen and back: the room is the opened one, not a new one.
    const exitRow = column(map, LAST).findIndex(isWalkable);
    const there = step({ ...world, mapPlayer: { row: exitRow, col: LAST, facing: 'right' } }, 'right').state;
    expect(there.rooms[screenKey(map.x, map.y)]).toEqual(world.room);
    const back = step(there, 'left').state;
    expect(back.map).toEqual(map);
    expect(tileAt(roomTiles(back), 6, 4)).toBe(Tile.OpenChest);
  });
});

describe('rooms', () => {
  it('gives the same room for the same screen', () => {
    const map = SCREENS.find((m) => m.hut);
    if (!map) throw new Error('No hut');
    expect(roomOf(map)).toEqual(roomOf(map));
  });

  it('makes a different room for almost every hut', () => {
    const layouts = new Set(ROOMS.map((room) => room.tiles.join(',')));
    expect(layouts.size).toBeGreaterThan(ROOMS.length * 0.9);
  });

  it('keeps the exit and the spawn, and lets the player reach all the floor', () => {
    for (const room of ROOMS) {
      expect(tileAt(room.tiles, ROOM_EXIT.row, ROOM_EXIT.col)).toBe(Tile.ExitDoor);
      expect(tileAt(room.tiles, ROOM_SPAWN.row, ROOM_SPAWN.col)).toBe(room.floor);
      expect(reachableFrom(room.tiles, ROOM_SPAWN)).toHaveLength(room.tiles.filter(isWalkable).length);
    }
  });

  it('puts a chest in some rooms', () => {
    const withChest = ROOMS.filter((room) => room.tiles.includes(Tile.Chest)).length;
    expect(withChest).toBeGreaterThan(ROOMS.length * 0.25);
    expect(withChest).toBeLessThan(ROOMS.length * 0.55);
  });

  it('styles the room by the hut kind', () => {
    for (const map of SCREENS) {
      const room = roomOf(map);
      if (!map.hut || !room) continue;
      const stoneWalls = map.hut.kind === 'stone' || map.hut.kind === 'bath';
      expect(room.wall).toBe(stoneWalls ? Tile.StoneWall : Tile.Wall);
    }
  });

  it('uses every hut kind and draws each one differently', () => {
    const kinds = new Set(SCREENS.flatMap((map) => (map.hut ? [map.hut.kind] : [])));
    expect([...kinds].sort()).toEqual([...HUT_KINDS].sort());
    const huts = HUT_KINDS.map((kind) => renderScene(openMap().tiles, null, kind).join(','));
    expect(new Set(huts).size).toBe(HUT_KINDS.length);
  });
});

describe('rendering', () => {
  it('draws a 32x32 frame of palette indices', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
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
      expect(Math.floor(i / SCREEN / 4)).toBe(4);
      expect([4, 5]).toContain(Math.floor((i % SCREEN) / 4));
    }
  });

  it('draws furniture over the room floor', () => {
    const plank = emptyRoom({ '3,3': Tile.Barrel });
    const dirtTiles = plank.tiles.map((tile) => (tile === Tile.Floor ? Tile.DirtFloor : tile));
    const a = renderScene(plank.tiles, ROOM_SPAWN, 'cabin', Tile.Floor);
    const b = renderScene(dirtTiles, ROOM_SPAWN, 'cabin', Tile.DirtFloor);
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
