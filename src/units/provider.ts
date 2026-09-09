import { WritingDataPack, WritingDataProvider } from './types';
import validateUnit from './validateUnit';
import { readPlainObject } from '../validation/plainStructure';

const own = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const normalized = (value: string) => {
  if (typeof value !== 'string' || !value.length || value.length > 256) {
    throw new Error(
      'Unit identifiers must be nonempty strings of at most 256 characters.',
    );
  }
  return value.normalize('NFC');
};

// Inspect own descriptors before reading values or serializing caller objects.
// `toJSON` is rejected by name: it would let the pack rewrite itself during the
// structural snapshot below, after validation has already passed.
const plainRecord = (value: unknown) => {
  readPlainObject(
    value,
    () => {
      throw new Error(
        'Data packs must be plain objects of JSON values, without serialization hooks.',
      );
    },
    { forbid: ['toJSON'] },
  );
};

/** An offline, immutable provider. Loading never guesses a missing language or variant. */
export default function createDataProvider(pack: WritingDataPack): WritingDataProvider {
  plainRecord(pack);
  plainRecord(pack.source);
  if (
    !pack ||
    pack.schemaVersion !== 1 ||
    !pack.units ||
    Array.isArray(pack.units) ||
    !pack.id ||
    !pack.license ||
    !pack.source?.url ||
    ['technical-preview', 'reviewed'].indexOf(pack.status) < 0
  ) {
    throw new Error('Invalid writing data pack manifest.');
  }
  plainRecord(pack.units);
  if (pack.aliases !== undefined) plainRecord(pack.aliases);
  const keys = Object.keys(pack.units);
  if (!keys.length || keys.length > 20000)
    throw new Error('Invalid data pack unit count.');
  // Validate BEFORE serialization so hidden hooks cannot substitute unvalidated data.
  keys.forEach((key) => validateUnit(pack.units[key]));
  // Snapshot caller-owned data once; returned units are independent copies.
  const units = JSON.parse(JSON.stringify(pack.units)) as WritingDataPack['units'];
  const index: Record<string, string> = Object.create(null);
  keys.forEach((key) => {
    const normalizedKey = normalized(key);
    if (own(index, normalizedKey))
      throw new Error('Data pack contains colliding NFC identifiers.');
    index[normalizedKey] = key;
  });
  const aliases: Record<string, string> = Object.create(null);
  Object.keys(pack.aliases || {}).forEach((key) => {
    const alias = normalized(key);
    const target = normalized(pack.aliases![key]);
    if (own(index, alias) || own(aliases, alias) || !own(index, target)) {
      throw new Error('Data pack alias collides or references a missing unit.');
    }
    aliases[alias] = target;
  });
  return {
    async load(request, { signal }) {
      if (signal.aborted) throw new Error('Unit load aborted.');
      const id = normalized(request.id);
      const key =
        request.variant === undefined ? id : `${id}@${normalized(request.variant)}`;
      const resolved = own(aliases, key) ? aliases[key] : key;
      if (!own(index, resolved)) throw new Error(`Writing unit is unavailable: ${key}`);
      const unit = units[index[resolved]];
      validateUnit(unit);
      if (signal.aborted) throw new Error('Unit load aborted.');
      return JSON.parse(JSON.stringify(unit));
    },
  };
}
