# Changelog

All notable changes to this project are recorded here. Dates are ISO 8601.

## [Unreleased]

Nothing yet.

## [4.2.0] - 2026-09-12

Supersedes 4.1.0, which was tagged but never published.

### Fixed

- **A batchim-less Korean syllable with ㅗ, ㅛ or ㅡ was cut in the wrong place.**
  Reported from the native port, which follows `hangulRegions` line for line, and
  reproduced here against its own rasters.

  `horizontalLayout` looked for the vowel's wide bar only between 0.3 and 0.56 of the
  ink box. That window was fixed when 가, 한 and 글 were the only supported syllables,
  and all three put their bar inside it; generalising to all 11,172 added a docstring
  saying the bar is found across the whole box but left the window alone. Without a
  batchim the vowel drops to the foot of the block, so for those three vowels the bar
  sits at about 0.91 and the window could not see it. The widest row it could see
  belonged to the **initial**, and a round initial clears the span gate, so the
  function returned a confident pair of rectangles splitting the initial in half.

  Across all 95 batchim-less syllables with a horizontal vowel in Noto Sans CJK KR:
  ㅜ, ㅠ and ㅡ went from 21 fitted entirely and 30 generated to 51 fitted and none
  generated. ㅗ and ㅛ went from 9 syllables animating with a boundary drawn through
  the middle of the initial to 38 declining explicitly, which is the answer this
  function already gives a wrapping vowel and for the same reason: their stem rises
  above the bar and, once the bar drops, lengthens into the initial's own band, so no
  horizontal line separates them. 오 and 요 do separate in this face, but telling them
  apart from 고 and 교 needs thresholds that one face's rasters cannot justify, and
  thresholds fitted to one face are what put the window at 0.56 to begin with.

## [4.1.0] - 2026-09-12

### Added

- **A middle tier between fitting a stroke model and giving up on it.** A fit registers
  the model's own geometry onto the glyph, so it serves only letterforms the model
  already matches; everything else fell straight to generation, which orders by shape
  alone. Where a fit is rejected, the glyph's own skeleton is now traversed in the order
  the model implies and reported as `source-ordered`: the shape is the font's and the
  sequence is the model's. Verified on 36,955 CJK glyphs and 338 Latin renderings at full
  ink coverage with no discontinuities.
- **A coverage page for fonts the package does not ship.** `/tools/font-coverage/` takes
  a TTF or OTF, prepares every character through the shipped runtime, and reports the
  tier each one reached with its strokes drawn in order. The font is read locally and
  never leaves the page. `npm run check-font-coverage-tool` drives it in a real browser.

### Fixed

- **The ordering tier was offered even when the model described a different letterform.**
  Rejecting a fit has two causes that had been collapsed into one. A rejection on
  placement means the model does describe the glyph, so its order still applies; a
  rejection on topology means it does not. A double-storey `g` encloses two counters
  where the single-storey model encloses one, leaving the lower loop with no stroke to
  name. Those now reach generation with no unit named, and the browser gate asserts the
  absence rather than only the provenance.
- Documented behaviour that had fallen behind the code: Korean composes any of the 11,172
  modern syllables rather than three fixed ones, and the single-storey `a` against a
  double-storey font is ordered rather than generated.

An independent audit of the twelve shipped font-subsystem files followed, and 83 of its
98 findings are fixed here. Each carries a regression test or gate assertion that was
confirmed to fail against the previous code.

- **The reveal gradient read all eight neighbours of a cell while the cutoff deciding
  which ones count measured only the two orthogonal ones.** A stroke whose cells touch at
  their corners had no pair measured at all, so it appeared in one jump instead of
  growing. The same solver treated a singular system as two independent axes, which
  predicted twice the step a single diagonal neighbour actually had.
- **Contour area was summed about the origin.** For a small contour far from it, each
  cross product was a difference of large nearly-equal numbers: a hundredth-unit square
  measures zero at ten million, inside the accepted coordinate range, and a zero area
  suppresses every probe for that contour.
- **A contour's own crossings were the only scanline boundaries.** A square holding a
  nearly identical square produced one interval whose midpoint lands in the hole, so the
  sliver of real ink between them received no probes at all.
- **Playback resolved over a surface it never drew.** A scratch layer the browser refused
  a context for was skipped, so the run finished and resolved with that tile missing.
- **Pointer input was mapped against the border box** rather than the content box, so any
  border or padding offset every sample.
- **Cancellation was checked immediately before each yield**, where nothing could have
  changed the flag, across twenty-eight sites. At a budget boundary a pass returned
  success while the caller had already cancelled.
- **Concurrent misses for one font each downloaded, hashed and instantiated it.** Callers
  share one transfer now, and it is abandoned only when every caller waiting on it has
  gone. Catalogue structure, script metadata and font references are validated at
  construction instead of failing later as an uncoded TypeError.
- **Glyph coverage was decided by asking the cmap**, which refuses a character HarfBuzz
  can still render by canonical decomposition. The shaped output decides now.
- Smaller: a failed source request no longer discards what a successful one verified,
  records are frozen on their way out of the loader, a straight run the model asks twice
  of is divided rather than silently left short, degenerate curves no longer overwrite
  real progress, ownership seeding honours the coverage mask, and unchanged SVG is not
  rewritten on every frame.

## [4.0.1] - 2026-09-12

### Fixed

- **The published README said the package was not published.** It is the first thing a
  visitor to the npm page reads, and 4.0.0 shipped with "This fork has not yet been
  published to npm" still in it, along with "Nothing has been published" in the bundled
  changelog. Both were written while that was true and neither was revisited before the
  release. The README now carries an install line, which it had never had, since a reader
  arriving from npm wants that first.
- `SECURITY.md` said supported-version reporting applied only to `master` because nothing
  was published. It now names the released version.

## [4.0.0] - 2026-09-11

First release under the Scribing name, and the first release of this fork at all. It
succeeds Hanzi Writer 3.7.3 and is breaking against it: the default export, the browser
global and the bundle filenames are all renamed, the Node floor is 20.19, and an
`exports` map now governs which paths a consumer may import. Replace `HanziWriter` with
`Scribing` and update bundle paths. The inherited API is otherwise unchanged.

A hardening and modernization pass covering the toolchain, the validation layer, test
coverage and the check gates. Within the fork's own API nothing was removed or renamed;
the package name and version did change, and the rebrand from Hanzi Writer before it was
breaking in its own right. See the migration notes in the README.

**The package is now `@lixiaolai/scribing`, at version 4.0.0.** The fork carried
`hanzi-writer`'s version 3.0.0, which upstream set in January 2021 and which the rebrand
left untouched. It was also behind this repository's own tags, which run to v3.7.3,
because upstream's `semantic-release` tagged at publish time without committing
`package.json`.

The unscoped name `scribing` belongs to an unrelated npm package, a collaborative
rich-text editing model, so it was never available to publish under. Scoping settles
that, and a scoped package is restricted by default, so `publishConfig` sets `access` to
public and pins `registry` so a stray scope-level registry setting cannot redirect a
publish. `yarn check-publish` performs a dry run.

4.0.0 rather than a fresh 1.0.0, for two reasons. The README presents this as the
migration target for Hanzi Writer users and tells them to replace `HanziWriter` with
`Scribing`, so the release is the breaking successor to 3.7.3 and numbering it as one is
honest. And every tag from v1.0.0 to v3.7.3 in this repository is upstream's, so a 1.0.0
release could not be tagged without moving an existing tag or inventing a parallel tag
namespace; v4.0.0 is free and keeps `git describe` meaningful.

Published as `@lixiaolai/scribing`. The inherited upstream tags are left in place.

### Fixed

A second audit pass closed every remaining behavioural finding. The entries below group
them by what was wrong rather than by file. What the pass did not change was
twenty-eight requests for a structural limit stricter than the one this project
configures: complexity 15 against the 20 in `eslint.config.js`, or 50 lines per function
against 110. Those limits are a deliberate choice recorded there, and the few files that
exceed even them are in that file's `GRANDFATHERED` list with the reason.

**Animation chains could hang, drift or fall back to the wrong colour.** A duration that
cannot be run — `strokeAnimationSpeed: 0` arrives as `Infinity`, a negative speed arrives
negative — produced a tween whose progress never reached 1, so the animation stalled and
its promise never settled; it is now instant. A `Delay` rewrote its own configured
duration when paused, so every later iteration of a looping animation was short by
however long it had been paused. Pause bookkeeping carried into the next run of the same
mutation, starting its progress below zero. A renderer exception during a frame escaped
into the animation-frame callback with nothing to settle the mutation, leaving its chain
active forever; it now fails the chain. A chain paused between mutations kept going,
because the index advances in a microtask and the pause landed on a mutation that had
already finished. `radicalColor` resolved to a copy of the initial `strokeColor` instead
of staying null, so radicals never followed a later `strokeColor` change; and animating
it back from null wrote objects into every colour channel.

**The renderers had no real lifecycle.** The canvas renderer's `destroy` was a no-op, so
the previous character stayed on screen for the whole of its replacement's load and
forever if that load failed. The SVG renderer emptied the target's shared `<defs>`, which
clipped away the strokes of every other writer on the same element. A missing 2d context
was dereferenced; a throwing stroke renderer left a transform on the stack. Pointer input
now belongs to one touch, so releasing an unrelated finger anywhere on the page no longer
ends the stroke being drawn, and a `<g>` target uses the inverse screen matrix rather than
subtracting a painted bounding box.

**Quiz state could be left inconsistent by ordinary input.** An exception from a feedback
callback abandoned the rest of `endUserStroke`, leaving the gesture open and the quiz on
the stroke just completed, so the same stroke could be submitted again and again.
Skipping kept the gesture that belonged to the stroke being left behind and graded it
against the next one. A gesture spanning a resize mixed points from two coordinate
spaces. A backwards match skipped stroke-order disambiguation entirely, so with
`acceptBackwardsStrokes` a later stroke drawn backwards was accepted as the current one.

**Several boundaries accepted data they should not have.** A writing-data-pack manifest
passed with an empty-object license and no name, version, provenance or source name. A
font catalog entry without a pinned digest turned the integrity check into a no-op that
still looked like it had run. Font and stroke-source downloads buffered whatever arrived
before any size limit applied, because `content-length` is advisory and `Number(null)` is
zero. `holeCount` looped forever on a mask shorter than its declared dimensions, because
a write past the end of a typed array is dropped silently. Owner ids past 65535 wrapped
to zero in a `Uint16Array` and read back as unowned. Colour components with enough digits
reached the renderer as `Infinity`. Path validation accepted whitespace outside the SVG
grammar, and text validation accepted the C1 control block.

**Hot paths did work proportional to the wrong thing.** Every SVG frame emptied the
surface and rebuilt one element per glyph plus one per learner stroke; every canvas frame
threw away a drawing buffer of exactly the same size. Playback scanned a whole tile per
frame for a stroke covering a fraction of it. Every probe row tested every contour
segment, about 64 million comparisons for one fixture. Trail joining restarted its whole
double loop after each join. Curve normalisation was recomputed for the same curves.
A pointer gesture copied all of its points on every move and recorded points a fraction
of a pixel apart, so a stroke cost quadratic in how long it took to draw rather than in
the length of the path.

**Two reveal defects in the animation mask.** A fixed neighbour cutoff rejected every
neighbour of a stroke shorter than eight cells, so the gradient collapsed and the stroke
revealed in whole-cell jumps. A stroke split across tiles has no coherent timing, because
each tile rescales its strokes to the full clock range on its own; it is now rejected,
along with a stroke that lies entirely outside the glyphs it claims.

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

A third pass audited the font subsystem specifically, which the two earlier passes had
not covered on its own: `src/fonts`, `extras/fonts` and `scripts/fonts`. Sixty findings,
all closed. As above they are grouped by what was wrong.

**A rejected animation preparation left the writer frozen.** `cancel()` is what settles
playback, restores input and resolves the promise `animate()` returned, and it ran only
on `setAnimation`'s success path. One counter served both the preparation and the
playback, so merely starting a preparation invalidated the running tick, which then
bailed at its own supersede check and did none of that work. A preparation that went on
to throw therefore left the writer stopped mid-animation with drawing disabled and that
promise pending forever. The two are now counted separately, so a failed preparation
leaves valid playback running, which is what the browser gate had always asserted.

**Playback steps that reveal nothing were accepted.** Stroke reachability compared every
owned cell against one rectangle spanning all of a tile's glyphs, so a stroke owning only
the empty gap between two glyphs counted as reaching them. It is now tested against each
glyph's own box. Separately, a tile whose glyphs are all pathless has no outline to
reveal at all, and the containment check skipped it for exactly that reason, leaving it
free to own a stroke; it is now refused.

**An explicit `undefined` erased the default behind it.** `definedEntries` exists to stop
that and was applied in `FontWriter`'s constructor but not in `updateDimensions`, so
`{padding: undefined}` was validated as 16 and rendered as 0. The same shape appeared in
both of `Scribing`'s option merges, where the default character-data loader is called
with no fallback of its own. The helper now lives in `src/utils.ts` and is used at all
four sites.

**Cancellation was checked before yielding and never after.** Three passes in
`skeleton.mjs` could therefore swallow an abort raised during their final yield and hand
the caller a successful result. `repairSourceJunctions` also ignored an already-aborted
signal when it had fewer than two sources to join. Per-tile animation validation reads
two million cells with two whole-array inspections and offered no cancellation point at
all across any of it.

**Several measurements answered a wider question than the one being asked.** The turn and
terminal probes in `progress.mjs` measure how far ink extends sideways from a stroke, in
order to bound a radius for that stroke, and they tested the glyph-wide ink mask: an L
with neighbours against the two sides that limit its corner moved 275 of its own cells by
up to 1,892 of 65,535 purely because those neighbours existed. `repairSourceJunctions`
documents `maxWork` as "geometric operations before the run gives up" and charged its
projection loops, which are the bulk of that geometry, to a scheduling counter only.
`animationMask` derived its continuity cutoff from a stroke's owned-cell area rather than
its length, which repeated for thick strokes the exact failure the cutoff was added to
fix: four cells wide and two long, it landed back on the old constant and rejected every
advancing neighbour, and the stroke revealed in one jump rather than progressively. Its
two stages also used different cutoffs, so they disagreed about which neighbours were
continuous.

**Boundary and conditioning errors.** `thinInk` needs all eight neighbours and so never
considered the first or last row or column, leaving a mask whose ink reached the edge
with a solid bar there; a 5x5 block touching two edges lost no cells at all. The owner-id
bound rejected 65535, which is representable and reserved for nothing. A `cut()` call
site tested only an upper bound and so let the function's -1 "not found" sentinel through
into a region. `validateShape` wrote its recomputed bounds back unchecked, so it could
return a width above the limit every input value had to satisfy and then reject its own
output. And the quadratic root formula lost most of one root's digits to cancellation:
the cubic `M0 0C1 1100 2 100 3 -2999.99999999999Z` reported a maximum of 431.40 against a
true 432.14, understating bounds that every fit and containment check works from.

**Two validators disagreed about the same data.** The optional source loader accepted
identifiers that were empty or longer than 256 characters, which `validateAnimation` then
rejected, so the loader could approve data that could only ever produce an unusable
animation. A plan step searched up to 8,192 motor strokes linearly per step, making a
record the validator accepts cost up to 67 million comparisons with no cancellation
point. An index read failure was reported as invalid JSON rather than as a network error,
unlike the equivalent group-body path beside it.

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
- **Two caps on untrusted input became one.** The capped stream reader existed twice, in
  the font provider and in the animation source loader, and a bypass fixed in one would
  have left the other open. They now share `extras/fonts/capped-read.mjs`, which imports
  nothing, so the provider is still independent of the animation graph. Overflow is a
  `RangeError` and each caller reports it in its own vocabulary.
- **A single source stroke could allocate past the browser.** The animation source loader
  compared its 200,000-point budget only between whole strokes, and `resample` built one
  stroke's full expansion before returning, so a source at the validator's million-point
  ceiling produced roughly 128 million points first. The budget is now checked inside the
  segment loop, before the allocation.
- **Control characters U+0080 to U+009F were accepted by the provider.** `validateShape`
  excludes them because U+0085 is a line break and U+009B an escape introducer; the
  provider's metadata and text checks stopped at C0 and DEL, so it approved labels the
  core validator refuses.
- **A rejected or oversized font response was abandoned without being cancelled.** Both
  paths throw before anything reads the body, and `load` then removed its abort listeners,
  detaching the request from `destroy()`, so the transfer ran to completion in the
  background with nothing able to stop it.
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
- **Trail joining was quadratic and ran on the main thread with no checkpoint.** It
  compared every trail against every later one, when a join requires the two to share an
  endpoint exactly. An endpoint index gives the same candidates: a 300x300 mask of ten
  thousand isolated two-cell marks went from 9,195 ms to 40 ms, with output verified identical
  across thirteen masks including noisy ones. A consumed trail is left as a hole rather
  than spliced out, which keeps the surviving order and so keeps which join wins.
- **Contour probing stored one entry per edge per row.** A path of under four thousand
  characters, against a half-million-character limit, allocated 189 MB. An active-edge
  sweep holds each edge once, at 5.5 MB, with probe output identical across 162 cases.
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

Every catalogue script entry now declares `strokeOrder`, either `normative` with its
source group and unit count or `none` with the reason. The two things the catalogue
describes had been advertised as one: outlines, tracing and shape reveal work for all
120 script entries, while normative stroke order exists for four source groups and
reaches seven entries. `check-fonts` asserts the field against the motor index the
runtime consults, so the catalogue cannot claim a group the loader would never select.
No authority publishes a normative order for the remaining 113 scripts; see
`dev-docs/research/20260911-normative-stroke-order.md` for the survey behind that.

The public type surface tightened in six places. Nothing was removed or renamed, but a
consumer who was relying on one of these will now see a compile error rather than
behaviour that never worked.

- `FontWriter.getShape()` is typed `ReadonlyFontShape`, which is what it has always
  returned: a deeply frozen object. Writing to it threw in strict mode and was dropped
  silently everywhere else.
- `validateShape` returns `ReadonlyFontShape` for the same reason, and the readonly type
  is carried through every reader of a shape rather than stopping at the boundary.
- `ReadonlyFontShape` keeps its tuples. `DeepReadonly` mapped every array through
  `readonly U[]`, so `bounds` arrived as `readonly number[]` and a consumer lost the
  guarantee that it holds exactly four numbers. Both this and the point above are pinned
  by `@ts-expect-error`, which fails the build if either widens again.
- `ScribingOptions` no longer offers `bounds`. The writer takes it from the writing unit
  it has loaded, so a caller-supplied value was accepted by the type and then ignored.
- `strokeWidth` and `outlineWidth` are marked deprecated with the reason. Neither
  built-in renderer reads either, because a character stroke is a filled outline with no
  line width; the width of the lines a learner draws is `drawingWidth`.
- `updateColor` throws a named error for a null on a colour that has no fallback, where
  it used to fail with "Cannot read properties of null". `highlightCompleteColor` accepts
  null, which its own documentation has always promised.
- A char data loader is passed an `AbortSignal` as a fourth argument, and the promise
  from `animateCharacter` and its siblings can now reject when a renderer throws instead
  of never settling. A loader that ignores the new argument still works.

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

- **The optional runtime has per-file coverage floors.** `extras/fonts` ships in the
  package and had no enforced coverage at all. Now measured: capped-read 100%, provider
  97.7%, progress 86.0%, yield-work 84.2%, skeleton 62.7%, animation 36.7%. An aggregate
  threshold would let one file rot while the total held, so `check-coverage.mjs` asserts
  a floor per file, and asserts the inventory too, since a module no test imports
  disappears from the report rather than failing. The inventory is now read from the
  directory rather than from the floor list itself, so a newly shipped module that no
  test imports fails instead of passing unnoticed; the suite list is read from the
  `test-fonts` script rather than repeated.
- **The vendored HarfBuzz runtime is cross-checked against the dependency.**
  `extras/fonts/vendor` is a copy, not a resolved dependency, so bumping `harfbuzzjs`
  left the vendored bytes stale while the vendor manifest and those bytes stayed
  mutually consistent, making the drift invisible. `check-assets.mjs` now fails if the
  manifest version and the installed version disagree.
- **Five gates could not fail.** `check-contours` computed the measure that detects
  excess ink and only logged it. Its one assertion counted reference pixels the render
  failed to cover, so filling a counter or drawing outside the outline left that at zero. `check-endpoints` recorded final coverage and never
  compared it, so a blank reveal passed, and it tested only for an increase, so a reveal
  that lost ink read as a comfortable negative. `check-assets` duplicated the runtime's
  stroke-order policy and so could only ever agree with itself; it now imports the
  selector, and changing the runtime alone fails the gate. It also verified motor data by
  hash, count and text mapping but never by the schema the loader enforces, and let the
  lock file choose which files it was verified against. Each new assertion was confirmed
  by injecting a wrong value and watching it fire.
- **Vendored bytes are compared against the installed package.** Hashing them against
  their own hand-edited manifest proves only that the copy matches itself, so bumping
  `vendor.version` without re-copying left both consistent and stale. `packagePath` was
  recorded for this comparison and was not being used.
- **Two gate scripts launched Chromium outside their cleanup scope**, so a launch failure
  left the HTTP server listening and hung the process; three sibling scripts already did
  it correctly. A rejecting `browser.close()` also skipped the server close.
- **Three of seven static servers allowed caching.** These gates rebuild `dist/` and the
  demo between runs, so a cached response would let them assert against superseded bytes.
  A check now refuses any server without `Cache-Control: no-store`, which is also what
  revalidates `harfbuzz.wasm`: it is resolved from its loader's URL at runtime, and a
  relative URL drops the query, so no import-map version can reach it.
- **Both Python generators write platform-dependent bytes unless told not to.** Their
  output is hashed into the lock files and compared, so locale-dependent decoding and
  newline translation would make those hashes machine-specific, and the failure is
  invisible on a machine that happens to be UTF-8 and LF. A check now refuses either
  generator if it reads or writes text without naming an encoding. `assert` was also
  doing the data validation, which `python -O` strips before the script writes freshly
  blessed locks.
- **`yield-work.mjs` was a hand copy with no gate.** `path-geometry.mjs` is generated
  from its TypeScript source and byte-compared; this one was not, so the core and
  optional runtimes could drift. Both are generated and compared now, and the generator
  writes only when run directly, so the gate cannot regenerate the files it is about to
  compare.
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
