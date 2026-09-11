/**
 * Read a response body under a hard byte cap, without buffering past it.
 *
 * `content-length` is advisory and frequently absent, and `Number(null)` is 0, so a
 * header check alone lets a header-less response through to `arrayBuffer()`, which
 * buffers however much arrives. Streaming stops at the cap instead of discovering the
 * overrun once the memory is already committed.
 *
 * One copy, imported by both the font provider and the animation source loader. Two
 * copies of a cap on untrusted input can drift apart, and only one of them would be
 * fixed when that mattered. Overflow is a RangeError so each caller can report it in
 * its own vocabulary; a failed read cancels the reader before propagating.
 *
 * @param {Response} response a fetch response
 * @param {number} max largest number of bytes to accept
 * @returns {Promise<Uint8Array>} the body
 */
export async function readCapped(response, max) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    // A fetch implementation without a readable body, as in tests.
    const buffered = new Uint8Array(await response.arrayBuffer());
    if (buffered.byteLength > max) throw new RangeError('Response exceeds its cap');
    return buffered;
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) throw new RangeError('Response exceeds its cap');
      chunks.push(value);
    }
  } catch (cause) {
    await reader.cancel?.().catch(() => undefined);
    throw cause;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
