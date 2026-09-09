import Character from './models/Character';
import { GenericMutation } from './Mutation';
import {
  ColorObject,
  OnCompleteFunction,
  Point,
  RecursivePartial,
} from './typings/types';
import { copyAndMergeDeep, colorStringToVals, noop } from './utils';

export type StrokeRenderState = {
  opacity: number;
  displayPortion: number;
};

export type CharacterRenderState = {
  opacity: number;
  strokes: Record<number | string, StrokeRenderState>;
};

export type RenderStateObject = {
  options: {
    drawingFadeDuration: number;
    drawingWidth: number;
    drawingColor: ColorObject;
    strokeColor: ColorObject;
    outlineColor: ColorObject;
    radicalColor: ColorObject;
    highlightColor: ColorObject;
  };
  character: {
    main: CharacterRenderState;
    outline: CharacterRenderState;
    highlight: CharacterRenderState;
  };
  userStrokes: Record<
    string,
    | {
        points: Point[];
        opacity: number;
      }
    | undefined
  > | null;
};

export type CharacterName = keyof RenderStateObject['character'];

type OnStateChangeCallback = (
  nextState: RenderStateObject,
  currentState: RenderStateObject,
) => void;

type MutationChain = {
  _isActive: boolean;
  _index: number;
  _resolve: OnCompleteFunction;
  _mutations: GenericMutation[];
  _loop: boolean | undefined;
  _scopes: string[];
};

export type RenderStateOptions = {
  strokeColor: string;
  radicalColor: string | null;
  highlightColor: string;
  outlineColor: string;
  drawingColor: string;
  drawingFadeDuration: number;
  drawingWidth: number;
  outlineWidth: number;
  showCharacter: boolean;
  showOutline: boolean;
};

export default class RenderState {
  _mutationChains: MutationChain[] = [];
  _onStateChange: OnStateChangeCallback;

  state: RenderStateObject;

  constructor(
    character: Character,
    options: RenderStateOptions,
    onStateChange: OnStateChangeCallback = noop,
  ) {
    this._onStateChange = onStateChange;

    this.state = {
      options: {
        drawingFadeDuration: options.drawingFadeDuration,
        drawingWidth: options.drawingWidth,
        drawingColor: colorStringToVals(options.drawingColor),
        strokeColor: colorStringToVals(options.strokeColor),
        outlineColor: colorStringToVals(options.outlineColor),
        radicalColor: colorStringToVals(options.radicalColor || options.strokeColor),
        highlightColor: colorStringToVals(options.highlightColor),
      },
      character: {
        main: {
          opacity: options.showCharacter ? 1 : 0,
          strokes: {},
        },
        outline: {
          opacity: options.showOutline ? 1 : 0,
          strokes: {},
        },
        highlight: {
          opacity: 1,
          strokes: {},
        },
      },
      userStrokes: null,
    };

    for (let i = 0; i < character.strokes.length; i++) {
      this.state.character.main.strokes[i] = {
        opacity: 1,
        displayPortion: 1,
      };

      this.state.character.outline.strokes[i] = {
        opacity: 1,
        displayPortion: 1,
      };

      this.state.character.highlight.strokes[i] = {
        opacity: 0,
        displayPortion: 1,
      };
    }
  }

  overwriteOnStateChange(onStateChange: OnStateChangeCallback) {
    this._onStateChange = onStateChange;
  }

  updateState(stateChanges: RecursivePartial<RenderStateObject>) {
    const nextState = copyAndMergeDeep(this.state, stateChanges);
    this._onStateChange(nextState, this.state);
    this.state = nextState;
  }

  run(
    mutations: GenericMutation[],
    options: {
      loop?: boolean;
    } = {},
  ) {
    const scopes = mutations.map((mut) => mut.scope);

    this.cancelMutations(scopes);

    return new Promise((resolve: OnCompleteFunction) => {
      const mutationChain: MutationChain = {
        _isActive: true,
        _index: 0,
        _resolve: resolve,
        _mutations: mutations,
        _loop: options.loop,
        _scopes: scopes,
      };
      this._mutationChains.push(mutationChain);
      this._run(mutationChain);
    });
  }

  _run(mutationChain: MutationChain) {
    if (!mutationChain._isActive) {
      return;
    }

    const mutations = mutationChain._mutations;
    // An empty chain has nothing to loop over. Without this, `_loop` reset the index
    // to 0 and then dereferenced a mutation that does not exist.
    if (mutations.length === 0) {
      mutationChain._isActive = false;
      this._mutationChains = this._mutationChains.filter(
        (chain) => chain !== mutationChain,
      );
      mutationChain._resolve({ canceled: false });
      return;
    }
    if (mutationChain._index >= mutations.length) {
      if (mutationChain._loop) {
        mutationChain._index = 0;
      } else {
        mutationChain._isActive = false;
        this._mutationChains = this._mutationChains.filter(
          (chain) => chain !== mutationChain,
        );
        // The chain is done - resolve the promise to signal it finished successfully
        mutationChain._resolve({ canceled: false });
        return;
      }
    }

    const activeMutation = mutationChain._mutations[mutationChain._index];

    activeMutation.run(this).then(() => {
      if (mutationChain._isActive) {
        mutationChain._index++;
        this._run(mutationChain);
      }
    });
  }

  _getActiveMutations() {
    return this._mutationChains.map((chain) => chain._mutations[chain._index]);
  }

  pauseAll() {
    this._getActiveMutations().forEach((mutation) => mutation.pause());
  }

  resumeAll() {
    this._getActiveMutations().forEach((mutation) => mutation.resume());
  }

  /**
   * True when two scope paths name the same node or one contains the other.
   *
   * A bare `startsWith` treats `strokes.1` as a prefix of `strokes.10`, so starting an
   * animation on stroke 1 cancelled stroke 10, 11 and every other sibling whose index
   * happens to begin with the same digits. Containment has to end on a path separator.
   * The empty scope matches everything, which is how cancelAll works.
   */
  private static scopesOverlap(a: string, b: string) {
    if (a === b || a === '' || b === '') return true;
    const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
    return longer.startsWith(`${shorter}.`);
  }

  cancelMutations(scopesToCancel: string[]) {
    // Snapshot first: _cancelMutationChain rewrites _mutationChains, and cancelling
    // the same chain once per matching scope pair re-applied its forced mutations and
    // re-rendered for every match.
    for (const chain of [...this._mutationChains]) {
      const overlaps = chain._scopes.some((chainId) =>
        scopesToCancel.some((scope) => RenderState.scopesOverlap(chainId, scope)),
      );
      if (overlaps) this._cancelMutationChain(chain);
    }
  }

  cancelAll() {
    this.cancelMutations(['']);
  }

  _cancelMutationChain(mutationChain: MutationChain) {
    mutationChain._isActive = false;
    for (let i = mutationChain._index; i < mutationChain._mutations.length; i++) {
      mutationChain._mutations[i].cancel(this);
    }

    mutationChain._resolve?.({ canceled: true });

    this._mutationChains = this._mutationChains.filter(
      (chain) => chain !== mutationChain,
    );
  }
}
