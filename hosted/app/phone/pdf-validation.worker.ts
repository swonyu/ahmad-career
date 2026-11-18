import { inspectReadablePDF } from "../../shared/pdf-readability.mjs";

const worker = self as unknown as { onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage(value: unknown): void };
let started = false;

/** Native streaming inflation is capped before retaining each output chunk. */
async function inflateBounded(contents: Uint8Array, maximum: number, deadline: number): Promise<Uint8Array> {
  const stream = new Blob([contents.slice().buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let size = 0, expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, Math.max(1, deadline - Date.now()));
  try {
    for (;;) {
      const result = await reader.read();
      if (expired || Date.now() > deadline) throw Error("pdf-decompression-deadline");
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw Error("pdf-decompression-limit"); }
      chunks.push(result.value);
    }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

worker.onmessage = async (event) => {
  if (started) return;
  started = true;
  try {
    if (typeof DecompressionStream !== "function") { worker.postMessage({ ok: false, code: "validation_unavailable" }); return; }
    // Feature detection is separate from malformed compressed document errors.
    try { new DecompressionStream("deflate"); } catch { worker.postMessage({ ok: false, code: "validation_unavailable" }); return; }
    if (!(event.data instanceof ArrayBuffer)) throw Error("invalid-pdf-input");
    const result = await inspectReadablePDF(new Uint8Array(event.data), { inflate: inflateBounded });
    worker.postMessage({ ok: true, pageCount: result.pageCount });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code === "unsupported_resume" ? "unsupported_resume" : "invalid_resume";
    worker.postMessage({ ok: false, code });
  }
};
