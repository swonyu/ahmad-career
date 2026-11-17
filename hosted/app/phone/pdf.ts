import { MAX_PDF_BYTES, type Profile } from "./model";

type WorkerPort = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
type Options = { signal?: AbortSignal; createWorker?: () => WorkerPort; timeoutMs?: number };
const MAX_CHECK_MILLISECONDS = 6000;
const unavailable = () => Error("This browser cannot safely check PDFs right now. Use an updated browser and choose the file again. Your previous CV was kept.");
const cancelled = () => new DOMException("PDF check cancelled. Your previous CV was kept.", "AbortError");
const invalid = () => Error("This file could not be read as a supported PDF CV. Export a new, unencrypted PDF and try again. Your previous CV was kept.");

/** Worker injection is an executable-test port, never a browser/request setting. */
export function validatePDFBytes(bytes: Uint8Array, { signal, createWorker, timeoutMs = MAX_CHECK_MILLISECONDS }: Options = {}): Promise<number> {
  if (signal?.aborted) return Promise.reject(cancelled());
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 64 || bytes.byteLength > MAX_PDF_BYTES) return Promise.reject(invalid());
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_CHECK_MILLISECONDS) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    let worker: WorkerPort;
    try {
      if (!createWorker && typeof Worker !== "function") throw unavailable();
      worker = createWorker ? createWorker() : new Worker(new URL("./pdf-validation.worker.ts", import.meta.url), { type: "module", name: "career-finder-pdf-check" });
    } catch { reject(unavailable()); return; }
    let settled = false;
    const finish = (error: Error | null, pages = 0) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      worker.removeEventListener("message", message); worker.removeEventListener("error", failed); worker.removeEventListener("messageerror", failed); worker.terminate();
      if (error) reject(error); else resolve(pages);
    };
    const abort = () => finish(cancelled());
    const failed = () => finish(unavailable());
    const message = (event: MessageEvent<unknown>) => {
      if (signal?.aborted) { abort(); return; }
      const value = event.data;
      if (!value || typeof value !== "object" || !("ok" in value)) { finish(invalid()); return; }
      if (value.ok === true && "pageCount" in value && typeof value.pageCount === "number" && Number.isSafeInteger(value.pageCount) && value.pageCount > 0 && value.pageCount <= 500) { finish(null, value.pageCount); return; }
      if (value.ok === false && "code" in value && value.code === "unsupported_resume") finish(Error("Choose a PDF without password protection. Your previous CV was kept."));
      else if (value.ok === false && "code" in value && value.code === "validation_unavailable") finish(unavailable());
      else finish(invalid());
    };
    const timer = setTimeout(() => finish(Error("This PDF took too long to check. Export a simpler PDF and choose it again. Your previous CV was kept.")), timeoutMs);
    worker.addEventListener("message", message); worker.addEventListener("error", failed); worker.addEventListener("messageerror", failed);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { const input = new Uint8Array(bytes).buffer; worker.postMessage(input, [input]); }
    catch { finish(unavailable()); }
  });
}

export async function readCheckedPDF(file: File, options: Options = {}): Promise<{ resume: NonNullable<Profile["resume"]>; pageCount: number }> {
  if (options.signal?.aborted) throw cancelled();
  if (file.size < 64 || file.size > MAX_PDF_BYTES || !/\.pdf$/i.test(file.name) || file.name.length > 180 || file.name.startsWith(".") || /[\x00-\x1f\x7f/\\:]/.test(file.name)) throw Error("Choose a readable PDF with a simple filename, up to 5 MiB. Your previous CV was kept.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (options.signal?.aborted) throw cancelled();
  if (bytes.byteLength !== file.size) throw invalid();
  const pageCount = await validatePDFBytes(bytes, options);
  if (options.signal?.aborted) throw cancelled();
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  if (options.signal?.aborted) throw cancelled();
  let binary = ""; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return { resume: { name: file.name, mime: "application/pdf", size: bytes.byteLength, sha256, dataBase64: btoa(binary) }, pageCount };
}
