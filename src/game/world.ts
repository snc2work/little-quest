// The real game rules: movement, collisions, going in and out of huts and
// walking from one screen to the next. These rules are only used to make
// training data and to show the real world next to the model. The world model
// itself never calls them.

import { hashInts } from '../lib/prng';
import { generateScreen, startOn } from './map';
import { ROOM_SPAWN, generateRoom } from './room';
import {
  DELTAS,
  GRID,
  Tile,
  inBounds,
  isWalkable,
  screenKey,
  tileAt,
  type Action,
  type GameMap,
  type Player,
  type Room,
  type StepResult,
  type WorldState,
} from './types';

const SALT_ROOM = 6;

/** The room of a screen's hut as first generated, or null if it has no hut. */
export function roomOf(map: GameMap): Room | null {
  return map.hut ? generateRoom(hashInts(map.world, SALT_ROOM, map.x, map.y), map.hut.kind) : null;
}

/** Starts a world on screen (x, y), (0, 0) by default. */
export function newWorld(world: number, x = 0, y = 0): WorldState {
  const map = generateScreen(world, x, y);
  return {
    world,
    scene: 'map',
    map,
    room: roomOf(map),
    rooms: {},
    mapPlayer: startOn(map),
    roomPlayer: { ...ROOM_SPAWN },
  };
}

function at(player: Player, row: number, col: number): boolean {
  return player.row === row && player.col === col;
}

export function step(state: WorldState, action: Action): StepResult {
  if (action === 'none') return { state, event: 'stay' };

  const inRoom = state.scene === 'room';
  const player = inRoom ? state.roomPlayer : state.mapPlayer;
  const hut = state.map.hut;

  // Doors: up from the tile below the hut door, down from the tile above the room exit.
  if (!inRoom && hut && state.room && action === 'up' && at(player, hut.doorFront.row, hut.doorFront.col)) {
    return {
      state: { ...state, scene: 'room', mapPlayer: { ...player, facing: 'up' }, roomPlayer: { ...ROOM_SPAWN } },
      event: 'enter',
    };
  }
  if (inRoom && hut && action === 'down' && at(player, ROOM_SPAWN.row, ROOM_SPAWN.col)) {
    return {
      state: { ...state, scene: 'map', mapPlayer: { ...hut.doorFront, facing: 'down' } },
      event: 'exit',
    };
  }

  const row = player.row + DELTAS[action].dr;
  const col = player.col + DELTAS[action].dc;

  // Walking off the edge of a screen leads onto the next one.
  if (!inRoom && !inBounds(row, col)) return cross(state, action, row, col);

  const tiles = inRoom && state.room ? state.room.tiles : state.map.tiles;

  // Bumping into a closed chest opens it.
  if (inRoom && state.room && inBounds(row, col) && tileAt(tiles, row, col) === Tile.Chest) {
    const opened = [...tiles];
    opened[row * GRID + col] = Tile.OpenChest;
    return {
      state: { ...state, room: { ...state.room, tiles: opened }, roomPlayer: { ...player, facing: action } },
      event: 'open',
    };
  }

  const free = inBounds(row, col) && isWalkable(tileAt(tiles, row, col));
  const moved: Player = free ? { row, col, facing: action } : { ...player, facing: action };
  const next = inRoom ? { ...state, roomPlayer: moved } : { ...state, mapPlayer: moved };
  return { state: next, event: free ? 'move' : 'bump' };
}

function cross(state: WorldState, action: Exclude<Action, 'none'>, row: number, col: number): StepResult {
  const { map } = state;
  const x = map.x + DELTAS[action].dc;
  const y = map.y + DELTAS[action].dr;
  const next = generateScreen(state.world, x, y);
  const arrival: Player = { row: (row + GRID) % GRID, col: (col + GRID) % GRID, facing: action };
  // Shared edges make the arrival tile walkable whenever the departure tile is;
  // this guard only matters for hand-made states.
  if (!isWalkable(tileAt(next.tiles, arrival.row, arrival.col))) {
    return { state: { ...state, mapPlayer: { ...state.mapPlayer, facing: action } }, event: 'bump' };
  }
  const rooms = state.room ? { ...state.rooms, [screenKey(map.x, map.y)]: state.room } : state.rooms;
  return {
    state: {
      ...state,
      map: next,
      room: rooms[screenKey(x, y)] ?? roomOf(next),
      rooms,
      mapPlayer: arrival,
    },
    event: 'cross',
  };
}
