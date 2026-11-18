// These are project-relative esbuild metafile input names. Package dependency
// paths are permitted; project connector, server and build code stays private.
const privateInput = /^(?:(?:server|worker|scripts)\/|lib\/connector-)/;

export function assertPublicBundleInputs(inputs, target = "browser") {
  for (const name of inputs) {
    if (privateInput.test(name)) {
      throw new Error("Server-only module entered " + target + " build: " + name);
    }
  }
}
