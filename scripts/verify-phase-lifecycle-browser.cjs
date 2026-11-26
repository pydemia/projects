/* Real Edge + loopback API + disposable PostgreSQL Phase and archive regression. */
const {chromium, expect: playwrightExpect} = require("../web/node_modules/@playwright/test");
const {randomUUID} = require("node:crypto");
const expect = playwrightExpect.configure({timeout: 15000});
const base = process.env.PROJECTS_WEB_URL;
const apiBase = process.env.PROJECTS_API_URL;
const secrets = new Set();
function safeError(error) {
    let text = String(error?.stack ?? error);
    for (const secret of secrets) text = text.replaceAll(secret, "[redacted]");
    return text;
}
async function main() {
    if (!base || !apiBase) throw new Error("Run with scripts/verify-mobile-browser.py verify-phase-lifecycle-browser.cjs");
    const browser = await chromium.launch({channel: "msedge", headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, timezoneId: "Asia/Seoul"});
    const page = await context.newPage();
    const errors = [], checks = [];
    page.on("pageerror", error => errors.push(error.message));
    const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
    try {
        const password = randomUUID(); secrets.add(password);
        const registered = await context.request.post(apiBase + "/api/auth/register", {data: {username: `phaseqa_${randomUUID().slice(0, 8)}`, password}});
        expect(registered.status()).toBe(201);
        const headers = {"X-CSRF-Token": (await registered.json()).csrf_token};
        async function request(method, path, data) {
            const response = await context.request.fetch(apiBase + path, {method, headers, data});
            expect(response.ok(), `${method} ${path} (${response.status()})`).toBe(true);
            return response.json();
        }
        const project = await request("POST", "/api/projects", {name: "Phase 브라우저 검증", goal: "합성 회귀 검증"});
        const first = await request("POST", `/api/projects/${project.id}/schedules`, {kind: "phase", title: "Phase 1"});
        const second = await request("POST", `/api/projects/${project.id}/schedules`, {kind: "phase", title: "Phase 2", predecessor_id: first.id});
        const task = await request("POST", `/api/projects/${project.id}/items`, {kind: "task", title: "이어지는 실제 Task", body: "", data: {workflow: "personal", requires_test: false, state: "in_progress"}});
        const schedulesUrl = `${base}/?project=${project.id}&view=schedules`;
        const taskUrl = `${base}/?project=${project.id}&view=tasks&item=${task.id}`;
        const settingsUrl = `${base}/?project=${project.id}&view=project-settings`;

        await page.goto(taskUrl);
        const field = page.getByRole("group", {name: "Phase", exact: true});
        await expect(field).toBeVisible();
        const savePhases = field.getByRole("button", {name: "Phase 연결 저장", exact: true});
        await expect(savePhases).toBeDisabled(); // Initial schedule load must settle before editing it.
        await field.getByLabel("Phase 1", {exact: true}).check();
        await field.getByLabel("Phase 2", {exact: true}).check();
        await expect(savePhases).toBeEnabled();
        const phaseSave = page.waitForResponse(response => response.url().includes(`/api/projects/${project.id}/task-phases/${task.id}`) && response.request().method() === "PUT");
        const refreshedSchedules = page.waitForResponse(response => response.url().includes(`/api/projects/${project.id}/schedules`) && response.request().method() === "GET");
        await savePhases.click();
        const savedResponse = await phaseSave;
        expect(savedResponse.status()).toBe(200);
        expect(JSON.parse(savedResponse.request().postData() ?? "{}"), "TaskPhaseField request payload").toMatchObject({phase_ids: [first.id, second.id], expected_revisions: {[first.id]: first.revision, [second.id]: second.revision}});
        expect((await savedResponse.json()).phase_ids).toEqual([first.id, second.id]);
        const refreshedRows = await (await refreshedSchedules).json();
        await expect(savePhases).toBeDisabled();
        expect(await field.getByRole("alert").count(), "Phase selection save error").toBe(0);
        let listed = await request("GET", `/api/projects/${project.id}/schedules`);
        const memberIds = rows => rows.filter(row => row.id === first.id || row.id === second.id).map(row => row.member_ids);
        if (!memberIds(refreshedRows).every(ids => ids.includes(task.id)) || !memberIds(listed).every(ids => ids.includes(task.id))) {
            throw new Error(`Task Phase membership did not persist after UI PUT; payload=${savedResponse.request().postData()} ui-refetch=${JSON.stringify(memberIds(refreshedRows))} api-refetch=${JSON.stringify(memberIds(listed))}`);
        }
        pass("actual task detail selects two Phase checkboxes and persists one Task membership in both Phase records");

        await page.goto(settingsUrl);
        await page.getByRole("button", {name: "프로젝트 보관", exact: true}).click();
        const archive = page.getByRole("dialog", {name: "프로젝트 보관", exact: true});
        await expect(archive).toContainText("열린 Task가 1개 있습니다");
        await archive.getByRole("button", {name: "미완료 Task 보기", exact: true}).click();
        await expect(page).toHaveURL(/view=tasks/);
        await page.goto(settingsUrl);
        await page.getByRole("button", {name: "프로젝트 보관", exact: true}).click();
        await archive.getByRole("button", {name: "그대로 보관", exact: true}).click();
        await expect(page.getByText("보관된 프로젝트 · 업무 자료 읽기 전용", {exact: true})).toBeVisible();
        await page.getByRole("button", {name: "프로젝트 복원", exact: true}).click();
        await expect(page.getByRole("dialog", {name: "프로젝트 복원", exact: true})).toBeVisible();
        await page.getByRole("dialog", {name: "프로젝트 복원", exact: true}).getByRole("button", {name: "변경 확인", exact: true}).click();
        await expect(page.getByText("프로젝트를 복원했습니다.", {exact: true})).toBeVisible();
        listed = await request("GET", `/api/projects/${project.id}/schedules`);
        expect(listed.find(row => row.id === first.id).member_ids).toContain(task.id);
        expect(listed.find(row => row.id === second.id).member_ids).toContain(task.id);
        pass("archive warning counts one open Task, review route leaves project unchanged, archive-as-is and restore retain Phase memberships");

        await page.goto(schedulesUrl);
        // Phase 2's predecessor hint mentions Phase 1, so scope each action by its stable list order.
        const phaseRows = page.locator("article.schedule-row");
        const firstRow = phaseRows.nth(0), secondRow = phaseRows.nth(1);
        await expect(firstRow.locator(".schedule-row-heading > strong")).toHaveText("Phase 1");
        await expect(secondRow.locator(".schedule-row-heading > strong")).toHaveText("Phase 2");
        await firstRow.getByRole("button", {name: "시작", exact: true}).click();
        await expect(firstRow.getByText("진행 중", {exact: true})).toBeVisible();
        await secondRow.getByRole("button", {name: "시작", exact: true}).click();
        await expect(page.getByRole("alert")).toContainText("선행");
        await expect(secondRow.getByText("시작 전", {exact: true})).toBeVisible();
        pass("predecessor starts through the real UI and successor start is rejected before predecessor closure");

        const carryover = firstRow.getByLabel(/이어지는 실제 Task · Carryover 대상/);
        await carryover.selectOption(second.id);
        await firstRow.getByRole("button", {name: "종료", exact: true}).click();
        await expect(firstRow.getByText("종료", {exact: true})).toBeVisible();
        await expect(firstRow.getByRole("region", {name: "Task 종료 결과", exact: true})).toContainText(`Carryover → Phase 2`);
        await secondRow.getByRole("button", {name: "시작", exact: true}).click();
        await expect(secondRow.getByText("진행 중", {exact: true})).toBeVisible();
        await expect(firstRow.getByText("다음 Phase가 이미 시작되어 재개할 수 없습니다.", {exact: true})).toBeVisible();
        expect(await firstRow.getByRole("button", {name: "재개", exact: true}).count()).toBe(0);
        listed = await request("GET", `/api/projects/${project.id}/schedules`);
        const closed = listed.find(row => row.id === first.id);
        expect(closed.phase.status).toBe("closed");
        expect(closed.phase.results).toEqual(expect.arrayContaining([expect.objectContaining({task_id: task.id, result: "carryover", target_phase_id: second.id})]));
        pass("open Task carries over through close UI, successor starts, and predecessor reopen is unavailable after successor start");
        expect(errors).toEqual([]);
        console.log(`Real Edge + local password session + disposable PostgreSQL: ${checks.length} Phase/archive checkpoints passed. No production services, external accounts, screenshots, or physical devices were used.`);
    } finally {await context.close(); await browser.close();}
}
main().catch(error => {console.error(safeError(error)); process.exitCode = 1;});
