#!/usr/bin/env node
/** Explicit offline conversion to raw observations; no guessed teaching metrics. */
import { readFile, writeFile } from "node:fs/promises";
import {
  parseSVG,
  parseJSON,
  parseOmniglot,
  parseTomoe,
  parseInkML,
  parseUnipen,
  point,
} from "./adapters.mjs";
import { sha256, encode } from "./build.mjs";
const args = process.argv.slice(2),
  options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--format", "--input", "--output"].includes(args[i]) || !args[i + 1])
    throw Error(
      "Usage: node scripts/data/adapt.mjs --format svg|json|omniglot|tomoe|inkml|unipen --input FILE --output FILE"
    );
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.input || !options.output || !options.format)
  throw Error("format, input and output are required");
const text = await readFile(options.input, "utf8");
let records;
if (options.format === "tomoe") records = parseTomoe(text);
else {
  const parsers = {
    svg: parseSVG,
    omniglot: parseOmniglot,
    inkml: parseInkML,
    unipen: parseUnipen,
    json: (source) => {
      const data = parseJSON(source);
      if (
        !Array.isArray(data.strokes) ||
        !data.strokes.length ||
        data.strokes.length > 256
      )
        throw Error("JSON expects {strokes: point[][]}");
      return data.strokes.map((s) => {
        if (!Array.isArray(s) || !s.length || s.length > 200000)
          throw Error("Invalid JSON stroke");
        return s.map(point);
      });
    },
  };
  if (!Object.hasOwn(parsers, options.format))
    throw Error("Unsupported adapter format");
  records = [{ strokes: parsers[options.format](text) }];
}
await writeFile(
  options.output,
  encode({
    schemaVersion: 1,
    kind: "raw-observations",
    sourceFormat: options.format,
    sourceSHA256: sha256(text),
    records,
  })
);
