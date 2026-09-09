# Changelog

All notable changes to this project are recorded here. Dates are ISO 8601.

## [Unreleased]

A hardening and modernization pass covering the toolchain, the validation layer, test
coverage and the check gates. No public API was removed or renamed.

### Fixed

- **SVG pointer coordinates were silently unconverted when the transform matrix was
  unavailable.** `getScreenCTM()` returns null for an element that is not rendered, and
  `DOMPoint.matrixTransform(undefined)` defaults to the identity matrix, so every stroke
  was graded against viewport coordinates instead of SVG user space, with no error. The
  matrix is now checked for existence and invertibility, falling back to the bounding
  rect. (`src/renderers/svg/RenderTarget.ts`)
- **A zero-sized target produced a negative or zero scale.** `Positioner` clamped the
  drawable area only on the writing-unit path. On the character path an unlaid-out
  element gave a negative scale, mirroring the coordinate space; a zero would have made
  `convertExternalPoint` return `Infinity` and `NaN`. Both paths now clamp.
  (`src/Positioner.ts`)
- **A negative target value was reported as already animated.** `isAlreadyAtEnd` tested
  `endValue >= 0` to decide whether a value was a numeric leaf, so a negative number
  took the recursion branch, found no keys, and returned true. It now tests the type.
  (`src/Mutation.ts`)
- **`evt.touches[0]` was read without a length check**, which throws on `touchend` and
  `touchcancel` where the touch has moved to `changedTouches`. Latent until such a
  binding was added. (`src/renderers/RenderTargetBase.ts`)
- **`gradeStroke` hard-coded the index 31**, coupled to the default sample count. It now
  derives the index from the array length. (`src/units/gradeStroke.ts`)
- **An empty looping mutation chain dereferenced a mutation that does not exist.**
  Unreachable through the public API, since character data must have at least one
  stroke, but the invariant is now enforced rather than assumed. (`src/RenderState.ts`)
- **The default character loader could never time out.** `xhr.timeout` was never
  assigned, so the registered `ontimeout` handler could not fire and a stalled request
  left the caller's promise pending forever. Now 20 seconds.
  (`src/defaultCharDataLoader.ts`)
- **`Mutation.cancel` passed a sentinel `-1` to `cancelAnimationFrame`** when no frame
  was scheduled, which fake timers report as clearing a timer they do not own.
- **`parseFloat` was called with a redundant radix and a numeric fallback**, which
  worked by accident. (`src/utils.ts`)
- **The SVG sub-render-target removed its parent's shared `<defs>` on destroy.** Only
  the owner does so now. (`src/renderers/svg/RenderTarget.ts`)
- **`scripts/check-demo.cjs` located CSS rules by substring**, so it read the wrong
  block whenever a selector appeared in a grouped rule first, and broke outright on a
  whitespace change. It now collects every declaration that applies to a selector.

### Security

- **The four hardened structural validators are now one module.** `validateShape`,
  `validateAnimation`, `validateUnit` and the data provider each carried a near-identical
  copy of the prototype-pollution and hidden-getter defence. A bypass fixed in one would
  have left three open. They now share `src/validation/plainStructure.ts`, which is
  covered by 31 dedicated tests. (See [SECURITY.md](SECURITY.md).)
- **`__proto__` is copied as data, not assigned.** The shared reader uses
  `Object.defineProperty`, so a literal `__proto__` data property cannot reparent the
  returned object. The previous copies used assignment; the allowlist made it
  unreachable there, but the dictionary reader used by data packs would have reached it.
- Error chains are preserved. `MotorSourceError` and the check harness now attach the
  underlying failure as `cause` instead of discarding it.
- **A caller-supplied canvas is no longer permanently altered.** `FontWriter` set `role`
  and `aria-label` on whatever surface it was given and restored only `touchAction` on
  destroy, so a canvas the caller still owned kept the writer's attributes forever, and
  attributes that had been absent were left behind. It now records the prior value,
  including absence, and puts it back.

### Performance

- **`FontWriter` no longer rebuilds the SVG tree on pointer moves that record nothing.**
  The distance threshold rejected the point but rendering ran anyway, tearing down and
  recreating every glyph path and stroke polyline per event at pointer sampling rates.
- **Animation frames reuse their mask elements.** The `<mask>`, reveal path and glyph
  outlines are built once per animation instead of once per frame; only the reveal
  path's `d` changes.
- The mask memo key was **not** changed. Quantizing it to a fixed number of reveal
  steps, so consecutive frames could share a cache entry, was implemented and then
  reverted: at 960 px and device pixel ratio 3 the contour gate's analytic tolerance is
  about 2.3e-4, and rounding to 512 steps introduces up to 9.8e-4 of error, which the
  gate correctly reported as thousands of pixels on the wrong side of the reveal front.
  Finer quantization would push the step size below one frame's advance, making the
  cache useless anyway. `src/fonts/__tests__/animationMask-test.ts` now pins that
  nearby fractions stay distinguishable, so the idea cannot be reintroduced silently.
- **`prepareMaskField` sizes its scratch to the strokes present**, instead of allocating
  a fixed 1 MB pair per tile to address at most 8,193 slots.
- `FontWriter` tracks its committed point count incrementally rather than reducing over
  every stroke on each pointer event.

### Changed

- **Toolchain upgraded**: Jest 26 to 30, ESLint 7 to 10 with flat config, TypeScript 4.1
  to 5.9, Rollup 2 to 4, Prettier 2 to 3. The deprecated `@wessberg/rollup-plugin-ts`
  and `rollup-plugin-terser` are replaced by `rollup-plugin-dts` and
  `@rollup/plugin-terser`.
- **`rollup-plugin-filesize` removed.** It pulled an entire npm registry client
  (`pacote`, `node-gyp`, `tar`, `sigstore`) in to print two numbers, and accounted for
  five of the six remaining advisory groups. Replaced by a dependency-free inline plugin
  using Node's `zlib`.
- **`semantic-release` and `codecov` removed.** Both were declared and invoked by
  nothing. `semantic-release` also contradicted the repository's own stated policy that
  publishing is manual. Total advisories fell from 846 to 1.
- **`jsdom` and `jest-environment-jsdom` are now declared.** Both are imported directly
  by first-party code and previously resolved only through Jest 26's hoisted tree, so the
  Jest upgrade would have broken the test suite and the demo check.
- **Build targets now match the documented runtime floor.** `browserslist` in
  `package.json` is the single source of truth; Babel reads it, and it matches the
  WebAssembly, Path2D and FinalizationRegistry requirements in `docs/fonts.md`. The
  previous configuration targeted `>2%` browsers and Node 12 while shipping unpolyfilled
  modern APIs.
- **`package.json` metadata completed**: `author` now names the fork maintainer rather
  than the upstream author and their email; added `engines`, `exports`, `sideEffects`
  and `keywords`.
- **`fonts/assets/` is no longer expected in git.** CI restores it with `yarn
fetch-fonts`, which verifies every byte length and SHA-256 against
  `fonts/assets.lock.json` before writing. This keeps the repository at 56 MiB.
- **Lint and formatting now cover the whole repository.** ESLint previously ran on `src`
  only, leaving roughly 4,500 lines of scripts, optional font runtime and demo code
  unchecked. Prettier reformatted the compressed modules: `extras/fonts/skeleton.mjs`
  went from 303 lines at up to 570 characters to 1,626 lines at up to 98.
- CI splits into a fast tier (no browsers, no font binaries) and a slow browser tier.
  `check-package` runs in the browser tier, not the fast one: it shapes text with a real
  NotoSans binary, and `fonts/assets` is not in git, so in the fast job it would have
  failed on a clean checkout. Playwright browsers are cached on the lockfile checksum.
  `prepublishOnly` fetches the fonts itself rather than documenting that you must.
- Removed dead code: the IE-era `Object.assign` polyfill and its tests, `isMsBrowser`,
  the write-only static `LoadingManager` reference, the unused `validateFontPath` export,
  the unreferenced `demo/test_data.js`, and `.npmignore` (superseded by `files`).

### Verification

- **The optional runtime has per-file coverage floors.** `extras/fonts` is 3,684 lines
  that ship in the package and had no enforced coverage at all. Measured: provider 97.9%,
  yield-work 84.2%, progress 71.2%, skeleton 56.4%, animation 23.1%. An aggregate
  threshold would let one file rot while the total held, so `check-coverage.mjs` asserts
  a floor per file, and asserts the inventory too, since a module no test imports
  disappears from the report rather than failing.
- **The vendored HarfBuzz runtime is cross-checked against the dependency.**
  `extras/fonts/vendor` is a copy, not a resolved dependency, so bumping `harfbuzzjs`
  left the vendored bytes stale while the vendor manifest and those bytes stayed
  mutually consistent, making the drift invisible. `check-assets.mjs` now fails if the
  manifest version and the installed version disagree.
- **The performance claims are pinned as behaviour, not timing.** A pointer move below
  the movement threshold must leave the rendered group identical, and consecutive
  animation frames must preserve mask, reveal and ink element identity. A timing
  threshold would be noisy on a shared runner and would not say which work was skipped.
- **Dependabot, grouped by ecosystem**, with every deliberately pinned dependency on the
  ignore list and the reason beside it. The one-time cleanup fixed the instance; this
  fixes the mechanism that produced 846 advisories.

### Testing

- Coverage rose from 72.9% to 94.3% of statements and from 63.7% to 86.4% of branches.
  Thresholds are now enforced in `jest.config.js` and fail the build.
- `src/fonts/animationMask.ts` went from 0.7% to 90.6%, `validateAnimation.ts` from
  10.7% to 95.9%, `FontWriter.ts` from 48.3% to 91.8%, `yieldWork.ts` from 0% to 100%.
- Added 125 tests, largely behavioural rather than snapshot-based: mask reveal
  monotonicity and area conservation, shared-edge cancellation, hole winding, animation
  supersession and cancellation, pointer-input rejection paths, and the structural
  validator's defences.
- Replaced a brittle 888-line canvas snapshot with a test that asserts what it claimed
  to, plus a direct save/restore balance assertion that survives a mock upgrade.
- `.codecov.yml` deleted. It demanded 96% coverage, measured 72.9%, and was wired to
  nothing.

### Deferred, with reasons

- **Splitting `repairSourceJunctions`** (1,037 lines, cyclomatic complexity 314). An
  external review established that the gates do not protect this refactor:
  `check-font-contours` fabricates its own ownership and progress arrays and never
  reaches junction repair, and the 120-script sweep runs with `sourceLoader: null`. A
  stage extraction could change stroke ownership so a later stroke's ink appears early,
  while every rendered contour stays identical and all twelve configurations pass. The
  prerequisite oracle is described in `eslint.config.js`. Splitting first would trade a
  readability problem for a correctness risk nothing would catch.
- **Upgrading `fflate` past 0.8.2.** Verified that 0.8.3 produces byte-identical gzip
  output, so the data would not change. Not done: the advisory is in `unzipSync`, which
  this project never calls, on a development dependency, and clearing it means
  rewriting the provenance string in 149 tracked manifests. `check-data-reproducible`
  would only prove the new output reproduces the new baseline, not that it matches the
  old one, so the churn would buy an unverified equivalence.
- **Changing `role="img"` on the drawing surface.** A pointer surface does not become a
  button or an application by relabelling, and `FontWriter` has no keyboard interaction
  to back a different role. Deciding this needs a screen reader, not an accessibility
  tree assertion. The genuine defect nearby was fixed instead: see below.

### Documentation

- Added `CONTRIBUTING.md`, `SECURITY.md`, `docs/architecture.md` and this changelog.
