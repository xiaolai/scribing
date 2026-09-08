---
title: "Multilingual Scribing: a shared engine with reviewed script and teaching-style packs"
created_at: "2026-09-08 11:09 Asia/Shanghai"
mode: "full-plan"
status: "Proposed; revised after broader pen-data research, not implemented"
baseline: "9ff4bec3"
---

## Outcomes

**Research revision, 2026-09-08:** broader source inspection establishes substantial existing English, Korean and other-script pen data. Use import, mapping and curation before original authoring. See [verified source assessment](../research/20260908-multilingual-pen-data.md).

Build on Scribing's existing animation and practice engine to support English, Japanese, and Korean first, then expand through reusable script packs. Keep the current Chinese behavior working. The unit of reuse is a **script plus a teaching style and an explicit repertoire**, not a language-name switch.

The recommended first release provides:

- English print: 26 uppercase letters, 26 lowercase letters, 10 digits, and an explicitly listed small punctuation set, with real dot and pen-lift handling.
- Japanese: 46 basic hiragana, 46 basic katakana, explicitly enumerated voiced/small forms, and an initial 80-kanji curriculum subset using Japanese data.
- Korean: all 40 modern initial/vowel letters as learning units, a reviewed pilot of syllable blocks, then composition of the 11,172 modern syllables after contextual forms pass validation. These are two separate Korean milestones.
- For each released item: animation, guided tracing, independent writing practice, correct direction/order feedback according to its selected style, offline loading, and an explicit unsupported result.
- Optional packs and reproducible authoring/import tools so additional alphabets do not require a new engine fork.

Success means the supported repertoire and practice capabilities are machine-checkable and reviewed. Rendering a font, a self-matching median, or generating every Unicode syllable does not establish teaching quality. “All languages” is not an honest release criterion; the expanding coverage manifest is.

Non-goals for the first release: language courses, pronunciation/dictionaries, UI translation into every language, OCR/free-form text recognition, calligraphy-style imitation, arbitrary cursive paragraphs, or shipping a complete corpus for every script. Those can use the engine but are different products/capabilities.

## Constraints & Dependencies

- Baseline: `/Users/joker/github/xiaolai/myprojects/scribing`, commit `9ff4bec3`; TypeScript 4.1-era library, Rollup 2, Jest 26, Node.js 22 CI, SVG and Canvas renderers. The preceding audit passed 256 tests, 21 suites and 15 snapshots.
- Preserve existing CJS, ESM, browser-global and TypeScript entry points. No framework rewrite or forced ML/service dependency.
- Core remains MIT. Imported data retains its own terms. Use separately versioned optional packs with their own source and license records; separation does not erase derivative obligations.
- Prefer deterministic, local processing. Load only the chosen pack/subset. Runtime network requests are optional; no user handwriting leaves the device by default.
- Script/teaching reviewers are external dependencies for release labels. Engineering prototypes may proceed without them; a pack cannot be labelled reviewed before its evidence exists.
- This document records proposed API names, numerical budgets and effort estimates. WI-001 verifies the risky assumptions before broader implementation. No npm availability or ownership is assumed for illustrative pack names.
- Planning research and disposable probes are under the current task's `work/`; only planning/research documents are added to the repository. Implementation requires a subsequent instruction.

## Current Behavior Inventory

| Entry/area | Current behavior | Gap |
| --- | --- | --- |
| `src/Scribing.ts`, `create`, `setCharacter`, `loadCharacterData` | Load an opaque symbol through callback/value/promise loaders; handle cancellation, render state, quiz lifecycle. | No provider/style selection or typed capability negotiation. The core already accepts a string; it does not itself require one code point. |
| `src/typings/types.ts`, `src/parseCharData.ts` | One filled outline and one ordered median per numeric stroke index; optional radical indices. | A visual fragment is indistinguishable from an actual pen-down stroke; no dots, explicit variants, metrics or provenance. |
| `src/Positioner.ts` | Fixed x=0..1024, y=-124..900, y-up; fit a square to the target. | Alphabet baselines, descenders, variable widths and contextual runs need explicit metrics. |
| `src/renderers/StrokeRendererBase.ts`, SVG/Canvas stroke renderers | Reveal filled outlines using medians and a fixed width of 200. | Thin monoline letters and source animation fragments need different rendering primitives and reveal paths. |
| `src/renderers/canvas/canvasUtils.ts` | Fallback handles a limited M/L/C/Q path subset and omits closing Z. | Imported SVG grammar must be canonicalized and both Canvas paths must agree. |
| `src/Quiz.ts`, `src/strokeMatches.ts` | One gesture against one next stroke; single-point input discarded; absolute tolerances 250/350; later-stroke heuristic. | Dots, short marks, style-specific order/direction and approved alternative pen-lift plans. |
| `src/geometry.ts`, `src/models/Stroke.ts` | Bounded normalization, duplicate-vector handling, Fréchet shape comparison. | Reusable foundation; new profiles still need calibration, reference feature caching and candidate limits. |
| `demo/test.js` | Exactly one Unicode code point; Chinese CDN default. | Grapheme sequences, explicit packs, original text preservation, mixed/unsupported repertoire reporting. |
| Persistence | Core has no database; assets are external JSON. | Version new assets and optional caches without requiring a migration of existing Chinese files. |

A disposable probe against this commit accepted exact schematic A and ㄱ trajectories through the current parser/matcher, and confirmed that a true dot is rejected by the current validator. This proves reuse of geometric machinery only: the probe used placeholder outlines and did not test rendering, real handwriting or educational validity. Evidence: `work/scribing-feasibility/probe.cjs` and `result.json` in the planning task directory.

## Source Assessment and Viable Data Choices

Source observations were made on 2026-09-08. Inventory counts are file/code-point counts, not quality guarantees.

| Source | Verified usefulness | Chosen role / constraint |
| --- | --- | --- |
| [KanjiVG format](https://kanjivg.tagaini.net/svg-format.html), [repository](https://github.com/KanjiVG/kanjivg) | Ordered pen centerlines in a 109×109 frame; CC BY-SA 3.0. Inspected revision `55b5ba92a7cad78a62ef04db4be6f9562d949b7f` has 6,704 base character files, plus variants. | **Preferred Japanese source.** Compile paths into native centerline primitives and grading samples. Do not put an open centerline directly into the legacy filled-outline field. Manifest selected modern kana/kanji explicitly. |
| [AnimCJK](https://github.com/parsimonhi/animCJK), [licensing](https://github.com/parsimonhi/animCJK/blob/master/licenses/COPYING.txt) | Revision `ec5e17cca76c87587790bcbce5ea0b4d4fb753d6`: 7,007 Japanese files, 177 kana, 535 Korean Hanja; no modern Hangul syllable files in its Korean directory. | Optional later filled/calligraphic Japanese pack. Licenses vary by file family. The graphics-prefixed export and kana SVG terms must not be casually conflated. |
| [UJIpenchars2](https://archive.ics.uci.edu/dataset/177/uji%2Bpen%2Bcharacters%2Bversion%2B2) | Observed ordered strokes for 52 ASCII letters, 10 digits, Spanish additions and other symbols; 11,640 samples from 60 writers; UCI lists CC BY 4.0. | Useful English/Spanish reference and evaluation corpus. Observed adult handwriting is not an authoritative model for teaching children. Split evaluation by writer. |
| [letterpaths](https://github.com/RobinL/letterpaths) | MIT path/tracing library; pinned `fb5a1d0ebe88e462fcc89c50921d7732a44eeeab` has 52 explicit print JSONs (26 uppercase + 26 lowercase), plus 52 lowercase cursive entry variants. | Import/compare both print cases with glyphed.js and observed writing in WI-001. Digits/punctuation are absent; source style remains subject to formation review. |
| [Playwrite](https://github.com/TypeTogether/Playwrite) | Educational regional letterform/font project, OFL. | Style/reference candidate. Font contours still need ordered pen trajectories. Imported/derived assets retain applicable notices and terms. |
| [Hangeul stroke diagrams](https://github.com/MagisterAdamus/hangeul-stroke-order) | 35 of 40 letter diagrams, CC BY-SA 4.0; inspected revision `935483f7e93d24aa2ec990bca1b43664307768d2`. | Reference or explicit derivative pack. Separate arrows/numbers from glyphs; these are not grading medians or a syllable allograph library. Use as a reference; first curate existing recorded/candidate Korean geometry and author only demonstrated gaps. |
| [Geʾez handwriting fonts](https://github.com/raeytype/geez-handwriting-fonts) | Educational font variants with directional annotations, OFL. | Promising Ethiopic reference for a later pack; inventory and temporal paths still need work. |
| [Omniglot](https://github.com/brendenlake/omniglot) | Both raw archives downloaded and parsed: 32,460 XY/time recordings across 50 alphabet collections, with explicit pen breaks. Korean 40 classes/800 recordings; class IDs need Unicode mapping. Repository MIT. | **Import now for broad candidate models and replay.** Curate copied-symbol stroke order; do not assume all classes are native instructional forms. |
| [Calliar](https://github.com/ARBML/Calliar) | 2,500 Arabic path annotations; repository MIT. Authors traced existing calligraphy images with imposed dot-order conventions. | Useful supplied geometry; separate image-traced order from spontaneous handwriting and inspect original-image provenance. |
| [Hershey](https://github.com/kamalmostafa/hershey-fonts), [Relief SingleLine](https://github.com/isdat-type/Relief-SingleLine) | Plotter/vector paths; licensing differs between glyph data and software. | Useful importer experiments, not default instructional models. Plotting order is not automatically handwriting order. |
| [LipiTk datasets](https://lipitk.sourceforge.net/hpl-datasets.htm) | Online Indic handwriting data is described. | Research lead only until downloads, labels and dataset redistribution terms are established. Toolkit licensing is not a data license. |

Additional sources verified in the broader pass materially change the initial acquisition plan:

| Source | Inspected evidence | Immediate role |
| --- | --- | --- |
| [glyphed.js](https://github.com/a-elhaag/glyphed.js) |52 letter +10 digit files, three ordered monoline SVG variants each; ISC. | English import/selection before new authoring. |
| [Tegaki/Tomoe](https://github.com/tegaki/tegaki) |6,646 ordered XML records/6,421 Unicode labels; model-source LGPL route with provenance. | Japanese alternative/variation corpus; preserve repeated labels. |
| [UCI Assamese](https://archive.ics.uci.edu/dataset/208/online+handwritten+assamese+characters+dataset) | Downloaded pen-down/up XY archive; publisher8,235 samples/183 classes/45 writers, CC BY4. | First additional Indic raw importer and candidate corpus. |
| [POH-Db](https://github.com/SLTLabAUT/POH-Db) |9,308 InkML files; real Persian multi-stroke samples inspected; AGPL3 repository. | Existing Persian run/segmentation data; retain applicable source terms. |
| [Qt ink fixtures](https://github.com/qt/qtvirtualkeyboard/tree/dev/tests/auto/inputpanel/data/inputpanel) |11 Unicode-mapped XYT/stroke files;62 ASCII alphanumerics,27 Hebrew letters/final forms, and partial other scripts; GPL3-only or Qt commercial. | Mapped prototypes/tests under the appropriate distribution terms. |
| [GCompris templates](https://github.com/KDE/gcompris/blob/master/src/activities/drawletters/drawletters_dataset.js) |26 uppercase point sequences with stroke groups; companion10 digits; GPL3-or-later. | Existing instructional models for comparison or an appropriately licensed pack. |

Research-only or acquisition routes also contain real trajectories: IAM/DeepWriting/UNIPEN, TUAT Japanese, HP Indic, ISI Bangla and Online-KHATT. Keep their access/terms distinct from technical existence. Font-inferred Korean/Tibetan paths are separately useful editable candidates. The linked source assessment records sample-level evidence and limitations.

**Japanese blocker discovered by inspection:** [AnimCJK あ](https://github.com/parsimonhi/animCJK/blob/ec5e17cca76c87587790bcbce5ea0b4d4fb753d6/svgsJaKana/12354.svg) splits the third pen stroke into rendering pieces d3a/d3b. Its JSON export has four entries; ぬ also has four entries despite two logical strokes. Some reveal medians contain artificial coordinates to conceal future overlap. These must not become learner strokes. KanjiVG あ has three ordered paths, so a centerline-first importer avoids that particular trap.

**Korean blocker:** [Unicode composition](https://www.unicode.org/faq/korean.html) gives 19 leading ×21 vowel ×28 trailing choices, including no trailing =11,172 syllables. It supplies neither stroke paths nor correct contextual handwriting shapes. [Unifont's composition documentation](https://www.unifoundry.com/hangul/hangul-generation.html) illustrates positional form variants, but is not a stroke-order curriculum. A [National Institute of Korean Language response](https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=316952&searchCondition=&searchKeyword=) also cautions that the queried ㅊ/ㅎ shape is not fixed by orthography. Select and document a reviewed teaching style.

## Expansion Roadmap

| Wave | Deliverable | Why this order / release boundary |
| --- | --- | --- |
| 0 | Risk spike: A/a/i/j/O, あ/ぬ/が/ぱ, ㄱ/ㅇ/가/고/한. | Prove dots, loops, render/motor separation, Japanese import and Korean layouts before mass conversion. |
| 1 | Shared foundations plus English print, Japanese kana/80 kanji, Korean jamo/reviewed pilot blocks. | All three requested languages get a useful initial vertical slice. Work on the three data packs can run in parallel after the contracts stabilize. |
| 2 | Korean contextual composer; selected Latin-language inventories; expanded Japanese kanji. | Highest reuse. Reach all modern Hangul code points mechanically, then promote only validated coverage. Expand Japanese toward the [2,136 Jōyō inventory](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kokugo_shisaku/joyokanjihyo_sakuin/pdf/3-1.pdf). |
| 3 | Greek and Cyrillic print first; Hebrew, Armenian, Georgian and Ethiopic as reviewed packs become available. | Much unit-level machinery is reusable, but each script needs its own glyph/style review. Russian coverage does not imply all Cyrillic languages. |
| 4 | Latin cursive, connected Arabic; then additional Arabic-script styles/locales. | Requires word/run plans, joins, context-dependent forms, delayed marks and source-span mapping. Urdu Nastaliq is not a trivial Arabic alphabet extension. |
| 5 | One complex-cluster pilot, then individual Indic and Southeast Asian packs. | Start Devanagari; extend by validated capability to Bengali, Gujarati, Gurmukhi, Tamil, Telugu, Kannada, Malayalam, Odia, Sinhala; separately Thai, Lao, Khmer, Myanmar and Tibetan. This is a conditional expansion portfolio, not a promise that one generic pack teaches all these scripts. |

Latin candidates include Spanish, French, German, Portuguese, Italian, Dutch, Swedish, Danish, Norwegian, Finnish, Icelandic, Estonian, Latvian, Lithuanian, Polish, Czech, Slovak, Slovenian, Croatian, Romanian, Hungarian, Turkish, Vietnamese, Indonesian, Malay, Swahili, Filipino, Afrikaans, Catalan, Galician, Basque, Welsh and Irish. This is a candidate list, not current coverage. Audit each exact locale/style inventory; letters such as ß, æ, œ, ø, ł, đ and dotless ı cannot be supplied by generic accent placement. Vietnamese needs stacked-mark review.

Use [CLDR exemplar sets](https://sites.google.com/unicode.org/cldr/translation/core-data/exemplars) to seed coverage tests, then add uppercase, numerals, punctuation and curriculum-specific strings explicitly. CLDR is an inventory aid, not a handwriting specification. Do not treat its main exemplar set alone as full language support.

## Target Rules

1. **Explicit identity and selection.** A request chooses an installed pack, style and text/unit ID. Locale is metadata and selection input, not proof of a unique form. No Chinese fallback for missing Japanese glyphs; no decorative font fallback counted as successful practice.
2. **Compatibility before extension.** Missing `schemaVersion` means the legacy CharacterJson format. The v1 adapter preserves its bounds, mask width, stroke order, radical mapping, timing and grade decisions. New defaults never silently alter Chinese sessions.
3. **Motor and visual data are separate.** One motor stroke is one intended continuous pen-down gesture. It may own several rendering segments; its grading trajectory must describe actual pen motion. A render fragment never adds a quiz step.
4. **Primitive-specific grading.** Curve strokes require movement; dot targets explicitly permit taps/jitter within a target radius. A dot-like flick may still be a curve according to the authored model. No fake duplicate points to bypass validation.
5. **Teach one declared plan.** Choose the recommended plan/style before a session. A finite list of approved alternate plans may remain eligible; eliminate inconsistent plans after each gesture. Never accept a mixture of incompatible partial variants. Different glyph geometry or pen-lift segmentation belongs to a separate variant asset, selected before the session; plans within one asset vary only order/direction over its fixed motor-stroke set. Initial limits: at most eight eligible plans and 64 motor strokes per unit.
6. **Unicode is not a pen plan.** Preserve requested text; use NFC for lookup where the pack declares canonical equivalence, following [UAX15](https://www.unicode.org/reports/tr15/). Segment UI input with [extended grapheme rules](https://www.unicode.org/reports/tr29/), with a pinned fallback if Intl.Segmenter is absent. No blanket NFKC: compatibility jamo, presentation forms and width variants need explicit aliases. An authored unit/run may span several graphemes; reject unsupported spans explicitly.
7. **Metrics have distinct jobs.** Bounds fit the display; em/x-height define grade scale; baseline/advance align letters. A long word's bounding width must not make individual stroke grading more lenient. Convert both pointer input and data through the same invertible transform.
8. **No unbounded work.** Validate size/count/coordinate/path limits before mounting; retain at most 512 normalized samples per candidate curve. Bound the entire candidate set and precompute immutable reference features. Invalidate cached features by pack/profile/version.
9. **Evidence-based coverage.** Report separate `generated`, `reviewed`, `animate`, `trace`, `quiz` and later `connectedRun` capability/status fields. A pack advertises only enumerated units/capabilities that passed their gates; technical composition coverage is distinct from human-reviewed coverage.
10. **Local and safe pack loading.** Providers return data, not executable JSON. Unknown versions/features/IDs fail with actionable errors. Abort superseded provider requests, retain lifecycle guards, and keep the previous audit's callback reentrancy protections. Offline/local import is supported without an account.
11. **Connected writing is an explicit later capability.** Right-to-left direction, contextual shaping and pen order are separate. [HarfBuzz](https://harfbuzz.github.io/why-do-i-need-a-shaping-engine.html) can supply glyph layout, not teaching trajectories. A future run resolver supplies source spans, positions and authored connected motor plans; reversing an array of letters is insufficient. See [W3C Arabic/Persian requirements](https://www.w3.org/TR/alreq/).
12. **Invalid and missing data remain visible.** Empty text, unpaired surrogates, unknown pack/style, malformed paths, unsupported combining sequences, aborted I/O and version conflicts have distinct diagnostics. No partial successful quiz when required marks or units are missing.

## Decision Log

| Decision | Selected approach | Alternatives rejected / rationale |
| --- | --- | --- |
| D1 Engine reuse | Add adapters/providers/plan matching around current rendering and lifecycle. | Separate engine per language duplicates fixes; a full rewrite has no demonstrated need. |
| D2 Japanese data | KanjiVG centerlines first; monoline presentation. | Direct AnimCJK JSON repack miscounts some kana motor strokes. Filled brush style is optional later work. |
| D3 English data | Import and compare glyphed.js, letterpaths and observed UJI samples first; curate a coherent manuscript model and author residual gaps. | Starting by redrawing all 62 items ignores existing ordered geometry. Select one-storey a/g by default, with explicit alternative assets later; do not call the style universally standard. |
| D4 Korean delivery | Import/map/curate existing Korean recordings and candidate geometry; add missing contextual forms before a composer. | Stretching isolated jamo or deriving pen order from Unicode is insufficient. Never hand-author 11,172 unrelated files if reviewed component rules can generate them. |
| D5 Data format | Versioned motor strokes + visual segments, explicit metrics, primitive type and finite plans. | Keeping one legacy array index as both visual piece and teaching step prevents correct overlap/dot/variant support. |
| D6 Coverage strategy | Script/style packs plus locale inventories and capability reports. | A single `language: 'xx'` flag invites incorrect cross-locale fallback and unsupported claims. |
| D7 Distribution | Optional packs with pinned manifests, local/offline support and separate notices. | A monolithic worldwide dataset slows every consumer and obscures provenance. Separate packaging is not a license exemption. |
| D8 Rollout | Additive APIs and explicit opt-in v2/pack selection. | No early breaking change to `create`, `setCharacter`, or legacy callbacks; no automatic switch to new grading. |

## Open Questions

These are choices to record during WI-001, not reasons to stop the plan.

- English style: Xiaolai plus an English handwriting reviewer decides. Default is an explicitly named Scribing print model with one-storey a/g, individually written letters, declared numeral and pen-lift variants; no cursive in the first release.
- Reviewers: project maintainer selects native educators/script specialists. Default is technical-preview status until qualified review exists. Begin coding/import probes without claiming reviewed coverage.
- Data licensing: maintainer selects the default pack distribution model. Default: keep upstream licenses for Japanese imports; preserve terms of reused English/Korean paths and use an explicit contribution grant for newly authored gaps. If chosen source terms are unresolved, hold that source pack and use original reviewed assets rather than relabel it.
- Korean release reach: default first release is 40 letter units plus a named block pilot. Full 11,172 generation follows the accepted allograph/layout matrix; unreviewed outputs remain visibly experimental.
- Connected writing: default first complete-word pilot is Latin cursive, followed by one everyday Arabic teaching hand. Additional styles and complex scripts are gated expansions, not blockers for the requested print/kana/Hangul release.

## Data Model

No database is required. Store source manifests and authored assets as versioned JSON, with reproducible generated output. Suggested layout:

```text
src/data/{schema,legacyAdapter,validateUnit,compileUnit,providerRegistry}.ts
src/grading/{legacyProfile,curveMatcher,dotMatcher,planSession}.ts
src/text/{normalizeRequest,segmentText,coverage}.ts
scripts/data/{import-kanjivg,compile-pack,check-pack}.cjs
packs/{latin-print,ja-kanjivg,ko-hangul}/{manifest.json,source-lock.json,src/,LICENSES/}
fixtures/{legacy,multilingual,recorded-traces}/
examples/multilingual/
```

Keep authored source, generated delivery files and recorded evaluation traces distinct. Add an intermediate RawStrokeSample contract with source label, optional Unicode mapping, ordered point arrays/timestamps, available writer/session identity, source hash, license and provenance kind (recorded, authored, image-traced, font-inferred). Missing writer identity remains missing. A sample can be replayed or curated without being promoted to WritingUnitV2 or a teaching claim. Per-pack manifest records: ID/version/schema version, script tags/locales/styles, normalized inventory, optional aliases, capabilities, review status, upstream revision/file hashes, attribution/license expressions, compiler version, output digest and per-asset exceptions. Do not bundle evaluation traces in consumer packages by default.

Proposed v2 shape (contract sketch; WI-002 makes it precise):

```ts
type WritingUnitV2 = {
  schemaVersion: 2;
  id: string; text: string; script: string; style: string; variant: string;
  coordinates: {
    em: number; yAxis: 'up' | 'down';
    bounds: [number, number, number, number]; // minX, minY, width, height
    baseline?: number; xHeight?: number; advance?: number;
  };
  motorStrokes: Array<
    { id: string; kind: 'curve'; trajectory: [number, number][] } |
    { id: string; kind: 'dot'; center: [number, number]; radius: number }
  >;
  visualSegments: Array<{
    id: string; motorStrokeId: string;
    shape: { kind: 'centerline'; path: string; width: number } |
           { kind: 'outline'; path: string } |
           { kind: 'dot'; center: [number, number]; radius: number };
    // Optional rendering-only reveal geometry for split filled outlines.
    reveal?: { path: string; width: number; start: number; end: number };
  }>;
  plans: Array<{
    id: string;
    steps: Array<{ strokeId: string; direction: 'forward' | 'either' }>;
  }>;
  defaultPlanId: string; gradingProfileId: string;
};
```

`reveal.start/end` are normalized intervals on the owning motor stroke's animation; they do not participate in grading. Structural validation requires unique IDs, positive finite metrics, legal path grammar, finite bounded points, valid references and complete plans. A plan must consume every required motor stroke exactly once; optional marks belong to an explicitly different unit/profile. Different pen-lift segmentation requires a separate complete WritingUnitV2 variant asset selected before the session. Plans inside one asset share the same motor strokes and vary only order/direction; automatic recognition across different segmentations is deferred. Do not implement alternatives as arbitrary skipped steps. Future unordered mark groups or run plans need a new declared capability rather than changing step meaning invisibly.

Canonical compiled geometry uses em=1024, y-up; preserve v1 bounds exactly. Keep a mapping from semantic IDs to renderer indices rather than rewriting every render-state key immediately. Native centerline rendering is preferred for new monoline packs; it avoids generating fragile filled outlines solely to satisfy v1. Imported outlines still compile into a tested path subset shared by SVG, Path2D and fallback Canvas.

## API / Contract Changes

Retain all current entry points and v1 loader signatures. Proposed additive methods:

```ts
const writer = new Scribing(element, { width: 320, height: 320 });
await writer.setUnit({
  text: 'a', provider: latinPrintPack, style: 'scribing-print-v1', variant: 'one-storey',
});
await writer.quizUnit({ planId: 'recommended', acceptApprovedPlans: true });
const unit = await writer.getUnitData();
writer.destroy();
```

`setUnit` is asynchronous and explicit; it does not guess a provider from text. `WritingDataProvider.load(request, { signal })` returns a promise of v2 data or a typed unsupported/error result. Legacy loaders adapt internally without changing their externally observed signatures. New practice events expose semantic motor-stroke/plan IDs and reason codes. Legacy callbacks retain their numeric stroke fields on the legacy path; do not quietly reinterpret those indices as arbitrary visual fragments.

For v2, prefer explicit `quizUnit` until its contract is stable, then consider a unified API in a separately reviewed release. `getCharacterData` remains the old Character contract; `getUnitData` is the new model. Type-check both paths from the extracted npm tarball.

## Migration Plan and Invariants

1. Freeze v1 golden outputs, then add v2 readers and a legacy adapter. No rewrite of the 9,574 existing Chinese source files.
2. Store new pack files with schemaVersion=2; pin generated artifacts by source/compiler/hash. Do not overwrite upstream source data.
3. Opt-in clients adopt `setUnit/quizUnit`; old clients continue using v1. New packages declare minimum engine schema/features. Unsupported versions fail before rendering.
4. If a cache is added, key by pack/version/schema/style/variant/normalized text/profile version; use a distinct namespace from legacy data. In-memory cache comes first; persistent caching can be opt-in after correctness gates.
5. Rollback: disable the affected pack/new entry points, restore its previous manifest/version and drop only that cache namespace. Legacy CDN/loader behavior remains available. No data backfill is required; regeneration is deterministic from pinned pack sources.

Invariants: no change to legacy grade decisions or callback sequences; identical v1 transforms/radical mapping; every declared pack item resolves offline; no dangling plan references; no render fragment changes motor-stroke counts; no unsupported fallback success; no cache collision across locale/style/variant/version; destroy/supersession leaves no new work scheduled by callbacks.

## Work Items

### WI-001: Validate the risky assumptions and lock the first release inventory

- **Goal:** Import and compare existing data/style sources before committing to bulk conversion or new authoring.
- **Acceptance (measurable):** Record source revisions/licenses and an exact first-release inventory. Demonstrate A/a/i/j/O, あ/ぬ/が/ぱ and ㄱ/ㅇ/가/고/한 in disposable fixtures. Prove あ/ぬ have 3/2 motor strokes, dots are explicit, and layouts agree with chosen references. Record what fails under v1. Inventory all 62 English core glyphs from glyphed.js/other sources, map the 40 Omniglot Korean classes against the desired jamo inventory, and report residual gaps. Select candidate English/Korean models and Japanese importer direction. Replay at least one raw sample each from Greek/Cyrillic/Hebrew and Assamese to validate the shared observation format. A source-style mismatch is an editing/selection issue, not proof that no paths exist.
- **Tests (first):** `fixtures/multilingual/spike-cases.json`, `scripts/data/__tests__/spike-test.ts`; assert source counts/logical stroke grouping, coordinate alignment and rejection of visual fragments as strokes. Review animation frames separately.
- **Touched areas:** New research fixtures, RawStrokeSample/import prototypes, source lock manifests and this plan's decision log; no production behavior change.
- **Dependencies:** Source access; preliminary script reviewers. Use the completed parser-only A/ㄱ probe as evidence, not as the final visual spike.
- **Risks + mitigations:** A source may be unsuitable or its terms ambiguous; switch that pack to original authored geometry or a verified alternative.
- **Rollback:** Remove the disposable experiment; preserve its evidence/decision record.
- **Priority / estimate:** P0 / M. Gates WI-002 and pack commitments.

### WI-002: Versioned unit schema, provider contract and exact legacy adapter

- **Goal:** Add the model/API seam without changing existing Chinese behavior.
- **Acceptance (measurable):** v1 and v2 validate distinctly; IDs/references/limits are checked; v1 fixtures retain all existing discrete outputs. Provider cancellation and unsupported results are typed. Existing public APIs and packed TypeScript consumers pass unchanged; new unit methods have explicit readiness/error semantics. Define separate runtime and data/tooling Jest projects or explicit equivalent runners: every named suite under src/scripts/tools/packs/examples is discovered, and a temporary deliberate failure in each test project fails the CI gate.
- **Tests (first):** `src/data/__tests__/legacyAdapter-test.ts`, `validateUnit-test.ts`, `src/__tests__/UnitLifecycle-test.ts`; test malformed/oversized units, schema mismatch, supersession, abort and destruction inside callbacks. Add a discovery/exit-code check for the planned external test roots; retain existing runtime setup and browser mocks only where needed.
- **Touched areas:** `src/data/*`, `src/typings/types.ts`, `src/Scribing.ts`, `src/LoadingManager.ts`, `src/parseCharData.ts`, model mappings, package consumer checks, package.json test configuration/scripts and CI suite discovery.
- **Dependencies:** WI-001.
- **Risks + mitigations:** Quietly changing v1 defaults; run frozen v1 characterization through both routes.
- **Rollback:** Keep v2 entry points disabled; v1 adapter remains independently tested.
- **Priority / estimate:** P0 / L.

### WI-003: Metrics, centerline/dot rendering and visual-segment support

- **Goal:** Render new packs faithfully in both engines, separating motor motion from reveal pieces.
- **Acceptance (measurable):** Rectangular units and baseline/descender guides fit correctly; up/down source coordinates map identically within 1e-6 canonical units. Curve, dot and segmented-outline fixtures match at 0/25/50/75/100% progress. No future part of あ/ぬ appears early. Canvas fallback explicitly supports the compiler's path grammar including Z. v1 reveal/timing remain unchanged.
- **Tests (first):** `src/data/__tests__/compileUnit-test.ts`, `src/renderers/__tests__/UnitParity-test.ts`, `src/__tests__/UnitPositioner-test.ts`; SVG/Canvas/Path2D-disabled comparison and scaled pointer round trips.
- **Touched areas:** `Positioner.ts`, stroke models/renderers, `StrokeRendererBase.ts`, `canvasUtils.ts`, `characterActions.ts`, source compiler.
- **Dependencies:** WI-002.
- **Risks + mitigations:** Fill/reveal artifacts and canvas differences; prefer native centerlines for new monoline packs and test self-crossings explicitly.
- **Rollback:** Feature-switch new primitives; retain old renderer adapter defaults.
- **Priority / estimate:** P0 / L.

### WI-004: Primitive-aware grading and bounded approved plans

- **Goal:** Grade taps, curves, direction and valid alternative stroke sequences without mixing styles.
- **Acceptance (measurable):** Exact/jitter dots accepted, displaced dots and accidental drags rejected by profile; curve rules never treat an arbitrary tap as a stroke. Approved order/direction plans over the same motor-stroke set pass; incompatible mixed plans fail. Different pen-lift segmentations work as separately selected complete variant assets; automatic matching across those variants is deferred. Circle direction, reversed strokes, missing marks and wrong-next-stroke hints are tested. No more than eight eligible plans or 512 normalized points per candidate; v1 grades remain identical.
- **Tests (first):** `src/grading/__tests__/{dotMatcher,curveMatcher,planSession}-test.ts`, `src/__tests__/UnitQuiz-test.ts`; include callback restart/destroy, explicit selection of alternate pen-lift variant assets, duplicate samples, near-closed paths and tiny marks.
- **Touched areas:** `Quiz.ts`, `strokeMatches.ts`, new pure grading/profile modules and additive v2 feedback events.
- **Dependencies:** WI-002, WI-003 fixtures.
- **Risks + mitigations:** Overly permissive variants, scale-dependent feedback; keep finite author-reviewed plans and calibrate against held-out traces in WI-011.
- **Rollback:** Disable v2 quiz for affected packs while retaining animation; never report a degraded quiz as successful support.
- **Priority / estimate:** P0 / L.

### WI-005: Unicode requests, pack registry and auditable coverage

- **Goal:** Resolve multilingual text deliberately and describe actual coverage.
- **Acceptance (measurable):** NFC/NFD é, voiced kana and Hangul resolve equivalently when declared; supplementary Hanzi remains intact; compatibility jamo follows explicit aliases. Preserve raw text. Unknown style/pack/unit and unsupported sequences are distinct. Coverage is generated from exact manifests and capability flags, not counted from Unicode blocks or source file variants.
- **Tests (first):** `src/text/__tests__/{normalizeRequest,segmentText,coverage}-test.ts`, `src/data/__tests__/providerRegistry-test.ts`; pinned grapheme fixtures, missing Intl.Segmenter fallback, style/version cache collisions and mixed unsupported input.
- **Touched areas:** `src/text/*`, provider registry, coverage CLI and request types.
- **Dependencies:** WI-002; Unicode/CLDR snapshots pinned in source locks.
- **Risks + mitigations:** Compatibility folding erases pedagogical differences; default NFC only and tested explicit aliases.
- **Rollback:** Fall back to explicit authored unit IDs; disable automatic text selection for affected packs.
- **Priority / estimate:** P0 / M.

### WI-006: Reproducible import, authoring and data review tools

- **Goal:** Make adding a script primarily importing, mapping and curating existing data, with authoring for remaining gaps.
- **Acceptance (measurable):** Import SVG subpaths, JSON/Omniglot text, Tomoe XML and InkML/UNIPEN into a shared observation format. Preserve pen breaks, optional times, labels and source identity; reject empty/malformed samples and disable XML external entities/DTDs. Support Unicode mapping, replay, compatible-variant grouping and representative selection without averaging incompatible segmentations. Then curate motor strokes, dots, pen lifts, direction, visual pieces, metrics and complete teaching plans. Export deterministic assets, licenses and provenance. Rebuilding a pinned pack twice produces identical digests. Tool renders review sheets/animation checkpoints and replays recorded gestures. No executable fields, unresolved references or unlicensed-source placeholders pass release validation.
- **Tests (first):** `scripts/data/__tests__/{import,compile,provenance}-test.ts`, `tools/authoring/__tests__/roundtrip-test.ts`; round-trip all three initial script fixtures, raw XY/time/pen-up records, XML and mapped/nonmapped labels; detect empty traces, malformed XML, lost pen lifts, fabricated writer IDs and missing source notices/changed hashes.
- **Touched areas:** `scripts/data/*`, optional local `tools/authoring/`, pack manifests, recording/import format. [InkML](https://www.w3.org/TR/InkML/) is an interchange reference, not a required internal runtime format.
- **Dependencies:** WI-002; WI-003 for visual review.
- **Risks + mitigations:** Building an elaborate editor before proving the model; start JSON/CLI plus a small local stroke recorder/reviewer.
- **Rollback:** Keep authored source JSON usable by CLI if editor work is delayed.
- **Priority / estimate:** P0 / M.

### WI-007: English print pack

- **Goal:** Deliver a coherent and reviewed English writing repertoire.
- **Acceptance (measurable):** 62 core letter/digit items plus `. , ' -` are enumerated and work offline. Baseline/ascender/descender metrics are reviewed. a/g/numeral forms and pen-lift/order choices are named; i/j dots, t crossbar, O/0 direction, retracing and small marks have accepted/rejected fixtures. Every core item has review evidence and passes WI-011's recording gate before reviewed release.
- **Tests (first):** `packs/latin-print/__tests__/{coverage,forms,plans}-test.ts`; uppercase/lowercase/digits, dot timing, approved alternate plans, confusion fixtures and absence of accidental cursive joins.
- **Touched areas:** Imported/curated English source assets, manifest/style specification, illustrative examples and an explicit residual-authoring list.
- **Dependencies:** WI-003–WI-006; English reviewer. Existing glyphed.js/letterpaths paths are the first comparison inputs, with UJI recordings for variation; author only missing or unsuitable forms. All adaptations retain provenance and source terms.
- **Risks + mitigations:** Regional differences or decorative geometry; release a named model rather than a universal English standard.
- **Rollback:** Withdraw affected item/variant capability; preserve last reviewed pack version.
- **Priority / estimate:** P0 / M engineering + L content/review.

### WI-008: Japanese kana and initial kanji pack

- **Goal:** Import real Japanese pen paths without inheriting Chinese forms or counting visual pieces as strokes.
- **Acceptance (measurable):** All 92 basic kana and the explicitly chosen additional voiced/semi-voiced/small forms resolve. Start kanji with an enumerated 80-item grade-one subset using the [MEXT inventory](https://gkz781swok1ivzu2.www.mext.go.jp/a_menu/shotou/cs/1320015.htm); verify the pinned list against the current curriculum at implementation. あ/ぬ have 3/2 motor strokes. All imported paths have aligned geometry, supported grammar and CC BY-SA notices; no silent Chinese fallback. Exceptions are quarantined, not shipped as successful quiz items.
- **Tests (first):** `scripts/data/__tests__/kanjivg-test.ts`, `packs/ja-kanjivg/__tests__/{coverage,strokeCounts,reveal}-test.ts`; curves, self-crossings, dakuten/handakuten, small forms and locale-different Han glyphs.
- **Touched areas:** KanjiVG importer, source locks, Japanese assets/manifests and visual checkpoints.
- **Dependencies:** WI-003–WI-006; Japanese reviewer. Can run alongside WI-007 and WI-009.
- **Risks + mitigations:** Source defects and special glyph forms; preserve source IDs and record explicit corrected assets/terms. Filled AnimCJK import is optional later.
- **Rollback:** Pin prior pack; keep coverage subset explicit.
- **Priority / estimate:** P0 / M engineering + M/L review.

### WI-009: Korean letters/pilot (A), then contextual composition (B)

- **Goal:** Establish correct reusable forms before generating broad Hangul coverage.
- **Acceptance (measurable):** **WI-009A (initial-release gate):** 40 initial/vowel letter units plus a published block pilot covers vertical/horizontal/compound vowels, doubled initials, no/final/cluster codas and circle direction. Include 가/고/과/각/관/값/괜/읽/한/힣 as boundary/shape fixtures. **WI-009B (later, independently tracked gate):** all 11,172 modern syllables round-trip NFC↔NFD, generate finite geometry, and pass layout invariants. Every implemented allograph/layout class has reviewer-approved examples; generated and individually reviewed coverage are reported separately. Track A and B with distinct statuses: A can be released while B remains pending.
- **Tests (first):** `packs/ko-hangul/__tests__/{jamo,decompose,compose,allographs}-test.ts`; exhaust AC00..D7A3 and test every declared template/variant class, optional finals, clusters and explicit compatibility-jamo aliases. Compare pilot generated forms with reviewed sourced or authored blocks before expansion.
- **Touched areas:** Omniglot Korean mapping/curation, comparison against existing Nanum-derived candidates and suitably licensed recorded fixtures, remaining authored contextual forms, allograph table, deterministic composer, manifests and review matrix.
- **Dependencies:** WI-003–WI-006; Korean reviewer. Import existing Korean observations before commissioning equivalent recordings ; 40 Omniglot classes are not assumed to equal the target40 letters until mapped. WI-009B depends on completed WI-009A and cannot pass solely from Unicode arithmetic. WI-011 requires only WI-009A.
- **Risks + mitigations:** Squeezed/distorted components or invalid pedagogical forms; source explicit contextual variants, quarantine failed classes, release pilot first.
- **Rollback:** Disable composer output while retaining reviewed standalone letters/blocks; version rules and caches.
- **Priority / estimate:** P0 Milestone A / P1 Milestone B; L engineering + L content/review.

### WI-010: Multilingual practice examples and portable data delivery

- **Goal:** Provide a usable reference integration and maintain lightweight/offline loading.
- **Acceptance (measurable):** User selects installed pack/style, sees exact coverage and switches exercises safely. Character/grapheme/unit input follows pack capabilities. Unsupported items are reported; practice remains keyboard-accessible and touch/stylus-capable. Only requested packs load; local packs work with networking disabled. Existing Chinese demo remains functional. Actual SVG/Canvas drawing is verified at 320px width and normal desktop size.
- **Tests (first):** `examples/multilingual/__tests__/practice-test.ts`, `scripts/check-multilingual-demo.cjs`, `src/data/__tests__/cache-test.ts`; rapid pack switches, missing data, late responses, teardown, NFC/NFD input, responsive scaling and focus/feedback state.
- **Touched areas:** `examples/multilingual/`, provider/cache integration, demos, API documentation and pack packaging.
- **Dependencies:** WI-005; pilot assets from WI-007, WI-008 and WI-009A; no dependency on WI-009B. No UI translation project is implied.
- **Risks + mitigations:** Metadata/locale switching leaks state; cancel requests/session and key caches by complete identity.
- **Rollback:** Keep the original Chinese example available; disable affected pack selectors.
- **Priority / estimate:** P0 / M.

### WI-011: Evidence, performance and initial release gate

- **Goal:** Release the three initial packs with evidence beyond synthetic self-matching.
- **Acceptance (measurable):** Existing 256-test baseline remains green. Each initial style has all core items reviewed, at least 10 held-out writers, at least 1,000 labelled valid and 250 labelled invalid gesture examples per pack, and at least 30 examples for each applicable critical class (dots, loops, short marks, order and direction). Declare critical classes per pack/style; document a class as not applicable if absent rather than inventing dot targets for short flicks. Use existing appropriately licensed recordings first and collect only unmet coverage/evaluation gaps. Use writer-disjoint calibration/evaluation where source identities permit it; datasets without writer IDs cannot substantiate this gate. Do not count data already used to select a model as held-out evidence. Proposed release targets: false accept ≤5%, false reject ≤10% overall; report denominators, intervals and per-class failures, not a universal accuracy claim. Fail a pack whose critical class misses target even if aggregate passes. Hit the performance budgets below on named reference devices; tarballs include only intended runtime/data/notices and compile both legacy/v2 consumers.
- **Tests (first):** `bench/grading.cjs`, `scripts/check-recorded-corpus.cjs`, `scripts/check-package.cjs`, `fixtures/recorded-traces/manifest.json`; replay held-out records, no source-median-only evaluation. Automated visual parity plus physical touch/stylus review.
- **Touched areas:** Corpus tooling, benchmarks, CI scripts, profile calibration, release/coverage reports and pack integrity.
- **Dependencies:** WI-002–WI-008, WI-009A and WI-010; consenting writers and reviewers. WI-009B is expressly excluded from the first-release gate and receives its own composition evidence before the later release. Targets are proposed, not measurements achieved by planning.
- **Risks + mitigations:** Poorly representative corpus and overfitting; record device/style demographics relevant to intended users, preserve held-out sets, publish limits and withhold reviewed label when evidence is missing.
- **Rollback:** Disable the new pack/profile or fall back to its prior validated version; retain v1.
- **Priority / estimate:** P0 / L, with recruitment/review lead time independent of agent coding speed.

### WI-012: Latin extensions and locale inventories

- **Goal:** Expand language reach cheaply through reviewed reuse, not a nominal language counter.
- **Acceptance (measurable):** Select a first batch of at least ten locales from the roadmap and publish their exact inventories. Every required upper/lowercase letter, numeral, mark and declared punctuation is covered. NFC/NFD pairs agree; Turkish I/ı/İ/i, ß/æ/œ/ø/ł/đ and Vietnamese stacked marks receive explicit cases wherever relevant. Each locale/style passes its coverage and human-review gates; no automated claim from CLDR alone.
- **Tests (first):** `packs/latin-extended/__tests__/{localeCoverage,marks,aliases}-test.ts`; canonical equivalence, distinct non-decomposing letters, mark collision/placement and plan order.
- **Touched areas:** Shared Latin components, locale manifests, sourced or authored extension assets and mark attachment/placement rules.
- **Dependencies:** WI-007, WI-011 and chosen locale reviewers. Use manually authored complete assets if generic composition cannot preserve forms.
- **Risks + mitigations:** Treating all accents/alphabet styles alike; explicit per-locale overrides and reviewed exceptions.
- **Rollback:** Withdraw only affected locale/variant; maintain shared base pack.
- **Priority / estimate:** P1 / M per locale batch, primarily data/review after shared features.

### WI-013: Broader Japanese kanji

- **Goal:** Extend Japanese coverage with transparent source and review status.
- **Acceptance (measurable):** Generate an exact 2,136-item Jōyō target manifest from a pinned official list; every item has a valid source or an explicit missing/quarantined status. Only available, tested items are advertised. Compare stroke counts and regional forms against chosen references; exceptions are recorded. Split downloads by useful subsets; preserve source variants as variants, not extra unique-character claims.
- **Tests (first):** `packs/ja-kanjivg/__tests__/{joyoCoverage,regionalForms,subsetDelivery}-test.ts`; all-source validation plus focused tricky-glyph grading/reveal corpus.
- **Touched areas:** Japanese importer exceptions, target inventory, source locks and subset packaging.
- **Dependencies:** WI-008, WI-011; review capacity determines promotion rate.
- **Risks + mitigations:** File existence mistaken for educational correctness; stage generated versus reviewed status and track all exceptions.
- **Rollback:** Pin previous reviewed subset/version.
- **Priority / estimate:** P1 / M tooling + L review.

### WI-014: Additional independent-letter scripts

- **Goal:** Prove the pack model generalizes with Greek and Cyrillic, then expand to Armenian, Georgian and Ethiopic as sources/reviewers permit.
- **Acceptance (measurable):** First ship explicitly enumerated modern Greek print and Russian Cyrillic print inventories, including required final/diacritic forms; add Ukrainian/other Cyrillic locale letters separately. Two new script packs integrate without per-language branches in renderer or loader. Each subsequent script repeats the same source, inventory, style and evidence gates. Greek/Cyrillic cursive is not implied by print coverage.
- **Tests (first):** `packs/greek-print/__tests__/coverage-test.ts`, `packs/cyrillic-print/__tests__/forms-test.ts`; locale distinctions, lookalike glyphs, direction/order and full review manifests.
- **Touched areas:** Imported/curated Omniglot and other sourced candidate packs, residual original assets and locale metadata; core only for an independently justified missing primitive.
- **Dependencies:** WI-006, WI-011; native reviewers and rights-cleared models.
- **Risks + mitigations:** Adapting Latin lookalikes incorrectly; require explicit reviewed per-script plans even when shapes resemble Latin.
- **Rollback:** Disable individual pack; leave other scripts untouched.
- **Priority / estimate:** P2 / M–L per script.

### WI-015: Contextual runs, cursive and RTL writing

- **Goal:** Add a separate run/connection capability for Latin cursive and everyday Arabic; support Hebrew's chosen handwritten style and final forms with explicit RTL layout.
- **Acceptance (measurable):** Run resolver preserves logical source spans and direction while producing positioned, reviewed motor plans. Latin joined-word pilot covers joins, retracing and delayed dots/crossbars. Arabic pilot covers joining/non-joining boundaries, contextual forms, ligatures, dots/marks and mixed digits; a curated minimum 50-word set is reviewed and replayable. Hebrew unit coverage/final forms is distinct from connected Arabic. Shaped font output alone never enables quiz capability. Adding Persian/Urdu requires its own inventory/style milestone.
- **Tests (first):** `src/runs/__tests__/{resolve,sourceSpans,bidi,joins}-test.ts`, pack-specific `wordPlans-test.ts`; word-level pen lifts, delayed marks, mixed direction and normalization offset mapping.
- **Touched areas:** Optional run resolver and run-session model, connected assets/plans and optional shaping adapter. Reuse HarfBuzz or platform shaping for layout only when needed.
- **Dependencies:** WI-011, English corpus, Arabic/Hebrew reviewers; assess existing POH-Db/Calliar/Qt/HWRT or appropriately acquired native corpora before new collection; run schema reviewed as a new capability before implementation.
- **Risks + mitigations:** Combinatorial joins and mistaken bidi/pen-order assumptions; ship a reviewed sourced or authored word pilot before general text composition.
- **Rollback:** Disable `connectedRun`; retain reviewed unit practice where meaningful.
- **Priority / estimate:** P2 / L; a separate project-sized extension.

### WI-016: Complex-cluster scripts and continued expansion

- **Goal:** Extend through a validated Devanagari pilot, then repeat for other Indic/Southeast Asian/stacked scripts.
- **Acceptance (measurable):** Devanagari pilot includes standalone forms, vowel marks, conjuncts, reordering cases and a reviewed set of at least 50 representative words/units. Source spans and motor plans survive rendering reordering; missing forms fail explicitly. Before each additional script, enumerate its required shaping/mark/stack capabilities and pass its own representative matrix. Do not report Bengali/Tamil/Thai/etc. supported merely because the pilot renderer works.
- **Tests (first):** `packs/devanagari/__tests__/{clusters,marks,plans}-test.ts` and per-script fixture matrices; malformed/unsupported clusters, canonical equivalents, visual/motor order separation and script-specific pen lifts.
- **Touched areas:** Optional run/cluster resolvers, each script's sourced or authored, reviewed packs, source manifests and compiler fixtures. [W3C Devanagari requirements](https://www.w3.org/TR/deva-lreq/) are layout references, not stroke data.
- **Dependencies:** WI-006, WI-011, relevant WI-015 run capabilities; verified data rights and specialist reviewers. Recruit in parallel; do not port every shaping system preemptively.
- **Risks + mitigations:** A universal heuristic produces attractive but wrong writing; retain reviewed sourced or authored pilot plans and expand only after the class matrix passes.
- **Rollback:** Disable the affected cluster capability/pack; other scripts remain available.
- **Priority / estimate:** P3 / L per script family pilot, then explicit per-script projects.

## Gap-to-Work-Item Map

| Gap | Work Items |
| --- | --- |
| Uncertain source quality, coverage or terms | WI-001, WI-006, each pack WI |
| Legacy outline/index model and fixed metrics | WI-002, WI-003 |
| Dots, order variants, style-aware tolerances | WI-004, WI-011 |
| Unicode, locale selection and misleading coverage | WI-005, WI-010, WI-012 |
| English source selection, curation and residual gaps | WI-007 |
| Japanese source conversion and expansion | WI-008, WI-013 |
| Korean contextual shapes/composition | WI-009 |
| Validation on real handwriting, devices and packed consumers | WI-010, WI-011 |
| Broader alphabets and complex/connected writing | WI-012–WI-016 |
| Pronunciation, dictionaries, full courses, OCR | Explicit non-goals; separate product work |

## Ordering, Staffing and Effort

Dependency order: WI-001 → WI-002 → renderer/grader/Unicode/tooling (WI-003–WI-006) → three parallel data tracks (WI-007, WI-008, WI-009A) → integrated examples/evidence (WI-010–WI-011). Existing-data inventory, import prototypes and reviewer recruitment start during WI-001. The importer can expose experimental observations across additional scripts without waiting for their complete teaching packs. Latin extension and Japanese expansion follow without waiting for connected-script work. Korean composer WI-009B follows its reviewed pilot; it neither blocks WI-011 nor bypasses its own later composition/review gates.

Effort labels: S = a small isolated change; M = several focused engineering days; L = multiple engineering weeks or a substantial data/review project. They are planning estimates, not elapsed agent time. A rough initial envelope is 1 engineering week for source spikes/contracts, 3–6 engineering weeks for shared foundations, and 2–5 engineering weeks per initial pack including integration, with Korean composition potentially larger. Tracks overlap; do not sum these into a calendar promise. Re-estimate after WI-001 from actual importer exceptions, authoring rate and grader results. These earlier effort envelopes are provisional: existing 62-item English geometry and Korean recordings materially reduce the assumed authoring scope. WI-001 must replace estimates with measured import defects and residual gaps. Content/reviewer availability may still dominate reviewed release dates; broad experimental replay can proceed earlier.

Suggested parallel ownership: engine/rendering, data tooling/Japanese, English data/grading, Korean data/composition, with one maintainer reviewing contracts and release evidence. With three implementation agents, share stable schema fixtures first and keep file ownership explicit. Agents can create converters, tests and candidate paths; reviewer availability and physical-input validation are not replaced by more agents.

## Observability and Performance Budgets

These are proposed acceptance targets to measure, not benchmarks already achieved:

- Reference environment: record a Node22 desktop run and named browser/device versions; include one midrange Android touchscreen and one iOS/Safari stylus/touch device before mobile support claims. Capture hardware details in the evidence manifest.
- Typical single-unit end-of-stroke feedback: p95 ≤50ms on the chosen mobile reference; no individual synchronous task >100ms. If measured matching exceeds this, narrow candidates/cache reference features first, then put v2 matching behind a cancelable worker. Do not change the v1 profile to manufacture a benchmark pass.
- Hard limits: ≤64 motor strokes, ≤8 active plans, ≤512 normalized samples per candidate; initial source polyline cap 4,096 points per stroke and 256KiB decoded unit JSON. Reject larger assets or compile an explicitly supported run/subset; limits are versioned and benchmarked before relaxation.
- Initial English pack target ≤250KiB gzip; Korean component/rule pack target ≤1MiB gzip; lazy Japanese subset target ≤1MiB gzip. These are design budgets checked in WI-001/WI-011; document any evidence-based revision instead of silently exceeding them.
- Local warm unit load/mount target p95 ≤100ms; network downloads are measured separately. Memory must plateau over 1,000 load/quiz/destroy cycles, with no retained input listeners or active mutation chains.
- Optional debug diagnostics: pack/version/asset/plan/profile IDs, candidate count, normalized points, load/mount/grade timings and reason codes. Default logs contain no raw handwriting; verbose trace collection is local and explicit. Persisted test traces carry consent/provenance metadata.

## Testing Procedures

Write each WI's named tests before its implementation. WI-002 must extend the current package.json Jest root (src) into explicit runtime/data-tooling projects or equivalent runners before adding external suites; list discovered tests and prove deliberate failures fail CI. WI-001's external spike test runs through an explicit temporary configuration until that shared harness lands. Keep synthetic exact-trajectory tests, visual tests and held-out human input as separate evidence classes.

Current commands, which remain required:

```sh
yarn install --frozen-lockfile
yarn typecheck
yarn lint-test
yarn test --runInBand
yarn build
yarn check-demo
yarn check-package
```

Commands to add as the referenced WIs land:

```sh
yarn check-data             # schema, limits, coverage, references, hashes and notices
yarn test-legacy-parity     # frozen Chinese behavior through the adapter
yarn check-multilingual-demo
yarn bench-grading
yarn check-recorded-corpus
```

Run targeted unit/importer tests after each WI; run the full current gate after shared runtime changes; run all pack checks and actual tarball consumers before pack release. Rebuild before browser checks. Test Canvas both with and without Path2D, source/compiled imports, offline mode and cancellation under rapid switching. Do not rerun performance or human studies mechanically after documentation-only changes; rerun when relevant profiles, geometry, input handling or data changes.

## Rollout Plan

1. Develop v2 as opt-in entry points with legacy default. Publish experimental schema/provider docs and fixture packs only after WI-001–WI-006 prove the contract.
2. Enable each initial pack in a development demo as `technical-preview`. Keep failed/quarantined units out of selectable reviewed coverage.
3. Promote a named pack/style to reviewed animation, then reviewed quiz only when its respective evidence gates pass. A missing reviewer blocks that label, not unrelated engine work.
4. Version engine APIs and pack data independently; pin compatibility and source hashes. No automatic publishing from master. Use the existing manual release workflow and verify npm names/ownership at release time.
5. Kill switches: wrong motor count, missing required marks, cross-locale substitution, critical-grade regression, out-of-budget work, data-license/provenance failure, or new lifecycle leak. Withdraw only the affected capability/pack version; preserve legacy and other validated packs.
6. Expand through WI-012–WI-016 based on source readiness and review capacity, publishing exact coverage gaps. There is no “all Unicode fonts imply all-language support” switch.

## Plan → Verify Handoff

For each WI collect: commit/diff reference, named tests and results, fixture/source digests, failures corrected, and a short acceptance-to-evidence map. Add these specific artifacts:

| WI | Required evidence |
| --- | --- |
| 001 | Pinned source inventory, license/selection notes, risky-glyph proof and reviewer/model decisions. |
| 002 | v1 characterization comparison, schema failures, cancellation/API consumer results. |
| 003 | SVG/Canvas intermediate frames, coordinate round trips, path-subset parity. |
| 004 | Dot/curve/plan traces and deterministic accepted/rejected results, bounded candidate diagnostics. |
| 005 | Unicode normalization/segmentation fixtures, coverage report, identity/cache collision tests. |
| 006 | Two identical rebuild digests, source records/notices, import/curation round-trip record. |
| 007 | English inventory/forms specification, item review records, human evaluation manifest. |
| 008 | Japanese source/import exceptions, motor-count checks, tricky-kana frames. |
| 009A | 40-letter inventory, named block pilot, reviewed sourced or authored block comparisons and applicable real-input evidence; sufficient for the initial Korean release gate. |
| 009B | Later composer release only: 11,172 round-trip/geometry report, allograph-class matrix and generated/reviewed coverage split. |
| 010 | Offline network evidence, 320px and desktop captures, real touch/stylus exercise results. |
| 011 | Full logs, actual packed consumers, writer-disjoint corpus metrics with denominators, device benchmarks. |
| 012 | Per-locale inventory/composition exceptions, canonical-equivalence and reviewed-mark evidence. |
| 013 | Jōyō manifest diff, quarantined items, subset integrity and review progress. |
| 014 | Each script's complete declared inventory, locale/style distinctions and reviewer evidence. |
| 015 | Authored run/word fixtures, joins/delayed marks/bidi source spans and physical-input review. |
| 016 | Script capability/class matrices, representative cluster/word traces and source terms. |

Do not mark a WI complete from an animation screenshot, aggregate test count, source-file count or a generated manifest alone. The source/model and real-input evidence must match the claim being enabled.

## Manual Test Checklist

- [ ] Existing Chinese exercises preserve shape, order, highlighting and feedback.
- [ ] A/a/i/j/t/O/0 demonstrate declared print forms, real dots, crossbars and loop direction.
- [ ] あ and ぬ use the correct motor-stroke counts; crossing/reveal timing does not expose future strokes.
- [ ] Voiced/small kana have correct mark placement and order in the selected profile.
- [ ] Korean pilot covers vertical, horizontal, compound vowels, coda clusters and contextual forms.
- [ ] Canonically equivalent Latin/kana/Hangul input selects the same intended item; incompatible forms are not folded silently.
- [ ] Wrong order, direction, missing marks and wrong adjacent strokes receive useful feedback; approved alternatives work consistently.
- [ ] SVG and both Canvas paths align and accept drawing at narrow/mobile and desktop sizes.
- [ ] Rapid pack switches, cancel, destroy and callback restart leave no old work or listeners.
- [ ] Local packs work offline; unsupported text/variants show explicit gaps.
- [ ] Every advertised pack has its exact coverage, review status, source revision and license notices.
- [ ] Later connected/cluster packs are checked as whole writing units with real pen lifts and source spans.
