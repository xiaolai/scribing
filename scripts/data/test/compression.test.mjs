import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { deterministicGzip, sha256 } from "../build.mjs";

test("raw observation gzip has zero timestamp and pinned cross-runtime bytes", () => {
  const input = Buffer.from("Scribing trajectories\n".repeat(1000), "utf8");
  const output = deterministicGzip(input);
  assert.deepEqual([...output.slice(0, 4)], [31, 139, 8, 0]);
  assert.deepEqual([...output.slice(4, 8)], [0, 0, 0, 0]);
  assert.deepEqual(gunzipSync(output), input);
  assert.equal(
    sha256(output),
    "12e01d5f014ee024f111854952049e551ec459bd79036df13765672a5ee67c89"
  );
  assert.deepEqual(deterministicGzip(input), output);
});
