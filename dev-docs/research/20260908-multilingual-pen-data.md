# Existing pen-stroke data for multilingual Scribing

Research date: 2026-09-08. This follow-up supersedes the earlier assumption that English and Korean should begin with wholesale original path authoring. It changes source selection and sequencing; it does not claim the datasets are already integrated into Scribing.

**There is enough existing stroke data to start broad multilingual imports now.** The implementation should acquire, parse, map and curate supplied geometry before commissioning missing forms. Three formats already cover much of the opportunity: ordered SVG centerlines, text/JSON point arrays with pen breaks, and XML/InkML/UNIPEN recordings.

## Most useful verified sources

“Inspected” below means that source files or an archive sample were downloaded and their contents examined. Counts are tied to the inspected source or the explicitly identified publisher description. An authored path is useful geometry, but does not imply a recorded human pen trajectory.

| Source | Actual data and coverage | Access/terms observed | Recommended use |
|---|---|---|---|
| [glyphed.js](https://github.com/a-elhaag/glyphed.js) | Inspected 52 letter files +10 digit files, each with three monoline SVG variants: 186 core paths; punctuation also supplied. Separate moveto subpaths represent pen lifts. | Public; ISC. Authored paths, without stylus timestamps. | First English geometry import; choose consistent variants, audit formations, correct residual gaps. |
| [letterpaths](https://github.com/RobinL/letterpaths) | Pinned revision `fb5a1d0ebe88e462fcc89c50921d7732a44eeeab` supplies 52 explicit print JSONs (26 uppercase + 26 lowercase), plus 52 lowercase cursive entry variants (26 low-entry + 26 high-entry). Explicit marks and deferred strokes retain pen-lift semantics. | Public; MIT. | Import both print cases before authoring gaps; cursive entry models remain a separate style. Digits/punctuation are absent from this JSON inventory. |
| [UJIpenchars2](https://archive.ics.uci.edu/dataset/177/uji%2Bpen%2Bcharacters%2Bversion%2B2) | Ordered human writing for ASCII upper/lowercase, digits, Spanish additions and other symbols; publisher reports 11,640 samples/60 writers. | Public UCI data; CC BY4.0. | Existing English/Latin observations for variant selection and evaluation. |
| [KanjiVG](https://kanjivg.tagaini.net/svg-format.html) | Explicit ordered Japanese SVG centerlines. Prior pinned inventory: 6,704 base character files, plus variants. | Public; CC BY-SA3.0. | Preferred polished Japanese path pack, with explicit kana/kanji inventory. |
| [Tegaki/Tomoe dictionary](https://github.com/tegaki/tegaki/blob/7a74e442c4130cccc226a7e7c2b683ac94c0cccb/tegaki-models/data/train/japanese/handwriting-ja.xml) | Downloaded XML: 6,646 records/6,421 unique Unicode labels; nested stroke/point arrays. あ has3 strokes; ぬ has2. | Public model-source route; retain its LGPL data packaging/provenance, distinct from GPL recognizer code. | Second Japanese source and variant/reference corpus. Duplicate labels must not overwrite each other. |
| [Omniglot stroke archives](https://github.com/brendenlake/omniglot) | Downloaded and parsed both archives: **32,460 recordings, 5,481,127 finite XY/time points, 50 alphabet collections**; explicit pen breaks. | Public; repository MIT notice. Class IDs need Unicode mapping. | Broad existing observations for candidate packs and replay tests; choose/edit suitable models. |
| [UCI Assamese](https://archive.ics.uci.edu/dataset/208/online+handwritten+assamese+characters+dataset) | Downloaded archive and inspected raw TXT: pen-down/up, ordered XY and stroke index. Publisher: 8,235 samples, 183 classes, 45 writers. | Public; UCI explicitly states CC BY4.0. | Strong first Indic raw-data importer and mapped candidate-model/evaluation corpus. |
| [POH-Db Persian](https://github.com/SLTLabAUT/POH-Db) | Counted 9,308 InkML files; downloaded text sample with51 traces and another numeric sample with103. Includes timing/pressure channels. | Public repository AGPL3; authors offer alternative-license contact. | Persian run replay, segmentation and candidate selection; preserve applicable terms for any distribution. |
| [Qt Virtual Keyboard fixtures](https://github.com/qt/qtvirtualkeyboard/tree/dev/tests/auto/inputpanel/data/inputpanel) | Downloaded11 files: Unicode-keyed `.PEN` arrays with X/Y/T and stroke boundaries, across several scripts. | File headers: GPL3-only or Qt commercial license. | Small mapped reference/compatibility fixtures and optional appropriately licensed data candidates. |
| [GCompris drawletters](https://github.com/KDE/gcompris/blob/master/src/activities/drawletters/drawletters_dataset.js), [drawnumbers](https://github.com/KDE/gcompris/blob/master/src/activities/drawnumbers/drawnumbers_dataset.js) | Inspected26 uppercase +10 number templates: ordered point arrays, with explicit stroke-group IDs where needed. A has three groups. | GPL3-or-later in source headers. | Existing instructional geometry to compare with the English model; retain its terms if reused. |
| [HWRT/write-math](https://www.martin-thoma.de/write-math/data/) | Publisher's sample has nested strokes with x/y/time; alphanumeric and Greek mathematical labels. Archive [DOI](https://doi.org/10.5281/zenodo.50022). | ODbL; much derives from Detexify. | Useful Latin/Greek/symbol corpus after exact inventory and label mapping. |

## What the broad collections actually cover

Omniglot's downloaded files include the following measured class/sample counts:

| Collection | Classes | Recordings |
|---|---:|---:|
| Korean |40|800|
| Hiragana / Katakana |52 /47|1,040 /940|
| Latin / Greek / Cyrillic / Hebrew |26 /24 /33 /22|520 /480 /660 /440|
| Armenian / modern Georgian |41 /41|820 /820|
| Bengali / Gujarati / Sanskrit |46 /48 /42|920 /960 /840|
| Jawi / Myanmar / Tibetan |40 /34 /42|800 /680 /840|
| Gurmukhi / Kannada / Malayalam / Oriya |45 /41 /47 /46|900 /820 /940 /920|

These are dataset classes, not verified complete language inventories. The50 collections include historical and invented scripts. Participants copied displayed symbols; their trajectories need not follow native handwriting conventions. Preserve useful variation, annotate unsuitable order, and map labels before advertising text support. This is substantial immediately available input, even when a sample is better suited to evaluation than teaching. [Source and format](https://github.com/brendenlake/omniglot).

Qt's parsed fixtures provide an especially useful mapped seed: all52 ASCII letters and10 digits; Hebrew22 letters plus5 final forms and₪; Korean 국/어/한; Greek7, Cyrillic9, Arabic/Persian6, Thai5 and Vietnamese6 entries. Its small non-Latin subsets should be described as fixtures, not full alphabets. The [Hebrew file](https://github.com/qt/qtvirtualkeyboard/blob/dev/tests/auto/inputpanel/data/inputpanel/unipen_data_hebrew.js) and [Korean file](https://github.com/qt/qtvirtualkeyboard/blob/dev/tests/auto/inputpanel/data/inputpanel/unipen_data_korean.js) contain the actual Unicode keys and point arrays.

## Larger recorded corpora and acquisition routes

| Source | Evidence of actual pen data | Remaining access/distribution work |
|---|---|---|
| [IAM-OnDB](https://fki.tic.heia-fr.ch/databases/download-the-iam-on-line-handwriting-database), [DeepWriting](https://ait.ethz.ch/deepwriting) | English line/word trajectories; DeepWriting supplies segmented writing and combines294 authors. | Research/noncommercial terms; registration and upstream obligations. Existing evaluation assets, not an unrestricted default product pack. |
| [UNIPEN archival release](https://zenodo.org/records/1195803) |155.8MB vector handwriting archive with pen events. | Specific grant limits use to research and prohibits commercial distribution. |
| [TUAT HANDS](https://web.tuat.ac.jp/~nakagawa/en/nakagawa.html) | Native Japanese online corpora; published Kuchibue/Nakayosi editions each exceed1.4million samples. | Academic/commercial acquisition routes exist; current access and rights for the intended use need confirmation. Do not count Tomoe/Tegaki/Zinnia redistributions as independent corpora. |
| [HP/LipiTk data](https://lipitk.sourceforge.net/hpl-datasets.htm) | Official pages describe actual UNIPEN Tamil, Telugu and Devanagari character/word recordings, separately from raster versions. | Data terms are research-only and prohibit redistribution. Tested old Tamil binary link failed. The toolkit license does not license its datasets. |
| [ISI online Bangla](https://www.isical.ac.in/~ujjwal/download/database.html) | Institutional index distinguishes online numerals/basic characters from offline image datasets; application route exists. | Request access and establish terms; no binary acquired in this pass. |
| [Gurmukhi author collection](https://sites.google.com/view/ohwr-gurmukhi-script/) | Official190-writer XML archive link reached a48MB download-confirmation page. | Full archive/sample and redistribution terms remain unchecked. |
| [Online-KHATT paper](https://benthamopen.com/contents/pdf/TOCSJ/TOCSJ-12-42.pdf) | Authors describe10,040 Arabic online lines/623 writers. | Advertised site did not respond; establish current corpus access. Ordinary offline KHATT TIFF files are different data. |
| [MOLHW](https://www.nature.com/articles/s41598-022-27267-8) | Authors report164,631 traditional-Mongolian word trajectories/200 writers/40,605 words, with native review and coordinate/label format. | Publisher links a Kaggle release. This pass verified the paper/landing page, not a raw sample or dataset-specific license. |
| [Hilokal Korean](https://github.com/Hilokal/korean-handwriting) | Smartpen capture/generation pipeline documents XY/time/pressure/pen-state and text labels. | Raw recordings are excluded from the public tree and exported through an authenticated administration workflow; no public license established. No access request was sent. |

The existence of these corpora changes the planning question to selection, conversion and acquisition. A failed old URL does not establish that the language lacks pen data.

## Useful supplied paths that require a different evidence label

- [gkurt/tegaki Nanum geometry](https://github.com/gkurt/tegaki): downloaded779 glyph records including650 Hangul syllables and40 compatibility jamo. This is **font-skeleton geometry with heuristic stroke ordering**, not recorded writing. Compare/correct existing candidates before authoring equivalents. MIT code and OFL font-derived data have distinct notices.
- [Calliar](https://github.com/ARBML/Calliar):2,500 annotated Arabic calligraphy samples. The [author paper](https://arxiv.org/html/2106.10745) explains tracing existing images and an annotation order for dots. Useful geometry; the supplied order is not proof of spontaneous native pen order. Keep JSON labels and examine underlying image provenance.
- [Tibetan trace generator](https://github.com/KharagEdition/tibetan-alphabet-letter-trace-json-generator): downloaded126 records,30 marked available; source skeletonizes outlines and heuristically orders strokes. Useful technical candidate; no root reuse license established.
- [MathWriting](https://github.com/google-research/google-research/tree/master/mathwriting): downloaded the500-ink excerpt and parsed human-labelled nu/i examples with timestamps and separate traces. Large genuine symbol data, with synthetic data explicitly distinguished. Dataset is CC BY-NC-SA4; code is Apache2. Writer IDs are not published, so it cannot prove writer-disjoint evaluation automatically.

Image datasets, font contours without pen paths, gyroscope-only recordings, and pretrained recognizer weights were excluded from the ready-trajectory count. Public multilingual recognition systems demonstrate engineering feasibility without automatically granting access to their training records.

## Revised implementation approach

1. **Build importers before bulk authoring.** Prioritize SVG/subpaths and text/JSON trajectories, then Tomoe XML and InkML/UNIPEN. Use existing data to exercise dots, curves, pen lifts, marks and script metrics. Preserve raw files and source hashes.
2. **Introduce an observation layer.** A raw sample keeps source label, optional Unicode mapping, strokes/timestamps, writer/session identity when provided, and provenance (`recorded`, `authored`, `image-traced`, `font-inferred`). Do not force every raw sample into the teaching schema.
3. **Curate candidate models.** Normalize without losing stroke boundaries, group compatible variants, choose representative real samples or authored paths, and correct only unsuitable geometry. Record actual gaps in a62-item English and40-target-jamo inventory.
4. **Use existing recordings for tests first.** UJI, Omniglot, Assamese, Tomoe and suitable licensed corpora can supply real variation. Preserve held-out separation where identities exist; document absent identities. Collect new writing only for measured coverage/evaluation gaps.
5. **Expand two tracks together.** Ship reviewed English/Japanese/Korean subsets while offering an explicitly experimental imported collection across additional scripts. Prototype breadth need not wait for complete curricula or word composition.
6. **Keep pack selection practical.** Prefer sources with clear terms for the intended distribution; retain copyleft/attribution where applicable, and keep research-only sources in their permitted lane. Author only gaps that imports, curation or appropriate acquisition cannot fill.

A first implementation sprint should produce a source manifest, replay/comparison viewer, conversion reports for English/Japanese/Korean, and a measured residual-authoring list. No bespoke recognizer training or worldwide recording campaign is required to start.

## Verification performed in this research

- Omniglot: both official stroke archives parsed in full;32,460 samples and5,481,127 finite coordinate/time rows; no malformed rows in this format check. This is structural verification, not handwriting-quality approval.
- Tegaki/Tomoe: full9.1MB XML parsed and label/variant counts checked.
- glyphed.js: all62 core files/186 variant strings inventoried; representative A/i/4/8 subpaths inspected.
- Qt: all11 relevant source files downloaded; Unicode keys counted and XYT/stroke structures inspected.
- GCompris:26 letters and10 numerals parsed; explicit A stroke groups checked.
- Assamese/Persian: downloadable archive/repository verified and actual raw samples inspected; full-dataset content quality not audited.
- MathWriting:500-file excerpt downloaded; representative human InkML traces/labels inspected.

Detailed working notes, source hashes and inspection JSON are retained under the planning task's `work/`. The repository's implementation plan is revised to follow this import-and-curate-first approach.
