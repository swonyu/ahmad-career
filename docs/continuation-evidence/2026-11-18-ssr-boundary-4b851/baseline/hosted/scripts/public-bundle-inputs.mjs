// Extracted verbatim from the hash-verified owner builder; wrapper only.
export function assertPublicBundleInputs(inputs) {
  const browser = { metafile: { inputs: Object.fromEntries(inputs.map(name => [name, {}])) } };
    for (const name of Object.keys(browser.metafile.inputs)) {
      if (/^(?:server|worker|lib\/connector-|scripts)\//.test(name)) throw Error("Server-only module entered browser build: " + name);
    }
}
