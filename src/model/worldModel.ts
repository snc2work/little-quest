// Runs the world model inside the page with ONNX Runtime.
//
// The model sees frames as an 8x8 grid of 4x4 blocks. The block list (model.json)
// was collected from the training frames; a frame is put back together by looking
// the blocks up. world.onnx is one pass of the network: for every cell of the next
// grid a score per block, and the event of the step. Drawing a next frame takes a
// few passes (MaskGIT): start with every cell unknown, and each round fix the cells
// the model is surest about, until all are known.
//
// No rule of the game is computed here. The frames and events come from the network.

import type { InferenceSession, Tensor } from 'onnxruntime-web';
import { randomInt } from '../lib/prng';

/** The few parts of onnxruntime-web this file uses, so tests can pass the Node build. */
export interface OrtApi {
  InferenceSession: { create(model: Uint8Array): Promise<InferenceSession> };
  Tensor: new (type: 'int32', data: Int32Array, dims: readonly number[]) => Tensor;
}

/** public/models/<run>/model.json, written by the training project's export script. */
export interface ModelInfo {
  run: string;
  parameters: number;
  frame: number;
  block: number;
  grid: number;
  palette: string[];
  actions: string[];
  events: string[];
  player_color: number;
  rounds: number;
  sure: number;
  temperature: number;
  /** Each block's pixels row by row, one character per palette index (0-9, then a-z). */
  blocks: string[];
}

/** An 8x8 grid of block numbers, row by row. */
export type Grid = Int32Array;

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Turns frames (palette indices) into block grids and back. */
export class Codebook {
  readonly pixels: Uint8Array[];
  /** Whether each block shows part of the player (the only red in the palette). */
  readonly isPlayer: boolean[];
  private readonly index = new Map<string, number>();

  constructor(
    readonly info: Pick<ModelInfo, 'frame' | 'block' | 'grid' | 'blocks' | 'player_color'>,
  ) {
    this.pixels = info.blocks.map((row) => Uint8Array.from(row, (ch) => CHARS.indexOf(ch)));
    this.isPlayer = this.pixels.map((block) => block.includes(info.player_color));
    info.blocks.forEach((row, i) => this.index.set(row, i));
  }

  get size(): number {
    return this.pixels.length;
  }

  /** A frame (frame x frame palette indices) as a grid. A block not in the list takes the closest one. */
  encode(frame: ArrayLike<number>): Grid {
    const { frame: size, block, grid } = this.info;
    const out = new Int32Array(grid * grid);
    const pixels = new Uint8Array(block * block);
    for (let cell = 0; cell < out.length; cell++) {
      const top = Math.floor(cell / grid) * block;
      const left = (cell % grid) * block;
      for (let i = 0; i < pixels.length; i++) pixels[i] = frame[(top + Math.floor(i / block)) * size + left + (i % block)];
      const key = Array.from(pixels, (v) => CHARS[v]).join('');
      out[cell] = this.index.get(key) ?? this.closest(pixels);
    }
    return out;
  }

  /** A grid as a frame of palette indices. */
  decode(cells: Grid): Uint8Array {
    const { frame: size, block, grid } = this.info;
    const out = new Uint8Array(size * size);
    for (let cell = 0; cell < cells.length; cell++) {
      const top = Math.floor(cell / grid) * block;
      const left = (cell % grid) * block;
      const pixels = this.pixels[cells[cell]];
      for (let i = 0; i < pixels.length; i++) out[(top + Math.floor(i / block)) * size + left + (i % block)] = pixels[i];
    }
    return out;
  }

  private closest(pixels: Uint8Array): number {
    let best = 0;
    let bestCount = Infinity;
    this.pixels.forEach((candidate, i) => {
      let count = 0;
      for (let p = 0; p < pixels.length; p++) if (candidate[p] !== pixels[p]) count++;
      if (count < bestCount) {
        best = i;
        bestCount = count;
      }
    });
    return best;
  }
}

/** A uniform number in [0, 1) from a seed, for sampling. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const next = randomInt(state, 4294967296);
    state = next.state;
    return next.value / 4294967296;
  };
}

export interface DrawOptions {
  /** 0 always takes the most likely block. */
  temperature?: number;
  rounds?: number;
  sure?: number;
  random?: () => number;
  /** A canvas with some cells already known (the rest set to `mask`); those cells are kept. */
  start?: Grid;
}

export interface Drawn {
  grid: Grid;
  event: number;
}

export class WorldModel {
  readonly codebook: Codebook;
  /** The canvas value for an unknown cell. */
  readonly mask: number;

  private constructor(
    private readonly ort: OrtApi,
    private readonly session: InferenceSession,
    readonly info: ModelInfo,
  ) {
    this.codebook = new Codebook(info);
    this.mask = this.codebook.size;
  }

  /** `onnx` is the bytes of world.onnx; `info` is model.json. */
  static async load(ort: OrtApi, onnx: Uint8Array, info: ModelInfo): Promise<WorldModel> {
    return new WorldModel(ort, await ort.InferenceSession.create(onnx), info);
  }

  /** One pass: block scores (cells x blocks, row by row) and the event. */
  async predict(current: Grid, canvas: Grid, action: number): Promise<{ logits: Float32Array; event: number }> {
    const { grid } = this.info;
    const out = await this.session.run({
      current: new this.ort.Tensor('int32', current, [1, grid, grid]),
      canvas: new this.ort.Tensor('int32', canvas, [1, grid, grid]),
      action: new this.ort.Tensor('int32', Int32Array.of(action), [1]),
    });
    return { logits: out.logits.data as Float32Array, event: Number((out.event.data as Int32Array)[0]) };
  }

  /** Draws the next grid over a few rounds, as draw_next in the training project. */
  async drawNext(current: Grid, action: number, options: DrawOptions = {}): Promise<Drawn> {
    const temperature = options.temperature ?? this.info.temperature;
    const rounds = options.rounds ?? this.info.rounds;
    const sure = options.sure ?? this.info.sure;
    const random = options.random ?? Math.random;
    const blocks = this.codebook.size;
    const total = current.length;
    const canvas = options.start ? Int32Array.from(options.start) : new Int32Array(total).fill(this.mask);
    let event = -1;
    const choice = new Int32Array(total);
    const confidence = new Float64Array(total);
    const probs = new Float64Array(blocks);

    for (let round = 0; round < rounds; round++) {
      const pass = await this.predict(current, canvas, action);
      if (event < 0) event = pass.event;
      for (let cell = 0; cell < total; cell++) {
        const scores = pass.logits.subarray(cell * blocks, (cell + 1) * blocks);
        softmax(scores, 1, probs);
        let picked: number;
        if (temperature <= 0) {
          picked = argmax(probs);
        } else {
          picked = sample(softmax(scores, temperature, new Float64Array(blocks)), random());
        }
        choice[cell] = picked;
        confidence[cell] = canvas[cell] === this.mask ? probs[picked] : -1;
      }

      let reveal: boolean[];
      if (round === rounds - 1) {
        reveal = Array.from(canvas, (value) => value === this.mask);
      } else {
        const knownAfter = Math.ceil(total * (1 - Math.cos(((Math.PI / 2) * (round + 1)) / rounds)));
        const knownNow = canvas.reduce((count, value) => count + (value === this.mask ? 0 : 1), 0);
        const need = Math.max(0, knownAfter - knownNow);
        // Surest first; equal ones keep the lower cell first, as the stable sort in Python.
        const order = Array.from({ length: total }, (_, cell) => cell).sort((a, b) => confidence[b] - confidence[a]);
        const rank = new Int32Array(total);
        order.forEach((cell, position) => (rank[cell] = position));
        reveal = Array.from(canvas, (value, cell) => value === this.mask && (rank[cell] < need || confidence[cell] > sure));
      }
      let unknown = 0;
      for (let cell = 0; cell < total; cell++) {
        if (reveal[cell]) canvas[cell] = choice[cell];
        if (canvas[cell] === this.mask) unknown++;
      }
      if (unknown === 0) break;
    }
    return { grid: canvas, event };
  }
}

function softmax(scores: Float32Array, temperature: number, out: Float64Array): Float64Array {
  let top = -Infinity;
  for (const score of scores) top = Math.max(top, score / temperature);
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    out[i] = Math.exp(scores[i] / temperature - top);
    sum += out[i];
  }
  for (let i = 0; i < scores.length; i++) out[i] /= sum;
  return out;
}

function argmax(values: Float64Array): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

function sample(probs: Float64Array, u: number): number {
  let sum = 0;
  for (let i = 0; i < probs.length; i++) {
    sum += probs[i];
    if (u < sum) return i;
  }
  return probs.length - 1;
}
