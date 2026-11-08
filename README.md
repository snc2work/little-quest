# Little Quest

[日本語](README.ja.md)

A tiny **world model** you can play in the browser. It looks at the last frame (32×32 pixels, 11 colors) and your key, and draws the next frame. Walk into a hut or off the edge of the screen, and it makes up the room or the next screen on the spot, a different one each time. It is a toy-sized take on the idea behind [Genie](https://arxiv.org/abs/2402.15391): a world you can walk around in, drawn frame by frame by a neural network.

**Play it in your browser:** https://snc2work.github.io/little-quest/

![World No. 332: the world model on the left, the real game with the same keys on the right](docs/images/world-332.gif)

*Left: every frame drawn by the world model, from its own last frame and the key. Right: the real game with the same keys, for comparison. World No. 332, temperature 1.0.*

## What the model makes up

In the animation above, the two worlds match until the player enters the blue-roofed bathhouse. There the model makes up its own bath room, with a pool, plants and barrels. Back outside, the screen it left comes back. Across the edge of the screen, it draws a new screen of its own.

The model is probabilistic, so the same frame and key can lead to a different place each time. In the pictures below, each row starts from the same frame: one step before going into a hut (first picture) or across the edge of the screen (second picture). The model drew the next frame four times. The walls, floor and pool match the kind of hut, and the edge shared with the screen you came from carries over.

![Rooms the model drew when entering a hut, four times each](docs/images/new-rooms.png)

![Screens the model drew when walking off the edge, four times each](docs/images/new-screens.png)

## Approach

- **The real game only makes training videos.** A small adventure game was written for this project (see "The game" below). A simple bot walks around it and records frames and keys. The model never sees the rules, the maps or the rooms. It sees only frames and keys.
- **Generate, do not copy.** When the player goes somewhere new, there is no right answer to predict. The model is free to draw any room or screen that fits. It only has to be believable and to hold together.
- **Frames as blocks.** The game draws everything from 4×4 pictures on a grid, and the training frames contain only 60 different 4×4 blocks. A frame is treated as an 8×8 grid of those blocks. The model picks one block per cell, and the frame is put back together by looking the blocks up. Genie similarly works on image tokens.
- **A probabilistic model.** For every cell, the model gives a probability for each of the 60 blocks, and the next frame is sampled from these probabilities. Where the next frame follows from the current one (walking, bumping), almost all of the probability sits on one block, so the result is the same every time. Where it does not (a new room or screen), the probability is spread over many blocks, so the same frame and key can lead to different places. The temperature sets how widely the choices spread. The world number fixes the random choices, so a world can be played again.
- **Drawn over a few rounds ([MaskGIT](https://arxiv.org/abs/2202.04200)).** The model starts from a grid where every cell is unknown and fills it in over up to 8 rounds, the cells it is surest about first. When walking or bumping into a tree, it is sure of almost every cell in the first round. Later rounds see the cells already chosen, so the blocks that go together (a table, a hut, a river) come out whole.
- **A small memory of places, outside the model.** Along with each frame, the model also says what happened (see "Events" below). From that alone, the page keeps the last frame of each place. When the player goes back somewhere, that frame is handed to the model as the known part of the next frame, and the model only draws the player again. Every frame shown is still drawn by the model.
- **The black fade is the page's.** The short black screen when going in or out is a display effect added by the page. It is not drawn by the model.

## About the world model

A Transformer over the 8×8 grid of blocks, with 2.7 million parameters (6 layers, width 192, 6 heads). For each cell it gets the block of the current frame and the block of the next frame if already known (or "unknown"), plus the key. It gives, for every cell, the probability of each of the 60 blocks, and the event of the step.

| | |
| --- | --- |
| Training data | 200 worlds × 500 steps (100,000 steps) from the real game's bot |
| Training | 20,000 steps, batch 128 (PyTorch) |
| Size | 10.9 MB (ONNX, float32) |

In the page it runs with [ONNX Runtime Web](https://onnxruntime.ai/) inside a Web Worker. Only one pass of the network is in the ONNX file. The rounds of drawing and the memory of places are in TypeScript (`src/model/`).

## The game

- **Screens.** A screen is 8×8 tiles of 4×4 pixels (32×32 pixels, 11 colors). Each world number is its own world, and its screens go on without end in all four directions.
- **Tiles.** Grass and dirt paths can be walked on. Trees, rocks and water cannot. Each river keeps one shallow tile where it can be crossed.
- **Edges.** Walking off the edge of a screen leads straight to the next one. Neighboring screens share the tiles along their border, so an open edge is open on both sides, and rivers and paths carry on across it. The four corners of a screen are always a tree or a rock.
- **Huts.** About half of the screens have a hut, and the first screen always does. There are four kinds: a log cabin, a stone storehouse, a moss hut and a bathhouse. The kind sets the look of the room inside (walls, floor and furniture).
- **Rooms.** What is inside (pillars, furniture, a chest) is random for each screen, and a room stays the same while the world goes on. About 4 in 10 rooms have a chest. Walking into a chest opens it, and it stays open.

### Events

Each step of the real game has one of these events. The world model gives one too, from the frames alone.

| Event | When |
| --- | --- |
| `stay` | Wait |
| `move` | Walk one tile |
| `bump` | Walk into a tree, rock, water, wall or piece of furniture, and stay in place (facing it) |
| `open` | Walk into a closed chest |
| `enter` | Press Up on the path right below a hut door |
| `exit` | Press Down above the room's exit |
| `cross` | Walk off the edge of the screen |

The page [The real game's huts and rooms](https://snc2work.github.io/little-quest/gallery.html) shows a map of 5×5 screens of the real game and example rooms of each hut kind.

## Quick start

Requires Node.js 22.12 or later.

```bash
npm install
```

```bash
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). With pnpm, run `pnpm install` and `pnpm dev`.

## How to play

The top bar sets the world number (World No.) and the temperature. **Random** picks a new world number and **Restart** starts the same world again.

The **world number** picks the real game's world. It is also the seed of the model's random choices, so the same world number, keys and temperature give the same model world. The **temperature** sets how freely the model samples. At 0 it always takes the most likely block. Low values give plain, likely places, and high values give busier, odder ones. A new temperature applies from the next step.

| Action | Keyboard | Buttons |
| --- | --- | --- |
| Move | Arrow keys or WASD | ▲ ▼ ◀ ▶ |
| Wait | Space | Wait |
| Go inside | Stand on the path right below a hut door and press Up | |
| Go out | Stand above the room's exit and press Down | |

The address keeps the settings, for example `https://snc2work.github.io/little-quest/?seed=332&t=1.0`.

## Playing with the world model

The page loads the model (about 11 MB) and opens a random world. The model's world starts from the real game's first frame, and both worlds get the same keys. They show the same frames until the player first goes somewhere new. From there the model draws a world of its own, and the real game on the right shows what the real world does with the same keys.

### Reading the screen

- **World model (left):** the model's world. **Real game (right):** the same keys in the real game.
- **Stats:**
  - Steps, and the model's time per step
  - Whether the two worlds show the same frame now, and the step where they first parted
  - Where the model thinks the player is (screen, in a room or not), and how many places it remembers
  - A table of how often each event happened in each world
- **History:** the latest steps, with the key and the event in each world. "(remembered)" marks a step that went back to a place drawn before.

## Results

Measured on 20 worlds not used for training (10,000 steps).

### One step from a real frame

From a real frame, the model draws the next one. When waiting, moving, bumping or opening a chest, the next frame follows from the current one, so it should match the real game exactly. Entering a hut and crossing to a new screen lead somewhere new, so they are not supposed to match. For those, "2×2 windows seen" shows whether the picture holds together: the share of 2×2 windows of blocks that also occur in the training frames.

| Step | Exact frame | Event right | 2×2 windows seen | Player shown |
| --- | ---: | ---: | ---: | ---: |
| Wait | 99.7% | 100% | 99.3% | 99.7% |
| Move | 100% | 100% | 99.4% | 100% |
| Bump | 99.7% | 100% | 99.2% | 100% |
| Open a chest | 100% | 100% | 98.2% | 100% |
| Enter a hut (a new room) | – | 100% | 98.6% (real: 99.0%) | 98.1% |
| Cross to a new screen | – | 100% | 98.8% (real: 99.7%) | 100% |

"real" is the same measure on the real next frames, for comparison.

### 300 steps from its own frames

20 worlds, with the bot's keys, temperature 1.0.

| Steps | Player shown | 2×2 windows seen | Scenery kept while walking | Moves follow the picture |
| --- | ---: | ---: | ---: | ---: |
| 1–50 | 100% | 99.4% | 100% | 100% |
| 51–100 | 98.8% | 99.6% | 100% | 100% |
| 101–150 | 100% | 99.8% | 100% | 100% |
| 151–200 | 100% | 99.2% | 100% | 100% |
| 201–250 | 100% | 99.3% | 100% | 100% |
| 251–300 | 100% | 99.3% | 100% | 100% |

- **Scenery kept while walking:** blocks away from the player stay the same while waiting, walking or bumping.
- **Moves follow the picture:** the player walks onto blocks that look like ground (blocks the player stood on in the training data) and stops in front of others.
- **Where the worlds part:** the model's world matches the real game exactly until the first new place (a median of 10 steps). In all 20 worlds it first differs on entering a hut or crossing to a new screen, never while walking.

### Small flaws

- A hut on a new screen sometimes comes out broken (part of the roof shifted).
- A river sometimes stops short, and a single water block floats in the grass.
- New screens tend to be emptier than the real ones.
- Rarely, the player shows up twice in a new room (see the bottom row of the room picture above).

### What did not work first

The first model picked the color of each pixel, each on its own. It walked and bumped as well as this one, but new rooms and screens came out as scattered dots. The pixels of one table were chosen separately and never formed a table. Picking whole 4×4 blocks fixed this.

## How the model was trained

The model was trained in a separate project with Python and PyTorch. That code is not part of this repository. What ships here are the exported model (`public/models/`), the code that runs it in the page (`src/model/`), and a test (`tests/worldModel.test.ts`). The test checks that the page's code draws exactly the same frames as the training code, for 150 steps in each of two worlds. It covers the memory of places and uses temperature 0.

1. **Data.** The bot walked 200 worlds for 500 steps each (`npm run dataset`). 20 more worlds were kept aside for checking, and 20 for a final test.
2. **Blocks.** The 4×4 blocks of all training frames were collected (60 kinds). Every frame of the checking worlds is made of the same 60.
3. **Training.** As in MaskGIT, a random share of the next frame's cells was hidden, and the model learned to fill them in from the current frame, the key and the cells left. Cells that change between the two frames counted 4 times more. Rare steps (open, enter, exit, cross) were drawn more often.
4. **Export.** One pass of the network was exported to ONNX and checked against PyTorch. The largest score difference was 2×10⁻⁵, and no cell or event differed.

## For developers

For those who want to change the game or train their own world model on it. Built with TypeScript and Vite. Frames are drawn with Canvas 2D, and the world model runs on ONNX Runtime Web.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build for production (`dist/`) |
| `npm test` | Unit tests, including the check of the model code against the training code |
| `npm run dataset -- <options>` | Generate world model training data from the real game |

### Files

```
src/
  game/      The real game, as pure functions (screens, huts, rooms, steps, drawing). Also runs in Node.js
  dataset/   The bot that walks the real game, and episode recording
  model/     The world model in the page: blocks, rounds of drawing, memory of places, Web Worker
  ui/        Drawing frames on a canvas
  lib/       Seeded random numbers
  main.ts    The demo page
  gallery.ts The real game's huts and rooms
public/models/blocks-v1/
  world.onnx   One pass of the network
  model.json   The 60 blocks, palette, key and event names, drawing settings
scripts/
  dataset.ts   World model training data
tests/
  fixtures/    Frames drawn by the training code, for the page's test
```

### World model training data

```bash
npm run dataset -- --train 200 --val 20 --test 20 --steps 500 --out data/v1
```

Each episode is one world. The bot plays `--steps` steps from the first screen. It heads for hut doors, chests, room exits and screen edges, with some random steps and waits mixed in. Splits use different world numbers: train from 1, val from 1000001, test from 2000001. Running the same command again skips the episodes already written.

| File | Contents |
| --- | --- |
| `manifest.json` | The palette, the key and event names, and counts |
| `<split>/ep-<world>.frames` | `steps + 1` frames of 32×32 palette indices, 1 byte per pixel |
| `<split>/ep-<world>.json` | The key and event of each step, and the scene (outside or in a room) and screen of each frame |

The scene and screen are for analysis only. The world model is not given them.

## License

[MIT](LICENSE)
