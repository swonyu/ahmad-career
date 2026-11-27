import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Extracted-handler fixtures use these exact production dependencies. Keep
// error constructors together so instanceof matches the real module graph.
const result = await build({
  stdin: {
    contents: 'export { APIError } from "./app/components/api.ts"; export { workspaceFromResponse, acknowledgeWorkspacePublication } from "./app/phone/api.ts"; export { PhoneReadError } from "./app/phone/read-transport.ts"; export * from "./app/phone/historical-text.ts"; export { blankProfile } from "./app/phone/model.ts";',
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    sourcefile: 'phone-read-test-production.ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent',
});
export const productionRead = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
