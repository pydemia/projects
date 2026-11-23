/* Real Projects browser + PostgreSQL, isolated by verify-mobile-browser.py. */
const { chromium, expect } = require("../web/node_modules/@playwright/test");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.PROJECTS_WEB_URL;
const apiBase = process.env.PROJECTS_API_URL;
const shots = path.resolve("docs/implementation/screenshots/task-discovery");

async function main() {
    await fs.mkdir(shots, { recursive: true });
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Seoul" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
    try {
        const registered = await context.request.post(`${apiBase}/api/auth/register`, { data: { username: `taskqa_${randomUUID().slice(0, 8)}`, password: randomUUID() } });
        expect(registered.status()).toBe(201);
        const session = await registered.json();
        const headers = { "X-CSRF-Token": session.csrf_token };
        async function post(url, data) {
            const response = await context.request.post(apiBase + url, { headers, data });
            expect(response.ok(), await response.text()).toBeTruthy();
            return response.json();
        }
        const a = await post("/api/projects", { name: "보기 전환 QA", goal: "실제 저장과 조작" });
        const b = await post("/api/projects", { name: "이동 대상 QA" });
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
        const task = await post(`/api/projects/${a.id}/items`, { kind: "task", title: "전환해도 유지되는 작업", body: "원본 메모", data: { workflow: "personal", requires_test: false, planned_date: day, list_name: "실행" } });
        const undated = await post(`/api/projects/${a.id}/items`, { kind: "task", title: "날짜 없는 작업", body: "", data: { workflow: "personal", requires_test: false, list_name: "Inbox" } });
        const batchTask = await post(`/api/projects/${a.id}/items`, { kind: "task", title: "일괄 이동할 작업", body: "", data: { workflow: "personal", requires_test: false } });
        await post(`/api/projects/${b.id}/items`, { kind: "task", title: "다른 프로젝트의 작업", body: "", data: { workflow: "personal", requires_test: false } });
        await page.goto(`${base}/?view=tasks&taskScope=all&taskLayout=list&taskDensity=compact`);
        await expect(page.getByRole("heading", { name: "내 작업", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: `${task.title} 제목 수정`, exact: true })).toBeVisible();
        await expect(page.getByText("다른 프로젝트의 작업", { exact: true })).toBeVisible();
        const first = await page.getByRole("button", { name: `${task.title} 제목 수정`, exact: true }).boundingBox();
        if (!first || first.y + first.height > 900) throw new Error(`First task outside viewport: ${JSON.stringify(first)}`);
        await page.screenshot({ path: path.join(shots, "global-desktop.png"), fullPage: true });
        {const previousUrl = page.url(); await page.goto(`${base}/?view=settings`); await page.getByRole("combobox", {name: "색상 테마", exact: true}).selectOption("dark"); await page.goto(previousUrl); await expect(page.getByRole("heading", {name: "내 작업", exact: true})).toBeVisible();}
        await page.screenshot({ path: path.join(shots, "global-dark.png"), fullPage: true });
        {const previousUrl = page.url(); await page.goto(`${base}/?view=settings`); await page.getByRole("combobox", {name: "색상 테마", exact: true}).selectOption("light"); await page.goto(previousUrl); await expect(page.getByRole("heading", {name: "내 작업", exact: true})).toBeVisible();}
        // Every layout is available in either density, including the global entry point.
        const layouts = [["목록", "list", ".task-list"], ["보드", "board", ".task-kanban"], ["캘린더", "calendar", ".task-calendar"], ["집계", "insights", ".task-insights"]];
        for (const [mode, density] of [["간단", "compact"], ["상세", "detailed"]]) {
            const modeGroup = page.getByRole("group", { name: "보기 모드", exact: true });
            await expect(page.locator(".task-mode-caption")).toBeVisible();
            await modeGroup.getByText(mode, { exact: true }).click();
            await expect(modeGroup.getByRole("radio", { name: mode, exact: true })).toBeChecked();
            for (const [label, layout, selector] of layouts) {
                const tab = page.getByRole("tab", { name: label, exact: true });
                await tab.click();
                await expect(tab).toHaveAttribute("aria-selected", "true");
                await expect(page.locator(selector)).toBeVisible();
                expect(new URL(page.url()).searchParams.get("taskLayout")).toBe(layout);
                expect(new URL(page.url()).searchParams.get("taskDensity")).toBe(density);
                expect(new URL(page.url()).searchParams.get("project")).toBeNull();
            }
        }
        await page.getByRole("tab", { name: "보드", exact: true }).click();
        await expect(page.locator(".task-kanban").getByText(b.name, { exact: false }).first()).toBeVisible();
        await page.screenshot({ path: path.join(shots, "global-board.png"), fullPage: true });
        // A project selected in global tasks becomes the persistent navigation context.
        await page.getByRole("combobox", { name: "소속 프로젝트", exact: true }).selectOption(b.id);
        await expect(page).toHaveURL(new RegExp(`project=${b.id}`));
        const projectMenu = page.getByRole("navigation", { name: "프로젝트 메뉴", exact: true });
        await projectMenu.getByRole("link", { name: "기획", exact: true }).click();
        await page.reload();
        expect(new URL(page.url()).searchParams.get("project")).toBe(b.id);
        await expect(page.locator(".crumb strong")).toHaveText(b.name);
        await page.getByRole("link", { name: "PROJECTS · 전체 보기", exact: true }).click();
        expect(new URL(page.url()).searchParams.get("project")).toBe(b.id);
        await projectMenu.getByRole("link", { name: "작업", exact: true }).click();
        await page.getByRole("link", { name: "☷ 전체 작업", exact: true }).click();
        expect(new URL(page.url()).searchParams.get("project")).toBeNull();
        await projectMenu.getByRole("link", { name: "개요", exact: true }).click();
        expect(new URL(page.url()).searchParams.get("project")).toBe(b.id);
        await page.goto(`${base}/?view=overview`);
        await expect(page).toHaveURL(new RegExp(`project=${b.id}`));
        await page.setViewportSize({ width: 390, height: 844 });
        const bottom = page.getByRole("navigation", { name: "모바일 주요 탐색", exact: true });
        for (const name of ["오늘", "Inbox", "작업"]) {
            await bottom.getByRole("link", { name, exact: true }).click();
            await page.reload();
            expect(new URL(page.url()).searchParams.get("project")).toBe(b.id);
            await expect(page.locator(".mobile-project-name")).toHaveText(b.name);
        }
        for (const [mode, density] of [["간단", "compact"], ["상세", "detailed"]]) {
            const group = page.locator(".mobile-task-header").getByRole("group", { name: "보기 모드", exact: true });
            await expect(group.locator("legend")).toHaveCSS("clip-path", "none");
            await group.getByText(mode, { exact: true }).click();
            await expect(group.getByRole("radio", { name: mode, exact: true })).toBeChecked();
            for (const [label, layout] of layouts) {
                await page.locator(".mobile-task-header").getByRole("group", { name: "작업 보기", exact: true }).getByText(label, { exact: true }).click();
                await expect(page.locator(".mobile-task-header").getByRole("radio", { name: label, exact: true })).toBeChecked();
                await expect(bottom).toBeVisible();
                expect(new URL(page.url()).searchParams.get("taskLayout")).toBe(layout);
                expect(new URL(page.url()).searchParams.get("taskDensity")).toBe(density);
            }
        }
        await bottom.getByRole("button", { name: "더보기", exact: true }).click();
        await page.getByRole("dialog", { name: "더보기", exact: true }).getByRole("link", { name: "기획", exact: true }).click();
        await page.reload();
        expect(new URL(page.url()).searchParams.get("project")).toBe(b.id);
        await expect(page.locator(".mobile-project-name")).toHaveText(b.name);
        await page.setViewportSize({ width: 1440, height: 900 });
        for (const asset of ["favicon.svg", "favicon.ico"]) {
            const response = await context.request.get(`${base}/${asset}`);
            expect(response.ok()).toBeTruthy();
            expect(response.headers()["content-type"]).toMatch(/image\//);
            const local = await fs.readFile(path.join("web/public", asset));
            expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(createHash("sha256").update(local).digest("hex"));
        }

        // Use native mouse drags from card content, not synthetic drag events.
        await page.goto(`${base}/?project=${a.id}&view=tasks&taskScope=all&taskLayout=board&taskDensity=compact`);
        await page.getByRole("combobox", { name: "보드 정렬", exact: true }).selectOption("manual");
        const card = id => page.locator(`[data-kanban-card="${id}"]`);
        const doing = page.getByRole("region", { name: /^진행 중\s*\d+$/ });
        const readTask = async id => (await context.request.get(`${apiBase}/api/items/${id}`)).json();
        await card(task.id).locator(":scope > p").first().dragTo(doing, { targetPosition: { x: 80, y: 110 } });
        await expect.poll(async () => (await readTask(task.id)).data.state).toBe("in_progress");
        expect(new URL(page.url()).searchParams.get("item")).toBeNull();
        await page.getByRole("button", { name: `${task.title} 이동 되돌리기`, exact: true }).click();
        await expect.poll(async () => (await readTask(task.id)).data.state).toBe("todo");
        await card(undated.id).locator(":scope > p").last().dragTo(card(task.id), { targetPosition: { x: 60, y: 8 } });
        const todo = page.getByRole("region", { name: /^할 일\s*\d+$/ });
        await expect(todo.locator("[data-kanban-card]").first()).toHaveAttribute("data-kanban-card", undated.id);
        await page.reload();
        await expect(todo.locator("[data-kanban-card]").first()).toHaveAttribute("data-kanban-card", undated.id);
        await card(task.id).getByRole("button", { name: task.title, exact: true }).dragTo(doing, { targetPosition: { x: 80, y: 110 } });
        await expect.poll(async () => (await readTask(task.id)).data.state).toBe("in_progress");
        await page.getByRole("button", { name: `${task.title} 이동 되돌리기`, exact: true }).click();
        await expect.poll(async () => (await readTask(task.id)).data.state).toBe("todo");
        const unchanged = await readTask(task.id);
        // A drag gesture starting on a checkbox must not become a card drag.
        await card(task.id).getByRole("checkbox", { name: `${task.title} 일괄 선택`, exact: true }).dragTo(doing, { targetPosition: { x: 80, y: 110 } });
        expect((await readTask(task.id)).revision).toBe(unchanged.revision);
        await card(task.id).getByRole("checkbox", { name: `${task.title} 일괄 선택`, exact: true }).check();
        await expect(card(task.id).getByRole("checkbox", { name: `${task.title} 일괄 선택`, exact: true })).toBeChecked();
        await card(task.id).getByRole("checkbox", { name: `${task.title} 일괄 선택`, exact: true }).uncheck();
        await card(task.id).getByRole("button", { name: `${task.title} 작업 메뉴`, exact: true }).press("Enter");
        await expect(page.getByRole("menuitem", { name: "진행 중 열로 이동", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await card(task.id).click({position: {x: 5, y: 5}});
        await expect(page).toHaveURL(new RegExp(`item=${task.id}`));

        await page.goto(`${base}/?project=${a.id}&view=tasks&taskScope=all&taskLayout=list&taskDensity=detailed&item=${task.id}`);
        await page.getByRole("tab", { name: "편집", exact: true }).click();
        const body = page.getByRole("textbox", { name: "본문 · Markdown", exact: true });
        await expect(body).toBeVisible();
        await body.fill("보기 전환 중 유지할 미저장 초안");
        await page.getByRole("tab", { name: "보드", exact: true }).click();
        await expect(body).toHaveValue("보기 전환 중 유지할 미저장 초안");
        await page.getByRole("tab", { name: "캘린더", exact: true }).click();
        await expect(body).toHaveValue("보기 전환 중 유지할 미저장 초안");
        await page.goBack();
        await expect(body).toHaveValue("보기 전환 중 유지할 미저장 초안");
        await expect(page).toHaveURL(/taskLayout=board/);
        await page.screenshot({ path: path.join(shots, "board-draft.png"), fullPage: true });
        await page.goto(`${base}/?project=${a.id}&view=tasks&taskScope=all&taskLayout=calendar&taskDensity=compact`);
        await expect(page.getByRole("heading", { name: /날짜 없는 작업/ })).toBeVisible();
        await page.screenshot({ path: path.join(shots, "calendar.png"), fullPage: true });

        // Transfer a clean record through the actual shared UI and API.
        await page.goto(`${base}/?project=${a.id}&view=tasks&taskScope=all&taskLayout=list&taskDensity=detailed&item=${undated.id}`);
        await page.getByText("Note 참조 연결", { exact: true }).click();
        await page.getByRole("textbox", { name: "Note 문서 URL" }).fill("https://note.pydemia.ai/#/page/browser-qa");
        await page.getByRole("textbox", { name: "문서 revision · 선택" }).fill("a".repeat(64));
        await page.getByRole("textbox", { name: "본문 hash · 선택" }).fill("b".repeat(64));
        await page.getByRole("button", { name: "참조 연결", exact: true }).click();
        await expect(page.getByRole("link", { name: "Note에서 열기 · browser-qa" })).toHaveAttribute("href", "https://note.pydemia.ai/#/page/browser-qa");
        await page.getByRole("button", { name: "프로젝트 이동", exact: true }).last().click();
        const dialog = page.getByRole("dialog", { name: "프로젝트 이동", exact: true });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("combobox", { name: "대상 프로젝트" }).selectOption(b.id);
        await dialog.getByRole("button", { name: "이동 영향 미리보기" }).click();
        await expect(dialog.getByRole("button", { name: "전체 이동 확정" })).toBeEnabled();
        await page.screenshot({ path: path.join(shots, "transfer-preview.png"), fullPage: true });
        await dialog.getByRole("button", { name: "전체 이동 확정" }).click();
        await expect(dialog.getByText("1개 작업 이동 완료", { exact: true })).toBeVisible();
        const moved = await (await context.request.get(`${apiBase}/api/items/${undated.id}`)).json();
        expect(moved.project_id).toBe(b.id);
        await dialog.getByRole("button", { name: "조건 확인 후 되돌리기" }).click();
        await expect(dialog).not.toBeVisible();
        const restored = await (await context.request.get(`${apiBase}/api/items/${undated.id}`)).json();
        expect(restored.project_id).toBe(a.id);
        expect(restored.data.note_references[0].revision).toBe("a".repeat(64));

        await page.goto(`${base}/?project=${a.id}&view=tasks&taskScope=all&taskLayout=list&taskDensity=detailed`);
        const detailedFirst = await page.getByRole("button", { name: `${task.title} 제목 수정`, exact: true }).boundingBox();
        if (!detailedFirst || detailedFirst.y + detailedFirst.height > 900) throw new Error(`Detailed first task outside viewport: ${JSON.stringify(detailedFirst)}`);
        await page.getByRole("checkbox", { name: `${undated.title} 일괄 선택`, exact: true }).check();
        await page.getByRole("checkbox", { name: `${batchTask.title} 일괄 선택`, exact: true }).check();
        await page.locator(".task-bulk-toolbar").getByRole("button", { name: "프로젝트 이동", exact: true }).click();
        await dialog.getByRole("combobox", { name: "대상 프로젝트" }).selectOption(b.id);
        await dialog.getByRole("button", { name: "이동 영향 미리보기" }).click();
        await dialog.getByRole("button", { name: "전체 이동 확정" }).click();
        await expect(dialog.getByText("2개 작업 이동 완료", { exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: "조건 확인 후 되돌리기" }).click();
        await expect(dialog).not.toBeVisible();
        for (const id of [undated.id, batchTask.id]) expect((await (await context.request.get(`${apiBase}/api/items/${id}`)).json()).project_id).toBe(a.id);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${base}/?project=${a.id}&view=tasks&taskScope=all&taskLayout=list&taskDensity=compact`);
        await expect(page.getByRole("button", { name: `${task.title} 제목 수정`, exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(shots, "mobile-list.png"), fullPage: true });
        await expect(page.getByRole("checkbox", { name: `${batchTask.title} 완료`, exact: true })).toBeVisible();
        const completionBox = page.getByRole("checkbox", { name: `${batchTask.title} 완료`, exact: true });
        const boxBounds = await completionBox.boundingBox();
        expect(boxBounds.width).toBe(20); expect(boxBounds.height).toBe(20);
        const hitArea = page.locator("label.task-checkbox-target", {has: completionBox});
        const hitBounds = await hitArea.boundingBox();
        expect(hitBounds.width).toBeGreaterThanOrEqual(44); expect(hitBounds.height).toBeGreaterThanOrEqual(44);
        await hitArea.click({position: {x: 3, y: 3}});
        await expect(page.getByRole("button", { name: `${batchTask.title} 제목 수정`, exact: true })).toHaveCount(0);
        await page.getByRole("button", {name: `${task.title} 작업 메뉴`, exact: true}).click();
        await page.getByRole("menuitem", {name: "상세 열기", exact: true}).click();
        await page.getByRole("button", { name: "← 작업 목록", exact: true }).click();
        await expect(page.getByRole("button", { name: task.title, exact: true })).toBeFocused();
        for (const width of [320, 360, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            expect(overflow, `overflow at ${width}`).toBeLessThanOrEqual(1);
        }
        const touch = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, timezoneId: "Asia/Seoul", storageState: await context.storageState()});
        try {
            const phone = await touch.newPage();
            phone.on("pageerror", error => errors.push(error.message));
            await phone.goto(`${base}/?project=${a.id}&view=tasks&taskScope=all`);
            const mobileHeader = phone.locator(".mobile-task-header");
            await expect(mobileHeader.getByRole("radio", {name: "목록", exact: true})).toBeChecked();
            await expect(phone.locator(".task-list")).toBeVisible();
            await mobileHeader.getByRole("group", {name: "작업 보기", exact: true}).getByText("보드", {exact: true}).click();
            expect(await phone.getByRole("combobox", {name: "작업 보기", exact: true}).count()).toBe(0);
            const board = phone.locator(".task-kanban");
            const statusNav = phone.getByRole("navigation", {name: "보드 상태 열", exact: true});
            await expect(board.locator('[data-ui="kanban-column"]:visible')).toHaveCount(5);
            await expect.poll(() => board.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(500);
            const firstMobileCard = board.locator('[data-kanban-column="todo"] [data-kanban-card]').first();
            await firstMobileCard.scrollIntoViewIfNeeded();
            const bounds = await board.boundingBox();
            expect(bounds).not.toBeNull();
            const titleBounds = await firstMobileCard.locator(":scope > p").first().boundingBox();
            expect(titleBounds).not.toBeNull();
            const revisionBeforeSwipe = (await readTask(task.id)).revision;
            const undatedRevisionBeforeSwipe = (await readTask(undated.id)).revision;
            const cdp = await touch.newCDPSession(phone);
            const y = titleBounds.y + titleBounds.height / 2;
            const fromX = titleBounds.x + titleBounds.width - 15;
            const toX = bounds.x + 25;
            await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: fromX, y}]});
            for (let step = 1; step <= 10; step++) {
                await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: fromX + (toX - fromX) * step / 10, y}]});
                await phone.waitForTimeout(25);
            }
            await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
            await expect.poll(() => board.evaluate(element => element.scrollLeft)).toBeGreaterThan(150);
            expect((await readTask(task.id)).revision).toBe(revisionBeforeSwipe);
            expect((await readTask(undated.id)).revision).toBe(undatedRevisionBeforeSwipe);
            expect(new URL(phone.url()).searchParams.get("item")).toBeNull();
            await statusNav.getByRole("button", {name: /^취소/}).click();
            await expect(statusNav.getByRole("button", {name: /^취소/})).toHaveAttribute("aria-current", "true");
            await expect.poll(() => board.evaluate(element => element.scrollLeft)).toBeGreaterThan(900);
            await phone.reload();
            await expect(statusNav.getByRole("button", {name: /^취소/})).toHaveAttribute("aria-current", "true");
            await expect.poll(() => board.evaluate(element => element.scrollLeft)).toBeGreaterThan(900);
            await statusNav.getByRole("button", {name: /^할 일/}).click();
            await expect.poll(() => board.evaluate(element => element.scrollLeft)).toBe(0);
            const cardMenu = phone.locator(`[data-kanban-card="${task.id}"]`).getByRole("button", {name: `${task.title} 작업 메뉴`, exact: true});
            expect((await cardMenu.boundingBox()).height).toBeGreaterThanOrEqual(44);
            await cardMenu.tap();
            await phone.getByRole("menuitem", {name: "진행 중 열로 이동", exact: true}).tap();
            await expect.poll(async () => (await readTask(task.id)).data.state).toBe("in_progress");
            await expect(statusNav.getByRole("button", {name: /^진행 중/})).toHaveAttribute("aria-current", "true");
            await phone.getByRole("button", {name: `${task.title} 이동 되돌리기`, exact: true}).click();
            await expect.poll(async () => (await readTask(task.id)).data.state).toBe("todo");
            await expect(statusNav.getByRole("button", {name: /^할 일/})).toHaveAttribute("aria-current", "true");
            await mobileHeader.getByRole("group", {name: "작업 보기", exact: true}).getByText("보드", {exact: true}).tap();
            await phone.evaluate(() => window.scrollTo(0, 0));
            await expect.poll(() => phone.evaluate(() => window.scrollY)).toBe(0);
            await phone.screenshot({path: path.join(shots, "mobile-board-scroll.png"), fullPage: true});
            for (const width of [320, 360, 390, 430]) {
                await phone.setViewportSize({width, height: 844});
                expect(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), `board page overflow at ${width}`).toBeLessThanOrEqual(1);
                for (const name of ["목록", "보드", "캘린더", "집계"]) {
                    const segment = mobileHeader.getByRole("group", {name: "작업 보기", exact: true}).getByText(name, {exact: true});
                    const box = await segment.boundingBox();
                    expect(box && box.height, `touch target ${name} at ${width}`).toBeGreaterThanOrEqual(44);
                }
            }
            await phone.goto(`${base}/?view=tasks&taskLayout=board&taskDensity=compact`);
            await expect(phone.locator('.task-kanban [data-ui="kanban-column"]:visible')).toHaveCount(5);
            await expect.poll(() => phone.locator(".task-kanban").evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(500);
            const controlsProject = await post("/api/projects", {name: "목록 컨트롤 QA"});
            const checklist = await post(`/api/projects/${controlsProject.id}/items`, {kind: "task", title: "체크로 완료하는 개인 작업", data: {workflow: "personal", requires_test: false}});
            const implementation = await post(`/api/projects/${controlsProject.id}/items`, {kind: "task", title: "상태로 관리하는 구현 작업", body: "보존할 원본", data: {workflow: "delivery", requires_test: true}});
            await phone.goto(`${base}/?project=${controlsProject.id}&view=tasks&taskLayout=list&taskDensity=compact&taskStatus=all`);
            const personalControl = phone.getByRole("checkbox", {name: `${checklist.title} 완료`, exact: true});
            const personalTarget = phone.locator("label.task-checkbox-target", {has: personalControl});
            await personalTarget.tap({position: {x: 3, y: 3}});
            await expect.poll(async () => (await readTask(checklist.id)).data.state).toBe("done");
            const checkedControl = phone.getByRole("checkbox", {name: `${checklist.title} 다시 열기`, exact: true});
            await expect(checkedControl).toBeChecked();
            const checkedStyle = await checkedControl.evaluate(element => ({background: getComputedStyle(element).backgroundColor, icon: getComputedStyle(element.querySelector('svg')).color, iconWidth: element.querySelector('svg').getBoundingClientRect().width}));
            expect(checkedStyle.background).not.toBe("rgb(255, 255, 255)");
            expect(checkedStyle.icon).not.toBe(checkedStyle.background);
            expect(checkedStyle.iconWidth).toBeGreaterThan(0);
            const stateSelect = phone.getByRole("combobox", {name: `${implementation.title} 상태`, exact: true});
            await expect(stateSelect).toHaveValue("todo");
            const stateGeometry = await stateSelect.evaluate(element => ({select: element.getBoundingClientRect().toJSON(), arrow: element.parentElement.querySelector('svg').getBoundingClientRect().toJSON()}));
            expect(stateGeometry.arrow.right).toBeLessThanOrEqual(stateGeometry.select.right);
            expect(stateGeometry.arrow.left).toBeGreaterThanOrEqual(stateGeometry.select.left);
            await stateSelect.selectOption("in_progress");
            await expect(stateSelect).toHaveValue("in_progress");
            await expect.poll(async () => (await readTask(implementation.id)).data.state).toBe("in_progress");
            await stateSelect.selectOption("done");
            await expect(phone.getByText(/작업 상세에서 완료 근거/)).toBeVisible();
            await expect(stateSelect).toHaveValue("in_progress");
            const beforeCancel = await readTask(implementation.id);
            await stateSelect.selectOption("cancelled");
            const cancellation = phone.getByRole("dialog", {name: "작업 취소", exact: true});
            await expect(cancellation.getByRole("button", {name: "취소 확정", exact: true})).toBeDisabled();
            expect((await readTask(implementation.id)).revision).toBe(beforeCancel.revision);
            await cancellation.getByRole("button", {name: "돌아가기", exact: true}).click();
            expect((await readTask(implementation.id)).revision).toBe(beforeCancel.revision);
            await stateSelect.selectOption("cancelled");
            await cancellation.getByRole("textbox", {name: "취소 사유", exact: true}).fill("목록 컨트롤 검증");
            await cancellation.getByRole("button", {name: "취소 확정", exact: true}).click();
            await expect(cancellation).not.toBeVisible();
            await expect.poll(async () => (await readTask(implementation.id)).data.state).toBe("cancelled");
            expect((await readTask(implementation.id)).data.cancellation_reason).toBe("목록 컨트롤 검증");
            expect((await readTask(implementation.id)).body).toBe("보존할 원본");
            await stateSelect.selectOption("todo");
            await expect(stateSelect).toHaveValue("todo");
            await phone.reload();
            await expect(stateSelect).toHaveValue("todo");
            await phone.evaluate(() => window.scrollTo(0, 0));
            await phone.screenshot({path: path.join(shots, "mobile-list-controls.png"), fullPage: true});
        } finally { await touch.close(); }
        expect(errors).toEqual([]);
        console.log("Real app: native card title/description/handle drag, reorder persistence, control gesture guard/clicks, all four global layouts in both modes, mobile direct layout/density selectors + bottom navigation, touch-emulated card swipe without writes, horizontal project/global boards + column navigation/restore/move/undo, canonical project selection/menu/list/global return/reload/bare-return/mobile context, task visibility, draft/history, calendar undated, UI transfer/undo + DB location, mobile 320–430px passed. Note external API/LLM/production/physical-device touch not exercised.");
    } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
