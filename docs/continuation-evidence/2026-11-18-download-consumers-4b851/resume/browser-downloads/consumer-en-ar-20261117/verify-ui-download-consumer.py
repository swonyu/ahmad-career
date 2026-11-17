from pathlib import Path
from datetime import datetime,timezone
import os,subprocess,json,hashlib,xml.etree.ElementTree as ET
D=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-0136/browser-downloads/consumer-en-ar-20261117')
source=json.loads((D/'receipts/inputs.json').read_text())
profile=(D/'profile').as_uri()
env=dict(os.environ)
env['XDG_CACHE_HOME']=str(D/'cache')
exe='/opt/homebrew/bin/soffice'
base=[exe,'-env:UserInstallation='+profile,'--headless','--nologo','--nodefault','--nofirststartwizard']
v=subprocess.run(base+['--version'],env=env,capture_output=True,text=True,timeout=20)
assert v.returncode==0
(D/'receipts/consumer-version.txt').write_text(v.stdout+v.stderr)
options='44,34,76,1,,1033,true,false,true,false,false,0,true,false,false'
args=base+['--infilter=Text - txt - csv (StarCalc):'+options,'--convert-to','fods','--outdir',str(D/'output'),str(D/'inputs/actual-ui-en.csv'),str(D/'inputs/actual-ui-ar.csv')]
r=subprocess.run(args,env=env,capture_output=True,text=True,timeout=35)
(D/'receipts/import.stdout.log').write_text(r.stdout)
(D/'receipts/import.stderr.log').write_text(r.stderr)
(D/'receipts/invocation.json').write_text(json.dumps({'command':args,'environmentOverrides':{'XDG_CACHE_HOME':env['XDG_CACHE_HOME']},'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2)+'\n')
assert r.returncode==0
T='urn:oasis:names:tc:opendocument:xmlns:table:1.0'
O='urn:oasis:names:tc:opendocument:xmlns:office:1.0'
X='urn:oasis:names:tc:opendocument:xmlns:text:1.0'
def inline(node):
 out=node.text or ''
 for child in node:
  if child.tag=='{'+X+'}s':out+=' '*int(child.get('{'+X+'}c','1'))
  elif child.tag=='{'+X+'}tab':out+='\t'
  elif child.tag=='{'+X+'}line-break':out+='\n'
  else:out+=inline(child)
  out+=child.tail or ''
 return out
results=[]
for item in source['inputs']:
 original=Path(item['originalPath'])
 assert hashlib.sha256(original.read_bytes()).hexdigest()==item['sha256'],'Original download changed'
 if item['copy'] is None:continue
 copied=D/'inputs'/item['copy']
 assert hashlib.sha256(copied.read_bytes()).hexdigest()==item['sha256']
 assert copied.read_bytes().startswith(b'\xef\xbb\xbf')
 output=D/'output'/(copied.stem+'.fods')
 root=ET.parse(output).getroot()
 table=root.find('.//{'+T+'}table')
 rows=[]
 for row in table.findall('{'+T+'}table-row'):
  cells=[]
  for cell in row.findall('{'+T+'}table-cell'):
   c={'text':'\n'.join(inline(p) for p in cell.findall('{'+X+'}p')),'type':cell.get('{'+O+'}value-type'),'formula':cell.get('{'+T+'}formula'),'value':cell.get('{'+O+'}value'),'date':cell.get('{'+O+'}date-value')}
   cells.extend([c]*int(cell.get('{'+T+'}number-columns-repeated','1')))
  rows.extend([cells]*int(row.get('{'+T+'}number-rows-repeated','1')))
 assert len(rows)==2 and all(len(row)==9 for row in rows)
 flat=[cell for row in rows for cell in row]
 formula=[cell for cell in flat if cell['formula']]
 assert not formula
 mismatches=[]
 for ri,(actual,wanted) in enumerate(zip(rows,item['rows'])):
  for ci,(cell,value) in enumerate(zip(actual,wanted)):
   if cell['text']!=value:mismatches.append({'row':ri+1,'column':ci+1,'expected':value,'actual':cell})
   assert cell['type']=='string' or (cell['type'] is None and value=='')
 assert not mismatches,mismatches
 assert rows[1][6]['text']=='2026-11-24'
 assert rows[1][7]['text'].startswith('Text: =1+1\n')
 results.append({'language':'en' if '-en.' in item['copy'] else 'ar','inputOriginal':item['originalPath'],'inputBytes':item['bytes'],'inputSHA256':item['sha256'],'output':str(output),'outputBytes':output.stat().st_size,'outputSHA256':hashlib.sha256(output.read_bytes()).hexdigest(),'rows':rows,'cellsCompared':18,'exactValueMatches':18,'formulaCells':0,'stringCells':sum(c['type']=='string' for c in flat),'blankCells':sum(c['type'] is None for c in flat),'comparisonNormalization':'None; all parsed CSV text matched consumer text exactly.','followUpDate':'2026-11-24','multilineFormulaProtectedNotePreserved':True})
receipt={'verifiedAt':datetime.now(timezone.utc).isoformat(),'owner':'/root/export_consumer_review','browserExecutionOwner':'/root (browser actions reported by root; actual delivered files independently hash-verified here)','fixtureBuildCommit':json.loads((D/'receipts/browser-fixture-build-metadata.json').read_text())['commit'],'consumerVersion':v.stdout.strip(),'importMode':'Quoted fields as text, existing isolated-profile recipe','commandReceipt':'receipts/invocation.json','inputsVerifiedBeforeInterpretationAndCopy':True,'originalDownloadsUnchanged':True,'repeatEnglishDownloadByteIdentical':source['inputs'][0]['sha256']==source['inputs'][1]['sha256'],'results':results,'scope':'Actual root-operated browser files consumed by installed headless LibreOffice. No GUI/mobile/Calendar acceptance, default import or broader corpus rerun.'}
(D/'ui-download-consumer-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'version':receipt['consumerVersion'],'commit':receipt['fixtureBuildCommit'],'originalDownloadsUnchanged':True,'englishRepeatByteIdentical':True,'results':[{k:r[k] for k in ['language','inputBytes','inputSHA256','outputSHA256','cellsCompared','exactValueMatches','formulaCells','stringCells','blankCells','comparisonNormalization','followUpDate']} for r in results]},ensure_ascii=False))
