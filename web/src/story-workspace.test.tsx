import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { idea, projectId, userId } from "./fixtures.test-data";
import type { Route } from "./hooks";
import { itemSchema, type Item, type Link } from "./models";
import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { Relations, StoryTaskLinks } from "./Relations";
import { StoriesPage, StoryEditor } from "./StoriesPage";
import { storyApi } from "./story-api";
import { contributingItems, visibleRelationGroups } from "./story-models";

const story = itemSchema.parse({...idea, kind: "requirement", title: "지출을 저장한다", body: "", data: {acceptance_criteria: ["금액을 수정해 저장한다"], processing_state: null}});
const task = itemSchema.parse({...idea, id: "ca673a01-4200-4b42-a1f4-614c78235c44", kind: "task", title: "저장 화면 검증", data: {state: "todo", workflow: "personal"}});
const route: Route = {project: projectId, view: "stories", kind: "requirement", item: "", q: "", run: "", baseline: ""};
const verification = {id: "verification-1", item_id: story.id, item_revision: 1, actor_id: userId, created_at: idea.created_at,
    evidence: "금액을 수정해 지출에 저장됨을 확인했다", criteria_hash: "hash", criterion_results: [{criterion: "금액을 수정해 저장한다", passed: true, evidence: "금액 수정 후 저장 결과 확인"}]};
const link: Link = {id: "link-1", project_id: projectId, source_id: task.id, target_id: story.id, relation: "implements", source_revision: 1, target_revision: 1};

beforeAll(async () => {await import("./MarkdownContent");});
beforeEach(() => {
    vi.spyOn(api, "links").mockResolvedValue([]);
    vi.spyOn(api, "projects").mockResolvedValue([ownerProject()]);
    vi.spyOn(storyApi, "verifications").mockResolvedValue([]);
    vi.spyOn(storyApi, "list").mockResolvedValue({stories: [{item: story, task_ids: [], completed_task_count: 0, verification_current: false}],
        task_total: 0, task_done: 0, story_total: 1, story_fulfilled: 0});
});

describe("Story workspace (mocked API)", () => {
    it("creates a Story with only a title and an explicit initial processing state", async () => {
        const create = vi.spyOn(api, "createItem").mockResolvedValue(story);
        const user = userEvent.setup();
        render(<StoriesPage projectId={projectId} userId={userId} route={route} items={[story]} onChanged={vi.fn()} />);
        await user.click(screen.getByRole("button", {name: "+ Story 추가"}));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
        await user.type(within(dialog).getByRole("textbox", {name: "Story 제목"}), "제목만 있는 요구");
        await user.click(within(dialog).getByRole("button", {name: "Story 추가"}));
        await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, expect.objectContaining({kind: "requirement", title: "제목만 있는 요구", body: "", data: expect.objectContaining({processing_state: "raised"})})));
    });

    it("shows a legacy Story as unset independently of confirmed item status", async () => {
        render(<StoryEditor item={{...story, status: "confirmed"}} items={[story]} userId={userId} onChanged={vi.fn()} />);
        expect(screen.getByRole("combobox", {name: "처리 상태"})).toHaveProperty("value", "");
        expect(screen.getByText("확정")).toBeTruthy();
        expect(screen.getByRole("option", {name: "미설정"})).toBeTruthy();
        expect(screen.getByRole("option", {name: "충족 · 검증으로 기록"})).toHaveProperty("disabled", true);
    });

    it("edits the problem inline with a revision precondition while preserving the remaining data", async () => {
        const updated = {...story, revision: 2, data: {...story.data, problem: "알림 금액이 정확하지 않음"}} as Item;
        const save = vi.spyOn(api, "saveItem").mockResolvedValue(updated);
        render(<StoryEditor item={story} items={[story]} userId={userId} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", {name: "현재 상태·문제 수정"}));
        fireEvent.change(screen.getByRole("textbox", {name: "현재 상태·문제"}), {target: {value: "알림 금액이 정확하지 않음"}});
        fireEvent.keyDown(screen.getByRole("textbox", {name: "현재 상태·문제"}), {key: "Enter", ctrlKey: true});
        await waitFor(() => expect(save).toHaveBeenCalledWith(story.id, {expected_revision: 1, title: story.title, body: story.body, data: {...story.data, problem: "알림 금액이 정확하지 않음"}}));
    });

    it("does not fulfill a Story when all related Tasks are done", async () => {
        vi.mocked(api.links).mockResolvedValue([link]);
        const verify = vi.spyOn(storyApi, "verify");
        const save = vi.spyOn(api, "saveItem");
        const done = {...task, data: {...task.data, state: "done"}} as Item;
        render(<StoryEditor item={story} items={[story, done]} userId={userId} onChanged={vi.fn()} />);
        expect((await screen.findAllByText("저장 화면 검증")).length).toBeGreaterThan(0);
        expect(screen.getByRole("combobox", {name: "처리 상태"})).toHaveProperty("value", "");
        expect(verify).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    });

    it("requires explicit current-revision criterion checks and evidence, including with an open Task", async () => {
        vi.mocked(api.links).mockResolvedValue([link]);
        const fulfilled = {...story, revision: 2, data: {...story.data, processing_state: "fulfilled"}} as Item;
        const verify = vi.spyOn(storyApi, "verify").mockResolvedValue({item: fulfilled, verification});
        const user = userEvent.setup();
        render(<StoryEditor item={story} items={[story, task]} userId={userId} onChanged={vi.fn()} />);
        await user.click(screen.getByRole("button", {name: "검증 결과 기록"}));
        const dialog = screen.getByRole("dialog");
        const submit = within(dialog).getByRole("button", {name: "충족으로 기록"});
        expect(submit).toHaveProperty("disabled", true);
        await user.type(within(dialog).getByRole("textbox", {name: "종합 검증 근거"}), verification.evidence);
        expect(submit).toHaveProperty("disabled", true);
        await user.click(within(dialog).getByRole("checkbox", {name: "금액을 수정해 저장한다"}));
        expect(submit).toHaveProperty("disabled", true);
        await user.type(within(dialog).getByRole("textbox", {name: "수용 조건 1 검증 근거"}), verification.criterion_results[0]!.evidence);
        await user.click(submit);
        await waitFor(() => expect(verify).toHaveBeenCalledWith(story.id, {expected_revision: 1, evidence: verification.evidence, criterion_results: verification.criterion_results}));
    });

    it("shows reconfirmation separately from preserved fulfilled state", () => {
        const fulfilled = {...story, data: {...story.data, processing_state: "fulfilled"}} as Item;
        render(<StoryEditor item={fulfilled} items={[fulfilled]} userId={userId} onChanged={vi.fn()} verificationCurrent={false} />);
        expect(screen.getByText("재확인 필요")).toBeTruthy();
        expect(screen.getByRole("combobox", {name: "처리 상태"})).toHaveProperty("value", "fulfilled");
    });

    it("links an existing shared Task in the canonical Task to Story direction", async () => {
        const create = vi.spyOn(api, "createLink").mockResolvedValue(link);
        const user = userEvent.setup();
        render(<StoryTaskLinks item={story} items={[story, task]} onChanged={vi.fn()} />);
        await screen.findByRole("option", {name: task.title});
        await user.selectOptions(screen.getByRole("combobox", {name: "기존 Task 연결"}), task.id);
        await user.click(screen.getByRole("button", {name: "연결"}));
        await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, {source_id: task.id, target_id: story.id, relation: "implements"}));
        expect(contributingItems(story, [story, task], [link, {...link, id: "legacy-duplicate"}])).toHaveLength(1);
        expect(contributingItems(task, [story, task], [link])).toEqual([story]);
    });

    it("groups symmetric legacy relations and confirms the exact stored links without exposing unavailable endpoints", async () => {
        const related = {...link, relation: "relates_to"} as Link;
        const reverse = {...related, id: "reverse-link", source_id: story.id, target_id: task.id, source_revision: 2};
        const hidden = {...related, id: "secret-link", source_id: "hidden-item-id"};
        vi.mocked(api.links).mockResolvedValue([related, reverse, hidden]);
        vi.spyOn(api, "item").mockRejectedValue(new ApiError("찾을 수 없습니다", 404));
        const remove = vi.spyOn(api, "deleteLink").mockResolvedValue({ok: true});
        const user = userEvent.setup();
        render(<Relations item={story} items={[story, task]} onChanged={vi.fn()} />);
        await screen.findByRole("button", {name: "연결 해제"});
        expect(screen.getAllByRole("button", {name: "연결 해제"})).toHaveLength(1);
        expect(screen.queryByText(/hidden-item-id|secret-link/)).toBeNull();
        expect(visibleRelationGroups(story, [story, task], [related, reverse, hidden])).toEqual([[related, reverse]]);
        await user.click(screen.getByRole("button", {name: "연결 해제"}));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByText(/연결 ID link-1/)).toBeTruthy();
        expect(within(dialog).getByText(/연결 ID reverse-link/)).toBeTruthy();
        expect(remove).not.toHaveBeenCalled();
        await user.click(within(dialog).getByRole("button", {name: "연결 2개 해제"}));
        await waitFor(() => expect(remove).toHaveBeenNthCalledWith(1, "link-1"));
        expect(remove).toHaveBeenNthCalledWith(2, "reverse-link");
    });

    it("reads accessible cross-project endpoints while keeping new-link candidates scoped to the current project", async () => {
        const external = {...task, project_id: "ca673a01-4200-4b42-a1f4-614c78235c45", title: "다른 프로젝트의 공유 작업"} as Item;
        vi.mocked(api.links).mockResolvedValue([link]);
        vi.spyOn(api, "item").mockResolvedValue(external);
        render(<StoryTaskLinks item={story} items={[story]} onChanged={vi.fn()} />);
        expect(await screen.findByRole("link", {name: external.title})).toBeTruthy();
        expect(screen.queryByRole("option", {name: external.title})).toBeNull();
    });

    it("explicitly selects another writable project and resets the target before linking a shared Task", async () => {
        const externalProject = ownerProject("ca673a01-4200-4b42-a1f4-614c78235c45", "두 번째 프로젝트");
        const external = {...task, project_id: externalProject.id, title: "공유할 외부 작업"} as Item;
        vi.mocked(api.projects).mockResolvedValue([ownerProject(), externalProject]);
        const items = vi.spyOn(api, "items").mockResolvedValue([external]);
        const create = vi.spyOn(api, "createLink").mockResolvedValue({...link, source_id: external.id});
        const user = userEvent.setup();
        render(<StoryTaskLinks item={story} items={[story, task]} onChanged={vi.fn()} />, undefined, [ownerProject(), externalProject]);
        await screen.findByRole("option", {name: externalProject.name});
        await user.selectOptions(screen.getByRole("combobox", {name: "기존 Task 연결"}), task.id);
        await user.selectOptions(screen.getByRole("combobox", {name: "연결 대상 프로젝트"}), externalProject.id);
        expect(screen.getByRole("combobox", {name: "기존 Task 연결"})).toHaveProperty("value", "");
        expect(create).not.toHaveBeenCalled();
        await screen.findByRole("option", {name: external.title});
        await user.selectOptions(screen.getByRole("combobox", {name: "기존 Task 연결"}), external.id);
        await user.click(screen.getByRole("button", {name: "연결"}));
        expect(items).toHaveBeenCalledWith(externalProject.id, expect.any(AbortSignal));
        await waitFor(() => expect(create).toHaveBeenCalledWith(projectId, {source_id: external.id, target_id: story.id, relation: "implements"}));
    });

    it("labels imported historical verification as excluded from current proof", async () => {
        vi.mocked(storyApi.verifications).mockResolvedValue([{...verification, archived_unverified: true}]);
        render(<StoryEditor item={story} items={[story]} userId={userId} onChanged={vi.fn()} />);
        expect(await screen.findByText("가져온 과거 기록 · 현재 검증에 미포함")).toBeTruthy();
    });

    it("requires at least one acceptance criterion before recording fulfillment", async () => {
        const empty = {...story, data: {...story.data, acceptance_criteria: []}} as Item;
        const verify = vi.spyOn(storyApi, "verify");
        const user = userEvent.setup();
        render(<StoryEditor item={empty} items={[empty]} userId={userId} onChanged={vi.fn()} />);
        await user.click(screen.getByRole("button", {name: "검증 결과 기록"}));
        const dialog = screen.getByRole("dialog");
        await user.type(within(dialog).getByRole("textbox", {name: "종합 검증 근거"}), "조건 없는 과거 근거");
        expect(within(dialog).getByRole("button", {name: "충족으로 기록"})).toHaveProperty("disabled", true);
        expect(within(dialog).getByText(/먼저 Story에 확인할 수용 조건/)).toBeTruthy();
        expect(verify).not.toHaveBeenCalled();
    });
});
