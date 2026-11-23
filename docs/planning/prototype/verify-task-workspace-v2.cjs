/* Checks only the planning mock, never the Projects app or external services. */
const { chromium, expect } = require("../../../web/node_modules/@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const url = pathToFileURL(path.join(__dirname, "task-workspace-v2.html")).href;
    const shot = name => page.screenshot({ path: path.join(__dirname, "screenshots", `task-v2-${name}.png`), fullPage: true });
    try {
        await page.goto(url);
        await expect(page.locator('[data-row="TASK-101"]')).toBeVisible();
        await expect(page.locator('[data-layout="board"]')).toBeDisabled();
        const firstRow = await page.locator('[data-row="TASK-101"]').boundingBox();
        if (!firstRow || firstRow.y + firstRow.height > 900) throw new Error("First task is outside the first viewport");
        await shot("global");

        await page.locator("#project").selectOption("Projects");
        await page.locator('[data-task="TASK-101"]').click();
        await page.locator("#draft").fill("전환 후에도 남아야 하는 미저장 초안");
        await page.locator("#density").selectOption("detailed");
        await expect(page.locator("#draft")).toHaveValue("전환 후에도 남아야 하는 미저장 초안");
        await page.locator('[data-layout="board"]').click();
        await expect(page.locator("#draft")).toHaveValue("전환 후에도 남아야 하는 미저장 초안");
        await expect(page.locator("#detail")).toContainText("TASK-101 · rev 3");
        await expect(page.locator("#dirty")).toHaveText("변경 중");
        await shot("board");
        await page.locator('#detail [data-move="TASK-101"]').click();
        await expect(page.locator("#draft-choice")).toBeVisible();
        await expect(page.locator("#move")).not.toBeVisible();
        await page.locator("#move-saved").click();
        await expect(page.locator("#move")).toBeVisible();
        await page.locator("#cancel-move").click();
        await expect(page.locator("#draft")).toHaveValue("전환 후에도 남아야 하는 미저장 초안");
        await page.locator('[data-layout="calendar"]').click();
        await expect(page.locator("#detail")).toContainText("TASK-101 · rev 3");
        await expect(page.locator(".calendar-info")).toContainText("다른 기간");
        await page.goBack();
        await expect(page.locator('[data-layout="board"]')).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#draft")).toHaveValue("전환 후에도 남아야 하는 미저장 초안");
        await page.locator('[data-set="inbox"]').first().click();
        await expect(page.locator(".outside")).toBeVisible();
        await expect(page.locator("#draft")).toHaveValue("전환 후에도 남아야 하는 미저장 초안");

        await page.locator('[data-set="all"]').first().click();
        await page.locator("#close-detail").click();
        await page.locator('[data-layout="calendar"]').click();
        await shot("calendar");
        await page.locator('[data-layout="list"]').click();
        await page.locator('[data-move="TASK-102"]').click();
        await page.locator("#target").selectOption("Note");
        await expect(page.locator("#impact")).toContainText("Projects → Note");
        await shot("transfer");
        await page.locator("#cancel-move").click();
        await expect(page.locator('[data-row="TASK-102"]')).toBeVisible();
        await page.locator('[data-move="TASK-102"]').click();
        await page.locator("#target").selectOption("Note");
        await page.locator("#confirm-move").click();
        await expect(page.locator('[data-row="TASK-102"]')).toHaveCount(0);
        await page.locator("#undo").click();
        await expect(page.locator('[data-row="TASK-102"]')).toBeVisible();

        await page.locator("#query").fill("보기 전환");
        await page.locator('[data-layout="board"]').click();
        await expect(page.locator("#query")).toHaveValue("보기 전환");
        await expect(page.locator('[data-row="TASK-101"]')).toHaveCount(1);
        await page.locator("#query").fill("");
        await page.locator('[data-layout="list"]').click();
        await page.locator('[data-set="today"]').first().click();
        await expect(page.getByText("미처리 계획 · 1", { exact: true })).toBeVisible();
        await page.locator("#save-view").click();
        await expect(page.locator("#dirty")).toHaveText("저장됨");
        await page.locator("#density").selectOption("compact");
        await expect(page.locator("#dirty")).toHaveText("변경 중");
        await page.locator("#restore-view").click();
        await expect(page.locator("#density")).toHaveValue("detailed");
        await page.reload();
        await expect(page.locator('[data-set="today"]').first()).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#density")).toHaveValue("detailed");

        await page.setViewportSize({ width: 390, height: 844 });
        await shot("mobile");
        await page.locator('[data-task="TASK-101"]').click();
        await expect(page.locator("#detail")).toBeVisible();
        await page.locator("#close-detail").click();
        for (const width of [320, 360, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            if (overflow > 1) throw new Error(`Mock overflow ${overflow}px at ${width}px`);
        }
        await page.locator("#theme").click();
        await expect(page.locator("html")).toHaveClass("dark");
        await shot("mobile-dark");
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator("#theme").click();
        await page.locator("#new-task").click();
        await page.keyboard.press("Escape");
        await expect(page.locator("#create")).not.toBeVisible();
        await page.locator("#project").selectOption("all");
        await page.locator("#new-task").click();
        await page.locator("#new-title").fill("전역 작업의 명시적 프로젝트 선택");
        await page.locator("#confirm-create").click();
        await expect(page.locator("#create")).toBeVisible();
        await expect(page.locator("#new-project")).toBeFocused();
        await page.locator("#cancel-create").click();
        if (errors.length) throw new Error(errors.join("\n"));
        console.log("Planning mock passed: first task visibility; view/query/ID/draft preservation; outside-filter detail; history/URL; saved view dirty/restore; transfer cancel/undo; 320–430px reflow; dark; dialog Escape. No app/API/Note/LLM verification.");
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
