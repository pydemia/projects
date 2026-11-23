/* Actual React + PostgreSQL overview checks; launcher owns schema/process cleanup. */
const { chromium, expect } = require("../web/node_modules/@playwright/test");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.PROJECTS_WEB_URL;
const apiBase = process.env.PROJECTS_API_URL;
const shots = path.resolve("docs/implementation/screenshots/overview");

async function main() {
    await fs.mkdir(shots, {recursive: true});
    const browser = await chromium.launch({channel: "msedge", headless: true});
    const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, colorScheme: "dark"});
    const page = await context.newPage();
    const failures = [];
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
        const registered = await context.request.post(`${apiBase}/api/auth/register`, {data: {username: `overview_${randomUUID().slice(0,8)}`, password: randomUUID()}});
        expect(registered.status()).toBe(201);
        const headers = {"X-CSRF-Token": (await registered.json()).csrf_token};
        async function post(url, data) {
            const response = await context.request.post(apiBase + url, {headers, data});
            expect(response.ok(), await response.text()).toBeTruthy();
            return response.json();
        }
        const personal = await post("/api/projects", {name: "개인 작업", goal: "일정과 할 일을 한곳에서 계획하고 처리한다.", profile: "simple"});
        const standard = await post("/api/projects", {name: "업무 계획", profile: "standard"});
        const tested = await post("/api/projects", {name: "테스트를 사용하는 간편 프로젝트", profile: "simple"});
        for (const project of [personal, standard]) {
            await post(`/api/projects/${project.id}/items`, {kind: "task", title: "다음에 할 일", body: "", data: {workflow: "personal", requires_test: false}});
            await page.goto(`${base}/?project=${project.id}&view=overview`);
            await expect(page.getByRole("group", {name: "작업 완료", exact: true})).toBeVisible();
            if (await page.getByRole("group", {name: "테스트 통과", exact: true}).count()) failures.push(`${project.profile}: unused test metric remains`);
            if (/테스트|기준선/.test(await page.locator(".scope-note").innerText())) failures.push(`${project.profile}: overview copy assumes test workflow`);
        }
        await page.goto(`${base}/?project=${personal.id}&view=overview`);
        await expect(page.getByRole("group", {name: "작업 완료", exact: true})).toBeVisible();
        for (const colorScheme of ["dark", "light"]) {
            await page.emulateMedia({colorScheme});
            for (const width of [320, 390, 430]) {
                await page.setViewportSize({width, height: 844});
                const title = await page.locator(".scope-note strong").boundingBox();
                const metadata = await page.locator(".scope-note .muted").boundingBox();
                if (metadata.y < title.y + title.height + 5) failures.push(`${colorScheme}/${width}: scope title and metadata lack separate line/gap`);
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                expect(overflow).toBeLessThanOrEqual(1);
                if (width === 390) await page.screenshot({path: path.join(shots, `personal-mobile-${colorScheme}.png`), fullPage: true});
            }
        }
        await page.setViewportSize({width: 1440, height: 900});
        const title = await page.locator(".scope-note strong").boundingBox();
        const metadata = await page.locator(".scope-note .muted").boundingBox();
        if (metadata.x < title.x + title.width + 12 && metadata.y < title.y + title.height + 5) failures.push("desktop: scope title and metadata have no gap");
        await page.screenshot({path: path.join(shots, "personal-desktop.png"), fullPage: true});
        for (const project of [tested, standard]) {
            await post(`/api/projects/${project.id}/items`, {kind: "test_case", title: "등록한 검증 케이스", body: "", data: {steps: ["결과 확인"], expected: "기대 결과"}});
            await page.goto(`${base}/?project=${project.id}&view=overview`);
            const metric = page.getByRole("group", {name: "테스트 통과", exact: true});
            await expect(metric).toBeVisible();
            await expect(metric).toContainText("0 / 1");
            await expect(metric).toContainText("0%");
            await expect(metric).toContainText("미실행은 통과 제외");
        }
        await page.screenshot({path: path.join(shots, "registered-tests-desktop.png"), fullPage: true});
        expect(errors).toEqual([]);
        expect(failures).toEqual([]);
        console.log("Real app + PostgreSQL: overview title spacing, 320/390/430px light/dark, no unused test metric for either profile, actual registered tests retained at 0/1 passed. Physical devices and authenticated production UI not exercised.");
    } finally {
        await context.close();
        await browser.close();
    }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
