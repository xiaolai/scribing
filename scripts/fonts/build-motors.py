#!/usr/bin/env python3
"""Offline optional motor-guide inventory. Never modifies the 149 source packs."""
import json,pathlib,hashlib,shutil
ROOT=pathlib.Path(__file__).resolve().parents[2];out=ROOT/'fonts/motor';out.mkdir(exist_ok=True)
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n')
notices=out/'notices';notices.mkdir(exist_ok=True)
records=[]
for group,names in [('english',['english-textbook']),('korean',['korean-textbook']),('japanese',sorted(p.stem.replace('.manifest','') for p in (ROOT/'packs/generated').glob('japanese-*.manifest.json')))]:
 units={};sources=[]
 for name in names:
  path=ROOT/f'packs/generated/{name}.json';pack=read(path);sources.append({'packId':name,'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source':pack['source'],'license':pack['license']})
  notice=ROOT/f'packs/generated/{name}.NOTICE.txt'
  if group!='japanese' or name=='japanese-kana':shutil.copyfile(notice,notices/(name+'.NOTICE.txt'))
  for key,u in pack['units'].items():
   text=u.get('text');
   if text and text not in units:units[text]={'packId':name,'unitId':key,'unit':u}
 file=out/(group+'.json');write(file,{'schemaVersion':1,'units':units});records.append({'id':group,'file':str(file.relative_to(ROOT)),'unitCount':len(units),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sizeBytes':file.stat().st_size,'sources':sources})
source=ROOT/'node_modules/hanzi-writer-data';assert read(source/'package.json')['version']=='2.0.1'
units={}
for file in sorted(source.glob('*.json')):
 if len(file.stem)!=1:continue
 d=read(file)
 if 'medians' not in d:continue
 units[file.stem]=d['medians']
file=out/'chinese.json';write(file,{'schemaVersion':1,'units':units});shutil.copyfile(source/'ARPHICPL.TXT',notices/'ARPHICPL.TXT')
records.append({'id':'chinese','file':str(file.relative_to(ROOT)),'unitCount':len(units),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sizeBytes':file.stat().st_size,'source':{'name':'hanzi-writer-data','version':'2.0.1','url':'https://github.com/chanind/hanzi-writer-data'},'license':'Arphic Public License','notice':'fonts/motor/notices/ARPHICPL.TXT'})
write(out/'index.json',{'schemaVersion':1,'description':'Optional source motor plans used only when registration agrees with the actual selected font. Existing pack provenance and licenses remain independent.','groups':records,'notices':[{'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(notices.iterdir())]})
print([(r['id'],r['unitCount'],r['sizeBytes']) for r in records])
