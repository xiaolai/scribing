Scribing is a fork of Hanzi Writer by David Chanin. The library's original MIT copyright notice is retained in LICENSE.

Scribing uses Chinese stroke data from [Hanzi Writer Data](https://github.com/chanind/hanzi-writer-data), derived from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) and Arphic fonts. The data is distributed under the [Arphic Public License](https://github.com/chanind/hanzi-writer-data/blob/master/ARPHICPL.TXT), independently of the library's MIT license.

Arphic PL KaitiM GB and UKai: Copyright 1999 Arphic Technology Co., Ltd.

Make Me a Hanzi: Copyright 1999 Arphic Technology Co., Ltd.; copyright 2016 Shaunak Kishore.

The optional formal-font catalog uses unchanged Noto fonts under the SIL Open Font License 1.1. Original notices are retained in [fonts/notices](fonts/notices/), and each font's source, revision and notice are recorded in [fonts/assets.lock.json](fonts/assets.lock.json). Unicode character and script data retain the [Unicode License V3 notice](fonts/notices/Unicode-LICENSE.txt). These optional font assets are excluded from the core npm package.

The separately imported HarfBuzz provider ships HarfBuzzJS and its WebAssembly runtime under `extras/fonts/vendor`. Their original [HarfBuzzJS MIT notice](extras/fonts/vendor/HARFBUZZJS-LICENSE.txt) and [HarfBuzz copyright and permission notices](extras/fonts/vendor/HARFBUZZ-COPYING.txt) are included in the npm package. Exact vendored files, sources and hashes are recorded in [the vendor manifest](extras/fonts/vendor/manifest.json).

Optional animation source inventories under `fonts/motor` retain the separate source licenses recorded in [their index](fonts/motor/index.json): original English/Korean models (MIT), KanjiVG Japanese plans (CC-BY-SA-3.0), and Hanzi Writer Data 2.0.1 Chinese medians (Arphic Public License). Original notices are retained in [fonts/motor/notices](fonts/motor/notices/). These source files are excluded from the npm core package.
