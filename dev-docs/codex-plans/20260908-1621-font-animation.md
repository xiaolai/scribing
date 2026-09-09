---
title: 'Restore animation in the formal-font workflow'
created_at: '2026-09-08 16:21 Asia/Shanghai'
mode: 'full-plan'
status: 'Accepted: advancing contours, junction geometry, and responsive attachment verified'
baseline: 'Existing uncommitted typographic-writing implementation; preserve all prior work'
supersedes: 'The animation exclusion in 20260908-1447-typographic-writing.md'
---

## Outcomes

Xiaolai expects the formal-font workflow to retain animation. Moving animation to a different old-model page and offering only trace/copy for the selected font failed that intent. Correct the main workflow now: every valid selected font shape has an animation action: **Animate strokes** for fully source-adapted plans and **Reveal shape** for generated or mixed plans, the selected font is the animated target, and changing font rebuilds the guide for that exact new shape. The initial English A visibly follows its supplied three-stroke plan, with both diagonals starting at the apex.

There are two honest origins for animation geometry/order:

- **Source-adapted stroke order:** an existing explicit motor plan is registered to a compatible selected font form, preserving its stroke count, direction and ordering. The data source and adaptation are recorded. It remains a selected source convention, not a claim of universal instructional correctness.
- **Generated drawing guide:** the actual font ink is thinned into centerlines, organized into graph trails and given a deterministic drawing sequence. This provides a real moving drawing guide, including on scripts without mapped motor data. It is clearly labelled as generated and is never described as verified handwriting order.

A multi-unit target can contain both origins and reports that mixture. Verified source absence or font-form incompatibility permits Reveal shape. Source-loading failures must stop guide preparation and offer Retry; they must never silently substitute a generated sequence. Contour traversal, left-to-right wipes, an arbitrary mask sweep and a final catch-up fill are not substitutes for a drawing guide.

Keep the exact final font outlines, current font selection and local-font support, SVG/Canvas parity, tracing/copying/checking/own-ink replay, honest coverage and the existing Chinese/ordered/source-sample workflows. Source-only Omniglot IDs remain source-only; generated Unicode font guides do not establish their identities.

## Constraints & Dependencies

- Work in `/Users/joker/github/xiaolai/myprojects/scribing`; the substantial preceding work is uncommitted. Preserve it, the untracked `AGENTS.md`, old generated packs and unrelated user files.
- The lead and architecture/debate agents remain Astra Ultra for planning, decisions and audit. The existing Astra High implementer owns source changes. The orchestrator's four-agent lifetime limit means another implementation agent is not assumed available.
- Core exposes the existing `Scribing.createFontWriter` facade. Keep HarfBuzz, source loading and skeleton generation in optional `extras/fonts/` modules; legacy imports initialize/fetch none of them. Measure the modest consumer/playback core delta.
- Modern font-mode browser requirements remain Path2D, Canvas, Pointer Events and the existing optional provider requirements. No fallback SVG parser, machine-learning runtime, network service or framework is added.
- `FontShape` remains exact selected-font geometry, with the prior corrected Mongolian/Phags-pa LTR-shape/clockwise-rotation behavior. Font shaping and animation preparation are separate cancellable stages.
- Source inventory currently available: English textbook 52 letters; Korean textbook 40 standalone jamo; Japanese KanjiVG packs 6,636 unique text units across 94 packs; offline `hanzi-writer-data` 2.0.1 contains 9,574 Chinese median plans. These are available source counts, not guaranteed source-adaptation pass counts.
- The optional Chinese medians asset contains 9,574 records from version 2.0.1; the final JSON wrapper is 6,522,643 bytes with SHA-256 `b1df0c1b058f206833048b6fd48d7b1836020baf551b4dacc412c1298133caef`. Retain its Arphic Public License notice. Other motor data keeps its existing terms; no core MIT relicense is implied.
- All source and guide preparation remains local/offline after the complete assets are served. No normal build or check downloads missing data automatically.
- The main font catalog still has 120 script/language entries and 139 built-in faces. Their valid target coverage is the baseline for generated-guide coverage. Do not replace these counts with a claim that every language has sourced motor order.

## Current Behavior Inventory

| Area                                            | Current behavior                                                                                       | Required change                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/fonts/FontWriter.ts`                       | Exact outlines, trace/copy, informational shape comparison and replay of user ink; no model animation. | Attach exact-shape-bound guides and animate their actual drawing paths in this surface.                                                           |
| `src/fonts/validateShape.ts`, `pathGeometry.ts` | Validate/canonicalize geometry and derive safe bounds.                                                 | Use the writer's immutable canonical shape and one shared identity helper for preparation; raw provider bounds must not create identity mismatch. |
| `extras/fonts/provider.mjs`                     | Local font shaping, strict script/input checks, exact paths, corrected vertical rotation.              | Preserve this behavior; animation consumes its canonicalized result.                                                                              |
| `demo/multilingual/fonts.mjs`                   | Loads formal fonts and manages trace/copy/check/replay; ordered-model page is separate.                | Add prominent Animate, guide preparation/state/provenance, speed/restart/cancel, and same-font source adaptation.                                 |
| `src/units/`, old `packs/generated`             | Explicit ordered centerlines/dots/plans and source identities.                                         | Read existing data as optional motor sources; do not rewrite the old engine or old packs.                                                         |
| Font package/data boundary                      | Lightweight core plus optional shaping adapter; large fonts outside npm core.                          | Keep animation/source assets optional and retain their own notices and delivery instructions.                                                     |
| Practice limits                                 | 64 gestures/8,192 points.                                                                              | Raise to explicit 1,024 gestures/65,536 points for the existing 32-scalar input envelope and benchmark comparison at that limit.                  |

## Target Rules

1. **Animate stays in the selected-font workflow.** Once any valid FontShape is loaded, preparation produces a bounded source-adapted or generated guide. Preparation can show progress; failures are recoverable errors, not a permanently missing control. The valid built-in inventory must pass the preparation gate before claiming completion.
2. **Bind preparation to the canonical target.** Get the immutable validated shape from FontWriter and compute its key with the same helper the writer uses. The key includes exact text, font-byte hash, script/language/direction, glyph IDs, positions, paths and canonical bounds. FontWriter rejects a descriptor for any other shape before changing state.
3. **No invented instructional order.** Source chronology is used only after registration/form compatibility passes. Generated trails explicitly have generated provenance. Font contours, glyph IDs, Unicode code-point ordering or skeleton edges are never described as handwritten stroke order.
4. **Source registration preserves movement.** Start with source geometry converted to y-up coordinates and aligned to the target's actual ink frame. Preserve ordered source strokes, pen lifts, directions and dots. Match/project toward the target centerline only within documented geometric bounds; verify coverage, endpoint/direction plausibility and form/topology compatibility. Every consecutive projected segment must stay within the target ink's documented raster tolerance; independent nearest-point projection cannot create a pen-down jump across empty space. A failed or uncertain match falls back to a generated guide with an explicit reason. Serif terminal branches may be omitted from the registration frame and assigned to the corresponding source body stroke during reveal; they must remain in the exact visible target.
5. **Allographs are not silently warped.** The authored single-storey a/g cannot simply supply instructional order for a two-storey font. Named allograph differences require a compatible alternative motor model or generated provenance. Script/locale compatibility is required: Chinese medians do not automatically become Japanese, Korean or other regional plans just because Unicode text matches.
6. **Default A and its font switch are explicit gates.** Both bundled Noto Sans A and Noto Serif A must demonstrate three adapted strokes: apex→bottom-left, apex→bottom-right, then left→right crossbar. A switch between these compatible allographs must retain that source chronology. The source plan is not reordered to make a skeleton traversal simpler, and allograph thresholds are not globally weakened to compensate for serif terminals.
7. **Prepare at useful local resolution.** Use em-based tiles for shaped glyphs/clusters at approximately 256 pixels/em, adapting downward only to obey the total budget. Never shrink a 32-character run to the old 192-pixel whole-target comparison mask. Group glyphs when marks/ligatures/connected geometry require it. Tiles retain the glyph indices they clip; a tile must not reveal neighboring glyphs by clipping against the entire run indiscriminately.
8. **Generated paths follow the ink interior.** Rasterize actual filled outlines, apply topology-preserving thinning, collapse clusters of junction pixels, retain detached components, and turn degree-two chains into trails. Prefer smooth continuation through junctions, use deterministic starts for loops and defined dot handling. Short-spur cleanup cannot erase a detached dot/diacritic or an entire connected component, including a tiny vector component whose eight-bit raster alpha rounds to zero. Identify compact dots from their original ink component, not solely from a one-point skeleton. Within one generated cluster, substantial body components precede small detached marks; similarly sized components keep a deterministic spatial order. This generated convention does not alter any source chronology. Use a separate distance transform if stroke width/radius is needed; a highly branched mathematical medial axis is not required.
9. **Allocate visible ink before playback.** Every target-ink cell receives one owner stroke and a longitudinal progress value derived from a nearby path segment. Ownership prevents a broad reveal brush from exposing future branches at crossings. Coverage must include small marks and antialiased boundaries. Playback clips the revealed cell mask by the original exact glyph outlines, so cell resolution does not redefine the final font silhouette.
10. **No catch-up fill.** Visible foreground grows monotonically along the guide. At the end of the last step, the mask already covers the exact target; a final “show everything” jump cannot hide missing ink, unassigned components or a poor registration. Dot strokes reveal locally around their centers rather than traversing an outline contour.
11. **Text order and shaping order remain distinct.** For independent generated clusters, sort by original logical cluster indices rather than blindly following the HarfBuzz visual glyph array, including RTL. Keep the contextual shaped positions unchanged. Source plans for full words/clusters can override this only when explicitly supplied. Do not advertise a character-by-character generated Arabic guide as an instructional word-level pen-lift model.
12. **Changing font cancels the old guide.** Font/text/script/view changes abort preparation, invalidate descriptors/callbacks, stop playback and clear old active ink. Cancel, replay cancellation, restart, resize and destroy have defined state behavior. A stale asynchronous source fetch or skeleton result cannot attach after a newer shape.
13. **Existing practice stays useful.** Model Animate and Replay my writing remain distinct controls. The user can trace/copy the same current font before or after animation. Shape comparison stays informational; generated guide ordering does not become a hidden strict grader.
14. **Coverage/provenance is reportable.** Report exact counts of source-adapted, generated, mixed and failed preparation targets by script/font/source, plus rejection reasons. Font availability, generated-guide availability and source motor-plan coverage remain different facts.

## Decision Log

- **D1 — Repair the main workflow.** The previous decision to leave font animation unavailable is superseded. An old-model link alone does not meet the user's intent.
- **D2 — Two origins, one Animate action.** Use compatible supplied chronology when available; otherwise generate actual centerline drawing guides with transparent provenance. Rejected: pretending generated order is instructional, or removing animation when a reviewed motor source is absent.
- **D3 — Exact outlines plus owned reveal masks.** Keep the existing font paths as final ink and use a precomputed stroke-owner/progress map for visibility. Rejected: whole-glyph wipes, font-contour traversal and wide stroke brushes that reveal later branches early.
- **D4 — Thinning and graph trails.** Prefer topology-preserving skeleton thinning for fewer spurious branches, with a separate distance transform for radius information. [The scikit-image skeleton example](https://scikit-image.org/docs/stable/auto_examples/edges/plot_skeleton.html) distinguishes skeletonization from medial-axis branches; it is an algorithm reference, not a runtime dependency.
- **D5 — Strict source adaptation.** Explicit source order is valuable but text identity alone does not prove a compatible form. Preserve source counts/directions and reject mismatched a/g/locale forms rather than relabelling a generated result as supplied.
- **D6 — Optional preparation, modest playback core.** `extras/fonts/animation.mjs` owns raster/skeleton/source work. FontWriter consumes a bounded descriptor and clips its masks against exact paths. Typed arrays are in-memory/transferable data, not a claim that the descriptor is JSON serializable.
- **D7 — Canonical identity and real text limits.** Prepare from the writer's validated snapshot/shared key, not raw provider bounds. Expand ink storage to 1,024 gestures/65,536 points so long supported targets do not fail at the old single-character gesture cap.
- **D8 — Register the body, retain font terminals.** Independent probes found that fitting source A endpoints to the full serif skeleton extrema pulls its diagonals toward serif tips; Noto Serif A then fails the existing distance gate despite matching topology. Fit the body/trunk within bounded constraints and keep the terminal ink in reveal ownership. A separate Japanese 永 probe found a snapped source segment crossing empty space, so continuity is an explicit acceptance test rather than an assumption from nearest-point distance.
- **D9 — Three bounded Korean composition pilots.** Unicode-check 가=ㄱ+ㅏ, 한=ㅎ+ㅏ+ㄴ and 글=ㄱ+ㅡ+ㄹ, and register actual font-ink regions in initial→vowel→coda order. A component that passes retains its existing jamo source plan; a failed component uses generated provenance and the target reports mixed origin. The contextual curved ㄱ and the vertical top mark of Noto Sans 한's ㅎ must not be forced into an incompatible authored model. This pilot does not establish coverage of all 11,172 modern syllables. Locate 글's actual wide horizontal ㅡ band before region cuts so a connected font form does not leave a blank vowel region.

The independent debate agent agreed with the two-origin route and required per-glyph/cluster resolution, full disconnected-component coverage, explicit allograph rejection, local monotonic reveal, logical RTL sequencing and stale-result cancellation. The lead approved this architecture and implementation has started with Astra High.

## Open Questions

- **Q1: Source-registration thresholds and allograph exceptions.** Lead chooses from measured positive/negative fixtures. Default: conservative acceptance, explicit generated fallback. Source-profile pass counts must come from the resulting report, not source inventory counts.
- **Q2: Exact trail smoothing/iteration limits.** High measures representative dense/thin/long targets, and the lead approves bounded defaults. Default: preserve geometry/topology and yield during preparation; do not simplify away complete components to hit a timing target.
- **Q3: Small API naming refinements.** Implementer can align names with existing FontWriter style while preserving this contract. Record the final names before verification; do not create duplicate APIs solely to match proposed names.

These are implementation decisions already authorized by the user. They do not require another user confirmation before useful work proceeds.

## Data Model and API / Contract Changes

The frozen descriptor is bound to the current canonical shape. Source provenance is per stroke so mixed targets remain honest.

```ts
interface FontAnimation {
  schemaVersion: 1;
  shapeKey: string;
  provenance: 'source-adapted' | 'generated' | 'mixed';
  strokes: Array<{
    id: string;
    points: [number, number][]; // canonical FontShape coordinates, y-up
    kind: 'curve' | 'dot';
    provenance: 'source-adapted' | 'generated';
    source?: { packId: string; unitId: string; planId: string; strokeId: string };
  }>;
  tiles: Array<{
    glyphIndices: number[];
    bounds: [number, number, number, number];
    width: number;
    height: number;
    owners: Uint16Array; // 0 = outside; otherwise global stroke index + 1
    progress: Uint16Array; // 0..65535 within that owner stroke
  }>;
}

prepareFontAnimation(canonicalShape, {
  signal, sourceLoader, pixelsPerEm: 256, maxCells: 2097152
}): Promise<FontAnimation>;

// FontWriter additions; exact getter/helper names may follow existing style.
writer.getShape(); // immutable validated canonical snapshot
writer.setAnimation(descriptor);
writer.animate({ speed: 1, loop: false }): Promise<void>;
writer.cancel(); // also stops model animation
```

The shared shape-key helper uses the canonical snapshot returned by the writer. Validate/copy descriptor arrays before installing them, and prevent caller mutation after attachment from changing playback. Bounds, point coordinates, glyph references, owner references and progress values must be finite/in-range; array lengths equal width×height. Every descriptor tile clips only its declared glyphs. Reject malformed or wrong-shape descriptors without replacing the active valid session.

Initial hard limits: 2,097,152 total tile cells (8 MiB for the two Uint16 maps), 8,192 guide strokes, 1,000,000 guide points, the existing 32-scalar input limit, and 1,024 user gestures/65,536 retained user points. Additional transient buffers and prepared caches are measured separately. A valid built-in target must prepare within these limits; failures become audit findings to fix, not an excuse to remove Animate.

Optional motor assets/index record source ID/version/file digest/license/notice, exact Unicode text mapping, locale/script, plan ID and relevant form metadata. English 52, Korean 40, KanjiVG 6,636 and Chinese 9,574 remain separate source families. Retain existing packs byte for byte; use indexed references or additive compact copies with intact provenance, not mutation of old data. Source-only class IDs are never guessed.

## Migration Plan and Invariants

No old writing units, raw recordings or user data are migrated. Existing font display/trace APIs remain compatible; model-animation attachment is additive. Increase the documented ink limits and update tests accordingly.

Forward: preserve old hashes; add optional source index/assets and preparer; add playback; wire the main Animate action; gate exact target/reveal and provenance; retain all previous views. Rollback: disable the newly added preparation/playback implementation while keeping the prior code/data available for diagnosis. Such rollback is an incomplete requested outcome and must not be reported as finishing the user's animation request.

Validation invariants: every old pack/raw hash matches; every descriptor key matches its canonical target; every target component has a drawing trail/owned ink; every source-labelled stroke points to actual supplied data and passed registration; generated fallback never carries an instructional-order label; completed reveal equals the current exact font outline.

## Observability and Performance

Use test/evidence records for preparation time, tile dimensions/cells, thinning iterations, graph/trail counts, source-registration result/reason, coverage, frame time and cancellation. No new diagnostics UI is required. User-facing provenance should be concise: “Source-adapted stroke order”, “Generated drawing guide”, or a compact mixed-origin description.

Measure on the named desktop browser/machine used for browser evidence. Proposed thresholds: warm single-character preparation p95 ≤250 ms, a representative 32-scalar run ≤2 s with event-loop yields/cancellation; visible playback p95 frame work ≤16.7 ms at the tested 960px surface; cancellation becomes visible by the next scheduled frame and stale results never commit. Benchmark informational Check at 1,024 gestures/65,536 points and retain responsive input; if synchronous work exceeds 100 ms, use bounded async work or documented simplification without changing the selected geometry. Record cold font/source loading separately.

These are measured acceptance targets, not claims already achieved. Source caching is bounded. After 100 prepare/attach/animate/cancel/destroy cycles, timer/listener/job counters return to baseline; report actual memory observations and GC method rather than promising a universal heap plateau. Normal font/animation use makes zero external requests when served with complete local assets.

## Work Items

### WI-001: Freeze canonical attachment and source assets

- **Goal:** Give preparer and playback one exact identity contract and locally available source chronology.
- **Acceptance (measurable):** Canonical getter/shared key matches validator-adjusted bounds and all shape fields; old canonical-equivalent identities remain stable. Descriptor schema/limits are finalized. Optional motor index verifies English 52, Korean 40, Japanese 6,636 and Chinese 9,574 actual source records, hashes and notices; no old pack/raw hashes change. Unknown class IDs have no manufactured mapping.
- **Tests (first):** Extend current FontWriter tests for getter immutability, canonical key agreement, malformed/cross-font descriptors; add source-index/hash tests to existing font scripts. Test a source with conservative raw bounds to prevent preparation identity mismatch.
- **Touched areas:** `src/fonts/types.ts`, shape identity/getter/validation helpers, additive source index/assets, existing font asset checks and relevant notices.
- **Dependencies:** Approved contract; existing local ordered packs and Chinese dependency data.
- **Risks + mitigations:** Raw-provider/canonical-bound mismatch; use the writer snapshot. Source-license conflation; per-family records and optional delivery.
- **Rollback:** Remove additive index/attachment while preserving all old assets and current font practice.
- **Priority / estimate / owner:** P0 / M / available Astra High implementer; Ultra lead approves contract.

### WI-002: Generate bounded drawing guides from actual font ink

- **Goal:** Ensure every valid selected target has an actual centerline guide, including scripts without mapped source order.
- **Acceptance (measurable):** Prepare em-based glyph/cluster tiles under the total-cell budget; preserve contextual glyph geometry and detached marks. Thinning/junction collapse/trails produce deterministic nonempty guides for all previously valid advertised examples/inventories across 120 entries/139 faces. Closed loops/dots work; 32-scalar thin and dense targets retain useful local resolution. Every target-ink cell gets an owner/progress; no disconnected component disappears. Signals interrupt preparation and late results never attach.
- **Tests (first):** `scripts/fonts/animation.test.mjs` or an equivalent explicit browser-aware runner: A/O/i/j/B/8, accented letters, Arabic joined words, Indic conjuncts/marks, CJK, vertical Mongolian/Phags-pa, tiny/thin components and 32-scalar targets. Include deliberate wrong-key/limit/cancellation failures. Reuse existing catalog fixtures; do not silently omit tests outside Jest's `src` root.
- **Touched areas:** `extras/fonts/animation.mjs`, optional preparation helpers and fixture data; no HarfBuzz/skeleton imports in core.
- **Dependencies:** WI-001 and current valid canonical font shapes.
- **Risks + mitigations:** Skeleton spurs and fragmentation; merge junction clusters, smooth conservatively and inspect representative frames. Global downsampling destroys detail; local tiles and explicit adaptive budgets. Generated chronology mistaken for pedagogy; mandatory provenance.
- **Rollback:** Revert preparer changes for diagnosis; generated-guide coverage remains an open required criterion until fixed.
- **Priority / estimate / owner:** P0 / L / Astra High.

### WI-003: Register supplied motor plans to compatible font forms

- **Goal:** Prefer meaningful existing stroke order wherever a selected font form can support it.
- **Acceptance (measurable):** Preserve source stroke counts/directions/order and source references after coordinate conversion/registration. Bundled Noto Sans and Noto Serif A are both exactly three strokes with both diagonals apex-down. Registered segments do not jump across empty ink; test Japanese 永's fourth source stroke as a regression. Add passing English, Korean, kana, Japanese kanji and Chinese examples, plus deliberately incompatible a/g/locale examples that select generated provenance. Publish source-adapted/generated counts and registration rejection reasons over the tested source/font matrix; no source inventory is automatically claimed as successful registration. Font change reruns compatibility for the exact new geometry.
- **Tests (first):** Source registration tests for A/i/j/O, Korean jamo including dots/circles, あ/ぬ and representative kanji, Chinese medians, disconnected marks and single-/double-storey a/g. Noto Sans uppercase J must not remain source-adapted if normalization discards its supplied second stroke: missing source ownership requires fallback, never a shortened source-labelled plan. Positive tests verify endpoints/step order and local reveal, not only whole-image similarity. Negative examples must not retain source labels.
- **Touched areas:** Optional source loader/index, registration/projection logic in preparer, allograph/locale metadata and registration fixtures.
- **Dependencies:** WI-001–WI-002. Source loading may proceed concurrently with generated geometry preparation when lifecycle remains deterministic.
- **Risks + mitigations:** Affine matching alone accepts wrong allographs; explicit form/locale exclusions plus bounded geometric/topological checks. Overly permissive projection conceals source mismatch; generated fallback and measured negative fixtures.
- **Rollback:** Disable affected source adaptation while preserving generated animation for those exact fonts; report the reduced source-adapted coverage.
- **Priority / estimate / owner:** P0 / L / Astra High, lead decides compatibility thresholds.

### WI-004: Animate exact outlines and retain long-target practice

- **Goal:** Play the prepared movement/reveal in the current FontWriter without changing its final font or losing practice.
- **Acceptance (measurable):** Both SVG/Canvas use the same owner/progress data clipped to tile-specific exact glyph paths. Intermediate ink grows locally along the active path; future branches/dots remain hidden, and the final frame already equals the entire target with no catch-up fill. Animate, restart, speed, loop and cancel work; setShape/view changes/resize/destroy stop old playback. Trace/copy and Replay my writing remain independent. Practice accepts 1,024 gestures/65,536 points with defined bounded retention and benchmarked comparison.
- **Tests (first):** Extend FontWriter state/lifecycle tests and real browser checks for wrong-key descriptors, caller mutations, progress checkpoints, crossing/dot isolation, A directions, cancel/restart/loop, resize and 32-scalar gesture limits. Compare SVG/Canvas at 320/960 widths and DPR 1/2, including exact completed foreground parity and zero final-frame catch-up delta.
- **Touched areas:** `src/fonts/FontWriter.ts`, descriptor validation/playback helpers, public types and current font tests. No source loading or skeleton dependency in core.
- **Dependencies:** WI-001 and prepared descriptors from WI-002/003.
- **Risks + mitigations:** Full-map scanning each frame creates jank; update/cache only affected masks or bounded frame work. Wide masks reveal future strokes; preassigned ownership and per-tile glyph clipping. Source and user replays confuse state; separate modes and generation guards.
- **Rollback:** Revert playback independently while preserving data/guide fixtures; animation acceptance stays open.
- **Priority / estimate / owner:** P0 / L / Astra High.

### WI-005: Put Animate back in the main formal-font experience

- **Goal:** Make the requested animation obvious and useful without sending users to another model view.
- **Acceptance (measurable):** Default A loads a source-adapted three-stroke animation. Animate is present for every valid selected target; unsupported source order yields a generated guide, not a disabled action. Selecting another font changes the animated exact outlines and its guide. UI distinguishes model Animate from Replay my writing and shows concise origin/source information. Preparation/loading/error/retry states preserve responsiveness and prevent stale callbacks. Old ordered/source views remain available but are not the main answer to font animation.
- **Tests (first):** Extend `scripts/check-font-demo.cjs` with default A, contrasting fonts, a/g fallback, one generated non-Latin script, contextual Arabic/Indic, long input, local uploaded font and delayed font/source switching. Verify visible controls/provenance at 320px and desktop with real pointer/keyboard interaction.
- **Touched areas:** `demo/multilingual/fonts.mjs`, HTML/styles, `docs/fonts.md`, README and optional asset-delivery docs.
- **Dependencies:** WI-001–WI-004.
- **Risks + mitigations:** Provenance copy becomes a scope excuse; keep Animate usable and labels short. Fonts switch while guide is loading; abort, key-check and suppress old callbacks.
- **Rollback:** Roll back an integration regression without claiming the requested main-flow animation is complete.
- **Priority / estimate / owner:** P0 / M / available Astra High.

### WI-006: Independently audit motion, coverage and package boundaries

- **Goal:** Close the acceptance loop on actual animation rather than screenshots or the presence of a button.
- **Acceptance (measurable):** All runtime/data/package/browser gates pass; all baseline valid advertised targets have prepared descriptors and complete exact reveal. Inspect representative intermediate frames/videos for local path-following motion, source A direction, loops/crossings/dots, dense CJK, contextual scripts and vertical targets. Record generated/source-adapted counts, failures fixed, performance limits and cancellation. Actual packed consumers load the optional preparer/source contract without pulling it into legacy initialization; source/large-font data stays explicitly optional. Independent findings are fixed and re-audited before completion.
- **Tests (first):** Existing package/font/browser checks plus durable guide/provenance/cancellation fixtures; deliberate failures prove the new animation runner is invoked. Retain compact expected masks/checkpoints and source references as regression evidence; scratch probes alone do not satisfy durable coverage.
- **Touched areas:** Verification scripts, package contents/checks, durable fixtures and evidence report; source fixes delegated back to High.
- **Dependencies:** WI-001–WI-005 and separate Ultra debate/audit agent.
- **Risks + mitigations:** A final frame conceals a wipe or catch-up fill; test intermediate motion and per-component ownership. Aggregate source counts conceal failed registration; publish exact origin/pass/failure counts. Do not claim educational validity from generated geometry.
- **Rollback:** Keep required findings open, disable only a bad source adaptation where generated fallback is correct, and re-audit fixes. Do not declare the animation request finished while the main action is absent or faked.
- **Priority / estimate / owner:** P0 / M / independent auditor and Ultra lead; High implements fixes.

## Gap-to-Work-Item Map

| Gap                                               | Work items                                               |
| ------------------------------------------------- | -------------------------------------------------------- |
| Main font view lost animation                     | WI-004, WI-005                                           |
| Fonts do not contain supplied motor order         | WI-001, WI-002, WI-003                                   |
| Allograph/locale mismatch under font switching    | WI-003                                                   |
| Generated guide needs local motion/full exact ink | WI-002, WI-004                                           |
| Long-run resolution and gesture limits            | WI-002, WI-004                                           |
| Wrong target identity and stale preparation       | WI-001, WI-002, WI-004, WI-005                           |
| Motion/provenance/package evidence                | WI-006                                                   |
| Unknown source-class Unicode identities           | Preserve explicit source-only status; no guessed mapping |

## Ordering and Coordination

High starts with WI-001's shared contract/assets, then develops generated preparation and playback against fixtures, followed by source adaptation and main UI integration. Source indexing and fixture inspection can overlap other useful work. The Ultra lead makes threshold/scope decisions; the separate debate agent challenges them. Audit is separate from source implementation. Estimates describe relative scope, not an elapsed-time promise.

## Testing Procedures

Write meaningful contract/geometry/lifecycle tests before their implementation. Reuse existing font runners and register any new preparation tests explicitly; source runtime tests remain inside the current Jest root where appropriate. Rebuild before browser checks. Run focused tests during implementation, then the full shared gate once ready, repeating only after relevant edits or failures.

```sh
yarn typecheck
yarn lint-test
yarn test --runInBand
yarn build
yarn check-demo
yarn check-package
yarn test-data
yarn check-data
yarn check-data-reproducible
yarn check-fonts
yarn test-fonts
yarn check-font-animation
yarn check-font-demo
yarn check-multilingual-demo
```

The dedicated animation gate is `check-font-animation`. It covers script preparation, source registration, ownership/reveal and cancellation alongside the complete catalog audit. Record the final actual counts. Benchmark dense/long animation preparation/playback and the raised input comparison limit in the browser evidence. Normal CI consumes pinned fixtures/assets and has no external font/source download requirement.

Representative required targets: A, B, O, i/j, single-/double-storey a/g, digits with counters, Korean jamo, あ/ぬ, simple/dense Japanese kanji, Chinese median examples, Arabic joined word with dots, Indic conjunct/reordered marks, Thai/Tibetan marks, Mongolian/Phags-pa, a 32-scalar Latin string, a 32-scalar CJK string and a locally selected contrasting font. Include whole blank geometry rejection, tiny detached dots, closed loops, crossing junctions, malicious/cross-shape descriptors, aborted source loads and rapid font switches.

## Rollout Plan

1. Keep current font practice working while optional animation preparation and playback are implemented against fixtures.
2. Enable main Animate with the correct default A and generated fallback; retain exact font and provenance checks during integration.
3. Run complete catalog preparation/reveal and targeted source-registration/motion audits; fix/re-audit failures before marking complete.
4. Report the achieved main-flow animation, actual source-adapted/generated coverage and remaining unmapped source identities plainly. Do not frame the retained source-model page as a substitute for selected-font animation.

Kill switches: wrong-shape attachment, changed/fake supplied order, erased components, nonlocal wipes, final catch-up fill, stale callbacks, missing licenses or broken legacy data. An affected source registration can fall back to a truthful generated guide; failures of generated coverage/playback remain required work.

## Plan → Verify Handoff

| WI  | Evidence required                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | Final key/getter/schema, source index/version/digests/notices, old-data hash comparison and boundary tests.                                                |
| 002 | All-valid-target preparation counts, per-tile resolution/cells, component ownership and graph/trail diagnostics, long-run/cancellation results.            |
| 003 | Source-compatibility matrix and explicit fallback reasons; default A order/endpoints; positive/negative font-form fixtures and provenance.                 |
| 004 | SVG/Canvas intermediate frames/motion clips, owner/progress checkpoints, exact full reveal/no-catch-up proof, lifecycle and raised-input-limit benchmarks. |
| 005 | Main-view interaction evidence, real contrasting-font animation changes, generated fallback, source/generated labels and delayed-switch tests.             |
| 006 | Full logs, packed consumers, offline requests, independent findings/fixes/re-audit ledger and exact coverage/performance report.                           |

## Verified Source-Registration Evidence

The independent architecture audit covered every catalog entry eligible under the actual motor-loader group rules, including separate Hiragana/Katakana entries, both Chinese locales, multi-scalar examples and the six Korean font/pilot combinations. That is **742 catalog targets**: 726 single-scalar mapped-source targets, ten multi-scalar examples and six composition pilots. A separate expanded matrix contains 238 English, Korean, Japanese and Chinese source/font regressions. Their union contains **806 unique targets**.

The final merged verification is **806/806 successful canonical preparation and FontWriter attachment**, with no changed/missing source IDs or sampled source segments crossing outside the documented one-cell ink tolerance. Catalog origins are 438 source-adapted, 297 generated and seven mixed; the expanded matrix has 149 source-adapted and 89 generated. The catalog source paths contributed 511,009 sampled continuity points, and the expanded suite contributed 164,673; these suites overlap, so their counts must not be added as unique coverage.

The first complete run found two attachment failures: Noto Sans CJK Korean ㅊ and ㅎ had an authored curve collapse to a single projected point. The only subsequent preparer change rejected such adaptations and used generated fallback. The auditor then reran 94 Korean and Latin boundary targets, including both failures, all six Korean pilots and both A/allograph/J cases; all 94 passed. Unaffected successful rows were retained with their original tested hashes. This is an explicit affected-case verification, not a claim that all 806 were rerun after the one-line guard.

| Check                              | Verified result                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Noto Sans and Noto Serif A         | Three source strokes retained in order; both diagonals share the apex and proceed downward to opposite legs, followed by a left-to-right crossbar.                       |
| Incompatible a/g and J forms       | Both two-storey a forms and Serif g remain generated; Sans J falls back rather than deleting its supplied second stroke.                                                 |
| Source projection continuity       | Blank-crossing nearest-point jumps are routed only through bounded connected skeleton paths or rejected. All final sampled source paths pass the ink tolerance.          |
| Noto Sans Korean 가 / 한 / 글      | Mixed guides: respectively 3/8/7 total trails with 2/3/4 source-adapted trails. Generated components retain generated provenance.                                        |
| Noto Serif Korean 가 / 한 / 글     | Respectively generated 4 trails; mixed 6 trails with 4 sourced; fully source-adapted 5 trails. No all-syllable coverage claim.                                           |
| Original versus final source count | Default source plans are complete within each accepted cluster/component; zero-owner or collapsed source strokes cause fallback instead of silently shortening the plan. |

Audit evidence is in `work/fonts/final-source-audit-verified.json` and `work/fonts/final-source-catalog-rows.json`; the latter supplies the 742 exact `scriptId`/`fontId`/`text` rows for the lead's full-catalog matrix. The initial adapter hash was `da4dad7be8e9f8864c8c79b8b0873efbe3dfc338a2d500ac6f78c4466d482280`; the guarded adapter is `a29b2cd1cedffd1ae468723fd047e5cbdf457e1e6f827c456590b3ddd036203d`. The skeleton hash is unchanged at `86f6fafbe705282bca6780db1f897076921a437baf5181efba8035074e8ae8e9`. Full hashes, original and targeted rows, and method are retained in the evidence report. Scratch audit files support this verification; durable regression cases belong in the checked-in animation gate.

This closes the source-registration findings within WI-003. Overall plan completion still depends on the lead's complete catalog, actual playback, raised-capacity comparison, package and regression gates. These source-adaptation counts are measured target/font outcomes, not a claim that all available motor records work in every font.

## Manual Test Checklist

- [x] Main view opens with formal A and Animate visibly draws three strokes with both diagonals starting at the apex.
- [x] Changing font changes both exact ink and movement/reveal; no old guide survives the switch.
- [x] a/g form mismatches fall back to an honestly labelled generated guide.
- [x] Scripts without supplied order still animate actual interior drawing paths.
- [x] Dots, accents, loops and crossings reveal locally and at the correct guide step; final frame has no catch-up fill.
- [x] Arabic/Indic contextual shape and Mongolian/Phags-pa orientation remain correct throughout playback.
- [x] 32-scalar targets retain detailed guides and enough user-ink capacity for practice.
- [x] Model Animate, Trace, Copy and Replay my writing have distinct useful behavior.
- [x] Stop/restart/loop/resize/font switch/destroy cancel old motion and pending preparation cleanly.
- [x] All assets load locally; original ordered/source data remains unchanged and available.

## Earlier Acceptance Evidence — Superseded by the Live-Session Audit Below

All six work items are accepted. The main formal-font view animates the actual selected font and uploaded fonts; both bundled A faces preserve the supplied three-stroke apex-down plan. Source-adapted, generated and mixed provenance remain explicit.

- Catalog preparation and canonical attachment: **10,765 / 10,765 passed**. The initial 169 failures (167 compact-component ownership failures and two collapsed source curves) were fixed and all retested. All 742 source-eligible catalog rows were refreshed by the independent final source audit. Final origins: **438 source-adapted, 7 mixed, 10,320 generated**.
- Independent source audit: **806 / 806** unique targets passed chronology, source-ID/count and in-ink continuity checks across the 742-case catalog and overlapping 238-case expanded cohorts.
- Core gates: TypeScript, ESLint, **329 Jest tests / 30 suites / 15 snapshots**, build, demo and packed consumers passed. Font/provider/skeleton: **12 tests**. Existing data: **19 tests**, 149 packs verified, 498 generated artifacts reproduced unchanged.
- Browser gates: all 120 catalog entries; 36 durable final-mask comparisons at 320/960 pixels and DPR 1/2/3; 26 additional representative actual SVG/Canvas comparisons at 960/DPR3; uploaded TTF animation; mobile 320px; repeated Animate, Stop/Trace during pending attachment and handwriting during preparation passed.
- Independent lifecycle: 50 rapid font switches and page teardown leave no writer handlers, frames or resources. Invalid descriptors reject transactionally without running tested hooks or canceling valid playback.
- Long-target comparison now samples per em within bounded memory. Identical ink retains coverage 0.6662608225 at 1/4/8/16/32 glyphs; 1,024 gestures / 65,536 points compare in 21–22 ms.
- Varied 32-scalar preparation: lead measured 717 ms Latin, 1,225 ms Chinese, 344 ms Arabic and 1,070 ms Japanese; independent timings 771 / 1,232 / 373 / 1,105 ms. MessageChannel task yielding avoids timer clamping, retains input/RAF responsiveness, cancels within 1 ms in the independent probe and closes all ports. Node normal, aborted and fallback children exit without retained ports.
- Long Canvas playback: 32 repetitions of 漢 at 960 CSS pixels / DPR3 improved from about 1,081 ms to median 10 ms per frame.
- Exact final vectors remain clipped throughout completion. The extreme thin-line SVG fixture differs from an unmasked render by at most 7/255 alpha; an entirely opaque SVG mask produces exactly the same difference, proving mask-compositing antialiasing rather than missing ownership. Canvas matches that fixture exactly. No final unmask was added.
- Final core: **88,333 bytes minified / 26,424 bytes gzip**. Optional motor assets: **21,419,753 bytes**. Heavy font/source assets remain outside the core package with notices intact. Local Node 26.8.1 gates passed; exact Node 22.14 also passed font tests and packed-consumer checks. CI includes the new animation gate.

Final evidence is summarized in the task deliverables `font-animation-verification.md` and `font-animation-coverage.json`; detailed audit records and gate logs are retained in the task's `work/font-animation-audit/` and repository `work/fonts/`. The lead and independent auditors have no unresolved findings. No publication or push was performed.

## Live-Session Regression: Source Failure Must Not Change Stroke Order

The user reproduced A as a generated four-path reveal in the actual in-app browser after the local server stopped. The page retained cached font geometry, but createMotorSourceLoader converted unavailable source requests into null. The preparer then generated a different sequence. Restoring the server and reloading the same tab immediately restored the source-adapted three-stroke A. Earlier coverage and chronology checks did not test this live-session failure, so their completion conclusion was too broad.

Acceptance for this correction: source-group request/status/JSON/schema/crypto failures throw recoverable errors instead of reporting absent source data; the main page keeps its font and learner ink and provides Retry; A/F never silently become generated when their source cannot load; only verified absence or incompatibility enables an explicitly labelled shape reveal. Fully source-adapted plans use Animate strokes and stroke counts; generated/mixed plans use Reveal shape and path counts. Chromium, WebKit and the actual in-app tab must verify the distinctions and recovery. The local demo server must run independently of the tool command that started it. Existing source chronology and rendering gates remain in force.

Additional correction criteria: the demo must refresh the complete changed module graph in an existing cached browser session, while canonical npm imports remain query-free. The local demo server serves no-store responses. Source-only crossing ownership completes the earlier stem locally without revealing the later branch core; source IDs, paths, counts, order and direction remain unchanged. Both A faces, accepted F/T forms, and nearby parallel/disconnected negatives are audited. Raster-edge and advancing-front roughness are visual limitations, not a claim of an exact physical-pen simulation.

## Corrective Acceptance — Actual Live Tab and Source Failure

The reopened correction is accepted. The lead reproduced the generated four-path A in the actual cached in-app tab, restored the missing local server, removed silent source-failure substitution through delegated implementation, and verified the final hashed revision in that same tab. The demo now distinguishes Animate strokes from Reveal shape and offers Retry without losing font or learner ink. A content-hashed browser import map refreshes all changed modules while canonical npm imports remain query-free. The detached repository demo server responds with no-store headers and remains alive after its launcher exits.

Final corrective gates: 29 font/source/junction tests; 22 Chromium/WebKit source workflow scenarios; independent integrity/crypto and stale-cache recovery; packed consumers and optional animation bundling; 120-script animation smoke and 36 final-mask comparisons. Fresh repair-on/off comparison passed all 806 unique cases with identical complete source paths/IDs/counts/provenance/covered geometry and valid attachment. All 335 wholly generated cases retain identical owner/progress arrays; only 220 rows changed ownership/progress. There were no continuity failures across 545,303 source-path samples. These tests add the failure and intermediate-frame checks missing from the earlier completion claim.

Both A faces, Sans F and Sans T passed actual-handler Chromium/WebKit stage inspection. Delayed branch cores had no premature ink. Both A faces retain apex→bottom-left, apex→bottom-right, then left→right crossbar. Serif F remains an incompatible source registration and uses the explicitly non-instructional Reveal shape action. Conservative crossing assignment preserves source strokes even at work limits; source count/order are never changed to repair a visual junction. 32 distinct-character preparation measured 903 ms English and 1,408 ms Chinese on this host.

Accepted visual limits: small raster-edge steps, angular moving fronts and a small remaining F middle-bar indentation. These do not reverse or reorder source strokes. Exact physical-pen stroke decomposition for arbitrary fonts is not established; generated paths are not handwriting instruction.

Evidence: `work/fonts/final-junction-source-audit.json`, `work/fonts/live-core-isolation.json`, `work/fonts/live-motion-stages.json`, eight corresponding checkpoint sheets, `work/fonts/final-gates/junction-test-fonts.log` and `junction-animation.log`, plus the task's `outputs/font-animation-order-correction.md`. Final optional hashes: animation 734b7597c5210dbdc206ec8c820db7b85230c033aa1e086dfb9d5ba02be7da87; skeleton 9e3b37897cf141babfcda12f758c45c07a38bf2bc4e5ed024d367459c470cd93. No unresolved finding remains in the agreed correction scope; no commit/push/publication was performed.

## Advancing-Edge Correction — User E Screenshot

The user’s large Noto Sans E screenshot shows a deep chevron in the moving horizontal edge and small completed-stem nicks. The previous decision to accept this as moving-front roughness was wrong. An eight-neighbor ownership flood copies seed timing and creates Chebyshev-distance chevrons; nearest-neighbor enlargement of a binary tile mask exposes coarse pixel steps. Source order correctness does not establish clean intermediate rendering.

Approved direction: preserve source paths/IDs/order, provenances, radial dot behavior and exact final font outlines. Compute geometric longitudinal progress for all curve owners, including generated curves, using a bounded deterministic segment spatial index. Reconstruct owner-clipped continuous progress contours and render with native SVG/Canvas antialiasing. Completed regions may be cached. Do not use broad blur, change source order, or silently fill missing ink at completion. Handle demonstrated corner/time plateaus and self-near projection issues locally without inventing a new stroke sequence.

Acceptance: E top/middle/bottom horizontal fronts are straight and normal to their paths at25/50/75%; A diagonals/crossbar and F/T front boundaries are smooth; O/U/S/continuous L and self-crossing fixtures avoid remote islands or vertex-region popping. Inspect320/960CSSpx and DPR1/3 in both renderers, with native narrow antialiasing. Later branch cores remain hidden, final masked geometry matches exact outlines, cancellation and32-character preparation/playback remain responsive. The exact user tab must be reloaded with the final content hashes and visually checked. Treat completed-stem nicks as a separate measurable geometry defect if they remain after the progress correction.

The lead owns acceptance; Astra High implements, the independent architecture and debate agents audit. Earlier reports remain historical evidence, not proof that this new criterion is met.

The E audit also requires clean completed-stroke junctions. A stable fitted shaft may complete a raster-snapped endpoint and return excess junction ink to its later branch. A proven shared terminal run may allocate its common ink to the earlier stroke and reconcile its bounded divergence cap. These repairs must preserve source paths, IDs, counts, order, direction and later branch cores; nearby independent, parallel and shallow-crossing strokes must remain unchanged. A row with no interior holes is insufficient if the cap still has visible unsupported bites or protrusions across rows.

The final 32-character stress audit found approximately one second of synchronous descriptor validation before attachment could yield. Remove the repeated typed-array property enumeration and, if needed, validate in bounded asynchronous chunks. Preserve hostile-descriptor rejection, immutable snapshots and transactional attachment. Input and cancellation should reach the pending attachment within 100 ms on the measured 32-character dense fixture, with a 50 ms target; total attachment time is reported separately from guide preparation and frame playback.

The early-A cross-check found a separate fixed owner spur: 54 Noto Sans cells assigned to the first stroke lie well inside the later right leg, including one 78.61 font units from the first source path and only 11.72 from the second. Add a separate source-only rule for coincident endpoints (within one cell), divergent stable shafts oriented away from that endpoint, and acute dot range greater than 0.35 through 0.85. Measure absolute normal ink limits in each shaft's own frame. Inside a local region of at most three measured halfwidths along either shaft, return earlier-owned ink only when it is outside the earlier normal limits by more than 0.25 cell and inside the later limits. Preserve shared overlap, ordinary crossing gates, source paths/counts and transactional ownership. Audit early A phases and completed first strokes in both faces, all prior E criteria, unaffected negatives and renewed source invariance.

The A fit audit adds a continuation guard: the independent 3–5-halfwidth continuation direction must agree with the fitted 1–3-halfwidth shaft by a dot product of at least 0.95. Sans A passes (0.999999/0.999001); Serif A's hooked first terminal does not (0.867). This is an eligibility check only: the mutation region remains 0–3 halfwidths, and cap ink behind the shared endpoint stays unchanged.

## Final Advancing-Edge Acceptance

Accepted after delegated implementation, independent architecture/debate audits, repeated fixes and the lead's final live-browser review. This supersedes the earlier permission to accept chevrons, advancing-front roughness and completed-stem nicks.

- Curve timing now follows geometric ordered-segment projection; SVG/Canvas render continuous native vector contours with internal seams removed. Public source paths and radial dot behavior remain unchanged. The E top-bar chevron is gone; completed Sans stems and the Serif shared terminal boundaries pass the exact geometry checks.
- All 806 unique source/font cases were rerun on the final helper, retaining exact source paths, chronology, counts, provenance and covered geometry; all 335 wholly generated cases retain owner arrays. All 545,303 source-path samples pass the ink tolerance. The final acute-join delta changes 86 Sans A cells and 71 Sans N cells, preserving earlier shaft cores and the Serif A hook; both E plans remain byte-identical to the accepted pre-apex revision.
- The independent core audit passes 344 analytic contour/endpoint/loop frames at 320/960 CSS pixels and DPR 1/3, plus corner and dot probes. The final source-isolation audit passes 22 Chromium/WebKit stage checks. New early-A checks verify 185 later-leg and 241 first-leg core cells, with no deep right-leg spur.
- Final gates pass: typecheck, lint, 329 Jest tests / 30 suites / 15 snapshots, build, 34 font/provider/source/progress tests, the 120-script animation gate and 36 final masked comparisons, the CI contour gate, browser demo and packed consumers. Final helper changes were retested with font, animation, package, stamp and diff checks; unchanged core evidence was retained rather than redundantly rerun.
- Dense 32-times-漢 attachment takes 1,192 ms, with input/cancellation event lateness of 19–23 ms and a worst observed 36.2 ms heartbeat gap. Added source-helper checkpoints lower the measured shared-prefix stress gaps below 44 ms; cancellation delay stays below 15 ms. Exact scheduling parity was verified across 40 canonical cases and three stress fixtures. Final 32-distinct-character preparation is 1,275 ms English and 1,719 ms Chinese.
- The lead reloaded the actual in-app tab, verified the final module hashes, inspected A/E playback, both E typefaces and both renderers, and left Noto Sans E selected with SVG and Slow playback. No warning/error logs were returned. A matching large E frame and final audit report are in the task outputs.

Final hashes: core `1f1f5d8c34b4e23a1f4e67a44c93aae1954f685e99485c06162cb6862ba3dbcd`; animation `075f41e436250f09d7082b680fc863fa528d28f1b1c9973f812262b879004448`; progress `9078c27b5f8bab4a0d79b20150c62bafaf24eb3816ad0a55ead130b66da18ab0`; skeleton `a69b6ab504b244a5b12cd228dda1e8db71d9cb84723f8f6559603029fd556d0d`.

Limits remain explicit: completed diagonal owner boundaries retain cell-sized steps and shared cap geometry; the exact outer font outline is vector-clipped. The source audit does not certify every catalog glyph's intermediate frames, and generated shape reveals remain non-instructional. There is no claim of exact physical-pen decomposition for arbitrary fonts. Independent auditors and the lead have no unresolved finding within this corrective scope. No commit, push or publication was performed.

Evidence: `work/fonts/final-front-architect-verdict.json`, `final-front-source-audit.json`, `final-front-source-catalog-rows.json`, `scheduling-parity-audit.json`, `scheduling-fixture-parity.json`, `E-final-vector.png`, `a-early-after.png` and final gate logs; task `outputs/font-animation-edge-correction.md` and `outputs/font-animation-corrected-E.png`.
