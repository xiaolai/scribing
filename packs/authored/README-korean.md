# Korean textbook print source

`korean-textbook.source.json` contains original monoline geometry for the 40 modern standalone compatibility jamo (19 consonants and 21 vowels), in the same character order as `packs/sources/korean-mapping.json`. It does not compose syllable blocks.

The paths were constructed from straight segments and cubic circle quarters, not converted from Omniglot recordings, traced from a font, or traced from a textbook. The authored geometry is MIT licensed. This does not relicense the linked textbook.

## Stroke-order reference

The numbered arrows were visually inspected in the [EPS Korean standard textbook Hangeul introduction](https://www.eps.go.kr/exam/Hanguel.pdf):

- PDF page 2 / printed page 13: ten basic vowels.
- PDF page 3 / printed page 14: eleven compound vowels.
- PDF page 4 / printed page 15: ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ.
- PDF page 5 / printed page 16: ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ.
- PDF page 6 / printed page 17: five doubled consonants.

Each array entry is a distinct pen stroke; joined corners within a path do not imply a pen lift. Horizontals run right and verticals run down unless a note describes a continuous turn. The ㅇ and ㅎ circles begin at their top and run counterclockwise. Doubled consonants complete their left component before their right component. Compound vowels retain the referenced component ordering.

Some choices differ between teaching materials. This pack deliberately uses this reference's top-plus-right first stroke for ㅁ, two-stroke ㅈ, three-stroke ㅊ, and outer left-plus-bottom before the middle horizontal in ㅌ. These are explicit source choices, not a claim that other conventions are wrong. The ㅈ family uses the source's continuous top-to-down-left sweep; it is not a segmented typeface skeleton. Geometric proportions and the horizontal short top marks in ㅊ and ㅎ are authored print-style decisions.

## Status

Technical preview, not pedagogically certified. The reference verifies a selected sequence of motor actions; it does not certify these new proportions, stroke width, teaching effectiveness, age suitability, or acceptance criteria. Native educator review and learner validation remain necessary before making curricular claims.
