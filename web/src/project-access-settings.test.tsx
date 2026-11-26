import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { AuthRecoveryProvider } from "./auth-drafts";
import { projectId, userId } from "./fixtures.test-data";
import type { Project } from "./models";
import { ProjectAccessSettings, ProjectInvitationAccept, ProjectOwnershipAccept } from "./ProjectAccessSettings";
import { accessApi, type ProjectAccess, type ProjectInvitation, type ProjectRole } from "./project-access";
import { reauthentication } from "./reauthentication";

const otherId = "ca673a01-4200-4b42-a1f4-614c78235c49";
const owner: ProjectRole = {id: "owner-role", name: "오너", preset: "owner", revision: 1, member_count: 1,
    permissions: ["project.read", "project.update", "task.create", "member.manage", "role.manage", "ownership.transfer", "project.archive"]};
const editor: ProjectRole = {id: "editor-role", name: "에디터", preset: "editor", revision: 1, member_count: 0,
    permissions: ["project.read", "project.update", "task.create"]};
const viewer: ProjectRole = {id: "viewer-role", name: "뷰어", preset: "viewer", revision: 1, member_count: 1,
    permissions: ["project.read", "project.export"]};
const custom: ProjectRole = {id: "custom-role", name: "검토자", preset: "custom", revision: 1, member_count: 3,
    permissions: ["project.read", "project.export"]};
const project: Project = {id: projectId, name: "권한 검증", goal: "", profile: "simple", version: 1,
    created_at: "2026-11-07T00:00:00Z", sort_order: 0, repository_url: null, repository_path: "", repository_branch: null,
    repository_sha: null, repository_kind: null, repository_manifest: null, repository_imported_at: null};
const ownerAccess: ProjectAccess = {project_id: projectId, access_revision: 7, membership_id: "own-membership",
    role: {id: owner.id, name: owner.name, preset: owner.preset}, capabilities: owner.permissions, archived: false};
const invitation: ProjectInvitation = {id: "invitation-id", project_id: projectId, role_id: viewer.id,
    kind: "membership", target_account_id: null, expires_at: "2099-11-08T00:00:00Z", claimed_by: null, revoked_at: null};

function mockOwner() {
    vi.spyOn(accessApi, "access").mockResolvedValue(ownerAccess);
    vi.spyOn(accessApi, "roles").mockResolvedValue([owner, editor, viewer, custom]);
    vi.spyOn(accessApi, "members").mockResolvedValue([
        {membership_id: "own-membership", account_id: userId, username: "현재 오너", role: owner},
        {membership_id: "other-membership", account_id: otherId, username: "다른 멤버", role: viewer},
    ]);
    vi.spyOn(accessApi, "invitations").mockResolvedValue([]);
}
function mount() {
    return render(<AuthRecoveryProvider userId={userId}><ProjectAccessSettings project={project} onChanged={vi.fn()} userId={userId} /></AuthRecoveryProvider>);
}
afterEach(() => {sessionStorage.clear();});

describe("project member and role settings", () => {
    it("advises on this project's unfinished Tasks before allowing direct archive", async () => {
        mockOwner();
        const tasks = vi.spyOn(api, "tasks").mockResolvedValue({items: [], total: 2,
            scope_counts: {all: 2, today: 0, inbox: 0, upcoming: 0}, next_cursor: null, as_of: "2026-11-26T00:00:00Z"});
        const archive = vi.spyOn(accessApi, "archive").mockResolvedValue({access_revision: 8});
        mount();
        fireEvent.click(await screen.findByRole("button", {name: "프로젝트 보관"}));
        const dialog = await screen.findByRole("dialog");
        expect(await within(dialog).findByText(/열린 Task가 2개/)).toBeTruthy();
        expect(tasks).toHaveBeenCalledWith({project_id: projectId, status: "open", limit: "1"});
        fireEvent.click(within(dialog).getByRole("button", {name: "미완료 Task 보기"}));
        expect(archive).not.toHaveBeenCalled();
        expect(new URLSearchParams(window.location.search).get("project")).toBe(projectId);
        expect(new URLSearchParams(window.location.search).get("view")).toBe("tasks");
        expect(new URLSearchParams(window.location.search).get("taskStatus")).toBe("open");

        window.history.replaceState(null, "", window.location.pathname);
        fireEvent.click(screen.getByRole("button", {name: "프로젝트 보관"}));
        const directDialog = await screen.findByRole("dialog");
        await within(directDialog).findByText(/열린 Task가 2개/);
        fireEvent.click(within(directDialog).getByRole("button", {name: "그대로 보관"}));
        await waitFor(() => expect(archive).toHaveBeenCalledWith(projectId, expect.objectContaining({archived: true, expected_revision: 7})));
    });

    it("uses the existing confirmation for no unfinished Tasks and does not check Tasks when restoring", async () => {
        mockOwner();
        const tasks = vi.spyOn(api, "tasks").mockResolvedValue({items: [], total: 0,
            scope_counts: {all: 0, today: 0, inbox: 0, upcoming: 0}, next_cursor: null, as_of: "2026-11-26T00:00:00Z"});
        const archive = vi.spyOn(accessApi, "archive").mockResolvedValue({access_revision: 8});
        const first = mount();
        fireEvent.click(await screen.findByRole("button", {name: "프로젝트 보관"}));
        const dialog = await screen.findByRole("dialog");
        expect(await within(dialog).findByText(/모든 멤버가 업무 자료를 읽기 전용/)).toBeTruthy();
        expect(within(dialog).queryByRole("button", {name: "미완료 Task 보기"})).toBeNull();
        fireEvent.click(within(dialog).getByRole("button", {name: "변경 확인"}));
        await waitFor(() => expect(archive).toHaveBeenCalledWith(projectId, expect.objectContaining({archived: true})));

        first.unmount();
        vi.mocked(accessApi.access).mockResolvedValue({...ownerAccess, archived: true});
        const restored = mount();
        fireEvent.click(await screen.findByRole("button", {name: "프로젝트 복원"}));
        const restoreDialog = await screen.findByRole("dialog");
        expect(restoreDialog.textContent).toContain("역할에 따라 업무 자료를 다시 편집할 수 있습니다.");
        fireEvent.click(within(restoreDialog).getByRole("button", {name: "변경 확인"}));
        await waitFor(() => expect(archive).toHaveBeenLastCalledWith(projectId, expect.objectContaining({archived: false, expected_revision: 7})));
        expect(tasks).toHaveBeenCalledTimes(1);
        restored.unmount();
    });

    it("shows a viewer's own access without loading or exposing administrator controls", async () => {
        vi.spyOn(accessApi, "access").mockResolvedValue({...ownerAccess, role: viewer, capabilities: viewer.permissions});
        vi.spyOn(accessApi, "roles").mockResolvedValue([{...viewer, member_count: undefined}]);
        const members = vi.spyOn(accessApi, "members");
        const invitations = vi.spyOn(accessApi, "invitations");
        mount();
        expect(await screen.findByText("내 역할: 뷰어")).toBeTruthy();
        expect(screen.getByRole("heading", {name: "내 프로젝트 접근 권한"})).toBeTruthy();
        expect(screen.queryByRole("button", {name: "초대 링크 만들기"})).toBeNull();
        expect(screen.queryByRole("button", {name: "이전 요청"})).toBeNull();
        fireEvent.click(screen.getByRole("button", {name: "역할"}));
        expect(screen.queryByRole("button", {name: "역할 만들기"})).toBeNull();
        expect(members).not.toHaveBeenCalled();
        expect(invitations).not.toHaveBeenCalled();
    });

    it("protects the last owner and copies only allowed permissions into a custom role", async () => {
        mockOwner();
        const create = vi.spyOn(accessApi, "createRole").mockResolvedValue({...custom, name: "새 역할"});
        mount();
        await screen.findByText("현재 오너 (나)");
        const ownerRow = screen.getByText("현재 오너 (나)").closest("li");
        expect(ownerRow).not.toBeNull();
        expect(within(ownerRow!).getByRole("button", {name: "제거"})).toHaveProperty("disabled", true);
        expect(screen.getByRole("button", {name: "프로젝트 탈퇴"})).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", {name: "역할"}));
        fireEvent.click(screen.getByRole("button", {name: "역할 만들기"}));
        fireEvent.change(screen.getByLabelText("복사할 역할"), {target: {value: owner.id}});
        fireEvent.change(screen.getByLabelText("역할 이름"), {target: {value: "새 역할"}});
        fireEvent.click(screen.getByRole("button", {name: "역할 저장"}));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        expect(create.mock.calls[0]?.[1]).toMatchObject({name: "새 역할", expected_revision: 7,
            permissions: ["project.read", "project.update", "task.create"]});
        expect(create.mock.calls[0]?.[1].permissions).not.toContain("project.archive");
        expect(create.mock.calls[0]?.[1].permissions).not.toContain("member.manage");
        expect(create.mock.calls[0]?.[1].permissions).not.toContain("ownership.transfer");
    });

    it("shows the affected member count and changed permissions before applying a role edit", async () => {
        mockOwner();
        const update = vi.spyOn(accessApi, "updateRole").mockResolvedValue({...custom, permissions: ["project.read"]});
        mount();
        await screen.findByText("내 역할: 오너");
        fireEvent.click(screen.getByRole("button", {name: "역할"}));
        fireEvent.click(screen.getByRole("button", {name: "수정"}));
        fireEvent.click(screen.getByRole("checkbox", {name: "ZIP 내보내기"}));
        fireEvent.click(screen.getByRole("button", {name: "역할 저장"}));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.textContent).toContain("멤버 3명");
        expect(dialog.textContent).toContain("ZIP 내보내기");
        expect(update).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole("button", {name: "변경 확인"}));
        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
        expect(update.mock.calls[0]?.[2]).toMatchObject({expected_revision: 7, name: "검토자", permissions: ["project.read"]});
    });

    it("keeps a forbidden role change visible inside the confirmation and does not change the member", async () => {
        mockOwner();
        vi.spyOn(accessApi, "updateMember").mockRejectedValue(new ApiError("멤버 관리 권한이 없습니다.", 403));
        mount();
        const select = await screen.findByLabelText("다른 멤버 역할");
        fireEvent.change(select, {target: {value: editor.id}});
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", {name: "변경 확인"}));
        expect(await within(dialog).findByText("멤버 관리 권한이 없습니다.")).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", {name: "취소"}));
        expect(screen.getByLabelText("다른 멤버 역할")).toHaveProperty("value", viewer.id);
    });

    it("issues an explicitly targeted invitation and displays its one-time token only in the link fragment", async () => {
        mockOwner();
        const create = vi.spyOn(accessApi, "createInvitation").mockResolvedValue({...invitation, access_revision: 8, token: "once-only-bearer"});
        mount();
        fireEvent.change(await screen.findByLabelText("초대할 계정 ID"), {target: {value: otherId}});
        fireEvent.click(screen.getByRole("button", {name: "초대 링크 만들기"}));
        const link = await screen.findByRole("textbox", {name: "초대 수락 링크"});
        const value = new URL((link as HTMLInputElement).value);
        expect(value.searchParams.get("expectedRevision")).toBe("8");
        expect(value.search).not.toContain("once-only-bearer");
        expect(new URLSearchParams(value.hash.slice(1)).get("invitationToken")).toBe("once-only-bearer");
        expect(create.mock.calls[0]?.[1]).toMatchObject({role_id: viewer.id, account_id: otherId, expires_in_hours: 72, expected_revision: 7});
        await act(async () => {await reauthentication.captureDrafts();});
        expect(JSON.stringify({...sessionStorage})).not.toContain("once-only-bearer");
    });

    it("restores an unsaved role after authentication and requires review of its stale revision", async () => {
        mockOwner();
        const create = vi.spyOn(accessApi, "createRole").mockResolvedValue(custom);
        const first = mount();
        await screen.findByText("내 역할: 오너");
        fireEvent.click(screen.getByRole("button", {name: "역할"}));
        fireEvent.click(screen.getByRole("button", {name: "역할 만들기"}));
        fireEvent.change(screen.getByLabelText("역할 이름"), {target: {value: "보존할 역할 초안"}});
        await act(async () => {expect(await reauthentication.captureDrafts()).toBe(true);});
        first.unmount();
        vi.mocked(accessApi.access).mockResolvedValue({...ownerAccess, access_revision: 8});
        mount();
        await screen.findByText("내 역할: 오너");
        fireEvent.click(screen.getByRole("button", {name: "역할"}));
        expect(screen.getByLabelText("역할 이름")).toHaveProperty("value", "보존할 역할 초안");
        expect(screen.getByRole("button", {name: "역할 저장"})).toHaveProperty("disabled", true);
        expect(create).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "최신 권한 기준으로 검토 완료"}));
        fireEvent.click(screen.getByRole("button", {name: "역할 저장"}));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        expect(create.mock.calls[0]?.[1]).toMatchObject({expected_revision: 8, name: "보존할 역할 초안"});
    });

    it("preserves an unsaved role when a separate invitation succeeds", async () => {
        mockOwner();
        vi.spyOn(accessApi, "createInvitation").mockResolvedValue({...invitation, access_revision: 8, token: "once"});
        mount();
        await screen.findByText("내 역할: 오너");
        fireEvent.click(screen.getByRole("button", {name: "역할"}));
        fireEvent.click(screen.getByRole("button", {name: "역할 만들기"}));
        fireEvent.change(screen.getByLabelText("역할 이름"), {target: {value: "아직 저장하지 않은 역할"}});
        fireEvent.click(screen.getByRole("button", {name: "멤버"}));
        fireEvent.click(screen.getByRole("button", {name: "초대 링크 만들기"}));
        await screen.findByRole("textbox", {name: "초대 수락 링크"});
        fireEvent.click(screen.getByRole("button", {name: "역할"}));
        expect(screen.getByLabelText("역할 이름")).toHaveProperty("value", "아직 저장하지 않은 역할");
    });
});

describe("explicit invitation and ownership acceptance", () => {
    it("waits for explicit invitation acceptance and sends token only in the POST body", async () => {
        vi.spyOn(accessApi, "previewInvitation").mockResolvedValue({project_id: projectId, project_name: "초대받은 프로젝트", access_revision: 9, role: viewer, kind: "membership", expires_at: invitation.expires_at});
        const accept = vi.spyOn(accessApi, "acceptInvitation").mockResolvedValue({project_id: projectId});
        const accepted = vi.fn();
        render(<ProjectInvitationAccept invitationId="invite" token="token" expectedRevision={8} onAccepted={accepted} />);
        await screen.findByText("초대받은 프로젝트");
        expect(accept).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "현재 계정으로 수락"}));
        await waitFor(() => expect(accepted).toHaveBeenCalledWith(projectId));
        expect(accept.mock.calls[0]).toEqual(["invite", {token: "token", expected_revision: 9, operation_id: expect.any(String)}]);
    });

    it("keeps a stale ownership transfer failure visible without granting access", async () => {
        vi.spyOn(accessApi, "previewInvitation").mockResolvedValue({project_id: projectId, project_name: "소유권 대상 프로젝트", access_revision: 8, role: owner, kind: "ownership", expires_at: invitation.expires_at});
        const accept = vi.spyOn(accessApi, "acceptOwnership").mockRejectedValue(new ApiError("프로젝트 권한이 변경되었습니다.", 409));
        const accepted = vi.fn();
        render(<ProjectOwnershipAccept projectId={projectId} transferId="transfer" token="one-use" expectedRevision={8} onAccepted={accepted} />);
        await screen.findByText("소유권 대상 프로젝트");
        expect(accept).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", {name: "현재 계정으로 수락"}));
        expect(await screen.findByText("프로젝트 권한이 변경되었습니다.")).toBeTruthy();
        expect(screen.getByRole("button", {name: "초대 정보 다시 확인"})).toBeTruthy();
        expect(accepted).not.toHaveBeenCalled();
    });

    it("requires another explicit acceptance after refreshing a conflicting preview", async () => {
        const preview = {project_id: projectId, project_name: "공유 프로젝트", access_revision: 8,
            role: viewer, kind: "membership" as const, expires_at: invitation.expires_at};
        const previewCall = vi.spyOn(accessApi, "previewInvitation").mockResolvedValueOnce(preview).mockResolvedValue({...preview, access_revision: 9});
        const accept = vi.spyOn(accessApi, "acceptInvitation").mockRejectedValueOnce(new ApiError("현재 권한을 다시 확인해 주세요.", 409)).mockResolvedValue({project_id: projectId});
        render(<ProjectInvitationAccept invitationId="invite" token="token" onAccepted={vi.fn()} />);
        await screen.findByText("공유 프로젝트");
        fireEvent.click(screen.getByRole("button", {name: "현재 계정으로 수락"}));
        await screen.findByText("현재 권한을 다시 확인해 주세요.");
        expect(screen.getByRole("button", {name: "현재 계정으로 수락"})).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", {name: "초대 정보 다시 확인"}));
        await waitFor(() => expect(previewCall).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByRole("button", {name: "현재 계정으로 수락"})).toHaveProperty("disabled", false));
        expect(accept).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", {name: "현재 계정으로 수락"}));
        await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));
        expect(accept.mock.calls[1]?.[1]).toMatchObject({expected_revision: 9});
        expect(accept.mock.calls[1]?.[1].operation_id).not.toBe(accept.mock.calls[0]?.[1].operation_id);
    });
});
