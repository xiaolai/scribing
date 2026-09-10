# Multilingual units and offline packs

Scribing supports optional v2 writing units alongside the existing Chinese API. A unit may represent a letter, syllable, character, or an explicitly named source observation. The engine animates and checks the supplied model; this does not establish that its formation is a reviewed teaching standard.

Stroke order and script support are separate claims. The font catalogue covers 120 script entries for rendering. Ordered motor data exists for four groups: chinese 9,574, japanese 6,636, english 52 and korean 40. The Korean units are isolated jamo. A three-syllable pilot in the preparer covers 가, 한 and 글 by cutting the ink into jamo regions; every other syllable falls back to a generated drawing sequence; that is a known gap, recorded with its cause in [the survey](../dev-docs/research/20260911-normative-stroke-order.md). Devanagari is deferred: Wikimedia Commons holds 85 stroke-order files for it, of which only 13 are vector, so importing it resembles authoring rather than importing.

## Try the demo

Build the library with `yarn build`, serve the repository over HTTP, then open `/demo/multilingual/`. The page reads `packs/generated/catalog.json` and fetches only the chosen local pack. Once those repository assets are available locally, it needs no external runtime data service. `/demo/` remains the Chinese demo and uses its existing remote character loader.

The default **Textbook & vector models** view opens clean English print, with Korean standalone jamo and KanjiVG ordered vector models also available. **Source samples** retains all imported letterpaths/glyphed geometry and Omniglot observations, including rough examples. Switching views cancels the previous session and pending source load. Choose a collection, writing unit and SVG or Canvas renderer. Animate follows the selected supplied stroke-order plan; guided practice shows the model and next-stroke guidance; independent practice checks completed strokes. The plan selector applies to animation and new practice sessions. Practice can optionally accept other supplied plans as well. Different glyph/pen-lift variants are separate unit IDs, such as glyphed `A`, `A@1`, and `A@2`. The text lookup uses the selected pack’s IDs and aliases; it does not search every pack or invent missing characters.

## Load a pack

```js
const pack = await fetch('/packs/generated/english-textbook.json').then((response) => {
  if (!response.ok) throw new Error('Writing pack unavailable');
  return response.json();
});
const provider = Scribing.createDataProvider(pack);
const writer = new Scribing('writing-target', {
  width: 360,
  height: 360,
  padding: 24,
  renderer: 'svg',
});
await writer.setUnit({ id: 'i', provider });
await writer.animateCharacter();
await writer.quizUnit({
  guided: true,
  leniency: 1.5, // optional; core default is 1, valid range 0.25–3
  onMistake: (event) => console.log(event.reason),
  onComplete: (result) => console.log(result.totalMistakes),
});
```

Use `writer.getUnitData()` to read the current unit. `showCharacter()`, `hideCharacter()`, `animateCharacter({ planId })`, `updateDimensions()`, `cancelQuiz()` and `destroy()` also apply in unit mode. Unit animation defaults to the unit’s `defaultPlanId`; `animateCharacter({ planId })` and `loopCharacterAnimation({ planId })` select another supplied plan. Use positive drawing dimensions with room for padding. Use `quizUnit()` for units and the existing `quiz()` for Chinese character data. Switching data cancels the prior session. Destroy the writer when removing its target.

A provider implements `load({ id, variant? }, { signal })` and returns a `WritingUnit` promise. Respect the abort signal in custom network providers. The built-in pack provider is local and performs explicit ID/alias lookup. Unsupported IDs produce an error; there is no implicit Chinese fallback or compatibility normalization.

## Matching tolerance

`quizUnit({ leniency })` accepts finite values from **0.25 to 3**; the core default remains **1**. The demo offers Precise (1), Forgiving (1.5), and Relaxed (2), and starts recorded packs at 1.5 while other packs start at 1. Changing the selector stops active or queued practice; start a new session to apply it. Higher tolerance allows more geometric variation but does not make this a general handwriting recognizer or remove the selected model's stroke-order requirements.

A narrow comparison used 17 other Korean ㅏ recordings with the same two-stroke segmentation. Version 2 selects an existing example with the smallest average shape distance to its peers. At tolerance 1, complete matches rose from 0/17 with the earlier exemplar to 7/17; at 1.5, from 7/17 to 11/17. The original example's short upward tail and normal shape variation contributed to rejections; direction flexibility did not change the results. These recordings also participated in exemplar selection, so this is a comparison within the source collection, not independent validation or an accuracy estimate. It does not establish that all 17 samples are correctly written. A source model can reject valid alternatives, and forgiving settings can accept more incorrect shapes.

## Supply a unit directly

```js
await writer.setUnit({
  schemaVersion: 2,
  id: 'dot-example',
  text: '.',
  style: 'Example dot',
  coordinates: { em: 100, yAxis: 'down', bounds: [0, 0, 100, 100] },
  motorStrokes: [{ id: 'dot', kind: 'dot', center: [50, 70], radius: 4 }],
  plans: [{ id: 'default', steps: [{ strokeId: 'dot' }] }],
  defaultPlanId: 'default',
});
```

`bounds` means `[minimumX, minimumY, width, height]`. Curves use ordered `[x, y]` points and an explicit width. Dots use a center and radius, with no duplicate-point workaround. The compiler converts source geometry to canonical coordinates. Keep baseline, x-height and advance metrics when available; independently stretching every glyph to a square loses writing proportions.

A plan references every motor stroke once and may specify `forward` or `either` direction. Alternative orders operate on the same stroke set; a different number of pen lifts requires another unit. Optional visual segments reveal pieces within one motor stroke and do not add quiz steps. Source paths are converted to polylines offline; arbitrary SVG code is not executed by the unit renderer.

## Included source collections

Exact emitted IDs, counts and hashes live in `packs/generated/catalog.json`; per-pack manifests and notices accompany each JSON file.

| Collection                      | Supplied coverage                                                                                          | Interpretation and terms                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scribing English textbook print | 52 uppercase/lowercase English letters                                                                     | Original clean print geometry with defined stroke plans; MIT. A uses three strokes, with both legs drawn top-down. Not a certified curriculum.                                       |
| Scribing Korean textbook print  | 40 standalone jamo                                                                                         | Original clean print geometry with defined stroke plans; MIT. No syllable composition or certified curriculum claim.                                                                 |
| letterpaths print               | 52 uppercase/lowercase English letters                                                                     | Supplied print geometry with explicit marks; MIT, Robin Linacre.                                                                                                                     |
| glyphed.js                      | 83 characters, each with 3 variants: 52 letters, 10 digits, 21 punctuation symbols                         | Authored monoline geometry; ISC, Anas. Variant count is not character count.                                                                                                         |
| KanjiVG                         | 6,447 CJK characters (including the 80-item grade-one subset), 184 kana, 68 ASCII characters and 5 symbols | Ordered centerlines; CC BY-SA 3.0. Latin and symbol extras are separate packs, not counted as Japanese kanji. Source coverage is not a claim of complete modern curriculum coverage. |
| Korean Omniglot                 | 40 mapped standalone letter classes                                                                        | Recorded copied-symbol observations with visually derived mappings. This does not supply all modern syllables or a validated contextual composer.                                    |
| Other Omniglot collections      | Source-class previews across the remaining alphabet collections                                            | Recorded observations, repository MIT notice. Unmapped classes retain source IDs; a collection name is not verified Unicode or language coverage.                                    |

Omniglot participants copied displayed symbols, which could be unfamiliar to them. Preserve that distinction when showing or grading recorded order. The raw observation files retain source paths, hashes, pen breaks and timestamps where supplied; a selected model is not all 20 observations of that class. Imported font geometry, authored templates and observations must not be relabelled as recorded native teaching demonstrations.

All current packs are technical previews. School handwriting styles, loop starts, dots, retracing and acceptable pen lifts vary. For example, a supplied two-stroke A or two-loop 8 is one model, not a universal rule. Review a chosen repertoire and style before making instructional claims. Native curriculum certification and connected-word teaching remain separate content work.

## Data distribution

The engine is MIT. Each optional data pack retains its source license and attribution, revision, transformation record and any corrections. Keep the corresponding NOTICE and full source license files when redistributing packs; separate packaging does not remove upstream obligations. KanjiVG’s share-alike data terms differ from the English source notices. The core runtime does not fetch or embed these datasets automatically.

Use the importer’s pinned inputs and manifests to reproduce packs. Check emitted inventories and quarantines before advertising support. Do not infer commercial reuse permission for unrelated research-only corpora from the engine license or the availability of a download.
