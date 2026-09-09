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
