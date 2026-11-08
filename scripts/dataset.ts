// Generates training data without a browser. Each episode is one world played
// by the explorer from its start screen. Stopping is safe: running the same
// command again skips the episodes that are already written.
//
//   npm run dataset -- --train 200 --val 20 --steps 500 --out ../lab/data/v1
//
// Layout of the output folder:
//   manifest.json                 settings, palette, action and event names, totals
//   <split>/ep-<world>.frames     (steps + 1) frames of 32 x 32 bytes (palette indices)
//   <split>/ep-<world>.json       actions, events, scenes and screens of the episode
//
// Splits use separate world numbers, so no screen or room is in two splits:
//   train: 1, 2, ...   val: 1000001, ...   test: 2000001, ...

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ACTIONS, EVENTS, PALETTE, SCREEN } from '../src/game';
import { runEpisode } from '../src/dataset/episode';

const FORMAT_VERSION = 1;
const SPLITS = { train: 1, val: 1_000_001, test: 2_000_001 } as const;
type Split = keyof typeof SPLITS;

interface EpisodeMeta {
  format_version: number;
  world: number;
  steps: number;
  actions: number[];
  events: number[];
  scenes: number[];
  screens: [number, number][];
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function integer(value: string, flag: string, min: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) fail(`${flag} must be an integer of at least ${min}`);
  return parsed;
}

const { values } = parseArgs({
  options: {
    train: { type: 'string', default: '200' },
    val: { type: 'string', default: '20' },
    test: { type: 'string', default: '0' },
    steps: { type: 'string', default: '500' },
    out: { type: 'string' },
  },
});
if (!values.out) fail('--out is required');
const out = values.out;
const steps = integer(values.steps, '--steps', 1);
const counts: Record<Split, number> = {
  train: integer(values.train, '--train', 0),
  val: integer(values.val, '--val', 0),
  test: integer(values.test, '--test', 0),
};

// A folder made with other settings would mix two kinds of episodes.
const manifestPath = join(out, 'manifest.json');
if (existsSync(manifestPath)) {
  const old = JSON.parse(readFileSync(manifestPath, 'utf8')) as { format_version: number; steps: number };
  if (old.format_version !== FORMAT_VERSION || old.steps !== steps) {
    fail(`${out} was made with other settings (format ${old.format_version}, ${old.steps} steps)`);
  }
}

/** Writes through a temporary file, so a stopped run never leaves half a file behind. */
function writeAtomic(path: string, data: string | Uint8Array): void {
  writeFileSync(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
}

const totals: Record<Split, { episodes: number; transitions: number; events: Record<string, number>; room_frames: number }> =
  {
    train: { episodes: 0, transitions: 0, events: {}, room_frames: 0 },
    val: { episodes: 0, transitions: 0, events: {}, room_frames: 0 },
    test: { episodes: 0, transitions: 0, events: {}, room_frames: 0 },
  };

const started = Date.now();
for (const split of Object.keys(SPLITS) as Split[]) {
  if (counts[split] === 0) continue;
  const dir = join(out, split);
  mkdirSync(dir, { recursive: true });
  let written = 0;
  for (let i = 0; i < counts[split]; i++) {
    const world = SPLITS[split] + i;
    const base = join(dir, `ep-${String(world).padStart(7, '0')}`);
    let meta: EpisodeMeta;
    // The .json is written last, so its presence means the episode is complete.
    if (existsSync(`${base}.json`)) {
      meta = JSON.parse(readFileSync(`${base}.json`, 'utf8')) as EpisodeMeta;
    } else {
      const episode = runEpisode(world, steps);
      meta = {
        format_version: FORMAT_VERSION,
        world,
        steps,
        actions: episode.actions,
        events: episode.events,
        scenes: episode.scenes,
        screens: episode.screens,
      };
      writeAtomic(`${base}.frames`, episode.frames);
      writeAtomic(`${base}.json`, JSON.stringify(meta));
      written += 1;
    }
    const total = totals[split];
    total.episodes += 1;
    total.transitions += meta.steps;
    total.room_frames += meta.scenes.reduce((sum, scene) => sum + scene, 0);
    for (const event of meta.events) total.events[EVENTS[event]] = (total.events[EVENTS[event]] ?? 0) + 1;
  }
  console.log(`${split}: ${counts[split]} episodes (${written} new)`);
}

writeAtomic(
  manifestPath,
  JSON.stringify(
    {
      format_version: FORMAT_VERSION,
      steps,
      screen: SCREEN,
      palette: PALETTE,
      actions: ACTIONS,
      events: EVENTS,
      first_world: SPLITS,
      totals,
    },
    null,
    2,
  ),
);

for (const split of Object.keys(SPLITS) as Split[]) {
  const total = totals[split];
  if (total.episodes === 0) continue;
  const share = (n: number) => `${((100 * n) / total.transitions).toFixed(1)}%`;
  const events = EVENTS.map((event) => `${event} ${share(total.events[event] ?? 0)}`).join(', ');
  console.log(`${split}: ${total.transitions} transitions; ${events}; inside rooms ${share(total.room_frames)}`);
}
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s -> ${out}`);
