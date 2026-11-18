import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicBundleInputs } from "../scripts/public-bundle-inputs.mjs";

test("rejects the actual connector filename convention", () => {
  for (const name of ["lib/connector-context.ts", "lib/connector-contract.mjs", "lib/connector-client.ts"]) {
    assert.throws(() => assertPublicBundleInputs([name]), {
      message: "Server-only module entered browser build: " + name,
    });
  }
});

test("retains all existing private directory boundaries", () => {
  for (const name of ["server/auth.mjs", "server/nested/phone.mjs", "worker/index.ts", "scripts/build-site.mjs"]) {
    assert.throws(() => assertPublicBundleInputs([name]), /Server-only module entered browser build:/);
  }
});

test("permits public application and package input names", () => {
  assert.doesNotThrow(() => assertPublicBundleInputs([
    "renderer/client.tsx", "app/phone/PhoneApp.tsx", "app/phone/pdf-validation.worker.ts",
    "lib/phone-schema.mjs", "node_modules/react/index.js", "node_modules/pdfjs-dist/build/pdf.mjs",
  ]));
});

test("does not confuse similar names or nested words with root private paths", () => {
  assert.doesNotThrow(() => assertPublicBundleInputs([
    "serverless/client.ts", "workers/client.ts", "scripts-client.mjs", "lib/connectors.ts",
    "app/scripts/help.ts", "node_modules/example/server/index.js", "app/worker/status.ts",
  ]));
});

test("rejects a private input anywhere in a public bundle and reports its target", () => {
  assert.throws(() => assertPublicBundleInputs([
    "app/phone/pdf-validation.worker.ts", "node_modules/pdfjs-dist/build/pdf.mjs", "lib/connector-context.ts",
  ], "PDF worker"), { message: "Server-only module entered PDF worker build: lib/connector-context.ts" });
});

test("keeps the caller input list unchanged", () => {
  const names = ["renderer/client.tsx", "lib/connector-contract.mjs"];
  const before = [...names];
  assert.throws(() => assertPublicBundleInputs(names), /Server-only module/);
  assert.deepEqual(names, before);
  assert.doesNotThrow(() => assertPublicBundleInputs([]));
});
