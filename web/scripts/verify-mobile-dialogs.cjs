/* Mobile dialog geometry and interaction checks with isolated mock responses. */
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const baseUrl = process.env.PROJECTS_WEB_URL || "http://127.0.0.1:5173/";

const project = {
    id: "00000000-0000-4000-8000-000000000101", name: "모바일 QA", goal: "모바일 사용성 점검",
    profile: "simple", version: 1, created_at: "2026-10-25T00:00:00Z",
    repository_url: null, repository_path: "", repository_branch: null,
    repository_sha: null, repository_kind: null, repository_manifest: null,
    repository_imported_at: null,
};

async function audit(width, height) {
    const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.route("**/api/**", route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let body = {};
        let status = 200;
        if (path === "/api/session") body = { user: { id: "00000000-0000-4000-8000-000000000001", username: "qa" }, csrf_token: "test-csrf" };
        else if (path === "/api/projects" && request.method() === "GET") body = [project];
        else if (path.endsWith("/items") || path.endsWith("/task-views") || path.endsWith("/repository-activity")) body = [];
        else if (path.endsWith("/summary")) body = { items_by_kind: {}, tasks: { total: 0, done: 0, cancelled: 0 }, artifacts: { total: 0, confirmed: 0 }, tests: { total: 0, passed: 0 }, needs_review: 0 };
        else { body = { detail: "Unused mock endpoint" }; status = 404; }
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    try {
        await page.goto(baseUrl);
        if (width === 320 && height === 568) {
            await fs.mkdir(path.resolve(".projects/research/mobile-dialogs"), { recursive: true });
            await page.screenshot({ path: path.resolve(".projects/research/mobile-dialogs/project-list.png") });
        }
        async function report(label) {
            const geometry = await page.getByRole("dialog").evaluate(element => {
            const rect = element.getBoundingClientRect();
            const body = element.querySelector(".modal-body");
            const bodyRect = body?.getBoundingClientRect();
            const actions = element.querySelector(".form-actions");
            const actionsRect = actions?.getBoundingClientRect();
            const primary = element.querySelector(".mobile-task-sheet-fields > .primary:last-child");
            const primaryRect = primary?.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
                viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height ?? innerHeight, visualWidth: visualViewport?.width ?? innerWidth, visualTop: visualViewport?.offsetTop ?? 0, visualLeft: visualViewport?.offsetLeft ?? 0 },
                dialog: { x: rect.x, y: rect.y, right: rect.right, width: rect.width, height: rect.height, bottom: rect.bottom },
                body: bodyRect && { y: bodyRect.y, height: bodyRect.height, scrollHeight: body?.scrollHeight },
                actions: actionsRect && { y: actionsRect.y, bottom: actionsRect.bottom },
                primary: primaryRect && { y: primaryRect.y, bottom: primaryRect.bottom },
                position: style.position, translate: style.translate, transform: style.transform,
            };
            });
            const visible = geometry.viewport;
            assert.ok(geometry.dialog.x >= visible.visualLeft - 1, `${label}: left edge hidden`);
            assert.ok(geometry.dialog.y >= visible.visualTop - 1, `${label}: top edge hidden`);
            assert.ok(geometry.dialog.right <= visible.visualLeft + visible.visualWidth + 1, `${label}: right edge hidden`);
            assert.ok(geometry.dialog.bottom <= visible.visualTop + visible.visualHeight + 1, `${label}: bottom edge hidden`);
            if (geometry.actions) {
                assert.ok(geometry.actions.y >= visible.visualTop - 1, `${label}: action buttons above viewport`);
                assert.ok(geometry.actions.bottom <= visible.visualTop + visible.visualHeight + 1, `${label}: action buttons hidden`);
            }
            if (geometry.primary) {
                assert.ok(geometry.primary.y >= visible.visualTop - 1, `${label}: primary action above viewport`);
                assert.ok(geometry.primary.bottom <= visible.visualTop + visible.visualHeight + 1, `${label}: primary action hidden`);
            }
            assert.equal(geometry.transform, "none", `${label}: stale transform`);
            process.stdout.write(`${width}x${height} ${label} ${JSON.stringify(geometry)}\n`);
        }
        await page.getByRole("button", { name: "+ 프로젝트 만들기" }).click();
        await report("project create");
        if (width === 320 && height === 568) {
            await page.evaluate(() => {
                Object.defineProperties(window.visualViewport, {
                    height: { configurable: true, get: () => 300 },
                    offsetTop: { configurable: true, get: () => 30 },
                });
                window.visualViewport.dispatchEvent(new Event("resize"));
            });
            await page.waitForFunction(() => Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().y - 30) < 1);
            await report("project create / keyboard");
            await page.evaluate(() => {
                Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 200 });
                window.visualViewport.dispatchEvent(new Event("resize"));
            });
            await page.waitForFunction(() => Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().height - 200) < 1);
            await report("project create / compact keyboard");
            await page.evaluate(() => {
                delete window.visualViewport.height;
                delete window.visualViewport.offsetTop;
                window.visualViewport.dispatchEvent(new Event("resize"));
            });
            await page.waitForFunction(() => Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().y) < 1);
        }
        if (width === 320 && height === 568) {
            await fs.mkdir(path.resolve(".projects/research/mobile-dialogs"), { recursive: true });
            await page.screenshot({ path: path.resolve(".projects/research/mobile-dialogs/project-create.png") });
        }
        await page.getByRole("dialog").getByRole("button", { name: "대화상자 닫기" }).click();
        await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "+ 프로젝트 만들기", null, { timeout: 2000 });
        const returnedFocus = await page.evaluate(() => document.activeElement?.textContent?.trim());
        assert.equal(returnedFocus, "+ 프로젝트 만들기", "project dialog must restore trigger focus");
        await page.getByRole("button", { name: "Git ZIP에서 만들기" }).click();
        await report("Git ZIP");
        await page.getByRole("dialog").getByRole("button", { name: "대화상자 닫기" }).click();
        await page.getByRole("navigation", { name: "모바일 주요 탐색" }).getByRole("button", { name: "더보기" }).click();
        await report("more");
        await page.getByRole("dialog").getByRole("button", { name: "로그아웃" }).scrollIntoViewIfNeeded();
        await page.getByRole("dialog").getByRole("button", { name: "대화상자 닫기" }).click();
        await page.goto(new URL(`?project=${project.id}&view=planning`, baseUrl).toString());
        await page.getByRole("button", { name: "+ 아이디어 만들기" }).first().click();
        await report("idea create");
        if (width === 320 && height === 568) {
            await page.getByRole("dialog").locator(".modal-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
            await page.screenshot({ path: path.resolve(".projects/research/mobile-dialogs/idea-create-bottom.png") });
        }
        await page.getByRole("dialog").getByRole("button", { name: "대화상자 닫기" }).click();
        await page.goto(new URL(`?project=${project.id}&view=tasks&taskMode=simple&taskView=today`, baseUrl).toString());
        await page.locator(".mobile-task-header").getByRole("button", { name: "+ 추가" }).click();
        await report("task add");
        if (width === 320 && height === 568) await page.screenshot({ path: path.resolve(".projects/research/mobile-dialogs/task-add.png") });
        if (width === 320 && height === 568) {
            await page.evaluate(() => {
                Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 300 });
                window.visualViewport.dispatchEvent(new Event("resize"));
            });
            await page.waitForFunction(() => Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().bottom - 300) < 1);
            await report("task add / keyboard");
            await page.evaluate(() => {
                Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 200 });
                window.visualViewport.dispatchEvent(new Event("resize"));
            });
            await page.waitForFunction(() => Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().bottom - 200) < 1);
            await report("task add / compact keyboard");
        }
    } finally { await browser.close(); }
}

(async () => {
    for (const [width, height] of [[390, 844], [320, 568], [667, 375]]) await audit(width, height);
})().catch(error => { console.error(error); process.exitCode = 1; });
