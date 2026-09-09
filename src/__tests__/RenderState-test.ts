import ren from 'hanzi-writer-data/人.json';
import Mutation from '../Mutation';
import RenderState from '../RenderState';
import parseCharData from '../parseCharData';

const char = parseCharData('人', ren);
const opts = {
  strokeColor: '#555',
  radicalColor: '#123',
  highlightColor: '#AAF',
  outlineColor: '#DDD',
  drawingColor: '#333',
  drawingFadeDuration: 300,
  drawingWidth: 4,
  outlineWidth: 2,
  showCharacter: true,
  showOutline: false,
};

describe('RenderState', () => {
  it('sets up state based on options and character', () => {
    const renderState = new RenderState(char, opts);

    expect(renderState.state).toEqual({
      options: {
        drawingFadeDuration: 300,
        drawingWidth: 4,
        drawingColor: { r: 51, g: 51, b: 51, a: 1 },
        strokeColor: { r: 85, g: 85, b: 85, a: 1 },
        radicalColor: { r: 17, g: 34, b: 51, a: 1 },
        highlightColor: { r: 170, g: 170, b: 255, a: 1 },
        outlineColor: { r: 221, g: 221, b: 221, a: 1 },
      },
      character: {
        main: {
          opacity: 1,
          strokes: {
            0: {
              displayPortion: 1,
              opacity: 1,
            },
            1: {
              displayPortion: 1,
              opacity: 1,
            },
          },
        },
        outline: {
          opacity: 0,
          strokes: {
            0: {
              displayPortion: 1,
              opacity: 1,
            },
            1: {
              displayPortion: 1,
              opacity: 1,
            },
          },
        },
        highlight: {
          opacity: 1,
          strokes: {
            0: {
              displayPortion: 1,
              opacity: 0,
            },
            1: {
              displayPortion: 1,
              opacity: 0,
            },
          },
        },
      },
      userStrokes: null,
    });
  });

  describe('run', () => {
    it('returns a promise which resolves when all mutations are complete', async () => {
      const updateState = jest.fn();
      const renderState = new RenderState(char, opts, updateState);

      let isResolved = false;
      let resolvedVal;

      renderState
        .run([
          new Mutation('character.main.opacity', 0.3),
          new Mutation('character.main.opacity', 0.9, { duration: 50 }),
          new Mutation.Delay(100),
          new Mutation('character.main.opacity', 0, { duration: 50 }),
        ])
        .then((result) => {
          isResolved = true;
          resolvedVal = result;
        });

      // allow instant mutation to finish
      await Promise.resolve();
      expect(updateState).toHaveBeenCalledTimes(1);
      expect(isResolved).toBe(false);
      expect(renderState.state.character.main.opacity).toBe(0.3);

      // allow opacity: 1 mutation to finish
      // need to allow an await since the next mutation will start on the next clock cycle
      clock.tick(80);
      await Promise.resolve();
      expect(isResolved).toBe(false);
      expect(renderState.state.character.main.opacity).toBe(0.9);

      // allow pause to finish
      // need to allow an await since the next mutation will start on the next clock cycle
      clock.tick(101);
      await Promise.resolve();
      expect(isResolved).toBe(false);
      expect(renderState.state.character.main.opacity).toBe(0.9);

      // allow last mutation to finish
      // need to allow an await since the next mutation will start on the next clock cycle
      clock.tick(80);
      await Promise.resolve();
      expect(renderState.state.character.main.opacity).toBe(0);
      // allow another tick for the state to realized all mutations are done
      await Promise.resolve();
      expect(isResolved).toBe(true);
      expect(resolvedVal).toEqual({ canceled: false });
    });

    it('resolves its promise with canceled: true if mutations are canceled before completion', async () => {
      const updateState = jest.fn();
      const renderState = new RenderState(char, opts, updateState);

      let isResolved = false;
      let resolvedVal;

      renderState
        .run([
          new Mutation('character.main.opacity', 0.3),
          new Mutation('character.main.opacity', 0.9, { duration: 50 }),
          new Mutation.Delay(100),
          new Mutation('character.main.opacity', 0, { duration: 50 }),
        ])
        .then((result) => {
          isResolved = true;
          resolvedVal = result;
        });

      // allow instant mutation to finish
      await Promise.resolve();
      expect(updateState).toHaveBeenCalledTimes(1);
      expect(isResolved).toBe(false);
      expect(renderState.state.character.main.opacity).toBe(0.3);

      renderState.cancelMutations(['character']);

      await Promise.resolve();
      expect(renderState.state.character.main.opacity).toBe(0.3);
      expect(isResolved).toBe(true);
      expect(resolvedVal).toEqual({ canceled: true });
    });
  });
});

describe('scope cancellation boundaries', () => {
  // A bare startsWith treats "strokes.1" as a prefix of "strokes.10", so animating
  // stroke 1 cancelled stroke 10 and every sibling sharing those leading digits.
  const chain = (state: RenderState, scope: string) => {
    const mutation = {
      scope,
      _runningPromise: undefined,
      run: () => new Promise<void>(() => undefined),
      pause: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
    };
    return state.run([mutation]);
  };

  it('does not cancel a sibling whose index merely shares leading digits', async () => {
    const state = new RenderState(char, opts);
    const ten = chain(state, 'character.main.strokes.10');
    let tenSettled = false;
    void ten.then(() => {
      tenSettled = true;
    });

    chain(state, 'character.main.strokes.1');
    await Promise.resolve();
    expect(tenSettled).toBe(false);
  });

  it('still cancels an exact scope match', async () => {
    const state = new RenderState(char, opts);
    const first = chain(state, 'character.main.strokes.1');
    chain(state, 'character.main.strokes.1');
    await expect(first).resolves.toEqual({ canceled: true });
  });

  it('still cancels a genuine descendant', async () => {
    const state = new RenderState(char, opts);
    const child = chain(state, 'character.main.strokes.1');
    chain(state, 'character.main');
    await expect(child).resolves.toEqual({ canceled: true });
  });

  it('cancelAll still reaches every chain', async () => {
    const state = new RenderState(char, opts);
    const running = chain(state, 'character.main.strokes.7');
    state.cancelAll();
    await expect(running).resolves.toEqual({ canceled: true });
  });
});

describe('the radical colour default', () => {
  // Null means "radicals paint with strokeColor", and both stroke renderers already
  // read it that way. Resolving it to a copy of the initial strokeColor froze radicals
  // at that colour, so a later strokeColor change repainted everything except them.
  const unsetOpts = { ...opts, radicalColor: null };

  it('stays null when no radical colour is configured', () => {
    const renderState = new RenderState(char, unsetOpts);
    expect(renderState.state.options.radicalColor).toBeNull();
  });

  it('leaves radicals following strokeColor after strokeColor changes', () => {
    const renderState = new RenderState(char, unsetOpts);
    renderState.updateState({ options: { strokeColor: { r: 1, g: 2, b: 3, a: 1 } } });
    expect(renderState.state.options.radicalColor).toBeNull();
    expect(renderState.state.options.strokeColor).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  });
});

describe('pausing between mutations', () => {
  // The chain index advances in a microtask, so pauseAll can land on a mutation that
  // has already settled. The pause was a no-op and the next mutation ran anyway.
  it('keeps the next mutation paused', async () => {
    const renderState = new RenderState(char, opts);
    renderState.run([
      new Mutation('character.main.opacity', 0.3),
      new Mutation('character.main.opacity', 0.9, { duration: 50 }),
    ]);

    // Pause in the window where the first, instantaneous mutation is still the
    // chain's active one.
    renderState.pauseAll();

    await Promise.resolve();
    clock.tick(500);
    await Promise.resolve();
    expect(renderState.state.character.main.opacity).toBe(0.3);

    renderState.resumeAll();
    clock.tick(60);
    await Promise.resolve();
    expect(renderState.state.character.main.opacity).toBe(0.9);
  });
});

describe('a mutation that throws', () => {
  const throwing = (scope: string, error: Error) => ({
    scope,
    _runningPromise: undefined,
    run: () => {
      throw error;
    },
    pause: () => undefined,
    resume: () => undefined,
    cancel: () => undefined,
  });

  it('rejects the chain promise instead of leaving it pending', async () => {
    const renderState = new RenderState(char, opts);
    const failure = new Error('renderer exploded');
    await expect(renderState.run([throwing('character.main', failure)])).rejects.toBe(
      failure,
    );
  });

  it('drops the chain so later cancellation does not resurrect it', async () => {
    const renderState = new RenderState(char, opts);
    const failure = new Error('renderer exploded');
    await expect(
      renderState.run([
        new Mutation('character.main.opacity', 0.3),
        throwing('character.main', failure),
      ]),
    ).rejects.toBe(failure);
    expect(renderState._mutationChains).toHaveLength(0);
  });

  it('rejects when the failure happens mid-tween rather than at start', async () => {
    const renderState = new RenderState(char, opts);
    const failure = new Error('renderer exploded');
    renderState.overwriteOnStateChange(() => {
      throw failure;
    });
    const running = renderState.run([
      new Mutation('character.main.opacity', 0, { duration: 50 }),
    ]);
    clock.tick(10);
    await expect(running).rejects.toBe(failure);
    expect(renderState._mutationChains).toHaveLength(0);
  });
});

describe('removeUserStroke', () => {
  // updateState merges, so the old null write left the key in every later state copy
  // and both renderers walked it on every frame for the rest of the session.
  it('deletes the entry rather than blanking it', () => {
    const renderState = new RenderState(char, opts);
    renderState.updateState({ userStrokes: { 7: { points: [], opacity: 1 } } });
    expect('7' in renderState.state.userStrokes!).toBe(true);

    renderState.removeUserStroke(7);
    expect('7' in renderState.state.userStrokes!).toBe(false);
  });

  it('notifies the renderer with the pruned state', () => {
    const onStateChange = jest.fn();
    const renderState = new RenderState(char, opts);
    renderState.updateState({ userStrokes: { 7: { points: [], opacity: 1 } } });
    renderState.overwriteOnStateChange(onStateChange);

    renderState.removeUserStroke(7);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect('7' in onStateChange.mock.calls[0][0].userStrokes).toBe(false);
  });

  it('does nothing for an id that is not present', () => {
    const onStateChange = jest.fn();
    const renderState = new RenderState(char, opts, onStateChange);
    renderState.removeUserStroke(7);
    expect(onStateChange).not.toHaveBeenCalled();
  });
});
