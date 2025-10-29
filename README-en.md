[中文版](./README.md)

# @jyostudio/lyric

![Preview](./example/preview.png)

A pure TypeScript library for parsing and rendering lyrics, including:
- Core parsing & control module: `dist/lyric.js` (default export `Lyric`, named export `LyricController`)
- Native Web Component: `dist/jyo-lyric.js` (custom element `<jyo-lyric>`)

Supports multiple popular lyric formats: LRC, TRC, KRC, KSC, QRC (auto-detection priority: QRC → KRC → KSC → TRC → LRC).

## Installation

```bash
npm install @jyostudio/lyric
# or
pnpm add @jyostudio/lyric
# or
yarn add @jyostudio/lyric
```

CDN：
- jsDelivr: https://cdn.jsdelivr.net/npm/@jyostudio/lyric/dist/lyric.js
- unpkg: https://unpkg.com/@jyostudio/lyric/dist/lyric.js

> The build output is ESM and works with modern bundlers and browsers via `<script type="module">`.

---

## Quick Start

### 1) Core parsing & control (`lyric.js`)

Works in Node.js (23+) and browsers. Default export `Lyric`, named export `LyricController`. This package is ESM-only.

```ts
// ESM
import Lyric, { LyricController } from '@jyostudio/lyric';

// Option A: create directly from a URL (browser)
const lyric = await Lyric.createFromUri('/path/to/foo.lrc');

// Option B: create from an ArrayBuffer
// Node: read Buffer via fs and convert to ArrayBuffer
// import { readFile } from 'node:fs/promises';
// const buf = await readFile('foo.krc');
// const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
// const lyric = new Lyric(ab);

// Advance time (milliseconds) and get the current line/word indices
const { lineIndex, wordIndex } = lyric.setCurrentTime(120_000); // 120s

// Or use the controller helper (milliseconds)
LyricController.updateByTime(lyric, 120_000);

// For rendering: iterate lines and words
for (const line of lyric.lines) {
  // line.startTime, line.duration, line.state: 'past'|'current'|'future'
  // line.progress, line.renderProgress
  for (const word of line.words) {
    // word.text, word.duration, word.state, word.progress
  }
}
```

Generate other formats (returns an `ArrayBuffer`):

```ts
// Supported: 'lrc' | 'trc' | 'qrc' | 'krc' | 'ksc'
const ab = Lyric.generate(lyric, 'lrc');

// Browser: download as a file
const blob = new Blob([ab], { type: 'text/plain;charset=utf-8' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'output.lrc';
a.click();

// Node: write to disk
// import { writeFile } from 'node:fs/promises';
// await writeFile('output.lrc', Buffer.from(new Uint8Array(ab)));
```

Helper: check if a line supports per-word (word-level timeline)

```ts
import Lyric from '@jyostudio/lyric';

const supports = Lyric.supportsPerWord(lyric.lines[0]); // boolean
```

### 2) Web Component (`jyo-lyric.js`)

An out-of-the-box custom element `<jyo-lyric>` that renders `Lyric` to the page with built-in smooth scrolling, per-word gradient highlight, drag-to-review, and more.

- With a bundler after installation:

```ts
// Register the custom element (side-effect import only)
import '@jyostudio/lyric/dist/jyo-lyric.js';
```

- Or via CDN：

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@jyostudio/lyric/dist/jyo-lyric.js"></script>
```

- Minimal example：

```html
<jyo-lyric id="view" src="/music/foo.lrc" align="center" font-size="24" line-gap="20"
  style="display:block;height:420px;--colorBefore:#42d392;--colorAfter:#ffb347;--colorHighlight:#fff;--colorTranslation:#8a8f95;"></jyo-lyric>
<script type="module">
  const audio = document.querySelector('audio');
  const view = document.getElementById('view');
  // Drive with rAF for smooth per-word highlight; note: component setCurrentTime expects seconds
  let raf = 0;
  const tick = () => { view.setCurrentTime(audio.currentTime || 0); raf = requestAnimationFrame(tick); };
  audio.addEventListener('play', () => { cancelAnimationFrame(raf); tick(); });
  audio.addEventListener('pause', () => cancelAnimationFrame(raf));
  audio.addEventListener('seeking', () => view.setCurrentTime(audio.currentTime || 0));
</script>
```

#### Attributes
- `src`: Lyric file URL (.lrc/.trc/.krc/.ksc/.qrc)
- `align`: Text alignment, `left|center|right`, default `center`
- `font-size`: Line font size (px), default `24`
- `line-gap`: Line spacing (px), default `20`
- `scroll-ms`: Auto-scroll animation duration (ms), default `280`
- `gradient`: Whether to show gradient highlight, `true|false`, default `true`
- `show-lang1`: Show primary text, default `true`
- `show-lang2`: Show secondary text (translation/second row), default `true`
- `show-refline`: Reference line visibility: `true|false`, default is “auto show during interaction”

#### Public methods (DOM instance methods)
- `setColors({ before?, after?, highlight?, translation? })`: Set theme colors (mapped to CSS variables below)
- `loadFromUrl(url: string)`: Load lyrics from URL
- `loadFromText(text: string)`: Load lyrics from plain text
- `loadFromBuffer(buf: Uint8Array)`: Load lyrics from binary data
- `clear()`: Clear data
- `setCurrentTime(seconds: number)`: Set current playback time (in seconds)
- `scrollToCurrent(immediate?: boolean)`: Scroll to the current line (optionally without animation)

> Note: the component’s `setCurrentTime` parameter is in seconds; the core class `Lyric.setCurrentTime` uses milliseconds.

#### Events (CustomEvent)
- `linechange`: `{ index, previousIndex }`
- `wordchange`: `{ lineIndex, index }`
- `seeked`: `{ time }` (fired in sync with `setCurrentTime`)

#### Styling
- CSS variables:
  - `--colorBefore`: color for not-yet-played, default `#42d392`
  - `--colorAfter`: color for already-played, default `#ffb347`
  - `--colorHighlight`: current highlight color, default `#fff`
  - `--colorTranslation`: translation text color, default `#8a8f95`
  - `--bg`: container background color
  - `--reflineColor`: reference line color (when `show-refline`)
- Shadow Parts: `wrapper`, `inner`, `row`, `primary`, `secondary`, `refline`, `refslots`, `ref-left`, `ref-center`, `ref-right`
- Slots: `before`, `after`, `ref-left`, `ref-center`, `ref-right` (aligned to the reference line, suitable for buttons/labels, etc.)

Example：

```css
jyo-lyric::part(row) { letter-spacing: 0.3px; }
jyo-lyric { --bg: #0d0d0d; --reflineColor: rgba(255,255,255,.16); }
```

---

## Use in the browser directly (no bundler)

Web Component only：

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@jyostudio/lyric/dist/jyo-lyric.js"></script>
<jyo-lyric src="./music/1.lrc" style="display:block;height:420px;"></jyo-lyric>
```

Core parser only：

```html
<script type="module">
  import Lyric from 'https://cdn.jsdelivr.net/npm/@jyostudio/lyric/dist/lyric.js';
  const lyric = await Lyric.createFromUri('./music/1.lrc');
  lyric.setCurrentTime(12_345); // ms
  console.log(lyric.lines[lyric.setCurrentTime(12_345).lineIndex]);
</script>
```

---

## TypeScript support

The source is written in TypeScript, providing complete type annotations and solid inference. In a pure TS project, import it as shown above.

> Note: future versions will include official `.d
