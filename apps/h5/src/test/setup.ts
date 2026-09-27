import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

const play = vi.fn<() => Promise<void>>();
const pause = vi.fn<() => void>();
const load = vi.fn<() => void>();

Object.defineProperties(HTMLMediaElement.prototype, {
  play: { configurable: true, value: play },
  pause: { configurable: true, value: pause },
  load: { configurable: true, value: load },
});

beforeEach(() => {
  play.mockReset().mockResolvedValue(undefined);
  pause.mockReset();
  load.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
