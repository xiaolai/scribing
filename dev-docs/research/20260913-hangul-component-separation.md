# Can connected components replace the rectangle in `hangulRegions`?

Measured 2026-09-13, against `extras/fonts/animation.mjs` at 4.1.1.

Written down because the experiment is cheap to propose and expensive to repeat, and
because the answer is not the one the shape of the data first suggests.

## The proposal

`hangulRegions` splits a syllable into rectangles, masks each one out of the ink, and
fits it alone. A wrapping vowel such as ㅘ makes an L around its initial, which no
rectangle separates, so all 3,724 syllables using one decline. That is a third of the
block, and it has declined since the feature shipped.

The proposal, from the native port: label 8-connected components instead. On
Noto Sans CJK KR a wrapping vowel never shares a component with its initial, not once in
133 syllables, at every minimum component size from 4 cells to 60. If that holds
generally, the decline is a choice of primitive rather than a property of the ink.

## Reproduced, then falsified

The Sans KR numbers reproduce exactly, through this repository's own shaping and the
same nonzero fill the preparer rasterises with: 0 of 133 wrapping syllables are a single
blob, and of the 38 ㅗ and ㅛ syllables that 4.1.1 withdrew, 17 are one blob and 21 are
not. The measurement is sound.

The proposed check was to run it across the 139 faces in `fonts/assets`. Only 8 of those
contain Hangul at all; the other 131 have no glyph in the block. Across all 8:

| Face           | Wrapping: one blob | Two or more | Not measured |
| -------------- | ------------------ | ----------- | ------------ |
| NotoSansCJKkr  | 0                  | 133         | 0            |
| NotoSansCJKjp  | 0                  | 130         | 3            |
| NotoSansCJKsc  | 0                  | 130         | 3            |
| NotoSansCJKtc  | 0                  | 130         | 3            |
| NotoSerifCJKkr | **34**             | 99          | 0            |
| NotoSerifCJKjp | **26**             | 61          | 46           |
| NotoSerifCJKsc | **26**             | 61          | 46           |
| NotoSerifCJKtc | **26**             | 61          | 46           |

Every Sans face gives zero. No Serif face does. The unmeasured column is this harness
exhausting the WebAssembly heap after a 23 MB face, not a property of the fonts; the
Serif rate of 26 in 87 agrees with Serif KR's 34 in 133.

Spot-checked to rule out antialiasing bridging a gap. Component sizes, largest first:

| Syllable | NotoSansCJKkr    | NotoSerifCJKkr |
| -------- | ---------------- | -------------- |
| 귀       | 10196, 6144      | **12938**      |
| 와       | 11877, 6984      | **14519**      |
| 과       | 7200, 5136, 4882 | 10099, 3214    |
| 의       | 7736, 6144, 3350 | 7901, 5260     |

Identical at an alpha cut of 128 as at 0. In a Myeongjo-style face the thicker strokes
and the serif terminals close the gap that Sans leaves open, and the initial fuses with
the vowel. Zero-in-133 describes Noto Sans CJK, not Hangul ink.

## What that rules out, and what it does not

It rules out components as _the_ primitive. Adopting them would make the same syllable
animate in Sans and decline in Serif, which is the face-dependent behaviour the 4.1.1
band-window fix exists to avoid: thresholds fitted to one face are what put that search
window at 0.56.

It does not rule out components as a _tested_ strategy. A split that labels components,
checks that they actually separate this glyph, and declines when they do not is correct
on every face; only its coverage varies. That is a different thing from assuming
separation and being wrong on half the corpus.

Two problems remain unsolved before that is worth building.

- **Separation is not assignment.** Knowing there are four components does not say which
  is the initial. Most wrapping syllables have more components than letters, because the
  vowel is several strokes. `hangulRegions` knows the layout class and therefore where
  each letter should sit, so a centroid rule is plausible, but it has to be written and
  checked rather than assumed.
- **Masks, not rectangles.** Regions exist so each can be masked out and fitted alone.
  A component split needs a per-component mask, which changes the shape of what
  `hangulRegions` returns and every caller that consumes it.

## Reproducing

Eight faces, batchim-less syllables only, 256 pixels per em, 8-connected components
counted on the nonzero fill. The port's own rasters are at
`scribing-paper/dev-docs/upstream/component-separation/`, and agree with this
repository's rasteriser on the Sans face.
