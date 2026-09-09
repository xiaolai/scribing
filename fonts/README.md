# Formal font assets

`catalog.json` indexes **139 original Noto font files**, **120 script/language entries**, and all **149 existing source packs**. The files total 176,584,688 bytes (about 168.4 MiB). Most bytes are the eight full CJK Sans/Serif fonts for Simplified Chinese, Traditional Chinese, Japanese and Korean. Load only the selected font. No font is downloaded from a CDN during normal use. The bundled binaries are unchanged upstream files; no local subsetting is involved.

A font describes filled outlines, metrics and shaping behavior. It does not provide handwritten stroke order. The inventories here are character selections for inspecting those outlines, not certified language alphabets, school handwriting models or a promise that every language is supported.

## Sources and licenses

- [Official Noto font archive](https://github.com/notofonts/noto-fonts), pinned commit `ffebf8c1ee449e544955a7e813c54f9b73848eac`.
- [Official Noto CJK repository](https://github.com/notofonts/noto-cjk), pinned commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c`.
- [Unicode 16.0.0 UCD](https://www.unicode.org/Public/16.0.0/ucd/): `Scripts.txt` and `UnicodeData.txt` provide script membership, character identities and categories. Their upstream copyright/license notice is retained in `notices/Unicode-LICENSE.txt`.

`assets.lock.json` records original download URLs, revisions, byte lengths and SHA-256 digests for every font, notice and Unicode data file. Noto font notices are copied verbatim under `notices/`; the font catalog references the applicable OFL notice. Noto Sans/Serif are used where both exist in the pinned archive. Some scripts have one bundled family, which the catalog states explicitly. Arabic also offers Noto Naskh; Urdu offers Noto Nastaliq and Noto Naskh.

## Catalog contract

All paths are repository-relative. Font records have `id`, `name`, `family`, `style`, `file`, `sizeBytes`, `sha256`, `license`, `notice`, `source:{url,revision}`, `unitsPerEm`, `glyphCount`, and `coverageRanges` (inclusive Unicode codepoint ranges from that font's cmap).

Script records have `id`, `name`, ISO 15924 `script`, BCP 47 `language`, base shaping `direction`, `unicodeScripts` (Unicode property names), `fontIds`, compact `inventory` (at most 160 character strings), `examples:[{text,label}]`, and inclusive script `ranges`. The font cmap ranges permit arbitrary supported text beyond the compact menu. Cmap coverage is necessary but not sufficient: the shaping provider must also reject missing glyphs and unsupported layouts. Mongolian and Phags-pa carry `writingMode:'vertical-lr'`. The provider shapes them left-to-right and rotates the complete run clockwise, returning `direction:'ttb'`; this is one vertical run rather than a multi-column page layout.

`script-ranges.json` contains Unicode 16 script property ranges plus separate Common and Inherited ranges. Combining marks require contextual shaping; the existence of a mark in an inventory is not a shaping test.

`sourceCoverage` records one entry per existing pack:

- `verified-text` (100 packs): retains exact existing `{unitId,text}` mappings for English, Korean and KanjiVG. Identity verification does not certify stroke order or font coverage. `unsupportedTexts` identifies exact texts absent from at least one selected font. Currently **𧒑** in `japanese-kanji-274` is missing.
- `replacement-inventory` (39 packs): the old collection is associated with a Unicode script, but its numbered Omniglot classes remain unmapped. The new inventory is independent; no source class has been inferred or converted. Historic/style names such as Early Aramaic and Syriac Estrangelo/Serto do not certify that the replacement font reproduces that variant.
- `unmapped` (10 packs): Alphabet of the Magi, Angelic, Arcadian, Atemayar Qelisayer, Atlantean, Aurek Besh, Futurama, Keble, Tengwar and ULOG have no verified Unicode text mapping or compatible bundled font. No guessed alphabet or Private Use mapping is substituted.

## Offline checks and maintenance

Run `node scripts/fonts/check-assets.mjs` to verify every hash, size, source record, source text mapping and inventory cmap range without a network request. Actual shaped glyph IDs, contextual placement and visible outlines are checked separately by the shaping integration. `catalog.lock.json` also checks hashes of the derived catalog, script ranges, reviewed metadata and generation recipe.

To restore missing/corrupt checked-in files from their pinned URLs, explicitly run `node scripts/fonts/fetch-assets.mjs --download`. A digest mismatch fails without replacing the target. This operation never updates the lock.

To regenerate the catalog offline, use Python with `scripts/fonts/requirements.txt` (`fonttools==4.62.1`) and run `python3 scripts/fonts/build-catalog.py`. It uses the locked unchanged binaries, pinned Unicode data, existing source pack texts, and reviewed metadata in `scripts/fonts/scripts.json`. Regeneration fails if an example or inventory character lacks a glyph in any advertised font. Changes to source revisions, font choices or inventories require deliberate review and a new lock; ordinary builds do not refresh assets.

## Optional motor plans

`motor/index.json` records hashes, byte sizes, original source identities and separate notices for 52 English models, 40 Korean models, 6,636 Japanese texts, and 9,574 Chinese median sets. The optional animation preparer uses these only after matching the actual selected font; otherwise it generates a clearly labeled drawing guide. The inventories total 21,419,753 bytes and are excluded from the core npm package. They do not alter any of the 149 existing packs or certify source/font correspondence by text alone. `check-fonts` verifies all motor hashes and exact source mappings offline.
