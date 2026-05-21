import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/** jsdom does not provide ResizeObserver; GobanBoard uses it for responsive sizing. */
class ResizeObserverStub implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback(
      [{ target } as ResizeObserverEntry],
      this,
    );
  }

  disconnect(): void {
    /* no-op */
  }

  unobserve(): void {
    /* no-op */
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub;
}

afterEach(() => {
  cleanup();
});
