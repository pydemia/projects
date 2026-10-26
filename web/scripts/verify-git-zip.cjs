/* Browser-only Git ZIP flow with mocked API; no PostgreSQL or ZIP parser. */
const { chromium, expect } = require("@playwright/test");

const project = {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Sample extension", goal: "Browser helper", profile: "simple",
    version: 1, created_at: "2026-10-25T00:00:00Z",
    repository_url: null, repository_path: "", repository_branch: null,
    repository_sha: null, repository_kind: "browser_extension",
    repository_manifest: "manifest.json", repository_imported_at: "2026-10-25T00:00:00Z",
};
const preview = {
    archive_sha256: "a".repeat(64), archive_name: "sample-main.zip",
    path: "", kind: "browser_extension",
    scopes: [{ path: "", label: "ZIP 전체" }],
    manifest_path: "manifest.json", suggested_name: "Sample extension",
    suggested_goal: "Browser helper",
    warnings: ["ZIP에는 commit·PR 이력이 없습니다."],
};

async function verify(viewport) {
    const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
    const page = await browser.newPage({ viewport });
    let imported = null;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let body = {};
        let status = 200;
        if (path === "/api/session") body = { user: { id: "00000000-0000-4000-8000-000000000001", username: "qa" }, csrf_token: "test-csrf" };
        else if (path === "/api/projects" && request.method() === "GET") body = imported ? [project] : [];
        else if (path === "/api/projects/from-git-zip/preview") body = preview;
        else if (path === "/api/projects/from-git-zip") { imported = request.postDataJSON(); body = project; status = 201; }
        else if (path.endsWith("/items")) body = [];
        else { body = { detail: "Mock endpoint not used in this check" }; status = 404; }
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    try {
        await page.goto("http://127.0.0.1:5173/");
        await page.getByRole("button", { name: "백업 ZIP 복원" }).click();
        await expect(page.getByRole("dialog")).toContainText("Projects에서 저장한 백업 ZIP");
        await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
        await page.getByRole("button", { name: "Git ZIP에서 만들기" }).click();
        const modal = page.getByRole("dialog");
        await modal.getByLabel("Git 소스 ZIP · 최대 8 MB").setInputFiles({ name: "sample-main.zip", mimeType: "application/zip", buffer: Buffer.from("mock zip") });
        await modal.getByRole("button", { name: "ZIP 분석" }).click();
        await expect(modal.getByRole("textbox", { name: "목표" })).toHaveValue("Browser helper");
        await expect(modal).toContainText("ZIP에는 commit·PR 이력이 없습니다.");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (overflow) throw new Error(`${viewport.width}px viewport overflows horizontally`);
        await modal.getByRole("button", { name: "프로젝트 만들기" }).click();
        await expect(page.getByRole("heading", { name: "Sample extension", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Git ZIP에서 시작" })).toBeVisible();
        if (imported?.expected_sha256 !== preview.archive_sha256 || imported?.archive_base64 !== Buffer.from("mock zip").toString("base64")) throw new Error("ZIP import payload mismatch");
        if (errors.length) throw new Error(errors.join("; "));
        process.stdout.write(`${viewport.width}px: backup wording, Git ZIP preview/create, no overflow\n`);
    } finally {
        await browser.close();
    }
}

(async () => {
    await verify({ width: 1440, height: 900 });
    await verify({ width: 390, height: 844 });
})().catch(error => { console.error(error); process.exitCode = 1; });
