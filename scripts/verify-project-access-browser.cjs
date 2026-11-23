/* Real Edge, password sessions and API; Python launcher owns isolated PostgreSQL cleanup. */
const {chromium, expect: playwrightExpect} = require("../web/node_modules/@playwright/test");
const {randomUUID} = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const expect = playwrightExpect.configure({timeout: 12000});
const base = process.env.PROJECTS_WEB_URL;
const apiBase = process.env.PROJECTS_API_URL;
const shots = path.resolve("docs/implementation/screenshots/project-access");
const pass = label => console.log("PASS " + label);
const secrets = new Set();
function safeError(error) {
    let message = String(error?.stack ?? error).replace(/((?:invitationToken|ownershipToken)(?:=|%3D))[^&#\s"')]+/gi, "$1[redacted]");
    for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[redacted]");
    return message;
}

async function main() {
    if (!base || !apiBase) throw new Error("Run with the disposable PostgreSQL browser launcher.");
    await fs.mkdir(shots, {recursive: true});
    const browser = await chromium.launch({channel: "msedge", headless: true});
    const contexts = [];
    const pageErrors = [];
    try {
        async function actor(label) {
            const context = await browser.newContext({viewport: {width: 1440, height: 1100}, timezoneId: "Asia/Seoul", colorScheme: "light"});
            contexts.push(context);
            const page = await context.newPage();
            page.setDefaultTimeout(12000);
            page.on("pageerror", error => pageErrors.push(`${label}: ${error.message}`));
            const username = `access_${label}_${randomUUID().slice(0, 8)}`;
            const password = randomUUID();
            secrets.add(password);
            const registered = await context.request.post(apiBase + "/api/auth/register", {data: {username, password}});
            expect(registered.status(), `register ${label}`).toBe(201);
            const account = (await registered.json()).user;
            await context.clearCookies();
            await page.goto(base + "/?view=projects");
            await page.getByRole("textbox", {name: "사용자 이름", exact: true}).fill(username);
            await page.getByRole("textbox", {name: "비밀번호", exact: true}).fill(password);
            await page.getByRole("button", {name: "로그인", exact: true}).click();
            await expect(page.locator(".sidebar-bottom strong")).toHaveText(username);
            const session = await context.request.get(apiBase + "/api/session");
            expect(session.status()).toBe(200);
            const csrf = (await session.json()).csrf_token;
            secrets.add(csrf);
            return {context, page, account, headers: {"X-CSRF-Token": csrf}};
        }
        async function response(who, method, endpoint, data) {
            return who.context.request.fetch(apiBase + endpoint, {method, headers: who.headers, data});
        }
        async function json(who, method, endpoint, data) {
            const result = await response(who, method, endpoint, data);
            expect(result.ok(), `${method} ${endpoint} (${result.status()})`).toBe(true);
            return result.json();
        }
        const owner = await actor("owner"), member = await actor("member"), restricted = await actor("restricted"), outsider = await actor("outsider");
        const get = (who, endpoint) => json(who, "GET", endpoint);
        const projectA = await json(owner, "POST", "/api/projects", {name: "공유 A · 편집 권한"});
        const projectB = await json(owner, "POST", "/api/projects", {name: "공유 B · 보기 권한"});
        const projectC = await json(owner, "POST", "/api/projects", {name: "비공개 C · 미참여"});
        async function task(project, title) {
            return json(owner, "POST", `/api/projects/${project.id}/items`, {kind: "task", title,
                body: "실제 API 권한 검증용 합성 자료", data: {workflow: "delivery", requires_test: false}});
        }
        let editableTask = await task(projectA, "A 프로젝트 실제 편집 작업");
        await task(projectA, "A 프로젝트 두 번째 작업");
        const viewerTask = await task(projectB, "B 프로젝트 읽기 전용 작업");
        await task(projectC, "C 비공개 작업 하나");
        await task(projectC, "C 비공개 작업 둘");
        await task(projectC, "C 비공개 작업 셋");
        const settingsUrl = project => `${base}/?project=${project.id}&view=project-settings`;
        const tasksUrl = (project, layout = "list", selected = "") => `${base}/?project=${project?.id ?? ""}&view=tasks&taskScope=all&taskLayout=${layout}&taskDensity=detailed&taskStatus=all&item=${selected}`;
        async function mutateAccess(project, endpoint, data = {}, method = "POST") {
            const access = await get(owner, `/api/projects/${project.id}/access`);
            return json(owner, method, `/api/projects/${project.id}/${endpoint}`, {...data, expected_revision: access.access_revision, operation_id: randomUUID()});
        }
        async function roles(project) {return get(owner, `/api/projects/${project.id}/roles`);}
        const initialRolesA = await roles(projectA);
        const editorA = initialRolesA.find(role => role.preset === "editor");
        const viewerA = initialRolesA.find(role => role.preset === "viewer");
        const viewerB = (await roles(projectB)).find(role => role.preset === "viewer");
        async function seedMember(who, project, roleId) {
            const invitation = await mutateAccess(project, "invitations", {account_id: who.account.id, role_id: roleId});
            secrets.add(invitation.token);
            const preview = await json(who, "POST", `/api/project-invitations/${invitation.id}/preview`, {token: invitation.token});
            return json(who, "POST", `/api/project-invitations/${invitation.id}/accept`, {token: invitation.token, expected_revision: preview.access_revision, operation_id: randomUUID()});
        }
        async function confirm(page, title) {
            const dialog = page.getByRole("dialog", {name: title, exact: true});
            await dialog.getByRole("button", {name: "변경 확인", exact: true}).click();
            await expect(dialog).not.toBeVisible();
        }
        async function refreshByFocus(who) {
            await who.page.bringToFront();
            await who.page.evaluate(() => window.dispatchEvent(new Event("focus")));
        }
        async function noOverflow(page, label) {
            expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), label).toBeLessThanOrEqual(1);
        }
        async function screenshot(page, filename) {
            await page.evaluate(() => {if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0);});
            await page.screenshot({path: path.join(shots, filename), fullPage: true,
                mask: [page.locator('input[aria-label="초대 수락 링크"],input[aria-label="소유권 이전 수락 링크"]')]});
        }

        // Owner creates a real custom role from the existing viewer preset.
        await owner.page.goto(settingsUrl(projectA));
        await owner.page.getByRole("button", {name: "역할", exact: true}).click();
        await owner.page.getByRole("button", {name: "역할 만들기", exact: true}).click();
        await owner.page.getByRole("combobox", {name: "복사할 역할", exact: true}).selectOption(viewerA.id);
        await owner.page.getByRole("textbox", {name: "역할 이름", exact: true}).fill("제한 편집");
        await owner.page.getByRole("checkbox", {name: "ZIP 내보내기", exact: true}).uncheck();
        await owner.page.getByRole("checkbox", {name: "작업 수정", exact: true}).check();
        await owner.page.getByRole("button", {name: "역할 저장", exact: true}).click();
        await expect.poll(async () => (await roles(projectA)).some(role => role.name === "제한 편집")).toBe(true);
        const limited = (await roles(projectA)).find(role => role.name === "제한 편집");
        expect(limited.permissions).toEqual(["project.read", "task.update"]);
        pass("owner creates custom role through real controls; export, run, field and administration permissions remain absent");

        // A real settings UI invitation is retained only in this process; its token never appears in logs or screenshots.
        await owner.page.getByRole("button", {name: "멤버", exact: true}).click();
        await owner.page.getByRole("textbox", {name: "초대할 계정 ID", exact: true}).fill(member.account.id);
        await owner.page.getByRole("combobox", {name: "초대 역할", exact: true}).selectOption(editorA.id);
        await owner.page.getByRole("button", {name: "초대 링크 만들기", exact: true}).click();
        const invitationLink = await owner.page.getByRole("textbox", {name: "초대 수락 링크", exact: true}).inputValue();
        const invitationLocation = new URL(invitationLink);
        secrets.add(new URLSearchParams(invitationLocation.hash.slice(1)).get("invitationToken"));
        expect(invitationLocation.search.includes("invitationToken")).toBe(false);
        expect(new URLSearchParams(invitationLocation.hash.slice(1)).has("invitationToken")).toBe(true);
        await owner.page.getByRole("button", {name: "링크 숨기기", exact: true}).click();
        // An unrelated ACL write after issuance must not require an owner to reissue the invitation.
        await mutateAccess(projectA, `roles/${limited.id}`, {name: "제한 편집", permissions: limited.permissions}, "PATCH");
        const currentRevision = (await get(owner, `/api/projects/${projectA.id}/access`)).access_revision;
        const deniedBefore = await response(member, "GET", `/api/projects/${projectA.id}/access`);
        expect(deniedBefore.status()).toBe(404);
        const previewResponse = member.page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname.endsWith("/preview"));
        await member.page.goto(invitationLink);
        await expect(member.page.getByText(projectA.name, {exact: true}).last()).toBeVisible();
        const preview = await (await previewResponse).json();
        expect(preview.access_revision).toBe(currentRevision);
        expect((await response(member, "GET", `/api/projects/${projectA.id}/access`)).status()).toBe(404);
        const acceptResponse = member.page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname.endsWith("/accept"));
        await member.page.getByRole("button", {name: "현재 계정으로 수락", exact: true}).click();
        expect((await acceptResponse).status(), "invitation accept response").toBe(200);
        expect((await get(member, `/api/projects/${projectA.id}/access`)).role.preset).toBe("editor");
        await expect.poll(() => new URL(member.page.url()).hash).toBe("");
        await seedMember(member, projectB, viewerB.id);
        await seedMember(restricted, projectA, limited.id);
        pass("manual invitation link previews current revision after another ACL change and grants editor access only on explicit recipient acceptance");

        await owner.page.goto(settingsUrl(projectA));
        await owner.page.getByRole("button", {name: "역할", exact: true}).click();
        const customRow = owner.page.locator(".project-access-roles > li").filter({has: owner.page.getByRole("heading", {name: /^제한 편집/})});
        await customRow.getByRole("button", {name: "수정", exact: true}).click();
        await owner.page.getByRole("checkbox", {name: "작업 생성", exact: true}).check();
        await owner.page.getByRole("button", {name: "역할 저장", exact: true}).click();
        const impact = owner.page.getByRole("dialog", {name: "역할 변경 적용", exact: true});
        await expect(impact).toContainText("멤버 1명");
        await expect(impact).toContainText("작업 생성");
        expect((await roles(projectA)).find(role => role.id === limited.id).permissions).not.toContain("task.create");
        await screenshot(owner.page, "owner-role-impact-desktop.png");
        await confirm(owner.page, "역할 변경 적용");
        await expect.poll(async () => (await get(restricted, `/api/projects/${projectA.id}/access`)).capabilities.includes("task.create")).toBe(true);
        pass("custom role change shows actual affected-member count and changed operation before applying to existing members");

        const memberProjects = await get(member, "/api/projects");
        expect(memberProjects.map(project => project.id).sort()).toEqual([projectA.id, projectB.id].sort());
        expect((await get(member, `/api/projects/${projectA.id}/access`)).role.preset).toBe("editor");
        expect((await get(member, `/api/projects/${projectB.id}/access`)).role.preset).toBe("viewer");
        expect((await response(member, "GET", `/api/projects/${projectC.id}`)).status()).toBe(404);
        const aggregate = await get(member, "/api/tasks?task_scope=all&status=all&limit=100");
        expect(aggregate.total).toBe(3); expect(aggregate.scope_counts.all).toBe(3);
        expect(aggregate.items.every(item => [projectA.id, projectB.id].includes(item.project_id))).toBe(true);
        await member.page.goto(tasksUrl(null));
        await expect(member.page.locator(".global-task-summary")).toContainText("3 / 3개");
        await expect(member.page.getByRole("combobox", {name: "소속 프로젝트", exact: true})).toContainText(projectA.name);
        await expect(member.page.getByRole("combobox", {name: "소속 프로젝트", exact: true})).not.toContainText(projectC.name);
        expect(await get(outsider, "/api/projects")).toEqual([]);
        expect((await get(outsider, "/api/tasks?task_scope=all&status=all")).total).toBe(0);
        await outsider.page.goto(tasksUrl(null));
        await expect(outsider.page.locator(".global-task-summary")).toContainText("0 / 0개");
        pass("same account is editor in A, viewer in B, absent from C; project lists and global task counts expose only permitted projects");

        await member.page.goto(tasksUrl(projectA));
        await member.page.getByRole("button", {name: `${editableTask.title} 제목 수정`, exact: true}).click();
        const changedTitle = "A 편집자가 실제 저장한 제목";
        await member.page.getByRole("textbox", {name: `${editableTask.title} 제목`, exact: true}).fill(changedTitle);
        await member.page.getByRole("textbox", {name: `${editableTask.title} 제목`, exact: true}).press("Enter");
        await expect.poll(async () => (await get(owner, `/api/items/${editableTask.id}`)).title).toBe(changedTitle);
        editableTask = await get(owner, `/api/items/${editableTask.id}`);
        await member.page.getByRole("combobox", {name: `${changedTitle} 상태`, exact: true}).selectOption("in_review");
        await expect.poll(async () => (await get(owner, `/api/items/${editableTask.id}`)).data.state).toBe("in_review");
        await member.page.goto(tasksUrl(projectA, "board"));
        const editCard = member.page.locator(`[data-kanban-card="${editableTask.id}"]`);
        await expect(editCard).toHaveAttribute("draggable", "true");
        await editCard.locator(".inline-edit-value").dragTo(member.page.locator('[data-kanban-column="in_progress"]'), {targetPosition: {x: 80, y: 110}});
        await expect.poll(async () => (await get(owner, `/api/items/${editableTask.id}`)).data.state).toBe("in_progress");
        await member.page.goto(tasksUrl(projectB));
        await expect(member.page.getByRole("button", {name: `${viewerTask.title} 제목 수정`, exact: true})).toBeDisabled();
        await expect(member.page.getByRole("combobox", {name: `${viewerTask.title} 상태`, exact: true})).toBeDisabled();
        await member.page.goto(tasksUrl(projectB, "board"));
        const viewerCard = member.page.locator(`[data-kanban-card="${viewerTask.id}"]`);
        await expect(viewerCard).toHaveAttribute("draggable", "false");
        await expect(viewerCard.getByRole("button", {name: `${viewerTask.title} 끌어서 이동`, exact: true})).toBeDisabled();
        await expect(viewerCard.getByRole("button", {name: `${viewerTask.title} 상태 메뉴`, exact: true})).toBeDisabled();
        await screenshot(member.page, "viewer-board-desktop.png");
        pass("editor saves title/state and drags cards; viewer title/state/drag controls are disabled in the real browser");

        await restricted.page.goto(`${base}/?project=${projectA.id}&view=projects`);
        await restricted.page.getByRole("button", {name: `${projectA.name} 프로젝트 메뉴`, exact: true}).first().click();
        await expect(restricted.page.getByRole("menuitem", {name: "프로젝트 ZIP 내려받기", exact: true})).toBeDisabled();
        await restricted.page.keyboard.press("Escape");
        await restricted.page.goto(tasksUrl(projectA));
        await restricted.page.getByRole("button", {name: "+ 필드", exact: true}).click();
        await expect(restricted.page.getByRole("button", {name: "+ 사용자 필드 추가", exact: true})).toBeDisabled();
        await restricted.page.keyboard.press("Escape");
        await restricted.page.goto(`${base}/?project=${projectA.id}&view=runs&run=new`);
        await expect(restricted.page.getByRole("heading", {name: "스킬 실행은 읽기 전용입니다.", exact: true})).toBeVisible();
        await expect(restricted.page.getByRole("button", {name: "스킬 실행", exact: true})).toHaveCount(0);
        expect((await response(restricted, "GET", `/api/projects/${projectA.id}/export`)).status()).toBe(403);
        expect((await response(restricted, "POST", "/api/task-fields", {project_id: projectA.id, name: "거부될 필드", type: "text"})).status()).toBe(403);
        expect((await response(restricted, "POST", `/api/projects/${projectA.id}/runs`, {operation: "plan", instruction: "전송되면 안 되는 검증", skill_ids: ["development-workflow"]})).status()).toBe(403);
        pass("custom capability checks disable ZIP, field creation and skill execution; direct real API requests return 403");

        await member.page.goto(tasksUrl(projectA));
        await expect(member.page.getByRole("button", {name: `${changedTitle} 제목 수정`, exact: true})).toBeEnabled();
        await mutateAccess(projectA, `members/${member.account.id}`, {role_id: viewerA.id}, "PATCH");
        const latestTask = await get(owner, `/api/items/${editableTask.id}`);
        expect((await response(member, "PUT", `/api/items/${editableTask.id}`, {expected_revision: latestTask.revision, title: "권한 철회 후 거부", body: latestTask.body, data: latestTask.data})).status()).toBe(403);
        await refreshByFocus(member);
        await expect(member.page.getByRole("button", {name: `${changedTitle} 제목 수정`, exact: true})).toBeDisabled();
        await expect(member.page.getByRole("combobox", {name: `${changedTitle} 상태`, exact: true})).toBeDisabled();
        expect((await get(owner, `/api/items/${editableTask.id}`)).title).toBe(changedTitle);
        pass("server checks current membership immediately after downgrade; refocus refresh disables stale editor controls");

        // Keep a real unsaved business draft while membership is removed, then verify no automatic write after rejoining.
        await restricted.page.goto(tasksUrl(projectA, "list", editableTask.id));
        const titleSpan = restricted.page.locator(`[data-task-title-id="${editableTask.id}"]`).first();
        await titleSpan.getByRole("button", {name: `${changedTitle} 제목 수정`, exact: true}).click();
        await titleSpan.getByRole("textbox").fill("철회 이전의 미전송 초안");
        let replayedWrites = 0;
        const recordWrite = request => {if (request.method() === "PUT" && new URL(request.url()).pathname === `/api/items/${editableTask.id}`) replayedWrites++;};
        restricted.page.on("request", recordWrite);
        await mutateAccess(projectA, `members/${restricted.account.id}`, {}, "DELETE");
        await refreshByFocus(restricted);
        await expect.poll(() => new URL(restricted.page.url()).searchParams.get("project") ?? "").toBe("");
        await expect(restricted.page.locator(`[data-task-title-id="${editableTask.id}"]`)).toHaveCount(0);
        expect((await response(restricted, "GET", `/api/items/${editableTask.id}`)).status()).toBe(404);
        await restricted.page.goto(tasksUrl(null));
        await expect(restricted.page.locator(".global-task-summary")).toContainText("0 / 0개");
        await seedMember(restricted, projectA, limited.id);
        await restricted.page.goto(tasksUrl(projectA));
        await expect(restricted.page.locator(`[data-task-title-id="${editableTask.id}"]`)).toBeVisible();
        expect((await get(owner, `/api/items/${editableTask.id}`)).title).toBe(changedTitle);
        expect(replayedWrites).toBe(0);
        restricted.page.off("request", recordWrite);
        const restoredInput = restricted.page.locator(`[data-task-title-id="${editableTask.id}"] input`);
        if (await restoredInput.count()) await restoredInput.press("Escape");
        pass("removal closes the selected project, clears visible task caches and global counts; rejoining never replays the preserved draft");

        await owner.page.goto(settingsUrl(projectA));
        await owner.page.getByRole("combobox", {name: "새 오너가 될 멤버", exact: true}).selectOption(member.account.id);
        await owner.page.getByRole("button", {name: "이전 요청", exact: true}).click();
        await expect(owner.page.getByRole("dialog", {name: "소유권 이전 요청", exact: true})).toContainText("에디터로 변경");
        await confirm(owner.page, "소유권 이전 요청");
        const ownershipLink = await owner.page.getByRole("textbox", {name: "소유권 이전 수락 링크", exact: true}).inputValue();
        secrets.add(new URLSearchParams(new URL(ownershipLink).hash.slice(1)).get("ownershipToken"));
        await owner.page.getByRole("button", {name: "링크 숨기기", exact: true}).click();
        expect((await get(owner, `/api/projects/${projectA.id}/access`)).role.preset).toBe("owner");
        expect((await get(member, `/api/projects/${projectA.id}/access`)).role.preset).toBe("viewer");
        await member.page.goto(ownershipLink);
        await expect(member.page.getByRole("heading", {name: "소유권 이전 수락", exact: true})).toBeVisible();
        await expect(member.page.getByText("수락할 역할: 오너", {exact: true})).toBeVisible();
        expect((await get(member, `/api/projects/${projectA.id}/access`)).role.preset).toBe("viewer");
        await member.page.getByRole("button", {name: "현재 계정으로 수락", exact: true}).click();
        await expect.poll(async () => (await get(member, `/api/projects/${projectA.id}/access`)).role.preset).toBe("owner");
        expect((await get(owner, `/api/projects/${projectA.id}/access`)).role.preset).toBe("editor");
        pass("ownership stays unchanged until the existing target member accepts; target becomes owner and requester becomes editor");

        await member.page.goto(settingsUrl(projectA));
        await expect(member.page.getByText("내 역할: 오너", {exact: true})).toBeVisible();
        await screenshot(member.page, "new-owner-members-desktop.png");
        for (const width of [320, 390]) {
            await member.page.setViewportSize({width, height: 900});
            for (const appearance of ["light", "dark"]) {
                await member.page.emulateMedia({colorScheme: appearance});
                await expect(member.page.locator("[data-appearance]").first()).toHaveAttribute("data-appearance", appearance);
                await member.page.getByRole("button", {name: "멤버", exact: true}).click();
                await noOverflow(member.page, `members ${width}px ${appearance}`);
                await screenshot(member.page, `members-${width}-${appearance}.png`);
                await member.page.getByRole("button", {name: "역할", exact: true}).click();
                await member.page.getByRole("button", {name: "역할 만들기", exact: true}).click();
                await expect(member.page.getByRole("textbox", {name: "역할 이름", exact: true})).toBeVisible();
                const checkedPermission = member.page.getByRole("checkbox", {name: "프로젝트와 업무 자료 보기", exact: true});
                const uncheckedPermission = member.page.getByRole("checkbox", {name: "스킬 결과 적용", exact: true});
                await expect(checkedPermission).toBeChecked();
                await uncheckedPermission.uncheck();
                const checkedAppearance = await checkedPermission.evaluate(element => ({
                    background: getComputedStyle(element).backgroundColor,
                    indicator: getComputedStyle(element.querySelector("svg")).color,
                }));
                const uncheckedBackground = await uncheckedPermission.evaluate(element => getComputedStyle(element).backgroundColor);
                expect(checkedAppearance.background, `checked permission differs from unchecked ${width}px ${appearance}`).not.toBe(uncheckedBackground);
                expect(checkedAppearance.indicator, `checked indicator remains visible ${width}px ${appearance}`).not.toBe(checkedAppearance.background);
                await noOverflow(member.page, `roles ${width}px ${appearance}`);
                await screenshot(member.page, `role-form-${width}-${appearance}.png`);
                await member.page.getByRole("button", {name: "입력 취소", exact: true}).click();
            }
        }
        expect(pageErrors).toEqual([]);
        pass("member/role forms stay within 320px and 390px viewports in light and dark themes; all browser contexts have no page errors");
        console.log("Real Edge + local password sessions + real API + disposable PostgreSQL passed. External Microsoft sign-in, Hub, LLM and physical devices were not exercised.");
    } finally {
        await Promise.allSettled(contexts.map(context => context.close()));
        await browser.close();
    }
}
main().catch(error => {console.error(safeError(error)); process.exitCode = 1;});
