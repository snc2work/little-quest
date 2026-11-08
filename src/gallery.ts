import './style.css';

import { HUT_KINDS, ROOM_SPAWN, Tile, generateMap, newWorld, renderScene, type HutKind } from './game';
import { FrameCanvas } from './ui/frameCanvas';

const EXAMPLES_PER_KIND = 4;

const KIND_NAMES: Record<HutKind, string> = {
  cabin: 'Log cabin',
  stone: 'Stone storehouse',
  moss: 'Moss hut',
  bath: 'Bath house',
};

/** The first few map numbers whose hut is of each kind. */
function exampleSeeds(): Record<HutKind, number[]> {
  const found = Object.fromEntries(HUT_KINDS.map((kind) => [kind, [] as number[]])) as Record<HutKind, number[]>;
  for (let seed = 1; HUT_KINDS.some((kind) => found[kind].length < EXAMPLES_PER_KIND); seed++) {
    const list = found[generateMap(seed).map.hutKind];
    if (list.length < EXAMPLES_PER_KIND) list.push(seed);
  }
  return found;
}

function figure(caption: string, href?: string): { root: HTMLElement; canvas: HTMLCanvasElement } {
  const root = document.createElement(href ? 'a' : 'figure');
  if (href && root instanceof HTMLAnchorElement) root.href = href;
  root.className = 'tile';
  const canvas = document.createElement('canvas');
  const label = document.createElement('span');
  label.textContent = caption;
  root.append(canvas, label);
  return { root, canvas };
}

const container = document.getElementById('kinds') as HTMLDivElement;
const seeds = exampleSeeds();

for (const kind of HUT_KINDS) {
  const section = document.createElement('section');
  const title = document.createElement('h2');
  title.textContent = KIND_NAMES[kind];
  const row = document.createElement('div');
  row.className = 'row';

  for (const seed of seeds[kind]) {
    const world = newWorld(seed);
    const pair = document.createElement('div');
    pair.className = 'pair';

    const map = figure(`Map ${seed}`, `./?seed=${seed}`);
    new FrameCanvas(map.canvas).draw(renderScene(world.map.tiles, world.mapPlayer, kind));
    const hasChest = world.room.tiles.includes(Tile.Chest);
    const room = figure(hasChest ? 'Its room (chest)' : 'Its room');
    room.root.classList.add('room');
    new FrameCanvas(room.canvas).draw(renderScene(world.room.tiles, ROOM_SPAWN, kind, world.room.floor));

    pair.append(map.root, room.root);
    row.append(pair);
  }

  section.append(title, row);
  container.append(section);
}
