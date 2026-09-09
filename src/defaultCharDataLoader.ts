import { CharacterJson } from './typings/types';

const VERSION = '2.0.1';
/** Abandon a stalled request instead of leaving the caller's promise pending forever. */
const REQUEST_TIMEOUT_MS = 20000;

const getCharDataUrl = (char: string) =>
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@${VERSION}/${encodeURIComponent(
    char,
  )}.json`;

const defaultCharDataLoader = (
  char: string,
  onLoad: (parsedJson: CharacterJson) => void,
  onError: (error?: any, context?: any) => void,
  options?: { signal?: AbortSignal },
) => {
  const signal = options?.signal;
  // A request that is superseded before it starts has nothing to download.
  if (signal?.aborted) return;
  // load char data from Hanzi Writer Data CDN (currently hosted on jsdelivr)
  const xhr = new XMLHttpRequest();
  if (xhr.overrideMimeType) {
    // IE 9 and 10 don't seem to support this...
    xhr.overrideMimeType('application/json');
  }
  xhr.open('GET', getCharDataUrl(char), true);
  // Without this the `ontimeout` handler below could never fire: XMLHttpRequest
  // defaults to no timeout, so a stalled connection never settled.
  xhr.timeout = REQUEST_TIMEOUT_MS;
  let settled = false;
  const fail = (error?: any, context?: any) => {
    if (settled) return;
    settled = true;
    onError(error, context);
  };
  xhr.onerror = (event) => fail(xhr, event);
  xhr.onabort = (event) => fail(xhr, event);
  xhr.ontimeout = (event) => fail(xhr, event);
  xhr.onreadystatechange = () => {
    if (xhr.readyState !== 4 || settled) return;

    if (xhr.status === 200) {
      let data: CharacterJson;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (error) {
        fail(error);
        return;
      }
      settled = true;
      onLoad(data);
    } else if (xhr.status !== 0) {
      fail(xhr);
    }
    // Status 0 is reported by the error, abort, or timeout event with its context.
  };
  // Stop the transfer when the writer moves on. Without this a superseded character
  // kept its connection open until the response arrived or the timeout fired.
  signal?.addEventListener('abort', () => xhr.abort(), { once: true });
  xhr.send(null);
};

export default defaultCharDataLoader;
