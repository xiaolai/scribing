# Multilingual Scribing implementation audit

Implemented in `/Users/joker/github/xiaolai/myprojects/scribing`, extending baseline `9ff4bec3`. The execution plan was debated with an architect agent, implemented by three Astra medium agents, and reviewed by the root agent through repeated source, integration, data and browser audits.

This is a working multilingual technical preview. It preserves the Chinese API and adds explicit writing units, offline providers, animation by stroke-order plan, guided/independent practice, SVG/Canvas centerlines, genuine dots, and optional source packs. It is not a claim of complete curricula or general handwriting recognition.

## Delivered coverage

| Source            | Actual coverage                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------- |
| letterpaths print | 52 uppercase/lowercase English letters.                                                     |
| glyphed.js        | 83 characters × 3 variants = 249 models; 52 letters, 10 digits, 21 punctuation marks.       |
| KanjiVG           | 6,447 CJK characters, 184 kana, 68 ASCII characters and 5 symbols; separated by repertoire. |
| Korean Omniglot   | 40 mapped standalone jamo classes.                                                          |
| Other Omniglot    | 1,583 source-class models across 49 other collections; Unicode mappings are not invented.   |
| Total             | 8,628 models in 147 optional packs; 32,460 original recordings retained separately.         |

The pack count is not a language count. Some collections are historical or constructed scripts. Existing Chinese data remains available through the legacy loader; none of the new datasets is embedded in the core npm package.

## Architecture and best calls

Reuse the Scribing facade, RenderState, pointer targets and renderer lifecycle. Isolate multilingual grading from legacy Chinese grading. Public APIs are `setUnit`, `getUnitData`, `quizUnit`, `Scribing.createDataProvider`, and plan-aware `animateCharacter` / `loopCharacterAnimation`.

The v2 model distinguishes motor strokes, visual segments and true dots. Plans describe complete allowed orders/directions over a fixed motor set; different pen-lift segmentation remains a different model. Source coordinates compile to em=1024, Y upward, while display fitting respects declared origin-plus-size bounds. Sources retain provenance, exact hashes and their own license notices.

Use existing stroke data before authoring new models. The importer accepts bounded SVG, JSON, Omniglot text, Tomoe XML, explicit-coordinate InkML and UNIPEN formats. It never executes downloaded glyph source code. Unsupported encodings and malformed geometry fail explicitly.

## Root audit findings resolved

1. Bounds meant different things in the compiler and renderer. Standardized `[minX,minY,width,height]` and added nonzero-origin/y-axis regressions.
2. Superseded providers could ignore abort or reenter selection. Requests now settle, cancel I/O, and cannot mount stale content; legacy/unit switching and synchronous loader reentry are tested.
3. Queued quizzes could restart after cancellation. A separate quiz generation invalidates queued sessions.
4. Caller mutations could change pending selections, and serialization hooks could substitute data before validation. Requests/direct units are snapshotted; descriptors are checked before cloning packs.
5. Cancellation left guidance visible; resize retained stale-coordinate gestures; thrown callbacks stranded progression. Cleanup restores display options, resizing discards active gestures, and accepted progression commits before callbacks.
6. Reference geometry and input histories needed explicit bounds. Source arrays are limited to 4,096 points, compiled geometry/input to 512, units to 64 motor strokes and 8 plans. Simplification preserves endpoints/corners/reversals and rejects excess complexity at a fixed error tolerance.
7. Animation ignored declared plans. It now uses the default or explicitly selected plan while preserving render indices.
8. KanjiVG ASCII/symbol extras were mislabeled as kanji. Repertoires and script metadata now distinguish them.
9. Median-aspect selection picked a less representative Korean sample. Selection now chooses an existing shape medoid among eligible observations; it does not average or rewrite their pen paths.
10. Browser TypeScript consumers inherited Node-only types from test imports. Production type checking/building excludes tests, and timers/global access use portable types. Extracted npm consumer checks pass without Node typings.
11. Narrow feedback changed the writing area's position. The demo reserves feedback space and tests real drawing after layout changes.
12. Generic CLI format dispatch accepted inherited object properties. Unsupported inherited names now fail without creating output.
13. Native zlib versions produced different compressed bytes. Raw archive output now uses pinned deterministic compression; original observation values remain unchanged.

## Grading evidence and limits

A comparison within one Korean source class used 17 other recordings with the same two-stroke segmentation. At tolerance 1, the new exemplar matched 7 complete recordings versus 0 for the old exemplar; at 1.5, 11 versus 7; at 2, both matched 13. Two additional recordings had different pen-lift counts. Direction flexibility did not change these outcomes.

The same collection participated in exemplar selection, so this is a representativeness comparison, not an independent validation set or accuracy estimate. No native reviewer certified the examples. The core default remains 1; the demo exposes tolerance and uses 1.5 for recorded previews. Separate source tests verify real KanjiVG あ/ぬ, original Omniglot trajectories, loop direction, spatial/short-stroke negatives, and visually inspected near-model samples.

## Verification

All gates pass on the final implementation:

| Gate                           | Result                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine tests                   | 324 tests / 29 suites / 15 unchanged snapshots; Node 22.23.1 and the default runtime.                                                                      |
| Importer/CLI/compression tests | 15 tests on Node 22.23.1 and Node 26.8.1.                                                                                                                  |
| Types/lint                     | Full development and browser-only production TypeScript projects; ESLint passes.                                                                           |
| Build/package                  | CJS, ESM, browser globals and extracted TypeScript consumers; notices retained and datasets excluded from core tarball.                                    |
| Data integrity                 | 147 packs, all 8,628 units validate and compile; 53 source locks; 32,460 original recordings. Maximum compiled curve: 456 points; maximum motor count: 30. |
| Reproducibility                | All 492 generated files reproduce byte for byte on Node 22.23.1 and Node 26.8.1.                                                                           |
| Browser                        | 21 checks in Chromium 151.0.7922.34; real mouse replay in SVG/Canvas at 960 and 320 pixels; zero external requests and zero page errors.                   |
| Legacy demo                    | Unicode/loading/retry/reuse, real-bundle SVG sizing and visibility pass.                                                                                   |
| Plan/source review             | Root inspected implementation and rendered English/Korean/kana samples; plan structure and diff checks pass.                                               |

The final browser benchmark used 5 warmups, 40 compile-and-mount samples and 80 direct full-gesture calls on the supplied English `i` model. Observed p95: **0.70 ms** compile/mount and **0.80 ms** gesture calls. This measures synthetic desktop source replay, not physical-device latency or human accuracy. The minified browser bundle is approximately 17.3 KB gzip and contains no writing datasets.

Browser bundle SHA256: `c0da2b6eb2ebed5e3d58e07bb4e0fa1434ad8543901c1c85781ed294e3a6b47b`. Catalog SHA256: `1ba57cb44b0e0f7de3042e04fa8b15d719ff064065655ea99c4913c24d6aac26`. Machine-readable results are retained in `multilingual-evidence/` beside this report.

CI now runs the engine, importer, integrity, reproducibility, package and real-browser gates. CI execution itself has not been observed remotely; the equivalent local gates were run.

## Remaining content and validation work

- Korean currently covers standalone jamo, not a contextually reviewed composer for all 11,172 syllables.
- Unmapped source classes remain class IDs. Further language support needs verified Unicode labels and selected writing styles.
- Connected/cursive words, script-specific contextual forms, alternative pen-lift teaching models and native curriculum review remain content milestones.
- Tests use software pointer replay on desktop Chromium; physical stylus/touch devices and a human handwriting study were not tested.
- A strict source model can reject valid alternatives; higher tolerance can also accept more incorrect forms. No cross-language recognition accuracy is claimed.

No npm publication or remote push was performed. The engine stays MIT; optional data and test fixtures retain their separate source notices.
