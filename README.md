# Scribing

Scribing is an open-source JavaScript library for stroke-order animations and interactive handwriting practice, forked from [Hanzi Writer](https://github.com/chanind/hanzi-writer) by David Chanin.

It currently supports Simplified and Traditional Chinese through the existing Hanzi Writer dataset. Support for additional writing systems is planned; this rebrand does not add new language datasets.

## Development

```sh
git clone https://github.com/xiaolai/scribing.git
cd scribing
yarn install --frozen-lockfile
yarn build
```

Serve the repository with a local HTTP server and open `/demo/` to try the demo.

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

This fork has not yet been published to npm. The package name in this repository is `scribing`; do not assume the public npm package belongs to this project.

The inherited API is described in the [upstream documentation](https://hanziwriter.org/docs.html). Use `Scribing` in place of `HanziWriter` in its examples. Custom stroke datasets can be supplied through `charDataLoader`.

## Validation

```sh
yarn typecheck
yarn lint-test
yarn test --runInBand
yarn build
yarn check-demo
yarn check-package
```

CI runs these checks with Node.js 22. Publishing is manual; pushing to `master` does not publish a package.

## Lifecycle

Call `writer.destroy()` when removing a writing exercise from your page. It cancels the current load and animations, removes input listeners, and removes DOM nodes created by the writer. SVG or canvas elements supplied by the caller remain in place. Calling `destroy()` again is safe; create a new instance to resume practice.

## Custom writing data

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
