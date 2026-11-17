import {inflateSync} from 'node:zlib';
import {inspectReadablePDF} from '../shared/pdf-readability.mjs';
import {fail} from './validation.mjs';

/** The server keeps the same limits and error contract as the browser parser. */
export async function assertReadablePDF(bytes) {
  try { return await inspectReadablePDF(bytes,{inflate:(contents,maxOutputLength)=>inflateSync(contents,{maxOutputLength})}); }
  catch(error) { fail(error.code==='unsupported_resume'?'unsupported_resume':'invalid_resume',error.message); }
}
