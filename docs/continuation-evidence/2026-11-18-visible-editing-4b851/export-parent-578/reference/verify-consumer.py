from pathlib import Path
from datetime import datetime, timezone, date
import csv,json,hashlib,re,collections,xml.etree.ElementTree as ET,subprocess
D=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-export-consumer-20261118')
R=Path('/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d')
manifest=json.loads((D/'source-manifest.json').read_text())
source=[{**x,'currentSha256':hashlib.sha256((R/x['path']).read_bytes()).hexdigest()} for x in manifest['source']]
assert all(x['sha256']==x['currentSha256'] for x in source)
original=json.loads((D/'generated/original-records.json').read_text())
records=original['records']; scenarios=original['scenarios']
T='urn:oasis:names:tc:opendocument:xmlns:table:1.0'; O='urn:oasis:names:tc:opendocument:xmlns:office:1.0'; X='urn:oasis:names:tc:opendocument:xmlns:text:1.0'
norm=lambda s:s.replace('\r\n','\n').replace('\r','\n')
def read_csv(p):
 with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.reader(f,strict=True))
def inline(node):
 out=node.text or ''
 for ch in node:
  if ch.tag==f'{{{X}}}s':out+=' '*int(ch.get(f'{{{X}}}c','1'))
  elif ch.tag==f'{{{X}}}tab':out+='\t'
  elif ch.tag==f'{{{X}}}line-break':out+='\n'
  else:out+=inline(ch)
  out+=ch.tail or ''
 return out
def table(p):
 root=ET.parse(p).getroot()
 tab=root.find('.//{'+T+'}table')
 assert tab is not None
 rows=[]
 for row in tab.findall('{'+T+'}table-row'):
  values=[]
  for c in row:
   if c.tag not in ['{'+T+'}table-cell','{'+T+'}covered-table-cell']:continue
   text='\n'.join(inline(x) for x in c.findall('{'+X+'}p'))
   d={'text':text,'type':c.get('{'+O+'}value-type'),'value':c.get('{'+O+'}value'),'date':c.get('{'+O+'}date-value'),'formula':c.get('{'+T+'}formula')}
   repeats=int(c.get('{'+T+'}number-columns-repeated','1'))
   assert repeats<1000,'Unexpected oversized sparse sheet'
   values.extend([d]*repeats)
  repeats=int(row.get('{'+T+'}number-rows-repeated','1'))
  assert repeats<1000,'Unexpected oversized sparse sheet'
  rows.extend([values]*repeats)
 return rows
expected={}
csv_checks=[]
for lang in ['en','ar']:
 p=D/'generated'/('career-records-'+lang+'.csv')
 assert p.read_bytes().startswith(b'\xef\xbb\xbf')
 data=read_csv(p)
 assert len(data)==18 and all(len(r)==9 for r in data)
 headings_en=['Job title','Employer','Job link','Stage (self-entered)','Marked applied (self-entered)','Applied date (self-entered)','Follow-up date (self-entered)','Private note','Last edited (not application time)']
 headings_ar=['المسمى الوظيفي','جهة العمل','رابط الوظيفة','المرحلة (أدخلتها بنفسك)','علامة تم التقديم (أدخلتها بنفسك)','تاريخ التقديم (أدخلته بنفسك)','تاريخ المتابعة (أدخلته بنفسك)','ملاحظة خاصة','آخر تعديل (وليس وقت التقديم)']
 assert data[0]==(headings_en if lang=='en' else headings_ar)
 protected=0
 for i,r in enumerate(records):
  stage={'en':{'saved':'Saved','interview':'Interview'},'ar':{'saved':'المحفوظات','interview':'مقابلة'}}[lang][r['stage']]
  yesno={'en':['No','Yes'],'ar':['لا','نعم']}[lang][r['appliedElsewhere']]
  want=[r['title'],r['company'],r['identity'],stage,yesno,r['appliedDate'],r['followUpDate'],r['note'],r['updatedAt']]
  # The fixture deliberately marks these nine independent attack cases as unsafe.
  # This does not reuse or reimplement the production formula-detection regex.
  if scenarios[i].startswith('formula-'):
   for col in [0,1,7]:want[col]='Text: '+want[col];protected+=1
  assert data[i+1]==want,{'language':lang,'scenario':scenarios[i],'got':data[i+1],'want':want}
 expected[lang]=data
 csv_checks.append({'language':lang,'records':17,'columns':9,'exactOriginalFieldsPreservedExceptExplicitTextMarker':True,'protectedCells':protected,'bom':True,'rawSHA256':hashlib.sha256(p.read_bytes()).hexdigest()})
consumer=[]
for mode in ['default-import','formula-enabled-import','quoted-text-import','reopen-native-ods','reimport-saved-csv']:
 for lang in ['en','ar']:
  p=D/'consumer'/mode/('career-records-'+lang+'.fods')
  data=table(p); want=expected[lang]
  assert len(data)==len(want) and all(len(x)==9 for x in data)
  mismatches=[];free_text_coercions=[];types=collections.Counter();formula_cells=[]
  for ri,(got,row) in enumerate(zip(data,want)):
   for ci,(cell,value) in enumerate(zip(got,row)):
    types[cell['type'] or 'blank']+=1
    if cell['formula']:formula_cells.append({'row':ri+1,'column':ci+1,**cell})
    if cell['text']!=norm(value):mismatches.append({'row':ri+1,'column':ci+1,'scenario':scenarios[ri-1] if ri else 'header','expected':value,'actual':cell})
    if ri and ci in [0,1,7] and value and cell['type']!='string':free_text_coercions.append({'row':ri+1,'column':ci+1,'scenario':scenarios[ri-1],'expected':value,'actual':cell})
  assert not formula_cells
  strict=mode in ['quoted-text-import','reopen-native-ods','reimport-saved-csv']
  if strict:
   assert not mismatches,{'mode':mode,'language':lang,'mismatches':mismatches}
   assert all(c['type']=='string' or c['text']=='' for row in data for c in row)
  consumer.append({'mode':mode,'language':lang,'rowsIncludingHeader':len(data),'columns':9,'formulaCells':formula_cells,'valueMismatchCount':len(mismatches),'valueMismatches':mismatches,'freeTextCoercions':free_text_coercions,'cellTypes':dict(types),'literalTextAcceptanceRequired':strict,'literalTextAcceptancePassed':strict and not mismatches})
for lang in ['en','ar']:
 saved=read_csv(D/'consumer/save-csv-again'/('career-records-'+lang+'.csv'))
 assert saved==[[norm(c) for c in row] for row in expected[lang]]
control=table(D/'consumer/formula-positive-control/positive-control.fods')
assert control[1][0]['formula']=='of:=1+1' and control[1][0]['value']=='2'
# Independent content-line inspection, not an installed calendar/parser acceptance.
calendars=[]
def calendar(p):
 raw=p.read_bytes()
 assert raw.endswith(b'\r\n') and not re.search(rb'(?<!\r)\n|\r(?!\n)',raw)
 physical=raw[:-2].split(b'\r\n')
 assert all(0<len(line)<=75 for line in physical)
 for line in physical:line.decode('utf-8',errors='strict')
 unfolded=[]
 for line in physical:
  if line[:1] in [b' ',b'\t']:
   assert unfolded
   unfolded[-1]+=line[1:]
  else:unfolded.append(line)
 decoded=[x.decode('utf-8') for x in unfolded]
 assert decoded.count('BEGIN:VCALENDAR')==1 and decoded.count('END:VCALENDAR')==1
 assert decoded.count('BEGIN:VEVENT')==1 and decoded.count('END:VEVENT')==1
 assert decoded[0]=='BEGIN:VCALENDAR' and decoded[-1]=='END:VCALENDAR'
 properties={}
 for line in decoded:
  k,v=line.split(':',1)
  if k not in ['BEGIN','END']:
   assert k not in properties
   properties[k]=v
 assert properties['DTSTART;VALUE=DATE'].isdigit() and len(properties['DTSTART;VALUE=DATE'])==8
 day=properties['DTSTART;VALUE=DATE'];date(int(day[:4]),int(day[4:6]),int(day[6:8]))
 assert properties['DURATION']=='P1D' and 'DTEND' not in properties
 assert properties['CLASS']=='PRIVATE' and properties['TRANSP']=='TRANSPARENT'
 assert re.fullmatch(r'\d{8}T\d{6}Z',properties['DTSTAMP'])
 assert not any(k.split(';')[0] in ['ATTENDEE','ORGANIZER','ATTACH','RRULE','TZURL','TZID','VALARM'] for k in properties)
 assert not any(k.startswith('SYNTHETIC') or 'PRIVATE_NOTE' in k for k in properties.values())
 assert 'SYNTHETIC_NOTE_NOT_FOR_CALENDAR' not in '\n'.join(decoded)
 summary=properties['SUMMARY']
 text=''
 cursor=0
 while cursor<len(summary):
  ch=summary[cursor]
  if ch==chr(92):
   cursor+=1
   assert cursor<len(summary) and summary[cursor] in ['n','N',',',';',chr(92)]
   text+='\n' if summary[cursor] in ['n','N'] else summary[cursor]
  else:text+=ch
  cursor+=1
 result={'path':p.relative_to(D).as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'maxPhysicalLineOctets':max(map(len,physical)),'foldedLines':sum(x[:1] in [b' ',b'\t'] for x in physical),'civilDay':day,'uid':properties['UID'],'summary':text,'duration':'P1D','privateNoteAbsent':True,'structure':'One VCALENDAR containing one VEVENT','consumerImport':'NOT RUN'}
 return result
for p in sorted((D/'generated').rglob('*.ics')):calendars.append(calendar(p))
main={Path(x['path']).stem:x for x in calendars}
ref=json.loads((D/'generated/calendar-reference.json').read_text())
for x in ref:
 actual=main[x['name']]
 assert norm(x['record']['title']) in actual['summary'] and norm(x['record']['company']) in actual['summary']
 assert actual['civilDay']==x['record']['followUpDate'].replace('-','')
assert main['follow-up-en']['uid']==main['follow-up-ar']['uid']==main['same-day-updated-caption-en']['uid']
assert main['follow-up-en']['uid']!=main['changed-day-en']['uid']
for day in ['2026-03-08','2026-11-01','2000-02-29','9999-12-31']:
 files=[x for x in calendars if x['path'].endswith('-'+day+'.ics')]
 assert len(files)==4
 assert all(x['civilDay']==day.replace('-','') for x in files)
 assert len(set(x['uid'] for x in files))==1
 assert len(set(x['sha256'] for x in files))==1
receipt={'verifiedAt':datetime.now(timezone.utc).isoformat(),'sourceCommitAtGeneration':manifest['head'],'sourceCommitAtVerification':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'source':source,'csv':csv_checks,'consumer':consumer,'savedCSVSemanticMatch':True,'positiveControl':control[1][0],'calendars':calendars,'calendarImport':'NOT RUN','guiBrowserNativeAcceptance':'NOT RUN','normalizations':['Consumer text comparison converts embedded CRLF/CR to LF because LibreOffice represents in-cell paragraphs this way. No numeric, whitespace or Unicode normalization was allowed.'],'limitations':['Headless LibreOffice 26.8.1.1 only; no Numbers/Excel/GUI acceptance.','Number-like text is coerced by default import. Existing UI workaround (quoted fields as Text) succeeds for this corpus.','ICS content-line inspection is independent Python stdlib checking, not a certified/full calendar parser.','Repeated import, date-change coexistence, alerts and extreme-year handling in a real calendar remain untested.','Original raw fields are in original-records.json; viewing CSV intentionally prefixes risky formula-like fields.']}
(D/'verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
summary={'sourceCommit':receipt['sourceCommitAtVerification'],'csv':csv_checks,'consumer':[{'mode':x['mode'],'language':x['language'],'valueMismatchCount':x['valueMismatchCount'],'freeTextCoercions':len(x['freeTextCoercions']),'formulaCells':len(x['formulaCells']),'cellTypes':x['cellTypes'],'literalTextAcceptancePassed':x['literalTextAcceptancePassed']} for x in consumer],'positiveControl':receipt['positiveControl'],'savedCSVSemanticMatch':True,'icsFilesInspected':len(calendars),'calendarImport':'NOT RUN','sourceFilesUnchanged':True}
print(json.dumps(summary,ensure_ascii=False))
