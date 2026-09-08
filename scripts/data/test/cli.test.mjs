import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../adapt.mjs", import.meta.url));
test("adapter CLI rejects inherited format names without writing output and converts valid JSON", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "scribing-adapter-cli-"));
  try {
    const input = path.join(dir, "input.json");
    const strokes = [
      [
        [0, 1, 0],
        [2, 3, 10],
      ],
      [
        [4, 5, 20],
        [6, 7, 30],
      ],
    ];
    await writeFile(input, JSON.stringify({ strokes }));
    for (const format of ["constructor", "toString"]) {
      const output = path.join(dir, format + ".json");
      const result = spawnSync(
        process.execPath,
        [cli, "--format", format, "--input", input, "--output", output],
        { encoding: "utf8", timeout: 5000 }
      );
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Unsupported adapter format/);
      await assert.rejects(access(output), { code: "ENOENT" });
    }
    const output = path.join(dir, "valid.json");
    const result = spawnSync(
      process.execPath,
      [cli, "--format", "json", "--input", input, "--output", output],
      { encoding: "utf8", timeout: 5000 }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(output)).records, [{ strokes }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
