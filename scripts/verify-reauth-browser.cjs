/* Real Edge + password API + isolated PostgreSQL. OAuth provider below is FAKE. */
const { chromium, expect } = require("../web/node_modules/@playwright/test");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const base = process.env.PROJECTS_WEB_URL;
const apiBase = process.env.PROJECTS_API_URL;
const shots = path.resolve("docs/implementation/screenshots/reauth");

async function main() {
    if (!base || !apiBase) throw new Error("Run with scripts/verify-mobile-browser.py verify-reauth-browser.cjs");
    await fs.mkdir(shots, { recursive: true });
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    const contexts = [];
    const checkpoints = [];
    const errors = [];
    const account = { username: `reauth_${randomUUID().slice(0, 8)}`, password: randomUUID() };
    let activePage;
    function checkpoint(label) { checkpoints.push(label); console.log(`PASS ${label}`); }
    async function newPage(width = 1440) {
        const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1100 }, timezoneId: "Asia/Seoul" });
        contexts.push(context);
        const page = await context.newPage();
        activePage = page;
        page.setDefaultTimeout(15000);
        page.on("pageerror", error => errors.push(error.message));
        page.on("dialog", dialog => void dialog.accept());
        return { context, page };
    }
    async function auth(context, mode = "login") {
        const response = await context.request.post(`${apiBase}/api/auth/${mode}`, { data: account });
        expect(response.status(), `real password ${mode}`).toBe(mode === "register" ? 201 : 200);
        return response.json();
    }
    async function session(context) {
        const response = await context.request.get(`${apiBase}/api/session`);
        expect(response.status()).toBe(200);
        return response.json();
    }
    async function copySession(source, target) {
        // Reuse a real local session in independent tabs, staying below the real
        // 10-attempt/minute password limiter. Cookie values are never logged.
        await target.addCookies(await source.cookies());
    }
    async function request(context, method, route, data) {
        const current = await session(context);
        const response = await context.request.fetch(`${apiBase}${route}`, { method, data, headers: { "X-CSRF-Token": current.csrf_token } });
        expect(response.ok(), `${method} ${route}: ${response.status()}`).toBeTruthy();
        return response.json();
    }
    async function expire(context) {
        const current = await session(context);
        const response = await context.request.post(`${apiBase}/api/auth/logout`, { headers: { "X-CSRF-Token": current.csrf_token } });
        expect(response.status()).toBe(200);
        expect((await context.request.get(`${apiBase}/api/session`)).status()).toBe(401);
    }
    async function loginForm(page, password = account.password) {
        await page.getByRole("textbox", { name: "사용자 이름", exact: true }).fill(account.username);
        await page.getByLabel("비밀번호", { exact: true }).fill(password);
        await page.getByRole("button", { name: "로그인", exact: true }).click();
    }
    async function authRoute(page, original) {
        await expect(page.getByRole("textbox", { name: "사용자 이름", exact: true })).toBeVisible();
        const current = new URL(page.url());
        expect(current.origin).toBe(new URL(base).origin);
        expect(current.searchParams.get("returnTo")).toBe(original);
        return page.url();
    }
    async function businessStorm(page, itemId) {
        // Call the app's transport, exercising actual 401 classification and storm deduplication.
        try {
            await page.evaluate(async id => {
                const { api } = await import("/src/api.ts");
                await Promise.allSettled([api.projects(), api.catalog(), api.item(id)]);
            }, itemId);
        } catch (error) {
            if (!/Execution context was destroyed|most likely because of a navigation/.test(error.message)) throw error;
        }
    }
    const record = page => page.locator("article.document-editor");
    async function capture(page, name) { await page.screenshot({ path: path.join(shots, name), fullPage: true }); }
    try {
        const setup = await newPage();
        await auth(setup.context, "register");
        const owner = (await session(setup.context)).user.id;
        const project = await request(setup.context, "POST", "/api/projects", { name: "재인증 검증 프로젝트", goal: "합성 자료로 세션 만료와 초안을 확인합니다." });
        const task = await request(setup.context, "POST", `/api/projects/${project.id}/items`, { kind: "task", title: "재인증 원본 작업", body: "# 서버 원본\n\n저장된 본문입니다.", data: { workflow: "personal", requires_test: false, context: "서버 원본 맥락" } });
        const original = `/?project=${project.id}&view=tasks&item=${task.id}&taskScope=all&taskLayout=board&taskDensity=detailed&taskStatus=todo&q=${encodeURIComponent("재인증")}&qa=preserved#body-draft`;
        const draftKey = `projects:draft:${owner}:${project.id}:${task.id}`;
        const own = { title: "재인증 후 남아 있는 제목", body: "# 만료 전 본문 초안\n\n로그인 후에도 보존합니다.", context: "만료 전 맥락 초안", quick: "저장하지 않은 빠른 할 일" };

        // No active app session: the original deep URL displays ordinary login once.
        const initial = await newPage();
        let initialOauth = 0;
        initial.page.on("request", req => { if (new URL(req.url()).pathname === "/oauth2/start") initialOauth++; });
        await initial.page.goto(base + original);
        await expect(initial.page.getByRole("textbox", { name: "사용자 이름", exact: true })).toBeVisible();
        expect(initial.page.url()).toBe(base + original);
        expect(initialOauth).toBe(0);
        checkpoint("initial real session 401 shows normal login without automatic provider navigation");

        const { page, context } = setup;
        activePage = page;
        let puts = 0;
        let oauth = 0;
        page.on("request", req => {
            if (new URL(req.url()).pathname === `/api/items/${task.id}` && req.method() === "PUT") puts++;
            if (new URL(req.url()).pathname === "/oauth2/start") oauth++;
        });
        await page.goto(base + original);
        await expect(record(page)).toBeVisible();
        await page.getByRole("textbox", { name: "빠른 할 일", exact: true }).fill(own.quick);
        await record(page).getByRole("tab", { name: "편집", exact: true }).click();
        await record(page).getByRole("textbox", { name: "제목", exact: true }).fill(own.title);
        await record(page).getByRole("textbox", { name: "본문 · Markdown", exact: true }).fill(own.body);
        await record(page).getByRole("textbox", { name: "GTD 실행 맥락", exact: true }).fill(own.context);
        await expire(context);
        const expiredSave = page.waitForResponse(response => new URL(response.url()).pathname === `/api/items/${task.id}` && response.request().method() === "PUT");
        await record(page).getByRole("button", { name: "초안 저장", exact: true }).click();
        expect((await expiredSave).status()).toBe(401);
        const loginUrl = await authRoute(page, original);
        expect(puts).toBe(1);
        expect(oauth).toBe(0);
        await capture(page, "password-expired-login.png");
        await loginForm(page, "deliberately-wrong-password");
        await expect(page.getByLabel("비밀번호", { exact: true })).toBeVisible();
        await expect(page.getByRole("alert")).toBeVisible();
        expect(page.url()).toBe(loginUrl);
        expect(oauth).toBe(0);
        checkpoint("real revoked DB session redirects local password login with exact query/hash; failed credentials stay put");

        // Another real authenticated client advances the revision while the editor signs in.
        const remote = await browser.newContext(); contexts.push(remote);
        await auth(remote);
        const changed = await request(remote, "PATCH", `/api/items/${task.id}/task-properties`, { expected_revision: task.revision, values: { goal: "다른 클라이언트의 서버 변경" } });
        await loginForm(page);
        await expect.poll(() => page.url()).toBe(base + original);
        await expect(record(page).getByRole("textbox", { name: "제목", exact: true })).toHaveValue(own.title);
        await expect(record(page).getByRole("textbox", { name: "본문 · Markdown", exact: true })).toHaveValue(own.body);
        await expect(record(page).getByRole("textbox", { name: "GTD 실행 맥락", exact: true })).toHaveValue(own.context);
        await expect(page.getByRole("textbox", { name: "빠른 할 일", exact: true })).toHaveValue(own.quick);
        const recovered = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);
        expect(recovered.baseRevision).toBe(task.revision);
        expect(puts).toBe(1);
        expect((await request(context, "GET", `/api/items/${task.id}`)).revision).toBe(changed.revision);
        checkpoint("password login restores exact project/item/layout/filter/search/hash and title/body/property/quick-add drafts without mutation replay");
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(record(page).getByRole("textbox", { name: "제목", exact: true })).toHaveValue(own.title);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await capture(page, "password-recovered-mobile.png");
        const conflictResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/items/${task.id}` && response.request().method() === "PUT");
        await record(page).getByRole("button", { name: "초안 저장", exact: true }).click();
        expect((await conflictResponse).status()).toBe(409);
        await expect(record(page).getByRole("region", { name: "동시 편집 충돌", exact: true })).toBeVisible();
        await expect(record(page).getByRole("textbox", { name: "본문 · Markdown", exact: true })).toHaveValue(own.body);
        expect((await request(context, "GET", `/api/items/${task.id}`)).revision).toBe(changed.revision);
        checkpoint("390px recovered editor fits; stale recovered base revision still produces actual 409 without overwriting server");

        // Typed property dialog has independent recovery; storage failure must keep it mounted.
        const property = await newPage();
        await copySession(context, property.context);
        await property.page.goto(base + original);
        await expect(record(property.page)).toBeVisible();
        await record(property.page).getByRole("button", { name: `${task.title} 맥락 편집`, exact: true }).click();
        const editor = property.page.getByRole("dialog", { name: "맥락 편집", exact: true });
        await editor.getByRole("textbox", { name: "맥락", exact: true }).fill("속성 대화상자 복구 초안");
        await property.page.evaluate(() => {
            window.qaOriginalSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function () { throw new DOMException("Synthetic quota failure", "QuotaExceededError"); };
        });
        await expire(property.context);
        await editor.getByRole("button", { name: "저장", exact: true }).click();
        await expect(property.page.getByRole("button", { name: /다시 로그인/ })).toBeVisible();
        await expect(editor.getByRole("textbox", { name: "맥락", exact: true })).toHaveValue("속성 대화상자 복구 초안");
        expect(property.page.url()).toBe(base + original);
        await capture(property.page, "storage-blocked.png");
        await property.page.evaluate(() => { Storage.prototype.setItem = window.qaOriginalSetItem; });
        await property.page.getByRole("button", { name: /다시 로그인/ }).click();
        await authRoute(property.page, original);
        await loginForm(property.page);
        await expect.poll(() => property.page.url()).toBe(base + original);
        await expect(property.page.getByRole("dialog", { name: "맥락 편집", exact: true }).getByRole("textbox", { name: "맥락", exact: true })).toHaveValue("속성 대화상자 복구 초안");
        expect((await request(property.context, "GET", `/api/items/${task.id}`)).data.context).toBe(task.data.context);
        checkpoint("failed recovery storage blocks redirect and keeps property input; explicit retry restores typed property dialog");

        // Permission/network failures use the app's actual transport but synthetic responses.
        const denied = await newPage();
        await copySession(property.context, denied.context);
        await denied.page.goto(base + original);
        await expect(record(denied.page)).toBeVisible();
        await record(denied.page).getByRole("button", { name: "항목 제목 수정", exact: true }).click();
        const deniedTitle = record(denied.page).getByRole("textbox", { name: "항목 제목", exact: true });
        await deniedTitle.fill("권한 오류에도 남는 제목");
        let simulated = "forbidden";
        await denied.page.route(`**/api/items/${task.id}`, async route => {
            if (route.request().method() !== "PUT") return route.continue();
            if (simulated === "forbidden") return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: "합성 권한 거부" }) });
            return route.abort("connectionfailed");
        });
        await deniedTitle.press("Enter");
        await expect(record(denied.page).getByRole("alert")).toContainText("합성 권한 거부");
        expect(denied.page.url()).toBe(base + original);
        simulated = "network";
        await deniedTitle.press("Enter");
        await expect(record(denied.page).getByRole("alert")).toContainText("서버에 연결할 수 없습니다");
        await expect(deniedTitle).toHaveValue("권한 오류에도 남는 제목");
        expect(denied.page.url()).toBe(base + original);
        checkpoint("synthetic permission 403 and network failure preserve edit without login navigation");

        const archive = await newPage();
        await copySession(property.context, archive.context);
        const archiveReturn = "/?view=projects&qa=archive#project-menu";
        await archive.page.goto(base + archiveReturn);
        await archive.page.getByRole("button", { name: `${project.name} 프로젝트 메뉴`, exact: true }).click();
        await expire(archive.context);
        const deniedDownload = archive.page.waitForResponse(response => response.url().includes(`/api/projects/${project.id}/export`) || response.url().includes(`/api/projects/${project.id}/archive`));
        await archive.page.getByRole("menuitem", { name: "프로젝트 ZIP 내려받기", exact: true }).click();
        expect((await deniedDownload).status()).toBe(401);
        await authRoute(archive.page, archiveReturn);
        await loginForm(archive.page);
        await expect.poll(() => archive.page.url()).toBe(base + archiveReturn);
        checkpoint("actual project ZIP download 401 follows password recovery and restores original projects URL");

        // FAKE Microsoft provider boundary: metadata + oauth2/start are mocked; local API
        // still creates/revokes real opaque PostgreSQL-backed password sessions.
        const microsoft = await newPage();
        await copySession(archive.context, microsoft.context);
        await microsoft.page.route("**/api/session", async route => {
            const response = await route.fetch();
            if (response.status() !== 200) return route.fulfill({ response });
            const json = await response.json();
            return route.fulfill({ response, json: { ...json, auth_mode: "microsoft" } });
        });
        const providerReturns = [];
        await microsoft.page.exposeBinding("qaCompleteFakeProvider", async () => { await auth(microsoft.context); return true; });
        await microsoft.page.route("**/oauth2/start?**", async route => {
            const url = new URL(route.request().url());
            const rd = url.searchParams.get("rd");
            providerReturns.push(rd);
            expect(rd).toBe(original);
            const escaped = JSON.stringify(rd).replaceAll("<", "\\u003c");
            return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><title>FAKE provider</title><h1>합성 Microsoft 제공자 경계</h1><p>실제 Microsoft 인증을 수행하지 않습니다.</p><button onclick='this.disabled=true; window.qaCompleteFakeProvider().then(() => location.assign(${escaped}))'>합성 로그인 완료</button></html>` });
        });
        await microsoft.page.goto(base + original);
        await expect(record(microsoft.page)).toBeVisible();
        await record(microsoft.page).getByRole("button", { name: "본문 수정", exact: true }).click();
        const microsoftBody = record(microsoft.page).getByRole("textbox", { name: "본문", exact: true });
        await microsoftBody.fill("# 제공자 이동 전 본문 초안");
        await expire(microsoft.context);
        await businessStorm(microsoft.page, task.id);
        await expect(microsoft.page.getByRole("heading", { name: "합성 Microsoft 제공자 경계", exact: true })).toBeVisible();
        expect(providerReturns).toEqual([original]);
        const providerDraft = await microsoft.page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);
        expect(providerDraft.body).toBe("# 제공자 이동 전 본문 초안");
        expect(providerDraft.baseRevision).toBe(changed.revision);
        await capture(microsoft.page, "fake-provider.png");
        await microsoft.page.getByRole("button", { name: "합성 로그인 완료", exact: true }).click();
        await expect.poll(() => microsoft.page.url()).toBe(base + original);
        await expect(record(microsoft.page).getByRole("textbox", { name: "본문", exact: true })).toHaveValue("# 제공자 이동 전 본문 초안");
        checkpoint("FAKE Microsoft boundary receives one OAuth start for actual 401 storm and restores body draft plus exact rd after real local login");
        await microsoft.page.route("**/api/projects", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Synthetic persistent 401" }) }));
        await businessStorm(microsoft.page, task.id);
        await expect(microsoft.page.getByRole("button", { name: /다시 로그인/ })).toBeVisible();
        expect(providerReturns).toHaveLength(1);
        expect(microsoft.page.url()).toBe(base + original);
        await expect(record(microsoft.page).getByRole("textbox", { name: "본문", exact: true })).toHaveValue("# 제공자 이동 전 본문 초안");
        await capture(microsoft.page, "provider-loop-blocked.png");
        await microsoft.page.getByRole("button", { name: /다시 로그인/ }).click();
        await expect(microsoft.page.getByRole("heading", { name: "합성 Microsoft 제공자 경계", exact: true })).toBeVisible();
        expect(providerReturns).toEqual([original, original]);
        checkpoint("FAKE provider persistent 401 loop is blocked after fresh session; explicit retry permits one new navigation");

        const wrapped = await newPage();
        await copySession(microsoft.context, wrapped.context);
        const wrappedOriginal = original.replace(`q=${encodeURIComponent("재인증")}&qa=preserved#body-draft`, "q=https://example.invalid/part#body//child");
        await wrapped.page.route("**/api/session", async route => {
            const response = await route.fetch();
            if (response.status() !== 200) return route.fulfill({ response });
            return route.fulfill({ response, json: { ...(await response.json()), auth_mode: "microsoft" } });
        });
        await wrapped.page.exposeBinding("qaCompleteFakeProvider", async () => { await auth(wrapped.context); return true; });
        let wrappedStarts = 0;
        await wrapped.page.route("**/oauth2/start?**", async route => {
            wrappedStarts++;
            const rd = new URL(route.request().url()).searchParams.get("rd");
            const localWrapper = new URL(rd, base);
            expect(localWrapper.origin).toBe(new URL(base).origin);
            expect(localWrapper.searchParams.get("view")).toBe("login");
            expect(localWrapper.searchParams.get("returnTo")).toBe(wrappedOriginal);
            expect(rd).not.toContain("//");
            const escaped = JSON.stringify(rd).replaceAll("<", "\\u003c");
            return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><h1>합성 제공자 복귀 경로</h1><button onclick='this.disabled=true; window.qaCompleteFakeProvider().then(() => location.assign(${escaped}))'>합성 로그인 완료</button></html>` });
        });
        await wrapped.page.goto(base + wrappedOriginal);
        await expect(record(wrapped.page)).toBeVisible();
        await expire(wrapped.context);
        await businessStorm(wrapped.page, task.id);
        await expect(wrapped.page.getByRole("heading", { name: "합성 제공자 복귀 경로", exact: true })).toBeVisible();
        expect(wrappedStarts).toBe(1);
        await wrapped.page.getByRole("button", { name: "합성 로그인 완료", exact: true }).click();
        await expect.poll(() => wrapped.page.url()).toBe(base + wrappedOriginal);
        await expect(record(wrapped.page)).toBeVisible();
        checkpoint("FAKE provider uses encoded local wrapper for URL-valued query and // fragment; bootstrap restores exact original");

        const unsafe = await newPage();
        await unsafe.page.goto(`${base}/?view=login&returnTo=${encodeURIComponent("https://example.invalid/escape")}`);
        await loginForm(unsafe.page);
        await expect(unsafe.page.locator('[data-ui="app-shell"]')).toBeVisible();
        expect(new URL(unsafe.page.url()).origin).toBe(new URL(base).origin);
        expect(unsafe.page.url()).not.toContain("example.invalid");
        checkpoint("unsafe external returnTo is discarded after actual password login");
        expect(errors).toEqual([]);
        await fs.rm(path.join(shots, "failure.png"), { force: true });
        console.log(`Real Edge + local password API + isolated PostgreSQL: ${checkpoints.length} checkpoints passed. OAuth provider and 403/network/persistent-401 injection are synthetic. Actual Entra, Hub, LLM, Note, production and physical mobile device were not exercised.`);
    } catch (error) {
        await activePage?.screenshot({ path: path.join(shots, "failure.png"), fullPage: true }).catch(() => {});
        console.error(`FAILED after: ${checkpoints.join("; ")}`);
        if (errors.length) console.error(`Browser script errors: ${errors.join("; ")}`);
        throw error;
    } finally {
        await Promise.allSettled(contexts.map(context => context.close()));
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
