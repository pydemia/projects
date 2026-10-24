/* Browser-only import flow with mocked API; does not access GitHub or PostgreSQL. */
const { chromium, expect } = require("@playwright/test");

const source = "https://github.com/pydemia/statusline";
const sha = "a".repeat(40);
const project = {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Statusline", goal: "Browser status helper", profile: "simple",
    version: 1, created_at: "2026-10-24T00:00:00Z",
    repository_url: source, repository_path: "", repository_branch: "main",
    repository_sha: sha, repository_kind: "browser_extension",
    repository_manifest: "manifest.json", repository_imported_at: "2026-10-24T00:00:00Z",
};
const preview = {
    repository_url: source, repository_full_name: "pydemia/statusline",
    branch: "main", sha, path: "", kind: "browser_extension", visibility: "public",
    scopes: [{ path: "", label: "저장소 전체" }],
    manifest_path: "manifest.json", suggested_name: "Statusline",
    suggested_goal: "Browser status helper",
    activities: [
        { kind: "commit", external_id: sha, title: "Fix toolbar", url: `${source}/commit/${sha}`, state: "committed", occurred_at: "2026-10-20T00:00:00Z" },
        { kind: "pr", external_id: "3", title: "Support dark mode", url: `${source}/pull/3`, state: "merged", occurred_at: "2026-10-21T00:00:00Z" },
    ],
    warnings: [],
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
        else if (path === "/api/projects/from-git/preview") body = preview;
        else if (path === "/api/projects/from-git") { imported = request.postDataJSON(); body = project; status = 201; }
        else if (path.endsWith("/items")) body = [];
        else { body = { detail: "Mock endpoint not used in this check" }; status = 404; }
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    try {
        await page.goto("http://127.0.0.1:5173/");
        await page.getByRole("button", { name: "GitHub 저장소에서 만들기" }).click();
        const modal = page.getByRole("dialog");
        await modal.getByRole("textbox", { name: "GitHub 저장소 URL" }).fill(source);
        await modal.getByRole("button", { name: "저장소 분석" }).click();
        await expect(modal.getByRole("textbox", { name: "목표" })).toHaveValue("Browser status helper");
        await expect(modal.getByRole("link", { name: /Fix toolbar/ })).toBeVisible();
        await expect(modal.getByRole("link", { name: /Support dark mode/ })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (overflow) {
            const offenders = await page.evaluate(() => [...document.querySelectorAll("*")].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 12).map(element => ({ tag: element.tagName, className: String(element.className).slice(0, 100), right: Math.round(element.getBoundingClientRect().right) })));
            throw new Error(`${viewport.width}px viewport overflows horizontally: ${JSON.stringify(offenders)}`);
        }
        await modal.getByRole("button", { name: "프로젝트 만들기" }).click();
        await expect(page.getByRole("heading", { name: "Statusline", exact: true })).toBeVisible();
        if (imported?.repository_url !== source || imported?.expected_sha !== sha) throw new Error("Import payload mismatch");
        if (errors.length) throw new Error(errors.join("; "));
        process.stdout.write(`${viewport.width}px: preview, activity, create, no overflow\n`);
    } finally {
        await browser.close();
    }
}

(async () => {
    await verify({ width: 1440, height: 900 });
    await verify({ width: 390, height: 844 });
})().catch(error => { console.error(error); process.exitCode = 1; });
