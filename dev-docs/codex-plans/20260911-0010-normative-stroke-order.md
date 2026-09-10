---
title: 'Close the reachable stroke-order gaps and stop implying the unreachable ones'
mode: 'full-plan'
status: 'Draft — not started'
baseline: '462a8fc1'
---

## Outcomes

Take Korean from zero usable characters to all 11,172 modern syllables, using jamo already in the repository. Establish whether GlyphWiki's stroke sequence is writing order, because that single answer decides whether Chinese coverage can more than double cheaply or only expensively. Make the catalogue state, per script, whether stroke order is available at all, so that rendering support and instruction support stop being advertised as one thing.

What this plan does not do is pursue stroke order for the other 116 script entries. [The research note](../research/20260911-normative-stroke-order.md) establishes that no authority publishes it and no dataset encodes it. That is a content-commissioning programme per script, not an import, and pretending otherwise is the failure this plan is written to end.

## Constraints & Dependencies

TypeScript 5.9, Jest 30, ESLint 10 flat config, Rollup 4, zero runtime dependencies. MIT engine with separately attributed packs; source pins and notices are mandatory. Generated data must stay byte-reproducible under `check-data-reproducible`, which currently rebuilds 498 files. New packs must satisfy the manifest requirements added at `e93c4e60`: a non-empty `name`, `version`, `license`, `provenance` and `source.name`. No new runtime dependency, no network access at runtime, no automatic publish.

The existing Korean jamo pack is the input, not a thing to re-author. It is `korean-textbook`, MIT, 40 units, em 1000, y-down, bounds `[0,0,1000,1000]`.

## Current Behavior Inventory

`extras/fonts/animation.mjs` loads a motor unit by exact string lookup, so `units['한']` misses and the glyph falls to the generated skeleton path. `registerSource` fits a unit's motor strokes onto the skeleton of the rasterised glyph through a bounded frame search over five horizontal scales and three offsets, scoring against `nearestSkeletonMap`. A failed fit returns null and the caller silently uses generated trails, so a bad composition degrades rather than breaks.

`fonts/catalog.json` carries 120 script entries across 114 distinct Unicode script codes, and 139 fonts. No field distinguishes a script that can have stroke order from one that cannot. `provenance` on the produced animation is the only signal, and it is only observable after a preparation has run.

## Target Rules

1. A composed Hangul syllable is a first-class `WritingUnit` v2, indistinguishable in schema from an authored one, and carrying its own provenance recording that it was composed rather than drawn.
2. Composition order is initial, then medial, then final. Multiple batchim are written left to right. Each jamo's own internal stroke order is preserved unchanged from the source pack.
3. Jamo placement uses a fixed layout table keyed on the medial's orientation and the presence of a final. The table is data, reviewable in one file, not logic spread through a generator.
4. A composed unit that fails to fit a real font's skeleton must fail visibly in the gates, not silently downgrade to generated in production. The generated fallback stays as the runtime behaviour; the gate is what forbids shipping a composition that never fits.
5. Every script entry declares its stroke-order availability. A caller can read it before preparing anything.
6. No claim of pedagogical certification anywhere. Composed Korean inherits the jamo pack's `technical-preview` status and says in its description that block composition is algorithmic.
7. A spike that answers its question negatively is a completed work item, not a failure. Its output is the recorded answer and the decision it unblocks.

## Decision Log

- Compose Korean rather than acquire it. The survey found no syllable-level dataset anywhere, and the composition rule is fully specified by Unicode plus published orthography. Acquisition is not an option that exists; composition is.
- Place jamo by table rather than by fitting each to the font. Independent per-jamo fitting would need `registerSource` restructured to accept sub-regions, which is a larger change with the same failure modes. Revisit only if WI-002 shows the whole-block fit failing.
- Spike GlyphWiki before touching the YES route. GlyphWiki is a download; YES needs a trail classifier and an assignment solver. If GlyphWiki's order is writing order, the expensive route is unnecessary. Doing them in the other sequence risks building the solver and then discovering it was avoidable.
- Do not pursue Devanagari now. Commons holds 85 files of which only 13 are vector; the rest are GIFs that would need manual tracing for 48 letters of uncertain fidelity. The cost resembles authoring and the coverage gain is one alphabet. Recorded as deferred with this reason rather than left as an implied to-do.
- Add coverage metadata before adding coverage. It is the cheapest work item and it is the one that stops the product from overstating itself, which is the actual complaint this plan answers.

## Open Questions

None blocks a start. Two are settled by spikes rather than by discussion: whether whole-block composition fits real font skeletons (WI-002) and whether GlyphWiki encodes writing order (WI-005). If WI-002 fails, the fallback is per-jamo region fitting, scoped then and not before.

## Data Model

A new `korean-syllables` pack, schema v2, produced by a generator from `korean-textbook`. Each unit's `id` and `text` are the composed syllable. `motorStrokes` are the source jamo strokes with fresh sequential IDs, affine-transformed into their sub-box. One plan, `recommended`, whose steps list every stroke once in composition order. Provenance `authored`, source name recording the jamo pack and the layout table revision.

`fonts/catalog.json` script entries gain `strokeOrder: 'normative' | 'none'` plus, when normative, the covered count. This is additive; existing consumers ignore it.

## Migration Plan

Purely additive. No existing pack, unit or API changes shape. Korean text that previously produced a `generated` plan begins producing `source-adapted`, which is a behaviour improvement within the existing contract and is already the difference the demo labels. Rollback is removing the pack from the motor index; the exact-string lookup then misses as it does today.

## Work Items

### WI-001: Stroke-order availability in the catalogue

**Status:** DONE — 2026-09-11
**Changed:** scripts/fonts/build-catalog.py, scripts/fonts/check-assets.mjs, fonts/catalog.json, fonts/catalog.lock.json
**Verified:** yarn check-fonts — 120 script entries, 7 normative and 113 none. Fault-injected a false `normative` claim on `arabic` with the lock hash updated so the drift check could not mask it; the new assertion failed with `arabic order`, then passed again on restore.
**Deviation:** the item named `src/units/types.ts` and `scripts/data/check.mjs`. Neither was touched. There is no catalogue type in TypeScript, and adding one would export a type with no consumer, since the catalogue is passed to `createFontProvider` from JavaScript. `scripts/data/check.mjs` reads `packs/generated/catalog.json`, a different file; the font catalogue is asserted by `scripts/fonts/check-assets.mjs`, which is where the assertion went.
**Note:** the field resolves to 7 normative script entries, not 4. `hiragana` and `katakana` carry `language: ja` and `chinese-traditional` carries `zh-Hant`, so the runtime predicate selects a motor group for each. The count reported is the whole source group's, which `strokeOrderNote` states.

- Goal: A caller can tell, without preparing anything, whether a script can have stroke order at all.
- Tests (first): every script entry has the field; the four normative scripts report a count matching `fonts/motor/*.json`; a script with no motor group reports `none`.
- Acceptance (measurable): `check-data` asserts the field against the motor index rather than trusting the catalogue.
- Touched areas: `fonts/catalog.json`, its generator, `src/units/types.ts`, `scripts/data/check.mjs`.
- Dependencies: none.
- Risks + mitigations: the catalogue is hash-pinned by `fonts/catalog.lock.json`; regenerate the lock in the same commit or the gate fails.
- Rollback: revert; the field is additive.
- Priority / estimate: P0 / S.

### WI-002: Hangul composition spike

**Status:** DONE — 2026-09-11. The answer is no. **The gate does not open.**
**Changed:** nothing committed. Ran through a scratch Playwright harness, since the preparer needs Canvas and Path2D.
**Verified:** 2 fonts × 7 syllables = 14 trials per route, comparing the incumbent against a table-composed block supplied through `sourceLoader`.

| Route                           | source-adapted | mixed | generated |
| ------------------------------- | -------------: | ----: | --------: |
| Incumbent `registerKoreanPilot` |              1 |     4 |         9 |
| Table-composed whole block      |              1 |     0 |        13 |

**Finding 1 — the plan missed an incumbent.** `extras/fonts/animation.mjs:685` already contains `registerKoreanPilot`, reached when the loader returns no record and `shape.script === 'Hang'`. It handles three hardcoded syllables, 가 한 글, by projection-cutting the ink into jamo regions and fitting each separately. That is the per-jamo route this plan listed as its _fallback_, so the fallback is the incumbent and the plan's primary route is the untried one. It is also unreliable on its own three: mostly `mixed`, and font-dependent. `mixed` still shows "Reveal shape", so it does not deliver stroke order either.

**Finding 2 — the whole-block route fails structurally, not by tuning.** `registerSource`'s frame search has two degrees of freedom, `scaleX` and `offsetX`, both horizontal; the y mapping is a fixed stretch of the source extent onto the ink bounding box. A Hangul block needs independent 2D placement per jamo, which that search cannot express. No layout table can recover it.

**Finding 3 — the jamo pack cannot express 겹받침.** It holds 40 units and none of the eleven compound finals ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ, only the doubled ㄲ and ㅆ. 곩 composed zero strokes for this reason. Any route must decompose a compound final into its parts first.

**Deviation:** the item named LXGW WenKai KR, Nanum Pen Script and Noto Sans KR. The catalogue ships only `NotoSansCJKkr` and `NotoSerifCJKkr` for Korean; testing the other two would mean adding fonts to the catalogue, which is outside this item. Two faces were tested rather than three, which weakens the stated mitigation. Findings 2 and 3 do not depend on font count.

- Goal: Settle whether a table-composed block fits a real font's skeleton well enough for `registerSource` to accept it.
- Tests (first): compose five syllables covering every layout class — 가 vertical, 고 horizontal, 과 wrapping, 한 vertical with final, 곩 horizontal with complex final — by hand or by a throwaway script.
- Acceptance (measurable): run each against LXGW WenKai KR, Nanum Pen Script and a Noto Sans KR at the preparer's default resolution; record the accept/reject outcome and the fit score per case. Written answer, not a passing build.
- Touched areas: scratch only. No committed runtime change.
- Dependencies: WI-001 not required; jamo pack present.
- Risks + mitigations: fonts proportion jamo differently, so a table tuned to one may fail another. Testing three faces of different weights is the mitigation; a single-font pass is not an answer.
- Rollback: nothing to roll back.
- Priority / estimate: P0 / S. **Gate: WI-003 does not start until this reports.**

### WI-003: Hangul composer and generated pack

**Status:** BLOCKED — 2026-09-11
**Changed:** nothing.
**Blocker:** this item's stated dependency is "WI-002 reports accept". WI-002 reported reject, and its gate line says WI-003 does not start until it reports. Building the pack anyway would produce 11,172 units that `registerSource` rejects for the structural reason in WI-002 Finding 2, which Target Rule 4 forbids shipping. The route that could work is per-jamo region fitting, and this plan's Open Questions say to scope that "then and not before", so it is recorded under Outstanding work rather than built here.

- Goal: All 11,172 modern syllables as composed units, reproducibly.
- Tests (first): Unicode decomposition round-trips for the full range; composition order is initial, medial, final for every layout class; multiple batchim run left to right; every plan consumes every stroke exactly once; jamo internal order is preserved byte-for-byte from the source pack.
- Acceptance (measurable): 11,172 units generated; `check-data-reproducible` extends from 498 files to include them and still reports `reproducible: true`; pack passes the manifest validation added at `e93c4e60`.
- Touched areas: `scripts/data/`, `packs/authored/` layout table, `packs/generated/korean-syllables.json`, `fonts/motor/korean.json`, lockfiles.
- Dependencies: WI-002 reports accept.
- Risks + mitigations: pack size. 11,172 units of ~10 strokes each may exceed the 32 MiB fetch ceiling; measure early and split by syllable range as the Japanese kanji packs already are.
- Rollback: remove from the motor index.
- Priority / estimate: P0 / M.

### WI-004: Korean integration and gates

**Status:** BLOCKED — 2026-09-11
**Changed:** nothing.
**Blocker:** depends on WI-003, which is blocked. There is no pack to integrate and no Korean `sourcePaths` figure for `check-font-animation` to report. Adding gate cases now would pin the current behaviour, in which Korean resolves to `generated` or at best `mixed`, as though it were the intended outcome.

- Goal: Korean text produces `source-adapted` plans in the browser, and a regression would be caught.
- Tests (first): `한글` and a complex-batchim syllable resolve to source plans; stroke count equals the sum of the jamo counts; the demo's action label reads "Animate strokes" for Korean.
- Acceptance (measurable): `check-font-animation` gains Korean source-adapted cases and reports a non-zero Korean `sourcePaths`, the way it reports 54/57 English and 29/154 Chinese today.
- Touched areas: `scripts/check-font-animation.cjs`, `demo/multilingual/`, `docs/multilingual.md`.
- Dependencies: WI-003.
- Risks + mitigations: composed blocks are larger than jamo, so tile budgets and the 8,192-stroke ceiling need checking against the longest syllable; assert rather than assume.
- Rollback: revert the gate cases with the pack.
- Priority / estimate: P0 / M.

### WI-005: GlyphWiki writing-order verification spike

- Goal: Answer whether KAGE stroke sequence equals writing order, and therefore whether the YES route is needed at all.
- Tests (first): sample at least 300 kanji present in both GlyphWiki and KanjiVG, stratified by stroke count; compare stroke sequence after normalising geometry.
- Acceptance (measurable): a reported agreement rate with the disagreement cases characterised. Above roughly 99% makes GlyphWiki usable with spot review; a structural disagreement pattern kills the route outright.
- Touched areas: scratch and a research note.
- Dependencies: none. Can run in parallel with WI-002.
- Risks + mitigations: GlyphWiki glyph naming is not Unicode-keyed throughout; restrict the sample to unambiguously mapped names rather than guessing.
- Rollback: nothing.
- Priority / estimate: P1 / S. **Gate: WI-006 scope depends on this.**

### WI-006: Chinese coverage expansion

- Goal: Raise Chinese from 9,574 toward 20,992.
- Tests (first): defined once the route is chosen. For the GlyphWiki route, agreement against the existing 9,574 on the overlap. For the YES route, a trail-to-stroke-type classifier validated against known sequences.
- Acceptance (measurable): coverage count and an overlap agreement rate against present data, with no regression on the existing 9,574.
- Touched areas: importers under `scripts/data/`, a new pack, `fonts/motor/chinese.json`.
- Dependencies: WI-005 reports.
- Risks + mitigations: the YES route needs a classifier and an assignment solver, neither of which exists; if WI-005 kills GlyphWiki, re-scope this as its own plan rather than absorbing an open-ended build here.
- Rollback: remove from the motor index; existing coverage is untouched.
- Priority / estimate: P2 / L, conditional.

### WI-007: Narrow the claims to what is true

**Status:** DONE — 2026-09-11
**Changed:** README.md, docs/fonts.md, docs/multilingual.md, CHANGELOG.md
**Verified:** yarn prettier-check — all matched files pass; yarn check-fonts — 120 script entries, catalogue field asserted against the motor index. Rendering and instruction are now stated separately in all four files, each pointing at the survey for the reason.
**Deviation:** the item wanted "final counts from WI-003", which is blocked. The documentation therefore records the counts as they actually are, including that Korean's 40 units are isolated jamo and ordinary Korean text falls back to a generated sequence. Naming that gap is more useful than waiting for a number that does not exist yet, and it will need one edit when WI-003 lands.

- Goal: Documentation says stroke order works for four scripts and rendering works for 120 entries, as two separate statements.
- Tests (first): documentation lint and diff review; no runtime gate.
- Acceptance (measurable): `README.md`, `docs/fonts.md`, `docs/multilingual.md` and `CHANGELOG.md` carry the distinction; Devanagari and the remaining scripts appear in a deferred section with the reason from the research note.
- Touched areas: documentation only.
- Dependencies: WI-001 for the field name; final counts from WI-003.
- Risks + mitigations: none.
- Rollback: revert.
- Priority / estimate: P0 / S.

## Observability and Performance

Report composed unit count, per-syllable stroke count distribution, and the largest composed block against the preparer's 8,192-stroke and one-million-point ceilings. Record pack size before and after any range split. `check-font-animation` should report Korean source-path counts alongside the existing English and Chinese figures so a coverage regression is visible in one line of gate output.

## Testing Procedures

Run focused tests during work. Required full gates before completion: `yarn prettier-check`, `yarn lint-test`, `yarn typecheck`, `yarn test --runInBand`, `yarn test-data`, `yarn check-data`, `yarn check-data-reproducible`, `yarn build`, `yarn check-demo`, `yarn check-fonts`, `yarn test-fonts`, `yarn check-font-coverage`, `yarn check-package`, `yarn check-multilingual-demo`, `yarn check-font-demo`, `yarn check-font-animation`, `yarn check-font-contours`, `yarn check-font-sources`.

Build before the browser gates. They load `dist/`, and a stale bundle silently tests the previous code, which happened during the font work at `441651e3` and cost a full gate cycle. Regenerate `fonts/catalog.lock.json` and re-run `node scripts/fonts/stamp-demo.cjs` whenever catalogue or `extras/fonts` content changes; both are hash-pinned and both have gone stale in this repository before.

## Rollout Plan

Korean ships as a technical preview alongside the existing packs, opt-in through the same motor index. No default changes for Chinese or Japanese. Kill switch is removal from the motor index, which restores today's generated-plan behaviour exactly. The catalogue metadata from WI-001 ships first and independently, because it is useful whether or not any coverage work follows.

## Plan → Verify Handoff

Record: the WI-002 fit outcomes per font and layout class; the WI-005 agreement rate and disagreement characterisation; final composed unit count and pack size; the Korean figures newly reported by `check-font-animation`; and each work item's status. Required fixtures are one syllable per layout class, one with a complex batchim, one whose jamo appear in no other test, and a malformed composition that the validator must reject.

Mark WI-006 explicitly as scoped-or-deferred based on the WI-005 answer. Do not carry it as open work if the spike killed its cheap route.
