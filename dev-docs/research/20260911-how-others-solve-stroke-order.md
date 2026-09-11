# How everyone else solves stroke order

Research date: 2026-09-11. Written after the Chinese expansion in
[the plan](../codex-plans/20260911-0010-normative-stroke-order.md) stalled on a matching
problem, to check whether that problem is hard or simply avoidable.

**It is avoidable, and every shipping product avoids it.** Nobody derives stroke order
from a glyph. They transcribe a published national standard, pair it with their own
stroke geometry, and render that geometry rather than the user's font. The matching step
this repository is blocked on is one the field does not attempt.

## What the products actually do

| Product                              | Stroke order source     | Standard followed                                        |
| ------------------------------------ | ----------------------- | -------------------------------------------------------- |
| Pleco                                | transcribed standard    | PRC 《现代汉语通用字笔顺规范》                           |
| Skritter                             | transcribed standard    | PRC 规范 for simplified, Taiwan 國語辭典 for traditional |
| Outlier                              | transcribed standard    | Taiwan                                                   |
| Hanzi Writer (upstream of this repo) | Make Me a Hanzi dataset | PRC                                                      |

Two things follow from that table.

**There is no single right answer to transcribe.** Pleco and Outlier disagree on
characters, and neither is wrong: one follows the mainland standard and the other
Taiwan's. A product's honest claim is "this is the PRC order", never "this is the order".
This repository already has the same split latent in its data, since `LXGW WenKai GB` and
`TC` draw the same codepoint differently.

**The published standards are finite and small.** 《通用规范汉字笔顺表》 fixes 8,105
characters. Taiwan's Ministry of Education publishes 4,808 with animations. GB 13000.1
goes furthest at 20,902 ideographs, which is where the YES listings come from. The
repository's current 9,574 is already past the everyday standard and the gap to 20,902 is
the long tail, not the common core.

## Japanese: the official standard covers 881 of the 6,636 characters here

Japanese looks like the best-supported group in this repository, because KanjiVG is a
real database and the coverage is 6,636. Its normative backing is in fact the thinnest of
the three CJK groups.

Japan's official document is 『筆順指導の手びき』, published by the Ministry of Education
in 1958. It fixes the stroke order of **881 education kanji** and nothing else. It also
disclaims exclusivity in its own text: the orders were chosen to prevent confusion when
teaching, and an order not listed is not thereby wrong. No official standard covers the
2,136 jōyō kanji, let alone the JIS level 1 and 2 sets that KanjiVG spans. Textbooks and
dictionaries converged on the 1958 document because nothing else official exists, not
because it claims that authority.

KanjiVG's own references page sets out exactly the pattern this note describes:

| Layer                  | Source                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| Geometry               | two 教科書体 fonts, DynaLab DFKyoKasho-W3 and Morisawa A-OTF Kyoukasho ICA Pro L |
| Order, education kanji | 『筆順指導の手びき』, Monbushō, 1958                                             |
| Order, everything else | Emori Kenji, _Kaigyōsō – Hitsujun jitai jiten_, Sanseidō, 2003                   |
| Radicals               | Kanjidic and the JIS Kanji Jiten                                                 |

Then hand-drawn by linguists and checked against school orthography manuals.

So of the 6,636 Japanese characters here, roughly 881 rest on a government document and
about 5,750 rest on a commercial reference work plus expert judgement. That is a
perfectly respectable basis and it is not a national standard. Compare Chinese, where
GB 13000.1 fixes 20,902. The repository's coverage numbers invert the actual strength of
the backing.

**Japanese order is also not Chinese order.** 田 and 必 are documented cases where the two
traditions differ for the same character. KanjiVG is correct for Japanese and must not be
reused to fill Chinese gaps, which is worth stating because the two groups here overlap
heavily by codepoint and the temptation is obvious.

## The architectural point

Hanzi Writer ships Make Me a Hanzi's stroke paths and draws those. Its own framing is
that this "enables consistent stroke order animations regardless of which font a user has
installed." The display font is deliberately not involved.

This repository's font subsystem does the opposite on purpose: it fits ordered motor data
onto the outlines of whatever font the learner selected, so the strokes they practise are
the strokes they see. That is a genuinely different and more ambitious product, and the
matching difficulty is the price of it. It is worth knowing that the price is not being
paid by anyone else, because it means there is no prior art to borrow for the hard part.

## Why the automatic route is a trap

The literature on extracting strokes from glyph geometry reports these accuracies:

| Method                            | Reported accuracy                 |
| --------------------------------- | --------------------------------- |
| Contour-based, regular script     | 88.4%                             |
| Contour-based, running script     | 86.7%                             |
| Contour-based, clerical script    | 84.1%                             |
| Hierarchical multi-model          | 89.4% – 96.2% across five subsets |
| YOLOv8n-seg instance segmentation | 84.7% accuracy, 80.1% mAP         |

Every one of those papers names the same core difficulty: the ambiguous region where
strokes cross. That is precisely where `graphTrails` produces one trail for the three
strokes of 口, so this is not a limitation of the implementation here, it is the
acknowledged hard part of the whole problem class.

More importantly, those numbers are unusable for teaching. A tool that is 90% right
teaches one character in ten incorrectly, silently, to someone who cannot tell. That is
worse than a tool that reveals the shape and admits it does not know the order, which is
what this repository does today.

## What Make Me a Hanzi actually did

It derived stroke data from two Arphic fonts, PL KaitiM GB and PL UKai, and then had it
checked by hand: Gábor Ugray is credited with verifying most of the traditional
characters. The dataset marks its own failures rather than hiding them, writing a
full-width question mark into a decomposition it could not resolve.

So even the best open dataset in this space is font-derived geometry plus a published
order plus human review. Automation got it started; it did not finish it.

## A licensing trap worth recording

Taiwan's Ministry of Education stroke-order animations are released CC BY-NC-ND. The
non-commercial and no-derivatives terms both fail for an MIT library that transforms what
it ingests. The most convenient traditional-Chinese source is therefore unusable here, and
noticing that after building an importer would be expensive.

## What this means for this repository

**The Korean work was the professional pattern, which is why it worked.** Composing a
syllable from jamo by a published rule is exactly how the field handles Hangul. The
earlier attempt to fit a composed block geometrically failed because it was the unusual
route, not the standard one.

**Chinese expansion should be transcription, not extraction.** The YES listings are the
GB 13000.1 order in machine-readable form. Pairing them with geometry is the job, and the
field's answer to "where does the geometry come from" is a dedicated stroke dataset, not
the user's font. Expanding beyond 9,574 therefore means extending the motor packs, and
the font subsystem then fits those as it already fits the existing ones.

**The remaining gap is smaller than it looked.** 9,574 against a common-use standard of
8,105 means everyday Chinese is already covered. What is missing is the tail between
there and 20,902, which matters for rare characters and not for learners.

**Strength of backing does not follow coverage.** Setting the four groups side by side:

| Group    | Official standard                                   |      It covers |   This repo ships |
| -------- | --------------------------------------------------- | -------------: | ----------------: |
| Chinese  | GB 13000.1, and 通用规范汉字笔顺表 for everyday use | 20,902 / 8,105 |             9,574 |
| Japanese | 『筆順指導の手びき』, 1958                          |            881 |             6,636 |
| Korean   | 국립국어원 guidance on the letters                  |        40 jamo | 40 jamo, composed |
| English  | none exists                                         |              0 |       52 authored |

Chinese is the only group where the standard is larger than what is shipped. For the
other three, most or all of what ships rests on a reference work, a composition rule, or
authored judgement. None of that is wrong; it just should not be described as national
standard coverage, and currently the docs do not distinguish them.

## Sources

- [筆順 (Japanese Wikipedia), on the 1958 手びき and its scope](https://ja.wikipedia.org/wiki/%E7%AD%86%E9%A0%86)
- [KanjiVG references](https://kanjivg.tagaini.net/ref.html)
- [Skritter standard references](https://docs.skritter.com/article/219-standard-references-for-skritter-chinese)
- [Pleco forum, stroke order and character standards](https://www.plecoforums.com/threads/stroke-order-and-character-standards.7000/)
- [Stroke Order Standard of GB 13000.1 Character Set](https://en.wikipedia.org/wiki/Stroke_Order_Standard_of_GB_13000.1_Character_Set)
- [Stroke Orders of the Commonly Used Standard Chinese Characters](https://en.wikipedia.org/wiki/Stroke_Orders_of_the_Commonly_Used_Standard_Chinese_Characters)
- [Taiwan MOE 常用國字標準字體筆順學習網](https://stroke-order.learningweb.moe.edu.tw/index.jsp?la=1)
- [Hanzi Writer](https://github.com/chanind/hanzi-writer) and [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)
- [Instance Segmentation for Chinese Character Stroke Extraction](https://arxiv.org/pdf/2210.13826)
- [Stroke Extraction Based on Deep Structure Deformable Image Registration](https://arxiv.org/html/2307.04341)
- [Fine Segmentation of Chinese Character Strokes](https://pmc.ncbi.nlm.nih.gov/articles/PMC11174731/)
- [Contour-based stroke extraction, Stele of Cao Quan](https://onlinelibrary.wiley.com/doi/10.1155/2022/5066994)
