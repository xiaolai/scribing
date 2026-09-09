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

describe('durations that cannot be run', () => {
  // strokeAnimationSpeed reaches characterActions as a divisor, so speed 0 produced
  // Infinity and a negative speed produced a negative duration. Progress then never
  // reached 1: the animation stalled and nothing ever settled its promise.
  it.each([
    ['an infinite duration', Infinity],
    ['a negative duration', -100],
    ['a NaN duration', NaN],
  ])('completes immediately given %s', async (_label, duration) => {
    const renderState = {
      state: { a: { b: 10 } },
      updateState: jest.fn(),
    };

    const mut = new Mutation('a.b', 20, { duration });
    let isResolved = false;
    mut.run(renderState).then(() => {
      isResolved = true;
    });

    await Promise.resolve();
    expect(isResolved).toBe(true);
    expect(renderState.updateState).toHaveBeenCalledWith({ a: { b: 20 } });
  });
});

describe('reuse across runs', () => {
  const makeRenderState = () => ({
    state: { a: { b: 10 } },
    updateState: jest.fn(),
  });

  it('does not carry pause time from one run into the next', async () => {
    // A looping chain reruns the same objects. _pausedDuration was never cleared, so
    // the second pass subtracted the first pass's pause and started below zero.
    const renderState = makeRenderState();
    const mut = new Mutation('a.b', 20, { duration: 50 });

    const first = mut.run(renderState);
    clock.tick(10);
    mut.pause();
    clock.tick(500);
    mut.resume();
    clock.tick(100);
    await first;
    expect(mut._pausedDuration).toBeGreaterThan(0);

    renderState.state = { a: { b: 10 } };
    renderState.updateState.mockClear();
    const second = mut.run(renderState);
    clock.tick(60);
    await second;

    // Without the reset the tween needed the banked pause time on top of its duration,
    // and every earlier frame reported progress below its starting value.
    renderState.updateState.mock.calls.forEach((call) => {
      expect(call[0].a.b).toBeGreaterThanOrEqual(10);
    });
    expect(renderState.updateState).toHaveBeenLastCalledWith({ a: { b: 20 } });
  });

  it('exposes the running promise the interface advertises', async () => {
    const renderState = makeRenderState();
    const mut = new Mutation('a.b', 20, { duration: 50 });
    const running = mut.run(renderState);
    expect(mut._runningPromise).toBe(running);
    clock.tick(60);
    await running;
  });

  it('ignores a pause aimed at a mutation that already finished', async () => {
    // RenderState pauses whichever mutation a chain is sitting on, and the chain index
    // only advances a microtask later, so the target can be one that has settled.
    const renderState = makeRenderState();
    const mut = new Mutation('a.b', 20, { duration: 50 });
    const running = mut.run(renderState);
    clock.tick(60);
    await running;

    mut.pause();
    expect(mut._startPauseTime).toBeNull();
  });
});

describe('a renderer that throws mid-tween', () => {
  it('rejects instead of leaving the mutation unsettled', async () => {
    const failure = new Error('renderer exploded');
    const renderState = {
      state: { a: { b: 10 } },
      updateState: jest.fn(() => {
        throw failure;
      }),
    };

    const mut = new Mutation('a.b', 20, { duration: 50 });
    const running = mut.run(renderState);
    clock.tick(10);

    await expect(running).rejects.toBe(failure);
    expect(mut._frameHandle).toBeUndefined();
  });
});

describe('a numeric target with no numeric start', () => {
  it('snaps rather than writing an object into the leaf', async () => {
    // This is how radicalColor comes back from null: the recursion branch iterated a
    // number, produced {}, and wrote it into every colour channel.
    const renderState = {
      state: { color: null as null | { r: number } },
      updateState(changes: any) {
        Object.assign(renderState.state, changes);
      },
    };

    const mut = new Mutation('color', { r: 200 }, { duration: 100 });
    const running = mut.run(renderState as any);
    clock.tick(20);
    expect(typeof renderState.state.color!.r).toBe('number');
    clock.tick(200);
    await running;
    expect(renderState.state.color!.r).toBe(200);
  });
});

describe('Mutation.Delay reuse', () => {
  it('waits the configured delay again after a paused run', async () => {
    // pause() used to subtract the elapsed time from _duration itself, so every later
    // iteration of a looping animation was short by however long it had been paused.
    const delay = new Mutation.Delay(1000);

    const first = delay.run();
    clock.tick(200);
    delay.pause();
    clock.tick(5000);
    delay.resume();
    clock.tick(800);
    await first;

    let secondResolved = false;
    delay.run().then(() => {
      secondResolved = true;
    });
    clock.tick(999);
    await Promise.resolve();
    expect(secondResolved).toBe(false);
    clock.tick(2);
    await Promise.resolve();
    expect(secondResolved).toBe(true);
  });

  it('ignores a pause before the delay has started', () => {
    const delay = new Mutation.Delay(1000);
    delay.pause();
    expect(delay._remaining).toBe(1000);
  });
});
