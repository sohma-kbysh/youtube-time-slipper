/**
 * Logging.
 *
 * `debug` compiles away in production builds (esbuild replaces `__DEV__` with
 * `false` and drops the branch), so a release build does not spam the console
 * of every YouTube page. Warnings and errors are always emitted — if the
 * resolver is failing, the user deserves to be able to see why.
 */

declare const __DEV__: boolean;

const PREFIX = "[TimeSlipper]";

/** `false` in release builds; the constant is inlined at build time. */
const isDev = typeof __DEV__ === "boolean" ? __DEV__ : false;

export function debug(...args: unknown[]): void {
  if (!isDev) return;
  console.debug(PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}

export const log = { debug, warn, error };
