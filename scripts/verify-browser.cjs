/* Actual API/browser checks. Creates only a new QA account/project. */
const { chromium, expect } = require("../web/node_modules/@playwright/test");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
    const base = process.env.PROJECTS_WEB_URL || "http://127.0.0.1:5173";
    const browser = await chromium.launch({
        headless: true,
        ...(process.platform === "win32" ? { channel: "msedge" } : {}),
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const directory = path.resolve("docs/implementation/screenshots");
    await fs.mkdir(directory, { recursive: true });
    const checks = [];
    try {
        await page.goto(base);
        await page.getByRole("navigation", { name: "계정 작업" }).getByRole("button", { name: "계정 만들기" }).click();
        await page.getByLabel("사용자 이름", { exact: true }).fill(`qa_${randomUUID().slice(0, 8)}`);
        await page.getByLabel("사용자 이름", { exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(page.getByLabel("비밀번호", { exact: true })).toBeFocused();
        await page.getByLabel("비밀번호", { exact: true }).fill(randomUUID());
        await page.locator("form").getByRole("button", { name: "계정 만들기" }).click();
        await expect(page.getByRole("heading", { name: "프로젝트", exact: true })).toBeVisible();
        checks.push("실제 계정 생성·세션");
        await page.getByRole("button", { name: "+ 프로젝트 만들기", exact: true }).first().click();
        const modal = page.getByRole("dialog");
        await modal.getByLabel("프로젝트 이름", { exact: true }).fill("실제 브라우저 검증");
        await modal.getByLabel("목표", { exact: true }).fill("아이디어부터 구현·테스트 근거까지 저장과 충돌을 확인합니다.");
        await modal.getByRole("button", { name: "프로젝트 만들기", exact: true }).click();
        await expect(page.getByRole("heading", { name: "실제 브라우저 검증", exact: true })).toBeVisible();
        const projectId = new URL(page.url()).searchParams.get("project");
        const sessionResponse = await context.request.get(`${base}/api/session`);
        const session = await sessionResponse.json();
        const headers = { "X-CSRF-Token": session.csrf_token };
        async function create(kind, title, body = "", data = {}) {
            const response = await context.request.post(`${base}/api/projects/${projectId}/items`, {
                headers, data: { kind, title, body, data },
            });
            expect(response.status()).toBe(201);
            return response.json();
        }
        const idea = await create("idea", "긴 한국어 아이디어를 기존 기능과 연결해 요건·설계·구현 계획에 반영하는 흐름", "원문을 보존합니다.");
        const requirement = await create("requirement", "기존 본문 보존", "선택한 변경만 반영합니다.", { acceptance_criteria: ["새로고침 후 본문 보존"] });
        const document = await create("artifact", "Application 설계 · 임시 문서", "# 편집 범위\n\n선택한 절만 수정합니다.\n\n<img src=x onerror=\"window.__xss=1\">", { artifact_type: "module-design", template_ref: "ARC42" });
        const task = await create("task", "저장 충돌과 초안 보존 구현", "현재 기준을 확인합니다.", { acceptance_criteria: ["409에서 양쪽 보존"], requires_test: false });
        const testCase = await create("test_case", "새로고침과 동시 저장", "", { steps: ["본문 수정", "새로고침", "동시 저장"], expected: "원문·초안 보존" });
        for (const [source, target, relation] of [[document, requirement, "implements"], [task, requirement, "implements"], [testCase, task, "verifies"], [testCase, requirement, "verifies"], [requirement, idea, "source"]]) {
            const response = await context.request.post(`${base}/api/projects/${projectId}/links`, { headers, data: { source_id: source.id, target_id: target.id, relation } });
            expect(response.status()).toBe(201);
        }
        checks.push("프로젝트·아이디어·요구·문서·작업·케이스 실제 저장·연결");
        const documentUrl = `${base}/?project=${projectId}&view=documents&item=${document.id}`;
        await page.goto(documentUrl);
        await expect(page.getByRole("heading", { name: document.title, exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "편집 범위", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "revision 이력", exact: true })).toHaveCount(0);
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
        await page.getByRole("button", { name: "편집", exact: true }).click();
        const documentKind = page.getByLabel("문서 종류", { exact: true });
        await expect(documentKind.locator('optgroup[label="핵심 산출물 7종"] option')).toHaveCount(7);
        for (const profile of ["functional-plan", "ui-plan", "system-architecture", "infra-design", "application-design", "interface-design", "implementation-plan"]) {
            await documentKind.selectOption(profile);
            await expect(documentKind).toHaveValue(profile);
        }
        await documentKind.selectOption("application-design");
        await documentKind.focus();
        await page.keyboard.press("Tab");
        await expect(page.getByLabel("참조 양식", { exact: true })).toBeFocused();
        checks.push("핵심 문서 7종 선택·양식 연결");
        checks.push("계정·문서 폼의 키보드 Tab 이동과 명시 label");
        const body = page.getByLabel("본문 · Markdown", { exact: true });
        await body.fill("# 수정한 임시 문서\n\n독립된 Note 연계 전까지 본문을 보관합니다.");
        await page.getByRole("button", { name: "초안 저장", exact: true }).click();
        await expect(page.getByText("revision 2", { exact: true })).toBeVisible();
        await page.reload();
        await page.getByRole("button", { name: "편집", exact: true }).click();
        await expect(documentKind).toHaveValue("application-design");
        await expect(body).toHaveValue(/독립된 Note/);
        checks.push("임시 문서 저장·새로고침·HTML 비실행");
        const myDraft = "# 내 미저장 초안\n\n다른 세션의 수정과 비교합니다.";
        await body.fill(myDraft);
        const current = await (await context.request.get(`${base}/api/items/${document.id}`)).json();
        const updated = await context.request.put(`${base}/api/items/${document.id}`, {
            headers, data: { expected_revision: current.revision, title: current.title, body: "# 다른 세션 수정", data: current.data },
        });
        expect(updated.status()).toBe(200);
        await page.getByRole("button", { name: "초안 저장", exact: true }).click();
        await expect(page.getByRole("region", { name: "동시 편집 충돌" })).toBeVisible();
        await expect(body).toHaveValue(myDraft);
        await page.getByRole("button", { name: "서버 최신 revision을 기준으로 병합 편집", exact: true }).click();
        await body.fill("# 병합한 임시 문서\n\n내 초안과 다른 세션의 수정을 모두 확인했습니다.");
        await page.getByRole("button", { name: "초안 저장", exact: true }).click();
        await expect(page.getByText("revision 4", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "본문", exact: true }).click();
        await page.screenshot({ path: path.join(directory, "document-desktop.png"), fullPage: true });
        checks.push("실제 409·내 초안 보존·명시 병합");
        await page.goto(`${base}/?project=${projectId}&view=tasks&item=${task.id}`);
        await page.getByRole("button", { name: "편집", exact: true }).click();
        await page.getByLabel("작업 상태", { exact: true }).selectOption("cancelled");
        await page.getByLabel("작업 취소 사유", { exact: true }).fill("중복 작업으로 이번 범위에서 제외");
        await page.getByRole("button", { name: "초안 저장", exact: true }).click();
        await expect(page.getByText("revision 2", { exact: true })).toBeVisible();
        const cancelledTask = await (await context.request.get(`${base}/api/items/${task.id}`)).json();
        expect(cancelledTask.data.cancellation_reason).toBe("중복 작업으로 이번 범위에서 제외");
        const summary = await (await context.request.get(`${base}/api/projects/${projectId}/summary`)).json();
        expect(summary.tasks).toEqual({ done: 0, total: 0, cancelled: 1 });
        checks.push("작업 취소 사유 저장·취소 건수와 분모 제외");
        for (const [width, height, name] of [[1440, 1080, "desktop"], [390, 844, "mobile"]]) {
            await page.setViewportSize({ width, height });
            for (const [view, item] of [["overview", ""], ["planning", idea.id], ["documents", document.id], ["tasks", task.id], ["tests", testCase.id], ["trace", ""], ["runs", ""]]) {
                await page.goto(`${base}/?project=${projectId}&view=${view}&item=${item}`);
                await expect(page.locator("main h1").first()).toBeVisible();
                await expect(page.getByText("프로젝트 내용 불러오는 중…", { exact: true })).toHaveCount(0);
                if (view === "documents") await expect(page.getByRole("heading", { name: "병합한 임시 문서", exact: true })).toBeVisible();
                if (view === "overview") await expect(page.getByText("작업 완료", { exact: true })).toBeVisible();
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
                expect(overflow, `${name}/${view}: page overflow`).toBeLessThanOrEqual(1);
                if (["documents", "overview"].includes(view)) await page.screenshot({ path: path.join(directory, `${view}-${name}.png`), fullPage: true });
            }
        }
        checks.push("1440/390px에서 7개 업무 화면·페이지 가로 넘침 없음");
        await page.setViewportSize({ width: 1440, height: 1080 });
        await page.goto(`${base}/?project=${projectId}&view=trace`);
        await expect(page.getByRole("heading", { name: "요구사항 연결표", exact: true })).toBeVisible();
        await page.getByLabel("새 기준선 이름", { exact: true }).fill("브라우저 검증 기준");
        await page.getByRole("button", { name: "현재 revision 묶음 저장", exact: true }).click();
        await expect(page.getByLabel("저장한 기준선", { exact: true })).toHaveValue(/[a-f0-9-]{36}/);
        const baselines = await (await context.request.get(`${base}/api/projects/${projectId}/baselines`)).json();
        expect(baselines[0].name).toBe("브라우저 검증 기준");
        expect(baselines[0].revisions[document.id]).toBe(4);
        checks.push("추적·변경과 기준선 실제 저장");
        await page.goto(`${base}/?project=${projectId}&view=runs`);
        await page.getByText("문서 종류와 양식·예시 참조 선택", { exact: true }).click();
        await page.getByLabel("문서 종류", { exact: true }).selectOption("implementation-plan");
        await expect(page.getByRole("button", { name: "+ development-workflow", exact: true })).toBeVisible();
        checks.push("새 스킬 작업의 문서 종류별 원문 스킬 추천");
        expect(errors).toEqual([]);
        checks.push("페이지 JavaScript 오류 없음");
        const result = { checked_at: new Date().toISOString(), project_id: projectId, browser: await browser.version(), checks };
        await fs.writeFile(path.join(directory, "browser-checks.json"), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    } finally {
        await context.close();
        await browser.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
