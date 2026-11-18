from pathlib import Path
from datetime import datetime, timezone, date
import json,csv,hashlib,re,collections,xml.etree.ElementTree as ET
D=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-0410/export-acceptance-578d99c-0521')
checks=[]
def check(name,condition,details=None):
 item={'name':name,'passed':bool(condition)}
 if details is not None:item['details']=details
 checks.append(item)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def rows(path):
 with path.open(encoding='utf-8-sig',newline='') as f:return list(csv.reader(f,strict=True))
def read(name):return (D/'originals'/name).read_bytes()
en=json.loads(read('final-phone-data-en.json'))
ar=json.loads(read('final-phone-data-ar.json'))
initial=json.loads(read('initial-phone-data.json'))
identity='https://employer.example/jobs/10'
note='=SYNTHETIC("مرحبا، عالم")\nLine two, "quoted"; follow-up'
payload=lambda j:{k:v for k,v in j.items() if k!='exportedAt'}
check('JSON payloads equal except top-level exportedAt',payload(en)==payload(ar))
check('JSON export timestamps differ',en['exportedAt']!=ar['exportedAt'],{'en':en['exportedAt'],'ar':ar['exportedAt']})
check('JSON expected format, version and guest scope',en['format']=='Career Finder browser records' and en['version']==2 and en['scope']=='guest')
for lang,j in [('en',en),('ar',ar)]:
 check('JSON '+lang+' saved jobs and records',len(j['saved']['jobs'])==17 and len(j['saved']['records'])==20)
 check('JSON '+lang+' recovery empty',len(j['recovery']['jobs'])==0 and len(j['recovery']['records'])==0 and j['recovery']['safety']=={'holds':[],'recovery':[]})
 check('JSON '+lang+' section scopes and schemas',all(j[s]['scope']=='guest' and j[s]['schema']==1 for s in ['saved','recovery']))
records={r['identity']:r for r in en['saved']['records']}
check('JSON record identities unique',len(records)==20)
nurse=records[identity]
check('JSON final Nurse exact stage, date and raw note',nurse['stage']=='offer' and nurse['followUpDate']=='2026-11-30' and nurse['note']==note and nurse['appliedElsewhere'] is True and nurse['appliedDate']=='')
job_ids={j['url'] for j in en['saved']['jobs']}
coverage={'savedJobs':len(job_ids),'applicationRecords':len(records),'recordOnlyIdentities':sorted(set(records)-job_ids),'savedJobsWithoutRecord':sorted(job_ids-set(records)),'recordStageCounts':dict(collections.Counter(r['stage'] for r in records.values()))}
check('JSON preserves record-only and bare saved jobs',len(set(records)-job_ids)==5 and len(job_ids-set(records))==2)
initial_nurse=next(r for r in initial['saved']['records'] if r['identity']==identity)
initial_observation={'role':'Initial export before date commit, preserved as provenance rather than treated as a failed final export.','nurseFollowUpDate':initial_nurse['followUpDate'],'nurseUpdatedAt':initial_nurse['updatedAt'],'finalFollowUpDate':nurse['followUpDate'],'finalUpdatedAt':nurse['updatedAt']}
headers={
'en':['Job title','Employer','Job link','Stage (self-entered)','Marked applied (self-entered)','Applied date (self-entered)','Follow-up date (self-entered)','Private note','Last edited (not application time)'],
'ar':['المسمى الوظيفي','جهة العمل','رابط الوظيفة','المرحلة (أدخلتها بنفسك)','علامة تم التقديم (أدخلتها بنفسك)','تاريخ التقديم (أدخلته بنفسك)','تاريخ المتابعة (أدخلته بنفسك)','ملاحظة خاصة','آخر تعديل (وليس وقت التقديم)']}
stages={'en':{'saved':'Saved','applied':'Applied','interview':'Interview','offer':'Offer','closed':'Closed'},'ar':{'saved':'المحفوظات','applied':'تم التقديم','interview':'مقابلة','offer':'عرض وظيفي','closed':'مغلق'}}
yesno={'en':{False:'No',True:'Yes'},'ar':{False:'لا',True:'نعم'}}
csv_receipts=[]; csv_expected={}
for lang in ['en','ar']:
 p=D/'originals'/('final-records-'+lang+'.csv'); raw=p.read_bytes(); data=rows(p)
 check('CSV '+lang+' UTF-8 BOM',raw.startswith(b'\xef\xbb\xbf'))
 check('CSV '+lang+' 20 records and 9 fields',len(data)==21 and all(len(r)==9 for r in data))
 check('CSV '+lang+' exact translated headers',data[0]==headers[lang])
 got={r[2]:r for r in data[1:]}
 check('CSV '+lang+' full unique JSON record identities',len(got)==20 and set(got)==set(records))
 differences=[]
 for rid,r in records.items():
  n='Text: '+r['note'] if rid==identity else r['note']
  expected=[r['title'],r['company'],rid,stages[lang][r['stage']],yesno[lang][r['appliedElsewhere']],r['appliedDate'],r['followUpDate'],n,r['updatedAt']]
  if got.get(rid)!=expected:differences.append({'identity':rid,'expected':expected,'actual':got.get(rid)})
 check('CSV '+lang+' every field equals JSON with explicit localized fields and formula marker',not differences,{'differences':differences})
 escaped='"'+('Text: '+note).replace('"','""')+'"'
 check('CSV '+lang+' multiline note has enclosing quotes and doubled quotes',escaped.encode('utf-8') in raw)
 check('CSV '+lang+' one intentional formula-protection marker',sum(v.startswith('Text: ') for row in data[1:] for v in row)==1)
 csv_expected[lang]=data
 csv_receipts.append({'language':lang,'path':p.relative_to(D).as_posix(),'sha256':sha(raw),'bytes':len(raw),'records':len(data)-1,'columns':9,'cellsIncludingHeader':len(data)*9,'formulaProtectedCells':1,'nurseRow':got[identity],'allRecordsExportedDespiteRootObservedVisibleFilter':set(got)==set(records)})
check('Repeated English CSV is byte identical',read('final-records-en.csv')==read('final-records-en-repeat.csv'))
ics_results=[]; semantic={}
allowed={'VERSION','PRODID','CALSCALE','UID','DTSTAMP','DTSTART;VALUE=DATE','DURATION','SUMMARY','DESCRIPTION','URL','CLASS','TRANSP'}
expected_display={
'en':{'SUMMARY':'Follow up: Nurse clinic · Synthetic Employer','DESCRIPTION':'Personal follow-up reminder. Check the employer’s current posting before contacting them.'},
'ar':{'SUMMARY':'المتابعة: Nurse clinic · Synthetic Employer','DESCRIPTION':'تذكير شخصي بالمتابعة. راجع إعلان جهة العمل الحالي قبل التواصل معها.'}}
for name,lang in [('final-follow-up-en.ics','en'),('final-follow-up-en-repeat.ics','en'),('final-follow-up-ar.ics','ar')]:
 raw=read(name)
 crlf=raw.endswith(b'\r\n') and not re.search(rb'(?<!\r)\n|\r(?!\n)',raw)
 check('ICS '+name+' CRLF only including final line',crlf)
 physical=raw[:-2].split(b'\r\n')
 check('ICS '+name+' maximum 75 octets per physical line',all(0<len(l)<=75 for l in physical))
 for line in physical:line.decode('utf-8',errors='strict')
 check('ICS '+name+' UTF-8 intact across folds',True)
 unfolded=[]
 for line in physical:
  if line[:1] in [b' ',b'\t']:
   assert unfolded
   unfolded[-1]+=line[1:]
  else:unfolded.append(line)
 lines=[l.decode('utf-8') for l in unfolded]
 check('ICS '+name+' single calendar and event structure',lines[0]=='BEGIN:VCALENDAR' and lines[-1]=='END:VCALENDAR' and lines.count('BEGIN:VCALENDAR')==lines.count('END:VCALENDAR')==lines.count('BEGIN:VEVENT')==lines.count('END:VEVENT')==1)
 props={}
 for line in lines:
  k,v=line.split(':',1)
  if k not in ['BEGIN','END']:
   assert k not in props
   props[k]=v
 check('ICS '+name+' exact minimal property allowlist',set(props)==allowed,{'properties':sorted(props)})
 check('ICS '+name+' all-day date and duration',props['DTSTART;VALUE=DATE']=='20261130' and props['DURATION']=='P1D' and 'DTEND' not in props)
 date(2026,11,30)
 check('ICS '+name+' parseable UTC DTSTAMP',bool(re.fullmatch(r'\d{8}T\d{6}Z',props['DTSTAMP'])))
 check('ICS '+name+' private and transparent',props['CLASS']=='PRIVATE' and props['TRANSP']=='TRANSPARENT')
 check('ICS '+name+' localized display',all(props[k]==v for k,v in expected_display[lang].items()))
 check('ICS '+name+' public job URL',props['URL']==identity)
 text='\n'.join(lines)
 check('ICS '+name+' private note and profile material absent',all(s not in text for s in [note,'=SYNTHETIC','مرحبا، عالم','Line two','quoted','followUpDate','resume','linkedin','email','password','access_token']))
 semantic[name]=props
 ics_results.append({'path':'originals/'+name,'language':lang,'bytes':len(raw),'sha256':sha(raw),'physicalLines':len(physical),'foldedContinuationLines':sum(l[:1] in [b' ',b'\t'] for l in physical),'maximumPhysicalLineOctets':max(map(len,physical)),'properties':props,'calendarConsumerImport':'NOT RUN'})
one=semantic['final-follow-up-en.ics']; repeat=semantic['final-follow-up-en-repeat.ics']; arabic=semantic['final-follow-up-ar.ics']
without=lambda p,keys:{k:v for k,v in p.items() if k not in keys}
check('ICS repeated English semantic equality except DTSTAMP',without(one,['DTSTAMP'])==without(repeat,['DTSTAMP']))
check('ICS localized equality except timestamp and display text',without(one,['DTSTAMP','SUMMARY','DESCRIPTION'])==without(arabic,['DTSTAMP','SUMMARY','DESCRIPTION']))
check('ICS stable UID across repeated download and locale',one['UID']==repeat['UID']==arabic['UID'])
check('ICS distinct download timestamps',len({p['DTSTAMP'] for p in semantic.values()})==3)
T='urn:oasis:names:tc:opendocument:xmlns:table:1.0'; O='urn:oasis:names:tc:opendocument:xmlns:office:1.0'; X='urn:oasis:names:tc:opendocument:xmlns:text:1.0'
def inline(node):
 out=node.text or ''
 for ch in node:
  if ch.tag=='{'+X+'}s':out+=' '*int(ch.get('{'+X+'}c','1'))
  elif ch.tag=='{'+X+'}tab':out+='\t'
  elif ch.tag=='{'+X+'}line-break':out+='\n'
  else:out+=inline(ch)
  out+=ch.tail or ''
 return out
def table(path):
 root=ET.parse(path).getroot(); tab=root.find('.//{'+T+'}table'); assert tab is not None
 result=[]
 for row in tab.findall('{'+T+'}table-row'):
  values=[]
  for c in row:
   if c.tag not in ['{'+T+'}table-cell','{'+T+'}covered-table-cell']:continue
   cell={'text':'\n'.join(inline(p) for p in c.findall('{'+X+'}p')),'type':c.get('{'+O+'}value-type'),'formula':c.get('{'+T+'}formula'),'value':c.get('{'+O+'}value')}
   count=int(c.get('{'+T+'}number-columns-repeated','1')); assert count<1000
   values.extend([cell]*count)
  count=int(row.get('{'+T+'}number-rows-repeated','1')); assert count<1000
  result.extend([values]*count)
 return result
consumer=[]
norm=lambda v:v.replace('\r\n','\n').replace('\r','\n')
for mode in ['quoted-text-import','reopen-native-ods','reimport-saved-csv']:
 for lang in ['en','ar']:
  p=D/'consumer'/mode/('final-records-'+lang+'.fods'); actual=table(p); expected=csv_expected[lang]
  shape=len(actual)==len(expected) and all(len(r)==9 for r in actual)
  check('LibreOffice '+mode+' '+lang+' complete shape',shape)
  mismatches=[]; formulas=[]; types=collections.Counter()
  for ri,row in enumerate(actual):
   for ci,cell in enumerate(row):
    types[cell['type'] or 'blank']+=1
    if cell['formula']:formulas.append({'row':ri+1,'column':ci+1,**cell})
    if ri>=len(expected) or ci>=9 or cell['text']!=norm(expected[ri][ci]):mismatches.append({'row':ri+1,'column':ci+1,'actual':cell})
  check('LibreOffice '+mode+' '+lang+' all exact displayed cells',shape and not mismatches,{'mismatchCount':len(mismatches),'mismatches':mismatches})
  check('LibreOffice '+mode+' '+lang+' no formulas and all text or blank',not formulas and all(cell['type']=='string' or cell['text']=='' for row in actual for cell in row))
  consumer.append({'mode':mode,'language':lang,'path':p.relative_to(D).as_posix(),'rowsIncludingHeader':len(actual),'columns':9,'cellsIncludingHeader':sum(len(r) for r in actual),'valueMismatchCount':len(mismatches),'formulaCount':len(formulas),'cellTypes':dict(types)})
for lang in ['en','ar']:
 exported=rows(D/'consumer/save-csv-again'/('final-records-'+lang+'.csv'))
 check('LibreOffice saved CSV '+lang+' all semantic fields preserved',exported==[[norm(c) for c in row] for row in csv_expected[lang]])
positive=table(D/'consumer/formula-positive-control/arithmetic-positive-control.fods')
check('LibreOffice active formula evaluation positive control',positive[1][0]['formula']=='of:=1+1' and positive[1][0]['value']=='2',positive[1][0])
manifest=json.loads((D/'source-manifest.json').read_text())
check('Frozen originals still exact',all(sha((D/x['copy']).read_bytes())==x['sha256'] for x in manifest['files']))
fixture=Path('/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/stage-browser-fixture-20261118-578d99c/public/build-metadata.json')
metadata=fixture.read_bytes(); (D/'reference/fixture-build-metadata.json').write_bytes(metadata)
meta=json.loads(metadata)
check('Fixture build provenance matches root commit and original PhoneApp',meta['commit']=='578d99c8f225a72ca7cc0cf10ff474bb19aaaebc' and meta['phoneAppSHA256']=='0ee2f855083ad5933dbbca1161372e8e6e3c8b393c1fd6033b2858c59dacfd94')
source={'fixtureBuildMetadataOriginalPath':str(fixture),'fixtureBuildMetadataCopy':'reference/fixture-build-metadata.json','fixtureBuildMetadataSha256':sha(metadata),'fixtureGeneratedAt':meta['generatedAt'],'fixtureCommit':meta['commit'],'servedPhoneAppSha256':meta['phoneAppSHA256'],'captureTimeWorkingFilePhoneAppSha256':manifest['sourceClaim']['currentPhoneAppSha256'],'workingFileDiffersFromFrozenServedFixture':meta['phoneAppSHA256']!=manifest['sourceClaim']['currentPhoneAppSha256'],'limits':'Browser interactions and source578 fixture identity provided by root; helper independently read preserved fixture metadata and actual Downloads. Current working file may contain root ongoing correction and is not the exported source.'}
receipt={'verifiedAt':datetime.now(timezone.utc).isoformat(),'source':source,'json':{'payloadEqualityExcludingExportedAt':payload(en)==payload(ar),'savedSectionsEqualAcrossExports':en['saved']==ar['saved'],'recoverySectionsEqualAcrossExports':en['recovery']==ar['recovery'],'savedAndRecoveryAreDistinctSections':True,'coverage':coverage,'nurse':nurse,'initialEvidence':initial_observation,'actualRestoreImport':'NOT RUN'},'csv':csv_receipts,'repeatedEnglishCSVByteEqual':read('final-records-en.csv')==read('final-records-en-repeat.csv'),'ics':ics_results,'consumer':consumer,'positiveControl':positive[1][0],'checks':checks,'summary':{'checks':len(checks),'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)},'normalizations':['Only consumer paragraph CRLF/CR to LF normalization. No Unicode, whitespace, numeric or identifier normalization. Exact raw CSV and JSON checks use no such normalization.'],'limitations':['Synthetic guest fixture using production source578; no live account/OAuth acceptance.','Browser filter and clicks were root observations, not repeated by this helper.','LibreOffice headless quoted-fields-as-text route only; no GUI/Excel/Numbers/mobile spreadsheet acceptance.','Default numeric coercion was already reproduced in prior separate evidence and is not retested here.','ICS checks are independent Python content-line inspection, not real Calendar import, repeated-import, alert, date-change or native handoff acceptance.','JSON equality is not an actual restore/import journey. Browser reload acceptance remains with root.','No claim of full release readiness or universal competitor superiority.']}
(D/'verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'summary':receipt['summary'],'jsonCoverage':coverage,'csv':[{k:r[k] for k in ['language','records','columns','cellsIncludingHeader','sha256']} for r in csv_receipts],'consumer':consumer,'calendarUID':one['UID'],'source':source,'failedChecks':[c for c in checks if not c['passed']]},ensure_ascii=False))
assert receipt['summary']['failed']==0,'See verification.json for exact failed checks.'

