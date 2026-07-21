import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const [, , entrypoint, ...args] = process.argv;

if (!entrypoint) {
  console.error("Usage: node scripts/run-with-system-ca.mjs <entrypoint> [...args]");
  process.exit(1);
}

const resolvedEntrypoint = resolve(process.cwd(), entrypoint);

if (!existsSync(resolvedEntrypoint)) {
  console.error(`Entrypoint introuvable: ${entrypoint}`);
  process.exit(1);
}

const child = spawn(process.execPath, [resolvedEntrypoint, ...args], {
  env: {
    ...process.env,
    NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA ?? "1",
  },
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
