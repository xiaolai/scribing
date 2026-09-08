# Repository improvement audit — 2026-09-08

Implementation used three Astra agents at medium reasoning. The primary agent reviewed the changes, reproduced additional defects, requested follow-up fixes, and ran combined validation. This audit builds on the local Scribing rebrand.

## Completed findings

| Area | Defect and resulting behavior | Evidence |
| --- | --- | --- |
| Test reliability | Option-default tests launched unawaited network requests, causing DOM teardown failures. They now use local fixtures and await loading; fake clocks are uninstalled at teardown. | Full Jest suite completes. |
| Loading failures | Synchronous loader exceptions, malformed JSON, and XHR abort/timeout errors could escape or leave requests unsettled. Errors now reach the expected rejection/callback path once. | Loader regression tests. |
| Data validation | Malformed custom data reached geometry/rendering. Structural validation now reports clear errors before success or rendering. | Validator tests; all 9,574 installed Chinese character files pass. |
| Loading races | Old callbacks could mutate the current loading state; superseded promises stayed pending. Superseded/canceled loads now settle without data and stale callbacks cannot replace the current exercise. | Loading manager and writer race tests. |
| Independent consumers | Concurrent static loads sharing options canceled one another. Static calls now use independent loading managers. | Concurrent same-symbol/same-options test. |
| Resource lifecycle | Writers had no disposal method and accumulated global input listeners. Idempotent `destroy()` cancels work, detaches listeners, removes generated nodes, and preserves caller-owned SVG/canvas elements. | Disposal, pending-load, queued-action, and caller-owned-node tests. |
| Data-returning API | `getCharacterData()` could resolve undefined despite its return type. It now rejects if the requested data is unavailable or canceled. | Failed, superseded, and destroyed read tests. |
| Quiz cancellation | Cancel/restart could retain a stroke and grade it later. Inactive quizzes ignore input; touch cancellation discards the stroke without grading. | Cancel/restart/touchcancel tests. |
| Reentrant callbacks | Success/mistake/completion callbacks could destroy or restart an exercise, then old code could schedule new animations or alter the new session. Generation guards isolate each quiz session. | Four reproduced callback failures plus writer destroy/change-character integration tests. |
| Input coordinates | Canvas input used CSS pixel coordinates directly. It now accounts for display scaling. | Scaled mouse/touch tests; SVG mobile quiz verified in browser. |
| Geometry | Simplification erased collinear reversals and duplicate samples could poison matching. Reversals remain; duplicate vectors are omitted; degenerate curves reject safely. | Geometry and custom-stroke matching tests. |
| Geometry workload | Near-centered loop endpoints could cause billions of normalized samples. A curve-spread fallback and a 512-point normalization cap bound matching work. | Supplied near-closed curve and repeated-backtracking regressions. |
| Package declarations | Repository typecheck missed an invalid generated `default` return type. Explicit stroke typing and an isolated packed TypeScript consumer now catch this failure. | Tarball smoke test passes strict external compilation. |
| Package attribution | Bundles did not carry the full MIT notice. Built bundles retain the original copyright and permission notice; attribution files ship in the package. | Extracted-tarball license checks. |
| CI and release | Inherited CI automatically published master. Node22 CI now validates with the frozen lockfile and runs build/package/demo checks; publishing is manual. | CI configuration review; equivalent checks run locally. |
| Demo | Fixed initial toggle state, malformed URL fragments, supplementary Unicode input, loading/error/retry state, stale completions, and repeated writer creation. Removed the external polyfill.io script. | Stub and real-bundle demo smoke tests. |
| Mobile demo | Fixed-width layout overflowed; initial CSS-only fix clipped SVG characters. Fluid layout, wrapping controls, and an explicit SVG viewBox now preserve the whole character. | Visual review and successful drawing of 一 at 320px width. |

## Validation

Validated with Node.js 22.23.1:

- `yarn typecheck`
- `yarn lint-test`
- `yarn test --runInBand`
- `yarn build`
- `yarn check-demo` (includes actual bundle and local character data)
- `yarn check-package` (extracts a real npm tarball; CJS, ESM, browser globals, licenses, strict TypeScript consumer)

The final test run has 21 passing suites, 256 passing tests, and 15 passing snapshots. No dependency versions or lockfile contents changed. Build output still includes inherited nonfatal Browserslist-age and filesize-plugin terminal warnings. CI configuration was verified locally; no remote CI run or publication was triggered.

## Multilingual extension boundary

This pass makes the engine more reliable for custom datasets; it does not supply complete new language datasets or certify script-specific teaching accuracy. The README documents custom data structure, coordinates, and lifecycle behavior. Japanese dataset conversion, Hangul composition, Latin teaching styles, tap-like dots, connected cursive, and script-specific accepted stroke variants remain product-extension work. Fonts alone do not provide ordered pen paths. Each dataset needs separate provenance, licensing, visual review, and handwriting acceptance tests.
