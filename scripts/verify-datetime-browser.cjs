/* Real Edge + API + isolated PostgreSQL; no production or external service writes. */
const {chromium, expect} = require("../web/node_modules/@playwright/test");
const {randomUUID} = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.PROJECTS_WEB_URL, apiBase = process.env.PROJECTS_API_URL;
const shots = path.resolve("docs/implementation/screenshots/datetime");
const key = "projects:date-time-format:v1";
function expectedStamp(value, zone, custom = false) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"}).formatToParts(new Date(value)).map(part => [part.type, part.value]));
    const hour = Number(parts.hour), period = hour < 12 ? "오전" : "오후", twelve = hour % 12 || 12;
    return custom ? `${parts.day}.${parts.month}.${parts.year} ${period} ${String(twelve).padStart(2, "0")}시 ${parts.minute}분 ${parts.second}초`
        : `${parts.day}/${parts.month}/${parts.year} ${period} ${twelve}:${parts.minute}:${parts.second}`;
}
async function main() {
    await fs.mkdir(shots, {recursive: true});
    const browser = await chromium.launch({channel: "msedge", headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 1100}, timezoneId: "Asia/Seoul"});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [], checkpoints = [];
    page.on("pageerror", error => errors.push(error.message));
    const pass = label => {checkpoints.push(label); console.log(`PASS ${label}`);};
    try {
        const registered = await context.request.post(apiBase + "/api/auth/register", {data: {username: "dates_" + randomUUID().slice(0, 8), password: randomUUID()}});
        expect(registered.status()).toBe(201);
        const headers = {"X-CSRF-Token": (await registered.json()).csrf_token};
        async function request(method, url, data) {
            const response = await context.request.fetch(apiBase + url, {method, headers, data});
            expect(response.ok(), `${method} ${url} (${response.status()})`).toBe(true);
            return response.json();
        }
        const project = await request("POST", "/api/projects", {name: "날짜 형식 검증 프로젝트", goal: "합성 자료"});
        const field = await request("POST", "/api/task-fields", {name: "검토일", type: "date", options: []});
        let task = await request("POST", `/api/projects/${project.id}/items`, {kind: "task", title: "표시 형식 검증 작업", body: "# 날짜 표시\n\n저장 값과 표시를 구분합니다.", data: {workflow: "personal", requires_test: false, planned_date: "2026-11-03", due_date: "2026-11-09", custom_fields: {[field.id]: "2026-11-21"}}});
        const fields = ["planned_date", "due_date", "custom:" + field.id];
        const view = await request("POST", `/api/projects/${project.id}/task-views`, {name: "날짜 표시", settings: {schema_version: 2, task_scope: "all", mode: "complex", view: "list", list_fields: fields, card_fields: fields}});
        const url = (layout = "list", item = "") => `${base}/?project=${project.id}&view=tasks&taskScope=all&taskLayout=${layout}&taskDensity=detailed&savedView=${view.id}&item=${item}`;
        const settingsUrl = `${base}/?project=${project.id}&view=settings`;
        const stamp = target => target.locator("article.document-editor .doc-meta .date-time-value");
        async function assertDateTimeLayout(value) {
            const layout = await value.evaluate(element => {
                const date = element.querySelector('.date-time-date').getBoundingClientRect();
                const clock = element.querySelector('.date-time-clock').getBoundingClientRect();
                return {display: getComputedStyle(element).display, gap: parseFloat(getComputedStyle(element).columnGap),
                    separation: clock.left - date.right, sameLine: Math.abs(date.top - clock.top) < 3,
                    textNodes: [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).length, text: element.textContent};
            });
            // An inline-flex item is blockified to flex inside a flex parent.
            expect(["inline-flex", "flex"]).toContain(layout.display);
            expect(layout.gap).toBeGreaterThan(4);
            expect(layout.textNodes).toBe(0);
            expect(layout.text).not.toMatch(/\dT\d|[+-]\d{2}:\d{2}/);
            if (layout.sameLine) expect(layout.separation).toBeGreaterThan(4);
        }
        await page.goto(settingsUrl);
        const settings = page.getByRole("region", {name: "날짜와 시간", exact: true});
        await settings.getByRole("combobox", {name: "날짜 표시 형식", exact: true}).selectOption("DD/MM/YYYY");
        await settings.getByRole("combobox", {name: "시간 표시 형식", exact: true}).selectOption("A h:mm:ss");
        await expect(settings.locator(".preferences-datetime-preview .date-time-value")).toHaveAttribute("aria-label", "03/11/2026 오후 4:05:09");
        await settings.getByRole("button", {name: "형식 적용", exact: true}).click();
        await expect(settings.getByRole("status")).toHaveText("날짜·시간 형식을 적용했습니다.");
        await page.reload();
        await expect(settings.getByRole("combobox", {name: "시간 표시 형식", exact: true})).toHaveValue("A h:mm:ss");
        expect((await request("GET", `/api/items/${task.id}`)).revision).toBe(task.revision);
        pass("preset preview/apply/reload persists without changing task data or revision");

        await page.goto(url());
        const due = page.getByRole("button", {name: `${task.title} 마감일 편집`, exact: true});
        await expect(due).toContainText("09/11/2026");
        await expect(page.getByRole("button", {name: `${task.title} 계획일 편집`, exact: true})).toContainText("03/11/2026");
        await expect(page.getByRole("button", {name: `${task.title} 검토일 편집`, exact: true})).toContainText("21/11/2026");
        await due.click();
        const editor = page.getByRole("dialog", {name: "마감일 편집", exact: true});
        await expect(editor.locator('input[type="date"]')).toHaveValue("2026-11-09");
        await editor.locator('input[type="date"]').fill("2026-12-05");
        await editor.getByRole("button", {name: "저장", exact: true}).click();
        await expect(editor).not.toBeVisible();
        await expect(due).toContainText("05/12/2026");
        task = await request("GET", `/api/items/${task.id}`);
        expect(task.updated_at).toMatch(/(?:Z|\+00:00)$/);
        expect(task.data.due_date).toBe("2026-12-05");
        expect(task.data.custom_fields[field.id]).toBe("2026-11-21");
        pass("builtin/custom dates use chosen display while native editing and actual API keep ISO dates");

        await page.goto(url("board"));
        await expect(page.locator(`[data-kanban-card="${task.id}"]`)).toContainText("마감 05/12/2026");
        await expect(page.locator(`[data-kanban-card="${task.id}"]`)).toContainText("검토일 21/11/2026");
        await page.goto(url("calendar"));
        await page.getByRole("combobox", {name: "캘린더 날짜 기준", exact: true}).selectOption("due");
        // The 42-day grid includes adjacent-month days. Move beyond that range
        // before asserting the out-of-period date label.
        await page.getByRole("button", {name: "이전 달", exact: true}).click();
        await page.getByRole("button", {name: "이전 달", exact: true}).click();
        await expect(page.locator(".calendar-overflow")).toContainText(`05/12/2026 · ${task.title}`);
        pass("board descriptions and calendar overflow share date preferences");

        const second = await context.newPage();
        second.setDefaultTimeout(12000);
        second.on("pageerror", error => errors.push(error.message));
        await second.goto(url("list", task.id));
        await expect(stamp(second)).toHaveAttribute("aria-label", expectedStamp(task.updated_at, "Asia/Seoul"));
        await page.goto(settingsUrl);
        await settings.getByRole("combobox", {name: "날짜 표시 형식", exact: true}).selectOption("custom");
        await settings.getByRole("textbox", {name: "사용자 지정 날짜 형식", exact: true}).fill("YYYY/MM");
        await expect(settings.getByRole("button", {name: "형식 적용", exact: true})).toBeDisabled();
        await expect(settings.getByRole("alert")).toBeVisible();
        await settings.getByRole("textbox", {name: "사용자 지정 날짜 형식", exact: true}).fill("DD.MM.YYYY");
        await settings.getByRole("combobox", {name: "시간 표시 형식", exact: true}).selectOption("custom");
        await settings.getByRole("textbox", {name: "사용자 지정 시간 형식", exact: true}).fill("A hh시 mm분 ss초");
        await settings.getByRole("button", {name: "형식 적용", exact: true}).click();
        await expect(stamp(second)).toHaveAttribute("aria-label", expectedStamp(task.updated_at, "Asia/Seoul", true));
        await assertDateTimeLayout(stamp(second));
        await second.locator("article.document-editor .doc-heading").screenshot({path: path.join(shots, "date-time-gap-desktop.png")});
        await expect(second.getByRole("region", {name: "작업 속성", exact: true}).getByRole("button", {name: `${task.title} 마감일 편집`, exact: true})).toContainText("05.12.2026");
        await expect(second.locator(".task-row").getByRole("button", {name: `${task.title} 마감일 편집`, exact: true})).toContainText("05.12.2026");
        await page.screenshot({path: path.join(shots, "settings-desktop.png"), fullPage: true});
        pass("invalid custom formats are blocked; valid definitions update an already-open tab via storage event");

        const foreign = await browser.newContext({storageState: await context.storageState(), timezoneId: "America/Los_Angeles", locale: "en-US", viewport: {width: 1440, height: 1000}});
        try {
            const west = await foreign.newPage();
            await west.goto(url("list", task.id));
            await expect(west.getByRole("region", {name: "작업 속성", exact: true}).getByRole("button", {name: `${task.title} 마감일 편집`, exact: true})).toContainText("05.12.2026");
            await expect(stamp(west)).toHaveAttribute("aria-label", expectedStamp(task.updated_at, "America/Los_Angeles", true));
            await west.goto(settingsUrl);
            await west.getByRole("combobox", {name: "시간대", exact: true}).selectOption("Asia/Seoul");
            await west.getByRole("button", {name: "형식 적용", exact: true}).click();
            await west.reload();
            await expect(west.getByRole("combobox", {name: "시간대", exact: true})).toHaveValue("Asia/Seoul");
            await west.goto(url("list", task.id));
            await expect(stamp(west)).toHaveAttribute("aria-label", expectedStamp(task.updated_at, "Asia/Seoul", true));
            await assertDateTimeLayout(stamp(west));
            await expect(west.getByRole("region", {name: "작업 속성", exact: true}).getByRole("button", {name: `${task.title} 마감일 편집`, exact: true})).toContainText("05.12.2026");
        } finally {await foreign.close();}
        pass("Los Angeles device honors explicit Seoul timezone after save/reload; date-only values stay intact and UI uses gap without text whitespace");

        await settings.getByRole("combobox", {name: "시간대", exact: true}).selectOption("UTC");
        await settings.getByRole("button", {name: "형식 적용", exact: true}).click();
        await expect(stamp(second)).toHaveAttribute("aria-label", expectedStamp(task.updated_at, "UTC", true));
        await assertDateTimeLayout(stamp(second));
        expect((await request("GET", `/api/items/${task.id}`)).revision).toBe(task.revision);
        pass("UTC preference updates another open tab without rewriting stored UTC timestamps or revisions");

        const baseline = await request("POST", `/api/projects/${project.id}/baselines`, {name: "시간대 검증 기준선"});
        await page.goto(`${base}/?project=${project.id}&view=trace&baseline=${baseline.id}`);
        const selectedBaselineTime = page.locator(".baseline-timestamp .date-time-value");
        await expect(selectedBaselineTime).toHaveAttribute("aria-label", expectedStamp(baseline.created_at, "UTC", true));
        await assertDateTimeLayout(selectedBaselineTime);
        const baselineOption = page.getByRole("combobox", {name: "저장한 기준선", exact: true}).locator(`option[value="${baseline.id}"]`);
        await expect(baselineOption).toContainText("시간대 검증 기준선");
        expect(await baselineOption.locator("time").count()).toBe(0);
        await page.goto(settingsUrl);
        pass("baseline option uses a date label and its selected timestamp renders as separate date/time UI elements");

        for (const width of [320, 390, 430]) {
            await page.setViewportSize({width, height: 900});
            await expect(settings.getByRole("button", {name: "형식 적용", exact: true})).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `mobile ${width}px overflow`).toBeLessThanOrEqual(1);
            await second.setViewportSize({width, height: 900});
            await assertDateTimeLayout(stamp(second));
        }
        await page.getByRole("combobox", {name: "색상 테마", exact: true}).selectOption("light");
        await page.screenshot({path: path.join(shots, "settings-mobile-light.png"), fullPage: true});
        await page.getByRole("combobox", {name: "색상 테마", exact: true}).selectOption("dark");
        await page.screenshot({path: path.join(shots, "settings-mobile-dark.png"), fullPage: true});
        await page.reload();
        await expect(settings.getByRole("textbox", {name: "사용자 지정 날짜 형식", exact: true})).toHaveValue("DD.MM.YYYY");
        expect((await request("GET", `/api/items/${task.id}`)).revision).toBe(task.revision);
        pass("320/390/430px settings fit in light/dark; custom formats persist without additional revisions");
        await second.close();
        expect(errors).toEqual([]);
        await fs.rm(path.join(shots, "failure.png"), {force: true});
        console.log(`Real Edge + isolated PostgreSQL: ${checkpoints.length} checkpoints passed. External services, authenticated production UI and physical devices not exercised.`);
    } catch (error) {
        await page.screenshot({path: path.join(shots, "failure.png"), fullPage: true}).catch(() => {});
        throw error;
    } finally {await context.close(); await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
