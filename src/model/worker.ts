/// <reference lib="webworker" />
// Runs the world model off the page's main thread, so the page stays smooth while
// the model draws. Messages are handled one at a time, in order.

import { DreamWorld } from './dreamWorld';
import { WorldModel, seededRandom, type ModelInfo } from './worldModel';

export type WorkerRequest =
  | { type: 'load'; id: number; base: string }
  | { type: 'reset'; id: number; frame: Uint8Array; seed: number }
  | { type: 'step'; id: number; action: string; temperature: number };

export interface ModelSummary {
  run: string;
  parameters: number;
  blocks: number;
  rounds: number;
  temperature: number;
}

export interface WorkerStep {
  frame: Uint8Array;
  event: string;
  recalled: boolean;
  place: { x: number; y: number; inRoom: boolean };
  remembered: number;
  ms: number;
}

export type WorkerReply =
  | { type: 'loaded'; id: number; summary: ModelSummary }
  | { type: 'reset'; id: number }
  | { type: 'step'; id: number; step: WorkerStep }
  | { type: 'error'; id: number; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let model: WorldModel | null = null;
let world: DreamWorld | null = null;
let random: () => number = Math.random;

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load ${url} (HTTP ${response.status})`);
  return response;
}

async function handle(request: WorkerRequest): Promise<WorkerReply> {
  switch (request.type) {
    case 'load': {
      const ort = await import('onnxruntime-web/wasm');
      // One thread needs no cross-origin isolation, and the model is small.
      ort.env.wasm.numThreads = 1;
      const [info, onnx] = await Promise.all([
        fetchOk(`${request.base}model.json`).then((r) => r.json() as Promise<ModelInfo>),
        fetchOk(`${request.base}world.onnx`).then(async (r) => new Uint8Array(await r.arrayBuffer())),
      ]);
      model = await WorldModel.load(ort, onnx, info);
      const summary = { run: info.run, parameters: info.parameters, blocks: model.codebook.size, rounds: info.rounds, temperature: info.temperature };
      return { type: 'loaded', id: request.id, summary };
    }
    case 'reset': {
      if (!model) throw new Error('the model is not loaded');
      world = DreamWorld.fromFrame(model, request.frame);
      random = seededRandom(request.seed);
      return { type: 'reset', id: request.id };
    }
    case 'step': {
      if (!world) throw new Error('no world to step');
      const started = performance.now();
      const step = await world.step(request.action, { temperature: request.temperature, random });
      return {
        type: 'step',
        id: request.id,
        step: {
          frame: step.frame,
          event: step.event,
          recalled: step.recalled,
          place: world.place,
          remembered: world.remembered,
          ms: performance.now() - started,
        },
      };
    }
  }
}

let queue = Promise.resolve();
scope.onmessage = (message: MessageEvent<WorkerRequest>) => {
  const request = message.data;
  queue = queue.then(async () => {
    try {
      const reply = await handle(request);
      scope.postMessage(reply, reply.type === 'step' ? [reply.step.frame.buffer] : []);
    } catch (error) {
      scope.postMessage({ type: 'error', id: request.id, message: (error as Error).message } satisfies WorkerReply);
    }
  });
};
