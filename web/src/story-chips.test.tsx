import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { idea, projectId } from "./fixtures.test-data";
import { itemSchema, type Link } from "./models";
import { ownerProject, renderWithOwnerPermissions as render } from "./permissions.test-support";
import { TaskStoryChips, TaskStoryProvider } from "./StoryChips";

const task = itemSchema.parse({...idea, kind: "task", data: {workflow: "personal"}});
const first = itemSchema.parse({...idea, id: "ca673a01-4200-4b42-a1f4-614c78235c45", kind: "requirement", title: "첫 Story", data: {}});
const second = itemSchema.parse({...first, id: "ca673a01-4200-4b42-a1f4-614c78235c46", title: "공유 Task의 둘째 Story", project_id: "ca673a01-4200-4b42-a1f4-614c78235c47"});
function link(target: string, id = target): Link {return {id, project_id: projectId, source_id: task.id, target_id: target, relation: "implements", source_revision: 1, target_revision: 1};}

describe("Task Story chips (mocked API)", () => {
    it("loads relations once for multiple rows and shows two Stories for a shared Task with correct navigation", async () => {
        const links = vi.spyOn(api, "links").mockResolvedValue([link(first.id), link(second.id), link(first.id, "duplicate"), {...link(task.id, "wrong-direction"), source_id: first.id}]);
        vi.spyOn(api, "item").mockResolvedValue(second);
        const rowClick = vi.fn();
        render(<TaskStoryProvider projectId={projectId} items={[task, first]} revision={1}>
            <div onClick={rowClick}><TaskStoryChips taskId={task.id} /></div><TaskStoryChips taskId="independent-task" />
        </TaskStoryProvider>, undefined, [ownerProject(), ownerProject(second.project_id)]);
        const firstChip = await screen.findByRole("link", {name: first.title});
        const secondChip = screen.getByRole("link", {name: second.title});
        expect(screen.getAllByRole("link")).toHaveLength(2);
        expect(links).toHaveBeenCalledTimes(1);
        fireEvent.click(secondChip);
        expect(rowClick).not.toHaveBeenCalled();
        expect(new URLSearchParams(location.search).get("item")).toBe(second.id);
        expect(new URLSearchParams(location.search).get("project")).toBe(second.project_id);
        expect(new URLSearchParams(location.search).get("view")).toBe("stories");
        expect(firstChip.getAttribute("href")).toContain(first.id);
    });

    it("omits an unavailable endpoint without exposing its title, identifier or count", async () => {
        vi.spyOn(api, "links").mockResolvedValue([link(first.id), link("hidden-story-id")]);
        vi.spyOn(api, "item").mockRejectedValue(new ApiError("접근할 수 없습니다", 404));
        render(<TaskStoryProvider projectId={projectId} items={[task, first]} revision={1}><TaskStoryChips taskId={task.id} /></TaskStoryProvider>);
        expect(await screen.findByRole("link", {name: first.title})).toBeTruthy();
        expect(screen.getAllByRole("link")).toHaveLength(1);
        expect(screen.queryByText(/hidden-story-id/)).toBeNull();
    });
});
