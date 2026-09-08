# Optional writing data packs

These data are **separate from the MIT Scribing engine and its core npm bundle**. Load only a chosen JSON file from `generated/`; the engine does not import this directory. Every emitted pack is a technical preview with provenance and source/license metadata. No native classroom review or handwriting-study validation is claimed.

## Available data

| Pack / collection | Units | Coverage |
| --- | ---: | --- |
| `english-letterpaths-print` | 52 | Both cases; source-explicit i/j dots |
| `english-glyphed` | 249 | 83 characters × 3 variants: 52 letters, 10 digits, 21 punctuation |
| `japanese-kana` | 184 | 92 basic modern kana plus all 92 additional base kana-block files |
| `japanese-grade-1` | 80 | First-grade kanji |
| `japanese-kanji-*` | 6,367 | Remaining CJK KanjiVG entries in Unicode-page subsets |
| `kanjivg-latin` | 68 | 52 Latin letters, 10 digits, 6 punctuation from KanjiVG |
| `japanese-symbols` | 5 | 、。々〆！ from KanjiVG |
| `korean-omniglot` | 40 | Standalone compatibility jamo, visually mapped from recordings |
| Other `omniglot-*` | 1,583 | Unmapped source classes across the other 49 collections |
| **Total** | **8,628** | 147 independently loadable pack files |

`generated/catalog.json` lists exact files, counts, manifests and SHA256s. The Omniglot collections together contain 1,623 selected examples. Their optional `.observations.json.gz` files preserve **32,460** complete original recordings: pen-separated XYT arrays, time in milliseconds and Y increasing upward. No timestamps are fabricated for SVG/Bezier data.

Glyph IDs are plain Unicode where mapped. `english-glyphed` defaults to variant 0 (`A`) and retains `A@1` / `A@2`, with an explicit `A@0` alias. Unmapped Omniglot IDs retain `omniglot-<alphabet>:characterNN`, with `text` showing the source class. Korean aliases retain `characterNN`; mapping evidence and chosen recording paths are in its manifest. These source IDs are usable previews, not Unicode or language-completeness claims.

## Build and verify offline

Use Node 22 or newer and the pinned root development dependencies:

```sh
node --test scripts/data/test/*.test.mjs
node scripts/data/build.mjs
node scripts/data/check.mjs
node scripts/data/reproduce.mjs
```

`build.mjs` accepts `--source-dir DIR`, `--out DIR`, and `--no-raw`. It performs no network access and never executes upstream source files. `check.mjs` verifies source/notice hashes, output coverage, raw counts, and **every emitted unit against the real runtime validator and compiler**. `reproduce.mjs` rebuilds into a temporary directory, compares every generated file byte for byte, and removes the temporary directory afterward. Runtime TypeScript is transpiled only by the local check tool; it is not a data dependency. Raw observations are compressed with pinned pure-JavaScript `fflate@0.8.2` at level 9 with `mtime: 0`, so emitted gzip bytes do not depend on the host Node/zlib version. Locked source snapshots are retained unchanged; native zlib is used only for decompression.

## Input, output and observation boundaries

- `sources/*.json.gz` are minimal pinned source snapshots: original UTF-8 SVG, JSON, literal TypeScript glyph declarations, or raw Omniglot text. They do not include upstream applications, dependencies, binaries or generated font resources. `sources/lock.json` fixes each compressed snapshot hash, license hash, source revision or original ZIP hash, and input count. Individual original-file hashes are retained in generated asset manifests.
- `generated/*.json` are source-adapted WritingDataPack objects. They contain only bounded motor polylines or explicit dots plus complete source-order plans. Coordinates use the frozen `[minX,minY,width,height]` bounds convention.
- `generated/*.manifest.json` retains individual provenance, source hashes, dot overrides, selection/mapping rules and transformation version.
- `generated/*.observations.json.gz` are optional raw replay/curation files. They preserve repeated points, timing and pen-up boundaries; runtime polylines are separately deduplicated and flattened. The raw layer is not silently loaded with a pack.
- `generated/*.NOTICE.txt` retains full applicable license text. Removing a notice or modifying a locked source causes verification to fail.

Snapshot creation was a deterministic mechanical extraction from the pinned public source archives/checkouts: retain the selected source files as `{source,files}`, sort `files` lexically, encode compact UTF-8 JSON and gzip with zero timestamp. For exact re-imports, use the committed locked snapshots. Updating a source requires explicit review of its new revision, retained files, full notice and lock hashes; generation never refreshes a moving branch automatically. Upstream pins: letterpaths `fb5a1d0ebe88e462fcc89c50921d7732a44eeeab`; glyphed.js `82dc60759dda2341e3ae9026212ea43222519692`; KanjiVG `55b5ba92a7cad78a62ef04db4be6f9562d949b7f`; both Omniglot ZIPs are pinned by full archive SHA256 in the locks.

## Transformations and limits

SVG commands are parsed with `svgpath`, normalized, and adaptively flattened with endpoint retention and a hard 4,096-point limit per motor stroke. Pen lifts, closing paths and backtracking are retained. The importer rejects transforms that have not been baked into path coordinates, malformed commands, invalid numbers, external entities and oversized XML structures; it never fetches DTDs. JSON is parsed structurally. The glyphed TypeScript input uses a full-file literal grammar whitelist, never `eval`, dynamic import or upstream execution.

letterpaths uses explicit mark semantics and source baseline position and baseline-minus-xHeight-guide height. glyphed dot overrides are enumerated only for i, j, period, exclamation, question and colon; short lines elsewhere remain curves. glyphed's baseline/x-height are documented source-path inferences, not upstream teaching metrics. KanjiVG uses the source 109-unit frame and ordered motor IDs.

Omniglot transformation v2 selects a representative observed model using a deterministic shape medoid. Candidates first rank by distance from the modal stroke count, then stationary-fragment count. Within that priority, every motor stroke is sampled at 32 equal arc-length positions in a single centered whole-glyph frame, uniformly scaled by the glyph’s maximum dimension. The medoid minimizes mean corresponding-point Euclidean distance to other recordings with the same motor count; the original source path breaks ties. It preserves relative motor placement, direction and pen lifts rather than normalizing each motor independently. This reduces observed-shape outliers; it cannot certify conventional pen order. Korean mapping is visually derived from three examples per class, independently inspected by two agents. It maps 21 vowels and 19 consonants to standalone compatibility jamo, not contextual syllable allographs. The full 11,172 Hangul syllable set is not claimed.

`node scripts/data/adapt.mjs --format FORMAT --input FILE --output FILE` exposes the generic SVG, JSON (`{strokes: point[][]}`), Omniglot text, Tomoe XML, InkML and UNIPEN adapters as **raw-observation conversion**. It intentionally does not invent em, baseline, Unicode mappings or curriculum status. InkML supports explicit numeric X/Y-leading channels, not compressed/differential trace encodings. UNIPEN supports explicit `.COORD X Y...`, `.PEN_DOWN` / `.PEN_UP`; it does not infer word segmentation from recognition labels. XML nesting, node count, file size and raw point counts are bounded. Unsupported source encodings fail explicitly.

## License boundaries

- letterpaths: MIT; lowercase source names say traced, uppercase template. Pack provenance is mixed.
- glyphed.js: ISC, retained in full. Explicit importer dot adaptations are recorded separately.
- KanjiVG: CC-BY-SA-3.0. The adapted centerline data retain this license and attribution; they are not relicensed as MIT by sharing a repository with the engine.
- Omniglot recordings: MIT, full copyright/license retained. Cite the original Lake, Salakhutdinov and Tenenbaum research when using the dataset for research.

Qt GPL/commercial samples, font-inferred Nanum data, and noncommercial research corpora are not mixed into these packs. Their different terms and geometry quality remain separate acquisition options.
