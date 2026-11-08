// Shows a frame of palette indices on a canvas the size of the frame.
// CSS scales the canvas up with pixelated rendering.

import { PALETTE, SCREEN, type Frame } from '../game';

const RGB = PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));

export class FrameCanvas {
  private readonly context: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.width = SCREEN;
    canvas.height = SCREEN;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available');
    this.context = context;
    this.image = context.createImageData(SCREEN, SCREEN);
  }

  draw(frame: Frame): void {
    const data = this.image.data;
    for (let i = 0; i < frame.length; i++) {
      const [r, g, b] = RGB[frame[i]];
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
  }

  /** Paints the screen black, used for the fade between scenes. */
  clear(): void {
    this.context.fillStyle = '#000';
    this.context.fillRect(0, 0, SCREEN, SCREEN);
  }

  focus(): void {
    this.canvas.focus();
  }
}
