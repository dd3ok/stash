import { performance } from "node:perf_hooks";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStashCatalog } from "../src/stash-catalog.js";

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

async function measure(
  repeats: number,
  operation: () => Promise<unknown>,
): Promise<number[]> {
  const values: number[] = [];
  for (let index = 0; index < repeats; index += 1) {
    const started = performance.now();
    await operation();
    values.push(performance.now() - started);
  }
  return values;
}

const base = await mkdtemp(path.join(tmpdir(), "stash-benchmark-"));
const expectedPrefix = path.resolve(tmpdir());
if (!path.resolve(base).startsWith(expectedPrefix)) {
  throw new Error(`Unsafe benchmark temporary directory: ${base}`);
}
const budgets = {
  indexMs: 10_000,
  exactP95Ms: 100,
  searchP95Ms: 500,
  repositoryP95Ms: 100,
};

try {
  const root = path.join(base, "catalog");
  const cacheDir = path.join(base, "cache");
  for (let index = 0; index < 1_000; index += 1) {
    const name = `skill-${String(index).padStart(4, "0")}`;
    const directory = path.join(root, `group-${index % 20}`, name);
    await mkdir(directory, { recursive: true });
    const brandTerms =
      index % 100 === 0
        ? "Create a brand identity, logo system, and art direction."
        : "Perform a focused software workflow with deterministic output.";
    await writeFile(
      path.join(directory, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${brandTerms}\n---\n\n# ${name}\n`,
      "utf8",
    );
    await writeFile(
      path.join(directory, "stash.meta.yaml"),
      "schemaVersion: 1\nsource:\n  url: https://github.com/benchmark/repository-bundle\n",
      "utf8",
    );
  }

  const catalog = await createStashCatalog({
    cacheDir,
    catalogs: [{ id: "benchmark", root }],
    defaults: { cacheTtlMs: 600_000 },
  });

  const indexStarted = performance.now();
  await catalog.refresh();
  const indexMs = performance.now() - indexStarted;
  const exact = await measure(50, () =>
    catalog.resolve({ kind: "exact", name: "skill-0500" }),
  );
  const search = await measure(50, () =>
    catalog.resolve({
      kind: "search",
      query: "brand identity logo art direction",
      pageSize: 200,
    }),
  );
  const repository = await measure(50, async () => {
    const result = await catalog.resolve({
      kind: "list", sources: ["repository-bundle"], pageSize: 40,
    });
    if (result.totalRelevant !== 1_000) throw new Error("Incomplete repository bundle.");
  });
  const result = {
    records: 1_000,
    indexMs: Number(indexMs.toFixed(2)),
    exact: {
      p50Ms: Number(percentile(exact, 50).toFixed(2)),
      p95Ms: Number(percentile(exact, 95).toFixed(2)),
    },
    search: {
      p50Ms: Number(percentile(search, 50).toFixed(2)),
      p95Ms: Number(percentile(search, 95).toFixed(2)),
    },
    repository: {
      p50Ms: Number(percentile(repository, 50).toFixed(2)),
      p95Ms: Number(percentile(repository, 95).toFixed(2)),
    },
    budgets,
  };

  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`,
  );
  if (
    result.indexMs > budgets.indexMs ||
    result.exact.p95Ms > budgets.exactP95Ms ||
    result.search.p95Ms > budgets.searchP95Ms ||
    result.repository.p95Ms > budgets.repositoryP95Ms
  ) {
    throw new Error("Routing benchmark exceeded the regression budget.");
  }
} finally {
  await rm(base, { recursive: true, force: true });
}
