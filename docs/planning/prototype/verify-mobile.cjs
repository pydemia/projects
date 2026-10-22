/* Visual smoke check for the planning prototype. It does not test the Projects app. */
const { chromium, expect } = require("../../../web/node_modules/@playwright/test");
const path = require("node:path");

async function main() {
    const browser = await chromium.launch({ headless: true, channel: "msedge" });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    try {
        await page.goto(`file:///${path.resolve(__dirname, "mobile-workspace.html").replaceAll("\\", "/")}`);
        await expect(page.getByRole("heading", { name: "오늘", exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(__dirname, "screenshots", "mobile-v2-comparison.png"), fullPage: true });
        await page.locator(".phone").screenshot({ path: path.join(__dirname, "screenshots", "mobile-v2-today.png") });
        await page.locator(".phone-bottom [data-nav=work]").click();
        await expect(page.getByText("검토 중 · 2개")).toBeVisible();
        await page.locator(".phone").screenshot({ path: path.join(__dirname, "screenshots", "mobile-v2-board.png") });
        await page.locator(".phone [data-page=work] [data-sheet=filter]").first().click();
        await expect(page.getByRole("dialog", { name: "보기·필터" })).toBeVisible();
        await page.locator(".phone").screenshot({ path: path.join(__dirname, "screenshots", "mobile-v2-filter.png") });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "보기·필터" })).toBeHidden();
        await page.locator(".phone-bottom [data-nav=more]").click();
        await page.getByRole("button", { name: /임시 문서 목록/ }).click();
        await page.getByRole("button", { name: /Application 설계 · 임시 문서/ }).click();
        await expect(page.getByRole("heading", { name: "Application 설계" })).toBeVisible();
        await page.getByRole("button", { name: "← 문서 목록" }).click();
        await expect(page.getByRole("heading", { name: "임시 문서" })).toBeVisible();
        for (const width of [320, 360, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            if (overflow > 1) throw new Error(`Prototype page overflows by ${overflow}px at ${width}px`);
        }
        await page.getByRole("button", { name: "Light / Dark 보기" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        console.log("Prototype: desktop/mobile render, board, filter, document detail/back, 320–430px reflow and dark theme passed");
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
