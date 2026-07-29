import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "skills", "stash", "scripts", "stash.mjs");
await mkdir(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, "src", "cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "inline",
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

await chmod(outfile, 0o755);
