// The page's side of the model worker: one promise per request.

import type { ModelSummary, WorkerReply, WorkerRequest, WorkerStep } from './worker';

type Payload<T extends WorkerRequest['type']> = Omit<Extract<WorkerRequest, { type: T }>, 'id' | 'type'>;

export class ModelClient {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private readonly waiting = new Map<number, { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = (message: MessageEvent<WorkerReply>) => {
      const reply = message.data;
      const entry = this.waiting.get(reply.id);
      if (!entry) return;
      this.waiting.delete(reply.id);
      if (reply.type === 'error') entry.reject(new Error(reply.message));
      else entry.resolve(reply);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'the model worker failed');
      for (const entry of this.waiting.values()) entry.reject(error);
      this.waiting.clear();
    };
  }

  private send<T extends WorkerRequest['type']>(type: T, payload: Payload<T>, transfer: Transferable[] = []): Promise<WorkerReply> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...payload }, transfer);
    });
  }

  /** `base` is the folder with model.json and world.onnx. */
  async load(base: string): Promise<ModelSummary> {
    const reply = await this.send('load', { base });
    if (reply.type !== 'loaded') throw new Error(`unexpected reply ${reply.type}`);
    return reply.summary;
  }

  /** Starts the model's world from a frame. `seed` fixes its random choices. */
  async reset(frame: Uint8Array, seed: number): Promise<void> {
    await this.send('reset', { frame: Uint8Array.from(frame), seed });
  }

  async step(action: string, temperature: number): Promise<WorkerStep> {
    const reply = await this.send('step', { action, temperature });
    if (reply.type !== 'step') throw new Error(`unexpected reply ${reply.type}`);
    return reply.step;
  }
}
