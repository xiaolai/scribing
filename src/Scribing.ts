import FontWriter from './fonts/FontWriter';
import { FontWriterOptions } from './fonts/types';
import RenderState, { CharacterName } from './RenderState';
import parseCharData from './parseCharData';
import Positioner from './Positioner';
import Quiz from './Quiz';
import Stroke from './models/Stroke';
import UnitQuiz from './units/UnitQuiz';
import compileUnit from './units/compileUnit';
import validateUnit from './units/validateUnit';
import createDataProvider from './units/provider';
import {
  WritingUnit,
  WritingDataPack,
  UnitRequest,
  UnitQuizOptions,
} from './units/types';
import svgRenderer from './renderers/svg';
import canvasRenderer from './renderers/canvas';
import defaultOptions from './defaultOptions';
import LoadingManager from './LoadingManager';
import * as characterActions from './characterActions';
import { trim, colorStringToVals, selectIndex, fixIndex } from './utils';
import Character from './models/Character';
import {
  AnyScribingRenderer,
  ScribingRendererConstructor,
} from './renderers/ScribingRendererBase';
import RenderTargetBase from './renderers/RenderTargetBase';
import { GenericMutation } from './Mutation';

// Typings
import {
  ColorOptions,
  DimensionOptions,
  ScribingOptions,
  LoadingManagerOptions,
  OnCompleteFunction,
  ParsedScribingOptions,
  QuizOptions,
  RenderTargetInitFunction,
} from './typings/types';

// Export type interfaces
export * from './typings/types';
export * from './units/types';
export * from './fonts/types';
export type { default as FontWriter } from './fonts/FontWriter';

type VisibilityOptions = {
  onComplete?: OnCompleteFunction;
  duration?: number;
};

/** Colours whose option may be null, meaning "fall back to another colour". */
const NULLABLE_COLORS: ReadonlySet<keyof ColorOptions> = new Set([
  'radicalColor',
  'highlightCompleteColor',
]);

export default class Scribing {
  _options: ParsedScribingOptions;
  _destroyed = false;
  _characterGeneration = 0;
  _loadingManager: LoadingManager;
  /** Only set when calling .setCharacter() */
  _char: string | undefined;
  /** Only set when calling .setCharacter() */
  _renderState: RenderState | undefined;
  /** Only set when calling .setCharacter() */
  _character: Character | undefined;
  /** Only set when calling .setCharacter() */
  _positioner: Positioner | undefined;
  /** Only set when calling .setCharacter() */
  _scribingRenderer: AnyScribingRenderer | null | undefined;
  /** Only set when calling .setCharacter() */
  _withDataPromise: Promise<void> | undefined;

  _quiz: Quiz | undefined;
  _unitQuiz: UnitQuiz | undefined;
  _quizGeneration = 0;
  _dataMode: 'character' | 'unit' | undefined;
  _unitLoadError: Error | undefined;
  _unitAbort: AbortController | undefined;
  _renderer: {
    ScribingRenderer: ScribingRendererConstructor;
    createRenderTarget: RenderTargetInitFunction<any>;
  };

  target: RenderTargetBase;

  /** Main entry point */
  static create(
    element: string | HTMLElement,
    character: string,
    options?: Partial<ScribingOptions>,
  ) {
    const writer = new Scribing(element, options);
    writer.setCharacter(character);

    return writer;
  }

  static createFontWriter(element: string | HTMLElement, options: FontWriterOptions) {
    return new FontWriter(element, options);
  }

  static createDataProvider(pack: WritingDataPack) {
    return createDataProvider(pack);
  }

  static loadCharacterData(
    character: string,
    options: Partial<LoadingManagerOptions> = {},
  ) {
    // Static requests are independent consumers, not successive updates to a writer,
    // so each call gets its own manager and none is retained after it settles.
    return new LoadingManager({ ...defaultOptions, ...options }).loadCharData(character);
  }

  static getScalingTransform(width: number, height: number, padding = 0) {
    const positioner = new Positioner({ width, height, padding });
    return {
      x: positioner.xOffset,
      y: positioner.yOffset,
      scale: positioner.scale,
      transform: trim(`
        translate(${positioner.xOffset}, ${positioner.height - positioner.yOffset})
        scale(${positioner.scale}, ${-1 * positioner.scale})
      `).replace(/\s+/g, ' '),
    };
  }

  constructor(element: string | HTMLElement, options: Partial<ScribingOptions> = {}) {
    const { ScribingRenderer, createRenderTarget } =
      options.renderer === 'canvas' ? canvasRenderer : svgRenderer;
    const rendererOverride = options.rendererOverride || {};

    this._renderer = {
      ScribingRenderer: rendererOverride.ScribingRenderer || ScribingRenderer,
      createRenderTarget: rendererOverride.createRenderTarget || createRenderTarget,
    };
    // wechat miniprogram component needs direct access to the render target, so this is public
    this.target = this._renderer.createRenderTarget(
      element,
      options.width,
      options.height,
    );
    this._options = this._assignOptions(options);
    this._loadingManager = new LoadingManager(this._options);
    this._setupListeners();
  }

  /**
   * Fade one character layer in or out.
   *
   * The four public visibility methods differ only in the layer they touch and the
   * action they run; everything else — the default duration, waiting for data, and
   * forwarding the result to onComplete — was written out four times.
   */
  private _setLayerVisibility(
    charName: CharacterName,
    action: (
      charName: CharacterName,
      character: Character,
      duration: number,
    ) => GenericMutation[],
    options: VisibilityOptions,
  ) {
    const duration =
      typeof options.duration === 'number'
        ? options.duration
        : this._options.strokeFadeDuration;
    return this._withData(() =>
      this._renderState?.run(action(charName, this._character!, duration)).then((res) => {
        options.onComplete?.(res);
        return res;
      }),
    );
  }

  showCharacter(options: VisibilityOptions = {}) {
    this._options.showCharacter = true;
    return this._setLayerVisibility('main', characterActions.showCharacter, options);
  }

  hideCharacter(options: VisibilityOptions = {}) {
    this._options.showCharacter = false;
    return this._setLayerVisibility('main', characterActions.hideCharacter, options);
  }

  animateCharacter(
    options: {
      onComplete?: OnCompleteFunction;
      planId?: string;
    } = {},
  ) {
    this.cancelQuiz();

    return this._withData(() =>
      this._renderState
        ?.run(
          characterActions.animateCharacter(
            'main',
            this._character!,
            this._options.strokeFadeDuration,
            this._options.strokeAnimationSpeed,
            this._options.delayBetweenStrokes,
            options.planId,
          ),
        )
        .then((res) => {
          options.onComplete?.(res);
          return res;
        }),
    );
  }

  animateStroke(
    strokeNum: number,
    options: {
      onComplete?: OnCompleteFunction;
    } = {},
  ) {
    this.cancelQuiz();
    return this._withData(() =>
      this._renderState
        ?.run(
          characterActions.animateSingleStroke(
            'main',
            this._character!,
            fixIndex(strokeNum, this._character!.strokes.length),
            this._options.strokeAnimationSpeed,
          ),
        )
        .then((res) => {
          options.onComplete?.(res);
          return res;
        }),
    );
  }

  highlightStroke(
    strokeNum: number,
    options: {
      onComplete?: OnCompleteFunction;
    } = {},
  ) {
    const promise = () => {
      if (!this._character || !this._renderState) {
        return;
      }

      return this._renderState
        .run(
          characterActions.highlightStroke(
            selectIndex(this._character.strokes, strokeNum),
            colorStringToVals(this._options.highlightColor),
            this._options.strokeHighlightSpeed,
          ),
        )
        .then((res) => {
          options.onComplete?.(res);
          return res;
        });
    };

    return this._withData(promise);
  }

  async loopCharacterAnimation(options: { planId?: string } = {}) {
    this.cancelQuiz();
    return this._withData(() =>
      this._renderState!.run(
        characterActions.animateCharacterLoop(
          'main',
          this._character!,
          this._options.strokeFadeDuration,
          this._options.strokeAnimationSpeed,
          this._options.delayBetweenStrokes,
          this._options.delayBetweenLoops,
          options.planId,
        ),
        { loop: true },
      ),
    );
  }

  pauseAnimation() {
    return this._withData(() => this._renderState?.pauseAll());
  }

  resumeAnimation() {
    return this._withData(() => this._renderState?.resumeAll());
  }

  showOutline(options: VisibilityOptions = {}) {
    this._options.showOutline = true;
    return this._setLayerVisibility('outline', characterActions.showCharacter, options);
  }

  hideOutline(options: VisibilityOptions = {}) {
    this._options.showOutline = false;
    return this._setLayerVisibility('outline', characterActions.hideCharacter, options);
  }

  /** Updates the size of the writer instance without resetting render state */
  updateDimensions({ width, height, padding }: Partial<DimensionOptions>) {
    this._assertNotDestroyed();
    if (this._dataMode === 'unit') {
      this._validateUnitDimensions({
        width: width === undefined ? this._options.width : width,
        height: height === undefined ? this._options.height : height,
        padding: padding === undefined ? this._options.padding : padding,
      });
    }
    if (width !== undefined) this._options.width = width;
    if (height !== undefined) this._options.height = height;
    if (padding !== undefined) this._options.padding = padding;
    this.target.updateDimensions(this._options.width, this._options.height);
    // if there's already a character drawn, destroy and recreate the renderer in the same state
    if (
      this._character &&
      this._renderState &&
      this._scribingRenderer &&
      this._positioner
    ) {
      this._scribingRenderer.destroy();
      const scribingRenderer = this._initAndMountScribingRenderer(this._character);
      // TODO: this should probably implement EventEmitter instead of manually tracking updates like this
      this._renderState.overwriteOnStateChange((nextState) =>
        scribingRenderer.render(nextState),
      );
      scribingRenderer.render(this._renderState.state);
      this._unitQuiz?.setPositioner(this._positioner);
      // update the current quiz as well, if one is active
      if (this._quiz) {
        this._quiz.setPositioner(this._positioner);
      }
    }
  }

  updateColor(
    colorName: keyof ColorOptions,
    colorVal: string | null,
    options: {
      duration?: number;
      onComplete?: OnCompleteFunction;
    } = {},
  ) {
    if (colorVal === null && !NULLABLE_COLORS.has(colorName)) {
      // The old code handed the null straight to colorStringToVals, which failed with
      // "Cannot read properties of null (reading 'toUpperCase')".
      throw new Error(`Color "${colorName}" cannot be null.`);
    }
    // Validate before recording, so a rejected value leaves the option untouched.
    const mappedColor = colorVal === null ? null : colorStringToVals(colorVal);
    const previousRadicalColor = this._options.radicalColor;
    const { strokeColor } = this._options;
    const duration = options.duration ?? this._options.strokeFadeDuration;

    this._options[colorName] = colorVal as any;

    if (colorName === 'highlightCompleteColor') {
      // This one has no render-state channel: the quiz reads the option directly when
      // it builds the completion highlight, and falls back to highlightColor when it is
      // null. Tweening it only wrote a key that nothing renders.
      return this._withData(() => {
        const res = { canceled: false };
        options.onComplete?.(res);
        return res;
      });
    }

    const mutations: GenericMutation[] = [];

    // Radicals paint with strokeColor while radicalColor is null, so a tween into a
    // radical colour has no numeric starting point and would snap to the target on the
    // first frame. Seeding the current strokeColor gives it one.
    if (colorName === 'radicalColor' && colorVal && !previousRadicalColor) {
      mutations.push(
        ...characterActions.updateColor(colorName, colorStringToVals(strokeColor), 0),
      );
    }

    // If we're removing radical color, tween it to the stroke color
    const target =
      colorName === 'radicalColor' && !colorVal
        ? colorStringToVals(strokeColor)
        : mappedColor;

    mutations.push(...characterActions.updateColor(colorName, target, duration));

    // make sure to set radicalColor back to null after the transition finishes if val == null
    if (colorName === 'radicalColor' && !colorVal) {
      mutations.push(...characterActions.updateColor(colorName, null, 0));
    }

    return this._withData(() =>
      this._renderState?.run(mutations).then((res) => {
        options.onComplete?.(res);
        return res;
      }),
    );
  }

  quiz(quizOptions: Partial<QuizOptions> = {}) {
    if (this._dataMode === 'unit') throw new Error('Use quizUnit() for writing units.');
    this.cancelQuiz();
    const generation = this._quizGeneration;
    return this._withData(async () => {
      if (generation !== this._quizGeneration) return;
      if (this._character && this._renderState && this._positioner) {
        this._quiz = new Quiz(this._character, this._renderState, this._positioner);
        this._options = {
          ...this._options,
          ...quizOptions,
        };
        this._quiz.startQuiz(this._options);
      }
    });
  }

  quizUnit(options: UnitQuizOptions = {}) {
    if (this._dataMode !== 'unit') throw new Error('Call setUnit() before quizUnit().');
    this.cancelQuiz();
    const generation = this._quizGeneration;
    return this._withData(() => {
      if (generation !== this._quizGeneration) return undefined;
      if (this._character && this._renderState && this._positioner) {
        const quiz = new UnitQuiz(this._character, this._renderState, this._positioner);
        // Validate/start before exposing the session to pointer events.
        const result = quiz.startQuiz(this._options, options);
        this._unitQuiz = quiz;
        return result;
      }
      return undefined;
    });
  }

  skipQuizStroke() {
    if (this._dataMode === 'unit')
      throw new Error(
        'Skipping is not supported in unit quizzes. Restart with quizUnit().',
      );
    if (this._quiz) {
      this._quiz.nextStroke();
    }
  }

  cancelQuiz() {
    this._quizGeneration++;
    this._unitQuiz?.cancel();
    this._unitQuiz = undefined;
    if (this._quiz) {
      this._quiz.cancel();
      this._quiz = undefined;
    }
  }

  /** Clears the previous presentation before a new request, including failed requests. */
  _beginDataLoad(mode: 'character' | 'unit') {
    const generation = ++this._characterGeneration;
    const previous = this._unitAbort;
    this._unitAbort = undefined;
    this._dataMode = mode;
    this._unitLoadError = undefined;
    this._char = undefined;
    this.cancelQuiz();
    this._scribingRenderer?.destroy();
    this._renderState?.cancelAll();
    this._scribingRenderer = null;
    this._character = undefined;
    this._renderState = undefined;
    this._positioner = undefined;
    this._withDataPromise = undefined;
    this._loadingManager.cancel();
    // An external provider's abort handler may synchronously select another unit.
    previous?.abort();
    return generation;
  }

  _mountCharacter(character: Character) {
    this._character = character;
    this._renderState = new RenderState(character, this._options, (nextState) =>
      scribingRenderer.render(nextState),
    );
    const scribingRenderer = this._initAndMountScribingRenderer(character);
    scribingRenderer.render(this._renderState.state);
  }

  setCharacter(char: string) {
    this._assertNotDestroyed();
    const generation = this._beginDataLoad('character');
    if (this._destroyed || generation !== this._characterGeneration)
      return Promise.resolve();
    this._char = char;
    const pending = this._loadingManager.loadCharData(char).then((pathStrings) => {
      if (
        this._destroyed ||
        generation !== this._characterGeneration ||
        !pathStrings ||
        this._loadingManager.loadingFailed
      )
        return;
      this._mountCharacter(parseCharData(char, pathStrings));
    });
    if (generation === this._characterGeneration) this._withDataPromise = pending;
    return pending;
  }

  /** Selects an explicit writing model or loads one through a caller-owned provider. */
  setUnit(input: WritingUnit | UnitRequest): Promise<void> {
    const pending = this._setUnit(input);
    // Consumers may fire-and-forget a selection that is later superseded.
    // Keep rejection observable to awaiters without emitting unhandled cancellation.
    pending.catch(() => undefined);
    return pending;
  }

  async _setUnit(input: WritingUnit | UnitRequest): Promise<void> {
    this._assertNotDestroyed();
    const generation = this._beginDataLoad('unit');
    if (this._destroyed || generation !== this._characterGeneration)
      throw new Error('Unit load superseded or canceled.');
    const controller = new AbortController();
    this._unitAbort = controller;
    const { signal } = controller;
    let abort!: () => void;
    const canceled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error('Unit load aborted or superseded.'));
      signal.addEventListener('abort', abort);
    });
    const data = new Promise<WritingUnit>((resolve, reject) => {
      try {
        this._validateUnitDimensions(this._options);
        if (input && typeof input === 'object' && 'provider' in input) {
          // Snapshot the selection synchronously, before calling an asynchronous provider.
          const provider = input.provider;
          const id = input.id;
          const variant = input.variant;
          if (
            !provider ||
            typeof provider.load !== 'function' ||
            typeof id !== 'string' ||
            !id.length ||
            (variant !== undefined && typeof variant !== 'string')
          )
            throw new Error('Invalid writing data provider request.');
          const request = { id: id.normalize('NFC'), variant: variant?.normalize('NFC') };
          Promise.resolve()
            .then(() => {
              if (signal.aborted) throw new Error('Unit load aborted.');
              return provider.load(request, { signal });
            })
            .then(resolve, reject);
        } else {
          validateUnit(input);
          resolve(JSON.parse(JSON.stringify(input)));
        }
      } catch (error) {
        reject(error);
      }
    });
    const pending = Promise.race([data, canceled])
      .then((unit) => {
        if (signal.aborted || this._destroyed || generation !== this._characterGeneration)
          throw new Error('Unit load canceled.');
        const compiled = compileUnit(unit);
        const strokes = compiled.strokes.map((stroke, index) => {
          const model = new Stroke('', stroke.points, index);
          model.unit = stroke;
          return model;
        });
        const character = new Character(compiled.data.text, strokes);
        character.unit = compiled;
        this._mountCharacter(character);
      })
      .then(
        () => {
          signal.removeEventListener('abort', abort);
          if (generation === this._characterGeneration) this._unitAbort = undefined;
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          if (generation === this._characterGeneration) {
            this._unitAbort = undefined;
            this._unitLoadError =
              error instanceof Error ? error : new Error(String(error));
          }
          throw error;
        },
      );
    this._withDataPromise = pending;
    return pending;
  }

  async getUnitData(): Promise<WritingUnit> {
    if (this._dataMode !== 'unit')
      throw new Error('Call setUnit() before getUnitData().');
    const unit = await this._withData(() => this._character?.unit?.data);
    if (!unit) throw new Error('Writing unit is unavailable or its load was canceled.');
    return JSON.parse(JSON.stringify(unit));
  }

  _validateUnitDimensions({ width, height, padding }: DimensionOptions) {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(padding) ||
      width <= 0 ||
      height <= 0 ||
      padding < 0 ||
      2 * padding >= Math.min(width, height)
    ) {
      throw new Error(
        'Unit dimensions must be positive and larger than twice the padding.',
      );
    }
  }

  /** Permanently releases this writer's animations, listeners, and generated DOM. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._characterGeneration++;
    this._loadingManager.cancel();
    this.cancelQuiz();
    this._renderState?.cancelAll();
    this._scribingRenderer?.destroy();
    this.target.destroy?.();
    const pending = this._unitAbort;
    this._unitAbort = undefined;
    this._scribingRenderer = null;
    this._renderState = undefined;
    this._character = undefined;
    this._positioner = undefined;
    pending?.abort();
  }

  _assertNotDestroyed() {
    if (this._destroyed) throw new Error('This Scribing instance has been destroyed.');
  }

  _initAndMountScribingRenderer(character: Character) {
    const { width, height, padding } = this._options;
    this._positioner = new Positioner({
      width,
      height,
      padding,
      bounds: character.unit?.bounds,
    });
    const scribingRenderer = new this._renderer.ScribingRenderer(
      character,
      this._positioner,
    );
    scribingRenderer.mount(this.target);
    this._scribingRenderer = scribingRenderer;
    return scribingRenderer;
  }

  async getCharacterData(): Promise<Character> {
    if (this._dataMode === 'unit')
      throw new Error('Use getUnitData() for writing units.');
    if (!this._char) {
      throw new Error('setCharacter() must be called before calling getCharacterData()');
    }
    const character = await this._withData(() => this._character);
    if (!character) {
      throw new Error(
        'Character data is unavailable because loading failed or the request was canceled.',
      );
    }
    return character;
  }

  _assignOptions(options: Partial<ScribingOptions>): ParsedScribingOptions {
    const mergedOptions = {
      ...defaultOptions,
      ...options,
    };

    // backfill strokeAnimationSpeed if deprecated strokeAnimationDuration is provided instead
    if (options.strokeAnimationDuration && !options.strokeAnimationSpeed) {
      mergedOptions.strokeAnimationSpeed = 500 / options.strokeAnimationDuration;
    }
    if (options.strokeHighlightDuration && !options.strokeHighlightSpeed) {
      mergedOptions.strokeHighlightSpeed = 500 / options.strokeHighlightDuration;
    }

    if (!options.highlightCompleteColor) {
      mergedOptions.highlightCompleteColor = mergedOptions.highlightColor;
    }

    return this._fillWidthAndHeight(mergedOptions);
  }

  /** returns a new options object with width and height filled in if missing */
  _fillWidthAndHeight(options: ScribingOptions): ParsedScribingOptions {
    const filledOpts = { ...options };
    if (filledOpts.width && !filledOpts.height) {
      filledOpts.height = filledOpts.width;
    } else if (filledOpts.height && !filledOpts.width) {
      filledOpts.width = filledOpts.height;
    } else if (!filledOpts.width && !filledOpts.height) {
      const { width, height } = this.target.getBoundingClientRect();
      const minDim = Math.min(width, height);
      filledOpts.width = minDim;
      filledOpts.height = minDim;
    }
    return filledOpts as ParsedScribingOptions;
  }

  _withData<T>(func: () => T) {
    this._assertNotDestroyed();
    const generation = this._characterGeneration;
    // if this._loadingManager.loadingFailed, then loading failed before this method was called
    if (this._dataMode === 'unit' && this._unitLoadError) throw this._unitLoadError;
    if (this._dataMode !== 'unit' && this._loadingManager.loadingFailed) {
      throw Error('Failed to load character data. Call setCharacter and try again.');
    }

    // A superseded or destroyed writer resolves with undefined rather than running
    // `func`; the return type is explicit so the empty path is not accidental. A load
    // that fails while this is waiting rejects instead: the rejection belongs to
    // whoever asked for the character, and swallowing it would report a silent success.
    if (this._withDataPromise) {
      return this._withDataPromise.then((): T | undefined => {
        if (
          !this._destroyed &&
          generation === this._characterGeneration &&
          (this._dataMode === 'unit'
            ? !this._unitLoadError
            : !this._loadingManager.loadingFailed)
        ) {
          return func();
        }
        return undefined;
      });
    }
    return Promise.resolve().then((): T | undefined => {
      if (!this._destroyed && generation === this._characterGeneration) return func();
      return undefined;
    });
  }

  _setupListeners() {
    this.target.addPointerStartListener((evt) => {
      const quiz = this._unitQuiz || this._quiz;
      if (quiz) {
        evt.preventDefault();
        quiz.startUserStroke(evt.getPoint());
      }
    });
    this.target.addPointerMoveListener((evt) => {
      const quiz = this._unitQuiz || this._quiz;
      if (quiz) {
        evt.preventDefault();
        quiz.continueUserStroke(evt.getPoint());
      }
    });
    this.target.addPointerCancelListener?.(() => {
      (this._unitQuiz || this._quiz)?.cancelUserStroke();
    });
    this.target.addPointerEndListener(() => {
      (this._unitQuiz || this._quiz)?.endUserStroke();
    });
  }
}
