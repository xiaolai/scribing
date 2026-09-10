#!/usr/bin/env python3
"""Offline catalog generation. Requires fonttools==4.62.1; never downloads."""
import collections,hashlib,json,pathlib,sys
from fontTools.ttLib import TTFont
ROOT=pathlib.Path(__file__).resolve().parents[2]
def read(p):return json.loads((ROOT/p).read_text())
def write(p,d):(ROOT/p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def ranges(points):
 out=[]
 for cp in sorted(set(points)):
  if out and cp==out[-1][1]+1:out[-1][1]=cp
  else:out.append([cp,cp])
 return out
lock=read('fonts/assets.lock.json'); scripts=read('scripts/fonts/scripts.json')
# Stroke-order availability. The predicate mirrors the group selection in
# extras/fonts/animation.mjs exactly, so the catalog cannot advertise a group the
# runtime would not consult. Normative order exists for four scripts and no others;
# see dev-docs/research/20260911-normative-stroke-order.md.
motor_index=read('fonts/motor/index.json')
motor_units={g['id']:g['unitCount'] for g in motor_index['groups']}
def motor_group(entry):
 if entry['script']=='Latn':return 'english'
 if entry['script']=='Hang':return 'korean'
 if entry['language'].startswith('ja'):return 'japanese'
 if entry['language'].startswith('zh'):return 'chinese'
 return None
for group in ['fonts','notices','unicode']:
 for entry in lock[group]:
  assert hashlib.sha256((ROOT/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
ucd={}; script_ranges=collections.defaultdict(list)
for line in (ROOT/'fonts/unicode/Scripts.txt').read_text().splitlines():
 raw=line.split('#')[0].strip()
 if not raw:continue
 span,script=[v.strip() for v in raw.split(';')]; nums=span.split('..');lo,hi=int(nums[0],16),int(nums[-1],16)
 script_ranges[script].append([lo,hi])
 for cp in range(lo,hi+1):ucd[cp]=script
categories={};names={};first=None
for line in (ROOT/'fonts/unicode/UnicodeData.txt').read_text().splitlines():
 fields=line.split(';');cp=int(fields[0],16); name,cat=fields[1:3]
 if name.endswith(', First>'):first=cp
 elif name.endswith(', Last>'):
  for n in range(first,cp+1):categories[n]=cat
  first=None
 else:categories[cp]=cat;names[cp]=name
fonts=[];cmaps={}
for record in lock['fonts']:
 record=dict(record)
 with TTFont(ROOT/record['file']) as font:
  cmap={cp:g for cp,g in font.getBestCmap().items() if g!='.notdef'}
  record['family']=font['name'].getDebugName(1)
  record['name']=font['name'].getDebugName(4)
  record['style']=font['name'].getDebugName(2)
  record['glyphCount']=font['maxp'].numGlyphs
  record['coverageRanges']=ranges(cmap)
  record['cmapCodepointCount']=len(cmap)
  record['unitsPerEm']=font['head'].unitsPerEm
 cmaps[record['id']]=set(cmap);fonts.append(record)
for entry in scripts:
 shared=set.intersection(*(cmaps[f] for f in entry['fontIds']))
 # Inventory is a compact selection of encoded letters, not a handwriting lesson/order.
 candidates=sorted(cp for cp in shared if ucd.get(cp) in entry['unicodeScripts'] and (categories.get(cp,'').startswith('L') or entry['id']=='braille'))
 if entry['id']=='urdu':candidates=list(map(ord,'اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنںوہھءیئے'))
 if entry['id']=='english':candidates=list(map(ord,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'))
 if entry['id']=='chinese-simplified':candidates=list(map(ord,'一二三人大小口日月水火木土山川田中上下左右永汉字学习书写中国语言'))
 if entry['id']=='chinese-traditional':candidates=list(map(ord,'一二三人大小口日月水火木土山川田中上下左右永漢字學習書寫中國語言'))
 if entry['id']=='japanese':candidates=list(map(ord,'あいうえおかきくけこさしすせそアイウエオカキクケコ一二三日月山川田人大小木水火土漢字'))
 if entry['id']=='korean':candidates=list(map(ord,'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ가나다라마바사아자차카타파하한글'))
 if entry['id']=='georgian':candidates=[cp for cp in candidates if 0x10d0<=cp<=0x10ff]
 if entry['id']=='georgian-asomtavruli':candidates=[cp for cp in candidates if 0x10a0<=cp<=0x10cf]
 candidates=list(dict.fromkeys(cp for cp in candidates if cp != 0x2800))
 entry['inventory']=[chr(cp) for cp in candidates[:160]]
 assert entry['inventory'],(entry['id'],'empty inventory')
 if not entry['examples']:entry['examples']=[{'text':chr(cp),'label':names.get(cp,'Unicode character')} for cp in candidates[:4]]
 for example in entry['examples']:
  missing=[f'U+{ord(c):04X}' for c in example['text'] if ord(c) not in shared]
  assert not missing,(entry['id'],example,missing)
 for c in entry['inventory']:assert ord(c) in shared,(entry['id'],c)
 entry['inventoryStatus']='curated-unicode-inventory'
 entry['inventoryNote']='Encoded character samples; not a complete language alphabet or a certified handwriting sequence.'
 if len(entry['fontIds'])==1:entry['fontChoiceNote']='One bundled family is available for this script; no alternate face is implied.'
 if entry['id'] in ['mongolian','phags-pa']:
  entry['writingMode']='vertical-lr';entry['layoutNote']='The provider shapes this script left-to-right, then rotates the entire run clockwise for its conventional vertical orientation. This is one run, not a multi-column page layout.'
 # A caller reading the catalog must be able to tell, before preparing anything,
 # whether stroke order can exist for this script. Rendering works for every entry;
 # instruction does not.
 group=motor_group(entry)
 entry['strokeOrder']='normative' if group else 'none'
 if group:
  entry['strokeOrderGroup']=group
  entry['strokeOrderUnitCount']=motor_units[group]
 entry['strokeOrderNote']=('Ordered motor data exists for this script and is fitted onto the font outlines. The count is the whole source group, not this entry alone.' if group else 'No authority publishes a normative stroke order for this script and no dataset encodes one. Rendering, tracing and shape reveal work; stroke order does not.')
 # Persist all script codepoint ranges so a text input may use more than the compact inventory.
 entry['ranges']=[r for script in entry['unicodeScripts'] for r in script_ranges[script]]
script_ids={s['id']:s for s in scripts}
omni={
'greek':'greek','malay-jawi-arabic':'jawi','manipuri':'meetei-mayek','inuktitut-canadian-aboriginal-syllabics':'canadian-aboriginal',
'hebrew':'hebrew','braille':'braille','malayalam':'malayalam','gurmukhi':'gurmukhi','glagolitic':'glagolitic','japanese-katakana':'katakana',
'japanese-hiragana':'hiragana','tibetan':'tibetan','sanskrit':'sanskrit','avesta':'avestan','latin':'english','anglo-saxon-futhorc':'runic',
'ojibwe-canadian-aboriginal-syllabics':'canadian-aboriginal','blackfoot-canadian-aboriginal-syllabics':'canadian-aboriginal','kannada':'kannada',
'grantha':'grantha','tifinagh':'tifinagh','sylheti':'syloti-nagri','tagalog':'tagalog','gujarati':'gujarati','cyrillic':'cyrillic',
'syriac-estrangelo':'syriac','syriac-serto':'syriac','bengali':'bengali','early-aramaic':'aramaic','mongolian':'mongolian','ge-ez':'ethiopic',
'old-church-slavonic-cyrillic':'church-slavonic','balinese':'balinese','armenian':'armenian','oriya':'odia','n-ko':'nko','burmese-myanmar':'burmese',
'mkhedruli-georgian':'georgian','asomtavruli-georgian':'georgian-asomtavruli'}
coverage=[]
for path in sorted((ROOT/'packs/generated').glob('*.manifest.json')):
 manifest=json.loads(path.read_text());id=manifest['packId'];record={'packId':id,'unitCount':manifest['unitCount']}
 if id.startswith('omniglot-'):
  sid=omni.get(id[len('omniglot-'):])
  if sid:
   record.update(status='replacement-inventory',scriptId=sid,reason='The source collection is associated with this encoded script. Its numbered source classes remain unmapped; this independent Unicode inventory does not convert or identify those source classes.')
   if id in ['omniglot-early-aramaic','omniglot-syriac-estrangelo','omniglot-syriac-serto']:
    record['reason']+=' The bundled family is a script-level replacement, not a certification of the source historical/style variant.'
  else:record.update(status='unmapped',reason='No verified Unicode text mapping or compatible bundled font is available for this named source collection. No substitute alphabet or Private Use mapping is asserted.')
 else:
  sid='english' if id.startswith('english-') or id=='kanjivg-latin' else 'korean' if id.startswith('korean-') else 'japanese'
  units=read('packs/generated/'+id+'.json')['units']
  mappings=[{'unitId':k,'text':v['text']} for k,v in units.items() if isinstance(v.get('text'),str) and v['text']]
  assert len(mappings)==len(units),(id,'unit without exact text')
  shared=set.intersection(*(cmaps[f] for f in script_ids[sid]['fontIds']))
  unsupported=sorted(set(m['text'] for m in mappings if any(ord(c) not in shared for c in m['text'])))
  record.update(status='verified-text',scriptId=sid,reason='Exact Unicode text retained from existing pack units. This verifies text identity only, not stroke order, font glyph coverage, or teaching quality.',unitMappings=mappings,supportedTextCount=len(set(m['text'] for m in mappings))-len(unsupported),unsupportedTexts=unsupported)
 coverage.append(record)
assert len(coverage)==149,len(coverage)
result={'schemaVersion':1,'description':'Offline formal font outlines and Unicode inventories. Fonts are not handwriting stroke-order sources.','unicodeVersion':'16.0.0','rangeFile':'fonts/script-ranges.json','fonts':fonts,'scripts':scripts,'sourceCoverage':coverage,'totals':{'fonts':len(fonts),'scriptEntries':len(scripts),'fontBytes':sum(f['sizeBytes'] for f in fonts),'sourcePacks':len(coverage),'sourceCoverageStatuses':dict(collections.Counter(c['status'] for c in coverage))}}
write('fonts/catalog.json',result)
write('fonts/script-ranges.json',{'schemaVersion':1,'unicodeVersion':'16.0.0','scripts':dict(sorted(script_ranges.items())),'common':script_ranges['Common'],'inherited':script_ranges['Inherited']})
print(json.dumps(result['totals'],indent=2))
print('Missing source text coverage:',[(c['packId'],c.get('unsupportedTexts')) for c in coverage if c.get('unsupportedTexts')])

derived=['fonts/catalog.json','fonts/script-ranges.json','scripts/fonts/scripts.json','scripts/fonts/build-catalog.py','scripts/fonts/requirements.txt']
write('fonts/catalog.lock.json',{'schemaVersion':1,'files':[{'file':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in derived]})
