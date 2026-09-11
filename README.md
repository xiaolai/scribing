# Scribing

Scribing is an open-source JavaScript library for stroke-order animations and interactive handwriting practice, forked from [Hanzi Writer](https://github.com/chanind/hanzi-writer) by David Chanin.

It supports Simplified and Traditional Chinese through the existing Hanzi Writer dataset, plus optional multilingual writing units and offline source packs for English, Japanese, Korean letters and broader recorded collections. These new packs are technical previews, not certified teaching curricula. See the [multilingual API and data guide](docs/multilingual.md) for exact source boundaries and usage.

## Development

```sh
git clone https://github.com/xiaolai/scribing.git
cd scribing
yarn install --frozen-lockfile
yarn build
```

Node.js 22 or newer. Run `yarn serve-demo` and open the printed URL for `/demo/multilingual/`, or serve the repository with any local HTTP server and open `/demo/` for Chinese. The multilingual demo loads the selected pack from `packs/generated/`; it does not use a remote data service.

The optional font demo additionally needs the Noto binaries, which are not in git:

```sh
yarn fetch-fonts   # ~169 MB, verified against fonts/assets.lock.json
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full check workflow, [docs/architecture.md](docs/architecture.md) for how the three subsystems fit together, and [SECURITY.md](SECURITY.md) for what the library validates and what it trusts.

## Usage

After building, load the local browser bundle:

```html
<div id="writing-target"></div>
<script src="dist/scribing.js"></script>
<script>
  const writer = Scribing.create('writing-target', '永', {
    width: 200,
    height: 200,
    padding: 10,
  });
  writer.animateCharacter();
  // Call writer.quiz() to start interactive writing practice.
</script>
```

The CommonJS and ES module builds are `dist/index.cjs.js` and `dist/index.esm.js`. The default export is `Scribing`. Browser bundles expose `window.Scribing`; options types and renderer interfaces use the `Scribing` name as well. When migrating, replace `HanziWriter` with `Scribing` and update browser bundle paths.

This fork has not yet been published to npm. The package is named `@xiaolai/scribing`; the unscoped name `scribing` on npm belongs to an unrelated project and never referred to this one.

The inherited API is described in the [upstream documentation](https://hanziwriter.org/docs.html). Use `Scribing` in place of `HanziWriter` in its examples. Custom stroke datasets can be supplied through `charDataLoader`.

**Without a `charDataLoader`, `setCharacter()` fetches from a third-party CDN.** The default loader requests `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/<char>.json` on first use. That is a cross-origin request to jsDelivr and a disclosure of which characters are being practised. Supply your own loader, as shown below, to keep every request on your own origin.

## Validation

The fast checks need nothing but the repository and finish in under a minute:

```sh
yarn prettier-check
yarn lint-test
yarn typecheck
yarn test --runInBand   # enforces coverage thresholds
yarn test-data
yarn check-data
yarn build
yarn check-demo
yarn check-package
```

A second tier exercises real browsers and the font binaries, and takes many minutes.
CI runs both with Node.js 22. Publishing is manual; pushing to `master` does not publish a package.

## Lifecycle

Call `writer.destroy()` when removing a writing exercise from your page. It cancels the current load and animations, removes input listeners, and removes DOM nodes created by the writer. SVG or canvas elements supplied by the caller remain in place. Calling `destroy()` again is safe; create a new instance to resume practice.

## Custom writing data

For native centerlines, true dots, source metrics and alternative order plans, use [v2 writing units and `setUnit()`](docs/multilingual.md). The following is the legacy filled-outline data format.

Supply `charDataLoader` to use local data or data for another writing system. It can return a data object, return a promise, or call its success/error callbacks. Supply one SVG outline and one ordered centerline per pen stroke:

```js
const writer = new Scribing('writing-target', {
  width: 200,
  height: 200,
  charDataLoader: async (symbol) => {
    const response = await fetch(`/writing-data/${encodeURIComponent(symbol)}.json`);
    if (!response.ok) throw new Error(`No writing data for ${symbol}`);
    return response.json();
  },
});

try {
  await writer.setCharacter('A');
  await writer.animateCharacter();
} catch (error) {
  console.error('Unable to load the writing exercise:', error);
}
```

This example requires your own `A.json`; a Latin alphabet dataset is not bundled. Data has the form `{ strokes: string[], medians: number[][][], radStrokes?: number[] }`. Each median needs at least two finite `[x, y]` points. The number of medians must match the number of outlines; radical indices, when supplied, refer to existing strokes. Invalid data is rejected before rendering. Validation checks structure, not educational accuracy or complete SVG syntax.

The existing coordinate system is 1024 units wide, with x from 0 to 1024 and y from -124 to 900, increasing upward. Convert source datasets into this coordinate system, preserving stroke order and direction. A font outline alone does not supply the pen paths required for quizzing. Review language-specific forms, acceptable writing variants, data licenses, and quiz behavior before claiming support for a new writing system.

When replacing a character, stale responses cannot update the current exercise. Superseded and canceled loads settle without data instead of leaving callers waiting forever. `destroy()` settles the current pending load without mounting a character. `getCharacterData()` rejects when its requested character is no longer available. Independent calls to `Scribing.loadCharacterData()` do not cancel one another.

## Attribution and licensing

Scribing is derived from Hanzi Writer by David Chanin. The original copyright notice is retained in [LICENSE](LICENSE), and the library remains MIT licensed.

The default Chinese stroke data still comes from [Hanzi Writer Data](https://github.com/chanind/hanzi-writer-data), derived from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) and Arphic fonts. That data retains its separate Arphic Public License; see [COPYING.md](COPYING.md).

### Formal font animation and practice

`Scribing.createFontWriter` displays real filled font outlines for animation, tracing and copying. The optional HarfBuzz provider supports contextual shaping and changing actual font files; the optional guide preparer fits compatible supplied stroke plans and creates clearly labeled drawing sequences for other forms. The main action says Animate strokes for supplied plans and Reveal shape for generated or mixed paths; Replay my ink stays separate. Source-loading errors offer Retry without discarding the selected font or learner ink. The offline multilingual demo includes 139 Noto fonts across 120 script/language entries, with local TTF/OTF input and a separate ordered-model view. Those 120 entries describe **rendering**, not instruction: outlines, tracing and shape reveal work for all of them. Normative stroke order exists for four source groups and reaches seven of the entries, which each declare `strokeOrder` in the catalogue so a caller can tell before preparing anything. No authority publishes a normative order for the other 113, so none is claimed. See [the survey](dev-docs/research/20260911-normative-stroke-order.md). Font assets are optional and excluded from the core npm package. See [font API, browser requirements and checks](docs/fonts.md) and [asset provenance](fonts/README.md).
