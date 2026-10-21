import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { RecordEditor } from "./ItemsPage";
import { RunsPage } from "./RunsPage";
import { candidateRun, idea, projectId, userId } from "./fixtures.test-data";
import { loadDraft } from "./hooks";
import { defaultData, itemSchema } from "./models";

describe("editable work and real execution states", () => {
    it("opens an idea with requirement skills and preserves a manually edited skill list", async () => {
        vi.spyOn(api, "runs").mockResolvedValue([]);
        render(<RunsPage projectId={projectId} userId={userId} route={{ project: projectId, view: "runs", item: idea.id, run: "", q: "", kind: "", baseline: "" }} items={[idea]} runtime={{ status: "ready", data: { configured: true, provider: "codex_login", model: "", capabilities: [] } }} onRuntimeReload={vi.fn()} onChanged={vi.fn()} />);
        expect(screen.getByLabelText("작업 종류")).toHaveProperty("value", "analyze_idea");
        expect(screen.getByLabelText("스킬 ID")).toHaveProperty("value", "requirements-authoring requirements-verification");
        fireEvent.change(screen.getByLabelText("스킬 ID"), { target: { value: "my-project-skill" } });
        fireEvent.change(screen.getByLabelText("작업 종류"), { target: { value: "write_document" } });
        expect(screen.getByLabelText("스킬 ID")).toHaveProperty("value", "my-project-skill");
    });
    it("keeps temporary documents focused on editing and export", () => {
        const document = itemSchema.parse({ ...idea, kind: "artifact", data: defaultData("artifact") });
        render(<RecordEditor item={document} items={[document]} userId={userId} onChanged={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "현재 revision 확정" })).toBeNull();
        expect(screen.queryByRole("button", { name: "revision 이력" })).toBeNull();
        expect(screen.getByRole("button", { name: "Markdown 내려받기" })).toBeTruthy();
        expect(screen.getByText(/임시 문서 저장소 · Note 연계 예정/)).toBeTruthy();
    });
    it("preserves an unsaved body on 409 and lets the user merge against the latest revision", async () => {
        const user = userEvent.setup();
        const latest = { ...idea, revision: 2, body: "다른 사용자의 서버 수정", updated_at: "2026-10-21T01:00:00Z" };
        const save = vi.spyOn(api, "saveItem").mockRejectedValueOnce(new ApiError("저장 기준이 달라졌습니다.", 409)).mockResolvedValue({ ...latest, body: "병합한 내 초안", revision: 3 });
        vi.spyOn(api, "item").mockResolvedValue(latest);
        render(<RecordEditor item={idea} items={[idea]} userId={userId} onChanged={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "편집" }));
        fireEvent.change(screen.getByLabelText("본문 · Markdown"), { target: { value: "절대 지우지 않을 내 초안" } });
        await user.click(screen.getByRole("button", { name: "초안 저장" }));
        expect(await screen.findByText("다른 변경과 충돌했습니다. 내 초안은 그대로 보관합니다.")).toBeTruthy();
        expect(screen.getByLabelText("본문 · Markdown")).toHaveProperty("value", "절대 지우지 않을 내 초안");
        expect(loadDraft(`projects:draft:${userId}:${projectId}:${idea.id}`)?.body).toBe("절대 지우지 않을 내 초안");
        await user.click(screen.getByRole("button", { name: "서버 최신 revision을 기준으로 병합 편집" }));
        fireEvent.change(screen.getByLabelText("본문 · Markdown"), { target: { value: "병합한 내 초안" } });
        await user.click(screen.getByRole("button", { name: "초안 저장" }));
        await waitFor(() => expect(save).toHaveBeenLastCalledWith(idea.id, expect.objectContaining({ expected_revision: 2, body: "병합한 내 초안" })));
    });
    it("keeps provider-unconfigured execution disabled while retaining the request form", async () => {
        vi.spyOn(api, "runs").mockResolvedValue([]);
        const resolve = vi.spyOn(api, "resolve");
        render(<RunsPage projectId={projectId} userId={userId} route={{ project: projectId, view: "runs", item: "", run: "", q: "", kind: "", baseline: "" }} items={[idea]} runtime={{ status: "ready", data: { configured: false, provider: "codex_login", model: "", capabilities: [] } }} onRuntimeReload={vi.fn()} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("작업 요청"), { target: { value: "실제 공급자 설정 후 사용할 요청" } });
        expect(screen.getByRole("button", { name: "스킬 실행" })).toHaveProperty("disabled", true);
        expect(screen.getByText("LLM 실행 공급자가 설정되지 않았습니다.")).toBeTruthy();
        expect(resolve).not.toHaveBeenCalled();
    });
    it("applies only explicitly selected requirement candidate indices", async () => {
        const user = userEvent.setup();
        vi.spyOn(api, "runs").mockResolvedValue([candidateRun]);
        vi.spyOn(api, "run").mockResolvedValue(candidateRun);
        const apply = vi.spyOn(api, "applyRun").mockResolvedValue({ ...candidateRun, status: "applied" });
        render(<RunsPage projectId={projectId} userId={userId} route={{ project: projectId, view: "runs", item: "", run: candidateRun.id, q: "", kind: "", baseline: "" }} items={[idea]} runtime={{ status: "ready", data: { configured: true, provider: "codex_login", model: "", capabilities: [] } }} onRuntimeReload={vi.fn()} onChanged={vi.fn()} />);
        const select = await screen.findByRole("checkbox", { name: "선택할 두 번째 요건 채택 후보로 선택" });
        expect(screen.getByRole("button", { name: "선택 후보 0건 적용" })).toHaveProperty("disabled", true);
        await user.click(select);
        await user.click(screen.getByRole("button", { name: "선택 후보 1건 적용" }));
        await waitFor(() => expect(apply).toHaveBeenCalledWith(candidateRun.id, [1], false));
    });
    it("can select a requirement without accepting the accompanying document", async () => {
        const user = userEvent.setup();
        if (!candidateRun.result) throw new Error("Fixture has no result");
        const mixed = { ...candidateRun, result: { ...candidateRun.result, document: "Unselected document" } };
        vi.spyOn(api, "runs").mockResolvedValue([mixed]);
        vi.spyOn(api, "run").mockResolvedValue(mixed);
        const apply = vi.spyOn(api, "applyRun").mockResolvedValue({ ...mixed, status: "applied" });
        render(<RunsPage projectId={projectId} userId={userId} route={{ project: projectId, view: "runs", item: "", run: mixed.id, q: "", kind: "", baseline: "" }} items={[idea]} runtime={{ status: "ready", data: { configured: true, provider: "codex_login", model: "", capabilities: [] } }} onRuntimeReload={vi.fn()} onChanged={vi.fn()} />);
        await user.click(await screen.findByRole("checkbox", { name: "선택할 두 번째 요건 채택 후보로 선택" }));
        expect(screen.getByRole("checkbox", { name: "이 문서 결과 적용 선택" })).toHaveProperty("checked", false);
        await user.click(screen.getByRole("button", { name: "선택 후보 1건 적용" }));
        await waitFor(() => expect(apply).toHaveBeenCalledWith(mixed.id, [1], false));
    });
});
