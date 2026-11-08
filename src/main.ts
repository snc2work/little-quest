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
const stepsLabel = element<HTMLElement>('steps');
const eventLabel = element<HTMLElement>('event');

let world: WorldState;
let steps = 0;
let fading = false;

function updateInfo(event: StepEvent | null): void {
  sceneLabel.textContent = world.scene === 'map' ? 'Map' : 'Room';
  stepsLabel.textContent = String(steps);
  eventLabel.textContent = event ?? '-';
}

function start(seed: number): void {
  seedInput.value = String(seed);
  world = newWorld(seed);
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

element<HTMLButtonElement>('random').addEventListener('click', () => start(randomSeed()));
element<HTMLButtonElement>('restart').addEventListener('click', () => start(Number(seedInput.value) || 0));
seedInput.addEventListener('change', () => start(Number(seedInput.value) || 0));

start(randomSeed());
