import ren from 'hanzi-writer-data/人.json';
import ta from 'hanzi-writer-data/他.json';
import LoadingManager from '../LoadingManager';

describe('LoadingManager', () => {
  describe('loadCharData', () => {
    it('resolves when data is loaded via async callback', async () => {
      const manager = new LoadingManager({
        charDataLoader: (_char, onComplete) => {
          setTimeout(() => onComplete(ren), 1);
        },
      });
      const data = await manager.loadCharData('人');
      expect(data).toBe(ren);
      expect(manager.loadingFailed).toBe(false);
    });

    it('resolves when data is loaded via sync callback', async () => {
      const manager = new LoadingManager({
        charDataLoader: (_char, onComplete) => {
          onComplete(ren);
        },
      });
      const data = await manager.loadCharData('人');
      expect(data).toBe(ren);
      expect(manager.loadingFailed).toBe(false);
    });

    it('resolves when data is loaded via promise', async () => {
      const manager = new LoadingManager({
        charDataLoader: () => Promise.resolve(ren),
      });
      const data = await manager.loadCharData('人');
      expect(data).toBe(ren);
      expect(manager.loadingFailed).toBe(false);
    });

    it('resolves when data is loaded via sync return', async () => {
      const manager = new LoadingManager({
        charDataLoader: () => ren,
      });
      const data = await manager.loadCharData('人');
      expect(data).toBe(ren);
      expect(manager.loadingFailed).toBe(false);
    });

    it('passes data to onLoadCharDataSuccess if provided', async () => {
      let successVal;
      const manager = new LoadingManager({
        charDataLoader: () => ren,
        onLoadCharDataSuccess: (returnedData) => {
          successVal = returnedData;
        },
      });
      const data = await manager.loadCharData('人');
      expect(data).toBe(ren);
      expect(successVal).toBe(ren);
      expect(manager.loadingFailed).toBe(false);
    });

    it('throws an error if loading fails via onErr callback and no callback is provided', async () => {
      const manager = new LoadingManager({
        charDataLoader: (char, onComplete, onErr) => {
          onErr('OMG');
        },
      });
      await expect(manager.loadCharData('人')).rejects.toThrow(
        new Error('Failed to load char data for 人'),
      );
      expect(manager.loadingFailed).toBe(true);
    });

    it('rethrows if loading fails via onErr callback passing an Error and no callback is provided', async () => {
      const manager = new LoadingManager({
        charDataLoader: (char, onComplete, onErr) => {
          onErr(new Error('OMG'));
        },
      });
      await expect(manager.loadCharData('人')).rejects.toThrow(new Error('OMG'));
      expect(manager.loadingFailed).toBe(true);
    });

    it('resolves if loading fails via onErr callback and a callback is provided', async () => {
      let failureReason;
      const manager = new LoadingManager({
        charDataLoader: (char, onComplete, onErr) => {
          onErr('everything is terrible');
        },
        onLoadCharDataError: (reason) => {
          failureReason = reason;
        },
      });
      const data = await manager.loadCharData('人');
      expect(manager.loadingFailed).toBe(true);
      expect(data).toBe(undefined);
      expect(failureReason).toBe('everything is terrible');
    });

    it('routes synchronous loader exceptions through the error callback', async () => {
      const error = new Error('loader failed');
      const onLoadCharDataError = jest.fn();
      const manager = new LoadingManager({
        charDataLoader: () => {
          throw error;
        },
        onLoadCharDataError,
      });
      await expect(manager.loadCharData('人')).resolves.toBeUndefined();
      expect(onLoadCharDataError).toHaveBeenCalledWith(error);
      expect(manager.loadingFailed).toBe(true);
      expect(manager._isLoading).toBe(false);
    });

    it('rejects synchronous loader exceptions without an error callback', async () => {
      const error = new Error('loader failed');
      const manager = new LoadingManager({
        charDataLoader: () => {
          throw error;
        },
      });
      await expect(manager.loadCharData('人')).rejects.toBe(error);
    });

    it.each([null, {}, { strokes: ['M0 0'], medians: [] }])(
      'rejects malformed custom loader data: %p',
      async (data) => {
        const onLoadCharDataSuccess = jest.fn();
        const manager = new LoadingManager({
          charDataLoader: () => data as any,
          onLoadCharDataSuccess,
        });
        await expect(manager.loadCharData('人')).rejects.toThrow(
          'Invalid character data',
        );
        expect(onLoadCharDataSuccess).not.toHaveBeenCalled();
        expect(manager.loadingFailed).toBe(true);
      },
    );

    it.each(['success', 'error'])(
      'ignores queued %s handlers from a superseded load',
      async (outcome) => {
        const onLoadCharDataSuccess = jest.fn();
        const onLoadCharDataError = jest.fn();
        let completeLatest: (data: typeof ta) => void = () => undefined;
        const manager = new LoadingManager({
          charDataLoader: (char, resolve, reject) => {
            if (char === '人') {
              if (outcome === 'success') resolve(ren);
              else reject(new Error('old failure'));
            } else completeLatest = resolve;
          },
          onLoadCharDataSuccess,
          onLoadCharDataError,
        });
        const oldLoad = manager.loadCharData('人');
        const latestLoad = manager.loadCharData('他');
        await oldLoad;
        expect(manager._isLoading).toBe(true);
        expect(manager.loadingFailed).toBe(false);
        expect(onLoadCharDataSuccess).not.toHaveBeenCalled();
        expect(onLoadCharDataError).not.toHaveBeenCalled();
        completeLatest(ta);
        await expect(latestLoad).resolves.toBe(ta);
        expect(manager._isLoading).toBe(false);
        expect(onLoadCharDataSuccess).toHaveBeenCalledTimes(1);
      },
    );

    it('cancels pending data without callbacks and permits a subsequent load', async () => {
      const onLoadCharDataSuccess = jest.fn();
      const onLoadCharDataError = jest.fn();
      const callbacks: Array<(data: typeof ren) => void> = [];
      const manager = new LoadingManager({
        charDataLoader: (_char, resolve) => {
          callbacks.push(resolve);
        },
        onLoadCharDataSuccess,
        onLoadCharDataError,
      });
      const canceled = manager.loadCharData('人');
      manager.cancel();
      manager.cancel();
      await expect(canceled).resolves.toBeUndefined();
      expect(manager._isLoading).toBe(false);
      const latest = manager.loadCharData('他');
      callbacks[0](ren);
      expect(manager._isLoading).toBe(true);
      callbacks[1](ta);
      await expect(latest).resolves.toBe(ta);
      expect(onLoadCharDataSuccess).toHaveBeenCalledTimes(1);
      expect(onLoadCharDataError).not.toHaveBeenCalled();
    });

    it('suppresses a queued success when canceled immediately after resolution', async () => {
      const onLoadCharDataSuccess = jest.fn();
      const manager = new LoadingManager({
        charDataLoader: (_char, resolve) => {
          resolve(ren);
        },
        onLoadCharDataSuccess,
      });
      const canceled = manager.loadCharData('人');
      manager.cancel();
      await expect(canceled).resolves.toBeUndefined();
      expect(onLoadCharDataSuccess).not.toHaveBeenCalled();
    });

    it('debounces if multiple loads are called at the same time', async () => {
      const onLoadCharDataSuccess = jest.fn();
      const onCompleteFns: Array<(arg: any) => void> = [];
      const manager = new LoadingManager({
        onLoadCharDataSuccess,
        charDataLoader: (char, onComplete) => {
          onCompleteFns.push(onComplete);
        },
      });

      const loadPromise1 = manager.loadCharData('人');
      const loadPromise2 = manager.loadCharData('他');
      expect(loadPromise1).not.toBe(loadPromise2);

      let hasPromise1Resolved = false;
      loadPromise1.then(() => {
        hasPromise1Resolved = true;
      });

      onCompleteFns[0].call(null, ren);
      onCompleteFns[1].call(null, ta);

      const data = await loadPromise2;

      // Superseded operations settle without data or stale callbacks.
      await expect(loadPromise1).resolves.toBeUndefined();
      expect(hasPromise1Resolved).toBe(true);

      expect(data).toBe(ta);
      expect(onLoadCharDataSuccess.mock.calls.length).toBe(1);
      expect(onLoadCharDataSuccess.mock.calls[0][0]).toBe(ta);
      expect(manager.loadingFailed).toBe(false);
    });
  });
});
