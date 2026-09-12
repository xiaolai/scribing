# Stroke order for any font, by traversal rather than by fit

Date: 2026-09-12. Spike: `dev-docs/research/stroke-order-spike/`, evidence in
`evidence.json`. Run with `node dev-docs/research/stroke-order-spike/run.cjs <font-dir> [pruneRatio]`.

## The question

`registerSource` adopts a normative stroke plan for 94% of strokes on Noto Sans and
0% on joined cursive. Can anything reach every font?

## Why fitting cannot

Instrumenting the rejections separates two causes, and they are not the same problem.

| Font                | rejected: distance | rejected: topology |
| ------------------- | -----------------: | -----------------: |
| Andika              |                  1 |                  0 |
| Architects Daughter |                  7 |                  0 |
| Edu QLD Beginner    |                 13 |                  0 |
| Caveat              |                 19 |                  1 |
| Dancing Script      |                 13 |                 11 |
| Great Vibes         |                 16 |                  7 |

Distance rejections are near misses. Architects Daughter's median mean error is 0.056
against a 0.065 gate, so it passes on average and fails on the tail. Widening the fit
from horizontal scale and offset to include slant and vertical scale doubled Caveat,
4/26 to 8/26, lifted Edu QLD 9/26 to 11/26, and changed English, Chinese and Korean not
at all, at about 20% more time on English.

Topology rejections are not near misses. The counter count of the drawn model differs
from the glyph's, because a print `b` is a stem plus a bowl and a cursive `b` is a loop
with an exit stroke. No affine family turns one into the other, and the gate is right to
refuse. Forcing it would animate a stroke order the letterform does not have, which is
worse than falling back, because it teaches the wrong thing.

## The strategy that does reach every font

Stop asking whether the model's polylines can lie on the glyph. The glyph's own skeleton
already says **what** to draw. Use the model only for **how to order it**: how many pen
movements, where each begins, which way it travels. Geometry never has to agree, so the
failure that rejects cursive cannot arise.

1. Thin the glyph, prune short dead-end twigs, and build a graph whose edges are trails.
2. Seed a walk at the unused endpoint nearest an unclaimed model start, then follow edges,
   at each junction taking the one that best continues the current heading, until nothing
   unused adjoins. Repeat until the graph is empty.
3. Split a walk when the model asks for more movements than connectivity produced. Never
   concatenate across a gap.

## What it achieves, measured on thirteen fonts

|                                | Result                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| Ink revealed                   | 99.3-100% on every font, cursive included                             |
| Stroke continuity              | zero strokes jump; residual 0.015 is the skeleton's own point spacing |
| Strokes vs topological minimum | 44 vs 39 on Andika, so greedy walking is near optimal                 |
| Start fidelity, print hands    | 0.13-0.19 of glyph span                                               |
| Start fidelity, cursive        | 0.26-0.31 of glyph span                                               |

Continuity had to be designed in, not checked afterwards. The first version hit 26/26
coverage while 8 to 20 letters per font teleported, because leftover edges were appended
to the nearest stroke. Coverage was real and worthless. Enforcing connectivity in the
walk and only ever splitting fixed it.

## What it does not solve

The skeleton is intrinsically more fragmented than handwriting: 39 to 56 minimum pen
movements against the model's 35, even after pruning. Thinning a filled outline leaves
branches wherever a terminal flares, and each adds odd-degree nodes. Pruning twigs under
15% of glyph span closes about half the gap and costs nothing, because ownership floods
ink to the nearest stroke and 99.3% or more still gets an owner.

The residual cursive start offset of about 0.3 is not error. A print model's entry points
are genuinely not where a cursive letter begins. That is a data problem, not an algorithm
one, and it is the argument for a per-style model.

## Across all four scripts

The same spike, over the complete inventories rather than a sample: every Japanese and
Chinese unit the motor data holds, and every modern Hangul syllable. Fonts are the
catalogue's own Noto CJK faces. `cjk.cjs` runs it.

Chinese units are raw median arrays and Japanese units are motor records, so both reach
the traversal through `motorRecordFor`, the function the runtime loader uses, rather than
through a second reading of the same data.

Korean is composed rather than looked up. Its inventory is 40 isolated jamo, so a
syllable is split by `hangulRegions` exactly as the runtime splits it and each jamo is
ordered inside its own rectangle. Concatenating the jamo models instead is wrong and
quietly so: each fills its own em box, so all three map onto the whole syllable. A
wrapping vowel cannot be separated by rectangles at all, and those 3,727 syllables fall
back to traversing the syllable whole — worse ordering, complete coverage. The expected
count is 3,724, so three non-wrapping syllables also decline for reasons not chased here.

Measured with no pruning, on the full inventories:

| Script              |     Glyphs |   Ink owned | Glyphs fully owned | Strokes that jump | Strokes vs model | Start offset |
| ------------------- | ---------: | ----------: | -----------------: | ----------------: | ---------------: | -----------: |
| japanese            |      6,635 |     100.00% |     6,635 of 6,635 |                 0 |            +4.4% |        0.156 |
| chinese-simplified  |      9,574 |     100.00% |     9,574 of 9,574 |                 0 |            +5.1% |        0.161 |
| chinese-traditional |      9,574 |     100.00% |     9,574 of 9,574 |                 0 |            +5.8% |        0.161 |
| korean              |     11,172 |     100.00% |   11,172 of 11,172 |                 0 |            +4.0% |        0.223 |
| **all four**        | **36,955** | **100.00%** |            **all** |             **0** |        **+4.9%** |              |

Thirteen Latin fonts add 338 more glyph renderings on the same terms: 100% ink owned,
zero jumps, on every one including the four joined cursives the shipped fitter rejects
outright. Roughly 430,000 strokes were emitted in total and none of them teleports.

Cost is about 24 ms per glyph, dominated by thinning, not by the traversal.

## Pruning is the wrong tool, and the tail is what showed it

Dropping short dead-end twigs closes about half the gap between the skeleton's minimum
pen movements and the model's stroke count, and it looked free: 99.13% of ink still owned.
The per-glyph distribution said otherwise. The worst Chinese glyphs were 黔 沩 浒 渌 沁 泼,
almost all carrying the three-dot water or four-dot fire radical, at 82-86%. The threshold
is relative to the whole glyph, so a radical's dot is legitimately shorter than 15% of the
glyph span and was pruned away entirely.

| Chinese simplified, 9,574 glyphs | prune 0.15 | prune 0 |
| -------------------------------- | ---------- | ------- |
| Ink owned                        | 99.13%     | 100.00% |
| Fully owned glyphs               | 7,903      | 9,574   |
| Worst single glyph               | 81.63%     | 100.00% |
| Strokes emitted                  | 113,893    | 118,384 |
| Mean start offset                | 0.179      | 0.161   |

Turning it off costs 4% more strokes and improves everything else, the start offset
included. A width-relative threshold might prune spurious twigs without eating real dots,
but a span-relative one cannot, and coverage is the property this approach exists to buy.

## Recommendation

These are different guarantees and should coexist. Fitting says "this animation follows a
known-correct stroke path" and should stay the preferred path wherever it succeeds.
Traversal says "the whole glyph is revealed in a model-guided order" and is available
everywhere, on every script tested, at 100% coverage with no discontinuity. Ordering them
fit, then traverse, then generate strictly improves on today's fit-then-generate, because
traversal is always better ordered than generation and never worse covered.

Do not prune. Coverage is what this buys, and a span-relative threshold spends it.

The remaining honest limits are about ordering, not coverage. Traversal emits about 5%
more strokes than the models prescribe, because a thinned outline branches where a pen
does not. Cursive start offsets stay near 0.3 against 0.16 for print, which is not error:
a print model's entry points are genuinely not where a cursive letter begins. Both are
arguments for per-style models, and the mechanism to consume one already exists.

## Shipping this to users who bring their own fonts

Fonts cannot ship. The catalogue's 139 Noto faces are already 169 MB and every addition
carries a licence. Models can ship: four groups, 21 MB, already excluded from the npm
core. The traversal is what binds an arbitrary font to a shipped model, so the split is
fonts from the user, order from us.

The user path already exists. `provider.shapeCustom({ text, bytes, name, scriptId })`
takes raw TTF/OTF bytes with no catalogue entry and no pinned digest, which is how the
demo's local-font picker works. Running the traversal on that path directly:

| User-supplied font | Ink owned | Strokes that jump |        Cost |
| ------------------ | --------: | ----------------: | ----------: |
| Great Vibes        |   100.00% |                 0 | 22 ms/glyph |
| Andika             |   100.00% |                 0 | 16 ms/glyph |

So no conversion step is needed for the web runtime. Twenty milliseconds on demand is
interactive, and nothing has to be precomputed or stored.

A precompute tool is still worth having for consumers that cannot run a canvas at render
time, such as the Swift port. Sampling 400 Chinese glyphs: 12 strokes and 631 points per
glyph raw, falling to 50.6 points after Douglas-Peucker at one pixel. Extrapolated over
all 9,574 units at two bytes per coordinate pair that is 12.1 MB raw and **1.0 MB
simplified** — a per-font, per-script artifact small enough to ship beside the font.

The bound is scripts, not fonts. Models exist for English, Japanese, Korean and Chinese,
reaching seven of the catalogue's 120 entries. A user's Devanagari font will shape and
render, and have no normative order to be given, because none is authored — not because
the traversal cannot reach it.

## What was wrong on the way here

Three failures worth recording, because each looked like success.

The first version reported 26/26 coverage while 8 to 20 letters per font teleported,
because leftover edges were appended to the nearest stroke. Coverage was real and
worthless; continuity had to be designed into the walk rather than checked after it.

The English model declares `yAxis: 'down'` and the spike assumed up, mirroring every
start point. It showed as a suspiciously uniform 0.3 offset across all thirteen fonts.

Korean concatenated its jamo models, and since each fills its own em box they all mapped
onto the whole syllable. Fixing it exposed two more: requiring a trail to lie wholly
inside a region silently dropped everything crossing a cut, and declining wrapping vowels
produced nothing at all where a whole-syllable fallback was available.
