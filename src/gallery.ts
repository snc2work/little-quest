import './style.css';

import { HUT_KINDS, ROOM_SPAWN, Tile, generateScreen, renderScene, roomOf, type HutKind } from './game';
import { FrameCanvas } from './ui/frameCanvas';

const WORLD = 1;
/** The overview shows screens from -RADIUS to RADIUS around the start. */
const RADIUS = 2;
const EXAMPLES_PER_KIND = 4;

const KIND_NAMES: Record<HutKind, string> = {
  cabin: 'Log cabin',
  stone: 'Stone storehouse',
  moss: 'Moss hut',
  bath: 'Bath house',
};

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

const playLink = (x: number, y: number) => `./?seed=${WORLD}&x=${x}&y=${y}`;

// The screens around the start, side by side, to see the shared edges.
const overview = document.getElementById('overview') as HTMLDivElement;
overview.style.gridTemplateColumns = `repeat(${2 * RADIUS + 1}, auto)`;
for (let y = -RADIUS; y <= RADIUS; y++) {
  for (let x = -RADIUS; x <= RADIUS; x++) {
    const map = generateScreen(WORLD, x, y);
    const link = document.createElement('a');
    link.href = playLink(x, y);
    link.title = `Screen (${x}, ${y})`;
    const canvas = document.createElement('canvas');
    link.append(canvas);
    overview.append(link);
    new FrameCanvas(canvas).draw(renderScene(map.tiles, null, map.hut?.kind));
  }
}

// Screens with a hut of each kind, walking outwards from the start.
const found = Object.fromEntries(HUT_KINDS.map((kind) => [kind, [] as { x: number; y: number }[]])) as Record<
  HutKind,
  { x: number; y: number }[]
>;
for (let ring = 0; HUT_KINDS.some((kind) => found[kind].length < EXAMPLES_PER_KIND); ring++) {
  for (let y = -ring; y <= ring; y++) {
    for (let x = -ring; x <= ring; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
      const hut = generateScreen(WORLD, x, y).hut;
      if (hut && found[hut.kind].length < EXAMPLES_PER_KIND) found[hut.kind].push({ x, y });
    }
  }
}

const container = document.getElementById('kinds') as HTMLDivElement;
for (const kind of HUT_KINDS) {
  const section = document.createElement('section');
  const title = document.createElement('h2');
  title.textContent = KIND_NAMES[kind];
  const row = document.createElement('div');
  row.className = 'row';

  for (const { x, y } of found[kind]) {
    const map = generateScreen(WORLD, x, y);
    const room = roomOf(map);
    if (!room) continue;
    const pair = document.createElement('div');
    pair.className = 'pair';
    const screen = figure(`Screen (${x}, ${y})`, playLink(x, y));
    new FrameCanvas(screen.canvas).draw(renderScene(map.tiles, null, kind));
    const inside = figure(room.tiles.includes(Tile.Chest) ? 'Its room (chest)' : 'Its room');
    inside.root.classList.add('room');
    new FrameCanvas(inside.canvas).draw(renderScene(room.tiles, ROOM_SPAWN, kind, room.floor));
    pair.append(screen.root, inside.root);
    row.append(pair);
  }

  section.append(title, row);
  container.append(section);
}

