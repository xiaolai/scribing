#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha256, loadSource } from "./build.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const dir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "packs/generated");
const runtimeRoot = process.argv[3] ? path.resolve(process.argv[3]) : root;
const require = createRequire(path.join(runtimeRoot, "package.json"));
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
      },
    }).outputText,
    filename
  );
const validateUnit = require(path.join(
  runtimeRoot,
  "src/units/validateUnit.ts"
)).default;
const compileUnit = require(path.join(runtimeRoot, "src/units/compileUnit.ts"))
  .default;
let maxCompiledPoints = 0,
  maxMotorStrokes = 0;
const catalog = JSON.parse(await readFile(path.join(dir, "catalog.json")));
let units = 0;
function assert(value, message) {
  if (!value) throw Error(message);
}
for (const entry of catalog.packs) {
  const bytes = await readFile(path.join(dir, entry.file)),
    p = JSON.parse(bytes),
    m = JSON.parse(await readFile(path.join(dir, entry.manifest)));
  assert(
    sha256(bytes) === entry.sha256 && sha256(bytes) === m.sha256,
    "Output hash mismatch: " + entry.id
  );
  assert(
    sha256(await readFile(path.join(dir, entry.notice))) === m.noticeSHA256,
    "Notice hash mismatch"
  );
  assert(
    Object.keys(p.units).length === entry.unitCount &&
      Object.keys(m.assets).length === entry.unitCount,
    "Coverage mismatch"
  );
  for (const [id, u] of Object.entries(p.units)) {
    try {
      validateUnit(u);
      const compiled = compileUnit(u);
      maxMotorStrokes = Math.max(maxMotorStrokes, compiled.strokes.length);
      for (const stroke of compiled.strokes)
        maxCompiledPoints = Math.max(maxCompiledPoints, stroke.points.length);
    } catch (error) {
      throw Error(
        `Runtime validation failed ${entry.id}/${id}: ${error.message}`
      );
    }
    assert(
      u.id === id &&
        u.schemaVersion === 2 &&
        u.motorStrokes.length > 0 &&
        u.motorStrokes.length <= 64,
      "Invalid unit"
    );
    assert(
      u.coordinates.bounds.length === 4 &&
        u.coordinates.bounds.every(Number.isFinite) &&
        u.coordinates.bounds[2] > 0 &&
        u.coordinates.bounds[3] > 0,
      "Invalid bounds"
    );
    const ids = new Set(u.motorStrokes.map((s) => s.id));
    assert(ids.size === u.motorStrokes.length, "Duplicate motor ID");
    for (const s of u.motorStrokes) {
      const points = s.kind === "dot" ? [s.center] : s.points;
      assert(
        points.length >= (s.kind === "dot" ? 1 : 2) && points.length <= 4096,
        "Invalid point count"
      );
      assert(
        points.every((p) => p.length === 2 && p.every(Number.isFinite)),
        "Invalid point"
      );
      assert((s.kind === "dot" ? s.radius : s.width) > 0, "Invalid width");
    }
    for (const plan of u.plans)
      assert(
        plan.steps.length === ids.size &&
          new Set(plan.steps.map((s) => s.strokeId)).size === ids.size &&
          plan.steps.every((s) => ids.has(s.strokeId)),
        "Incomplete plan"
      );
    units++;
  }
}
const sourceDir = path.join(root, "packs/sources"),
  lock = JSON.parse(await readFile(path.join(sourceDir, "lock.json")));
for (const item of lock.sources) await loadSource(sourceDir, item);
assert(
  sha256(await readFile(path.join(sourceDir, lock.mapping.file))) ===
    lock.mapping.sha256,
  "Korean mapping hash mismatch"
);
let rawSamples = 0;
for (const entry of catalog.rawObservations) {
  const bytes = await readFile(path.join(dir, entry.file));
  assert(sha256(bytes) === entry.sha256, "Raw hash mismatch");
  const data = JSON.parse(
    gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 })
  );
  assert(data.observations.length === entry.sampleCount, "Raw count mismatch");
  rawSamples += data.observations.length;
}
assert(catalog.quarantine.length === 0, "Review quarantined observations");
console.log(
  JSON.stringify({
    packs: catalog.packs.length,
    units,
    rawSamples,
    sourceLocks: lock.sources.length,
    maxCompiledPoints,
    maxMotorStrokes,
    integrity: "verified",
  })
);
