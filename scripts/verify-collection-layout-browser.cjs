/* Run through verify-mobile-browser.py to use a disposable PostgreSQL schema. */
const { strict: assert } = require("node:assert");
const { randomUUID } = require("node:crypto");
const { chromium, expect } = require("../web/node_modules/@playwright/test");

async function main() {
    const base = process.env.PROJECTS_WEB_URL;
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
        const registration = await context.request.post(`${base}/api/auth/register`, {
            data: { username: `collection_${randomUUID().slice(0, 8)}`, password: randomUUID() },
        });
        assert.equal(registration.status(), 201);
        const headers = { "X-CSRF-Token": (await registration.json()).csrf_token };
        async function create(path, data) {
            const response = await context.request.post(base + path, { headers, data });
            assert(response.ok(), `Could not create collection fixture (${response.status()})`);
            return response.json();
        }
        const project = await create("/api/projects", { name: "목록 레이아웃 검증" });
        const titles = [
            "서버에 기록된 긴 테스트 케이스 제목과 작업 상태를 확인합니다",
            "긴식별자검증HTTPToken".repeat(15),
            "세 번째 항목",
        ];
        const fixtures = new Map();
        for (const [view, kind] of [["tests", "test_case"], ["documents", "artifact"], ["stories", "requirement"]]) {
            const records = [];
            for (const title of titles) {
                records.push(await create(`/api/projects/${project.id}/items`, { kind, title, body: "선택 항목 본문", data: {} }));
            }
            fixtures.set(view, records);
        }
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const collection = page.locator(".workspace-collection");
        const divider = page.getByRole("separator", { name: "목록 너비", exact: true });
        const rows = collection.locator(".doc-item");
        const detail = page.locator(".workspace-detail");
        for (const width of [1440, 820, 390]) {
            await page.setViewportSize({ width, height: 900 });
            for (const [view, records] of fixtures) {
                await page.goto(`${base}/?project=${project.id}&view=${view}`);
                await expect(rows).toHaveCount(records.length);
                const geometry = await rows.evaluateAll(links => links.map(row => {
                    const bounds = row.getBoundingClientRect();
                    const childBounds = [...row.children].map(child => child.getBoundingClientRect());
                    return { top: bounds.top, bottom: bounds.bottom, bodyBottom: Math.max(...childBounds.map(box => box.bottom)) };
                }));
                for (const [index, row] of geometry.entries()) {
                    assert(row.bodyBottom <= row.bottom + 1, `Content escapes ${view} row ${index} at ${width}px`);
                    if (index > 0) assert(geometry[index - 1].bottom <= row.top + 1, `Adjacent ${view} rows overlap at ${width}px`);
                }
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                if (width > 760) await expect(divider).toBeVisible();
                else await expect(divider).toHaveCount(0);
                if (width === 1440 && view === "tests") {
                    const start = (await collection.boundingBox()).width;
                    await divider.press("End");
                    const expanded = (await collection.boundingBox()).width;
                    assert(expanded > start);
                    await page.reload();
                    await expect.poll(async () => (await collection.boundingBox())?.width).toBeCloseTo(expanded, 0);
                    await divider.press("Home");
                    const beforeDrag = (await collection.boundingBox()).width;
                    const handle = await divider.boundingBox();
                    const x = handle.x + handle.width / 2;
                    const y = handle.y + 24;
                    await page.mouse.move(x, y);
                    await page.mouse.down();
                    await page.mouse.move(x + 100, y, { steps: 6 });
                    await page.mouse.up();
                    await expect.poll(async () => (await collection.boundingBox()).width).toBeGreaterThan(beforeDrag + 60);
                    await page.evaluate(() => localStorage.removeItem("projects:collection-width"));
                }
                await rows.filter({ hasText: records[0].title }).click();
                await expect(detail).toContainText("선택 항목 본문");
                if (width <= 760) {
                    await expect(collection).toBeHidden();
                    await detail.getByRole("button", { name: /← .* 목록/ }).click();
                    await expect(collection).toBeVisible();
                }
            }
            console.log(`PASS collection layout at ${width}px`);
        }
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
        await browser.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
