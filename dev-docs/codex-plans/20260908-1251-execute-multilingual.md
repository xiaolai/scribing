---
title: 'Execute multilingual Scribing with existing stroke data'
mode: 'full-plan'
status: 'Complete — technical preview scope'
baseline: '9ff4bec3'
---

## Outcomes

Implement a usable multilingual engine and optional existing-data packs, audit the integrated result, and fix found defects. Extend the existing Scribing facade; preserve Chinese APIs, lifecycle and grading. Deliver English print/digits/punctuation, Japanese kana/kanji, mapped Korean letters, broader experimental source collections, a working practice/replay demo, reproducible imports, tests and accurate coverage reports. Complete the finite work items below; the longer research roadmap remains an expansion portfolio rather than a claim of completed native curricula.

Newly verified source correction: letterpaths at fb5a1d0ebe88e462fcc89c50921d7732a44eeeab contains52 explicit print glyphs (both cases) and52 lowercase cursive entry variants. glyphed.js at82dc60759dda2341e3ae9026212ea43222519692 contains83 drawable IDs/249 variants. Compare and import these before authoring residual forms.

## Constraints & Dependencies

TypeScript4.1, Jest26, existing Rollup CJS/ESM/IIFE entry points; no runtime framework or ML requirement. MIT engine, separately attributed/licensed packs. Source pins and notices are mandatory, no automatic npm/GitHub publishing. Use existing local Node22-compatible tools. No external accounts, messaging, native-review recruitment or unverified ownership assumptions.

## Current Behavior Inventory

Scribing owns loading/generation, RenderState, shared pointer targets, Positioner and renderer lifecycle. Character/Stroke models map numeric motor strokes to three render layers. Legacy grading assumes curves, fixed coordinates and one stroke sequence. New data is parsed at a distinct boundary. Existing Chinese parser/matcher behavior remains unchanged.

## Target Rules

1. setUnit accepts validated WritingUnit data or an explicit provider request. setCharacter and setUnit supersede each other, cancel pending I/O and prevent stale mounting/callback work. Errors never leave a previous unsupported quiz active.
2. One render-state slot equals one motor stroke. Optional visual segments stay inside that slot. True dots retain one point and explicit radius.
3. Compile source coordinates into em1024/y-up; fit declared bounds while grading in canonical em units. SVG/Canvas use the same compiled polylines. Legacy outline rendering keeps its defaults.
4. UnitQuiz is separate from legacy Quiz. Selected and bounded alternative plans vary order/direction over a fixed stroke set. Different pen-lift segmentation is a separate asset. Guided practice displays reference and next-stroke guidance; it does not claim continuous constraint of the pointer.
5. Explicit source/unit IDs, NFC lookup and exact aliases; no blanket NFKC or inferred Chinese fallback. Unmapped observations keep source-class labels.
6. Source provenance distinguishes authored, recorded, image-traced and font-inferred paths. Technical previews can animate/practice selected models without claiming reviewed instructional order. UI and manifests expose the distinction.
7. Bound validation/geometry/candidates/input queues; callbacks may restart, switch or destroy. All such actions invalidate pending old-session work.
8. Import first; use explicit residual authoring only for measured missing/unsuitable forms. Import failures and unsupported items are visible.

## Decision Log

- Architect debate: reuse Scribing facade, RenderState and targets; rejected a parallel writer because it duplicates cancellation, pointer and resize failure modes. Isolate UnitQuiz to preserve legacy grading.
- Use compiled polylines for new centerlines; arbitrary SVG interpretation belongs in offline importers. Filled v1 outlines remain supported; v2 outline reconstruction is unnecessary for the chosen sources.
- Use a separate raw-observation layer for source replay and curation. A valid coordinate file does not automatically become an authoritative teaching model.
- Optional packs and explicit provider selection are sufficient; defer a global registry, persistent cache and workers until measured need.
- Existing recordings supply real-input test cases now. Earlier proposed ten-writer study quotas are not blockers for an honestly labeled technical preview. Do not claim a human validation study was performed.
- Korean class mapping is visually derived and recorded as such. Implement mapped letter previews and measured contextual composition only if imported shapes support it; all generated blocks retain experimental provenance until independently reviewed.

- Root audit fixed a cross-component bounds ambiguity: UnitBounds consistently means `[minX,minY,width,height]`. Tests cover nonzero origins and both y-axis directions.
- Animation follows the default or explicitly selected unit plan, retaining motor render indices. A plan's order applies to both animation and grading.
- Recorded exemplar selection uses a bounded shape medoid: whole-glyph uniform scale and center alignment, 32 arc-length points per motor stroke, modal pen count and stationary-fragment checks. It selects an actual recording; raw paths/time/order remain intact. This replaces median-aspect selection after a measured comparison.
- Archive generation uses pinned pure-JavaScript compression after native zlib version differences caused an actual reproducibility failure. All 492 outputs now match across Node 22 and 26.
- Core matching defaults stay unchanged. The demo exposes tolerance and defaults recorded previews to 1.5; this is source-model practice, not a calibrated general recognizer.
- KanjiVG source inventory separates 6,447 CJK characters, 184 kana, 68 ASCII characters and 5 symbols. Source counts do not imply complete language or curriculum coverage.

## Open Questions

No user answer blocks implementation. Default to source-named preview styles and preserve alternatives instead of declaring a universal handwriting standard. Native curriculum certification, unavailable datasets, and language-specific connected-word teaching models remain separate content milestones; their absence does not block this engine/import implementation.

## Data Model

src/units/types.ts freezes WritingUnit v2, CompiledUnit, provider/lookup, UnitQuizOptions/feedback and WritingDataPack. Curves carry ordered points and width; dots carry center/radius. Plans consume every motor ID once. Optional visual segments carry animation-only intervals. Pack manifests store provenance/status/source/terms; compiled engine does not import bundled data.

## Migration Plan

Additive API, opt-in data, no rewrite of Chinese assets. Existing create/setCharacter/quiz/getCharacterData retain their contracts; legacy-only calls on unit mode reject with guidance. New setUnit/getUnitData/quizUnit plus existing animation/visibility/dimensions methods work together. No persistent data migration/backfill; remove or pin a pack to roll back.

## Work Items

### WI-001: Contract and executable source fixtures

- Goal: Freeze integration boundaries and source pins after architect debate.
- Tests (first): v2 fixture schema, expected A/i/あ/ぬ/Korean motor boundaries; importer source inventories.
- Acceptance (measurable): Shared TypeScript contract and independently sourced fixtures; source counts and Korean mapping provenance recorded.
- Touched areas: src/units/types.ts, planning/research documents, source locks.
- Dependencies: Architect debate and completed online research.
- Risks + mitigations: Earlier inventories were incomplete; pin full trees and inspect assets.
- Rollback: Keep fixtures/documented findings; no runtime change.
- Priority / estimate: P0 / S.

### WI-002: Validation, canonical compilation and unit grading

- Goal: Pure bounded compiler and independently testable plan/dot/curve grading.
- Tests (first): src/units/**tests** schema/compile/matcher/plan/UnitQuiz tests including malformed limits, genuine taps, reversed loops, wrong order and incompatible variants.
- Acceptance (measurable): One-point dots work; transform round trips align; finite complete plans eliminate consistently; no old callback can advance a new session; limits reject malformed/oversized data.
- Touched areas: src/units/* except root-owned types/provider; new UnitQuiz.
- Dependencies: WI-001; shared RenderState and options interface.
- Risks + mitigations: Over-permissive curve matches; use positive/negative translated, shortened, reversed and real-source tests.
- Rollback: Disable unit quiz while preserving legacy and animation.
- Priority / estimate: P0 / L.

### WI-003: Shared models, bounds and SVG/Canvas primitives

- Goal: Render unit centerlines/dots/segments through existing state and target infrastructure.
- Tests (first): optional bounds/legacy snapshots, SVG and Canvas intermediate progress, dots and multi-segment motor stroke tests.
- Acceptance (measurable): Both renderers show same compiled geometry; motor count unaffected by visual segmentation; resize preserves input alignment; legacy snapshots/tests remain unchanged.
- Touched areas: models/Character.ts, models/Stroke.ts, Positioner.ts, StrokeRendererBase.ts, SVG/Canvas StrokeRenderer and focused tests.
- Dependencies: WI-001 compiled types; WI-002 fixtures.
- Risks + mitigations: Legacy reveal changes; explicit optional unit branch and frozen defaults.
- Rollback: Remove optional unit rendering metadata/branch.
- Priority / estimate: P0 / M.

### WI-004: Scribing API and provider lifecycle

- Goal: Integrate unit mode with existing facade and independent async requests.
- Tests (first): src/**tests**/UnitLifecycle-test.ts; direct/provider data, abort, failure recovery, legacy/unit switching, resize, destruction and callback restart.
- Acceptance (measurable): setUnit/getUnitData/quizUnit work; unit and legacy loads supersede safely in both directions; no background stale state or unhandled rejection; old API consumer tests pass.
- Touched areas: Scribing.ts, src/units/provider.ts, shared controller typing, public type exports.
- Dependencies: WI-001–WI-003.
- Risks + mitigations: Legacy loadingFailed contaminates unit mode; explicit mode/failure state and generation checks.
- Rollback: Disable additive entry points; leave legacy implementation intact.
- Priority / estimate: P0 / M.

### WI-005: Reproducible data imports and useful breadth

- Goal: Compile supplied sources into optional packs and raw observations with licenses/coverage.
- Tests (first): Node test-runner tests for SVG/JSON/Omniglot/Tomoe/InkML/UNIPEN adapters, deterministic output, source/notice hashes and actual emitted inventories.
- Acceptance (measurable): English52 print letters+10digits+available punctuation, Japanese92basic kana+source additions/kanji, Korean40 mapped letters, and broader source-class previews emit valid units and exact manifests. Required source paths are pinned; raw observations preserve stroke boundaries/optional time, and empty/invalid samples are quarantined. Author only residual gaps. Pack downloads remain optional and core bundle includes no datasets.
- Touched areas: scripts/data/_, packs/_, data licenses and explicit source/mapping/selection reports.
- Dependencies: WI-001 contract; WI-002 validator; available pinned sources.
- Risks + mitigations: Unfamiliar copying/heuristic order; expose provenance and technical-preview status. Never claim all scripts are reviewed curricula.
- Rollback: Pin/withdraw one pack while retaining others.
- Priority / estimate: P0 / L.

### WI-006: Practice/replay example, documentation and packaging

- Goal: Make the feature usable offline and inspectable across sources/variants.
- Tests (first): browser smoke for SVG/Canvas/dot/resize/switch; extracted tarball consumer compilation/loading; Node test discovery verifies external suites run.
- Acceptance (measurable): Responsive UI selects pack/unit/style, animates, guides practice, reports unsupported/error states, exposes source/status and supports replay. All emitted units load offline. Document API and exact coverage; optional packs have notices. CI discovers importer tests and validates packed consumers.
- Touched areas: examples/multilingual/*, README/API docs, package scripts/test setup, CI, check-package/check-multilingual-demo.
- Dependencies: WI-004, WI-005.
- Risks + mitigations: Dataset/code license confusion; no data in core tarball unless explicitly packaged with terms.
- Rollback: Keep legacy demo; remove individual selector/provider.
- Priority / estimate: P0 / M.

### WI-007: Root audit, regression fixes and measured completion

- Goal: Audit all integrations, fix defects in loops, and record actual evidence/limitations.
- Tests (first): targeted regressions for each reproduced issue; full existing gates plus data/pack/browser/benchmark checks.
- Acceptance (measurable): No known actionable integration defects remain in implemented scope. All advertised inventories validate; SVG/Canvas actual drawing exercised; no stale requests/listeners on repeated sessions. Benchmarks report real device/runtime and p95 without claiming physical-device or native-review tests not performed.
- Touched areas: audited source/tests/docs/plan evidence.
- Dependencies: WI-001–WI-006.
- Risks + mitigations: Aggregate green masks unsupported claims; compare each acceptance with concrete evidence and list content gaps separately.
- Rollback: Withdraw faulty optional capability or pack.
- Priority / estimate: P0 / M.

## Observability and Performance

Bound units to64 motor strokes and8 plans; curve source arrays max4096 points, normalized matching arrays max512. Validate finite coordinates and positive metrics. Record compiler/importer counts/errors and offline benchmark p50/p95. Target typical feedback under50ms on the named local browser; report observed numbers and tune where needed. Raw observations may be larger only in bounded importer tooling, not silently accepted runtime units.

## Testing Procedures

Run focused tests after changes. Required full gates: yarn typecheck, yarn lint-test, yarn test --runInBand, yarn build, yarn check-demo, yarn check-package; add yarn test-data, yarn check-data and yarn check-multilingual-demo plus the benchmark. External Node suites have explicit commands so the legacy Jest src root cannot hide them. Build before browser checks; test both renderers and multiple narrow/desktop sizes. Documentation-only changes require plan lint and diff check, not repeated runtime gates.

## Rollout Plan

New APIs and optional packs are explicit opt-ins; Chinese remains default. Source-named technical previews precede any reviewed claim. No automatic publish/push. Kill switches are per pack or unit capability for wrong counts, malformed sources, stale callbacks, performance regressions or unsupported claims. Connected-script curricula and native certification require separate evidence, not fabricated completion.

## Plan → Verify Handoff

Record source pins/manifest counts, test outputs, benchmark runtime/results, browser evidence, audit findings/fixes and each WI status in a completion report. Required fixtures: genuine dot/loop/short-line, source A/i/あ/ぬ, mapped Korean letters, malformed units, wrong-order variants, canceled providers, and representative real recorded trajectories. Mark deferred content milestones explicitly.

## Completion Evidence

All seven work items are complete within the technical-preview scope. See `dev-docs/research/20260908-multilingual-implementation-audit.md` for findings, measurements and remaining content work.

| Work item | Evidence                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WI-001    | Public v2 contract; locked source snapshots and Korean mapping; actual English/Japanese/Korean format fixtures.                                                                                                                                                                                                          |
| WI-002    | Validator/compiler/geometry limits; unit/source grading suites; true taps, closed-loop direction, alternative-plan consistency and callback reentrancy.                                                                                                                                                                  |
| WI-003    | Shared SVG/Canvas unit geometry tests; preserved 15 legacy snapshots; root inspected rendered English/Korean/kana sheets.                                                                                                                                                                                                |
| WI-004    | UnitLifecycle, FacadeSafety and provider suites; cancellation, failure recovery, immutable requests/data, switching and destroy.                                                                                                                                                                                         |
| WI-005    | 147 packs / 8,628 units / 32,460 raw recordings. All units validate and compile; maximum 456 compiled points and 30 motor strokes. Source locks/notices checked; generated outputs reproduce byte for byte.                                                                                                              |
| WI-006    | Local multilingual demo, API docs, real Chromium mouse drawing at 960/320 pixels with both renderers; package CJS/ESM/browser/TypeScript consumers; new CI gates.                                                                                                                                                        |
| WI-007    | Root reviewed source/rendering/data/integration, reproduced defects and fixed them with regressions. Final runtime suite: 324 tests, 29 suites, 15 snapshots; importer/CLI/compression suite: 15 tests. Types, ESLint, build, package, legacy demo, data integrity, reproducibility and multilingual browser gates pass. |

The audit did not perform a human handwriting study, native curriculum certification, physical stylus/touch-device validation, or publication. Broader source classes remain explicitly unmapped where Unicode labels have not been established. Korean coverage is standalone jamo; contextual syllable models are future content work. These are documented expansion limits, not reported as completed features.

## Manual Test Checklist

Completed through root visual inspection and the named automated integration checks; physical-device and native-review testing remain outside this completion claim.

- [x] Chinese animation/quiz behavior unchanged.
- [x] English dots, descenders, loops and declared variants work.
- [x] Japanese あ/ぬ have3/2 motor strokes.
- [x] Korean mapping/provenance and available forms are explicit.
- [x] Both renderers accept actual drawing at desktop/narrow widths.
- [x] Guided/independent sessions, switching, cancellation and destroy remain coherent.
- [x] Offline packs show correct source/status/license and exact coverage.
- [x] No unverified native-review, language-completeness or performance claim.
