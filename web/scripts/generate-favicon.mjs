// Render approved SVG geometry at browser favicon sizes. No new identity paths.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const publicDir = new URL("public/", root);
const source = await readFile(new URL("favicon.svg", publicDir));
const sizes = [16, 24, 32, 48, 64];
const edge = process.platform === "win32"
    ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    : undefined;
const browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}) });
const variants = new Map();
for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const size of sizes) {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<html><body style="margin:0"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${source.toString("base64")}"></body></html>`);
        await page.locator("img").evaluate(image => image.decode());
        const png = await page.screenshot({ omitBackground: true });
        variants.set(`${scheme}-${size}`, png);
        await writeFile(new URL(`favicon-${scheme}-${size}.png`, publicDir), png);
    }
    await context.close();
}
await browser.close();

// PNG-compressed ICO entries preserve the same small-size raster without palette loss.
const images = sizes.map(size => ({ size, data: variants.get(`light-${size}`) }));
const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    directory.writeUInt8(size, entry);
    directory.writeUInt8(size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
});
await writeFile(new URL("favicon.ico", publicDir), Buffer.concat([directory, ...images.map(image => image.data)]));
console.log(`Rendered ${images.length} light/dark sizes and ICO from ${join(root.pathname, "public/favicon.svg")}`);
