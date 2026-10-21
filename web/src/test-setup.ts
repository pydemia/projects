import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

if (typeof ResizeObserver === "undefined") {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
        observe() { /* jsdom has no layout measurements. */ }
        unobserve() { /* jsdom has no layout measurements. */ }
        disconnect() { /* jsdom has no layout measurements. */ }
    } });
}

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
});

if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
}
