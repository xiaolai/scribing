# Code Audit Report

**Date**: 2026-09-09
**Auditor**: Claude Code (`/audit`, nine-dimension full pass)
**Codebase**: Scribing (fork of Hanzi Writer)
**Languages**: TypeScript (library), JavaScript ESM/CJS (build + demo + optional font runtime), Python (maintenance-only catalog generation)

> **Status: acted on.** Every finding below was addressed in the same session this
> report was written. See [CHANGELOG.md](../../CHANGELOG.md) for what changed and
> [CONTRIBUTING.md](../../CONTRIBUTING.md) for the resulting workflow. Two items were
> resolved differently from the recommendation here: `@types/nise` is **not** dead (it
> supplies ambient types for a test import, which a text search missed), and the mask
> memo quantization proposed under Performance was implemented, caught by the contour
> gate as a sub-pixel regression at device pixel ratio 3, and reverted. This document is
> preserved unedited as the pre-fix record.

**Scope**: `src/`, `scripts/`, `extras/`, `demo/`, build/CI/package configuration, dependency tree, documentation. Generated data under `packs/` and binary assets under `fonts/` were verified through their own integrity gates rather than read line by line.

| Metric                                                              | Value                     |
| ------------------------------------------------------------------- | ------------------------- |
| Production TypeScript files                                         | 52                        |
| Production TypeScript lines                                         | 6,841                     |
| Test files / lines                                                  | 30 / 7,386                |
| Build and check scripts                                             | 31 files, 2,953 lines     |
| Optional font runtime (`extras/fonts`, excluding vendored HarfBuzz) | 6 files, 1,008 lines      |
| Demo                                                                | 499 lines                 |
| Tracked files                                                       | 755                       |
| Packed git history                                                  | 56.0 MiB                  |
| Untracked working-tree assets                                       | 194.3 MB across 208 files |

---

## Executive Summary

**Overall Risk Score**: Medium-High

The first-party library code is well above average. Input validation is genuinely hardened, the lifecycle and cancellation logic is carefully generation-guarded, licensing is documented to an unusual standard, and the verification gates are real rather than ceremonial. Every gate passes today.

The risk is concentrated in three places that have nothing to do with the algorithms: an unmaintained dependency tree, a coverage gate that is disconnected and unreachable, and a body of deliberately compressed source that no reviewer can audit at speed.

**Key Findings**:

- **Critical: 1** — 51 critical and 476 high advisories in the build/test dependency tree, including a Handlebars remote code execution and a Babel arbitrary-code-execution path, both reachable during `yarn install` and `yarn build`.
- **High: 9** — dead coverage gate, two undeclared dependencies, essentially untested animation geometry, hand-compressed source in the shipped package, a silent coordinate-mapping failure, and a per-pointer-event full DOM rebuild.
- **Medium: 17**
- **Low: 24**

**Top 3 Urgent Recommendations**:

1. **Remove `semantic-release` and `codecov` from `devDependencies`, then upgrade the toolchain.** They are declared, never invoked, and between them account for the largest single share of the advisory count. `semantic-release` also contradicts the repository's own stated policy that publishing is manual. Effort: about 15 agent-minutes to remove; 2 to 4 agent-hours plus one CI cycle for the jest/eslint/TypeScript upgrade that follows.
2. **Declare `jsdom` and `jest-environment-jsdom` explicitly.** Both are imported by first-party code and resolve only through jest 26's hoisted tree. The jest upgrade above will break `yarn test` and `yarn check-demo` the moment it lands unless this is fixed first. Effort: about 10 agent-minutes.
3. **Reconcile the coverage gate with reality.** `.codecov.yml` demands 96% and measured coverage is 72.94%, with `src/fonts/animationMask.ts` at 0.71%. Either wire Codecov up and set an honest target, or delete the file and the package. Adding unit tests for the mask geometry is the substantive half. Effort: about 30 agent-minutes to reconcile the config; 3 to 5 agent-hours to build a fast regression net for the geometry.

**Positive Highlights**:

- The structural validators in `src/fonts/validateShape.ts`, `src/fonts/validateAnimation.ts`, `src/units/validateUnit.ts`, and `src/units/provider.ts` inspect own property descriptors, reject non-plain prototypes, reject symbol keys, and reject accessor properties before reading any value. This defeats prototype pollution and hidden-getter substitution, and it is a materially higher standard than most libraries in this space apply.
- `scripts/fonts/check-assets.mjs` regenerates the derived `extras/fonts/path-geometry.mjs` from its TypeScript source and asserts byte equality, so the one deliberate code duplication in the repository cannot silently drift.

---

## Detailed Findings

### 1. Redundant & Low-Value Code

**Risk Level**: Medium

#### Duplicate Code

- **Four near-identical hardened structural validators** (`src/fonts/validateShape.ts:16`, `src/fonts/validateAnimation.ts:11`, `src/units/validateUnit.ts:16`, `src/units/provider.ts:16`)
  - **Severity**: Medium
  - **Description**: `copyObject`/`copyArray` in `validateShape.ts` and `object`/`array` in `validateAnimation.ts` differ only in identifier names, a `for` increment style, and one optional-keys parameter. A diff of the two object validators produces four cosmetic hunks and no semantic difference. `validateUnit.ts` carries a third variant and `provider.ts` a fourth (`plainRecord`).
  - **Impact**: These functions are the project's primary defence against prototype pollution and accessor-property substitution. If a bypass is discovered and fixed in one copy, three copies keep the hole, and nothing in the test suite or CI would notice.
  - **Recommendation**: Extract one `src/validation/plainStructure.ts` exposing `plainObject(value, keys, optional?)` and `plainArray(value, max)`. Have all four call sites use it. Keep the domain-specific field checks where they are.

    ```ts
    // src/fonts/validateShape.ts (current)
    function copyObject(value: unknown, keys: string[]): Record<string, any> {
      ...
      const result: Record<string, any> = {};
      for (const key of Object.getOwnPropertyNames(value)) { ... }
      for (const key of keys) if (!Object.prototype.hasOwnProperty.call(result, key)) fail();
      return result;
    }

    // src/fonts/validateAnimation.ts (current) — same body, different names
    function object(value: unknown, keys: string[], optional: string[] = []): Record<string, any> {
      ...
      const out: Record<string, any> = {};
      for (const key of Object.getOwnPropertyNames(value)) { ... }
      for (const key of keys)
        if (optional.indexOf(key) < 0 && !Object.prototype.hasOwnProperty.call(out, key)) fail();
      return out;
    }
    ```

#### Dead Code

- **`assign` and `_assign` Object.assign polyfill** (`src/utils.ts:15` and `src/utils.ts:29`)
  - **Severity**: Medium
  - **Description**: Zero production references. The only thirty references in the repository are in `src/__tests__/utils-test.ts`, which exists solely to test them. The comment reads "Object.assign polyfill, because IE :/", while `docs/fonts.md` requires WebAssembly, ESM top-level await, WebCrypto, and FinalizationRegistry.
  - **Impact**: A test suite that keeps dead production code alive is a self-sustaining maintenance cost, and it inflates the apparent coverage of `utils.ts`.
  - **Recommendation**: Delete both exports and the two `describe` blocks that cover them.

- **`Scribing._loadingManager` and `Scribing._loadingOptions`** (`src/Scribing.ts:101`, `src/Scribing.ts:103`, assigned at `112`–`113`)
  - **Severity**: Low
  - **Description**: Assigned on every `loadCharacterData()` call and never read anywhere in the codebase.
  - **Impact**: The class permanently retains a strong reference to the most recent `LoadingManager` and the caller's options object. Harmless in size, misleading in intent — the adjacent comment says static requests are independent consumers, which is exactly why the statics serve no purpose.
  - **Recommendation**: Delete both static fields and their assignments.

- **`validateFontPath`** (`src/fonts/validateShape.ts:13`)
  - **Severity**: Low
  - **Description**: Exported, calls `pathGeometry(path)`, discards the result, and has no callers anywhere in `src`, `scripts`, `extras`, or `demo`.
  - **Recommendation**: Delete, or document it as a public API entry point and cover it with a test.

- **`demo/test_data.js`** (whole file, tracked in git)
  - **Severity**: Low
  - **Description**: Three lines assigning `window.data` to two hardcoded stroke recordings. `demo/index.html:34` loads only `test.js`; nothing references `test_data`.
  - **Recommendation**: Delete.

- **`isMsBrowser`** (`src/utils.ts:161`)
  - **Severity**: Low
  - **Description**: Detects MSIE, Trident, and legacy Edge. Two production references remain, but the documented runtime floor makes those branches unreachable.
  - **Recommendation**: Trace the two call sites, remove the branches, then remove the export.

- **Stale `.npmignore`, fully superseded by `package.json` `files`**
  - **Severity**: Low
  - **Description**: `.npmignore` lists `Gruntfile.js`, `babel-jest-processor.js`, and `.eslintrc-jest`, none of which exist. npm ignores `.npmignore` entirely when a `files` array is present, and `package.json` has one.
  - **Recommendation**: Delete `.npmignore`.

---

### 2. Security & Risk Management

**Risk Level**: High (entirely in the dependency tree; no first-party vulnerability found)

No hardcoded secrets, credentials, tokens, or private keys. No `eval`, `Function`, `document.write`, or `insertAdjacentHTML` anywhere. The single `innerHTML` in production code is `this._positionedTarget!.defs.innerHTML = ''` at `src/renderers/svg/ScribingRenderer.ts:111`, a constant empty string. Both demo scripts build DOM exclusively through `createElement` and `textContent`. Both development HTTP servers bind to `127.0.0.1` and reject any resolved path outside the repository root. `scripts/fonts/fetch-assets.mjs` refuses non-HTTPS sources and verifies SHA-256 and byte length after download.

#### High

- **51 critical and 476 high advisories in the development dependency tree**
  - **Severity**: High (see dimension 8 for the Critical rating on the specific advisories)
  - **Description**: `yarn audit` reports 846 advisories across 1,445 audited packages. The runtime dependency set is empty, so none of this reaches library consumers. All of it reaches anyone who runs `yarn install`, `yarn build`, or CI.
  - **Impact**: Handlebars remote code execution and `@babel/traverse` arbitrary code execution both execute during a normal build.
  - **Recommendation**: See dimension 8.

#### Medium

- **Duplicated validators concentrate security-critical logic in four places** — see dimension 1. Cross-listed here because the duplicated code is the prototype-pollution defence, not incidental utility code.

- **Default character data loads from a third-party CDN with no integrity check and no timeout** (`src/defaultCharDataLoader.ts:4`)
  - **Severity**: Medium
  - **Description**: The default loader issues an `XMLHttpRequest` to `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/<char>.json`. `xhr.timeout` is never assigned, so the `ontimeout` handler registered at line 27 can never fire. There is no subresource integrity or hash check on the response.
  - **Impact**: Every consumer that does not supply `charDataLoader` makes a cross-origin request to a third party on first use, which is both a supply-chain surface and a privacy disclosure. A hung connection leaves the load pending indefinitely rather than settling.
  - **Recommendation**: Set an explicit `xhr.timeout`. Document the CDN dependency prominently in the README's usage section, not only in the licensing section. Consider verifying a pinned digest, since the data version is already pinned to 2.0.1.

#### Low

- **Demo pages declare no Content-Security-Policy** (`demo/multilingual/index.html:2`, `demo/index.html`)
  - **Severity**: Low
  - **Description**: No CSP `<meta>` element. The demo loads only same-origin resources and the check gates assert that, so there is no live exposure.
  - **Recommendation**: Add a restrictive `default-src 'self'` policy. It costs one line and documents the same-origin guarantee that `scripts/check-font-animation.cjs` already enforces at test time.

---

### 3. Code Correctness & Reliability

**Risk Level**: Medium

#### High

- **SVG pointer coordinates are silently unconverted when the transform matrix is unavailable** (`src/renderers/svg/RenderTarget.ts:64` and `src/renderers/svg/RenderTarget.ts:74`)
  - **Severity**: High
  - **Description**: Both handlers call `this.node.getScreenCTM()?.inverse()` and pass the result straight to `matrixTransform`. `getScreenCTM()` returns null for an element that is not rendered, so the optional chain yields `undefined`. The DOM Geometry specification defines `matrixTransform(optional DOMMatrixInit matrix = {})`, so `undefined` becomes an identity matrix and the method returns raw client coordinates.
  - **Impact**: Quiz input is graded against coordinates in the wrong space, with no error and no warning. The user sees strokes rejected for no visible reason. This is exactly the failure mode the newer `FontWriter.point()` was written to prevent — that method explicitly checks the determinant and returns `undefined` when the matrix is not invertible.
  - **Failure scenario**: A writer mounted inside a container that is `display: none` at the moment of first input, or inside a detached subtree that a framework attaches after mount. Every stroke maps to viewport coordinates rather than SVG user space, and every match fails.
  - **Recommendation**: Mirror the `FontWriter` guard.

    ```ts
    // src/renderers/svg/RenderTarget.ts — current
    const localPt = this._pt.matrixTransform(this.node.getScreenCTM()?.inverse());
    return { x: localPt.x, y: localPt.y };

    // suggested
    const matrix = this.node.getScreenCTM();
    if (matrix && matrix.a * matrix.d - matrix.b * matrix.c !== 0) {
      const localPt = this._pt.matrixTransform(matrix.inverse());
      return { x: localPt.x, y: localPt.y };
    }
    return super._getMousePoint.call(this, evt);
    ```

  - **Verification note**: The spec-default behaviour of `matrixTransform(undefined)` should be confirmed in a real browser before the fix lands, so the regression test asserts the right thing.

#### Medium

- **`_getTouchPoint` reads `evt.touches[0]` without a length check** (`src/renderers/RenderTargetBase.ts:87`)
  - **Severity**: Medium
  - **Description**: `evt.touches[0].clientX` throws a `TypeError` if `touches` is empty. Today the method is only bound to `touchstart` and `touchmove`, where `touches` is non-empty, so it is latent rather than live.
  - **Impact**: Any future binding to `touchend` or `touchcancel`, where the ended touch has moved to `changedTouches`, produces an uncaught exception inside an event handler.
  - **Recommendation**: Return the previous point, or fall back to `changedTouches[0]`, when `touches` is empty.

- **`Positioner` clamps effective dimensions in unit mode but not in character mode** (`src/Positioner.ts:39`)
  - **Severity**: Medium
  - **Description**:

    ```ts
    const effectiveWidth = bounds
      ? Math.max(1e-6, width - 2 * padding)
      : width - 2 * padding;
    ```

    The unit path guards against a non-positive value; the character path does not. `Scribing._fillWidthAndHeight` falls back to `getBoundingClientRect()`, which returns zero for an unlaid-out element, and `Scribing.updateDimensions` validates dimensions only when `_dataMode === 'unit'`.

  - **Impact**: `this.scale` becomes zero, and `convertExternalPoint` then divides by it, producing `Infinity` or `NaN` for every pointer coordinate. The character quiz silently stops matching.
  - **Recommendation**: Apply the same clamp on both branches, or run `_validateUnitDimensions` for character mode too and rename it.

- **`gradeStroke` hardcodes the index 31, coupled to a default parameter** (`src/units/gradeStroke.ts:57` and `src/units/gradeStroke.ts:60`)
  - **Severity**: Medium
  - **Description**: `backward = drawn.map((p, i) => distance(p, target!.points[31 - i]))` and `Math.max(errors[0], errors[31])` both assume `sample()` returned exactly 32 points, which is true only because `sample(points, count = 32)` has that default.
  - **Impact**: Changing the sampling density, a plausible tuning change, silently produces `undefined` distances and `NaN` comparisons rather than a compile or test error.
  - **Recommendation**: Derive the index from `drawn.length - 1`, or hoist the sample count to a named exported constant used by both.

#### Low

- **`RenderState._run` dereferences an undefined mutation for an empty looping chain** (`src/RenderState.ts:172`)
  - **Severity**: Low
  - **Description**: With `_loop` true and an empty `_mutations` array, the index resets to 0 and `activeMutation.run(this)` throws on `undefined`. `validateCharData` requires a non-empty stroke array, so no public API path reaches this today.
  - **Recommendation**: Return early when `mutations.length === 0`, so the invariant is enforced rather than assumed.

- **`parseFloat` called with a redundant radix and a numeric fallback** (`src/utils.ts:132`)
  - **Severity**: Low
  - **Description**: `parseFloat(rgbMatch[4] || 1, 10)` — `parseFloat` takes one argument, and the fallback is a number rather than a string. The behaviour is correct by accident. The `@ts-expect-error` on the preceding line documents that the author knew.
  - **Recommendation**: `rgbMatch[4] === undefined ? 1 : parseFloat(rgbMatch[4])`, and drop the suppression.

- **Inconsistent source object in the deprecated-option backfill** (`src/Scribing.ts:713`)
  - **Severity**: Low
  - **Description**: The `strokeAnimationSpeed` backfill reads `options.strokeAnimationDuration`; the adjacent `strokeHighlightSpeed` backfill reads `mergedOptions.strokeHighlightDuration`. The guard already narrows to the case where the two are equal, so the result is identical. The asymmetry invites a future edit that breaks one and not the other.
  - **Recommendation**: Read `options.strokeHighlightDuration` for symmetry.

- **`ScribingRenderer.destroy()` bypasses the render target's own `destroy()` and clears a shared `defs`** (`src/renderers/svg/ScribingRenderer.ts:108`)
  - **Severity**: Low
  - **Description**: The override removes the positioned group and sets `defs.innerHTML = ''`, but never calls `this._positionedTarget.destroy()`. The sub-target's `defs` reference is the parent's shared node.
  - **Impact**: No live leak, because sub-targets carry no listeners and each `Scribing` instance owns its own `defs`. It becomes a real defect if sub-targets ever gain listeners or if two renderers share one `defs`.
  - **Recommendation**: Give the sub-target a `destroy()` that clears only what it owns, and call it.

---

### 4. Compliance & Standards

**Risk Level**: Medium

Licensing is handled better than in most projects of this size. `COPYING.md` separates the library's MIT licence from the Arphic Public License on the Chinese data, OFL-1.1 on the Noto fonts, the Unicode licence on the UCD extracts, and CC-BY-SA-3.0 on the KanjiVG-derived Japanese packs. `packs/NOTICES.md` names each upstream source with its licence and states explicitly that ShareAlike propagates to the transformed data. Per-asset provenance, revision, byte length, and SHA-256 live in `fonts/assets.lock.json` and are verified offline. `scripts/check-package.cjs` asserts that every built bundle still carries the upstream copyright and the full MIT permission notice.

#### Medium

- **`package.json` `author` still names the upstream author, with their email, for a fork they do not maintain**
  - **Severity**: Medium
  - **Description**: `"author": "David Chanin <chanindav@gmail.com> (http://chanind.github.io/hanzi-writer/)"` while `repository`, `homepage`, and `bugs` all point at `xiaolai/scribing`.
  - **Impact**: If this is published, npm attributes the package to a third party and publishes their email address as the contact for issues they cannot act on. Attribution to the original author belongs in `LICENSE`, `COPYING.md`, and `CITATION.cff`, all of which already carry it correctly.
  - **Recommendation**: Set `author` to the fork maintainer. Add a `contributors` entry for the original author without the email, or rely on the existing `LICENSE` and `CITATION.cff` attribution.

- **Build targets contradict the documented runtime requirements, and the browser data resolving them is stale**
  - **Severity**: Medium
  - **Description**: `babel.config.js` targets `browsers: '>2%'` and `node: '12'`. `tsconfig.json` sets `"target": "es5"`. `docs/fonts.md` states that consumers need WebAssembly, ESM with top-level await, WebCrypto, Path2D, Pointer Events, and FinalizationRegistry. Every build prints `Browserslist: caniuse-lite is outdated`, so the `>2%` query resolves against browser-share data that is years old and the effective target is indeterminate. The emitted bundle confirms the contradiction: it preserves classes and arrow functions, transpiles optional chaining and nullish coalescing away, and ships `Path2D`, `MessageChannel`, `Math.imul`, `Uint16Array`, `AbortController`, and `WeakMap` unpolyfilled.
  - **Impact**: The project pays a downlevel-transpilation cost for browsers that cannot run the library at all, while the actual floor is undocumented in machine-readable form. Node 12 reached end of life in April 2022; CI runs Node 22.
  - **Recommendation**: Add an explicit `browserslist` key that matches `docs/fonts.md`, raise the Babel `node` target to the supported LTS floor, refresh `caniuse-lite`, and either raise `tsconfig.json`'s `target` or add a comment recording that Babel owns emit and the `target` value affects typecheck only.

#### Low

- **`package.json` declares no `engines`, `exports`, `sideEffects`, `browserslist`, or `keywords`**
  - **Severity**: Low
  - **Description**: There is no machine-readable Node floor, no export map, no tree-shaking hint, and no discoverability metadata. `docs/fonts.md` instructs consumers to deep-import `scribing/extras/fonts/provider.mjs`, which works only because no `exports` map exists.
  - **Impact**: Adding an `exports` map later is a breaking change for anyone who followed the documented deep-import instruction. Without `sideEffects: false`, bundlers cannot drop unused parts of the library.
  - **Recommendation**: Add `engines`, `sideEffects: false`, `keywords`, and an `exports` map that explicitly blesses the documented `./extras/fonts/*` subpaths before the first publish, while it is still cheap.

- **`CITATION.cff` represents the fork author in entity form**
  - **Severity**: Low
  - **Description**: `- name: "Xiaolai"` is the CFF entity form, alongside a correctly structured `family-names`/`given-names` entry for the original author. Citation tooling will render the two differently.
  - **Recommendation**: Use `given-names`/`family-names`, or `alias`, for consistency.

- **`.npmignore` retained alongside `files`** — see dimension 1.

---

### 5. Maintainability & Readability

**Risk Level**: High

#### High

- **The heaviest algorithms in the project are hand-compressed to 400 to 570 characters per line, and are shipped as npm source**

  | File                             | Lines |               Longest line | Shipped to npm |
  | -------------------------------- | ----: | -------------------------: | -------------- |
  | `extras/fonts/skeleton.mjs`      |   303 |                        570 | yes            |
  | `extras/fonts/progress.mjs`      |    56 |                        504 | yes            |
  | `extras/fonts/animation.mjs`     |   216 |                        470 | yes            |
  | `extras/fonts/provider.mjs`      |   176 |                        218 | yes            |
  | `demo/multilingual/fonts.mjs`    |    99 |  long single-line handlers | no             |
  | `scripts/check-font-sources.cjs` |    45 | long single-line scenarios | no             |
  | `demo/multilingual/index.html`   |    23 |            minified markup | no             |
  - **Severity**: High
  - **Description**: `extras/fonts/path-geometry.mjs` and `yield-work.mjs` are legitimately derived and gated. The other four `extras/fonts` modules are not derived from anything; they are the medial-graph skeletonisation, per-pixel progress assignment, animation preparation, and HarfBuzz shaping adapter, written directly in this compressed style. A single line of `skeleton.mjs` contains a nested loop, a bounds guard, a work counter, a yield checkpoint, and a projection search.
  - **Impact**: These files are inside `package.json` `files`, so they are the source a downstream consumer or contributor reads. No reviewer can reason about a 570-character line containing four control-flow constructs, and no diff of such a line is legible. `.eslintrc` only covers `src`, so no linter touches them. This is the single largest obstacle to anyone other than the original author maintaining the font feature.
  - **Recommendation**: Run Prettier over `extras/fonts/*.mjs`, `demo/multilingual/*.mjs`, `demo/multilingual/*.html`, and `scripts/*.cjs`, then extend `.eslintrc` and the `lint-test` script to cover them. If compression is intentional for wire size, keep readable sources and add a minification step, the way `path-geometry.mjs` already has a generation step and a drift gate.

- **Cyclomatic complexity far above any reasonable threshold in the validation and mask code**

  | Function                           | File                                | Complexity | Lines |
  | ---------------------------------- | ----------------------------------- | ---------: | ----: |
  | `validateAnimation`                | `src/fonts/validateAnimation.ts:77` |         48 |   141 |
  | `prepareMaskField`                 | `src/fonts/animationMask.ts:16`     |         34 |   137 |
  | `validateShape`                    | `src/fonts/validateShape.ts:62`     |         32 |   104 |
  | `maskPath`                         | `src/fonts/animationMask.ts:292`    |         30 |    67 |
  | `outline`                          | `src/fonts/animationMask.ts:174`    |         26 |   117 |
  | `pathGeometry` inner group handler | `src/fonts/pathGeometry.ts:141`     |         23 |    61 |
  | `contourProbes`                    | `src/fonts/pathGeometry.ts:208`     |         16 |    37 |
  | `endUserStroke`                    | `src/Quiz.ts:98`                    |         16 |    70 |
  | `setAnimation`                     | `src/fonts/FontWriter.ts:156`       |         16 |    79 |
  | `validateUnit`                     | `src/units/validateUnit.ts:82`      |         16 |    93 |
  - **Severity**: High
  - **Description**: Measured with `eslint --rule '{"complexity":["warn",15]}'` over `src`, excluding tests and fixtures.
  - **Impact**: `validateAnimation` at complexity 48 has more independent paths than any test suite covers, and its measured statement coverage is 2.42%. The combination of highest complexity and lowest coverage in the same function is the sharpest risk concentration in the repository.
  - **Recommendation**: Split `validateAnimation` into `validateStrokes`, `validateTiles`, and `validateCoverage`, each independently testable. Split `prepareMaskField` into gradient recovery, corner reconstruction, and normalisation. Extract the coverage-proof block from `setAnimation`. Then add the `complexity` rule to `.eslintrc` at a threshold the refactored code meets, so this cannot regress.

#### Medium

- **Two files carry most of the public surface** (`src/fonts/FontWriter.ts` 799 lines, `src/Scribing.ts` 788 lines)
  - **Severity**: Medium
  - **Description**: `FontWriter` alone has five methods over 60 lines: `setAnimation` (79), `animate` (67), `render` (68), `check` (63), plus rendering helpers. It mixes DOM construction, pointer input, canvas rasterisation, SVG mask emission, animation scheduling, and raster comparison in one class.
  - **Recommendation**: Extract the SVG and Canvas rendering paths into two renderer objects behind a small interface, mirroring the split that already exists under `src/renderers/`. Extract `check()` into a standalone `compareInk(shape, strokes)` function, which also makes it unit-testable without a DOM host.

- **Geometry is round-tripped through SVG path strings and re-parsed with a regular expression** (`src/fonts/animationMask.ts:153` and `src/fonts/animationMask.ts:207`)
  - **Severity**: Medium
  - **Description**: `rect()` formats cells as `M${x} ${y}h${w}v1h-${w}Z`, and `outline()` then splits those strings on `M`, matches numbers with `/-?\d+(?:\.\d+)?/g`, and reconstructs the points.
  - **Impact**: Structured data is serialised and reparsed inside a hot loop, for no external consumer. It costs correctness clarity (the parser must special-case `path.includes('h')`), and it costs performance on the animation frame path.
  - **Recommendation**: Have `outline()` accept `{x, y, w}` records or point arrays, and format to a path string only at the boundary where the SVG attribute is set.

#### Low

- **`strokeMatches` shadows `isMatch` and `avgDist` inside its own loop** (`src/strokeMatches.ts:57`) — correct, but the inner destructuring reuses both outer names, and `no-shadow` is not enabled.
- **`boundsOf` returns corners while the field it feeds holds width and height** (`scripts/data/build.mjs:65`) — the caller converts correctly at line 165, but the name and the shape disagree. Rename to `extentsOf`.
- **`.eslintrc` covers only `src`** — `lint-test` runs `eslint -c .eslintrc src`, leaving 2,953 lines of scripts, 1,008 lines of `extras`, and 499 lines of demo unlinted. `lint-fix` uses `--ext .tsx,.ts .`, so it does not cover `.mjs`/`.cjs` either.

---

### 6. Performance & Efficiency

**Risk Level**: Medium

#### High

- **`FontWriter.render()` tears down and rebuilds the whole SVG tree on every pointermove, including moves that add no point** (`src/fonts/FontWriter.ts:649`, rendering at `src/fonts/FontWriter.ts:518`)
  - **Severity**: High
  - **Description**: The move handler applies a distance threshold before pushing a point, then calls `render()` unconditionally:

    ```ts
    const last = this.gesture[this.gesture.length - 1];
    if (Math.hypot(last.x - point.x, last.y - point.y) * this.transform.scale >= 0.5)
      this.gesture.push(point);
    this.render();
    ```

    `render()` then executes `while (this.surface.firstChild) this.surface.removeChild(this.surface.firstChild)` and recreates every glyph `<path>`, every committed stroke `<polyline>`, and the in-progress gesture.

  - **Impact**: Cost per pointer event is O(glyphs + total committed points). The documented ceiling is 1,024 gestures and 65,536 points on a 32-glyph run, so a long practice session rebuilds tens of thousands of DOM nodes per event, on the input path, at pointer sampling rates that reach 120 Hz on modern hardware. The threshold that was written to limit work does not limit the work that actually dominates.
  - **Recommendation**: Return early from `move()` when no point was appended. Separately, keep the in-progress gesture in a dedicated element and mutate its `points` attribute rather than rebuilding the tree; only rebuild on shape, dimension, or visibility change.

#### Medium

- **Animation frames recompute the full mask, and the memoisation cannot hit during playback** (`src/fonts/animationMask.ts:292`, driven from `src/fonts/FontWriter.ts:440` and `src/fonts/FontWriter.ts:472`)
  - **Severity**: Medium
  - **Description**: `maskPath` caches on `field.key === \`${stroke}:${threshold}\``, where `threshold = fraction * 65535`and`fraction`advances every frame. The key therefore changes on every frame and the cache never hits during playback. Each miss scans all`width * height`cells, emits clipped triangles at the front, and runs`outline()`, which builds two `Map`s over every edge and walks the resulting graph. `animationSvg`additionally creates a fresh`<mask>`element and a fresh`<path>` per glyph, per tile, per frame.
  - **Impact**: At the documented 2,097,152-cell budget and 60 frames per second, this is the dominant cost of the feature. The documentation reports about 1.2 seconds to attach a 1.87-million-cell guide; per-frame cost during playback is not reported anywhere.
  - **Recommendation**: Quantise the threshold to the number of distinct visual steps the tile can actually show, so consecutive frames hit the cache. Reuse the `<mask>` and `<path>` elements across frames and update only the `d` attribute. Measure frames per second on the largest catalog entry and record it next to the existing attach-time measurement.

- **`prepareMaskField` allocates 1 MB of scratch per tile for at most 8,193 reachable slots** (`src/fonts/animationMask.ts:101`)
  - **Severity**: Medium
  - **Description**: `new Float64Array(65536)` twice, indexed by `owners[i]`. `owners` is a `Uint16Array`, but `validateAnimation` caps `strokes` at 8,192 and rejects any owner greater than `strokes.length`, so indices above 8,192 are unreachable.
  - **Impact**: 1 MB of transient allocation per tile, up to 256 tiles per animation. Not a correctness problem, since typed arrays are zero-initialised and the bound is enforced upstream, but it is 8× more memory traffic than the data needs during the most allocation-sensitive phase.
  - **Recommendation**: Size both arrays to `strokeCount + 1` and pass the count in.

#### Low

- **`UnitQuiz.endUserStroke` grades the chosen plan's step twice and rescans every remaining step of every plan on a miss** (`src/units/UnitQuiz.ts:121`, `src/units/UnitQuiz.ts:135`, `src/units/UnitQuiz.ts:145`) — the `matches` filter already computed the grade for the current step; `reason` recomputes it. The wrong-order probe is O(plans × remaining steps), each call sampling 32 points.
- **`FontWriter` recomputes the total point count with a full `reduce` on every pointerdown and pointermove** (`src/fonts/FontWriter.ts:611`, `src/fonts/FontWriter.ts:634`) — maintain a running counter instead.

---

### 7. Testing & Validation

**Risk Level**: High

**Test Coverage Summary** (`yarn test --runInBand`, 30 suites, 329 tests, 15 snapshots, all passing, 43 seconds):

| Area                   | Statements |   Branches |  Functions |      Lines |
| ---------------------- | ---------: | ---------: | ---------: | ---------: |
| All files              |     72.94% |     63.72% |     86.18% |     75.14% |
| `src/` (core)          |     96.53% |     88.29% |     97.95% |     98.00% |
| `src/models`           |       100% |       100% |       100% |       100% |
| `src/renderers`        |     98.51% |     88.89% |       100% |       100% |
| `src/renderers/canvas` |     97.65% |     88.52% |       100% |     98.73% |
| `src/renderers/svg`    |     90.24% |     76.58% |       100% |     91.46% |
| `src/units`            |     92.27% |     86.25% |     98.75% |     96.87% |
| **`src/fonts`**        | **37.75%** | **29.02%** | **40.17%** | **39.48%** |

Beyond jest, the project runs 19 data tests, 34 font tests, and seven Playwright gates across Chromium and WebKit. All pass.

#### High

- **`.codecov.yml` sets a 96% project target that nothing measures and nothing can meet**
  - **Severity**: High
  - **Description**: `.codecov.yml` declares `target: 96` with `threshold: 1` for both project and patch. Measured project coverage is 72.94%. The `codecov` package is in `devDependencies` and is invoked by no script; `.circleci/config.yml` contains no upload step.
  - **Impact**: A quality gate that is 23 points from reality and wired to nothing. Anyone reading the repository reasonably concludes coverage is enforced at 96%. It is enforced at zero.
  - **Recommendation**: Decide. If coverage should be gated, wire the upload into CI and set a target the codebase meets today, with a ratchet. If it should not, delete `.codecov.yml` and remove the `codecov` dependency, which also removes four high advisories.

- **The largest and most complex new module is effectively untested at unit level**

  | File                             | Lines | Statement coverage | Uncovered ranges                            |
  | -------------------------------- | ----: | -----------------: | ------------------------------------------- |
  | `src/fonts/animationMask.ts`     |   358 |              0.71% | 20–142, 157–357                             |
  | `src/fonts/validateAnimation.ts` |   217 |              2.42% | 5, 8, 10–216                                |
  | `src/fonts/yieldWork.ts`         |    17 |                 0% | 3–15                                        |
  | `src/fonts/FontWriter.ts`        |   799 |             48.17% | 154–299, 421–491, 540–665, 691–695, 751–770 |
  - **Severity**: High
  - **Description**: The uncovered ranges are exactly the mask-field reconstruction, the seam-removing `outline()` traversal, the marching-squares front in `maskPath`, and the animation attach and playback paths. `src/__tests__/FontWriter-test.ts` exists but is 153 lines and does not reach them.
  - **Impact**: The browser gates (`check-font-animation`, `check-font-contours`, `check-font-sources`) do exercise this code end to end, and they are thorough. But they need Playwright browsers and the 194 MB font tree, they take minutes, and their assertions are about rendered output rather than about the geometry invariants. A seam regression in `outline()` or an off-by-one in the marching-squares front surfaces as a pixel diff in a slow gate, not as a fast failing unit test naming the invariant that broke.
  - **Recommendation**: Add fast unit tests for `outline()` (shared-edge cancellation, T-junction collinearity, winding direction), for `clippedTriangle` (threshold on a vertex, all-inside, all-outside), and for `prepareMaskField` on small synthetic tiles with known gradients. These need no browser and no font assets. Then set an honest coverage floor for `src/fonts`.

#### Medium

- **`src/__tests__/utils-test.ts` keeps dead production code alive** — the `assign` and `assign polyfill` describe blocks are the only reason `src/utils.ts:15` and `:29` still exist. Delete both together.
- **No fast regression net for the mask geometry** — cross-referenced with the item above; called out separately because it is the specific missing artefact rather than a coverage number.

#### Low

- **Five of the fifteen CI steps require Playwright browsers and the untracked font tree**, so a contributor running `yarn test` locally validates the core but proves nothing about the font feature. Document the minimal local gate set in the README's Validation section.

---

### 8. Dependency & Environment Safety

**Risk Level**: Critical

**Dependency Summary**:

| Metric                           | Value               |
| -------------------------------- | ------------------- |
| Runtime dependencies             | 0                   |
| Direct devDependencies           | 30                  |
| Packages audited                 | 1,445               |
| Total advisories                 | 846                 |
| Critical / High / Moderate / Low | 51 / 476 / 265 / 54 |

An empty runtime dependency set is a real strength: none of the following reaches library consumers. All of it reaches contributors and CI.

#### Critical

- **Six distinct critical advisories execute during a normal build or test run**

  | Package           | Advisory                                             | Fixed in | Reached through                                                              |
  | ----------------- | ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
  | `handlebars`      | Remote code execution when compiling templates       | ≥ 4.7.7  | `semantic-release`                                                           |
  | `@babel/traverse` | Arbitrary code execution when compiling crafted code | ≥ 7.23.2 | `@babel/core`, `@babel/preset-env`, `@wessberg/rollup-plugin-ts`, `jest-cli` |
  | `minimist`        | Prototype pollution                                  | ≥ 1.2.6  | `@babel/core`, `@wessberg/rollup-plugin-ts`, `jest-cli`                      |
  | `json-schema`     | Prototype pollution                                  | ≥ 0.4.0  | `semantic-release`, `jest-cli`                                               |
  | `tar`             | Decompression and parse denial of service            | ≥ 7.5.19 | `rollup-plugin-filesize`, `semantic-release`                                 |
  | `form-data`       | Unsafe random function for boundary selection        | ≥ 2.5.4  | `semantic-release`, `jest-cli`                                               |
  - **Severity**: Critical
  - **Impact**: `@babel/traverse` and `minimist` are on the `yarn build` path. Any contributor who builds this repository executes them. `semantic-release` alone accounts for four criticals and twenty-two highs.
  - **Recommendation**:

    ```bash
    yarn remove semantic-release codecov @types/nise
    yarn upgrade @babel/core @babel/preset-env --latest
    yarn audit
    ```

    Then plan the jest, eslint, and TypeScript upgrades, which clear most of the remainder.

  **Advisory concentration by direct dependency**:

  | Direct dependency            | Critical | High | Moderate | Low | Invoked anywhere?        |
  | ---------------------------- | -------: | ---: | -------: | --: | ------------------------ |
  | `semantic-release`           |        4 |   22 |       21 |   6 | **no**                   |
  | `jest-cli`                   |        4 |   16 |       17 |   3 | yes                      |
  | `@wessberg/rollup-plugin-ts` |        2 |    7 |        5 |   2 | yes (deprecated package) |
  | `@babel/core`                |        2 |    3 |        2 |   2 | yes                      |
  | `rollup-plugin-filesize`     |        1 |    9 |        5 |   3 | yes                      |
  | `@babel/preset-env`          |        1 |    3 |        2 |   0 | yes                      |
  | `eslint`                     |        0 |    7 |        4 |   1 | yes                      |
  | `codecov`                    |        0 |    4 |        3 |   2 | **no**                   |
  | `rollup-plugin-terser`       |        0 |    2 |        0 |   0 | yes (deprecated package) |

#### High

- **Two undeclared dependencies, resolved only through jest 26's hoisted tree**
  - **Severity**: High
  - **Description**: `scripts/check-demo.cjs:4` does `require('jsdom')` and `jest-jsdom-env.js:6` does `require('jest-environment-jsdom')`. Neither appears in `devDependencies`. Both resolve today from `node_modules/` because jest 26 hoists them. The installed `jsdom` is 16.4.0, released 2020.
  - **Impact**: jest 28 removed the bundled jsdom environment and made `jest-environment-jsdom` a package consumers must install. The moment the jest upgrade lands, both `yarn test` and `yarn check-demo` break, and the failure will read as an unrelated module-resolution error rather than as a declaration gap. This is a build break that is already scheduled and currently invisible.
  - **Recommendation**: Add both to `devDependencies` at their currently resolved versions, in a commit of its own, before touching jest.

    ```bash
    yarn add --dev jsdom@16.4.0 jest-environment-jsdom
    ```

- **`semantic-release` and `codecov` are declared, never invoked, and carry the largest advisory load**
  - **Severity**: High
  - **Description**: Zero references in any script, config, or CI step. `.circleci/config.yml` states explicitly: "Publishing is intentionally manual until the fork's npm ownership and release policy are established. CI must never publish automatically from master." `semantic-release` exists to do the opposite.
  - **Impact**: Four criticals, twenty-six highs, and a dependency whose presence contradicts a documented policy — a future contributor could reasonably wire it up.
  - **Recommendation**: Remove both.

#### Medium

- **The toolchain is four to five years old, and two build plugins are deprecated upstream**

  | Package                      | Installed | Status                                            |
  | ---------------------------- | --------- | ------------------------------------------------- |
  | `jest-cli`                   | ^26.6.3   | 2020; end of life                                 |
  | `eslint`                     | ^7.18.0   | 2021; end of life                                 |
  | `typescript`                 | ^4.1.3    | 2020                                              |
  | `rollup`                     | ^2.36.2   | 2021                                              |
  | `@wessberg/rollup-plugin-ts` | ^1.3.8    | deprecated, renamed `rollup-plugin-ts`            |
  | `rollup-plugin-terser`       | ^7.0.2    | deprecated, superseded by `@rollup/plugin-terser` |
  | `codecov`                    | ^3.8.1    | deprecated by Codecov                             |
  | Babel `node` target          | `12`      | end of life April 2022                            |
  - **Recommendation**: Sequence the upgrade as: remove dead packages, declare `jsdom` and `jest-environment-jsdom`, upgrade Babel, then jest, then eslint and TypeScript, then swap the two deprecated rollup plugins. Each step is a separate commit with a full CI run.

- **194.3 MB of untracked assets that CI requires**
  - **Severity**: Medium
  - **Description**: `fonts/assets` is 169 MB and `fonts/motor` is 21 MB, all currently untracked. The modified `.circleci/config.yml` adds `yarn check-fonts`, `yarn check-font-demo`, `yarn check-font-animation`, `yarn check-font-contours`, and `yarn check-font-sources`, every one of which reads those files. `scripts/check-package.cjs`, which `prepublishOnly` runs, also reads `fonts/catalog.json`, `fonts/script-ranges.json`, and font binaries.
  - **Impact**: The current git pack is 56.0 MiB. Committing these assets takes it past 250 MB, permanently, since git history cannot be pruned without a rewrite. No single file exceeds GitHub's 100 MB hard limit (the largest is a 24 MB CJK serif face), so the push will succeed and the cost will only be visible later, in every clone.
  - **Recommendation**: Decide before the commit, not after. Git LFS, a release-artifact download step driven by the existing `scripts/fonts/fetch-assets.mjs --download` (which already verifies SHA-256 against `assets.lock.json`), or a separate assets repository are all cheaper than a 250 MB history. If the assets do go into git, say so explicitly in `fonts/README.md` so the cost is a recorded decision.

#### Low

- **`@types/nise` is declared and unused** — `nise` itself is used by `src/__tests__/defaultCharDataLoader-test.ts:1`, but the types package has no references. Remove it.
- **`caniuse-lite` is stale and warns on every build** — run `npx browserslist@latest --update-db`, or pin the data as part of the browserslist fix in dimension 4.

---

### 9. Documentation & Knowledge Transfer

**Risk Level**: Low

| Document                              | Status                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `README.md`                           | Present, accurate, unusually careful about the limits of its own claims |
| `docs/fonts.md`                       | Present, thorough, states measured numbers and their conditions         |
| `docs/multilingual.md`                | Present                                                                 |
| `fonts/README.md`                     | Present, full asset provenance                                          |
| `packs/NOTICES.md`, `packs/README.md` | Present, per-source licensing                                           |
| `COPYING.md`                          | Present, separates four distinct licence regimes                        |
| `LICENSE`, `CITATION.cff`             | Present                                                                 |
| `AGENTS.md`                           | Present                                                                 |
| `dev-docs/`                           | Nine plan, research, and evidence documents                             |
| `CONTRIBUTING.md`                     | **Missing**                                                             |
| `SECURITY.md`                         | **Missing**                                                             |
| `CHANGELOG.md`                        | **Missing**                                                             |
| Architecture overview or module map   | **Missing**                                                             |

The documentation is a genuine strength. `docs/fonts.md` states what the animation preparer does and does not claim, names the exact character that fails and why, reports a measured attach time with the machine it was measured on, and explicitly separates "verified text", "replacement inventory", and "unmapped" coverage claims. Very few projects distinguish their own evidence classes this carefully.

#### Low

- **No `CONTRIBUTING.md`** — a repository with fifteen distinct check commands, five of which need Playwright and a 194 MB asset tree, gives a new contributor no map of which gates to run locally and which to leave to CI.
- **No `SECURITY.md`** — no disclosure address for a library that parses untrusted font files, SVG path data, and third-party JSON.
- **No `CHANGELOG.md`, while `package.json` declares version 3.0.0 and the most recent commit is `feat!`** — a breaking change is recorded in commit subjects only. The README documents the `HanziWriter` to `Scribing` migration inline, which covers the rename but not subsequent changes.
- **No architecture document for three parallel subsystems** — the character path (`Scribing` + `Quiz` + `parseCharData`), the writing-unit path (`setUnit` + `UnitQuiz` + `compileUnit`), and the font path (`FontWriter` + `extras/fonts`) share a render target and almost nothing else. `dev-docs/research/20260908-multilingual-implementation-audit.md` covers one of them at a point in time. A one-page module map with a Mermaid diagram would carry most of the value.

---

## Recommendations by Priority

### Immediate (Critical) — do first

1. **Remove `semantic-release`, `codecov`, and `@types/nise`** (`package.json`)
   - **Issue**: Four criticals, twenty-six highs, zero invocations, and `semantic-release` contradicts the stated manual-publishing policy.
   - **Effort**: ~15 agent-minutes plus one CI cycle. Mechanical.
   - **Dependencies**: none.

2. **Declare `jsdom` and `jest-environment-jsdom` in `devDependencies`** (`package.json`, used by `scripts/check-demo.cjs:4` and `jest-jsdom-env.js:6`)
   - **Issue**: Undeclared imports that resolve only through jest 26's hoisted tree.
   - **Effort**: ~10 agent-minutes plus one CI cycle.
   - **Dependencies**: must land before any jest upgrade.

3. **Decide the fate of the 194 MB font tree before committing it** (`fonts/`)
   - **Issue**: Untracked today, required by five CI steps and by `prepublishOnly`. Committing is irreversible without a history rewrite.
   - **Effort**: irreducible decision, roughly 30 agent-minutes of analysis; 1 to 2 agent-hours to implement LFS or a fetch step if that is the choice.
   - **Dependencies**: blocks the commit of the current working tree.

### Short-term (High) — within one to two weeks

4. **Guard the SVG pointer transform** (`src/renderers/svg/RenderTarget.ts:64`, `:74`)
   - **Issue**: Silent unconverted coordinates when `getScreenCTM()` returns null.
   - **Effort**: ~30 agent-minutes for the fix and a regression test; browser verification of the spec default adds one manual check.

5. **Reconcile `.codecov.yml` with measured coverage, then add fast unit tests for the mask geometry** (`.codecov.yml`, `src/fonts/animationMask.ts`, `src/fonts/validateAnimation.ts`)
   - **Issue**: A 96% gate against 72.94% actual, wired to nothing, over a 358-line module at 0.71%.
   - **Effort**: ~30 agent-minutes to reconcile config; 3 to 5 agent-hours to write the geometry tests. Mostly mechanical once the invariants are named; naming them is the thinking part.

6. **Format and lint `extras/fonts/*.mjs`, `demo/multilingual/*`, and `scripts/*.cjs`** (`.eslintrc`, `package.json` `lint-test`)
   - **Issue**: 1,500-plus lines of shipped and check-critical code at up to 570 characters per line, unlinted.
   - **Effort**: ~1 agent-hour. Fully mechanical, but produces a large diff — land it alone.

7. **Return early from `FontWriter.move()` when no point was appended** (`src/fonts/FontWriter.ts:649`)
   - **Issue**: Full SVG teardown and rebuild on every pointer event.
   - **Effort**: ~20 agent-minutes for the guard; 2 to 3 agent-hours for the element-reuse refactor behind it.

8. **Upgrade the toolchain** (jest, eslint, TypeScript, rollup, and the two deprecated plugins)
   - **Issue**: Four-to-five-year-old tooling carrying most of the remaining advisories.
   - **Effort**: 2 to 4 agent-hours of edits. Clock-time is dominated by roughly six sequential CI runs, one per upgrade step, since each must be verified independently.
   - **Dependencies**: items 1 and 2 must land first.

### Medium-term (Medium) — within one month

9. **Extract the shared structural validator** (`src/fonts/validateShape.ts`, `src/fonts/validateAnimation.ts`, `src/units/validateUnit.ts`, `src/units/provider.ts`) — ~2 agent-hours.
10. **Split `validateAnimation`, `prepareMaskField`, and `validateShape`, then enable the `complexity` rule** — ~3 agent-hours; unlocks the coverage work in item 5.
11. **Fix `package.json` metadata**: `author`, `engines`, `exports`, `sideEffects`, `keywords`, `browserslist` — ~45 agent-minutes. The `exports` map needs a decision on which deep imports are public.
12. **Clamp `Positioner` dimensions on the character path** (`src/Positioner.ts:39`) — ~20 agent-minutes.
13. **Guard `_getTouchPoint` against an empty touch list** (`src/renderers/RenderTargetBase.ts:87`) — ~15 agent-minutes.
14. **Derive `gradeStroke`'s sample indices from the array length** (`src/units/gradeStroke.ts:57`) — ~15 agent-minutes.
15. **Set `xhr.timeout` in the default loader and document the CDN dependency in the README** (`src/defaultCharDataLoader.ts`) — ~30 agent-minutes.
16. **Quantise the mask cache key and reuse SVG mask elements across frames** (`src/fonts/animationMask.ts:300`, `src/fonts/FontWriter.ts:458`) — ~2 agent-hours plus a measurement pass.

### Long-term (Low) — when time permits

17. Delete `assign`, `_assign`, and their tests; delete `Scribing._loadingManager` and `_loadingOptions`; delete `validateFontPath`, `demo/test_data.js`, and `.npmignore`; remove `isMsBrowser` and its two branches. ~1 agent-hour total.
18. Add `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, and a one-page architecture map with a Mermaid module diagram. ~2 agent-hours.
19. Size the `prepareMaskField` scratch arrays to the actual stroke count (`src/fonts/animationMask.ts:101`). ~20 agent-minutes.
20. Have `outline()` accept structured cells instead of re-parsing path strings (`src/fonts/animationMask.ts:174`). ~1 agent-hour.
21. Fix the remaining low-severity items: `parseFloat` radix, the `_assignOptions` asymmetry, `RenderState._run` on an empty looping chain, the sub-target `destroy()` path, `boundsOf` naming, the `no-shadow` rule, and a CSP meta tag on the demo pages. ~1 agent-hour.

---

## Positive Observations

- **Structural validation is genuinely hardened, not decorative.** Every validator inspects own property descriptors, rejects non-`Object.prototype` and non-`Array.prototype` prototypes, rejects symbol keys, rejects accessor properties, checks that the own-property count matches the array length, and rejects a `toJSON` hook by name. `src/units/provider.ts:60` validates before serialising specifically so that a hidden hook cannot substitute unvalidated data after the check. That ordering is deliberate and correct, and it is the kind of detail most reviews never reach.
- **Cancellation and lifecycle correctness is systematic.** Generation counters, abort controllers, and serial numbers guard `Scribing.setCharacter`, `Scribing._setUnit`, `Quiz`, `UnitQuiz`, `FontWriter.setAnimation`, and both demo scripts. Superseded loads settle rather than hanging. Reentrant callbacks that destroy or restart a writer cannot schedule work on the replacement. This is the failure class that breaks most interactive libraries, and it has clearly been attacked on purpose.
- **The one deliberate code duplication has an automated drift gate.** `extras/fonts/path-geometry.mjs` is generated from `src/fonts/pathGeometry.ts` by `scripts/fonts/build-geometry.cjs`, and `scripts/fonts/check-assets.mjs` regenerates it and asserts byte equality with a message naming the command to run. That is the right way to keep a derived copy honest.
- **`scripts/check-package.cjs` verifies the real tarball, not an approximation.** It runs `npm pack`, extracts it, asserts that no `src/`, `packs/`, `scripts/`, or font binaries leaked in, asserts the built bundles retain the upstream copyright and permission notice, asserts HarfBuzz did not leak into the core bundle, loads the CJS and ESM entry points, evaluates both browser bundles in a fresh VM context, exercises the optional provider through a mocked fetch, and compiles a strict external TypeScript consumer. Very few libraries verify their published artefact this thoroughly.
- **Documentation states the boundaries of its own claims.** `docs/fonts.md` distinguishes source-adapted from generated stroke plans in the user interface wording, names the one character that has no bundled glyph, reports a measured attach time with the machine it came from and calls it "measured setup cost, not a universal device guarantee", and separates three distinct grades of Unicode coverage claim. That is calibrated writing.
- **Zero runtime dependencies**, so none of the 846 advisories reaches a consumer of the published package.

**Recommendations to maintain these standards**:

- When the shared validator is extracted, keep the descriptor-level checks as the default and make any relaxation an explicit opt-in argument, so the strict path stays the path of least resistance.
- Extend the `check-assets.mjs` drift pattern: any other derived artefact added later should get a regeneration script and a byte-equality assertion in the same commit.
- Apply the `docs/fonts.md` habit of reporting the measurement conditions alongside the number to the animation frame-rate work in item 16.

---

## Summary Statistics

| Dimension                             | Critical |  High | Medium |    Low |  Total |
| ------------------------------------- | -------: | ----: | -----: | -----: | -----: |
| 1. Redundant & low-value code         |        0 |     0 |      2 |      5 |      7 |
| 2. Security & risk management         |        0 |     1 |      2 |      1 |      4 |
| 3. Correctness & reliability          |        0 |     1 |      3 |      4 |      8 |
| 4. Compliance & standards             |        0 |     0 |      2 |      3 |      5 |
| 5. Maintainability & readability      |        0 |     2 |      2 |      3 |      7 |
| 6. Performance & efficiency           |        0 |     1 |      2 |      2 |      5 |
| 7. Testing & validation               |        0 |     2 |      2 |      1 |      5 |
| 8. Dependency & environment safety    |        1 |     2 |      2 |      2 |      7 |
| 9. Documentation & knowledge transfer |        0 |     0 |      0 |      3 |      3 |
| **Total**                             |    **1** | **9** | **17** | **24** | **51** |

**Gate status at the time of audit** — every one of these passes:

| Gate                    | Result                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `yarn typecheck`        | pass                                                       |
| `yarn lint-test`        | pass (covers `src` only)                                   |
| `yarn test --runInBand` | 30 suites, 329 tests, 15 snapshots, all pass               |
| `yarn test-data`        | 19 tests pass                                              |
| `yarn check-data`       | 149 packs, 8,720 units, integrity verified                 |
| `yarn check-fonts`      | 139 fonts, 120 script entries, 149 packs, all hashes match |
| `yarn test-fonts`       | 34 tests pass                                              |
| `yarn build`            | pass (warns: `caniuse-lite` outdated)                      |

---

## Conclusion

Scribing's first-party code is stronger than its surroundings. The validation layer, the cancellation discipline, the packaging verification, and the licensing documentation are all above the standard this kind of library usually meets, and every gate in the repository passes today. There is no critical defect in code that anyone wrote here.

The risk sits in the perimeter. The dependency tree carries fifty-one critical advisories, and the two packages contributing most of them are declared but never invoked — one of them, `semantic-release`, existing to do precisely what the CI configuration says must never happen. Two dependencies that first-party code imports directly are not declared at all, and they will break the test suite the moment the overdue jest upgrade lands. A coverage gate demands 96% while measuring nothing, over a module sitting at 0.71%. And roughly 1,500 lines of the font runtime, shipped as npm source, are compressed to a density at which review is not possible.

None of these is difficult. The dependency cleanup and the two missing declarations are under half an agent-hour combined. The formatting pass is one agent-hour and fully mechanical. The substantive work — unit tests for the mask geometry, splitting the three highest-complexity functions, and the pointer-move rendering fix — is perhaps eight to twelve agent-hours of focused effort, with clock-time dominated by six or so sequential CI runs during the toolchain upgrade rather than by the edits themselves.

One decision cannot be deferred and is not the auditor's to make: whether 194 MB of font and motor assets enter git history. Five CI steps and `prepublishOnly` need them, no single file breaches GitHub's hard limit, so the commit will succeed and the cost will only become visible in every subsequent clone. Git LFS, a verified download step built on the existing `fetch-assets.mjs`, or a separate assets repository are all cheaper than a permanent 250 MB history.

**Production readiness**: the library is ready for the technical-preview status it claims. It is not ready to publish until `package.json` names its actual maintainer, the unused release tooling is gone, and the asset-hosting decision is made — all three of which block or contaminate the first `npm publish`.

**Next Steps**:

1. Land items 1 and 2 from the immediate list in two separate commits, today. They are mechanical and they unblock everything else.
2. Make the font-asset hosting decision before committing the current working tree.
3. Re-audit after the toolchain upgrade completes, focusing on dimensions 7 and 8, where the numbers should move the most.

---

**Audit Completed**: 2026-09-09
