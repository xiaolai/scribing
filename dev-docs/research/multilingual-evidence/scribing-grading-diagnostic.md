# Selected-model grading diagnostic

## Current v2 result (final refreshed evidence)

Regenerated `scribing-centerline-import-v2` packs select `0643_11.txt` for character01. The unchanged runtime grader now accepts7/17 other complete same-pen-count recordings at strict1,11/17 at1.5, and13/17 at2. Direction flexibility still changes no result. This replaces the v1 baseline0/7/13 outcomes below; the v1 analysis is retained as audit history, not a claim about current packs.

| Selection | Leniency1 strokes / whole | Leniency1.5 strokes / whole | Leniency2 strokes / whole |
|---|---|---|---|
| v1 aspect-ratio exemplar17 | 5/34;0/17 |20/34;7/17 |29/34;13/17 |
| v2 observed medoid11 |17/34;7/17 |26/34;11/17 |29/34;13/17 |

The v2 source suite passes unchanged, including visually inspected01/07 positives at1.5 and recordedㅇ loop reversal. The selectedㅇ still has its long loop at motor index1; no assertion weakening or index adaptation was needed. New selected-example choice uses the source class itself, so these numbers remain descriptive generalization checks, not an independent accuracy evaluation or native curriculum validation. Raw observations were not modified.

Current manifest/source hashes are recorded in `scribing-grading-evidence-medoid.json`; historical aligned points remain in `scribing-grading-evidence.json`. The JSON reports include exact per-stroke rejection categories and selected asset SHA256.

## Historical v1 diagnostic

The poor strict result is geometric, not direction-related. The current default rejects visually similar recordings of this one selected source model. This does not establish that all other class recordings should pass, or justify globally relaxing every script's grader.

## Reproducible sample

- Omniglot Korean character01, visually mapped ㅏ; 20 recordings total. Selected model: `strokes_background/Korean/character01/0643_17.txt`, SHA256 `e0fc04b8e544bcd105f3542fc1202c4a6954cdec5e03a26b5d1b1ffee373399d`.
- Source pin: archive SHA256 `c1e445d158fd74b6adf81f1387ebe051f5a23923bdb0c16f539d6e707ce056d4` from the Omniglot repository. Source bundle and generated pack hashes verified against their lock/manifest in the Jest suite.
- Nineteen other recordings; two have different pen-lift counts and are excluded from same-plan comparison. Seventeen two-stroke recordings supply 34 compared strokes.
- Diagnostic registration: each recording is uniformly scaled to em=1024 and translated to the selected model's bounding-box center. No independent axis stretching, per-stroke alignment, rotation, order changes, pen-lift repair or reversal. This registration is more forgiving than actual on-canvas input; these results are not user-study accuracy estimates.

| Leniency | Direction | Accepted strokes /34 | Accepted complete recordings /17 |
|---|---|---:|---:|
| 1 | forward | 5 | 0 |
| 1 | either | 5 | 0 |
| 1.5 | forward | 20 | 7 |
| 1.5 | either | 20 | 7 |
| 2 | forward | 29 | 13 |
| 2 | either | 29 | 13 |

| Leniency | Stem reasons | Horizontal reasons |
|---|---|---|
| 1 | 16 wrong-shape, 1 outside-target | 5 correct, 6 wrong-shape, 6 outside-target |
| 1.5 | 11 correct, 5 wrong-shape, 1 outside-target | 9 correct, 7 wrong-shape, 1 outside-target |
| 2 | 15 correct, 2 wrong-shape | 14 correct, 3 wrong-shape |

No wrong-direction or too-short result appears in this sample. Allowing either direction makes no difference. This class is not a clockwise/counterclockwise-loop example; recorded ㅇ and synthetic closed-loop direction are tested separately.

## Why strict rejects near-model forms

The selected stem ends with an upward return of about104 canonical units after reaching its lowest point. It may be a recording-end artifact or actual retracing; these data alone do not prove which. The prototype selector scores modal pen count, stationary fragments and median aspect ratio, and does not inspect this endpoint behavior. Blindly trimming it would violate source preservation and could erase legitimate motor information.

Visual comparison of the aligned vectors identifies `0643_01.txt` and `0643_07.txt` as similar to the selected two-stroke formation. Both pass at explicit leniency1.5, while translated versions and reversed stems still fail. These are now positive/negative regression fixtures, not certified teaching examples.

- `0643_01` stem: start error26.9, end112.5, mean70.1, max112.5 canonical units. Default endpoint threshold105 and mean threshold70 narrowly reject it. Horizontal stroke passes.
- `0643_07` stem: start42.7, end121.5, mean69.3, max121.5. The default endpoint threshold rejects it despite mean error below70. Horizontal stroke passes.
- `0643_14` has a broadly similar stem but horizontal-placement error around191 mean units; it remains rejected even at leniency2. `0643_19` also has a substantially higher horizontal attachment. These show why universal acceptance of every same-class recording is not a justified target.

## Recommendation

Preserve engine defaults during this audit and describe leniency1 as strict matching to the supplied model. Do not claim broad handwriting recognition or that raw recording packs have calibrated instruction-ready grading. Expose explicit leniency in the demo or example if desired;1.5 is a useful documented diagnostic setting for these inspected samples, not an evidence-based global default. Before changing defaults, inspect more classes/styles and include valid and invalid formations, especially dots, short strokes, closed loops, attachment positions and deliberate order violations. Improve candidate curation with endpoint/retrace diagnostics that prompt inspection instead of silently altering raw trajectories.

Artifacts: `scribing-grading-evidence.json` contains all aligned points and per-recording reasons; `scribing-grading-comparison.svg`/`.png` show selected gray geometry overlaid with first blue/second red strokes and start dots. Two different-pen-count samples are intentionally absent from that overlay.

Run from repository: `SCRIBING_GRADING_EVIDENCE=/private/tmp/scribing-grading-evidence.json npm test -- --runInBand --coverage=false sourceGrading-test`.

Latest verification: four source grading tests pass; typecheck and test-file ESLint pass. No runtime thresholds or defaults changed.

## Follow-up: bounded observed medoid selection

Compared all18 same-two-stroke recordings (including the original selected17), using the same whole-unit normalization and32 arc-length points per stroke. Candidate score is mean point distance across both strokes to each of the other17 recordings; stable source-path tie-break. No direction reversal, per-stroke alignment, reordering or generated averaging.

The observed medoid is `0643_11.txt`, mean pair distance77.96 canonical units. Next candidates:06 at79.13,01 at79.18. Keeping its actual raw points as the model gives:

| Leniency | Accepted strokes /34 | Complete recordings /17 |
|---|---:|---:|
| 1 | 17 | 7 |
| 1.5 | 26 | 11 |
| 2 | 29 | 13 |

Counts were verified against the actual TypeScript `gradeStroke` in a temporary Jest probe; probe passed and was removed. `medoid-diagnostic.py` and `scribing-medoid-evidence.json` preserve the experiment. This comparison reselects on the complete class, so it is a representativeness diagnostic, not an independent accuracy evaluation.

Recommendation: the medoid is a better bounded automatic exemplar choice than aspect-ratio median for this class. Apply only among eligible same-modal-pen-count recordings, retain provenance and actual motor paths, record the changed selection algorithm/score, and run all source regressions after rebuilding. It does not solve native curriculum validity or remove the need to inspect recording artifacts. Its improvement comes from choosing a more representative existing example, not loosening grading or manufacturing a consensus glyph.
