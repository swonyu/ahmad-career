import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {PDFDocument} from 'pdf-lib';
import {assertReadablePDF} from '../server/pdf-readability.mjs';

function syntheticPDF(objects, trailer='') {
  const parts=[Buffer.from('%PDF-1.7\n')],offsets=[0];let offset=parts[0].length;
  for(let i=0;i<objects.length;i++){
    offsets.push(offset);const bytes=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);parts.push(bytes);offset+=bytes.length;
  }
  parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<</Size ${objects.length+1} /Root 1 0 R ${trailer}>>\nstartxref\n${offset}\n%%EOF\n`));
  return Buffer.concat(parts);
}
const base=['<</Type /Catalog /Pages 2 0 R>>','<</Type /Pages /Kids [3 0 R] /Count 1>>','<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>'];
const rejects=bytes=>assert.rejects(assertReadablePDF(bytes),error=>error.code==='invalid_resume');

test('ordinary exported PDF, object streams and inherited page size are accepted',async()=>{
  assert.equal((await assertReadablePDF(await readFile(new URL('./fixtures/readable-resume.pdf',import.meta.url)))).pageCount,1);
  const doc=await PDFDocument.create();doc.addPage([595,842]);doc.addPage([612,792]);
  assert.equal((await assertReadablePDF(await doc.save({useObjectStreams:true})) ).pageCount,2);
  const inherited=[base[0],'<</Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792]>>','<</Type /Page /Parent 2 0 R>>'];
  assert.equal((await assertReadablePDF(syntheticPDF(inherited))).pageCount,1);
});
test('truncated, page-less, empty, oversized and invalid page rectangles are rejected',async()=>{
  const invalid=[Buffer.from('%PDF-1.7'),Buffer.alloc(5*1024*1024+1),syntheticPDF([base[0],'<</Type /Pages /Kids [] /Count 0>>']),syntheticPDF([...base.slice(0,2),'<</Type /Page /Parent 2 0 R /MediaBox [0 0 0 792]>>'])];
  for(const bytes of invalid)await rejects(bytes);
});
test('password protection is reported explicitly',async()=>{
  const encrypted=syntheticPDF([...base,'<</Filter /Standard /V 1 /R 2 /Length 40>>'],'/Encrypt 4 0 R');
  await assert.rejects(assertReadablePDF(encrypted),error=>error.code==='unsupported_resume');
});
test('cyclic pages and deeply nested objects fail without recursion overflow',async()=>{
  await rejects(syntheticPDF([base[0],'<</Type /Pages /Kids [2 0 R] /Count 1>>']));
  await rejects(syntheticPDF([...base,Array(100).fill('[').join('')+'0'+Array(100).fill(']').join('')]));
});
test('bounded content decompression rejects a small compressed expansion bomb',async()=>{
  const compressed=deflateSync(Buffer.alloc(17*1024*1024,32));
  const content=Buffer.concat([Buffer.from(`<</Filter /FlateDecode /Length ${compressed.length}>>\nstream\n`),compressed,Buffer.from('\nendstream')]);
  const bytes=syntheticPDF([...base.slice(0,2),'<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R>>',content]);
  assert.ok(bytes.length<100000);await rejects(bytes);
});
test('malformed compressed page content fails; separate concurrent parsers keep their own budget',async()=>{
  const broken=syntheticPDF([...base.slice(0,2),'<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R>>','<</Filter /FlateDecode /Length 3>>\nstream\nbad\nendstream']);
  const good=await readFile(new URL('./fixtures/readable-resume.pdf',import.meta.url));
  const results=await Promise.allSettled([assertReadablePDF(broken),assertReadablePDF(good),assertReadablePDF(good)]);
  assert.equal(results[0].status,'rejected');for(const result of results.slice(1)){assert.equal(result.status,'fulfilled');assert.equal(result.value.pageCount,1)}
});
