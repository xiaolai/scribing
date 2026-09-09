import { CharacterJson, LoadingManagerOptions } from './typings/types';
import validateCharData from './validateCharData';
import { toError } from './utils';

type CustomError = Error & { reason: string };

export default class LoadingManager {
  _loadCounter = 0;
  _isLoading = false;
  _resolve: ((data: CharacterJson | undefined) => void) | undefined;
  _reject: ((error?: Error | CustomError | string) => void) | undefined;
  _options: LoadingManagerOptions;

  /** Set when calling LoadingManager.loadCharData  */
  _loadingChar: string | undefined;
  /** use this to attribute to determine if there was a problem with loading */
  loadingFailed = false;

  constructor(options: LoadingManagerOptions) {
    this._options = options;
  }

  _debouncedLoad(char: string, count: number) {
    // these wrappers ignore all responses except the most recent.
    const wrappedResolve = (data: CharacterJson) => {
      if (count === this._loadCounter) {
        try {
          validateCharData(data);
          this._resolve?.(data);
        } catch (error) {
          this._reject?.(toError(error));
        }
      }
    };
    const wrappedReject = (reason?: Error | string) => {
      if (count === this._loadCounter) {
        this._reject?.(reason);
      }
    };

    try {
      const returnedData = this._options.charDataLoader(
        char,
        wrappedResolve,
        wrappedReject,
      );
      if (returnedData !== undefined) {
        Promise.resolve(returnedData).then(wrappedResolve, wrappedReject);
      }
    } catch (error) {
      wrappedReject(toError(error));
    }
  }

  _setupLoadingPromise(char: string, count: number) {
    return new Promise(
      (
        resolve: (data: CharacterJson | undefined) => void,
        reject: (err?: Error | CustomError | string) => void,
      ) => {
        this._resolve = resolve;
        this._reject = reject;
      },
    )
      .then((data: CharacterJson | undefined) => {
        if (count !== this._loadCounter || !data) return undefined;
        this._isLoading = false;
        this._options.onLoadCharDataSuccess?.(data);
        return data;
      })
      .catch((reason) => {
        if (count !== this._loadCounter) return undefined;
        this._isLoading = false;
        this.loadingFailed = true;

        // If the user has provided an "onLoadCharDataError", call this function
        // Otherwise, throw the promise
        if (this._options.onLoadCharDataError) {
          this._options.onLoadCharDataError(reason);
          return undefined;
        }

        // If error callback wasn't provided, throw an error so the developer will be aware something went wrong
        if (reason instanceof Error) {
          throw reason;
        }

        const err = new Error(`Failed to load char data for ${char}`) as CustomError;

        err.reason = reason;

        throw err;
      });
  }

  // Explicit cancellation settles the current operation without load callbacks.
  cancel() {
    this._loadCounter++;
    this._isLoading = false;
    this._resolve?.(undefined);
    this._resolve = undefined;
    this._reject = undefined;
  }

  loadCharData(char: string): Promise<CharacterJson | undefined> {
    this.cancel();
    this._loadingChar = char;
    const promise = this._setupLoadingPromise(char, this._loadCounter);
    this.loadingFailed = false;
    this._isLoading = true;
    this._debouncedLoad(char, this._loadCounter);
    return promise;
  }
}
