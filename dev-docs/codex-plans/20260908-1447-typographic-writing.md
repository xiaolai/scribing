---
title: 'Typographic writing: exact selectable fonts with honest practice capabilities'
created_at: '2026-09-08 14:47 Asia/Shanghai'
mode: 'full-plan'
status: 'Accepted locally on 2026-09-08; documented coverage and capability boundaries remain'
baseline: '33d07e3ffce46746ba9ca370ce0be6cd6e173edb'
---

## Outcomes

Xiaolai wants formal, clean font models across the available scripts, with selectable fonts that behave consistently in practice. The model must actually change to the selected font. Replacing only a label, a CSS preview, or the visible model while retaining a different grader does not satisfy the request.

Deliver an optional font-writing surface that loads real local font files, shapes supported text, extracts the selected face's actual filled outlines, and uses those same outlines for SVG, Canvas, and unordered shape comparison. Every compatible selectable face supports visible tracing, copying with the target hidden, clearing, comparing the result, and replaying the user's own ink. The default multilingual demo view becomes font practice after its gates pass. Existing ordered writing models and raw source samples remain available in separate views.

Keep three independently reported capabilities:

1. **Font display coverage:** this exact font can shape this exact supported input into usable visible geometry.
2. **Font practice coverage:** this exact geometry can be traced or copied, and compared with the resulting ink without inferring writing order.
3. **Motor-plan coverage:** an explicit order/direction plan exists for an exact form and has its own provenance and validation. Current `WritingUnit` lessons retain this capability. Arbitrary selected fonts do not inherit it.

This release provides the first two capabilities broadly and preserves existing motor lessons. The remainder of the ideal request is automatic instructional stroke-order animation and order-sensitive assessment for each selectable font. That remainder requires separately authored or licensed, validated font-bound motor profiles and remains unavailable for arbitrary fonts. The UI and completion report must state this boundary plainly.

Non-goals for this release: general paragraph layout, arbitrary mixed-direction text, arbitrary fallback chains, OCR, a handwriting recognizer, automatic instructional stroke inference from contours/skeletons, calligraphy evaluation, font editing, or claiming every old source class has a Unicode identity. Two distinct faces are supplied where real compatible fonts are available; a second face is not fabricated where it is not.

## Constraints & Dependencies

- Repository: `/Users/joker/github/xiaolai/myprojects/scribing`. Existing TypeScript 4.1-era code, Rollup 2, Jest 26, Node 22 CI, CJS/ESM/browser bundles, SVG and Canvas. Preserve current import paths and behavior.
- `AGENTS.md` assigns planning, decisions, debate, acceptance and auditing to an Astra Ultra lead. The current available Astra High implementation agent handles source implementation, including routine catalog/demo work, because the orchestrator has a hard four-agent lifetime limit. A Medium agent is ordinarily preferred for routine work but none is currently available. A separate agent challenges the plan and later independently audits implementation. This policy does not silently change any running model.
- Expose the lightweight FontWriter through `Scribing.createFontWriter`. Legacy imports may include that modest class code, but must not initialize or fetch HarfBuzz, WASM or font assets. The shaping provider stays a separate optional module with pinned local dependencies. Measure and report core bundle growth; no framework or service dependency is introduced.
- Use pinned `harfbuzzjs` for shaping and `font.glyphToPath(gid)` for exact outline extraction. Its current observed npm version is 1.6.1, with no listed dependencies, an ESM export and 1,238,713 bytes for the entire unpacked package. These are discovery facts, not the delivered transfer budget. Verify its API, WASM files and license before pinning; bridge its ESM/types into the old toolchain without upgrading the whole repository.
- HarfBuzz shapes a uniform font/script/language/direction run. It does not perform bidi paragraph analysis or script itemization. Initial practice units are one supported script/direction run (horizontal or a single vertical column), at most 32 Unicode scalar values. Vertical Mongolian/Phags-pa use an explicit `ttb` single-column output. Their font glyphs are shaped as a complete LTR run and rotated clockwise into the vertical column; raw HarfBuzz TTB shaping alone is not their orientation transform. Preserve whole Arabic words and Indic clusters through shaping; reject unsupported mixed runs rather than guessing.
- Built-in fonts, adapter JS/WASM, manifests and license notices are local assets. A served offline distribution makes no external request. Do not rely on installed system fonts, browser fallback or a Google Fonts CSS endpoint.
- Imported fonts retain their applicable license and source records; MIT core ownership does not relicense fonts. The asset work item verifies the selected files rather than assuming all Noto/other files share one record.
- User-provided local TTF/OTF files use the same adapter. They stay local and in memory for the session; no upload to an external service, automatic copying into packs or persistence is required.
- No secrets or external accounts are required. No publishing or package release is part of implementation verification.
- The current `AGENTS.md` is untracked at the baseline. Preserve it and unrelated user changes; this plan does not authorize resetting the checkout.

## Current Behavior Inventory

| Area                                                      | Current behavior and invariant                                                                                                                        | Gap                                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/Scribing.ts`                                         | Chinese `setCharacter()` and optional `setUnit()` manage loading, generations, quiz cancellation, renderers and destruction.                          | No independent font target/capability or arbitrary typed-font practice.                                                                |
| `src/units/types.ts`, `validateUnit.ts`, `compileUnit.ts` | Version 2 units require explicit motor strokes and plans; compile to canonical em=1024/y-up coordinates.                                              | Filled font contours have no inherent motor sequence and cannot honestly be inserted as motor strokes.                                 |
| `src/renderers/unitGeometry.ts`, SVG/Canvas renderers     | Ordered curves, dots and visual pieces are drawn from supplied polyline geometry.                                                                     | Exact filled glyph contours, holes and positioned shaped runs need a separate representation.                                          |
| `src/units/UnitQuiz.ts`, `gradeStroke.ts`                 | A gesture is checked against a next motor stroke and selected plan; guidance highlights the active stroke.                                            | Reusing this grader for another font would assess a different shape and invent unavailable order.                                      |
| `src/units/provider.ts`                                   | Immutable local packs use explicit IDs/aliases and NFC lookup; missing IDs fail.                                                                      | Source IDs are not automatically text, and existing lookup normalization is not a text-layout engine.                                  |
| `demo/multilingual/demo.js`                               | Clean model and source-sample views load old packs and expose animation/ordered quizzes.                                                              | Only a small subset has formal authored geometry; font selection does not exist.                                                       |
| `packs/generated`, data build/check tooling               | Latest recorded audit reports 149 packs and 8,720 models, including 92 original English/Korean print models; many Omniglot classes remain source IDs. | Counted models and source files cannot be reported as mapped font characters or language coverage. Recount at implementation baseline. |
| Persistence/package                                       | Old packs are reproducible on disk; core has no handwriting database and no runtime dependencies.                                                     | New font assets need separate manifests, integrity checks and reproducible delivery without a legacy migration.                        |

The preceding [textbook-model audit](../research/20260908-textbook-print-audit.md) establishes the existing scope and its evidence. Reuse its data boundaries; do not treat its mouse-driven engine verification as educational calibration for font practice.

## Target Rules

1. **The selected font owns the target.** A request is identified by original text, exact font-byte SHA-256, the supported single face at default axes, script, language, direction and shaping version. Future face/axis/feature controls must extend identity before being offered. Rendering and comparison receive the same immutable `FontShape`. There is no independent CSS text reference and no retained old motor grader.
2. **Coverage is an outcome of shaping.** A character-map inventory is useful for fast filtering, but success also requires supported input semantics, no missing glyph and nonempty visible geometry. If any required scalar or supported sequence is unavailable, return a structured error with its original source span. Do not replace it with a system font, another Noto face or a similar character.
3. **Text identity is explicit.** Keep the original string and UTF-16 source spans. Do not apply NFKC, compatibility-jamo folding, ad hoc Arabic presentation-form substitutions or source-ID guessing. Canonically equivalent forms must pass the relevant fixtures; if normalization is used internally, retain a tested map back to original input.
4. **Runs are bounded and contextual.** Accept 1–32 valid Unicode scalars in one catalog-declared script/direction run, including required combining marks. Spaces within an otherwise supported word/short run may be permitted; all-space text is not a practice target. Reject multiline text, malformed surrogates, mixed strong scripts/directions and bidi controls with a useful reason. ZWJ/ZWNJ may be explicitly allowed within supported Arabic/Indic contexts; they are not grounds for accepting arbitrary format controls. Variation selectors require explicit supported-sequence evidence or a clear unsupported result. Do not split a contextual word into per-code-point shaped glyphs.
5. **Actual ink bounds determine fitting.** Preserve baseline, ascender/descender metrics, advances, offsets and bearings; compute a complete ink bounding box including marks and overhangs. Fit the same target into SVG and Canvas with padding. Empty outlines, all-space/control-only requests and degenerate bounds fail before practice starts.
6. **All font faces have usable practice.** Trace shows a stable target; copy initially hides it. Pointer gestures, pen lifts and taps form the user's ink. Clear removes ink. Check reports unordered geometric comparison against the exact selected target. Replay plays only captured user ink and is labelled accordingly. Neither operation shows a suggested motor order, a next-stroke highlight, “wrong order”, or an instructional completion claim.
7. **Comparison is informational.** Initial `check()` reports target coverage and user alignment plus an overlay, using documented mask/tolerance definitions. It does not emit pass/fail, handwriting correctness, an accuracy percentage or automatic completion. Missing small components and extra ink must remain visible. A thin pencil inside a thick serif font is not expected to duplicate filled pixel area. Metrics are not calibrated pedagogy and do not borrow the existing stroke-grader leniency selector.
8. **A font change is a session boundary.** Changing font, input, script/language/direction or view increments a generation; abort old work, stop replay, discard old gestures and prevent stale callbacks from committing. A failed new load cannot leave a stale old target looking like the requested one. Cancellation, retry and destroyed-instance behavior are explicit and tested.
9. **Resize preserves meaning.** Store ink in target coordinates. Changing dimensions redraws target and ink through the same transform; cancel an active pointer gesture first. Comparison results are independent of CSS pixels and device-pixel ratio within the declared raster tolerance.
10. **Source samples retain their identities.** Each of the old 149 packs is classified with actual counts of explicitly mapped units, source-only units and unavailable font mappings. Mixed packs use per-unit records. Font practice exposes valid text samples; source-only IDs remain accessible as source samples. A font repertoire never backfills an unknown Omniglot label automatically.
11. **A font menu is truthful.** Show built-in compatible faces for the selected sample/run. Two genuinely different faces are offered where available; font names, status and supported script inventory come from manifests. An incompatible uploaded font reports missing input, and an empty target reports its own error. Font loading does not silently fall back.
12. **Legacy order lessons stay separate.** Existing clean models, KanjiVG and other supplied plans keep their existing renderer/grader and source labels. Their font-like appearance does not establish identity with a selectable real font. Future motor profiles must be bound to exact font/axes/form geometry and validated separately before enabling font-order actions.

## Decision Log

- **D1 — Separate `FontWriter` from `WritingUnit`.** Extend the product with a filled-shape surface. Rejected: treating contours, font hinting order or extracted skeletons as `motorStrokes`. The old schema deliberately requires temporal plans; preserving it prevents false capabilities and legacy regressions.
- **D2 — HarfBuzz plus its outline API.** One optional local adapter shapes and extracts glyph paths from the same font object. Rejected as the primary route: `opentype.js` alone without complete complex-script shaping; a second outline parser without demonstrated need; browser text snapshots whose font fallback and vector/export parity are hard to prove. [HarfBuzz.js usage](https://github.com/harfbuzz/harfbuzzjs) exposes glyph paths and positioned glyphs directly.
- **D3 — One contextual run, not a paragraph engine.** Support short single-script units/words with explicit catalog direction/language, either horizontal or one vertical column. Rejected: treating `guessSegmentProperties()` as bidi processing. Mixed runs fail clearly until a later separately tested itemization/bidi capability exists. [HarfBuzz's scope](https://harfbuzz.github.io/what-harfbuzz-doesnt-do.html) requires the caller to perform that layout work.
- **D4 — Exact vectors feed every surface.** A validated M/L/Q/C/Z path representation preserves filled outlines and holes. SVG, Canvas with `Path2D`, and the comparison mask consume it. FontWriter targets modern browsers with `Path2D`; construction fails explicitly when it is unavailable. Legacy Scribing browser behavior remains unchanged. Rejected: a CSS-only font switch with old stroke-model assessment.
- **D5 — Unordered comparison without correctness claims.** Trace/copy/check/own-ink replay work for every supported target, with continuous shape comparison rather than invented order. Rejected: pixel-IoU-only grading, automatic contour tracing demonstrations, or a disabled quiz presented as the sole form of practice.
- **D6 — Local optional assets and explicit coverage.** Prefer a pinned set of formal Noto/script-appropriate fonts, supplemented only with verified alternatives and local user TTF/OTF files. A second face is conditional on real availability. Preserve source-only classes and explain unavailable mappings instead of assigning guessed Unicode characters.
- **D7 — Immutable font identity.** Include font bytes and shaping inputs in identity/cache keys; future face/axis controls must extend the key before they are exposed. A source model can become a future font motor profile only by explicit registration and geometry validation. Similar-looking letters are not sufficient.

- **D8 — Correct vertical glyph orientation.** The initial raw-TTB proposal was corrected by independent audit: Mongolian and Phags-pa font glyphs require a clockwise rotation from their horizontal font orientation. Shape the contextual run LTR, rotate paths/origins/advances, and return final `ttb` layout. [CSS Writing Modes section 5](https://www.w3.org/TR/css-writing-modes-3/#intro-text-layout) specifies rotation for Mongolian/Phags-pa. Native HarfBuzz 14.4.0 comparison matched 78 horizontal fixture/font cases exactly; six raw-TTB cases differed in vertical metrics and did not establish correct glyph orientation. After the fix, 85 independent native cases passed (78 horizontal and 7 rotated vertical); all 7 vertical targets also matched independently extracted FontTools outlines and bounds, with 28/28 exact raster matches at 320/960 widths and DPR 1/2. Retain compact expected fixtures and normal regression tests in the repository; native tools are audit provenance, not runtime or normal-CI dependencies.

Independent debate endorsed D1/D2/D4 and required three corrections now incorporated: single-line input alone does not solve bidi; non-`.notdef` glyphs may still form a blank target; unordered mask metrics cannot establish valid handwriting and must not advertise automatic correctness.

## Open Questions

- **Q1: Which built-in faces and exact inventory?** The asset implementer supplies hashes, licenses, repertoire evidence and suitable defaults for lead approval. Default: verified formal script-specific Noto faces; distinct sans/serif or other appropriate formal alternatives where available. Do not block the runtime on a second face for every script.
- **Q2: HarfBuzz adapter build format and measured size?** The adapter implementer verifies version 1.6.1 or another explicitly pinned compatible revision. Default: a separate locally loaded shaping adapter/WASM asset that does not enter the core bundle. If the current package cannot be bundled by the old toolchain, produce a small separately built adapter; do not broadly upgrade the repository as a workaround.
- **Q3: Mask resolution and tolerance display?** Runtime implementer measures fixed canonical-mask resolutions against the fixture matrix; lead chooses a documented default before enabling Check. Default: 512 pixels on the longest target dimension, preserve aspect ratio, target-relative tolerances, report metrics without pass/fail. Record exact settings in verification evidence; no diagnostics UI is required.
- **Q4: Native writing validation and font-bound motor profiles?** No external review result is assumed. Default: use the label “font practice”; retain the remainder of order-sensitive font lessons as unavailable. A later profile project needs its own sourced trajectories, per-font geometry bindings and acceptance gate.

No open question requires another user permission request to perform the authorized implementation. If a correctness blocker changes the requested behavior, the lead records the concrete limitation and chooses or escalates the remaining product decision.

## Data Model

The lead froze this compact contract for implementation. Glyph paths contain only validated, finite SVG M/L/Q/C/Z path commands in native font units. The string is geometry, not SVG markup; it never embeds HTML or relies on a `Path2D` object. `x` and `y` are cumulative shaped glyph origins, including the glyph offsets, in the shared y-up target frame. `bounds` is the union of actual positioned ink extents.

```ts
interface FontShape {
  schemaVersion: 1;
  text: string;
  font: { id: string; name: string; sha256: string };
  script: string;
  language: string;
  direction: 'ltr' | 'rtl' | 'ttb';
  em: number;
  bounds: [number, number, number, number];
  glyphs: Array<{
    id: number;
    cluster: number; // original UTF-16 source index; not a motor step
    path: string; // actual filled glyph outline; native y-up coordinates
    x: number;
    y: number;
    advanceX: number;
    advanceY: number;
  }>;
}
```

The initial provider supports single-face TTF/OTF files at their default axes. Face/axis controls are not exposed in this release. Font IDs and byte hashes identify that exact face; any later collection/axis support must extend cache identity before it is offered. The adapter records its pinned shaping version in technical metadata/evidence, and computes internal shape identity from the entire validated target. For Mongolian/Phags-pa, `ttb` describes the final single-column layout. Shape the complete contextual run LTR, then rotate every glyph outline coordinate, origin and advance clockwise in y-up coordinates: `(x, y) → (y, -x)`. Recompute the union of transformed ink extents. `font.glyphToJson()` can supply command coordinates for this transform without an SVG parser. This is limited to one practice column, without page layout.

Glyph boundaries and clusters are layout information, never motor steps. A shaped glyph can represent several code points; several glyphs can share a cluster. The cluster mapping must retain marks, ligatures and reordering rather than assigning a fake one-to-one relationship; deriving half-open source spans must use the ordered distinct input cluster boundaries, not the next glyph array element in an RTL run. [HarfBuzz cluster documentation](https://harfbuzz.github.io/working-with-harfbuzz-clusters.html) describes these mappings.

Additional separately versioned assets:

- `fonts/assets.lock.json`: exact source URL/revision, file digest, license/notice path, face identity and reproduction information.
- `fonts/catalog.json`: offered faces and script/language/direction sample inventories, per-face validated samples/coverage, explicit source-to-text mapping evidence, and availability reasons. Do not report language count from Unicode blocks or source-pack count.
- `fonts/catalog.json` `sourceCoverage`: every old pack has exact mapped/source-only/unavailable counts and reasons; retain exact per-unit mappings where known, and account for unmapped source classes through explicit counts/reasons rather than guessed characters. Built-in font Unicode coverage remains distinct from mappings to old motor models. No duplicate coverage report is required.
- Optional serialized `FontShape` fixtures use schema version 1. Store shaping engine and font identity so fixture changes are deliberate.

`FontShape` validation accepts finite bounded plain JSON values and a validated path-command grammar. Reject unsupported versions, accessor/serialization hooks, malformed cluster/source indices, oversized command sets and inconsistent bounds. The adapter constructs valid objects; callers of `setShape()` receive the same safety checks and an immutable snapshot. No HTML or SVG markup is executed from font metadata.

## API / Contract Changes

Expose `Scribing.createFontWriter(target, options)` through the existing CJS, ESM and browser-global bundles. This factory constructs the modest dependency-free FontWriter class. Keep `extras/fonts/provider.mjs` and its local HarfBuzz JS/WASM completely separate: no provider import, initialization, font read or network request occurs through a legacy import. Do not add a restrictive package `exports` map that breaks existing deep imports. Measure and report the actual core bundle delta.

```ts
interface FontShapeRequest {
  text: string;
  fontId: string;
  scriptId: string;
}

function createFontProvider(options: {
  catalog: FontCatalog;
  scriptRanges: ScriptRanges;
  baseUrl: string;
  fetch?: typeof fetch;
}): {
  shape(request: FontShapeRequest, options: { signal: AbortSignal }): Promise<FontShape>;
  shapeCustom(
    request: { text: string; bytes: ArrayBuffer; name: string; scriptId: string },
    options: { signal: AbortSignal },
  ): Promise<FontShape>;
  destroy(): void;
};

interface FontComparison {
  kind: 'unordered-shape-comparison';
  shapeId: string;
  hasInput: boolean;
  targetCoverage: number; // 0..1, documented target-mask proximity coverage
  userAlignment: number; // 0..1, documented input-path alignment with target
  // No isCorrect, motor order, pass/fail or instructional completion field.
}

// Scribing.createFontWriter(target, options) returns this FontWriter.
class FontWriter {
  constructor(
    target: string | HTMLElement,
    options: {
      width: number;
      height: number;
      padding?: number;
      renderer?: 'svg' | 'canvas';
      referenceColor?: string;
      drawingColor?: string;
    },
  );
  setShape(shape: FontShape): Promise<void>;
  startTrace(): void; // show reference and start with fresh ink
  startCopy(): void; // hide reference and start with fresh ink
  showReference(): void;
  hideReference(): void;
  clear(): void;
  check(): FontComparison;
  replay(): Promise<void>; // captured user ink only
  cancel(): void; // cancel active gesture/replay; retain committed ink
  updateDimensions(options: { width: number; height: number; padding?: number }): void;
  destroy(): void;
}
```

The catalog provides script, language and `ltr`/`rtl`/`ttb` direction. The provider does not infer full bidi layout. Paths/positions are fully independent of renderer choice. Local asset paths in manifests are repository-relative (for example `fonts/assets/...`) and resolved against the explicit base URL.

`setShape()` stops old practice/replay and snapshots validated geometry. The demo/request controller owns the provider `AbortController` and generation around fetch/shape; `FontWriter` independently guards renderer/ink/replay work. If async shaping becomes a convenience method on the writer, it must preserve both guards.

`check()` operates only on the active shape and ink in target coordinates. Empty input produces `hasInput: false` with zero metrics. A tap remains valid input data but does not automatically complete a target. Caller-configurable input brush appearance cannot turn a giant brush into arbitrary target coverage; comparison uses its own documented target-relative geometry. Dense scribble, missing marks and excess strokes remain visual diagnostics, not claims of recognized handwriting.

The optional local-font registration adapter accepts TTF/OTF bytes, returns a font ID and validated metadata, and uses the same shaping path as built-ins. Initially accept a single supported face with default axes. Collections, WOFF/WOFF2, color/bitmap-only fonts and unsupported outline formats fail clearly unless they receive an explicit later capability. No `font-family` string is accepted as proof of font bytes.

## Migration Plan and Invariants

No old `WritingUnit`, source recording, generated pack, user handwriting database or ID is migrated. New font assets are additive. No raw handwriting/local-font persistence is introduced.

Forward steps: capture old generated-file hashes; add new versioned font assets, the factory and optional shaping provider; gate the new demo view; preserve existing views; enable the new default only after integration acceptance. Rollback: select the former demo default/remove the font view/provider assets and, if required, the additive factory. Old packages/data continue to work without font files or WASM.

Post-change checks: old pack/raw-data digests match the captured baseline; old pack count/ID set matches; every old unit is accounted for exactly once by known mappings or explicit source-only/unavailable counts; class source IDs have not become inferred text; every offered built-in face resolves to a verified file and notice; every successful FontShape has nonempty ink, complete span coverage for required input and no missing glyphs. No backfill or reindex is needed.

## Observability and Budgets

Record engine/adapter version, font hash, shape identity, script/language/direction, load/shape/path/mask timings, glyph/command counts, target dimensions and typed failure codes in verification evidence where the tests need them. No new diagnostics UI/API is required. Do not introduce default logging of raw handwriting or uploaded font bytes. User-visible errors explain missing text/font/input boundaries without requiring users to understand WASM or glyph IDs.

Initial implementation budgets, to measure on the named desktop browser/machine used for evidence:

- Input: 32 Unicode scalars; loaded local font file at most 32 MiB; shaped output at most 256 glyphs/100,000 path commands; target mask at most 512×512 initially; at most 64 input gestures and 8,192 retained input points before explicit bounded simplification/rejection. Revisit a limit only from a demonstrated supported-font need and repeat its tests.
- Font adapter plus its required WASM target: at most 2 MiB uncompressed excluding fonts, delivered only on font usage. Legacy loading must initialize/fetch no shaping code, font or WASM; record the modest FontWriter core-code delta and all measured compressed/uncompressed sizes. Font assets have measured per-face/package sizes rather than a misleading universal tiny-font budget.
- Warm ≤32-scalar shape plus path extraction: p95 ≤200 ms over the representative fixture corpus; Check p95 ≤100 ms. Record cold adapter/font loading separately. Run expensive adapter work in a cancelable worker if the measured path blocks input; bounded async chunks and generation checks are required around uninterruptible shaping calls.
- No stale commits across 50 alternating delayed font/input changes. After 100 create/load/trace/destroy cycles, listener/replay counters must return to their baseline. Observe and report heap behavior across repeated batches with the actual browser/GC method; do not promise a universal heap plateau or infer zero leaks from a screenshot.
- Zero external network requests after serving the complete offline assets, including first font load, switching, uploaded fonts and all demo views. Local HTTP asset requests are expected and reported separately.

## Work Items

### WI-001: Lock the font contract and adapter feasibility

- **Goal:** Prove one pinned optional dependency can produce accurate contextual geometry within the existing package/toolchain, and settle public schema/seams before parallel implementation.
- **Acceptance (measurable):** A disposable/local proof shapes and extracts paths from real Latin, Arabic and Indic font files; records glyph IDs, original source clusters, positions and nonempty outlines; rejects unsupported and empty targets. CJS/ESM/browser factory delivery and the separate browser/Node ESM provider are resolved without breaking legacy imports. Freeze schema, run validation, error reasons, font identity and limits from this plan. Independent debate reviews the proof and final interfaces before subsequent shared implementation.
- **Tests (first):** `src/fonts/__tests__/FontShape-test.ts` for schema/snapshot/size/source-span failures; `scripts/fonts/provider.test.mjs` for pinned font outputs, canonical-equivalence/context fixtures and ESM integration. New runtime test paths are proposed; existing `scripts/fonts/provider.test.mjs` is extended rather than duplicated. A temporary test harness must explicitly run any proof tests outside Jest's current `src` root.
- **Touched areas:** New FontShape/FontWriter runtime types and validator; `src/Scribing.ts` factory; optional adapter/build configuration; `package.json`/`rollup.config.js` only for additive build changes; final API and evidence notes in this plan.
- **Dependencies:** This plan, independent debate, at least three rights-cleared probe fonts; no deployment/account dependency.
- **Risks + mitigations:** Latest HarfBuzz package types may not parse with TS 4.1; isolate the adapter boundary and generated plain types. WASM has a distinct initialization path; test actual browser loading and offline resolution before freezing packaging.
- **Rollback:** Remove the additive proof/factory/provider while preserving baseline data and legacy behavior.
- **Priority / estimate / owner:** P0 / M / Astra High implementer; Astra Ultra lead decides and audits.

### WI-002: Build exact font assets, mappings and coverage reports

- **Goal:** Supply broad formal script coverage with local reproducible fonts and a truthful relationship to old source data.
- **Acceptance (measurable):** Recount all 149 baseline packs/8,720 models or explicitly record any changed baseline. The concurrent asset pass currently reports 139 local fonts and 120 catalog entries (176.6 MB total); verify these counts and sizes in the delivered evidence. Every pack receives exact mapped/source-only/unavailable counts and reasons with per-unit mappings/provenance where known; source-only accounting does not invent missing mappings. Every mapped target either shapes successfully with a declared built-in face or has an explicit missing-font record. Font faces have verified file hashes, source revisions/URLs and notices; offer two different formal faces where available. Catalog samples include supported short words/clusters for contextual scripts. Same locked inputs reproduce catalogs/digests; all old raw/generated pack hashes remain unchanged. Do not count unknown classes as typed characters.
- **Tests (first):** `scripts/fonts/check-assets.mjs` and catalog tests in the explicit font runner for classification completeness, collisions, missing files/notices and actual distinct-face identity; `scripts/fonts/provider.test.mjs` for non-`.notdef`/nonempty sample shaping and explicit unavailable paths; existing data reproducibility tests remain required.
- **Touched areas:** `scripts/fonts/`, `fonts/assets.lock.json`, `fonts/catalog.json` with `sourceCoverage`, local font files/notices and the catalog sourceCoverage field; reference old pack data read-only. Exact organization is finalized with asset owner.
- **Dependencies:** WI-001 identity/validation contract; asset research can run concurrently before the full adapter is implemented.
- **Risks + mitigations:** Font cmap coverage overstates sequence support; shape every advertised fixture. Noto script family names do not establish old-class mappings; retain source-only status. Large CJK fonts stay optional/local and are measured separately.
- **Rollback:** Remove only new font assets/catalog; old packs are byte-preserved.
- **Priority / estimate / owner:** P0 / M / Astra High available implementer (routine scope; Medium preferred when capacity permits); lead approves any uncertain mapping/font decision.

### WI-003: Implement FontWriter rendering and unordered practice

- **Goal:** Render exact shaped paths in SVG/Canvas and provide identical trace/copy/check/own-ink replay semantics for every FontShape.
- **Acceptance (measurable):** Both renderers consume the same validated path geometry and transform; the comparison raster uses `Path2D`. Constructor validation explicitly rejects browsers without `Path2D`, while legacy behavior stays intact. The check target uses that same shape object/digest. Counters/holes, detached marks and overhangs are visible and unclipped at widths 320 and 960 with DPR 1 and 2. Trace/copy/clear/check/replay/cancel/destroy work with taps and pen lifts. Check exposes only unordered metrics, handles empty input, highlights missing small marks/extra ink, and never reports motor order or correctness. Resize preserves target-coordinate ink; cancellation clears active gestures/replay safely. The 32-scalar and mask/ink limits are enforced and timed.
- **Tests (first):** `src/fonts/__tests__/FontWriter-test.ts`, `FontRendering-test.ts`, `ShapeComparison-test.ts`, `FontLifecycle-test.ts`; shape/ink fixtures include Latin `i`, `j`, `B`, `8`, `a`, `g`, Arabic dots, Indic marks, blank/tiny-dot/extra-stroke/dense-scribble inputs and nonfinite geometry. Render parity compares interior masks after excluding a declared ≤1-physical-pixel antialias boundary band; remaining interior mismatch must be zero for test fixtures.
- **Touched areas:** New `src/fonts/FontWriter.ts`, geometry/positioning, SVG/Canvas target adapters, input/session controller, shape comparison and replay. Shared old renderer helpers may be reused only if legacy tests prove unchanged semantics.
- **Dependencies:** WI-001 contract and representative WI-002 assets.
- **Risks + mitigations:** A scalar metric can reward dense scribble or penalize thick-font differences; keep feedback informational, show actual overlay and document metric meaning. Bound input processing and avoid one DOM element per input point.
- **Rollback:** Remove/disable the additive font factory/view; legacy runtime remains available.
- **Priority / estimate / owner:** P0 / L / Astra High runtime implementer.

### WI-004: Implement the local shaping provider and font switching

- **Goal:** Turn exact built-in/uploaded font bytes into complete contextual FontShapes with no fallback and no stale work.
- **Acceptance (measurable):** Use the same HarfBuzz font object/default axes for shaping and path extraction. Support declared one-script runs ≤32 scalars with catalog script/language/direction. Arabic joining/ligatures and Indic reordered/conjunct forms preserve whole-run shape and original source spans. Mongolian/Phags-pa use the D8 LTR-shape/clockwise-rotation transform and match independent rotated native references for origins, advances, outlines and final bounds. Reject missing glyphs, unsupported mixed direction/script, invalid/empty input, unsupported variation sequences, unsupported formats and oversized files with typed useful errors. Local TTF/OTF registration follows the same code path, stays in memory and never sends bytes externally. Request abort/generation prevents late fetch/WASM/shape results or callbacks from replacing the selected target. Bound/destroy adapter objects and workers.
- **Tests (first):** `src/fonts/__tests__/FontProvider-test.ts`, `FontRunValidation-test.ts`; `scripts/fonts/provider.test.mjs` and retained independent reference fixtures cover Latin NFC/NFD, Arabic isolated/joining/lam-alef/marks, Devanagari pre-base marks/conjuncts, Bengali/Tamil/Thai/Tibetan mark placement, Hangul NFC/NFD and CJK locale variants where faces exist. Mixed Arabic+Latin or Arabic+European digits are negative cases this release. Use pinned `hb-shape` or independently generated pinned HarfBuzz reference results for glyph IDs/positions; canonical output round-trips alone are insufficient.
- **Touched areas:** Optional `font-shaping` adapter, worker/local-font loader, request/run validator, font caches and source-span conversion; `extras/fonts/provider.mjs` and separate adapter/WASM packaging.
- **Dependencies:** WI-001 and WI-002; can proceed independently of WI-003 after interface freeze, but the current available High agent executes both under the documented capacity constraint.
- **Risks + mitigations:** HarfBuzz clusters are not one code point per glyph; test ligatures and reordered marks. `.notdef` checks miss default-ignorable/empty-output issues; validate input semantics and final ink independently. An aborted sync WASM call may finish internally; discard its generation and avoid blocking UI through bounded worker use.
- **Rollback:** Disable provider/font registration; serialized FontShape tests and old lesson providers remain usable.
- **Priority / estimate / owner:** P0 / L / Astra High adapter implementer.

### WI-005: Integrate usable font practice and preserve stroke lessons

- **Goal:** Make formal selectable fonts the useful default demo, with honest capabilities and recovery paths.
- **Acceptance (measurable):** Add Font practice, Stroke lessons and Source samples views. Each supported script offers mapped text samples and compatible real faces, two where available, plus local TTF/OTF selection. Changing face changes the target geometry and comparison target; a known contrasting `a`/`g` fixture proves actual form change. Trace/copy/check/clear/replay are active and useful for every selectable face. Motor animation and next-stroke quiz stay exclusive to explicit existing lessons. Busy/error/retry states cannot present a stale old face as the requested one. A font/view change cancels active and queued provider/practice/replay actions. At 320px and desktop sizes, controls remain usable and errors show the unavailable text/reason. Original source-only classes remain accessible without being exposed as inferred text.
- **Tests (first):** Extend `scripts/check-multilingual-demo.cjs` or add `scripts/check-font-demo.cjs` with real browser font switching, local file selection, trace/copy gestures, DPR/resize, delayed-load races, negative inputs, keyboard focus and old-view regression checks. Add DOM/unit tests only where they verify meaningful state transitions rather than duplicate markup.
- **Touched areas:** `demo/multilingual/index.html`, `demo/multilingual/demo.js`, demo styles, `docs/multilingual.md`, README entry links and package example imports.
- **Dependencies:** WI-002 through WI-004. Asset discovery and copy can proceed earlier using frozen schema.
- **Risks + mitigations:** “Replay” can be mistaken for a model demonstration; label it “Replay my writing.” Percentages can be mistaken for correctness; label them by the actual shape metric and avoid pass/fail/completion language. Keep old stroke-plan details only in their relevant view.
- **Rollback:** Restore previous default view and hide font-practice feature while leaving existing lessons/source samples intact.
- **Priority / estimate / owner:** P0 / M / Astra High available implementer (routine scope; Medium preferred when capacity permits).

### WI-006: Independently audit and close the acceptance loop

- **Goal:** Verify the delivered behavior, bundle boundaries and evidence against this plan; fix findings and re-audit before claiming completion.
- **Acceptance (measurable):** All listed package/runtime/data checks pass. Test actual packed CJS/ESM/browser font-factory consumers, the optional ESM provider, and unchanged legacy consumers; no font/WASM dependency is loaded by a legacy page. Complete script/font fixture coverage, vector/mask parity, lifecycle, offline and user-upload evidence. Record per-face sizes and measured timing/memory budgets. Independently inspect glyph/contact sheets and interactive practice for representative contextual scripts; distinguish engineering rendering review from native instructional approval. Every finding has a fix and re-audit result or a clearly stated external blocker/remaining criterion. No release claim says all 149 packs are mapped or all fonts have motor lessons.
- **Tests (first):** `scripts/check-font-package.cjs`, `scripts/check-font-offline.cjs`, `scripts/bench-fonts.cjs` and the verification harnesses from earlier WIs. Confirm deliberately failing font tests fail the invoked gate so tests outside `src` cannot be silently omitted.
- **Touched areas:** Package checks, evidence/report files under `dev-docs/research/`, necessary narrowly scoped fixes delegated back to owners, this plan's acceptance status.
- **Dependencies:** WI-001–WI-005, a separate audit/debate agent; no educator approval is required for the limited font-practice capability claim.
- **Risks + mitigations:** Engine self-matching and screenshots are insufficient evidence; use independent shaped references, genuine pointer traces, delayed races, adversarial input and packed/offline consumers. Do not expand into educational accuracy studies to label informational shape comparison.
- **Rollback:** Withhold the new default/capability, pin prior fonts/adapter or disable the affected face. Preserve legacy operation and enumerate the remaining acceptance criteria.
- **Priority / estimate / owner:** P0 / M / independent auditor plus Astra Ultra lead; fixes use the available High implementer under the current agent-capacity constraint.

## Gap-to-Work-Item Map

| Gap                                                                | Owner work items                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| Filled fonts cannot be represented as motor-stroke units           | WI-001, WI-003                                          |
| Exact cross-script shaping/path extraction and original-text spans | WI-001, WI-004                                          |
| Unmapped source IDs and unknown formal-font coverage               | WI-002                                                  |
| Font display differs from practice geometry                        | WI-003, WI-004, WI-005                                  |
| Selectable faces/local files, cancellation and recovery            | WI-004, WI-005                                          |
| Missing offline asset/package and renderer parity evidence         | WI-006                                                  |
| Exact per-font instructional order profiles                        | Explicit remainder; later separately planned capability |
| General bidi paragraphs, mixed-script layout, OCR                  | Out of scope for this release                           |

## Ordering and Coordination

WI-001 freezes the interfaces and proves the risky adapter assumptions. WI-002 asset research starts concurrently and then conforms to those interfaces. WI-003 runtime and WI-004 adapter share frozen fixtures and explicit file ownership. The current orchestrator has a hard four-agent limit including completed agents, so the available Astra High implementer executes assets, runtime, adapter and demo work sequentially or with useful local concurrency; the lead and debate agent remain separate from source implementation. This is an explicit capacity constraint, not permission to silently change agent effort. WI-005 integrates their results. WI-006 independently audits the implementation; fixes return to the responsible implementer and are re-audited.

S/M/L indicate relative implementation scope, not an elapsed-time promise. Runtime/shaping are cross-cutting High tasks; manifest/demo work is ordinarily bounded Medium work. Under the current agent-capacity constraint, the existing High implementer may also perform those routine tasks; no new Medium agent is assumed available. The lead decides architectural changes, approves measured departures from budgets and retains the final acceptance ledger. Keep independent debate separate from implementation ownership.

## Testing Procedures

Write the named contract/state/geometry tests before the corresponding implementation. Register new font data/adapter tests outside the existing Jest `src` root in an explicit runner. Use deliberate-failure checks once to prove each new gate actually discovers them. Do not invent tests for documentation-only edits.

Current required gates after shared/package changes:

```sh
yarn install --frozen-lockfile
yarn typecheck
yarn lint-test
yarn test --runInBand
yarn build
yarn check-demo
yarn check-package
yarn test-data
yarn check-data
yarn check-data-reproducible
yarn check-multilingual-demo
```

The following are proposed command roles; align them with existing `scripts/fonts/provider.test.mjs` and `scripts/fonts/check-assets.mjs` rather than adding duplicate runners. Record the actual final command names and run them in the integration gate:

```sh
yarn test-fonts
yarn check-fonts
yarn check-font-package
yarn check-font-demo
yarn check-font-offline
yarn bench-fonts
```

`test-fonts` runs new adapter/catalog/fixture tests; `check-fonts` validates all manifests/font hashes/mappings and advertised sample shaping; `check-font-package` tests actual tarball entry points and legacy isolation. Record the resolved command names in the evidence report. Rebuild before browser verification. Run targeted tests during each WI, the full gates when their shared changes are complete, and repeat only for new edits/failures/unresolved concerns.

Minimum fixture matrix: Latin upper/lowercase including contrasting `a`/`g`, `i`/`j` dots and NFC/NFD accents; Arabic contextual joining, nonjoining boundary, lam-alef and marks; vertical Mongolian/Phags-pa single-column fixtures where offered; Hebrew marks/final forms; Devanagari `कि`, conjuncts and marks; Bengali/Tamil/Thai/Tibetan examples from supported catalog faces; Hangul syllables versus decomposed jamo; locale-appropriate Chinese/Japanese/Korean CJK forms. Include unsupported scalar, mixed-direction run, unmatched surrogate, unsupported variation sequence, blank/all-space target, 32/33-scalar boundary, zero/NaN dimensions, damaged font and oversized font/geometry.

Compare paths/glyph IDs/positions against independently obtained pinned HarfBuzz references; inspect actual rendered text against known font specimens where available. A test in which one adapter output is compared only to itself does not verify shaping. Font coverage evidence is per manifest/sample, not a claim that all Unicode sequences were exhaustively checked.

## Rollout Plan

1. Add the font factory/contracts and optional adapter/assets while the old demo remains default. Publish no motor-order capability for fonts.
2. Enable the font view locally for fixture, interaction and offline gates. Correct face-selection, unsupported-input and cancellation failures before switching the default.
3. Set Font practice as default after WI-006 acceptance. Keep Stroke lessons and Source samples directly reachable.
4. Document exact built-in face/script coverage and all old-pack mapping outcomes. State that user-provided fonts must support the selected input and formats.
5. If shaping corruption, missing required marks, mismatched target/mask, silent fallback, stale session updates, lost legacy behavior or invalid asset provenance is found, disable the affected face/capability or revert the demo default. Re-enable only after a fix and independent re-audit.

This rollout does not publish npm packages, push deployment changes or claim instructional certification. Future strict font-bound motor profiles are a separate capability with exact font/form binding, sourced movement plans, geometry checks and their own reviewed acceptance evidence.

## Plan → Verify Handoff

| Work item | Required evidence                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WI-001    | Final schema/API diff, pinned adapter/license record, actual toolchain/browser proof, cluster/path fixtures, independent debate outcome.                                                                            |
| WI-002    | Locked font files/notices and byte sizes, complete old-pack accounting and known per-unit mapping report, per-face sample coverage, exact missing/source-only counts, reproducibility and old-pack hash comparison. |
| WI-003    | SVG/Canvas frames and mask parity, pointer/tap/copy/replay demonstrations, comparison semantics/adversarial examples, lifecycle and timing logs.                                                                    |
| WI-004    | Independent shaping-reference comparisons, Unicode/run-validation matrix, user-file/no-network proof, delayed load/shape cancellation and cache identity tests.                                                     |
| WI-005    | 320px/desktop captures and real interaction results, actual contrasting-font geometry changes, useful error/retry/keyboard states, preserved old views.                                                             |
| WI-006    | Full command logs, actual packed consumers, offline request log, baseline data/bundle evidence, measured budgets and independent findings/fix/re-audit ledger.                                                      |

Keep source fixtures, generated shaped references and evidence provenance distinct from recorded learner input. Keep independent native position/FontTools outline expectations under `scripts/fonts/fixtures/` through the High implementer; the original generation scripts and raw scratch output may remain under `work/`. A completed acceptance ledger must state exact supported font practice coverage and the remaining unavailable arbitrary-font motor-order capability.

## Manual Test Checklist

- [x] Font practice opens with an actual formal font and usable Trace/Copy actions.
- [x] Switching two contrasting fonts changes the real `a`/`g` target and its comparison shape.
- [x] Arabic words join contextually; Indic marks/conjuncts and supported Thai/Tibetan marks remain positioned and unclipped.
- [x] Dots, accents, holes and CJK locale forms survive SVG and Canvas at narrow/desktop sizes.
- [x] Trace, Copy, Clear, Check and Replay my writing work across the selectable faces without suggesting a motor order.
- [x] Missing dots and extra ink are visible in comparison; no metric is presented as handwriting correctness.
- [x] Unsupported/mixed/blank input and incompatible local fonts give clear recoverable errors without fallback.
- [x] Rapid text/font/view changes, resize, stop and destroy leave no stale target, ink, replay or callbacks.
- [x] Local built-ins and local font selection work with no external network requests.
- [x] Existing Chinese behavior, supplied stroke lessons and all source samples remain available with original identities.
- [x] Coverage reports distinguish mapped typed text, source-only IDs, missing fonts and explicit motor-plan coverage.

## Final Acceptance Record — 2026-09-08

WI-001 through WI-006 are accepted for the explicit font-practice scope. Independent architect and debate audits have no remaining findings. Final verification: 329 Jest tests/30 suites/15 snapshots; 19 data tests; 498 reproducible old artifacts; 139 font locks; 10,765 inventory cases; 13,520 mapped-text cases including the two expected U+27491 failures; 85 native shaping fixtures; 28 independent vertical raster fixtures; all 120 entries in both renderers; 50 delayed switches and 400 committed-ink lifecycle cycles. Typecheck, lint, build, Chinese/ordered/formal browser gates and actual packed consumers passed. New font gates are wired into CI; hosted CI was not run.

Resolved command names are `check-fonts`, `test-fonts`, `check-font-demo`, and the extended `check-package`; offline, renderer and lifecycle checks are covered by these and independent lead probes, without duplicate public command names. Modern Path2D support is required. Root measured minified core growth +15,434 bytes (+5,034 gzip), separate adapter/vendor 557,387 bytes, and optional font assets 176,584,688 bytes. Warm 32-scalar / 8,192-ink-point shaping p95 ≤4.1 ms and comparison p95 ≤5.6 ms in the local representative probes.

The user-facing verification report records exact coverage:139 fonts, 120 script/language entries, 36 with multiple built-in faces; 100 exact-text packs, 39 replacement inventories and 10 unmapped packs. Arbitrary-font motor order, paragraph bidi and undocumented source-class mappings remain explicitly unavailable. No commit, push or release was performed.
