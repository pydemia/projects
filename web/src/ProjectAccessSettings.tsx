import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ApiError, errorMessage } from "./api";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { DateTimeValue } from "./date-time-settings";
import type { Project } from "./models";
import { Button } from "./pydemia-ui/button";
import { Checkbox } from "./pydemia-ui/checkbox";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { ErrorNotice, Field, Loading, Modal } from "./ui";
import {
    accessApi, editablePermissions, invitationUrl, ownershipUrl, permissionGroups, permissionLabels,
    type AccessMutation, type InvitationPreview, type ProjectAccess, type ProjectInvitation, type ProjectMember, type ProjectRole,
} from "./project-access";
import "./project-access.css";

const draftSchema = z.object({
    revision: z.number().int().positive().nullable(), roleId: z.string().nullable(), roleOpen: z.boolean(),
    roleName: z.string(), permissions: z.array(z.string()), copyId: z.string(),
    inviteAccount: z.string(), inviteRole: z.string(), inviteHours: z.string(), ownershipAccount: z.string(),
}).strict();
type Draft = z.infer<typeof draftSchema>;
const emptyDraft: Draft = {revision: null, roleId: null, roleOpen: false, roleName: "", permissions: [], copyId: "",
    inviteAccount: "", inviteRole: "", inviteHours: "72", ownershipAccount: ""};
type SettingsData = {access: ProjectAccess; roles: ProjectRole[]; members: ProjectMember[]; invitations: ProjectInvitation[]};
type Confirmation = {title: string; description: string; action: () => Promise<void>};
const ownerPermissions: Readonly<Record<string, string>> = {"member.manage": "멤버 관리", "role.manage": "역할 관리", "ownership.transfer": "소유권 이전", "project.archive": "프로젝트 보관·복원 (오너 전용)"};
const labelPermission = (code: string) => permissionLabels[code] ?? ownerPermissions[code] ?? code;

export function ProjectAccessSettings({project, onChanged, userId}: {project: Project; onChanged: () => void; userId?: string}) {
    return <ProjectAccessEditor key={project.id} project={project} onChanged={onChanged} userId={userId} />;
}

function ProjectAccessEditor({project, onChanged, userId}: {project: Project; onChanged: () => void; userId?: string}) {
    const recovery: AuthenticationDraft<Draft> = useAuthenticationDraft(`project:${project.id}:access-settings`, draftSchema,
        () => draft.revision === null ? null : draft);
    const [draft, setDraft] = useState<Draft>(() => recovery.restored ?? {...emptyDraft});
    const [data, setData] = useState<SettingsData | null>(null);
    const [tab, setTab] = useState<"members" | "roles">(recovery.restored?.roleOpen ? "roles" : "members");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const [notice, setNotice] = useState("");
    const [createdLink, setCreatedLink] = useState<{label: string; url: string} | null>(null);
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const requestNumber = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const operation = useRef<{key: string; id: string} | null>(null);

    async function load() {
        controller.current?.abort();
        const requestController = new AbortController();
        controller.current = requestController;
        const requestId = ++requestNumber.current;
        setLoading(true);
        try {
            const access = await accessApi.access(project.id, requestController.signal);
            const admin = access.role.preset === "owner" && access.capabilities.includes("member.manage");
            const [roles, members, invitations] = await Promise.all([
                accessApi.roles(project.id, requestController.signal),
                admin ? accessApi.members(project.id, requestController.signal) : Promise.resolve([]),
                admin ? accessApi.invitations(project.id, requestController.signal) : Promise.resolve([]),
            ]);
            if (requestNumber.current === requestId) setData({access, roles, members, invitations});
        } catch (cause) {
            if (!requestController.signal.aborted && requestNumber.current === requestId) {setData(null); setError(errorMessage(cause));}
        } finally {if (requestNumber.current === requestId) setLoading(false);}
    }
    useEffect(() => {
        void load();
        return () => {requestNumber.current++; controller.current?.abort();};
    }, [project.id, project.access?.access_revision]);

    function edit(patch: Partial<Draft>) {
        setDraft(current => ({...current, revision: current.revision ?? data?.access.access_revision ?? null, ...patch}));
    }
    function stamp(action: string, body: unknown, revision = data?.access.access_revision): AccessMutation {
        if (!revision) throw new Error("현재 접근 권한을 먼저 불러와 주세요.");
        const key = JSON.stringify([action, body, revision]);
        if (operation.current?.key !== key) operation.current = {key, id: crypto.randomUUID()};
        return {expected_revision: revision, operation_id: operation.current.id};
    }
    async function mutate(action: () => Promise<unknown>, success: string, after?: () => void) {
        if (busy) return;
        setBusy(true); setError(""); setNotice(""); setConflict(false);
        try {
            await action();
            operation.current = null;
            after?.();
            setConfirmation(null); setNotice(success);
            await load(); onChanged();
        } catch (cause) {
            setError(errorMessage(cause));
            setConflict(cause instanceof ApiError && cause.status === 409);
        } finally {setBusy(false);}
    }
    function resetDraft() {setDraft({...emptyDraft}); recovery.clear();}
    function clearForm(form: "role" | "invitation" | "ownership") {
        const next = {...draft, ...(form === "role" ? {roleId: null, roleOpen: false, roleName: "", permissions: [], copyId: ""}
            : form === "invitation" ? {inviteAccount: "", inviteRole: "", inviteHours: "72"} : {ownershipAccount: ""})};
        if (next.roleOpen || next.inviteAccount || next.inviteRole || next.inviteHours !== "72" || next.ownershipAccount) setDraft(next);
        else resetDraft();
    }
    function editRole(role?: ProjectRole) {
        const source = role ?? data?.roles.find(item => item.preset === "editor");
        if (!source || !data) return;
        edit({revision: data.access.access_revision, roleOpen: true, roleId: role?.id ?? null,
            copyId: source.id, roleName: role?.name ?? `${source.name} 복사`, permissions: editablePermissions(source.permissions)});
        setTab("roles"); setError(""); setNotice("");
    }
    function saveRole() {
        if (!data || !draft.roleName.trim()) return;
        const body = {name: draft.roleName.trim(), permissions: draft.permissions};
        const role = data.roles.find(item => item.id === draft.roleId);
        const changed = role ? [...new Set([...role.permissions, ...body.permissions])].filter(code => role.permissions.includes(code) !== body.permissions.includes(code)) : [];
        const action = () => mutate(() => role
            ? accessApi.updateRole(project.id, role.id, {...body, ...stamp(`role:${role.id}`, body, draft.revision ?? undefined)})
            : accessApi.createRole(project.id, {...body, ...stamp("role:create", body, draft.revision ?? undefined)}),
                        role ? "역할을 수정했습니다." : "사용자 지정 역할을 만들었습니다.", () => clearForm("role"));
        if (role) setConfirmation({title: "역할 변경 적용", description: `${role.name} 역할을 사용하는 멤버 ${role.member_count}명에게 적용됩니다. 변경 동작: ${changed.map(labelPermission).join(", ") || "권한 변경 없음 (이름만 수정)"}`, action});
        else void action();
    }

    const access = project.access && (!data || project.access.access_revision >= data.access.access_revision) ? project.access : data?.access;
    const isOwner = access?.role.preset === "owner";
    const canMembers = !!isOwner && !!access?.capabilities.includes("member.manage");
    const canRoles = !!isOwner && !!access?.capabilities.includes("role.manage");
    const assignable = data?.roles.filter(role => role.preset !== "owner") ?? [];
    const ownerCount = data?.members.filter(member => member.role.preset === "owner").length ?? 0;
    const visibleRoles = isOwner ? data?.roles ?? [] : (data?.roles ?? []).filter(role => role.id === access?.role.id).map(role => ({...role, member_count: undefined}));
    const staleDraft = !!data && draft.revision !== null && draft.revision !== data.access.access_revision;

    return <div className="project-access-settings" aria-busy={busy || loading}>
        <header><h1>멤버·권한</h1><p className="muted">{project.name} 프로젝트의 역할과 접근 권한을 확인합니다.</p></header>
        {error && <ErrorNotice error={error} />}
        {conflict && <p role="status">다른 변경과 충돌했습니다. 최신 권한을 불러온 뒤 내용을 검토해 주세요.</p>}
        {(conflict || (!loading && !data)) && <Button variant="outline" disabled={busy || loading} onClick={() => {setError(""); void load();}}>최신 권한 불러오기</Button>}
        {notice && <p role="status" className="project-access-notice">{notice}</p>}
        {loading && !data && <Loading label="프로젝트 권한 불러오는 중…" />}
        {data && <>
            <div className="project-access-summary"><strong>내 역할: {access?.role.name ?? data.access.role.name}</strong>
                {data.access.archived && <span>보관된 프로젝트 · 업무 자료 읽기 전용</span>}
                {!isOwner && <span>멤버·역할 관리는 프로젝트 오너에게 요청해 주세요.</span>}
                <Button variant="ghost" disabled={busy || loading} onClick={() => {setError(""); void load();}}>새로고침</Button>
            </div>
            {recovery.restored && draft.revision !== null && <p role="status">로그인 전에 입력한 내용을 복원했습니다. 저장하려면 내용을 확인하고 직접 적용해 주세요.</p>}
            {staleDraft && <div className="project-access-draft-warning" role="status">입력 초안보다 현재 권한이 변경되었습니다. 초안을 확인하고 최신 상태를 기준으로 다시 적용할 수 있습니다.
                <Button variant="outline" disabled={busy} onClick={() => edit({revision: data.access.access_revision})}>최신 권한 기준으로 검토 완료</Button>
            </div>}
            <div className="project-access-tabs" role="group" aria-label="프로젝트 설정 항목">
                <Button variant={tab === "members" ? "primary" : "ghost"} aria-pressed={tab === "members"} onClick={() => setTab("members")}>멤버</Button>
                <Button variant={tab === "roles" ? "primary" : "ghost"} aria-pressed={tab === "roles"} onClick={() => setTab("roles")}>역할</Button>
            </div>
            {tab === "members" && <>
                <section aria-label="프로젝트 멤버"><h2>{canMembers ? `멤버 ${data.members.length}명` : "내 프로젝트 접근 권한"}</h2>
                    {!canMembers && <><p>{access?.role.name ?? data.access.role.name}</p><PermissionList permissions={access?.capabilities ?? data.access.capabilities} /></>}
                    {canMembers && <ul className="project-access-list">{data.members.map(member => {
                        const lastOwner = member.role.preset === "owner" && ownerCount === 1;
                        const own = member.account_id === userId;
                        return <li key={member.membership_id}>
                            <div className="project-access-person"><strong>{member.username}{own ? " (나)" : ""}</strong><small>{member.account_id}</small></div>
                            <span>{member.role.name}{lastOwner ? " · 마지막 오너" : ""}</span>
                            <div className="project-access-row-actions">
                                {member.role.preset !== "owner" && <NativeSelect aria-label={`${member.username} 역할`} value={member.role.id} disabled={busy}
                                    onChange={event => {
                                        const role = data.roles.find(item => item.id === event.target.value);
                                        if (role) setConfirmation({title: "멤버 역할 변경", description: `${member.username}님의 역할을 ${member.role.name}에서 ${role.name}(으)로 변경합니다.`,
                                            action: () => mutate(() => accessApi.updateMember(project.id, member.account_id, {role_id: role.id, ...stamp(`member:${member.account_id}`, role.id)}), "멤버 역할을 변경했습니다.")});
                                    }}>{assignable.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</NativeSelect>}
                                <Button variant="ghost" disabled={busy || lastOwner} onClick={() => setConfirmation({title: "프로젝트 멤버 제거", description: `${member.username}님은 이 프로젝트의 자료에 더 이상 접근할 수 없습니다.`,
                                    action: () => mutate(() => accessApi.removeMember(project.id, member.account_id, stamp(`remove:${member.account_id}`, null)), "멤버를 제거했습니다.")})}>제거</Button>
                            </div>
                        </li>;
                    })}</ul>}
                    {canMembers && <p className="muted">마지막 오너는 제거·강등·탈퇴할 수 없습니다. 오너 승격은 소유권 이전과 대상의 수락이 필요합니다.</p>}
                </section>
                {canMembers && <section aria-label="프로젝트 초대"><h2>멤버 초대</h2>
                    <form className="project-access-form" onSubmit={event => {event.preventDefault();
                        const roleId = draft.inviteRole || assignable.find(role => role.preset === "viewer")?.id;
                        if (!roleId) return;
                        const body = {role_id: roleId, expires_in_hours: Number(draft.inviteHours), ...(draft.inviteAccount.trim() ? {account_id: draft.inviteAccount.trim()} : {})};
                        void mutate(async () => {
                            const invitation = await accessApi.createInvitation(project.id, {...body, ...stamp("invite", body, draft.revision ?? undefined)});
                            if (invitation.token) setCreatedLink({label: "초대 수락 링크", url: invitationUrl(invitation.id, invitation.token, invitation.access_revision)});
                            else {await load(); throw new Error("초대는 이미 생성되었지만 링크를 다시 표시할 수 없습니다. 초대 내역에서 철회한 뒤 새 초대를 만들어 주세요.");}
                        }, "초대를 만들었습니다. 링크를 대상에게 직접 전달해 주세요.", () => clearForm("invitation"));
                    }}>
                        <Field label="초대할 계정 ID" hint="이미 로그인한 계정의 ID를 알고 있으면 입력하세요. 비워 두면 먼저 수락한 한 계정에 연결되는 일회성 링크를 만듭니다."><Input value={draft.inviteAccount} onChange={event => edit({inviteAccount: event.target.value})} disabled={busy} /></Field>
                        <Field label="초대 역할"><NativeSelect value={draft.inviteRole || assignable.find(role => role.preset === "viewer")?.id || ""} onChange={event => edit({inviteRole: event.target.value})} disabled={busy} required>{assignable.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</NativeSelect></Field>
                        <Field label="초대 유효 시간"><Input type="number" min={1} max={168} required value={draft.inviteHours} onChange={event => edit({inviteHours: event.target.value})} disabled={busy} /></Field>
                        <Button type="submit" disabled={busy || staleDraft}>초대 링크 만들기</Button>
                    </form>
                    <p className="muted">대상은 로그인 후 프로젝트와 역할을 확인하고 직접 수락합니다. 만료·철회된 초대는 새로 발급해 주세요.</p><h3>초대 내역</h3>
                    {data.invitations.length === 0 ? <p className="muted">등록된 초대가 없습니다.</p> : <ul className="project-access-list">{data.invitations.map(invitation => {
                        const inactive = !!invitation.revoked_at || !!invitation.claimed_by || Date.parse(invitation.expires_at) <= Date.now();
                        return <li key={invitation.id}><div className="project-access-person"><strong>{invitation.target_account_id ?? "일회성 링크 초대"}</strong>
                            <small>{invitation.kind === "ownership" ? "소유권 이전" : data.roles.find(role => role.id === invitation.role_id)?.name ?? "역할"} · {invitation.revoked_at ? "철회됨" : invitation.claimed_by ? "수락됨" : inactive ? "만료됨" : "수락 대기"}</small><small>만료 <DateTimeValue value={invitation.expires_at} /></small></div>
                            {!inactive && <Button variant="ghost" disabled={busy} onClick={() => setConfirmation({title: "초대 철회", description: "이 초대 링크를 더 이상 사용할 수 없게 합니다.",
                                action: () => mutate(() => accessApi.revokeInvitation(project.id, invitation.id, stamp(`revoke:${invitation.id}`, null)), "초대를 철회했습니다.")})}>초대 철회</Button>}</li>;
                    })}</ul>}
                </section>}
            </>}
            {tab === "roles" && <section aria-label="프로젝트 역할"><div className="project-access-section-head"><h2>프로젝트 역할</h2>
                {canRoles && <Button variant="outline" disabled={busy} onClick={() => editRole()}>역할 만들기</Button>}</div>
                <ul className="project-access-roles">{visibleRoles.map(role => <li key={role.id}><div className="project-access-section-head"><h3>{role.name} <small className="muted">{role.preset === "custom" ? "사용자 지정" : "기본 역할"}{role.member_count !== undefined ? ` · ${role.member_count}명` : ""}</small></h3>
                    {canRoles && <div className="actions"><Button variant="ghost" disabled={busy} onClick={() => {
                        editRole(); edit({roleId: null, roleOpen: true, roleName: `${role.name} 복사`, copyId: role.id, permissions: editablePermissions(role.permissions), revision: data.access.access_revision});
                    }}>복사</Button>{role.preset === "custom" && <><Button variant="ghost" disabled={busy} onClick={() => editRole(role)}>수정</Button>
                        <Button variant="ghost" disabled={busy || (role.member_count ?? 0) > 0} onClick={() => setConfirmation({title: "사용자 지정 역할 삭제", description: `${role.name} 역할을 삭제합니다. 사용 중인 역할은 먼저 멤버의 역할을 변경해야 합니다.`,
                            action: () => mutate(() => accessApi.deleteRole(project.id, role.id, stamp(`role:delete:${role.id}`, null)), "역할을 삭제했습니다.")})}>삭제</Button></>}</div>}</div>
                    <PermissionList permissions={role.permissions} /></li>)}</ul>
                {canRoles && draft.roleOpen && <form className="project-access-role-form" onSubmit={event => {event.preventDefault(); saveRole();}}>
                    <h3>{draft.roleId ? "사용자 지정 역할 수정" : "사용자 지정 역할 만들기"}</h3>
                    <Field label="역할 이름"><Input required maxLength={100} value={draft.roleName} onChange={event => edit({roleName: event.target.value})} disabled={busy} /></Field>
                    {!draft.roleId && <Field label="복사할 역할"><NativeSelect value={draft.copyId} onChange={event => {
                        const source = data.roles.find(role => role.id === event.target.value);
                        if (source) edit({copyId: source.id, permissions: editablePermissions(source.permissions)});
                    }} disabled={busy}>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</NativeSelect></Field>}
                    <p className="muted">멤버·역할 관리, 소유권 이전과 보관·복원은 오너 전용입니다. 사용자 지정 역할에 부여할 수 없습니다.</p>
                    <div className="project-access-permissions">{permissionGroups.map(group => <fieldset key={group.name} disabled={busy}><legend>{group.name}</legend>{group.permissions.map(([code, label]) => <label key={code} className="project-access-checkbox">
                        <Checkbox checked={draft.permissions.includes(code)} aria-label={label} onCheckedChange={checked => {
                            edit({permissions: checked === true ? [...new Set([...draft.permissions, code, "project.read"])] : draft.permissions.filter(value => value !== code)});
                        }} /><span>{label}</span></label>)}</fieldset>)}</div>
                    <p className="muted">쓰기·스킬·전송에는 보기가 필요합니다. 스킬 결과 적용에는 결과가 수정하는 업무 자료의 쓰기 권한도 필요합니다.</p>
                    <div className="actions"><Button type="submit" disabled={busy || staleDraft || !draft.permissions.includes("project.read")}>역할 저장</Button><Button variant="ghost" disabled={busy} onClick={() => clearForm("role")}>입력 취소</Button></div>
                </form>}
            </section>}
            {createdLink && <section aria-label="발급한 수락 링크"><h2>{createdLink.label}</h2><p className="muted">이 링크는 지금만 표시됩니다. 수락하거나 만료되면 다시 사용할 수 없습니다.</p>
                <Input aria-label={createdLink.label} readOnly value={createdLink.url} onFocus={event => event.currentTarget.select()} />
                <Button variant="outline" onClick={() => {
                    void navigator.clipboard.writeText(createdLink.url).then(() => setNotice("수락 링크를 복사했습니다.")).catch(() => setError("링크를 선택해 직접 복사해 주세요."));
                }}>링크 복사</Button><Button variant="ghost" onClick={() => setCreatedLink(null)}>링크 숨기기</Button></section>}
            {isOwner && access?.capabilities.includes("ownership.transfer") && <section aria-label="소유권 이전"><h2>소유권 이전</h2>
                <p className="muted">현재 멤버에게 이전을 요청합니다. 대상이 로그인 후 명시적으로 수락해야 소유권이 변경됩니다.</p>
                <form className="project-access-form" onSubmit={event => {event.preventDefault();
                    const target = data.members.find(member => member.account_id === draft.ownershipAccount);
                    if (!target) return;
                    setConfirmation({title: "소유권 이전 요청", description: `${target.username}님이 수락하면 오너가 되고, 요청한 현재 오너는 에디터로 변경됩니다. 수락 전에는 권한이 바뀌지 않습니다.`,
                        action: () => mutate(async () => {
                            const result = await accessApi.transferOwnership(project.id, {account_id: target.account_id, ...stamp("ownership", target.account_id, draft.revision ?? undefined)});
                            if (result.token) setCreatedLink({label: "소유권 이전 수락 링크", url: ownershipUrl(project.id, result.id, result.token, result.access_revision)});
                            else {await load(); throw new Error("이전 요청은 이미 생성되었지만 링크를 다시 표시할 수 없습니다. 초대 내역에서 철회한 뒤 새 요청을 만들어 주세요.");}
                        }, "소유권 이전을 요청했습니다. 수락 링크를 대상에게 전달해 주세요.", () => clearForm("ownership"))});
                }}><Field label="새 오너가 될 멤버"><NativeSelect required value={draft.ownershipAccount} onChange={event => edit({ownershipAccount: event.target.value})} disabled={busy}><option value="">멤버 선택</option>{data.members.filter(member => member.account_id !== userId && member.role.preset !== "owner").map(member => <option key={member.account_id} value={member.account_id}>{member.username}</option>)}</NativeSelect></Field>
                    <Button type="submit" variant="outline" disabled={busy || staleDraft || !draft.ownershipAccount}>이전 요청</Button></form>
            </section>}
            <section aria-label="프로젝트 참여 관리"><h2>프로젝트 참여</h2><div className="actions">
                {access?.capabilities.includes("project.archive") && <Button variant="outline" disabled={busy} onClick={() => setConfirmation({title: data.access.archived ? "프로젝트 복원" : "프로젝트 보관",
                    description: data.access.archived ? "역할에 따라 업무 자료를 다시 편집할 수 있습니다." : "모든 멤버가 업무 자료를 읽기 전용으로 보게 됩니다. 오너는 권한을 관리하거나 복원할 수 있습니다.",
                    action: () => mutate(() => accessApi.archive(project.id, {archived: !data.access.archived, ...stamp("archive", !data.access.archived)}), data.access.archived ? "프로젝트를 복원했습니다." : "프로젝트를 보관했습니다.")})}>{data.access.archived ? "프로젝트 복원" : "프로젝트 보관"}</Button>}
                <Button variant="outline" disabled={busy || (!!isOwner && ownerCount <= 1) || (data.access.archived && !isOwner)} onClick={() => setConfirmation({title: "프로젝트 탈퇴", description: "이 프로젝트의 자료에 접근할 수 없게 됩니다. 다시 참여하려면 새 초대가 필요합니다.",
                    action: () => mutate(() => accessApi.leave(project.id, stamp("leave", null)), "프로젝트에서 탈퇴했습니다.")})}>프로젝트 탈퇴</Button>
            </div>{isOwner && ownerCount <= 1 && <p className="muted">마지막 오너는 소유권 이전이 수락된 후 탈퇴할 수 있습니다.</p>}{data.access.archived && !isOwner && <p className="muted">보관된 프로젝트의 참여 변경은 오너에게 요청해 주세요.</p>}</section>
        </>}
        {confirmation && <Modal title={confirmation.title} onClose={() => {if (!busy) setConfirmation(null);}}><div className="project-access-confirm"><p>{confirmation.description}</p>{error && <ErrorNotice error={error} />}<div className="actions">
            <Button disabled={busy} onClick={() => void confirmation.action()}>{busy ? "적용 중…" : "변경 확인"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmation(null)}>취소</Button></div></div></Modal>}
    </div>;
}

function PermissionList({permissions}: {permissions: readonly string[]}) {
    return <ul className="project-access-permission-list">{permissions.map(code => <li key={code}>{labelPermission(code)}</li>)}</ul>;
}

type AcceptProps = {token: string; expectedRevision?: number; onAccepted: (projectId: string) => void};
export function ProjectInvitationAccept({invitationId, ...props}: AcceptProps & {invitationId: string}) {
    return <ProjectAccessAccept key={`${invitationId}:${props.token}`} {...props} invitationId={invitationId} kind="membership" title="프로젝트 초대 수락" description="현재 로그인한 계정으로 프로젝트에 참여합니다. 초대는 한 계정만 수락할 수 있습니다."
        accept={body => accessApi.acceptInvitation(invitationId, body)} />;
}
export function ProjectOwnershipAccept({projectId, transferId, ...props}: AcceptProps & {projectId: string; transferId: string}) {
    return <ProjectAccessAccept key={`${projectId}:${transferId}:${props.token}`} {...props} invitationId={transferId} kind="ownership" title="소유권 이전 수락" description="현재 로그인한 계정이 이 프로젝트의 오너가 되고 이전을 요청한 오너는 에디터로 변경됩니다. 멤버·역할과 프로젝트 관리를 맡는 데 동의하면 수락해 주세요."
        accept={body => accessApi.acceptOwnership(projectId, transferId, body)} />;
}
function ProjectAccessAccept({token, onAccepted, title, description, accept, invitationId, kind}: AcceptProps & {
    invitationId: string; kind: "membership" | "ownership";
    title: string; description: string; accept: (body: AccessMutation & {token: string}) => Promise<{project_id: string}>;
}) {
    const operation = useRef({revision: 0, id: crypto.randomUUID()});
    const [preview, setPreview] = useState<InvitationPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [accepted, setAccepted] = useState(false);
    const [conflict, setConflict] = useState(false);
    async function loadPreview(signal?: AbortSignal) {
        setLoading(true); setPreview(null); setError(""); setConflict(false);
        try {
            const result = await accessApi.previewInvitation(invitationId, token, signal);
            if (signal?.aborted) return;
            if (result.kind !== kind) throw new Error("수락 링크의 종류가 올바르지 않습니다.");
            setPreview(result);
            if (operation.current.revision !== result.access_revision) operation.current = {revision: result.access_revision, id: crypto.randomUUID()};
        } catch (cause) {if (!signal?.aborted) setError(errorMessage(cause));}
        finally {if (!signal?.aborted) setLoading(false);}
    }
    useEffect(() => {
        const controller = new AbortController();
        if (token && invitationId) void loadPreview(controller.signal);
        else setLoading(false);
        return () => controller.abort();
    }, [token, invitationId, kind]);
    const valid = !!token && !!invitationId;
    return <section className="project-access-settings"><h1>{title}</h1><p>{description}</p>
        {!valid && <ErrorNotice error="수락 링크가 올바르지 않습니다. 프로젝트 오너에게 새 링크를 요청해 주세요." />}
        {loading && <Loading label="초대 정보를 확인하는 중…" />}
        {preview && <div className="project-access-summary"><strong>{preview.project_name}</strong><span>수락할 역할: {preview.role.name}</span><span>유효 기간 <DateTimeValue value={preview.expires_at} /></span></div>}
        {error && <><ErrorNotice error={error} /><p className="muted">{conflict ? "권한이 변경되었습니다. 초대 정보를 다시 확인한 뒤 직접 수락해 주세요." : "만료·철회·이미 수락한 링크는 사용할 수 없습니다. 프로젝트 오너에게 새 수락 링크를 요청해 주세요."}</p></>}
        {!loading && valid && (error || !preview) && <Button variant="outline" disabled={busy} onClick={() => void loadPreview()}>초대 정보 다시 확인</Button>}
        {accepted ? <p role="status">수락했습니다. 프로젝트로 이동합니다.</p> : <Button disabled={busy || loading || !valid || !preview || conflict} onClick={() => {
            if (busy || !preview || conflict) return;
            setBusy(true); setError("");
            void accept({token, expected_revision: preview.access_revision, operation_id: operation.current.id}).then(result => {
                setAccepted(true); window.history.replaceState(null, "", `${window.location.pathname}?project=${encodeURIComponent(result.project_id)}&view=overview`);
                onAccepted(result.project_id);
            }).catch(cause => {setError(errorMessage(cause)); setConflict(cause instanceof ApiError && cause.status === 409);}).finally(() => setBusy(false));
        }}>{busy ? "수락 중…" : "현재 계정으로 수락"}</Button>}
    </section>;
}
