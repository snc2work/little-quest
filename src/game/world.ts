// The real game rules: movement, collisions and going in and out of the hut.
// These rules are only used to make training data and to show the real world
// next to the model. The world model itself never calls them.

import { generateMap } from './map';
import { ROOM_SPAWN, generateRoom } from './room';
import {
  DELTAS,
  GRID,
  Tile,
  inBounds,
  isWalkable,
  tileAt,
  type Action,
  type Player,
  type StepResult,
  type WorldState,
} from './types';

export function newWorld(seed: number): WorldState {
  const { map, start } = generateMap(seed);
  const room = generateRoom(seed, map.hutKind);
  return { scene: 'map', map, room, mapPlayer: start, roomPlayer: { ...ROOM_SPAWN } };
}

function at(player: Player, row: number, col: number): boolean {
  return player.row === row && player.col === col;
}

export function step(state: WorldState, action: Action): StepResult {
  if (action === 'none') return { state, event: 'stay' };

  const inRoom = state.scene === 'room';
  const player = inRoom ? state.roomPlayer : state.mapPlayer;

  // Doors: up from the tile below the hut door, down from the tile above the room exit.
  if (!inRoom && action === 'up' && at(player, state.map.doorFront.row, state.map.doorFront.col)) {
    return {
      state: { ...state, scene: 'room', mapPlayer: { ...player, facing: 'up' }, roomPlayer: { ...ROOM_SPAWN } },
      event: 'enter',
    };
  }
  if (inRoom && action === 'down' && at(player, ROOM_SPAWN.row, ROOM_SPAWN.col)) {
    return {
      state: { ...state, scene: 'map', mapPlayer: { ...state.map.doorFront, facing: 'down' } },
      event: 'exit',
    };
  }

  const row = player.row + DELTAS[action].dr;
  const col = player.col + DELTAS[action].dc;
  const tiles = inRoom ? state.room.tiles : state.map.tiles;

  // Bumping into a closed chest opens it.
  if (inRoom && inBounds(row, col) && tileAt(tiles, row, col) === Tile.Chest) {
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
