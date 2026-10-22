const { strict: assert } = require("node:assert");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const html = readFileSync(join(root, "dist", "index.html"), "utf8");
const links = [...html.matchAll(/<link\b[^>]*\brel="icon"[^>]*>/g)].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)]
        .map(([, key, value]) => [key, value])));
const asset = (name) => {
    const source = readFileSync(join(root, "public", name));
    const built = readFileSync(join(root, "dist", name));
    assert.deepEqual(built, source, `Built ${name} must match its versioned source asset.`);
    return built;
};
const icon = (type, suffix, media) => links.find(link =>
    link.type === type && link.href.endsWith(suffix) &&
    (media === undefined || link.media === media));

assert.equal(links.length, 4, "Production HTML must contain ICO, light/dark PNG and SVG icon links.");
const svgLink = icon("image/svg+xml", "/favicon.svg");
const icoLink = icon("image/x-icon", "/favicon.ico");
const lightLink = icon("image/png", "/favicon-light-32.png", "(prefers-color-scheme: light)");
const darkLink = icon("image/png", "/favicon-dark-32.png", "(prefers-color-scheme: dark)");
assert(svgLink && icoLink && lightLink && darkLink, "All favicon variants need correct links.");
assert.equal(lightLink.sizes, "32x32");
assert.equal(darkLink.sizes, "32x32");
const base = svgLink.href.slice(0, -"favicon.svg".length);
assert([icoLink, lightLink, darkLink].every(link => link.href.startsWith(base)),
    "Every icon must use the same base path.");
assert(base.startsWith("/") && !base.includes("%BASE_URL%"), "Vite must resolve the static base path.");

const svg = asset("favicon.svg");
const svgText = svg.toString("utf8");
assert.match(svgText, /^<svg\b[^>]*\bviewBox="[^"]+"/);
assert.match(svgText, /<path\b/);
assert(!/<(?:script|image|foreignObject)\b|\b(?:href|src)="https?:\/\//i.test(svgText),
    "The favicon must be self-contained SVG.");
const variants = new Map();
for (const scheme of ["light", "dark"]) {
    for (const size of [16, 24, 32, 48, 64]) {
        const name = `favicon-${scheme}-${size}.png`;
        const png = asset(name);
        assert(png.length > 100, `${name} must contain rendered pixels.`);
        assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(png.readUInt32BE(16), size);
        assert.equal(png.readUInt32BE(20), size);
        variants.set(`${scheme}-${size}`, png);
    }
}
assert.notDeepEqual(variants.get("light-32"), variants.get("dark-32"),
    "Light and dark fallback colors must differ.");
const ico = asset("favicon.ico");
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 5);
for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico.readUInt8(entry), size);
    assert.equal(ico.readUInt8(entry + 1), size);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.deepEqual(ico.subarray(offset, offset + length), variants.get(`light-${size}`));
}
console.log(`favicon: ${base}favicon.svg, sha256=${createHash("sha256").update(svg).digest("hex")}; 10 PNG sizes and ICO verified`);
