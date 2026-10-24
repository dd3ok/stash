import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createStashCatalog } from "../src/index.js";
import { recyclePath } from "../src/internal/recycle-bin.js";

const count = Number(process.env.STASH_BENCH_COUNT ?? 1000);
if (!Number.isInteger(count) || count < 1 || count > 10000) throw Error("STASH_BENCH_COUNT must be 1–10000.");
const base = await mkdtemp(path.join(tmpdir(), "stash-benchmark-"));
try {
  const root = path.join(base, "catalog");
  for (let i = 0; i < count; i++) {
    const directory = path.join(root, `category-${i % 20}`, `skill-${i}`);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "SKILL.md"), `---\nname: skill-${i}\ndescription: Inspect interface ${i} for responsive layouts and report actionable findings.\n---\n\nFixture body.\n`);
  }
  const options = { cacheDir: path.join(base, "cache"), catalogs: [{ id: "bench", root }] };
  let started = performance.now();
  const catalog = await createStashCatalog(options);
  await catalog.resolve({ kind: "list", pageSize: 50 });
  const coldMs = performance.now() - started;
  const times: number[] = [];
  let bytes = 0;
  for (let i = 0; i < 20; i++) {
    started = performance.now();
    const result = await (await createStashCatalog(options)).resolve({ kind: "list", pageSize: 50 });
    times.push(performance.now() - started);
    bytes = Buffer.byteLength(JSON.stringify(result.matches.map(({ ref, description, group }) => ({ ref, description, group }))));
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ count, node: process.version, platform: process.platform, coldMs, warmP50Ms: times[10], warmP95Ms: times[18], compact50Bytes: bytes }, null, 2));
} finally { await recyclePath(base); }
