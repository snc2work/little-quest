import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web';
import { beforeAll, describe, expect, it } from 'vitest';
import { newWorld, render } from '../src/game';
import { DreamWorld, WorldModel, seededRandom, type ModelInfo } from '../src/model';

// The fixture holds what the training project's rollout draws on the CPU for the
// first steps of two validation worlds, with temperature 0 (always the most likely
// block) and the memory of places. It is written by the export script, together
// with the ONNX file.
interface Fixture {
  run: string;
  cases: { world: number; actions: number[]; grids: number[][]; events: number[]; recalled: boolean[] }[];
}

const RUN = 'blocks-v1';
ort.env.wasm.numThreads = 1;

let model: WorldModel;
let fixture: Fixture;

beforeAll(async () => {
  const info = JSON.parse(readFileSync(`public/models/${RUN}/model.json`, 'utf8')) as ModelInfo;
  model = await WorldModel.load(ort, new Uint8Array(readFileSync(`public/models/${RUN}/world.onnx`)), info);
  fixture = JSON.parse(readFileSync(`tests/fixtures/world-model-${RUN}.json`, 'utf8')) as Fixture;
});

describe('the block list', () => {
  it('turns the real game frames into the same grids as the training project', () => {
    for (const { world, grids } of fixture.cases) {
      const frame = render(newWorld(world));
      const grid = model.codebook.encode(frame);
      expect(Array.from(grid)).toEqual(grids[0]);
      expect(model.codebook.decode(grid)).toEqual(frame);
    }
  });

  it('marks the blocks that show the player', () => {
    const start = model.codebook.encode(render(newWorld(fixture.cases[0].world)));
    expect(Array.from(start).filter((block) => model.codebook.isPlayer[block])).toHaveLength(1);
  });
});

describe(`the shipped model ${RUN}`, () => {
  it('plays the same frames as the training project, memory of places included', async () => {
    let recalled = 0;
    for (const { actions, grids, events } of fixture.cases) {
      const world = new DreamWorld(model, Int32Array.from(grids[0]));
      for (const [t, action] of actions.entries()) {
        const step = await world.step(model.info.actions[action], { temperature: 0 });
        expect(step.event, `world step ${t}`).toBe(model.info.events[events[t]]);
        expect(Array.from(step.grid), `world step ${t}`).toEqual(grids[t + 1]);
        if (step.recalled) recalled++;
      }
    }
    expect(recalled).toBe(fixture.cases.flatMap((c) => c.recalled).filter(Boolean).length);
    expect(recalled).toBeGreaterThan(0);
  }, 120000);

  it('samples whole frames, the same ones for the same seed', async () => {
    const start = model.codebook.encode(render(newWorld(fixture.cases[0].world)));
    const draw = () => model.drawNext(start, model.info.actions.indexOf('up'), { temperature: 1, random: seededRandom(7) });
    const a = await draw();
    const b = await draw();
    expect(a).toEqual(b);
    expect(a.grid.every((block) => block >= 0 && block < model.codebook.size)).toBe(true);
  });

  it('keeps the cells it is given', async () => {
    const start = model.codebook.encode(render(newWorld(fixture.cases[0].world)));
    const canvas = start.map((block, cell) => (cell < 32 ? block : model.mask));
    const { grid } = await model.drawNext(start, 0, { temperature: 1, random: seededRandom(1), start: canvas });
    expect(Array.from(grid.subarray(0, 32))).toEqual(Array.from(start.subarray(0, 32)));
    expect(grid.every((block) => block < model.mask)).toBe(true);
  });
});
