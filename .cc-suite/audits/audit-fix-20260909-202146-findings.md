# Audit Findings

**Run**: audit-fix 20260909-202146 | **Scope**: branch `chore/modernize-toolchain-and-harden` vs `master`, shipped code only (35 files, 9,044 lines) | **Audit type**: full (9 dimensions)
**Model**: gpt-6-astra | **Effort**: high | **Sandbox**: read-only | **Batches**: 7
**Status values**: open | fixed | not-fixed | partial | regressed | rejected (policy) | deferred

| # | File | Line | Severity | Dim | Finding | Status |
|---|------|------|----------|-----|---------|--------|
| 1 | src/Scribing.ts | 167  |  Low  |  1  |  Character and outline visibility methods duplicate mutation construction, duration selection, and completion handling  | open |
| 2 | src/Scribing.ts | 401  |  Medium  |  3  |  updateColor('highlightCompleteColor', null) throws despite this color supporting null  | open |
| 3 | src/Scribing.ts | 487  |  Medium  |  3  |  Replacing a canvas character leaves its previous drawing visible after loading fails because canvas renderer destruction does not clear it  | open |
| 4 | src/Scribing.ts | 538  |  Low  |  5  |  _setUnit exceeds 50 lines and combines request validation, cancellation, loading, compilation, mounting, and error bookkeeping  | rejected (policy) |
| 5 | src/Scribing.ts | 708  |  Medium  |  3  |  Copying highlightColor into the default highlightCompleteColor prevents completion highlighting from following subsequent highlightColor up | rejected (policy) |
| 6 | src/Scribing.ts | 740  |  Low  |  9  |  The comment promises undefined for failed or superseded loads, but rejected loading promises propagate rejection  | open (doc) |
| 7 | src/RenderState.ts | 81  |  Low  |  5  |  The constructor exceeds 50 lines and combines option conversion with repetitive layer initialization  | deferred |
| 8 | src/RenderState.ts | 95  |  Medium  |  3  |  Default radicalColor captures the initial strokeColor, leaving radical strokes unchanged when strokeColor changes  | open |
| 9 | src/RenderState.ts | 199  |  Medium  |  3  |  Rejected mutations and later synchronous mutation failures leave run() pending, retain the chain, and produce unhandled rejections  | open |
| 10 | src/RenderState.ts | 212  |  Medium  |  3  |  Pausing after an instantaneous mutation pauses the completed object while the next mutation starts unpaused  | open |
| 11 | src/RenderState.ts | 223  |  Low  |  3  |  Prefix matching incorrectly treats sibling scopes such as strokes.1 and strokes.10 as conflicting  | fixed |
| 12 | src/RenderState.ts | 224  |  Medium  |  6  |  Every matching scope pair cancels the same chain again, repeatedly applying forced mutations and rendering  | fixed |
| 13 | src/Mutation.ts | 53  |  Medium  |  3  |  Pausing overwrites the configured delay, shortening subsequent animation-loop iterations  | open |
| 14 | src/Mutation.ts | 117  |  Medium  |  3  |  Negative or infinite durations create animations that never complete; zero animation speed produces an infinite duration  | open |
| 15 | src/Mutation.ts | 123  |  Medium  |  3  |  Reused mutations retain accumulated pause time, causing negative progress and delayed completion in later loop iterations  | open |
| 16 | src/Mutation.ts | 133  |  Low  |  9  |  Mutation.run never assigns _runningPromise despite the interface advertising it as a running-state indicator  | open (doc) |
| 17 | src/Mutation.ts | 187  |  Medium  |  3  |  A renderer exception during a frame escapes without settling the animation promise, leaving its chain pending  | open |
| 18 | src/Mutation.ts | 218  |  Medium  |  3  |  Animating radicalColor after resetting it to null produces object-valued color channels because numeric starting values are absent  | open |
| 19 | src/Mutation.ts | 219  |  Medium  |  3  |  Negative numeric targets enter object recursion and become empty objects during interpolation  | fixed |
| 20 | src/LoadingManager.ts | 97  |  Medium  |  6  |  Cancellation settles the promise but leaves superseded default-loader requests downloading until completion or timeout  | open |
| 21 | src/Positioner.ts | 48  |  Medium  |  3  |  The minimum-size clamp does not reject nonfinite dimensions or padding, allowing public scaling calls to return NaN transforms  | fixed |
| 22 | extras/fonts/animation.mjs | 48  |  Low  |  5  |  validSourceRecord has 65 lines and cyclomatic complexity 41  | rejected (policy) |
| 23 | extras/fonts/animation.mjs | 119  |  Low  |  5  |  Source-loader callback has 158 lines and cyclomatic complexity 40  | rejected (policy) |
| 24 | extras/fonts/animation.mjs | 153  |  Low  |  9  |  Parsing discards the underlying exception despite MotorSourceError documenting parse-cause preservation  | open (doc) |
| 25 | extras/fonts/animation.mjs | 162  |  Medium  |  2  |  Index JSON and group arrayBuffer responses are fully buffered before size enforcement, allowing oversized responses to exhaust memory  | open |
| 26 | extras/fonts/animation.mjs | 360  |  Low  |  5  |  registerSource has 218 nonblank, noncomment lines and cyclomatic complexity 57  | rejected (policy) |
| 27 | extras/fonts/animation.mjs | 381  |  Medium  |  3  |  Spreading source coordinates into Math.min/max crashes on an accepted 150,000-point record, below the million-point limit  | fixed |
| 28 | extras/fonts/animation.mjs | 405  |  Medium  |  6  |  Resampling can expand bounded source records into millions of points per candidate; fifteen candidates run without a sampling budget  | open |
| 29 | extras/fonts/animation.mjs | 583  |  Low  |  5  |  registerKoreanPilot has 143 nonblank, noncomment lines and cyclomatic complexity 24  | rejected (policy) |
| 30 | extras/fonts/animation.mjs | 729  |  Low  |  5  |  prepareFontAnimation has 284 nonblank, noncomment lines and cyclomatic complexity 58  | rejected (policy) |
| 31 | extras/fonts/animation.mjs | 774  |  Medium  |  3  |  Area-only sizing permits a 25,604 × 30 tile for a valid narrow glyph, exceeding the core's 16,384-pixel edge limit  | open |
| 32 | extras/fonts/animation.mjs | 1004  |  Medium  |  3  |  Cancellation during the final pause still resolves with a completed animation because no subsequent signal check runs  | open |
| 33 | extras/fonts/progress.mjs | 8  |  Low  |  5  |  turnField has 76 lines and cyclomatic complexity 19  | rejected (policy) |
| 34 | extras/fonts/progress.mjs | 169  |  Low  |  5  |  indexTrail spans 64 lines  | rejected (policy) |
| 35 | extras/fonts/progress.mjs | 233  |  Low  |  5  |  projectCurveProgress has 107 nonblank, noncomment lines and cyclomatic complexity 39  | rejected (policy) |
| 36 | extras/fonts/progress.mjs | 245  |  Low  |  6  |  Complete first-trail indexing occurs before checking an already-aborted signal; large trails perform substantial unnecessary work  | open |
| 37 | extras/fonts/provider.mjs | 49  |  Low  |  5  |  validateSfnt has cyclomatic complexity 17  | open |
| 38 | extras/fonts/provider.mjs | 121  |  Low  |  5  |  validateText has cyclomatic complexity 18  | open |
| 39 | extras/fonts/provider.mjs | 174  |  Medium  |  2  |  Missing or empty catalog sha256 silently disables the documented pinned integrity comparison  | open |
| 40 | extras/fonts/provider.mjs | 220  |  Medium  |  2  |  Responses without a trustworthy Content-Length are fully buffered before the 32 MiB limit is enforced  | open |
| 41 | extras/fonts/provider.mjs | 234  |  Low  |  5  |  shapeLoaded spans 113 lines  | rejected (policy) |
| 42 | extras/fonts/provider.mjs | 269  |  Low  |  5  |  Glyph-mapping callback has 56 lines and cyclomatic complexity 21  | rejected (policy) |
| 43 | extras/fonts/provider.mjs | 363  |  Low  |  6  |  shapeCustom copies oversized buffers before validating their byte length, unnecessarily duplicating potentially huge allocations  | open |
| 44 | extras/fonts/skeleton.mjs | 7  |  Low  |  9  |  Exported helpers lack contracts for binary masks, dimensions, coordinate validity, owner limits, mutation, and cancellation  | open (doc) |
| 45 | extras/fonts/skeleton.mjs | 232  |  Medium  |  6  |  Merging compares every disconnected trail pair synchronously; 8,192 separated strokes blocked the event loop for approximately 2.23 seconds | open |
| 46 | extras/fonts/skeleton.mjs | 261  |  Medium  |  3  |  Spreading long trails into Math.min throws RangeError; reproduced with a 1,206,808-cell mask within the caller’s cell limit  | fixed |
| 47 | extras/fonts/skeleton.mjs | 300  |  Low  |  3  |  nearestSkeletonMap can resolve after cancellation during its final yield; empty inputs also bypass cancellation, as does componentTrails  | open |
| 48 | extras/fonts/skeleton.mjs | 302  |  Medium  |  2  |  Unvalidated dimensions can make holeCount loop indefinitely; holeCount(new Uint8Array(1), 3, 3) repeatedly enqueues beyond its buffers  | open |
| 49 | extras/fonts/skeleton.mjs | 372  |  Medium  |  2  |  Non-finite or excessively long trail segments produce unbounded synchronous sampling without cancellation checks  | open |
| 50 | extras/fonts/skeleton.mjs | 379  |  Medium  |  3  |  Owner IDs silently wrap in Uint16Array; startIndex 65535 assigns owner zero and defeats the visited sentinel  | open |
| 51 | extras/fonts/skeleton.mjs | 487  |  Medium  |  3  |  Spreading all component areas into Math.max can exceed the engine’s argument limit on highly fragmented masks  | fixed |
| 52 | extras/fonts/skeleton.mjs | 576  |  Medium  |  5  |  repairSourceJunctions spans 1,052 lines with deeply nested repair strategies and shared mutable bookkeeping  | open |
| 53 | extras/fonts/skeleton.mjs | 706  |  Low  |  7  |  Work-budget exhaustion lacks a regression covering discarded current-pair updates and previously committed repairs  | deferred (test gap) |
| 54 | extras/fonts/skeleton.mjs | 936  |  Low  |  1  |  Each segment stores an arc property that is never read  | open |
| 55 | extras/fonts/skeleton.mjs | 1003  |  Low  |  1  |  Profile entries retain normal vectors that no consumer reads  | open |
| 56 | src/fonts/FontWriter.ts | 456  |  High  |  2  |  Valid oversized tile bounds can request a 26,800,003×26,800,003 backing canvas for a 300×300 writer, bypassing allocation limits  | fixed |
| 57 | src/fonts/FontWriter.ts | 183  |  Medium  |  3  |  Concurrent setAnimation calls share a serial; the older request can attach first and reject the newer request as superseded  | open |
| 58 | src/fonts/FontWriter.ts | 75  |  Medium  |  3  |  Explicitly undefined optional properties overwrite defaults; padding is then validated as 16 but rendered as 0  | open |
| 59 | src/fonts/FontWriter.ts | 557  |  Medium  |  6  |  Every canvas render reassigns backing dimensions, resetting the drawing buffer even when dimensions are unchanged  | open |
| 60 | src/fonts/FontWriter.ts | 574  |  Medium  |  6  |  Every SVG frame removes the complete scene and recreates reference outlines and learner strokes  | open |
| 61 | src/fonts/FontWriter.ts | 21  |  Low  |  1  |  The host field is assigned but never read and unnecessarily retains the host element  | open |
| 62 | src/fonts/FontWriter.ts | 688  |  Low  |  1  |  move repeats the finite-coordinate and magnitude checks already guaranteed by point  | open |
| 63 | src/fonts/FontWriter.ts | 242  |  Low  |  1  |  The cancellation callback duplicates the existing checkpoint closure  | open |
| 64 | src/fonts/FontWriter.ts | 127  |  Low  |  5  |  setShape spans 51 lines and combines validation, raster verification, hashing, and state replacement  | rejected (policy) |
| 65 | src/fonts/FontWriter.ts | 181  |  Low  |  5  |  setAnimation spans 80 lines and has cyclomatic complexity 16, exceeding both requested thresholds  | rejected (policy) |
| 66 | src/fonts/FontWriter.ts | 261  |  Low  |  5  |  animate spans 67 lines and combines duration calculation, scheduling, looping, and completion handling  | rejected (policy) |
| 67 | src/fonts/FontWriter.ts | 546  |  Low  |  5  |  render spans 68 lines and combines two renderer implementations with scene preparation  | rejected (policy) |
| 68 | src/fonts/FontWriter.ts | 730  |  Low  |  5  |  check spans 63 lines and combines bounds calculation, rasterization, and comparison  | rejected (policy) |
| 69 | src/fonts/animationMask.ts | 50  |  Medium  |  3  |  The fixed 16384 neighbor cutoff makes a valid four-cell linear stroke reveal in whole-cell jumps, including an abrupt final-cell fill  | open |
| 70 | src/fonts/animationMask.ts | 156  |  Medium  |  3  |  Per-tile normalization destroys global timing when one stroke spans multiple tiles; early and late tiles reveal simultaneously  | open |
| 71 | src/fonts/animationMask.ts | 201  |  Medium  |  6  |  completedOutline performs potentially large edge collection and ring tracing without yielding or checking cancellation; a 65,536-cell spars | open |
| 72 | src/fonts/animationMask.ts | 433  |  Medium  |  6  |  Every changing frame scans the entire tile, allocates per-cell arrays, and reconstructs outlines; a 65,536-cell fixture took approximately  | open |
| 73 | src/fonts/animationMask.ts | 21  |  Low  |  5  |  progressGradients has cyclomatic complexity 17, exceeding the requested threshold  | open |
| 74 | src/fonts/animationMask.ts | 251  |  Low  |  5  |  collectEdges spans 74 lines and combines primitive parsing, edge cancellation, and winding-event expansion  | rejected (policy) |
| 75 | src/fonts/animationMask.ts | 424  |  Low  |  5  |  activeStrokeAt has cyclomatic complexity 16, exceeding the requested threshold  | open |
| 76 | src/fonts/animationMask.ts | 472  |  Low  |  9  |  The documentation claims quantized-step memoization, while the implementation deliberately keys on exact progress  | open (doc) |
| 77 | src/fonts/pathGeometry.ts | 50  |  Medium  |  4  |  The separator regex accepts U+00A0 and other whitespace outside the SVG path grammar, allowing validation and native parsing to disagree  | open |
| 78 | src/fonts/pathGeometry.ts | 154  |  Medium  |  3  |  Fixed 16-segment curve sampling can leave contourProbes with no accepted candidates for a nonempty thin curved contour, weakening coverage  | open |
| 79 | src/fonts/pathGeometry.ts | 314  |  Medium  |  6  |  Every probe row scans every contour segment synchronously; a 35,231-character fixture required roughly 64 million segment checks and 105 ms | open |
| 80 | src/fonts/pathGeometry.ts | 109  |  Low  |  9  |  The comment promises signed area, but accumulation takes absolute values and adds hole areas  | open (doc) |
| 81 | src/fonts/pathGeometry.ts | 114  |  Low  |  5  |  createBoundsAccumulator spans 78 lines and combines extrema, curve sampling, contour area, and finalization  | rejected (policy) |
| 82 | src/fonts/pathGeometry.ts | 194  |  Low  |  5  |  pathGeometry spans 105 lines, exceeding the requested function-length threshold  | rejected (policy) |
| 83 | src/fonts/pathGeometry.ts | 217  |  Low  |  5  |  The nested step function spans 53 lines and handles every supported drawing command  | rejected (policy) |
| 84 | src/fonts/validateShape.ts | 21  |  Low  |  3  |  Text validation accepts C1 control characters, including U+0085 and U+009B  | open |
| 85 | src/fonts/validateShape.ts | 98  |  Low  |  9  |  Cluster offsets are documented as bytes but calculated as UTF-16 code units  | open (doc) |
| 86 | src/fonts/validateShape.ts | 165  |  Low  |  7  |  Tests omit boundary cases for glyph count, text length, EM size and aggregate path length  | deferred (test gap) |
| 87 | src/fonts/validateAnimation.ts | 49  |  Medium  |  6  |  Copying one million point references blocks synchronously before pacing begins; locally measured at 105 ms  | open |
| 88 | src/fonts/validateAnimation.ts | 52  |  Low  |  6  |  Every point creates and awaits a pacing promise although only every 8192nd point yields  | open |
| 89 | src/fonts/validateAnimation.ts | 126  |  Low  |  5  |  readTile exceeds 50 lines and combines resource budgets, bounds, glyph assignment and ownership validation  | rejected (policy) |
| 90 | src/fonts/validateAnimation.ts | 187  |  Medium  |  3  |  Ownership exclusively in tile padding counts as a drawn stroke, allowing invisible playback steps that survive downstream ink-coverage chec | open |
| 91 | src/fonts/validateAnimation.ts | 199  |  Low  |  9  |  Documentation claims this validator rejects uncovered ink, but the raster coverage check occurs later in FontWriter  | open (doc) |
| 92 | src/fonts/validateAnimation.ts | 203  |  Low  |  7  |  Tests omit rejection boundaries for stroke count, aggregate points, tile count, tile dimensions and aggregate cells  | deferred (test gap) |
| 93 | src/fonts/yieldWork.ts  |  |  CLEAN |  |  | open |
| 94 | src/fonts/types.ts | 3  |  Low  |  3  |  FontShape permits mutations that throw or silently fail on the deeply frozen instance returned by getShape  | open |
| 95 | src/validation/plainStructure.ts | 66  |  Low  |  3  |  A Proxy can remove an enumerated property before descriptor retrieval, causing an uncontrolled TypeError instead of fail with the offending | open |
| 96 | src/validation/plainStructure.ts | 160  |  Low  |  3  |  Prototype checks accept a Float64Array reparented to Uint16Array.prototype; copying silently converts values such as 65537 and -1 into 1 an | open |
| 97 | src/Quiz.ts | 55  |  Medium  |  3  |  Negative out-of-range, fractional, and NaN start indices survive normalization and crash stroke grading  | fixed |
| 98 | src/Quiz.ts | 78  |  Medium  |  6  |  Every attempted stroke remains retained, including after normal completion, accumulating point arrays and hidden SVG elements  | open |
| 99 | src/Quiz.ts | 88  |  Medium  |  6  |  Unbounded gesture growth combined with copying all points on every movement produces quadratic allocation work  | open |
| 100 | src/Quiz.ts | 95  |  Medium  |  3  |  Resizing during drawing mixes points converted with different positioners in one gesture  | open |
| 101 | src/Quiz.ts | 98  |  Low  |  5  |  endUserStroke spans 67 lines and combines grading, callbacks, hints, and lifecycle cleanup  | rejected (policy) |
| 102 | src/Quiz.ts | 139  |  Medium  |  3  |  Throwing feedback callbacks bypass gesture cleanup; throwing onCorrectStroke also prevents advancement, allowing the same stroke to be grad | open |
| 103 | src/Quiz.ts | 201  |  Medium  |  3  |  Skipping during an active gesture advances the target while retaining the previous stroke's input, which is then graded against the next ta | open |
| 104 | src/Quiz.ts | 136  |  Low  |  7  |  Quiz tests mock strokeMatches, leaving backwards acceptance combined with stroke-order disambiguation untested  | deferred (test gap) |
| 105 | src/quizActions.ts | 37  |  Low  |  1  |  quiz.activeUserStrokeId is written but never read anywhere in the repository  | open |
| 106 | src/quizActions.ts | 66  |  Low  |  1  |  A disabled removal mutation remains as commented-out code  | open |
| 107 | src/quizActions.ts | 74  |  Medium  |  6  |  Removal assigns null instead of deleting entries; stroke keys accumulate across quizzes and remain part of every state copy and renderer tr | open |
| 108 | src/quizActions.ts | 92  |  Low  |  1  |  The highlightStroke re-export has no consumers  | open |
| 109 | src/strokeMatches.ts | 50  |  Medium  |  3  |  Backwards matches return before later-stroke disambiguation, allowing acceptBackwardsStrokes to accept a later stroke that its forward equi | open |
| 110 | src/strokeMatches.ts | 144  |  Low  |  6  |  Curve normalization repeats for the same gesture and reference strokes across candidate checks and reverse retries  | open |
| 111 | src/strokeMatches.ts | 147  |  Low  |  6  |  All five Frechet comparisons execute even after a rotation satisfies the acceptance threshold  | open |
| 112 | src/strokeMatches.ts | 185  |  Low  |  1  |  withinDistThresh is redundantly checked after its false branch has already returned  | open |
| 113 | src/utils.ts | 19  |  Medium  |  3  |  Error normalization itself throws for values such as Object.create(null), disrupting loader rejection handling  | fixed |
| 114 | src/utils.ts | 41  |  Low  |  2  |  The merge imports inherited override properties and lets an own __proto__ key change the returned object's prototype  | open |
| 115 | src/utils.ts | 63  |  Low  |  9  |  The comment describes reading a nested value, but inflate constructs a nested object  | open (doc) |
| 116 | src/utils.ts | 70  |  Low  |  3  |  A scope containing __proto__ changes a container's prototype instead of creating the requested own property  | open |
| 117 | src/utils.ts | 120  |  Low  |  3  |  RGB components and alpha lack finite-value and range checks; a 400-digit component becomes Infinity and reaches rendering  | open |
| 118 | src/units/gradeStroke.ts | 72  |  Medium  |  3  |  Forward matching wins even when the reverse fit is exact; a reversed 100-unit straight stroke is accepted with forward direction and lenien | open |
| 119 | src/units/provider.ts | 32  |  Low  |  5  |  createDataProvider spans 55 lines and combines manifest validation, snapshotting, indexing, aliases, and loading  | rejected (policy) |
| 120 | src/units/provider.ts | 35  |  Medium  |  4  |  Manifest checks accept missing name, version, provenance, and source.name, plus object-valued license and source.url  | open |
| 121 | src/units/provider.ts | 81  |  Low  |  6  |  Each load fully revalidates private cached geometry despite construction-time validation and isolated returned copies  | open |
| 122 | src/units/validateUnit.ts | 44  |  Low  |  5  |  validateUnit spans 93 lines and combines coordinate, stroke, segment, and plan validation  | rejected (policy) |
| 123 | src/renderers/RenderTargetBase.ts | 42  |  Medium  |  3  |  Any document touchend terminates the current stroke, including release of an unrelated finger; touchcancel has the same problem  | open |
| 124 | src/renderers/RenderTargetBase.ts | 88  |  Medium  |  3  |  touches[0] can select a finger outside the writing target, producing incorrect stroke coordinates  | open |
| 125 | src/renderers/ScribingRendererBase.ts | 21  |  Low  |  4  |  The any target parameters accept incompatible renderers, including a mount method requiring a number  | open |
| 126 | src/renderers/svg/RenderTarget.ts | 48  |  Medium  |  3  |  Supported g targets lack createSVGPoint, so coordinate conversion falls back to painted bounding-box subtraction and ignores their coordina | open |
| 127 | src/renderers/svg/RenderTarget.ts | 77  |  Low  |  7  |  SVG pointer unit tests exercise only bounding-rectangle fallback, leaving inverse-CTM, missing-matrix, and singular-matrix branches unteste | deferred (test gap) |
| 128 | src/renderers/svg/ScribingRenderer.ts | 47  |  Low  |  5  |  The 63-line render method combines character-layer rendering with user-stroke creation, updates, and removal  | open |
| 129 | src/renderers/svg/ScribingRenderer.ts | 113  |  Medium  |  3  |  Destroying one renderer empties shared defs and invalidates clip paths belonging to other renderers mounted on the same target  | open |
| 130 | src/renderers/svg/CharacterRenderer.ts | 52  |  Medium  |  6  |  Omitted radicalColor becomes null but is compared against previous undefined, unnecessarily rerendering every outline and highlight stroke  | open |
| 131 | src/renderers/canvas/RenderTarget.ts | 5  |  Low  |  1  |  The constructor only forwards its argument to super and duplicates the inherited constructor  | open |
| 132 | src/renderers/canvas/RenderTarget.ts | 32  |  Medium  |  3  |  Default percentage attributes produce 100-pixel bitmap dimensions; supplying only width:300 produces a 300×100 canvas with a 300×300 Positi | open |
| 133 | src/renderers/canvas/RenderTarget.ts | 46  |  Medium  |  3  |  Pointer scaling uses the border-box rectangle as the drawable content area, offsetting and distorting coordinates when canvas borders or pa | open |
| 134 | src/renderers/canvas/ScribingRenderer.ts | 33  |  Medium  |  3  |  No-op destruction leaves the previous character visible during replacement loading and indefinitely after a failed replacement  | open |
| 135 | src/renderers/canvas/ScribingRenderer.ts | 37  |  Medium  |  3  |  Non-null assertions allow an unavailable 2D context to cause a null dereference on the first frame  | open |
| 136 | src/renderers/canvas/ScribingRenderer.ts | 43  |  Medium  |  3  |  A drawing exception skips restore, retaining saved state and transforms that corrupt subsequent frames  | open |
| 137 | src/typings/types.ts | 113  |  Low  |  9  |  strokeWidth is exposed as a configurable option but neither built-in renderer consumes it  | open (doc) |
| 138 | src/typings/types.ts | 115  |  Low  |  9  |  outlineWidth is exposed as a configurable option but has no effect on rendered outlines  | open (doc) |
| 139 | src/typings/types.ts | 128  |  Low  |  9  |  Inheriting PositionerOptions exposes bounds, but Scribing ignores caller-provided bounds when constructing its Positioner  | open (doc) |
