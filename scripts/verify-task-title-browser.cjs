/* Real Edge + API + disposable PostgreSQL schema; Python launcher owns cleanup. */
const {chromium, expect} = require("../web/node_modules/@playwright/test");
const {randomUUID} = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.PROJECTS_WEB_URL, apiBase = process.env.PROJECTS_API_URL;
const shots = path.resolve("docs/implementation/screenshots/task-title");
async function main() {
    await fs.mkdir(shots, {recursive: true});
    const browser = await chromium.launch({channel: "msedge", headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const pass = label => console.log("PASS " + label);
    try {
        const registered = await context.request.post(apiBase + "/api/auth/register", {data: {username: "titles_" + randomUUID().slice(0, 8), password: randomUUID()}});
        expect(registered.status()).toBe(201);
        const headers = {"X-CSRF-Token": (await registered.json()).csrf_token};
        async function request(method, url, data) {
            const response = await context.request.fetch(apiBase + url, {method, headers, data});
            expect(response.ok(), `${method} ${url} (${response.status()})`).toBe(true);
            return response.json();
        }
        const project = await request("POST", "/api/projects", {name: "제목 너비 검증 프로젝트"});
        const task = await request("POST", `/api/projects/${project.id}/items`, {kind: "task", title: "프로젝트별 작업 계획을 정리하고 팀에 공유하기", body: "# 합성 검증", data: {workflow: "personal", requires_test: false}});
        const long = await request("POST", `/api/projects/${project.id}/items`, {kind: "task", title: "긴제목".repeat(70), data: {workflow: "personal", requires_test: false}});
        const allFields = ["due_date", "planned_date", "list_name", "abc_priority", "context", "goal", "estimated_minutes", "github_issue_url"];
        const views = {};
        for (const count of [2, 8]) views[count] = await request("POST", `/api/projects/${project.id}/task-views`, {name: `속성 ${count}개`, settings: {schema_version: 2, mode: "complex", view: "list", task_scope: "all", list_fields: allFields.slice(0, count), card_fields: ["due_date"]}});
        const url = (layout = "list", fields = 2, density = "detailed", selected = "", global = false) => `${base}/?project=${global ? "" : project.id}&view=tasks&taskScope=all&taskLayout=${layout}&taskDensity=${density}&savedView=${global ? "" : views[fields].id}&item=${selected}`;
        const title = () => page.locator(`[data-task-title-id="${task.id}"]`).getByRole("button", {name: task.title, exact: true});
        async function overflow() {expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);}
        for (const [width, fields, density] of [[1440, 2, "detailed"], [1024, 2, "detailed"], [1280, 2, "compact"], [1920, 2, "detailed"], [1440, 8, "detailed"], [1024, 8, "detailed"]]) {
            await page.setViewportSize({width, height: 1100});
            await page.goto(url("list", fields, density));
            await expect(title()).toBeVisible();
            const metrics = await title().evaluate(element => {
                const main = element.closest('.task-row-main'), row = element.closest('.task-row');
                const range = document.createRange(); range.selectNodeContents(element);
                const tops = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));
                return {title: element.getBoundingClientRect().width, main: main.getBoundingClientRect().width, lines: tops.size, grid: getComputedStyle(row).gridTemplateColumns};
            });
            console.log(`LAYOUT ${width}px/${fields} fields/${density}: ${JSON.stringify(metrics)}`);
            if (metrics.main < 400 || metrics.title < metrics.main - 36) await page.screenshot({path: path.join(shots, "before-desktop.png"), fullPage: true});
            expect(metrics.main).toBeGreaterThanOrEqual(400);
            expect(metrics.title).toBeGreaterThanOrEqual(metrics.main - 36);
            expect(metrics.lines).toBeLessThanOrEqual(2);
            await overflow();
            if (fields === 8) {
                const scroller = page.locator(".task-list-scroll");
                expect(await scroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
                await scroller.evaluate(element => {element.scrollLeft = element.scrollWidth;});
                await expect(page.getByRole("button", {name: `${task.title} 작업 메뉴`, exact: true})).toBeInViewport();
                await scroller.evaluate(element => {element.scrollLeft = 0;});
            }
            if (width === 1440 && fields === 8) await page.screenshot({path: path.join(shots, "after-desktop.png"), fullPage: true});
        }
        pass("desktop 1024/1280/1440/1920px preserves a wide title in compact/detailed views with 2/8 fields");
        await page.setViewportSize({width: 1440, height: 1100});
        await page.goto(url("list", 2, "detailed", "", true));
        await expect(title()).toBeVisible();
        expect((await title().boundingBox()).width).toBeGreaterThanOrEqual(364);
        await title().press("Space");
        await expect(page.locator(".task-selected .markdown")).toContainText("합성 검증");
        await page.locator(".task-selected").getByRole("button", {name: "닫기", exact: true}).click();
        await expect(title()).toBeFocused();
        await page.locator(".task-row", {has: title()}).click({position: {x: 4, y: 4}});
        await expect(page.locator(".task-selected .markdown")).toContainText("합성 검증");
        await page.locator(".task-selected").getByRole("button", {name: "닫기", exact: true}).click();
        await page.getByRole("button", {name: `${task.title} 제목 수정`, exact: true}).click();
        const input = page.getByRole("textbox", {name: `${task.title} 제목`, exact: true});
        expect((await input.boundingBox()).width).toBeGreaterThanOrEqual(390);
        await input.fill(task.title + " 확인"); await input.press("Enter");
        await expect.poll(async () => (await request("GET", `/api/items/${task.id}`)).title).toBe(task.title + " 확인");
        pass("global task detail opens from the title or row padding, and the edit button still saves the title");
        await page.goto(url("board"));
        const card = page.locator(`[data-kanban-card="${task.id}"]`);
        const cardTitle = card.locator(".task-board-title");
        await expect(cardTitle).toBeVisible();
        const titleWidth = await cardTitle.evaluate(button => ({
            button: button.getBoundingClientRect().width,
            available: button.parentElement.clientWidth - button.nextElementSibling.getBoundingClientRect().width,
        }));
        expect(titleWidth.button).toBeGreaterThanOrEqual(titleWidth.available - 6);
        expect(titleWidth.button).toBeGreaterThan(100);
        await card.getByRole("button", {name: /제목 수정$/}).click();
        await card.getByRole("textbox").press("Escape");
        await expect(cardTitle).toBeVisible();
        await cardTitle.dragTo(page.locator('[data-kanban-column="in_progress"]'), {targetPosition: {x: 80, y: 110}});
        await expect.poll(async () => (await request("GET", `/api/items/${task.id}`)).data.state).toBe("in_progress");
        pass("board title fills its card, editing cancellation and native title drag remain usable");
        await page.goto(url("list", 2, "detailed", task.id));
        const detail = page.locator("article.document-editor");
        await expect(detail).toBeVisible();
        const heading = detail.locator(".doc-heading h2");
        expect((await heading.boundingBox()).width).toBeGreaterThanOrEqual(400);
        const widthRatio = await heading.evaluate(node => node.offsetWidth / node.closest(".doc-heading").clientWidth);
        expect(widthRatio).toBeGreaterThan(0.65);
        await page.screenshot({path: path.join(shots, "detail-desktop.png"), fullPage: true});
        pass("detail heading has usable title width beside its actions");
        for (const width of [320, 390, 430]) {
            await page.setViewportSize({width, height: 900});
            await page.goto(url("list", 8));
            await expect(page.locator(`[data-task-title-id="${long.id}"]`)).toBeVisible();
            await overflow();
        }
        await page.screenshot({path: path.join(shots, "mobile-list.png"), fullPage: true});
        expect(errors).toEqual([]);
        pass("mobile 320/390/430px and unbroken long titles stay within the viewport");
    } finally {await context.close(); await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
