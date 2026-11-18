import { PDFParser, PDFObjectStreamParser, PDFXRefStreamParser, PDFRawStream, PDFDict, PDFArray, PDFName, PDFNumber } from 'pdf-lib';

const name = PDFName.of;
const MAX_OBJECTS = 20_000, MAX_EXPANDED_BYTES = 16 * 1024 * 1024;
const MAX_PAGES = 500, MAX_DEPTH = 64;
export const PDF_LIMITS = Object.freeze({maxBytes:5*1024*1024,maxObjects:MAX_OBJECTS,maxExpandedBytes:MAX_EXPANDED_BYTES,maxPages:MAX_PAGES,maxDepth:MAX_DEPTH,maxParseMilliseconds:3000});
export class PDFReadabilityError extends Error {
  constructor(code,message) { super(message); this.name='PDFReadabilityError'; this.code=code; }
}
function hasEOF(bytes) { for(let index=bytes.length-5;index>=0;index--) if(bytes[index]===37&&bytes[index+1]===37&&bytes[index+2]===69&&bytes[index+3]===79&&bytes[index+4]===70)return true; return false; }
const problem = () => { throw Error('unsupported-pdf-structure'); };
function number(value) { if (!(value instanceof PDFNumber) || !Number.isFinite(value.asNumber())) problem(); return value.asNumber(); }
function boundedObjectParser(parser, budget) {
  const original = parser.parseObject;
  let depth = 0;
  parser.parseObject = function(...args) {
    if (++depth > MAX_DEPTH || ++budget.objects > MAX_OBJECTS || Date.now() > budget.deadline) problem();
    try { return original.apply(this, args); } finally { depth--; }
  };
  return parser;
}

// pdf-lib's normal load has no decompression/object-count budget. These local
// parser instances bound object streams before the library sees expanded data.
// The platform adapter must cap inflation before allocating expanded output.
// No library globals are changed, so concurrent workspaces cannot share a budget.
class BoundedParser extends PDFParser {
  constructor(bytes, inflate) {
    super(bytes, 100, true, true);
    this.inflate = inflate;
    this.budget = { objects: 0, expanded: 0, deadline: Date.now() + PDF_LIMITS.maxParseMilliseconds };
    boundedObjectParser(this, this.budget);
  }
  async decoded(stream) {
    let filter = stream.dict.lookup(name('Filter'));
    if (filter instanceof PDFArray) {
      if (filter.size() !== 1) problem();
      filter = filter.lookup(0);
    }
    let contents = stream.contents;
    if (filter) {
      if (filter !== name('FlateDecode')) problem();
      const remaining = MAX_EXPANDED_BYTES - this.budget.expanded;
      if (remaining < 1) problem();
      contents = await this.inflate(contents, remaining, this.budget.deadline);
      if (!(contents instanceof Uint8Array) || Date.now() > this.budget.deadline) problem();
    }
    this.budget.expanded += contents.byteLength;
    if (this.budget.expanded > MAX_EXPANDED_BYTES) problem();
    const dict = stream.dict.clone();
    dict.delete(name('Filter')); dict.delete(name('DecodeParms'));
    return PDFRawStream.of(dict, contents);
  }
  async parseIndirectObject() {
    const ref = this.parseIndirectObjectHeader();
    this.skipWhitespaceAndComments();
    const object = this.parseObject();
    this.skipWhitespaceAndComments();
    if (!this.matchKeyword([101,110,100,111,98,106])) problem();
    if (object instanceof PDFRawStream && object.dict.lookup(name('Type')) === name('ObjStm')) {
      const count = number(object.dict.lookup(name('N'))), offset = number(object.dict.lookup(name('First')));
      if (!Number.isSafeInteger(count) || count < 0 || count > MAX_OBJECTS || offset < 0) problem();
      const decoded = await this.decoded(object);
      if (offset > decoded.contents.byteLength) problem();
      const parser = boundedObjectParser(PDFObjectStreamParser.forStream(decoded, this.shouldWaitForTick), this.budget);
      await parser.parseIntoContext();
    } else if (object instanceof PDFRawStream && object.dict.lookup(name('Type')) === name('XRef')) {
      const decoded = await this.decoded(object), parser = PDFXRefStreamParser.forStream(decoded);
      if (parser.subsections.reduce((n, s) => n + s.length, 0) > MAX_OBJECTS || parser.subsections.some(s => !Number.isSafeInteger(s.length) || s.length < 0 || !Number.isSafeInteger(s.firstObjectNumber) || s.firstObjectNumber < 0) || parser.byteWidths.length !== 3 || parser.byteWidths.some(n => !Number.isSafeInteger(n) || n < 0 || n > 8)) problem();
      const required = parser.subsections.reduce((n, s) => n + s.length, 0) * parser.byteWidths.reduce((a,b) => a+b, 0);
      if (required > decoded.contents.byteLength) problem();
      parser.parseIntoContext();
    } else this.context.assign(ref, object);
    return ref;
  }
}

export async function inspectReadablePDF(bytes, {inflate} = {}) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 64 || bytes.byteLength > 5 * 1024 * 1024 || String.fromCharCode(...bytes.subarray(0, 8)).match(/^%PDF-\d\.\d/) === null || !hasEOF(bytes) || typeof inflate !== 'function') problem();
    const parser = new BoundedParser(bytes, inflate), context = await parser.parseDocument();
    if (context.trailerInfo.Encrypt) throw new PDFReadabilityError('unsupported_resume', 'Choose a PDF without password protection. Your previous résumé was preserved.');
    const catalog = context.lookup(context.trailerInfo.Root);
    if (!(catalog instanceof PDFDict) || catalog.lookup(name('Type')) !== name('Catalog')) problem();
    let pages = 0;
    const visited = new Set();
    async function visit(reference, mediaBox, depth = 0) {
      if (Date.now() > parser.budget.deadline || depth > MAX_DEPTH || visited.has(reference) || visited.size > MAX_OBJECTS) problem();
      visited.add(reference);
      const node = context.lookup(reference);
      if (!(node instanceof PDFDict)) problem();
      const box = node.lookup(name('MediaBox')) ?? mediaBox;
      if (node.lookup(name('Type')) === name('Page')) {
        if (++pages > MAX_PAGES || !(box instanceof PDFArray) || box.size() !== 4) problem();
        const rectangle = [0,1,2,3].map(i => number(box.lookup(i)));
        if (!(rectangle[2] > rectangle[0] && rectangle[3] > rectangle[1]) || rectangle.some(n => Math.abs(n) > 1_000_000)) problem();
        const contents = node.lookup(name('Contents'));
        if (contents instanceof PDFArray) {
          if (contents.size() > MAX_OBJECTS) problem();
          for (let i=0;i<contents.size();i++) { const stream=contents.lookup(i);if (!(stream instanceof PDFRawStream)) problem();await parser.decoded(stream); }
        } else if (contents) { if (!(contents instanceof PDFRawStream)) problem();await parser.decoded(contents); }
      } else if (node.lookup(name('Type')) === name('Pages')) {
        const kids = node.lookup(name('Kids'));
        if (!(kids instanceof PDFArray) || kids.size() > MAX_OBJECTS) problem();
        for (let i=0;i<kids.size();i++) await visit(kids.get(i), box, depth+1);
      } else problem();
    }
    await visit(catalog.get(name('Pages')));
    if (!pages) problem();
    return { pageCount: pages };
  } catch (error) {
    if (error?.code === 'unsupported_resume') throw error;
    throw new PDFReadabilityError('invalid_resume', 'This file could not be read as a supported PDF résumé. Export a new, unencrypted PDF and try again. Your previous résumé was preserved.');
  }
}
