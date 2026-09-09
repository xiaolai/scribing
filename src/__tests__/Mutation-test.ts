import Mutation from '../Mutation';

describe('Mutation', () => {
  it('resolves immediately if there is no (or 0) duration passed', async () => {
    const renderState = {
      state: {},
      updateState: jest.fn(),
    };

    const mut = new Mutation('a.b', { c: 7 });
    let isResolved = false;

    mut.run(renderState).then(() => {
      isResolved = true;
    });

    expect(renderState.updateState).toHaveBeenCalledTimes(1);
    expect(renderState.updateState).toHaveBeenCalledWith({ a: { b: { c: 7 } } });

    await Promise.resolve();
    expect(isResolved).toBe(true);
  });

  it('resolves immediately if there are no changes with the current state', async () => {
    const renderState = {
      state: { a: { b: 7 } },
      updateState: jest.fn(),
    };

    const mut = new Mutation('a.b', 7, { duration: 20 });
    let isResolved = false;

    mut.run(renderState).then(() => {
      isResolved = true;
    });

    await Promise.resolve();
    expect(isResolved).toBe(true);
    expect(renderState.updateState).not.toHaveBeenCalled();
  });

  it('tweens to the target state over duration', async () => {
    const renderState = {
      state: { a: { b: 10 } },
      updateState: jest.fn(),
    };

    const mut = new Mutation('a.b', 20, { duration: 50 });
    let isResolved = false;

    mut.run(renderState).then(() => {
      isResolved = true;
    });

    await Promise.resolve();
    expect(isResolved).toBe(false);
    expect(renderState.updateState).not.toHaveBeenCalled();

    clock.tick(45);

    expect(isResolved).toBe(false);
    expect(renderState.updateState).toHaveBeenCalled();
    renderState.updateState.mock.calls.forEach((mockCall) => {
      expect(mockCall[0].a.b).toBeGreaterThan(10);
      expect(mockCall[0].a.b).toBeLessThan(20);
    });

    await Promise.resolve();
    expect(isResolved).toBe(false);

    clock.tick(25);
    expect(renderState.updateState).toHaveBeenLastCalledWith({ a: { b: 20 } });

    await Promise.resolve();
    expect(isResolved).toBe(true);
  });

  it('can pause and resume during the tween', async () => {
    const renderState = {
      state: { a: { b: 10 } },
      updateState: jest.fn(),
    };

    const mut = new Mutation('a.b', 20, { duration: 50 });
    let isResolved = false;

    mut.run(renderState).then(() => {
      isResolved = true;
    });

    await Promise.resolve();
    expect(isResolved).toBe(false);
    expect(renderState.updateState).not.toHaveBeenCalled();

    clock.tick(45);
    const partialTweenVals = renderState.updateState.mock.calls.map(
      (call) => call[0].a.b,
    );

    expect(isResolved).toBe(false);
    expect(renderState.updateState).toHaveBeenCalled();
    renderState.updateState.mock.calls.forEach((mockCall) => {
      expect(mockCall[0].a.b).toBeGreaterThan(10);
      expect(mockCall[0].a.b).toBeLessThan(20);
    });

    mut.pause();
    await Promise.resolve();

    clock.tick(1000);
    await Promise.resolve();

    expect(partialTweenVals.length).toBe(renderState.updateState.mock.calls.length);
    expect(isResolved).toBe(false);
    expect(renderState.updateState).toHaveBeenCalled();
    renderState.updateState.mock.calls.forEach((mockCall) => {
      expect(mockCall[0].a.b).toBeGreaterThan(10);
      expect(mockCall[0].a.b).toBeLessThan(20);
    });

    mut.resume();
    await Promise.resolve();

    clock.tick(25);
    expect(renderState.updateState).toHaveBeenLastCalledWith({ a: { b: 20 } });

    await Promise.resolve();
    expect(isResolved).toBe(true);
  });

  it('updates state on cancel if force: true', async () => {
    const renderState = {
      state: { a: { b: 7 } },
      updateState: jest.fn(),
    };

    const mut = new Mutation('a.b', 10, { force: true });

    mut.cancel(renderState);
    expect(renderState.updateState).toHaveBeenCalledTimes(1);
    expect(renderState.updateState).toHaveBeenLastCalledWith({ a: { b: 10 } });
  });

  it('does not update state on cancel if force: false', async () => {
    const renderState = {
      state: { a: { b: 7 } },
      updateState: jest.fn(),
    };

    const mut = new Mutation('a.b', 10);

    mut.cancel(renderState);
    expect(renderState.updateState).not.toHaveBeenCalled();
  });
});

describe('Mutation.Delay', () => {
  it('can pause and resume during the delay', async () => {
    const delay = new Mutation.Delay(1000);
    let isResolved = false;

    delay.run().then(() => {
      isResolved = true;
    });

    await Promise.resolve();
    expect(isResolved).toBe(false);

    clock.tick(200);
    await Promise.resolve();

    expect(isResolved).toBe(false);

    delay.pause();
    await Promise.resolve();

    clock.tick(2000);
    await Promise.resolve();

    expect(isResolved).toBe(false);

    delay.resume();
    await Promise.resolve();

    expect(isResolved).toBe(false);

    clock.tick(500);
    await Promise.resolve();

    expect(isResolved).toBe(false);

    clock.tick(500);
    await Promise.resolve();

    expect(isResolved).toBe(true);
  });
});

describe('numeric leaves of any sign', () => {
  // getPartialValues and isAlreadyAtEnd both detected a numeric leaf with
  // `endValue >= 0`, so a negative target took the object-recursion branch. Iterating
  // a number yields no keys, so the tween emitted {} instead of a number and the
  // mutation reported itself already finished. Both sites are fixed; both are pinned.
  const state = () => ({
    state: { offset: 10 },
    updateState(changes: any) {
      Object.assign(this.state, changes);
    },
  });

  it('interpolates towards a negative target rather than emitting an object', async () => {
    const renderState = state();
    const mutation = new Mutation('offset', -30, { duration: 100 });
    const running = mutation.run(renderState as any);
    clock.tick(50);
    expect(typeof renderState.state.offset).toBe('number');
    expect(renderState.state.offset).toBeLessThan(10);
    clock.tick(100);
    await running;
    expect(renderState.state.offset).toBe(-30);
  });

  it('does not report a negative target as already reached', async () => {
    const renderState = state();
    const mutation = new Mutation('offset', -1, { duration: 100 });
    const running = mutation.run(renderState as any);
    clock.tick(200);
    await running;
    expect(renderState.state.offset).toBe(-1);
  });
});
