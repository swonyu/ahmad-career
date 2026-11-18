import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "./sites-env.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
if (command === "build") {
  if (args.length) throw Error("The production build accepts no positional arguments.");
  const configured = process.env.SITES_BUILD_TIMEOUT ?? "3m";
  const match = /^(\d+)(ms|s|m)$/.exec(configured);
  const timeout = match ? Number(match[1]) * ({ ms: 1, s: 1000, m: 60000 }[match[2]]) : 0;
  if (!(timeout > 0 && timeout <= 600000)) throw Error("SITES_BUILD_TIMEOUT must be between 1ms and 10m.");
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./build-site.mjs", import.meta.url))], {
    stdio: "inherit", timeout, killSignal: "SIGTERM",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { startPreview } = await import("./preview-site.mjs");
  await startPreview(args);
}
