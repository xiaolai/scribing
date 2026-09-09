# Contributing

## Setup

```sh
git clone https://github.com/xiaolai/scribing.git
cd scribing
yarn install --frozen-lockfile
yarn build
```

Node.js 22 or newer. The published package declares `engines.node >= 20.19.0`, but the
development toolchain and CI both run on 22.

## The two tiers of checks

The checks split into a fast tier that needs nothing but the repository, and a slow tier
that needs real browsers and about 169 MB of font binaries. Run the fast tier before
every commit. Leave the slow tier to CI unless you are changing font rendering,
animation geometry or the demo.

### Fast: run these locally, every time

```sh
yarn prettier-check   # formatting
yarn lint-test        # eslint, whole repository
yarn typecheck        # tsc, source and package build config
yarn test             # jest, with coverage thresholds
yarn test-data        # writing-data model tests
yarn check-data       # pack integrity and hashes
yarn build            # rollup bundles and declarations
yarn check-demo       # jsdom demo smoke test
```

All of these finish in well under a minute together.

`yarn check-data-reproducible` takes about 20 seconds and rebuilds all 498 generated
data files to confirm they are byte-identical. Run it if you touch anything under
`scripts/data/`.

### Slow: needs font binaries and browsers

`fonts/assets/` is deliberately not in git. Restore it once:

```sh
yarn fetch-fonts      # ~169 MB, verified against fonts/assets.lock.json
yarn playwright install --with-deps chromium webkit
```

Then:

```sh
yarn check-fonts             # offline hashes and derived-artifact drift, ~2 s
yarn test-fonts              # shaping and source-loader tests, ~2 s
yarn check-multilingual-demo # ordered-model demo workflow
yarn check-font-demo         # real browser rendering and practice
yarn check-font-sources      # Chromium and WebKit source/retry workflow
yarn check-font-animation    # all 120 catalog entries
yarn check-font-contours     # analytic reveal fronts at two sizes and two DPRs
```

The last three take **many minutes each**. `check-font-contours` exceeds ten minutes
even with `ISO_SMALL=1`, which reduces it to one size, one device ratio and SVG only:

```sh
ISO_SMALL=1 node scripts/fonts/check-contours.cjs
```

Budget for that before you start editing `extras/fonts/skeleton.mjs`,
`extras/fonts/progress.mjs` or `src/fonts/animationMask.ts`. Those files have fast unit
tests for their invariants, but only the browser gates check the rendered result.

## Things that will bite you

**Derived artifacts are hash-pinned.** Several files are generated and then asserted
byte-for-byte by `yarn check-fonts`. If you change a source, regenerate its copy:

| Derived file                                                                   | Regenerate with                          | Pinned by                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------- |
| `extras/fonts/path-geometry.mjs`                                               | `node scripts/fonts/build-geometry.cjs`  | equality with Babel output of `src/fonts/pathGeometry.ts` |
| `demo/multilingual/index.html` import map                                      | `node scripts/fonts/stamp-demo.cjs`      | content hashes of `extras/fonts/*.mjs`                    |
| `fonts/catalog.json`, `fonts/script-ranges.json`, `scripts/fonts/scripts.json` | `python3 scripts/fonts/build-catalog.py` | `fonts/catalog.lock.json`                                 |
| `fonts/motor/*.json`                                                           | `python3 scripts/fonts/build-motors.py`  | `fonts/motor/index.json`                                  |
| `packs/generated/**`                                                           | `yarn build-data`                        | `yarn check-data`                                         |

`.prettierignore` excludes the hash-pinned inputs for the same reason. Reformatting one
breaks its gate.

**A Babel upgrade changes the derived geometry copy.** `path-geometry.mjs` is Babel's
output for `pathGeometry.ts`, so any Babel version bump requires regenerating it.

**Data reproducibility depends on exact dependency versions.** `fflate`, `svgpath`,
`saxes`, `harfbuzzjs` and `hanzi-writer-data` are pinned without a caret. `fflate` in
particular is recorded in every pack manifest as `fflate@0.8.2 gzip level9 mtime0`.
Upgrading it would invalidate 149 manifests.

## Code standards

`eslint.config.js` enforces correctness rules everywhere with no exemptions, and
structural limits (complexity 20, 110 lines per function, depth 8) on everything except
a named `GRANDFATHERED` list. That list holds numeric kernels whose only checks are the
slow browser gates. Adding to it needs a reason; removing from it is welcome.

Coverage thresholds live in `jest.config.js`. Raise them when coverage rises. Do not
lower them to make a red build green.

## Commits and releases

Small, self-contained commits. Each one should leave the fast tier green.

Publishing is manual and deliberate. `prepublishOnly` fetches the font binaries,
builds, and verifies the packed tarball, so it works from a clean checkout. CI never
publishes.
