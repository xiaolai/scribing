#!/usr/bin/env node
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, sha256 } from "./build.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const expected = path.join(root, "packs/generated");
const dir = await mkdtemp(path.join(tmpdir(), "scribing-data-reproduce-"));
try {
  await build({ outDir: dir });
  const names = (await readdir(expected)).sort();
  const rebuilt = (await readdir(dir)).sort();
  if (JSON.stringify(names) !== JSON.stringify(rebuilt))
    throw Error("Generated file inventory differs");
  for (const name of names)
    if (
      sha256(await readFile(path.join(expected, name))) !==
      sha256(await readFile(path.join(dir, name)))
    )
      throw Error("Non-reproducible output: " + name);
  console.log(JSON.stringify({ files: names.length, reproducible: true }));
} finally {
  await rm(dir, { recursive: true, force: true });
}
