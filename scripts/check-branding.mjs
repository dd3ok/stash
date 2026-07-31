import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanBranding } from "./lib/branding.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { violations } = await scanBranding(root);

if (violations.length > 0) {
  throw new Error(
    `Legacy three-part brand remains in: ${violations.join(", ")}`,
  );
}
