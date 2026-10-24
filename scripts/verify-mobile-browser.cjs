/* Real Projects UI + isolated PostgreSQL. The Python launcher owns cleanup. */
const { chromium, expect } = require("../web/node_modules/@playwright/test");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const base = process.env.PROJECTS_WEB_URL || "http://127.0.0.1:5174";
const apiBase = process.env.PROJECTS_API_URL || "http://127.0.0.1:18732";
const shots = path.resolve("docs/implementation/screenshots/mobile-experience");
const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

async function assertDialogFits(page, label) {
    const bounds = await page.getByRole("dialog").evaluate(element => {
        const rect = element.getBoundingClientRect();
        const visual = window.visualViewport;
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            visibleTop: visual?.offsetTop ?? 0, visibleBottom: (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight),
            visibleLeft: visual?.offsetLeft ?? 0, visibleRight: (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth) };
    });
    expect(bounds.top, `${label}: top`).toBeGreaterThanOrEqual(bounds.visibleTop - 1);
    expect(bounds.bottom, `${label}: bottom`).toBeLessThanOrEqual(bounds.visibleBottom + 1);
    expect(bounds.left, `${label}: left`).toBeGreaterThanOrEqual(bounds.visibleLeft - 1);
    expect(bounds.right, `${label}: right`).toBeLessThanOrEqual(bounds.visibleRight + 1);
}

async function main() {
    await fs.mkdir(shots, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
        const registered = await context.request.post(`${apiBase}/api/auth/register`, { data: { username: `mobile_${randomUUID().slice(0, 8)}`, password: randomUUID() } });
        expect(registered.status()).toBe(201);
        const session = await registered.json();
        const headers = { "X-CSRF-Token": session.csrf_token };
        const projectResponse = await context.request.post(`${apiBase}/api/projects`, { headers, data: { name: "모바일 QA", goal: "한 화면씩 실제 사용" } });
        expect(projectResponse.status()).toBe(201);
        const project = await projectResponse.json();
        async function create(kind, title, data = {}, body = "") {
            const response = await context.request.post(`${apiBase}/api/projects/${project.id}/items`, { headers, data: { kind, title, body, data } });
            expect(response.status(), `${kind}: ${await response.text()}`).toBe(201);
            return response.json();
        }
        const due = await create("task", "오늘 검토", { workflow: "personal", planned_date: day });
        await create("task", "오늘 마감", { workflow: "personal", due_date: day });
        const inbox = await create("task", "Inbox 수집", { workflow: "personal", list_name: "Inbox", state: "todo", requires_test: false });
        const review = await create("task", "보드 검토", { workflow: "personal", list_name: "Inbox", state: "in_review", requires_test: false });
        const doc = await create("artifact", "Application 설계 · 임시 문서", { artifact_type: "application-design" }, "# 모바일 본문\n\n원문을 유지합니다.");
        await create("requirement", "모바일 요건", { acceptance_criteria: ["한 화면씩 이동"] });
        await create("test_case", "모바일 검증", {});
        const workUrl = `${base}/?project=${project.id}&view=tasks&taskMode=simple&taskView=today`;
        await page.goto(workUrl);
        await expect(page.getByRole("navigation", { name: "모바일 주요 탐색" })).toBeVisible();
        await expect(page.locator(".mobile-task-header h1")).toHaveText("오늘");
        await expect(page.getByRole("link", { name: "오늘 검토" })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "프로젝트 메뉴" })).toBeHidden();
        await page.screenshot({ path: path.join(shots, "today-390.png"), fullPage: true });
        await page.locator(".mobile-task-header").getByRole("button", { name: "+ 추가" }).click();
        const add = page.getByRole("dialog", { name: "할 일 추가" });
        await assertDialogFits(page, "할 일 추가");
        await add.getByRole("textbox", { name: "할 일 제목" }).fill("모바일에서 추가");
        await add.getByRole("button", { name: "추가", exact: true }).click();
        await expect(page.getByRole("link", { name: "모바일에서 추가" })).toBeVisible();
        await page.getByRole("navigation", { name: "모바일 주요 탐색" }).getByRole("link", { name: "Inbox" }).click();
        await expect(page.locator(".mobile-task-header h1")).toHaveText("Inbox");
        await expect(page.getByRole("link", { name: "Inbox 수집" })).toBeVisible();
        await page.locator(".task-row", { hasText: "Inbox 수집" }).getByRole("button", { name: "오늘로" }).click();
        await page.getByRole("navigation", { name: "모바일 주요 탐색" }).getByRole("link", { name: "오늘" }).click();
        await expect(page.getByRole("link", { name: "Inbox 수집" })).toBeVisible();
        await page.locator(".task-row", { hasText: "Inbox 수집" }).getByRole("checkbox", { name: "Inbox 수집 완료" }).click();
        await expect(page.getByRole("link", { name: "Inbox 수집" })).toBeHidden();
        await page.reload();
        await expect(page.getByRole("link", { name: "Inbox 수집" })).toBeHidden();
        const completed = await (await context.request.get(`${apiBase}/api/items/${inbox.id}`)).json();
        expect(completed.data.planned_date).toBe(day);
        expect(completed.data.state).toBe("done");
        await page.getByRole("navigation", { name: "모바일 주요 탐색" }).getByRole("link", { name: "작업" }).click();
        await page.locator(".mobile-task-header").getByRole("combobox", { name: "작업 보기" }).selectOption("complex:board");
        await expect(page.getByRole("combobox", { name: "상태 열" })).toBeVisible();
        await page.getByRole("combobox", { name: "상태 열" }).selectOption("in_review");
        await expect(page.locator('[data-ui="kanban-column"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-ui="kanban-column"]:visible')).toContainText("보드 검토");
        await page.screenshot({ path: path.join(shots, "board-390.png"), fullPage: true });
        await page.getByRole("button", { name: "보드 검토 상태 메뉴" }).click();
        await page.getByRole("button", { name: "진행 중", exact: true }).click();
        await expect(page.getByRole("combobox", { name: "상태 열" })).toHaveValue("in_progress");
        const moved = await (await context.request.get(`${apiBase}/api/items/${review.id}`)).json();
        expect(moved.data.state).toBe("in_progress");
        await page.getByRole("button", { name: /보드 검토 이동 되돌리기/ }).click();
        await expect(page.getByRole("combobox", { name: "상태 열" })).toHaveValue("in_review");
        const restored = await (await context.request.get(`${apiBase}/api/items/${review.id}`)).json();
        expect(restored.data.state).toBe("in_review");
        await page.getByRole("button", { name: "+ 검토 중 작업" }).click();
        await page.getByRole("textbox", { name: "검토 중 새 작업 제목" }).fill("모바일 보드 생성");
        await page.locator('[data-ui="kanban-column"]:visible').getByRole("button", { name: "추가", exact: true }).tap();
        await expect(page.locator('[data-ui="kanban-column"]:visible')).toContainText("모바일 보드 생성");
        await page.getByRole("button", { name: "모바일 보드 생성 작업 메뉴" }).click();
        await page.getByRole("menuitem", { name: "위로 이동" }).click();
        await expect(page.locator('[data-ui="kanban-column"]:visible [data-kanban-card]').first()).toContainText("모바일 보드 생성");
        await page.locator(".mobile-task-header").getByRole("button", { name: "선택" }).click();
        await page.getByRole("checkbox", { name: "보드 검토 일괄 선택" }).click();
        await page.getByRole("checkbox", { name: "모바일 보드 생성 일괄 선택" }).click();
        await expect(page.locator(".mobile-selection-bar")).toContainText("선택 2개");
        await page.locator(".mobile-task-header").getByRole("button", { name: "보기·필터" }).click();
        const filter = page.getByRole("dialog", { name: "보기·필터" });
        await assertDialogFits(page, "보기·필터");
        await filter.getByRole("searchbox", { name: "작업 검색" }).fill("보드 검토");
        await filter.getByRole("button", { name: /결과 보기/ }).click();
        await expect(page.locator(".mobile-selection-bar")).toContainText("숨김 1개");
        await page.locator(".mobile-task-header").getByRole("button", { name: /보기·필터/ }).click();
        await filter.getByRole("searchbox", { name: "작업 검색" }).fill("");
        await filter.getByRole("button", { name: /결과 보기/ }).click();
        await page.locator(".mobile-selection-bar").getByRole("button", { name: "일괄 변경" }).click();
        const bulk = page.getByRole("dialog", { name: "2개 작업 일괄 변경" });
        await assertDialogFits(page, "일괄 변경");
        await bulk.getByRole("combobox", { name: "상태" }).selectOption("in_progress");
        await bulk.getByRole("button", { name: "상태 적용" }).click();
        await expect(page.locator(".mobile-selection-bar")).toBeHidden();
        const bulkMoved = await (await context.request.get(`${apiBase}/api/items/${review.id}`)).json();
        expect(bulkMoved.data.state).toBe("in_progress");
        await page.getByRole("combobox", { name: "상태 열" }).selectOption("in_progress");
        await page.locator(".mobile-task-header").getByRole("button", { name: "선택" }).click();
        await page.getByRole("checkbox", { name: "보드 검토 일괄 선택" }).click();
        await page.getByRole("checkbox", { name: "모바일 보드 생성 일괄 선택" }).click();
        await page.locator(".mobile-selection-bar").getByRole("button", { name: "일괄 변경" }).click();
        const changedElsewhere = await context.request.put(`${apiBase}/api/items/${review.id}`, { headers, data: {
            expected_revision: bulkMoved.revision, title: bulkMoved.title, body: bulkMoved.body,
            data: { ...bulkMoved.data, goal: "다른 화면에서 수정" },
        } });
        expect(changedElsewhere.status()).toBe(200);
        await bulk.getByLabel("실행 예정일").fill(day);
        await bulk.getByRole("button", { name: "날짜 적용" }).click();
        await expect(bulk.getByRole("alert")).toContainText(/변경|최신|충돌/);
        await expect(bulk.getByLabel("실행 예정일")).toHaveValue(day);
        await expect(page.locator(".mobile-selection-bar")).toContainText("선택 2개");
        await bulk.getByRole("button", { name: "대화상자 닫기" }).click();
        await page.locator(".task-error-block").getByRole("button", { name: "알림 닫기" }).click();
        await page.getByRole("navigation", { name: "모바일 주요 탐색" }).getByRole("button", { name: "더보기" }).click();
        await expect(page.getByRole("dialog", { name: "더보기" })).toBeVisible();
        await assertDialogFits(page, "더보기");
        await page.screenshot({ path: path.join(shots, "more-390.png"), fullPage: true });
        await page.getByRole("navigation", { name: "다른 업무 화면" }).getByRole("link", { name: /임시 문서/ }).click({ timeout: 5000 });
        await expect(page.getByRole("link", { name: /Application 설계 · 임시 문서/ })).toBeVisible();
        await expect(page.locator(".workspace-detail")).toBeHidden();
        await page.getByRole("link", { name: /Application 설계 · 임시 문서/ }).click();
        await expect(page.locator(".workspace-collection")).toBeHidden();
        await expect(page.getByRole("heading", { name: doc.title, exact: true })).toBeVisible();
        await page.getByRole("tab", { name: "편집" }).click();
        await page.getByRole("textbox", { name: /본문 · Markdown/ }).fill("# 모바일 미저장 초안");
        await page.getByRole("button", { name: /임시 문서 목록/ }).click();
        await expect(page.getByRole("link", { name: /Application 설계 · 임시 문서/ })).toBeVisible();
        await page.getByRole("link", { name: /Application 설계 · 임시 문서/ }).click();
        await expect(page.getByRole("textbox", { name: /본문 · Markdown/ })).toHaveValue("# 모바일 미저장 초안");
        await page.getByRole("button", { name: /임시 문서 목록/ }).click();
        await page.screenshot({ path: path.join(shots, "documents-390.png"), fullPage: true });
        await page.goto(`${base}/?project=${project.id}&view=planning&kind=requirement`);
        await page.getByRole("link", { name: /모바일 요건/ }).click();
        await expect(page.locator(".workspace-collection")).toBeHidden();
        await page.locator(".document-layout .mobile-detail-back").click();
        await expect(page.getByRole("link", { name: /모바일 요건/ })).toBeVisible();
        await page.goto(`${base}/?project=${project.id}&view=tests`);
        await page.getByRole("link", { name: /모바일 검증/ }).click();
        await expect(page.locator(".workspace-collection")).toBeHidden();
        await page.locator(".document-layout .mobile-detail-back").click();
        await expect(page.getByRole("link", { name: /모바일 검증/ })).toBeVisible();
        await page.goto(`${base}/?project=${project.id}&view=runs`);
        await page.getByRole("link", { name: "+ 새 실행" }).click();
        await expect(page.locator(".workspace-collection")).toBeHidden();
        await page.getByRole("button", { name: /실행 이력/ }).click();
        await expect(page.locator(".workspace-collection")).toBeVisible();
        for (const width of [320, 360, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            for (const view of ["tasks", "documents", "planning", "tests", "trace", "runs", "overview"]) {
                await page.goto(`${base}/?project=${project.id}&view=${view}${view === "tasks" ? "&taskMode=complex&taskView=calendar" : ""}`);
                await expect(page.locator("main.page")).toBeVisible();
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
                expect(overflow, `${width}px ${view} page overflow`).toBeLessThanOrEqual(1);
            }
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${base}/?project=${project.id}&view=tasks&taskMode=complex&taskView=calendar`);
        await expect(page.getByRole("group", { name: "주간 날짜" })).toBeVisible();
        await expect(page.locator(".task-calendar-grid")).toBeHidden();
        await expect(page.locator(".mobile-calendar-agenda")).toContainText("오늘 마감");
        await expect(page.locator(".mobile-calendar-agenda")).toContainText("마감");
        await page.screenshot({ path: path.join(shots, "calendar-390.png"), fullPage: true });
        await page.setViewportSize({ width: 320, height: 568 });
        await page.goto(workUrl);
        await expect(page.getByRole("link", { name: "오늘 검토" })).toBeVisible();
        const firstTask = await page.getByRole("link", { name: "오늘 검토" }).boundingBox();
        expect(firstTask.y).toBeLessThan(568 - 68);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${base}/?project=${project.id}&view=tasks&taskMode=complex&taskView=board`);
        await expect(page.getByRole("navigation", { name: "프로젝트 메뉴" })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "모바일 주요 탐색" })).toBeHidden();
        await expect(page.locator('[data-ui="kanban-column"]:visible')).toHaveCount(5);
        await page.screenshot({ path: path.join(shots, "desktop-1440.png"), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(workUrl);
        await page.getByRole("navigation", { name: "모바일 주요 탐색" }).getByRole("button", { name: "더보기" }).click();
        const more = page.getByRole("dialog", { name: "더보기" });
        const design = more.getByRole("combobox", { name: "UI 모드" });
        const designs = await design.locator("option").evaluateAll(options => options.map(option => option.value));
        expect(designs.length).toBe(21);
        for (const id of [designs[0], designs[10], designs[20]]) {
            await design.selectOption(id);
            await expect(page.locator(".projects-theme")).toHaveAttribute("data-design", id);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            expect(overflow, `${id} theme overflow`).toBeLessThanOrEqual(1);
        }
        await design.selectOption(designs[0]);
        const appearance = more.getByRole("combobox", { name: "색상 테마" });
        await appearance.selectOption("dark");
        await expect(page.locator(".projects-theme")).toHaveAttribute("data-appearance", "dark");
        await expect.poll(() => more.getByRole("button", { name: "대화상자 닫기" }).evaluate(element => getComputedStyle(element).color)).toBe("rgb(233, 238, 242)");
        await expect(more.getByRole("button", { name: "프로젝트 ZIP" })).toHaveCSS("color", "rgb(233, 238, 242)");
        await page.screenshot({ path: path.join(shots, "theme-dark-390.png"), fullPage: true });
        await appearance.selectOption("light");
        await expect(page.locator(".projects-theme")).toHaveAttribute("data-appearance", "light");
        await appearance.selectOption("system");
        await expect(appearance).toHaveValue("system");
        const favicon = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
        expect(favicon).toBeTruthy();
        const icon = await context.request.get(new URL(favicon, base).toString());
        expect(icon.status()).toBe(200);
        expect(icon.headers()["content-type"]).toContain("image/svg+xml");
        await more.getByRole("button", { name: "대화상자 닫기" }).click();
        await expect(page.getByRole("navigation", { name: "모바일 주요 탐색" }).getByRole("button", { name: "더보기" })).toBeFocused();
        expect(errors).toEqual([]);
        console.log(`Mobile browser: isolated PostgreSQL, Today/Inbox/add/complete, board move/reorder/undo/quick/bulk/409, document draft/back, 320–430px, themes, favicon and desktop passed; items ${due.id}, ${inbox.id}`);
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
