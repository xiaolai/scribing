# Normative stroke order: what exists, and what cannot

Research date: 2026-09-11. This note is the counterpart to [20260908-multilingual-pen-data.md](20260908-multilingual-pen-data.md). That note surveyed **recorded** pen trajectories and found a great deal of it. This one surveys **normative** stroke order, meaning the sequence a script's own teaching tradition says is correct, and finds almost none of it. The two are not substitutes, and conflating them is the mistake this note exists to prevent.

**Normative stroke order is published for four scripts and no others.** Chinese, Japanese, Korean and, partially, Devanagari. For the other 116 of the 120 script entries in `fonts/catalog.json` there is nothing to acquire, at any price, because no authority has published one. Two of the four gaps close with data the repository already owns.

## The distinction this note turns on

|                | Recorded trajectory                           | Normative stroke order                                   |
| -------------- | --------------------------------------------- | -------------------------------------------------------- |
| What it is     | what a writer did                             | what a learner should do                                 |
| Typical source | Omniglot, UNIPEN, Calliar, KHATT, UJIpenchars | a ministry standard, a curriculum, a maintained database |
| Answers        | "is this shape reachable by a pen?"           | "is this the right way to write it?"                     |
| Availability   | broad, dozens of scripts                      | four scripts                                             |

The earlier note already flagged the risk in its own words: Omniglot "participants copied displayed symbols; their trajectories need not follow native handwriting conventions." That caution held. The packs derived from those archives are correctly labelled `recorded`, and they should never be presented as stroke-order instruction.

The failure mode is subtle because a recorded trajectory _looks_ authoritative once it is animated. A learner cannot tell, from watching, that the sequence came from an Amazon Mechanical Turk worker who did not read the script.

## What the repository ships today, measured

Read directly from `fonts/motor/*.json` and `packs/generated/*.json` at `462a8fc1`.

| Group    | Units | Source                            | Pack provenance        | Self-declared status                                              |
| -------- | ----: | --------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| chinese  | 9,574 | makemeahanzi lineage              | authored               | technical-preview                                                 |
| japanese | 6,636 | KanjiVG `55b5ba92`                | authored (transformed) | technical-preview                                                 |
| english  |    52 | Scribing original textbook models | authored               | "not a certified curriculum or a universal stroke-order standard" |
| korean   |    40 | Scribing original textbook models | authored               | "technical preview, not pedagogically certified"                  |

Across all 149 packs: 98 `authored`, 50 `recorded`, 1 `mixed`.

Two findings matter more than the counts.

**Korean does not cover Korean.** The 40 units are isolated jamo. The pack says so: "no syllable-block composition." Lookup in `animation.mjs` is by exact string, so real text resolves to nothing:

```
한 -> no stroke data      ㅎ -> found
글 -> no stroke data      ㅏ -> found
가 -> no stroke data      ㄴ -> found
```

Every Korean word therefore falls through to the geometric `generated` path. The published figure of 40 characters overstates the useful coverage, which is zero.

**English has no standard to be correct against.** D'Nealian, Zaner-Bloser and the five Australian state styles teach different formations for the same letter. The pack's own description is the accurate one: authored geometry informed by educational guidance. It is defensible and it is not certified, and no certification is available to obtain.

## Survey of what exists elsewhere

Wikimedia Commons is where stroke-order material collects. Queried through the MediaWiki API on 2026-09-11, every category whose title contains "stroke order", 50 in total:

| Script                                                | Files | Nature                            |
| ----------------------------------------------------- | ----: | --------------------------------- |
| Japanese kanji and kana                               | 8,447 | KanjiVG, already the source here  |
| Chinese                                               |   655 | raster images, no vectors         |
| Devanagari                                            |    85 | 72 GIF, 13 SVG; the base alphabet |
| Hangul                                                |    50 | jamo only                         |
| Arabic, Thai, Hebrew, Tamil, Bengali, Cyrillic, Greek |     0 | no category exists                |

For Arabic the only corpora are recognition datasets: Calliar, AOLAH, Hijja, KHATT. All are recorded, all are descriptive, all reproduce the Omniglot problem at larger scale. They are useful for evaluation and useless as instruction.

## Three actionable findings

**Hangul composition closes Korean entirely, with no new data.** Hangul is compositional and both halves of the rule are fully specified. Unicode gives the arithmetic decomposition of a syllable into initial, medial and final. The writing rule is initial, then medial, then final; the batchim sits at the bottom; multiple batchim are written left to right. Applying that to the 40 jamo already in the repository yields all **11,172** modern syllables. This is the largest available coverage gain and it requires acquisition of nothing.

**Chinese order can roughly double, at real engineering cost.** The YES order listings cover all **20,992** CJK Unified Ideographs, derived from the PRC national standard GB13000.1. Present coverage is 9,574. The data is a stroke-_type_ sequence such as ㇐㇑㇓, not geometry. That is the correct shape for this architecture, because the font already supplies geometry and the missing ingredient is order. The cost is a trail-to-stroke-type classifier and an assignment solver, neither of which exists yet.

**GlyphWiki is unverified and possibly large.** It holds KAGE stroke descriptions for a very large CJK repertoire under a public-domain-equivalent licence. KAGE is a rendering format, so whether its stroke sequence coincides with writing order is a property nobody has stated. It is cheaply testable against KanjiVG on the overlap, and worth testing before any work on the YES route.

## Update, 2026-09-11 evening: two of the three findings above did not survive testing

The "Three actionable findings" section was written from a survey, not from a trial. Both
of its cheap routes were then spiked under
[the plan](../codex-plans/20260911-0010-normative-stroke-order.md), and both failed. What
follows supersedes them; the survey of what data exists is unaffected.

**There was already a Korean incumbent, and the note missed it.**
`extras/fonts/animation.mjs:685` contains `registerKoreanPilot`, reached when the loader
finds no record and the shape is Hangul. It handles three hardcoded syllables, 가 한 글,
by projection-cutting the ink into jamo regions and fitting each separately. So the claim
above that Korean's useful coverage is zero is slightly too strong: it is three syllables,
and mostly at `mixed` rather than `source-adapted`, which still shows "Reveal shape".

**Composing a whole block and fitting it does not work.** Across 2 fonts × 7 syllables,
a table-composed block was accepted once. `registerSource`'s frame search has two degrees
of freedom, `scaleX` and `offsetX`, both horizontal, with y a fixed stretch onto the ink
bounding box. A Hangul block needs independent 2D placement per jamo, which that search
cannot express, so no layout table recovers it. Separately, the 40-jamo pack holds none of
the eleven compound finals ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ, so 겹받침 syllables cannot be composed at
all without decomposing the final first.

**GlyphWiki's KAGE order is not writing order.** 300 kanji were compared against KanjiVG
by matching each KAGE stroke to the KanjiVG stroke it lies on and testing the induced
sequence for monotonicity. 137 agreed, 45.7%. The disagreement has a structural cause
rather than being noise: 追 maps to `[6,7,7,8,8,0,1,2,2,3,4,4,5]`, because KanjiVG writes
the 辶 radical last while KAGE composes it first, enclosure before enclosed. GlyphWiki is
also not the download this note implied. Of the first 40 glyphs probed, 39 held no literal
strokes, only component references, so reading it at all means reimplementing KAGE's
recursive composition.

**What that leaves, and what was then built.** Korean was the best target, and the route
was generalising the incumbent's per-jamo region cutting rather than composing blocks.
That has since been done. `registerKoreanPilot` now decomposes any modern syllable
through the Unicode arithmetic, splits compound finals into their parts, and derives
jamo regions from the vowel's layout class. Coverage went from 3 hardcoded syllables to
7,448 attempted, and across 150 measured trials 84 of the 98 non-wrapping ones get source
adoption. Wrapping vowels ㅘㅙㅚㅝㅞㅟㅢ are declined, about 3,724 syllables, because each
region is masked as a rectangle and a wrapping vowel surrounds the initial in an L-shape
that no rectangle separates. `check-font-animation` now reports Korean at 78 of 95 paths
sourced.

**Chinese remains open.** The YES data itself turned out to be reachable: Wiktionary
carries it as a machine-readable table, character, stroke sequence, stroke count and
codepoint, under CC BY-SA. The obstacle is matching, not acquisition. YES gives stroke
_types_ while this engine has skeleton trails, and the two do not correspond one to one:
`graphTrails` yields one trail for the three strokes of 口. Ordering trails against a type
sequence needs a classifier and a segmentation willing to disagree with the skeleton, and
its accuracy would have to be validated against the existing 9,574 first. Chinese expansion now has only the
YES / GB13000.1 route, which needs a stroke-type classifier and an assignment solver. Both
are separate pieces of work with their own risk, and neither is the afternoon this note
implied.

## What cannot be fixed

For Arabic, Thai, Hebrew, Tamil, Bengali, Cyrillic, Greek and the remaining scripts in the catalogue, the conclusion is not "not found yet". These traditions teach letter formation, but no ministry publishes it as a normative sequence and no one has published it as data. Building it would mean commissioning native curriculum authorities per script, which is a content programme rather than an import.

The honest consequence is that the catalogue's 120 script entries and the stroke-order feature describe different products. Rendering, tracing and shape reveal genuinely work for all 120. Stroke order can only ever work for four. The code already keeps these apart: a plan that is not fully `source-adapted` shows "Reveal shape" rather than "Animate strokes", and `docs/fonts.md` states that generated plans make "no conventional stroke-order claim". What is missing is machine-readable per-script metadata saying which of the two a caller is getting, so the distinction survives outside the demo.

## Companion note

[How everyone else solves stroke order](20260911-how-others-solve-stroke-order.md) surveys the shipping products and the extraction literature. Its short version: no product derives order from glyph geometry, every one transcribes a national standard, and automatic extraction tops out around 84–96%, which is unusable for teaching. It also records a licensing trap, since Taiwan's Ministry of Education animations are CC BY-NC-ND and cannot be used here.

## Recommendation

Build Korean composition. Verify GlyphWiki. Add coverage metadata so the catalogue stops implying a promise it cannot keep. Treat the YES route as a separate decision, taken after the GlyphWiki result is known. Do not pursue the remaining scripts as a data problem, because they are not one.

## Sources

- [Commons Stroke Order Project](https://commons.wikimedia.org/wiki/Commons:Stroke_Order_Project) and the MediaWiki category API, queried 2026-09-11
- [KanjiVG](https://kanjivg.tagaini.net/), CC BY-SA 3.0
- [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), Arphic Public License
- [Stroke orders of CJK Unified Ideographs, YES order](<https://en.wikipedia.org/wiki/Stroke_orders_of_CJK_Unified_Ideographs_(YES_order)>), from GB13000.1
- [GlyphWiki licence](http://en.glyphwiki.org/wiki/GlyphWiki:License), public-domain-equivalent
- [Korean principles of orthography](https://en.wikibooks.org/wiki/Korean/Principles_of_Orthography), syllable block composition
- [hangeul-stroke-order](https://github.com/MagisterAdamus/hangeul-stroke-order), 35 jamo, CC BY-SA 4.0
- [Calliar](https://link.springer.com/article/10.1007/s00521-022-07537-2), Arabic, recorded
