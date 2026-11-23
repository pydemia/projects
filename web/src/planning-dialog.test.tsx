import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { AuthRecoveryProvider } from "./auth-drafts";
import { candidateRun, idea, userId } from "./fixtures.test-data";
import type { Item } from "./models";
import { PlanningDialog, PlanningDraftLauncher } from "./PlanningDialog";
import { planningApi } from "./planning-api";
import type { PlanningDraft, PlanningProposal, PlanningReceipt } from "./planning-models";
import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";

const checkpoints = vi.hoisted(() => new Set<() => boolean | void>());
vi.mock("./reauthentication", async () => ({
    ...await vi.importActual<typeof import("./reauthentication")>("./reauthentication"),
    useReauthenticationCheckpoint(callback: () => boolean | void) {
        const ref = useRef(callback); ref.current = callback;
        useLayoutEffect(() => {const checkpoint = () => ref.current(); checkpoints.add(checkpoint); return () => {checkpoints.delete(checkpoint);};}, []);
    },
}));
const project = ownerProject();
const task: Item = {...idea, id: "ca673a01-4200-4b42-a1f4-614c78235c49", kind: "task", title: "공유 작업", revision: 7,
    data: {workflow: "personal", state: "done", list_name: "Inbox", planned_date: "2026-11-09", due_date: "", estimated_minutes: 0,
        context: "", energy: "any", next_action: true, abc_priority: "none", abc_order: 0, goal: "", github_issue_url: "", acceptance_criteria: [],
        result_url: "", target_sha: "", requires_test: false, cancellation_reason: "", custom_fields: {}}};
const storyProposal: PlanningProposal = {id: "new-story", kind: "create_story", title: "새 요구", body: "", default_selected: true};
const linkProposal: PlanningProposal = {id: "reuse-task", kind: "link", source: task.id, target: storyProposal.id, relation: "implements", default_selected: true};
function draft(proposals: PlanningProposal[] = []): PlanningDraft {
    return {id: "draft-one", project_id: project.id, actor_id: userId, mode: "incremental", status: "draft", version: 1,
        intent: "", references: [{id: task.id, project_id: project.id, revision: 7}], proposals, source_run_id: null,
        created_at: idea.created_at, updated_at: idea.updated_at, receipt: null};
}
const receipt: PlanningReceipt = {operation_id: "op", draft_id: "draft-one", created_items: [], updated_items: [], links: [], source_item_id: null};
function setup(proposals: PlanningProposal[] = []) {
    vi.spyOn(api, "items").mockResolvedValue([idea, task]);
    vi.spyOn(api, "runs").mockResolvedValue([]);
    vi.spyOn(planningApi, "get").mockResolvedValue(draft(proposals));
    vi.spyOn(planningApi, "list").mockResolvedValue([draft(proposals)]);
    vi.spyOn(planningApi, "create").mockImplementation(async (_pid, input) => ({...draft(input.proposals), references: [], mode: input.mode, intent: input.intent}));
    vi.spyOn(planningApi, "save").mockImplementation(async (_id, input) => ({...draft(input.proposals), version: input.expected_version + 1, intent: input.intent, status: input.status}));
    vi.spyOn(planningApi, "preview").mockImplementation(async (id, input) => ({draft_id: id, version: input.expected_version, selected_proposal_ids: input.selected_proposal_ids, changes: [], source: null}));
    vi.spyOn(planningApi, "apply").mockResolvedValue(receipt);
}
function add(kind = "create_task", title = "제목만 있는 작업") {
    fireEvent.change(screen.getByLabelText("변경 종류"), {target: {value: kind}});
    fireEvent.change(screen.getByLabelText("후보 제목"), {target: {value: title}});
    fireEvent.click(screen.getByRole("button", {name: "후보 추가"}));
}
function checkpoint() {act(() => {for (const callback of checkpoints) expect(callback()).not.toBe(false);});}
afterEach(() => {vi.restoreAllMocks(); sessionStorage.clear(); checkpoints.clear();});

describe("planning draft workspace", () => {
    it("reuses an existing Task for a new Story and blocks selected links when their new Story is unchecked", async () => {
        setup([storyProposal, linkProposal]);
        render(<PlanningDialog project={project} draftId="draft-one" onClose={vi.fn()} onApplied={vi.fn()} />);
        const story = await screen.findByRole("checkbox", {name: "새 Story 새 요구 선택"});
        expect(story).toHaveProperty("dataset.state", "checked");
        fireEvent.click(story);
        expect(screen.getByRole("alert")).toHaveProperty("textContent", expect.stringContaining("새 항목 ‘새 요구’"));
        expect(screen.getByRole("button", {name: "변경 미리보기"})).toHaveProperty("disabled", true);
        expect(screen.getByRole("button", {name: "선택한 변경 적용"})).toHaveProperty("disabled", true);
        expect(planningApi.apply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("checkbox", {name: "기존 항목 연결 공유 작업 → 새 요구 선택"}));
        fireEvent.click(story);
        fireEvent.click(screen.getByRole("button", {name: "변경 미리보기"}));
        await waitFor(() => expect(planningApi.preview).toHaveBeenCalledWith("draft-one", {expected_version: 2, selected_proposal_ids: ["new-story"]}));
        expect(planningApi.save).toHaveBeenCalledWith("draft-one", expect.objectContaining({proposals: [expect.objectContaining({id: "new-story"}), expect.objectContaining({source: task.id})]}));
        expect(planningApi.create).not.toHaveBeenCalled();
    });

    it("keeps existing updates unchecked and cancels by saving only the draft", async () => {
        setup([{id: "update", kind: "update_item", item_id: task.id, title: "선택할 수정", body: "바뀐 본문", default_selected: false}]);
        const close = vi.fn();
        render(<PlanningDialog project={project} mode="initial" draftId="draft-one" onClose={close} onApplied={vi.fn()} />);
        expect(await screen.findByRole("checkbox", {name: "기존 항목 수정 선택할 수정 선택"})).toHaveProperty("dataset.state", "unchecked");
        expect(screen.getByText(/현재 r7/)).toHaveProperty("textContent", expect.stringContaining("완료"));
        fireEvent.click(screen.getByRole("button", {name: "취소 · 초안 보존"}));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(planningApi.save).toHaveBeenCalledWith("draft-one", expect.objectContaining({status: "cancelled"}));
        expect(planningApi.apply).not.toHaveBeenCalled();
    });

    it("allows a custom task.create-only role to author and apply a title-only independent Task", async () => {
        setup();
        const restricted = {...project, access: {...project.access!, capabilities: ["project.read", "task.create"]}};
        render(<PlanningDialog project={restricted} onClose={vi.fn()} onApplied={vi.fn()} />, undefined, [restricted]);
        await waitFor(() => expect(screen.getByLabelText("변경 종류")).not.toHaveProperty("disabled", true));
        add();
        expect(screen.getByLabelText("변경 의도 · 문제, 기대 결과, 범위와 제외")).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", {name: "변경 미리보기"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "선택한 변경 적용"})).not.toHaveProperty("disabled", true));
        fireEvent.click(screen.getByRole("button", {name: "선택한 변경 적용"}));
        await screen.findByText("기획 적용 완료");
        expect(planningApi.create).toHaveBeenCalledWith(project.id, expect.objectContaining({intent: "", proposals: [expect.objectContaining({kind: "create_task", title: "제목만 있는 작업"})]}));
        expect(planningApi.apply).toHaveBeenCalledOnce();
    });

    it("retries an uncertain apply with the identical operation and selection, without automatic replay", async () => {
        setup([storyProposal]);
        vi.mocked(planningApi.apply).mockRejectedValueOnce(new ApiError("응답을 받지 못했습니다"));
        render(<PlanningDialog project={project} draftId="draft-one" onClose={vi.fn()} onApplied={vi.fn()} />);
        await screen.findByRole("checkbox", {name: "새 Story 새 요구 선택"});
        fireEvent.click(screen.getByRole("button", {name: "변경 미리보기"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "선택한 변경 적용"})).not.toHaveProperty("disabled", true));
        fireEvent.click(screen.getByRole("button", {name: "선택한 변경 적용"}));
        await screen.findByRole("button", {name: "같은 요청 재시도"});
        expect(planningApi.apply).toHaveBeenCalledOnce();
        expect(screen.getByRole("checkbox", {name: "새 Story 새 요구 선택"})).toHaveProperty("disabled", true);
        const first = vi.mocked(planningApi.apply).mock.calls[0];
        fireEvent.click(screen.getByRole("button", {name: "같은 요청 재시도"}));
        await screen.findByText("기획 적용 완료");
        expect(vi.mocked(planningApi.apply).mock.calls[1]).toEqual(first);
    });

    it("recovers unfinished candidate input after authentication without saving or applying it", async () => {
        setup();
        const mount = () => render(<AuthRecoveryProvider userId={userId}><PlanningDialog project={project} onClose={vi.fn()} onApplied={vi.fn()} /></AuthRecoveryProvider>);
        const first = mount();
        await waitFor(() => expect(screen.getByLabelText("후보 제목")).not.toHaveProperty("disabled", true));
        fireEvent.change(screen.getByLabelText("후보 제목"), {target: {value: "아직 추가하지 않은 Story"}});
        checkpoint(); first.unmount(); mount();
        expect(screen.getByLabelText("후보 제목")).toHaveProperty("value", "아직 추가하지 않은 Story");
        expect(planningApi.create).not.toHaveBeenCalled(); expect(planningApi.apply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "취소 · 초안 보존"}));
        expect(screen.getByRole("alert")).toHaveProperty("textContent", expect.stringContaining("후보 추가"));
    });

    it("keeps the draft when a revision conflict rejects applying and requires a new preview", async () => {
        setup([storyProposal]); vi.mocked(planningApi.apply).mockRejectedValue(new ApiError("참고 항목 revision 충돌", 409));
        render(<PlanningDialog project={project} draftId="draft-one" onClose={vi.fn()} onApplied={vi.fn()} />);
        await screen.findByRole("checkbox", {name: "새 Story 새 요구 선택"});
        fireEvent.click(screen.getByRole("button", {name: "변경 미리보기"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "선택한 변경 적용"})).not.toHaveProperty("disabled", true));
        fireEvent.click(screen.getByRole("button", {name: "선택한 변경 적용"}));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveProperty("textContent", expect.stringContaining("revision 충돌")));
        expect(screen.getByRole("checkbox", {name: "새 Story 새 요구 선택"})).toHaveProperty("dataset.state", "checked");
        expect(screen.getByRole("button", {name: "선택한 변경 적용"})).toHaveProperty("disabled", true);
        expect(screen.getByRole("button", {name: "변경 미리보기"})).not.toHaveProperty("disabled", true);
    });

    it("lists preserved drafts and resumes their current revision", async () => {
        setup([storyProposal]);
        render(<PlanningDraftLauncher project={project} onApplied={vi.fn()} />);
        fireEvent.click(await screen.findByText("저장된 기획 초안"));
        fireEvent.click(screen.getByRole("button", {name: /제목 없는 기획/}));
        await screen.findByRole("checkbox", {name: "새 Story 새 요구 선택"});
        expect(planningApi.get).toHaveBeenCalledWith("draft-one", expect.any(AbortSignal));
        expect(planningApi.apply).not.toHaveBeenCalled();
    });

    it("loads existing SkillRun candidates with provenance and excludes explicit decision records by default", async () => {
        setup(); vi.mocked(api.runs).mockResolvedValue([candidateRun]);
        const execute = vi.spyOn(api, "createRun").mockResolvedValue(candidateRun);
        vi.mocked(planningApi.create).mockResolvedValue({...draft([storyProposal, {id: "decision", kind: "record_decision", title: "중복 판단", disposition: "duplicate", rationale: "기존 요구와 동일", default_selected: false}]), source_run_id: candidateRun.id});
        render(<PlanningDialog project={project} onClose={vi.fn()} onApplied={vi.fn()} />);
        fireEvent.click(screen.getByText("기존 SkillRun 결과에서 후보 준비"));
        await waitFor(() => expect(screen.getByLabelText("검토할 SkillRun").querySelectorAll("option")).toHaveLength(2));
        fireEvent.change(screen.getByLabelText("검토할 SkillRun"), {target: {value: candidateRun.id}});
        fireEvent.click(screen.getByRole("button", {name: "SkillRun 후보 가져오기"}));
        expect(await screen.findByRole("checkbox", {name: "새 Story 새 요구 선택"})).toHaveProperty("dataset.state", "checked");
        expect(screen.getByRole("checkbox", {name: "근거·결정 기록 중복 판단 선택"})).toHaveProperty("dataset.state", "unchecked");
        expect(planningApi.create).toHaveBeenCalledWith(project.id, expect.objectContaining({source_run_id: candidateRun.id, proposals: []}));
        expect(execute).not.toHaveBeenCalled();
        expect(planningApi.apply).not.toHaveBeenCalled();
    });

    it("restores an uncertain operation after authentication and waits for a manual retry", async () => {
        setup([storyProposal]); vi.mocked(planningApi.apply).mockRejectedValueOnce(new ApiError("연결 종료"));
        const mount = () => render(<AuthRecoveryProvider userId={userId}><PlanningDialog project={project} draftId="draft-one" onClose={vi.fn()} onApplied={vi.fn()} /></AuthRecoveryProvider>);
        const first = mount();
        await screen.findByRole("checkbox", {name: "새 Story 새 요구 선택"});
        fireEvent.click(screen.getByRole("button", {name: "변경 미리보기"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "선택한 변경 적용"})).not.toHaveProperty("disabled", true));
        fireEvent.click(screen.getByRole("button", {name: "선택한 변경 적용"}));
        await screen.findByRole("button", {name: "같은 요청 재시도"});
        const original = vi.mocked(planningApi.apply).mock.calls[0];
        checkpoint(); first.unmount(); mount();
        await screen.findByRole("button", {name: "같은 요청 재시도"});
        expect(planningApi.apply).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("button", {name: "같은 요청 재시도"}));
        await screen.findByText("기획 적용 완료");
        expect(vi.mocked(planningApi.apply).mock.calls[1]).toEqual(original);
    });

    it("shows readable field differences and relation endpoint titles without generated identifiers", async () => {
        setup([storyProposal, linkProposal]);
        vi.mocked(planningApi.preview).mockResolvedValue({draft_id: "draft-one", version: 2, selected_proposal_ids: [storyProposal.id, linkProposal.id], source: null,
            changes: [
                {proposal_id: storyProposal.id, kind: "create_story", before: null, after: {id: "temporary-story-id", project_id: project.id, title: "새 요구", revision: 1, data: {acceptance_criteria: ["공유 작업 재사용"], planned_date: "2026-11-10"}}},
                {proposal_id: linkProposal.id, kind: "link", before: null, after: {id: "temporary-link-id", source_id: task.id, target_id: "temporary-story-id", relation: "implements", source_revision: 7, target_revision: 1}},
            ]});
        render(<PlanningDialog project={project} draftId="draft-one" onClose={vi.fn()} onApplied={vi.fn()} />);
        await screen.findByRole("checkbox", {name: "새 Story 새 요구 선택"});
        fireEvent.click(screen.getByRole("button", {name: "변경 미리보기"}));
        await screen.findAllByText("서버 미리보기 · 필드별 변경 확인");
        expect(screen.getByText("수용 조건")).toBeTruthy();
        expect(screen.getByText("실행 예정일")).toBeTruthy();
        expect(screen.getByText("출발 항목")).toBeTruthy();
        expect(screen.getByText("도착 항목")).toBeTruthy();
        expect(document.body.textContent).not.toContain("temporary-story-id");
        expect(document.body.textContent).not.toContain("temporary-link-id");
        expect(document.body.textContent).not.toContain("source_id");
        expect(document.body.textContent).not.toContain("acceptance_criteria");
        expect(screen.getByText("Task → Story · 기여")).toBeTruthy();
    });
});
