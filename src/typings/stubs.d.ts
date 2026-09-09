/** Ambient declarations for test-only globals and mock extensions. Not shipped. */

/** Auto-advancing fake clock installed by jest-setup.js. */
declare const clock: {
  tick(ms: number): void;
  uninstall(): void;
};

/** JSDOM instance exposed by jest-jsdom-env.js, for `jsdom.reconfigure({ url })`. */
declare const jsdom: {
  reconfigure(settings: { url?: string; windowTop?: unknown }): void;
};

interface CanvasRenderingContext2D {
  /** Recorded draw calls, added by jest-canvas-mock. Absent in real browsers. */
  __getEvents(): Array<{ type: string; props: Record<string, unknown> }>;
  __getDrawCalls(): Array<{ type: string; props: Record<string, unknown> }>;
  __getPath(): Array<{ type: string; props: Record<string, unknown> }>;
  __clearEvents(): void;
  __clearDrawCalls(): void;
}
