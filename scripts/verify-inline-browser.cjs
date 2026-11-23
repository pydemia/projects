/* Real Edge + API + isolated PostgreSQL; Python launcher owns cleanup. */
const { chromium, expect } = require("../web/node_modules/@playwright/test");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const base = process.env.PROJECTS_WEB_URL;
const apiBase = process.env.PROJECTS_API_URL;
const shots = path.resolve("docs/implementation/screenshots/inline-editing");

async function main() {
    await fs.mkdir(shots, { recursive: true });
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Seoul", acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    const layoutFailures = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => void dialog.accept());
    const checkpoints = [];
    function checkpoint(label) { checkpoints.push(label); console.log(`PASS ${label}`); }
    try {
        const registered = await context.request.post(`${apiBase}/api/auth/register`, { data: { username: `inline_${randomUUID().slice(0, 8)}`, password: randomUUID() } });
        expect(registered.status()).toBe(201);
        const headers = { "X-CSRF-Token": (await registered.json()).csrf_token };
        async function request(method, url, data) {
            const response = await context.request.fetch(apiBase + url, { method, headers, data });
            expect(response.ok(), `${method} ${url} failed (${response.status()})`).toBeTruthy();
            return response.json();
        }
        const get = url => request("GET", url);
        const post = (url, data) => request("POST", url, data);
        const patch = (url, data) => request("PATCH", url, data);
        let project = await post("/api/projects", { name: "인라인 검증 프로젝트", goal: "합성 자료로 실제 편집을 확인합니다." });
        let task = await post(`/api/projects/${project.id}/items`, { kind: "task", title: "첫 인라인 작업", body: "# 작업 본문\n\n본문을 클릭해서 수정합니다.\n\n[참고 링크](https://example.org/)", data: { workflow: "personal", requires_test: false, estimated_minutes: 12 } });
        const checkbox = await post("/api/task-fields", { project_id: project.id, name: "브라우저 체크", type: "checkbox", options: [] });
        const number = await post("/api/task-fields", { project_id: project.id, name: "브라우저 숫자", type: "number", options: [] });
        const detailUrl = () => `${base}/?project=${project.id}&view=tasks&item=${task.id}&taskScope=all&taskLayout=list`;
        const taskUrl = layout => `${base}/?project=${project.id}&view=tasks&taskScope=all&taskLayout=${layout}`;
        const refreshTask = async () => { task = await get(`/api/items/${task.id}`); return task; };
        const record = () => page.locator("article.document-editor");
        const quick = () => record().getByRole("region", { name: "작업 속성", exact: true });
        async function transition(label, value, options = {}) {
            await quick().getByRole("button", { name: `${task.title} ${label} 편집`, exact: true }).click();
            const editor = page.getByRole("dialog", { name: `${label} 편집`, exact: true });
            await editor.getByRole("combobox", { name: label, exact: true }).selectOption(value);
            if (options.reason) await editor.getByRole("textbox", { name: "취소 사유", exact: true }).fill(options.reason);
            await editor.getByRole("button", { name: "저장", exact: true }).click();
            if (options.error) {
                await expect(editor).toBeVisible();
                await expect(editor.getByText(options.error)).toBeVisible();
                await editor.getByRole("button", { name: "닫기", exact: true }).click();
            } else await expect(editor).not.toBeVisible();
            await refreshTask();
            return editor;
        }
        async function field(label, edit) {
            await quick().getByRole("button", { name: `${task.title} ${label} 편집`, exact: true }).click();
            const editor = page.getByRole("dialog", { name: `${label} 편집`, exact: true });
            await edit(editor);
            await editor.getByRole("button", { name: "저장", exact: true }).click();
            await expect(editor).not.toBeVisible();
            await refreshTask();
        }
        async function overflow(label) {
            expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), label).toBeLessThanOrEqual(1);
        }
        async function screenshot(name) { await page.screenshot({ path: path.join(shots, name), fullPage: true }); }

        await page.goto(`${base}/?project=${project.id}&view=overview`);
        await page.getByRole("button", { name: "프로젝트명 수정", exact: true }).click();
        await page.getByRole("textbox", { name: "프로젝트명", exact: true }).fill("클릭으로 바꾼 프로젝트");
        await page.getByRole("textbox", { name: "프로젝트명", exact: true }).press("Enter");
        await expect.poll(async () => (await get(`/api/projects/${project.id}`)).name).toBe("클릭으로 바꾼 프로젝트");
        const renamed = await get(`/api/projects/${project.id}`);
        expect(renamed.version).toBe(project.version + 1);
        expect(renamed.goal).toBe(project.goal);
        project = renamed;
        await page.reload();
        await expect(page.getByRole("button", { name: "프로젝트명 수정", exact: true })).toContainText(project.name);
        await expect(page.locator(".crumb")).toContainText(project.name);
        await expect(page.locator(".sidebar")).toContainText(project.name);
        checkpoint("project overview rename, version and sidebar/header after reload");

        await page.goto(`${base}/?view=projects`);
        await page.getByRole("button", { name: `${project.name} 프로젝트 메뉴`, exact: true }).click();
        await expect(page.getByRole("menuitem", { name: "이름 수정", exact: true })).toBeVisible();
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("menuitem", { name: "프로젝트 ZIP 내려받기", exact: true }).click();
        const download = await downloadPromise;
        const zipPath = await download.path();
        expect((await fs.readFile(zipPath)).subarray(0, 2).toString()).toBe("PK");
        // Validate all CRCs and the manifest using Python's standard zip reader.
        execFileSync("uv", ["run", "python", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert any(n.endswith('manifest.json') for n in z.namelist())", zipPath], { stdio: "pipe", windowsHide: true });
        expect(await page.locator(".topbar").getByText(/ZIP/).count()).toBe(0);
        await page.getByRole("button", { name: `${project.name} 프로젝트 메뉴`, exact: true }).click();
        await page.getByRole("menuitem", { name: "이름 수정", exact: true }).click();
        await page.getByRole("textbox", { name: "프로젝트명", exact: true }).fill("메뉴에서 바꾼 프로젝트 이름");
        await page.getByRole("textbox", { name: "프로젝트명", exact: true }).press("Enter");
        await expect.poll(async () => (await get(`/api/projects/${project.id}`)).name).toBe("메뉴에서 바꾼 프로젝트 이름");
        project = await get(`/api/projects/${project.id}`);
        await page.goto(`${base}/?view=tasks&taskScope=all&taskLayout=list`);
        await expect(page.locator(".task-row").filter({ has: page.getByRole("button", { name: `${task.title} 제목 수정`, exact: true }) })).toContainText(project.name);
        checkpoint("project context menu rename and valid ZIP download; GNB has no ZIP action");

        await page.goto(`${base}/?view=settings`);
        await expect(page.getByRole("heading", { name: "화면 설정", exact: true })).toBeVisible();
        expect(new URL(page.url()).searchParams.has("project")).toBe(false);
        expect(await page.locator(".topbar").getByRole("combobox").count()).toBe(0);
        const design = page.getByRole("combobox", { name: "UI 모드", exact: true });
        const appearance = page.getByRole("combobox", { name: "색상 테마", exact: true });
        await design.selectOption("material");
        await appearance.selectOption("dark");
        await page.reload();
        await expect(design).toHaveValue("material");
        await expect(appearance).toHaveValue("dark");
        expect(new URL(page.url()).searchParams.has("project")).toBe(false);
        await design.selectOption("glass");
        checkpoint("dedicated preferences theme change persists and empty project stays empty");

        const longName = "폭이 좁아도 프로젝트 이름과 설정을 찾을 수 있는 긴 이름 ".repeat(3);
        project = await patch(`/api/projects/${project.id}`, { expected_version: project.version, name: longName });
        for (const width of [320, 390, 430, 768, 1024]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto(`${base}/?project=${project.id}&view=settings`);
            await expect(page.getByRole("heading", { name: "화면 설정", exact: true })).toBeVisible();
            if (width <= 760) {
                await expect(page.locator(".topbar .crumb")).not.toBeVisible();
                await expect(page.locator(".mobile-topbar")).toBeVisible();
                await expect(page.locator(".mobile-settings-link")).toHaveCount(0);
            }
            await overflow(`preferences/header long name ${width}`);
            if (width === 390) await screenshot("preferences-mobile.png");
            if (width === 768) await screenshot("header-768.png");
        }
        checkpoint("preferences and long-name header fit 320/390/430/768/1024px");

        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(taskUrl("list"));
        await expect(page.getByRole("textbox", { name: "빠른 할 일", exact: true })).toBeVisible();
        const padding = await page.locator(".task-compose").evaluate(card => {
            const element = card.querySelector("form");
            const form = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const bounds = card.getBoundingClientRect();
            return { left: form.left + parseFloat(style.paddingLeft) - bounds.left, right: bounds.right - form.right + parseFloat(style.paddingRight) };
        });
        if (padding.left < 12 || padding.right < 12) layoutFailures.push(`quick-add content inset ${JSON.stringify(padding)}`);
        const searchPadding = await page.getByRole("searchbox", { name: "작업 검색", exact: true }).evaluate(input => ({ left: parseFloat(getComputedStyle(input).paddingLeft), right: parseFloat(getComputedStyle(input).paddingRight) }));
        if (searchPadding.left < 12 || searchPadding.right < 12) layoutFailures.push(`search input padding ${JSON.stringify(searchPadding)}`);
        console.log(`LAYOUT ${JSON.stringify({ padding, searchPadding })}`);
        const originalTitle = task.title;
        await page.getByRole("button", { name: `${task.title} 제목 수정`, exact: true }).click();
        const listTitle = page.getByRole("textbox", { name: `${task.title} 제목`, exact: true });
        await listTitle.fill("목록에서 수정한 제목"); await listTitle.press("Enter");
        await expect.poll(async () => (await get(`/api/items/${task.id}`)).title).toBe("목록에서 수정한 제목");
        expect(new URL(page.url()).searchParams.get("item")).toBeNull();
        await refreshTask();
        expect(task.body).toContain("본문을 클릭해서");
        expect(task.title).not.toBe(originalTitle);
        checkpoint("task list title Enter save stays in list; quick-add/search padding measured");

        await page.goto(taskUrl("board"));
        const card = page.locator(`[data-kanban-card="${task.id}"]`);
        const boardTitle = card.getByRole("button", { name: `${task.title} 제목 수정`, exact: true });
        await boardTitle.click();
        const boardInput = card.getByRole("textbox", { name: `${task.title} 제목`, exact: true });
        await boardInput.fill("취소할 카드 제목"); await boardInput.press("Escape");
        await expect(boardTitle).toBeVisible();
        expect((await get(`/api/items/${task.id}`)).title).toBe(task.title);
        await boardTitle.dragTo(page.locator('[data-kanban-column="in_progress"]'), { targetPosition: { x: 80, y: 110 } });
        await expect.poll(async () => (await get(`/api/items/${task.id}`)).data.state).toBe("in_progress");
        await refreshTask();
        checkpoint("board title click/cancel preserves native card-title drag and server state");

        await page.goto(detailUrl());
        await expect(record().getByRole("heading", { name: task.title, exact: true })).toBeVisible();
        await record().getByRole("button", { name: "항목 제목 수정", exact: true }).click();
        const title = record().getByRole("textbox", { name: "항목 제목", exact: true });
        await title.fill("상세에서 바꾼 제목"); await title.press("Enter");
        await expect.poll(async () => (await get(`/api/items/${task.id}`)).title).toBe("상세에서 바꾼 제목");
        await expect(title).toHaveCount(0);
        await refreshTask();
        await record().locator(".inline-body-preview p").first().click();
        const body = record().getByRole("textbox", { name: "본문", exact: true });
        await body.fill("# 수정한 본문\n\n일반 본문을 클릭하고 Ctrl+Enter로 저장했습니다."); await body.press("Control+Enter");
        await expect(body).toHaveCount(0);
        await refreshTask();
        expect(task.body).toContain("Ctrl+Enter");
        checkpoint("detail title Enter and rendered Markdown click/Ctrl+Enter save");

        await field("계획일", editor => editor.locator('input[type="date"]').fill("2026-12-15"));
        expect(task.data.planned_date).toBe("2026-12-15");
        await field("예상 시간", editor => editor.getByRole("textbox", { name: "예상 시간", exact: true }).fill("0"));
        expect(task.data.estimated_minutes).toBe(0);
        await field("다음 행동", editor => editor.getByRole("checkbox", { name: "다음 행동", exact: true }).uncheck());
        expect(task.data.next_action).toBe(false);
        await field("브라우저 숫자", editor => editor.getByRole("textbox", { name: "브라우저 숫자", exact: true }).fill("0"));
        expect(task.data.custom_fields[number.id]).toBe(0);
        await field("브라우저 체크", editor => editor.getByRole("checkbox", { name: "브라우저 체크", exact: true }).check());
        expect(task.data.custom_fields[checkbox.id]).toBe(true);
        await field("브라우저 체크", editor => editor.getByRole("checkbox", { name: "브라우저 체크", exact: true }).uncheck());
        expect(task.data.custom_fields[checkbox.id]).toBe(false);
        checkpoint("detail dates, numeric zero, builtin/custom false and custom zero persist");

        await transition("상태", "cancelled", { error: /취소 사유를 입력/ });
        expect(task.data.state).toBe("in_progress");
        await transition("상태", "cancelled", { reason: "합성 작업의 취소 검증" });
        expect(task.data.cancellation_reason).toBe("합성 작업의 취소 검증");
        await transition("상태", "todo");
        await transition("유형", "delivery");
        expect(task.data.workflow).toBe("delivery");
        expect(task.data.requires_test).toBe(true);
        await transition("상태", "done", { error: /완료 조건과 결과 근거/ });
        expect(task.data.state).toBe("todo");
        await transition("유형", "personal");
        expect(task.data.requires_test).toBe(false);
        await transition("상태", "done");
        await transition("유형", "delivery", { error: /다시 연 뒤 유형/ });
        expect(task.data.workflow).toBe("personal");
        expect(task.data.state).toBe("done");
        await transition("상태", "todo");
        checkpoint("state/type transitions, cancellation reason, completion gates and unsafe done conversion");

        for (const editing of ["title", "body"]) {
            const label = editing === "title" ? "항목 제목" : "본문";
            await record().getByRole("button", { name: `${label} 수정`, exact: true }).click();
            const input = record().getByRole("textbox", { name: label, exact: true });
            const ownDraft = editing === "title" ? "충돌 뒤 보존한 제목" : "# 충돌 초안\n\n내 본문 초안을 보존했습니다.";
            await input.fill(ownDraft);
            const latest = await refreshTask();
            const changed = await patch(`/api/items/${task.id}/task-properties`, { expected_revision: latest.revision, values: { context: `${editing} 동시 저장 값` } });
            const responsePromise = page.waitForResponse(response => response.url().endsWith(`/api/items/${task.id}`) && response.request().method() === "PUT");
            await input.press(editing === "title" ? "Enter" : "Control+Enter");
            expect((await responsePromise).status()).toBe(409);
            const conflict = record().getByRole("region", { name: "동시 편집 충돌", exact: true });
            await expect(conflict).toBeVisible();
            await expect(input).toHaveValue(ownDraft);
            await conflict.getByRole("button", { name: "서버 최신 revision을 기준으로 병합 편집", exact: true }).click();
            await expect(input).toHaveValue(ownDraft);
            expect((await get(`/api/items/${task.id}`)).revision).toBe(changed.revision);
            await input.press(editing === "title" ? "Enter" : "Control+Enter");
            await expect(input).toHaveCount(0);
            await refreshTask();
            expect(task[editing]).toBe(ownDraft);
            expect(task.data.context).toBe(`${editing} 동시 저장 값`);
        }
        checkpoint("real title/body concurrent 409 preserves draft; explicit rebase + separate save preserves latest properties");

        await record().getByRole("button", { name: "본문 수정", exact: true }).click();
        await record().getByRole("textbox", { name: "본문", exact: true }).fill("# 브라우저 복원 초안\n\n저장하지 않은 본문입니다.");
        await page.reload();
        await expect(record().getByRole("textbox", { name: "본문", exact: true })).toHaveValue("# 브라우저 복원 초안\n\n저장하지 않은 본문입니다.");
        await page.goto(taskUrl("list"));
        await page.goto(detailUrl());
        await expect(record().getByRole("textbox", { name: "본문", exact: true })).toHaveValue("# 브라우저 복원 초안\n\n저장하지 않은 본문입니다.");
        await record().getByRole("textbox", { name: "본문", exact: true }).press("Escape");
        await expect(record().locator(".inline-body-preview")).toContainText("내 본문 초안");
        checkpoint("local inline body draft restores after reload and navigation within preview");
        await screenshot("detail-desktop.png");

        // Use the real preferences controls, then exercise actual mobile inputs.
        for (const color of ["light", "dark"]) {
            await page.goto(`${base}/?view=settings`);
            await appearance.selectOption(color);
            for (const width of [320, 390, 430]) {
                await page.setViewportSize({ width, height: 844 });
                await page.goto(detailUrl());
                await expect(record().getByRole("heading", { name: task.title, exact: true })).toBeVisible();
                await overflow(`detail ${color}/${width}`);
                if (width === 390) await screenshot(`detail-mobile-${color}.png`);
            }
        }
        await record().getByRole("button", { name: "항목 제목 수정", exact: true }).click();
        const mobileTitle = record().getByRole("textbox", { name: "항목 제목", exact: true });
        await mobileTitle.fill("모바일에서 바꾼 제목"); await mobileTitle.press("Enter");
        await expect(mobileTitle).toHaveCount(0); await refreshTask();
        expect(task.title).toBe("모바일에서 바꾼 제목");
        await record().locator(".inline-body-preview p").first().click();
        await record().getByRole("textbox", { name: "본문", exact: true }).fill("# 모바일 본문\n\n작은 화면에서 저장했습니다.");
        await record().locator(".inline-body-edit").getByRole("button", { name: "저장", exact: true }).click();
        await expect(record().getByRole("textbox", { name: "본문", exact: true })).toHaveCount(0); await refreshTask();
        await field("에너지", editor => editor.getByRole("combobox", { name: "에너지", exact: true }).selectOption("low"));
        expect(task.data.energy).toBe("low");
        await screenshot("detail-mobile-edited.png");
        checkpoint("mobile title/body/property saves and light/dark detail fit 320/390/430px");
        await page.getByRole("button", {name: "프로젝트 목록 열기", exact: true}).click();
        const projectPicker = page.getByRole("dialog", {name: "프로젝트 목록", exact: true});
        await projectPicker.getByRole("button", {name: `${project.name} 프로젝트 메뉴`, exact: true}).click();
        await page.getByRole("menuitem", {name: "이름 수정", exact: true}).click();
        const mobileProjectName = page.getByRole("textbox", {name: "프로젝트명", exact: true});
        await expect(mobileProjectName).toBeFocused();
        const renamePanel = page.getByRole("dialog", {name: "프로젝트명 수정", exact: true});
        const renameBounds = await renamePanel.boundingBox();
        expect(renameBounds.x).toBeGreaterThanOrEqual(0);
        expect(renameBounds.y).toBeGreaterThanOrEqual(0);
        expect(renameBounds.x + renameBounds.width).toBeLessThanOrEqual(431);
        expect(renameBounds.y + renameBounds.height).toBeLessThanOrEqual(845);
        await expect(renamePanel.getByRole("button", {name: "저장", exact: true})).toBeInViewport();
        await screenshot("project-picker-rename.png");
        await mobileProjectName.fill("모바일 프로젝트 이름");
        await mobileProjectName.press("Enter");
        await expect(mobileProjectName).toHaveCount(0);
        await expect.poll(async () => (await get(`/api/projects/${project.id}`)).name).toBe("모바일 프로젝트 이름");
        await expect(projectPicker.getByRole("link", {name: /모바일 프로젝트 이름/})).toBeVisible();
        checkpoint("mobile project picker menu supports focused inline rename without losing project context");
        expect(errors).toEqual([]);
        expect(layoutFailures).toEqual([]);
        console.log(`Real Edge + PostgreSQL: ${checkpoints.length} checkpoints passed. Synthetic data only. Hub, LLM, Note, deployment and physical devices not exercised.`);
    } catch (error) {
        await page.screenshot({ path: path.join(shots, "failure.png"), fullPage: true }).catch(() => {});
        console.error(`FAILED after: ${checkpoints.join("; ")}`);
        throw error;
    } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
