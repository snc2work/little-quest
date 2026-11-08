import './style.css';

import { EVENTS, newWorld, render, step, type Action, type Frame, type StepEvent, type WorldState } from './game';
import { hashInts } from './lib/prng';
import { ModelClient } from './model/client';
import type { WorkerStep } from './model/worker';
import { FrameCanvas } from './ui/frameCanvas';

/** How long a screen stays black when going in or out. A display effect only. */
const FADE_MS = 300;
const HISTORY_ROWS = 40;
/** Keys pressed while the model is still drawing wait here, up to this many. */
const QUEUE_LIMIT = 3;
const MODEL_RUN = 'blocks-v1';
/** Salt for the seed of the model's random choices, from the world number. */
const SALT_DREAM = 7;

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
const KEY_LABELS: Record<Action, string> = { none: 'wait', up: '↑', down: '↓', left: '←', right: '→' };

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const modelScreen = new FrameCanvas(element<HTMLCanvasElement>('model-screen'));
const realScreen = new FrameCanvas(element<HTMLCanvasElement>('real-screen'));
const seedInput = element<HTMLInputElement>('seed');
const temperatureInput = element<HTMLInputElement>('temperature');
const temperatureValue = element<HTMLOutputElement>('temperature-value');
const statusLine = element<HTMLElement>('status');
const labels = {
  steps: element<HTMLElement>('steps'),
  modelTime: element<HTMLElement>('model-time'),
  same: element<HTMLElement>('same'),
  firstDifference: element<HTMLElement>('first-difference'),
  place: element<HTMLElement>('place'),
  remembered: element<HTMLElement>('remembered'),
  modelName: element<HTMLElement>('model-name'),
};
const countsBody = element<HTMLTableElement>('event-counts').tBodies[0];
const historyBody = element<HTMLTableElement>('history').tBodies[0];

const client = new ModelClient();
let ready = false;
let busy = true;
const queued: Action[] = [];
/** Changes on every restart, so late replies and fades from an older world are dropped. */
let generation = 0;

let real: WorldState;
let steps = 0;
let modelMs: number[] = [];
let firstDifference: { step: number; event: StepEvent } | null = null;
let counts: Record<string, { model: number; real: number }> = {};

function temperature(): number {
  return Number(temperatureInput.value);
}

function sameFrame(a: Frame, b: Frame): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function showCounts(): void {
  countsBody.replaceChildren(
    ...EVENTS.map((event) => {
      const row = document.createElement('tr');
      for (const text of [event, String(counts[event].model), String(counts[event].real)]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    }),
  );
}

function addHistory(action: Action, model: WorkerStep, realEvent: StepEvent): void {
  const row = document.createElement('tr');
  if (model.event !== realEvent) row.className = 'differs';
  const cells = [String(steps), KEY_LABELS[action], model.recalled ? `${model.event} (remembered)` : model.event, realEvent, model.ms.toFixed(0)];
  for (const text of cells) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
  }
  historyBody.prepend(row);
  while (historyBody.rows.length > HISTORY_ROWS) historyBody.deleteRow(-1);
}

function showStats(model: WorkerStep | null, same: boolean): void {
  labels.steps.textContent = String(steps);
  if (modelMs.length) {
    const mean = modelMs.reduce((a, b) => a + b, 0) / modelMs.length;
    labels.modelTime.textContent = `${modelMs[modelMs.length - 1].toFixed(0)} ms (mean ${mean.toFixed(0)} ms)`;
  } else {
    labels.modelTime.textContent = '-';
  }
  labels.same.textContent = same ? 'Yes' : 'No';
  labels.same.className = same ? 'yes' : 'no';
  labels.firstDifference.textContent = firstDifference
    ? `step ${firstDifference.step} (real game: ${firstDifference.event})`
    : 'none yet';
  if (model) {
    const { x, y, inRoom } = model.place;
    labels.place.textContent = `screen ${x}, ${y}${inRoom ? ', in the room' : ''}`;
    labels.remembered.textContent = String(model.remembered);
  } else {
    labels.place.textContent = 'screen 0, 0';
    labels.remembered.textContent = '0';
  }
  showCounts();
}

/** Black for a moment, then the frame. Resolves when the frame is shown. */
function fade(screen: FrameCanvas, frame: Frame, shown: number): Promise<void> {
  screen.clear();
  return new Promise((resolve) =>
    window.setTimeout(() => {
      if (generation === shown) screen.draw(frame);
      resolve();
    }, FADE_MS),
  );
}

async function start(seed: number, x = 0, y = 0): Promise<void> {
  const shown = ++generation;
  busy = true;
  queued.length = 0;
  seedInput.value = String(seed);
  real = newWorld(seed, x, y);
  steps = 0;
  modelMs = [];
  firstDifference = null;
  counts = Object.fromEntries(EVENTS.map((event) => [event, { model: 0, real: 0 }]));
  historyBody.replaceChildren();
  const frame = render(real);
  realScreen.draw(frame);
  modelScreen.draw(frame);
  showStats(null, true);
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  if (x || y) {
    url.searchParams.set('x', String(x));
    url.searchParams.set('y', String(y));
  } else {
    url.searchParams.delete('x');
    url.searchParams.delete('y');
  }
  window.history.replaceState(null, '', url);
  if (!ready) return;
  await client.reset(frame, hashInts(seed, SALT_DREAM));
  if (generation !== shown) return;
  busy = false;
  modelScreen.focus();
}

async function act(action: Action): Promise<void> {
  if (!ready) return;
  if (busy) {
    if (queued.length < QUEUE_LIMIT) queued.push(action);
    return;
  }
  busy = true;
  const shown = generation;
  const realResult = step(real, action);
  real = realResult.state;
  let model: WorkerStep;
  try {
    model = await client.step(action, temperature());
  } catch (error) {
    statusLine.textContent = `The model stopped: ${(error as Error).message}`;
    return;
  }
  if (generation !== shown) return;

  steps += 1;
  modelMs.push(model.ms);
  counts[model.event].model += 1;
  counts[realResult.event].real += 1;
  const realFrame = render(real);
  const same = sameFrame(model.frame, realFrame);
  if (!same && !firstDifference) firstDifference = { step: steps, event: realResult.event };
  addHistory(action, model, realResult.event);
  showStats(model, same);

  const fades: Promise<void>[] = [];
  const turns = (event: string) => event === 'enter' || event === 'exit';
  if (turns(realResult.event)) fades.push(fade(realScreen, realFrame, shown));
  else realScreen.draw(realFrame);
  if (turns(model.event)) fades.push(fade(modelScreen, model.frame, shown));
  else modelScreen.draw(model.frame);
  await Promise.all(fades);
  if (generation !== shown) return;

  busy = false;
  const next = queued.shift();
  if (next) void act(next);
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return;
  const action = KEY_ACTIONS[event.code];
  if (!action) return;
  event.preventDefault();
  void act(action);
});

for (const button of element<HTMLDivElement>('pad').querySelectorAll<HTMLButtonElement>('button')) {
  button.addEventListener('click', () => void act(button.dataset.action as Action));
}

element<HTMLButtonElement>('random').addEventListener('click', () => void start(randomSeed()));
element<HTMLButtonElement>('restart').addEventListener('click', () => void start(Number(seedInput.value) || 0));
seedInput.addEventListener('change', () => void start(Number(seedInput.value) || 0));
temperatureInput.addEventListener('input', () => {
  temperatureValue.textContent = temperature().toFixed(1);
  const url = new URL(window.location.href);
  url.searchParams.set('t', temperature().toFixed(1));
  window.history.replaceState(null, '', url);
});

/** Opens the world (and screen) from ?seed=&x=&y=&t= in the URL, or a random world. */
async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const int = (name: string) => {
    const value = params.get(name);
    return value !== null && Number.isInteger(Number(value)) ? Number(value) : null;
  };
  const t = Number(params.get('t'));
  if (params.has('t') && Number.isFinite(t) && t >= 0 && t <= 1.5) {
    temperatureInput.value = String(t);
    temperatureValue.textContent = t.toFixed(1);
  }
  const seed = int('seed');
  const first = seed === null || seed < 0 ? start(randomSeed()) : start(seed, int('x') ?? 0, int('y') ?? 0);
  await first;

  try {
    const summary = await client.load(`${import.meta.env.BASE_URL}models/${MODEL_RUN}/`);
    labels.modelName.textContent = `${summary.run}, ${(summary.parameters / 1e6).toFixed(1)}M parameters, ${summary.blocks} blocks`;
    ready = true;
    statusLine.textContent = '';
    statusLine.hidden = true;
    const [x, y] = [real.map.x, real.map.y];
    await start(Number(seedInput.value), x, y);
  } catch (error) {
    statusLine.textContent = `Could not load the world model: ${(error as Error).message}`;
  }
}

void main();
