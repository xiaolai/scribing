# Font animation and unordered practice

Scribing can display the actual filled outlines of a selected TTF/OTF typeface. `Scribing.createFontWriter` animates, traces or copies those outlines. The optional animation preparer fits compatible supplied motor plans to the selected font and generates drawing guides for other forms. A font itself supplies no motor stroke order, and neither does most of the world: normative stroke order is published for Chinese, Japanese, Korean and, partially, Devanagari, and for no other script. Each catalogue script entry carries `strokeOrder`, either `normative` with its source group and unit count, or `none` with the reason. `scripts/fonts/check-assets.mjs` asserts that field against the motor index the runtime actually consults, so the catalogue cannot advertise a group the loader would never select. Practice reports **reference area covered** and **ink inside reference**, with no pass/fail threshold, correctness claim or next-stroke guidance. The main action says **Animate strokes** only for a fully source-adapted plan. Generated and mixed plans say **Reveal shape**, count paths, and make no conventional stroke-order claim. Replay my ink animates only the user's recorded input.

The local demo at `demo/multilingual/` opens the formal-font view. Its separate Ordered models and source samples view retains the previous writing-unit workflow. Switch among 120 script/language entries and 139 bundled Noto fonts; two faces are offered where available. A script with one bundled family says so. Text input accepts up to 32 Unicode scalars beyond the compact sample menu, subject to script and actual glyph coverage. Local standalone TTF/OTF files up to 32 MiB are read on the device.

## Optional shaping provider

The core bundle has no HarfBuzz import, WebAssembly initialization, network font dependency or CSS font fallback. The optional ESM adapter and unchanged 1.6.1 HarfBuzzJS runtime are shipped under `extras/fonts`. Importing that adapter initializes its adjacent local WASM; CJS consumers can use dynamic `import()`.

```js
import Scribing from 'scribing';
import { createFontProvider } from 'scribing/extras/fonts/provider.mjs';
const provider = createFontProvider({
  catalog,
  scriptRanges,
  baseUrl: new URL('./', location.href),
});
const shape = await provider.shape(
  {
    text: 'ag',
    scriptId: 'english',
    fontId: 'NotoSerif',
  },
  { signal: new AbortController().signal },
);
const writer = Scribing.createFontWriter('target', {
  width: 400,
  height: 350,
  renderer: 'svg',
  padding: 24,
  onChange: (comparison) => console.log(comparison),
});
await writer.setShape(shape);
writer.startTrace(); // or startCopy(), which starts fresh and hides the reference
writer.showReference();
const comparison = writer.check(); // informational ratios in [0,1]
await writer.replay(); // captured ink only
writer.clear();
writer.updateDimensions({ width: 500, height: 350 });
writer.destroy();
provider.destroy();
```

Load the catalog and Unicode script ranges from your own deployment and set `baseUrl` to its root, because catalog paths are repository-relative. The 176.6 MB font asset collection is intentionally excluded from the npm core package. Deploy the selected fonts and their notices from this repository, or provide your own catalog/assets. Full font files are fetched only when selected; the provider retains at most four loaded fonts. The adapter validates font file length, SHA-256, SFNT table bounds, cmap glyph identity, and final shaped glyphs/paths. No normal build or check downloads or repairs missing fonts.

`shapeCustom({text,bytes,name,scriptId},{signal})` accepts an ArrayBuffer or Uint8Array and snapshots its bytes before hashing. It uses the same shape rules; custom names are display metadata, not a claim about the font's original family. `destroy()` aborts in-flight requests and clears cached references. Native HarfBuzz objects are managed by HarfBuzzJS's FinalizationRegistry; their underlying memory reclamation follows garbage collection.

The provider shapes one selected script run, including combining marks, language-specific features and contextual joining. Mongolian and Phags-pa shape left-to-right and rotate the full glyph run clockwise into top-to-bottom positions; this is a single glyph run, not a complete vertical paragraph/page engine. Mixed scripts, bidi controls, RTL numerals, unverified variation selectors, unsupported default-ignorable characters and absent glyphs fail explicitly. ZWJ/ZWNJ are permitted only for a defined set of relevant scripts. Full paragraph bidi, font fallback, emoji composition and school-specific handwriting instruction are outside this API.

## Core shape contract

`FontShape` is version 1, with `text`, `font:{id,name,sha256}`, `script`, `language`, `direction:'ltr'|'rtl'|'ttb'`, `em`, `bounds:[minX,minY,width,height]`, and `glyphs:[{id,cluster,path,x,y,advanceX,advanceY}]`. Coordinates use the font's native Y-up axis. Each path is a filled glyph outline at cumulative advance plus glyph offset; fill rule is `nonzero`. Clusters preserve shaping identity and do not identify handwritten strokes.

`setShape` validates bounded numeric SVG line/quadratic/cubic grammar (M/L/H/V/Q/T/C/S/Z), true curve bounds and visible nonzero fill and snapshots the complete shape before mounting it, then clears prior ink and cancels replay. SVG and Canvas draw those same outlines; comparison rasterization uses the same Path2D geometry. Pointer strokes remain in font coordinates across resizes; resizing cancels an active gesture and retains committed ink. Practice sessions allow at most 1,024 gestures and 65,536 points. Comparison uses a fixed pen width of 0.035 em independent of renderer/color, includes outside ink in its raster bounds, and samples at 192 pixels/em within a two-million-cell and 8,192-dimension cap. Long runs retain per-character detail; extreme bounds remain resolution-limited informational feedback.

Modern browsers must support WebAssembly, ESM with top-level await, WebCrypto in a secure context (or localhost), Path2D, Pointer Events and FinalizationRegistry. Unsupported Path2D receives an explicit diagnostic. Serve `.mjs`/`.js` as JavaScript and `.wasm` as `application/wasm`; file:// is not a supported demo launch method.

## Optional animation preparer

```js
import {
  prepareFontAnimation,
  createMotorSourceLoader,
} from 'scribing/extras/fonts/animation.mjs';
const controller = new AbortController();
const plan = await prepareFontAnimation(writer.getShape(), {
  signal: controller.signal,
  sourceLoader: createMotorSourceLoader({ baseUrl: new URL('./', location.href) }),
});
await writer.setAnimation(plan);
await writer.animate({ speed: 1, loop: false }); // speed 0.25–4
writer.cancel(); // stops animation/replay or an active gesture; retains committed ink
```

Use `writer.getShape()` after `setShape`: it returns the immutable, validated shape with canonical bounds. The preparer and core bind the guide to that exact shape key, including its actual paths and font identity. Changing a shape discards its guide and ink. Trace, copy, clear, cancellation and destruction stop playback; resize preserves font-coordinate ink and cancels playback. `setAnimation` snapshots bounded descriptors and typed arrays and proves coverage before replacing a valid running animation. `animationColor` defaults to dark ink and is independent of the reference color.

The optional preparer uses actual per-cluster nonzero glyph masks, medial graph trails and per-pixel stroke/progress ownership. Each reveal tile is clipped only to its original glyphs. Holes, disconnected marks and thin contours remain part of the final masked frame; completion does not reveal previously uncovered areas. Curve timing follows geometric arc projection onto each path, with bounded internal turn caps and continuous open endpoints; supplied paths and their stroke order stay unchanged. SVG and Canvas render native vector reveal contours with shared internal edges removed, rather than scaling a pixelated binary mask. Adjacent loop phases remain separate, and the reconstructed boundary participates in the full progress range, avoiding an end-frame catch-up fill. Dots grow from their centers. Generated body components precede small detached marks, with deterministic order among peers; this is a drawing sequence, not a claim about conventional handwriting order. Contextual ligatures or unmatched forms remain generated. Logical cluster order also applies to RTL and vertical runs.

Plans report `source-adapted`, `generated`, or `mixed`. Source adaptation requires compatible topology, bounded bidirectional distances, continuous in-ink paths and preservation of every supplied source stroke. Short branch/corner detours follow the same skeleton within a bounded corridor; disconnected or excessive detours reject adaptation. Both bundled Latin A faces retain the supplied three-stroke apex-down plan. At true crossings of source paths, a bounded local ownership correction completes the earlier stroke through the shared ink; later branch cores keep their later turn. It preserves the supplied paths and their order, and leaves generated guides and nearby disconnected or parallel paths unchanged. Allograph mismatches such as the supplied single-storey a versus a double-storey font remain generated. Korean syllable pilots are limited to Unicode-checked 가, 한 and 글, with each actual component independently matched to existing jamo plans; incompatible components remain generated. This is not a general 11,172-syllable handwriting model.

Optional source assets in `fonts/motor/` contain English 52, Korean 40, Japanese 6,636 unique texts from the existing KanjiVG packs, and Chinese 9,574 median sets from pinned Hanzi Writer Data 2.0.1. They total 21,419,753 bytes: Chinese 6,522,643 and Japanese 14,817,675 bytes account for most of this. These files and their notices are opt-in repository assets, excluded from the npm package. The loader fetches only a relevant group and verifies its byte length and SHA-256. Known-group transport, HTTP, JSON, schema, cryptographic and integrity failures throw `MotorSourceError` with `code`, `group`, and `recoverable: true`; they never silently become a generated plan. `null` means an unhandled script or a missing text in a successfully verified inventory. Failed requests clear the affected cached data so a later call can retry. Passing `sourceLoader: null` explicitly requests generated guides without loading source plans. The main repository demo serves all assets locally.

The version-1 animation descriptor contains `shapeKey`, `provenance`, `strokes:[{id,points,kind,provenance,source?}]`, and `tiles:[{glyphIndices,bounds,width,height,owners,progress}]`. Points and bounds use font Y-up coordinates. Tile rows run downward from the top of their bounds. `owners` and `progress` are `Uint16Array`; owner zero is outside conservative coverage, otherwise owner minus one indexes a global stroke, and progress is normalized from 0 through 65,535. Source records preserve `{packId,unitId,planId,strokeId}`. The default resolution is 256 pixels/em (configurable 32–512); the complete active guide has at most 2,097,152 cells, 8,192 guide strokes and one million points. Repeated identical clusters reuse a shape-local preparation template. In the main demo, source failures preserve the font and learner ink, disable the unavailable guide action, and show **Retry**. Retry prepares the same target again without replacing the writer. A later text/font change cancels old preparation and prevents stale success or failure from appearing.

Long CPU loops yield through short-lived MessageChannel tasks (with a timer fallback) and honor AbortSignal; canceled source loads cannot attach stale plans. Attachment validation also yields before replacing the current guide. A measured 32-character CJK guide with 1.87 million cells took about 1.2 seconds to attach on the development machine, while input/cancellation remained responsive (observed event delays below 37 ms). This is measured setup cost, not a universal device guarantee.

`yarn check-font-contours` checks analytic straight/diagonal fronts, ownership isolation, internal seams, endpoint continuity and closed-loop phases in SVG/Canvas at 320/960 pixels and DPR 1/3. It complements the real-font animation, source-recovery and package gates.

## Provenance and checks

See [font assets and notices](../fonts/README.md). All 149 old packs are accounted for: 100 retain exact Unicode text, 39 use independent Unicode inventories with original numbered classes still unmapped, and 10 have no verified Unicode mapping or compatible bundled font. The rare KanjiVG character 𧒑 (U+27491) is absent from both bundled Japanese fonts and is rejected; it is not silently substituted.

- `npm run check-fonts`: offline font/runtime hashes, derived catalog/ranges, motor hashes and exact source/median mappings.
- `npm run test-fonts`: actual shaped inventory/examples and old verified texts; contextual scripts, font switching, custom fonts and rejection boundaries.
- `npm run check-font-sources`: Chromium and WebKit A/F plans, generated/mixed wording, unavailable/malformed sources, retry with preserved ink, and stale retries.
- `npm run check-font-animation`: all 120 entries, source/allograph boundaries, ownership, cancellation and real final masked SVG/Canvas raster checks at 320/960 and DPR 1/2/3.
- `npm run check-font-demo`: real browser rendering, practice, switching, cancellation and local-only requests.
- `npm run check-multilingual-demo`: retained ordered/source workflow.
- `npm run check-package`: actual packed CJS/ESM/browser/type consumers, including the optional provider.

To regenerate derived catalog data, install the maintenance-only pinned `scripts/fonts/requirements.txt` and run `python3 scripts/fonts/build-catalog.py`. To deliberately restore original locked font bytes, use `node scripts/fonts/fetch-assets.mjs --download`. Neither operation changes source revisions automatically.

Regenerate motor inventories offline with `python3 scripts/fonts/build-motors.py` (the installed `hanzi-writer-data` must be exactly 2.0.1). Regenerate the optional geometry copy with `node scripts/fonts/build-geometry.cjs`; normal checks compare it to the TypeScript source.

## Running the local demo

Run `npm run build`, then `npm run serve-demo`, and open the printed `/demo/multilingual/` URL. Keep that server running while using the demo; a cached page alone cannot retrieve uncached font or source files. Set `PORT=8766` to choose another port. The server supplies the required JavaScript/WASM MIME types and disables stale development caching.

Earlier animation checks established valid source-plan and generated rendering behavior with available local assets; they did not prove that source transport failures were distinguishable from verified source absence. The dedicated cross-browser source-workflow gate now protects that boundary explicitly.
