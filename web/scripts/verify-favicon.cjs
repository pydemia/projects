const { strict: assert } = require("node:assert");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const html = readFileSync(join(root, "dist", "index.html"), "utf8");
const match = html.match(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="([^"]+)"\s*\/>/);
assert(match, "Production HTML must link its SVG favicon.");
assert.equal(match[1], "/favicon.svg", "The favicon URL must resolve from every app route.");

const source = readFileSync(join(root, "public", "favicon.svg"));
const built = readFileSync(join(root, "dist", "favicon.svg"));
assert.deepEqual(built, source, "Built favicon bytes must match the versioned source asset.");
const svg = built.toString("utf8");
assert.match(svg, /^<svg\b[^>]*\bviewBox="[^"]+"/);
assert.match(svg, /<path\b/);
assert(!/<(?:script|image|foreignObject)\b|\b(?:href|src)="https?:\/\//i.test(svg), "The favicon must be self-contained SVG.");
console.log(`favicon: /favicon.svg, sha256=${createHash("sha256").update(built).digest("hex")}`);
