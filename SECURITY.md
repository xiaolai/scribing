# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/xiaolai/scribing/security/advisories/new)
on the repository. Please do not open a public issue for an unfixed vulnerability.

Include what the input is, what it reaches, and what an attacker gains. A proof of
concept is more useful than a description.

## What this library trusts

Scribing has **no runtime dependencies**. Everything below is first-party code.

It parses untrusted input in three places, and each has a dedicated validator:

| Input                               | Entry point                      | Validator                                                      |
| ----------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Character stroke data (JSON)        | `charDataLoader`, `setCharacter` | `src/validateCharData.ts`                                      |
| Writing units and data packs (JSON) | `setUnit`, `createDataProvider`  | `src/units/validateUnit.ts`, `src/units/provider.ts`           |
| Font shapes and animations          | `setShape`, `setAnimation`       | `src/fonts/validateShape.ts`, `src/fonts/validateAnimation.ts` |

All four validators share `src/validation/plainStructure.ts`, which:

- inspects own property **descriptors** before reading any value, so a getter or Proxy
  trap cannot return one value to the check and a different one to the use;
- rejects objects whose prototype is not `Object.prototype` or `null`, and arrays whose
  prototype is not `Array.prototype`;
- rejects symbol keys, non-enumerable properties and accessor properties;
- reads array `length` from its own descriptor and requires the own-property count to
  equal the indices plus `length`, so a shadowed `length` cannot smuggle elements past
  the per-index checks;
- copies values with `Object.defineProperty`, not assignment, so a literal `__proto__`
  data property is stored as data rather than reparenting the result;
- rejects a `toJSON` hook by name on data packs, which would otherwise let a pack
  rewrite itself during the snapshot taken after validation passed.

Every reader returns a **copy**. Mutating the object you passed in cannot reach
validated state afterwards.

`src/validation/__tests__/plainStructure-test.ts` pins each of these behaviours.

## Known accepted risks

**The default character loader fetches from a third-party CDN.** If you do not supply
`charDataLoader`, `setCharacter` requests
`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/<char>.json`. This is a
cross-origin request to jsDelivr on first use, which is both a supply-chain surface and
a disclosure of which characters a user is practising. The request has a 20 second
timeout but no integrity check. Supply your own `charDataLoader` to avoid it entirely;
see the README.

**`fflate` is pinned to 0.8.2, which carries a moderate advisory.** The advisory is a
possible infinite loop in `unzipSync` on malformed input. This project imports only
`gzipSync`, only in `scripts/data/build.mjs`, and only over local trusted data at
data-generation time. `unzipSync` is never called. The pin cannot move without
invalidating 149 pack manifests, which record `fflate@0.8.2 gzip level9 mtime0` as
provenance. Revisit if the advisory ever covers the compression path.

## Scope

In scope: anything reachable from the public API with attacker-controlled data —
character data, writing units, data packs, font files, font shapes, animation
descriptors, pointer input.

Out of scope: the demo pages and the `scripts/` check harness, which are development
tooling and are not published. Both development servers bind to `127.0.0.1` only.

## Supported versions

This fork has not been published to npm. Until it is, fixes land on `master` only.
