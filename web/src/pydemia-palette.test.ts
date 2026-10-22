import { describe, expect, it } from "vitest";
import { pydemiaGlassColors } from "./pydemia-palette";

function luminance(hex: string | undefined): number {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Expected an sRGB color");
    const channels = [1, 3, 5].map(start => {
        const value = parseInt(hex.slice(start, start + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
}

describe("pydemia palette legibility", () => {
    it.each(["light", "dark"] as const)("keeps %s text and controls legible", appearance => {
        const colors = pydemiaGlassColors[appearance];
        for (const [foreground, background] of [
            ["--foreground", "--background"], ["--foreground", "--surface"],
            ["--muted", "--surface"], ["--accent", "--surface"],
            ["--accent-foreground", "--accent"], ["--danger", "--surface"],
        ] as const) {
            const values = [luminance(colors[foreground]), luminance(colors[background])];
            const ratio = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
            expect(ratio, `${appearance}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
        }
    });
});
