import './style.css';

import { newWorld, render, step, type Action, type StepEvent, type WorldState } from './game';
import { FrameCanvas } from './ui/frameCanvas';

/** How long the screen stays black when the scene switches. A display effect only. */
const FADE_MS = 300;

const KEY_ACTIONS: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'none',
};

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const screen = new FrameCanvas(element<HTMLCanvasElement>('screen'));
const seedInput = element<HTMLInputElement>('seed');
const sceneLabel = element<HTMLElement>('scene');
const screenLabel = element<HTMLElement>('screen-pos');
const stepsLabel = element<HTMLElement>('steps');
const eventLabel = element<HTMLElement>('event');

let world: WorldState;
let steps = 0;
let fading = false;

function updateInfo(event: StepEvent | null): void {
  sceneLabel.textContent = world.scene === 'map' ? 'Map' : 'Room';
  screenLabel.textContent = `${world.map.x}, ${world.map.y}`;
  stepsLabel.textContent = String(steps);
  eventLabel.textContent = event ?? '-';
}

function start(seed: number, x = 0, y = 0): void {
  seedInput.value = String(seed);
  world = newWorld(seed, x, y);
  steps = 0;
  fading = false;
  screen.draw(render(world));
  updateInfo(null);
  screen.focus();
}

function act(action: Action): void {
  if (fading) return;
  const result = step(world, action);
  world = result.state;
  steps += 1;
  updateInfo(result.event);
  if (result.event === 'enter' || result.event === 'exit') {
    fading = true;
    screen.clear();
    const shown = world;
    window.setTimeout(() => {
      if (world !== shown) return; // restarted meanwhile
      fading = false;
      screen.draw(render(world));
    }, FADE_MS);
    return;
  }
  screen.draw(render(world));
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  const action = KEY_ACTIONS[event.code];
  if (!action) return;
  event.preventDefault();
  act(action);
});

for (const button of element<HTMLDivElement>('pad').querySelectorAll<HTMLButtonElement>('button')) {
  button.addEventListener('click', () => act(button.dataset.action as Action));
}

element<HTMLButtonElement>('random').addEventListener('click', () => start(randomSeed()));
element<HTMLButtonElement>('restart').addEventListener('click', () => start(Number(seedInput.value) || 0));
seedInput.addEventListener('change', () => start(Number(seedInput.value) || 0));

/** Opens the world (and screen) from ?seed=&x=&y= in the URL, or a random world. */
function startFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const int = (name: string) => {
    const value = params.get(name);
    return value !== null && Number.isInteger(Number(value)) ? Number(value) : null;
  };
  const seed = int('seed');
  if (seed === null || seed < 0) return start(randomSeed());
  start(seed, int('x') ?? 0, int('y') ?? 0);
}

startFromUrl();
