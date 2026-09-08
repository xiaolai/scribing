# Clean textbook-style models

The earlier multilingual demo exposed rough recorded shapes alongside source-defined English templates. The source-defined A also used a two-stroke formation. This change adds deliberately authored manuscript models and makes clean English the default.

## Delivered scope

- `english-textbook`: 52 letters, 85 motor strokes; common cap line, lowercase height and baseline; single-storey a/g, explicit i/j dots, and three-stroke A with both diagonals starting at the apex.
- `korean-textbook`: 40 standalone modern jamo, 118 motor strokes; original geometric paths and explicit source-referenced pen movements. This pack does not compose syllable blocks.
- The default model view includes the two new packs and existing KanjiVG vector models. Older letterpaths/glyphed templates and all recorded samples remain accessible under Source samples.
- New models are MIT original geometry. No font outlines, source drawings or raw recordings were traced or mechanically relabelled as textbook models. Each authored source, per-glyph model and notice has a retained hash.

These are clean manuscript practice models, not exact reproductions of a named typeset font. Stroke plans describe selected formation conventions; educator certification and learner studies have not been completed. Other scripts still need separately authored and reviewed clean models.

## Formation references

English movement principles were checked against the [University of Utah Reading Clinic](https://uurc.utah.edu/general/letterformation.php), with documented choices where conventions differ. A's three-stroke formation also agrees with [NSW Department of Education, page 9](https://education.nsw.gov.au/content/dam/main-education/en/home/teaching-and-learning/curriculum/literacy-and-numeracy/teaching-and-learning-resources/effective-reading/phonics/Handwriting-a-guide-for-parents.pdf).

Korean sequences were checked visually against [EPS Hangeul introduction, PDF pages 2–6](https://www.eps.go.kr/exam/Hanguel.pdf). The source-specific choices for ㅁ, ㅌ, ㅈ/ㅊ and circles are documented in the authored source notes. The reference informs motor order, not the new coordinates or visual design.

## Validation

- Root inspected contact sheets of all 92 new models rendered by the actual Scribing SVG runtime, after inspecting original-path contact sheets. No clipping, missing marks or visibly rough contours found.
- All 19 data tests passed, including four authored-model checks. The new checks cover A direction/pen lifts, all 40 Korean mappings, shared frames, visible dots, hidden pen lifts and clipping.
- The runtime validator and compiler accepted all 8,720 models across 149 packs; source/license/raw hashes verified, with no quarantines.
- All 498 generated artifacts reproduced byte for byte. A later edit restored prior formatting in unchanged code; no generation logic changed.
- Real Chromium gate passed with exit 0: 24 mouse-driven traces using SVG and Canvas at widths 960 and 320, including new A/i/ㅏ plus existing English i and Japanese あ/ぬ. View defaults, all source access, wrong-order feedback, active/queued cancellation and delayed-response switching passed. Zero external requests and zero page errors.
- Independent architect audit found no blocking issue. All 147 prior pack hashes and every raw-observation hash match the preceding commit exactly; 32,460 original observations remain intact.

No engine/runtime source changed, so the previously built bundle was used for browser checks. Core package gates were not repeated for this data/demo change. Neither source replay nor geometric validation establishes teaching effectiveness.
