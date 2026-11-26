import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError, errorMessage } from "./api";
import { useAuthenticationDraft } from "./auth-drafts";
import { useResource } from "./hooks";
import type { Item, Project } from "./models";
import { statusLabels } from "./models";
import { useProjectPermissions } from "./ProjectPermissions";
import type { ProjectPermission } from "./ProjectPermissions";
import { planningApi } from "./planning-api";
import type { PlanningApply } from "./planning-api";
import { emptyPlanningAuthor, planningRecoverySchema, planningSelectionErrors, proposalPermissions, selectedByDefault } from "./planning-models";
import type { PlanningAuthor, PlanningDraft, PlanningInput, PlanningPreview, PlanningProposal, PlanningReceipt } from "./planning-models";
import { Checkbox } from "./pydemia-ui/checkbox";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Textarea } from "./pydemia-ui/textarea";
import { ActionButton, ErrorNotice, Field, Loading, Modal } from "./ui";
import "./planning.css";

const proposalLabels = {create_story: "새 Story", create_task: "새 Task", link: "기존 항목 연결", update_item: "기존 항목 수정", record_decision: "근거·결정 기록"};
const relationLabels = {implements: "Task → Story · 기여", depends_on: "후행 Task → 선행 Task", relates_to: "관련 작업 · 대칭", subtask_of: "하위 작업 → 부모 작업", source: "원문 참조", verifies: "검증"};
const planningWritePermissions: ProjectPermission[] = ["item.write", "task.create", "task.update", "relation.write", "test.write"];
type Attempt = PlanningApply & {draft_id: string};
type PlanningDialogProps = {
    project: Project; contextItem?: Item; mode?: "initial" | "incremental"; draftId?: string;
    onClose: () => void; onApplied: (receipt: PlanningReceipt) => void;
};

export function PlanningDialog({project, contextItem, mode = "incremental", draftId, onClose, onApplied}: PlanningDialogProps) {
    const snapshot = useRef<z.infer<typeof planningRecoverySchema> | null>(null);
    const recovery = useAuthenticationDraft(`planning:${project.id}:${draftId ?? "new"}`, planningRecoverySchema, () => snapshot.current);
    const [draft, setDraft] = useState<PlanningDraft | null>(recovery.restored?.draft ?? null);
    const [input, setInput] = useState<PlanningInput>(recovery.restored?.input ?? {
        mode, intent: "", reference_ids: contextItem ? [contextItem.id] : [], proposals: [],
    });
    const [selected, setSelected] = useState<string[]>(recovery.restored?.selected ?? []);
    const [author, setAuthor] = useState<PlanningAuthor>(recovery.restored?.author ?? emptyPlanningAuthor);
    const [operation, setOperation] = useState(recovery.restored?.operation ?? crypto.randomUUID());
    const [attempt, setAttempt] = useState<Attempt | null>(recovery.restored?.attempt ?? null);
    const [preview, setPreview] = useState<PlanningPreview | null>(null);
    const [receipt, setReceipt] = useState<PlanningReceipt | null>(null);
    const [loading, setLoading] = useState(!!draftId && !recovery.restored);
    const [busy, setBusy] = useState(false);
    const pending = useRef(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState(recovery.restored ? "로그인 전 초안을 복구했습니다. 현재 자료를 확인한 뒤 직접 미리보기 또는 결과 확인을 선택해 주세요." : "");
    const can = useProjectPermissions();
    const accessRevision = project.access?.access_revision ?? 0;
    const items = useResource(`planning-items:${project.id}:${accessRevision}`, signal => api.items(project.id, signal));
    const runs = useResource(`planning-runs:${project.id}:${accessRevision}`, signal => api.runs(project.id, signal));
    const available = items.status === "ready" ? items.data : [];
    const readAllowed = can(project.id, "project.read");
    const writable = readAllowed && planningWritePermissions.some(permission => can(project.id, permission));
    const missingPermissions = input.proposals.filter(proposal => selected.includes(proposal.id))
        .some(proposal => proposalPermissions(proposal, available).some(permission => !can(project.id, permission)));
    const selectionErrors = planningSelectionErrors(input.proposals, selected);
    const sourceForbidden = !!input.intent.trim() && !can(project.id, "item.write")
        || !!input.source_run_id && (!can(project.id, "item.write") || !can(project.id, "run.apply"));
    const locked = busy || loading || !!draftId && !draft || !!attempt || !!receipt || !writable;
    const authorDirty = !!(author.title.trim() || author.body.trim() || author.criteria.trim() || author.source || author.target || author.itemId);
    snapshot.current = receipt ? null : {draft, input, selected, operation, attempt, author};

    useEffect(() => {
        if (!draftId || recovery.restored) return;
        const controller = new AbortController();
        planningApi.get(draftId, controller.signal).then(value => {
            if (controller.signal.aborted) return;
            setDraft(value);
            setInput({mode: value.mode, intent: value.intent, reference_ids: value.references.map(reference => reference.id), proposals: value.proposals, ...(value.source_run_id ? {source_run_id: value.source_run_id} : {})});
            setSelected(value.proposals.filter(selectedByDefault).map(proposal => proposal.id));
            if (value.receipt) setReceipt(value.receipt);
        }).catch(cause => {if (!controller.signal.aborted) setError(errorMessage(cause));})
            .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [draftId]);
    useEffect(() => {setPreview(null);}, [accessRevision]);

    function changed(next: PlanningInput) {
        setInput(next); setPreview(null); setError(""); setNotice(""); setOperation(crypto.randomUUID());
    }
    function choose(id: string, checked: boolean) {
        setSelected(values => checked ? [...values, id] : values.filter(value => value !== id));
        setPreview(null); setOperation(crypto.randomUUID()); setError("");
    }
    async function run(work: () => Promise<void>) {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError("");
        try {await work();} catch (cause) {setError(errorMessage(cause));}
        finally {pending.current = false; setBusy(false);}
    }
    async function persist(status: "draft" | "cancelled" = "draft") {
        if (authorDirty) {
            throw new Error("작성 중인 입력을 ‘후보 추가’하거나 ‘작성 중 입력 지우기’한 뒤 저장해 주세요.");
        }
        // Response-only defaults are not part of the authoring request.
        const proposals = input.proposals.map(({default_selected: _default, ...proposal}) => proposal);
        const value = draft ? await planningApi.save(draft.id, {
            expected_version: draft.version, intent: input.intent, reference_ids: input.reference_ids, proposals, status,
        }) : await planningApi.create(project.id, {...input, proposals});
        setDraft(value);
        if (!draft && !input.proposals.length && value.proposals.length) {
            setInput({...input, proposals: value.proposals});
            setSelected(value.proposals.filter(selectedByDefault).map(proposal => proposal.id));
        }
        if (!draft && status === "cancelled") {
            const cancelled = await planningApi.save(value.id, {expected_version: value.version, intent: input.intent,
                reference_ids: input.reference_ids, proposals: value.proposals.map(({default_selected: _default, ...proposal}) => proposal), status});
            setDraft(cancelled); return cancelled;
        }
        return value;
    }
    function close() {
        if (busy || attempt) return;
        if (authorDirty) {setError("작성 중인 입력을 ‘후보 추가’하거나 ‘작성 중 입력 지우기’한 뒤 닫아 주세요."); return;}
        if (receipt || !writable || !input.intent && !input.proposals.length && !input.reference_ids.length && !draft) {
            recovery.clear(); onClose(); return;
        }
        void run(async () => {await persist("cancelled"); recovery.clear(); onClose();});
    }
    function inspect() {
        if (locked || !selected.length || selectionErrors.length || missingPermissions || sourceForbidden || items.status !== "ready") return;
        void run(async () => {
            const saved = await persist();
            const result = await planningApi.preview(saved.id, {expected_version: saved.version, selected_proposal_ids: selected});
            setPreview(result); setNotice("현재 revision과 권한으로 미리보기했습니다. 선택한 변경만 적용됩니다.");
        });
    }
    async function applyExact(value: Attempt) {
        try {
            const result = await planningApi.apply(value.draft_id, {expected_version: value.expected_version,
                selected_proposal_ids: value.selected_proposal_ids, operation_id: value.operation_id});
            setReceipt(result); setAttempt(null); recovery.clear(); onApplied(result);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
                setAttempt(null); setPreview(null);
                setNotice("적용하지 못했습니다. 초안을 보존했습니다. 현재 자료를 확인하고 다시 미리보기해 주세요.");
            }
            throw cause;
        }
    }
    function apply() {
        if (!preview || locked || !readAllowed || selectionErrors.length || missingPermissions || sourceForbidden || items.status !== "ready") return;
        const value = {draft_id: preview.draft_id, expected_version: preview.version, selected_proposal_ids: preview.selected_proposal_ids, operation_id: operation};
        setAttempt(value);
        void run(() => applyExact(value));
    }
    function checkResult() {
        if (!attempt || busy) return;
        void run(async () => {
            const current = await planningApi.get(attempt.draft_id);
            if (current.receipt) {setReceipt(current.receipt); setAttempt(null); recovery.clear(); onApplied(current.receipt);}
            else {setNotice("아직 적용 기록이 없습니다. 같은 요청 재시도를 직접 선택할 수 있습니다.");}
        });
    }
    const name = (id?: string | null) => input.proposals.find(proposal => proposal.id === id)?.title ?? available.find(item => item.id === id)?.title ?? "참조 항목";
    const previewNames = new Map(available.map(item => [item.id, item.title]));
    for (const change of preview?.changes ?? []) {
        if (typeof change.after.id === "string" && typeof change.after.title === "string") previewNames.set(change.after.id, change.after.title);
    }
    const previewName = (id: string) => previewNames.get(id) ?? name(id);
    return <Modal title={input.mode === "initial" ? "최초 기획" : "기획 추가"} wide className="planning-dialog" onClose={close}>
        <div className="planning-workspace">
            <p className="muted">{project.name} · {input.mode === "initial" ? "프로젝트는 생성되었습니다. 기획을 취소해도 프로젝트는 남습니다." : "기존 업무에 변경분을 추가합니다."} 후보는 적용 전까지 backlog에 반영되지 않습니다.</p>
            {notice && <p role="status" className="notice">{notice}</p>}
            {loading && <Loading />}
            {!readAllowed && <p role="alert">현재 프로젝트를 읽을 권한이 없습니다.</p>}
            {!writable && readAllowed && <p role="status">읽기 전용입니다. 기획 변경을 저장하거나 적용할 수 없습니다.</p>}
            {!loading && !receipt && readAllowed && <>
                <Field label="변경 의도 · 문제, 기대 결과, 범위와 제외" hint={can(project.id, "item.write") ? "적용 시 원문 Idea로 보존합니다. 프로젝트 목표는 변경하지 않습니다." : "원문 Idea 저장 권한이 없습니다. 의도 없이 Task 후보만 작성할 수 있습니다."}>
                    <Textarea value={input.intent} rows={3} disabled={locked || !can(project.id, "item.write")} onChange={event => changed({...input, intent: event.target.value})} />
                </Field>
                <details className="planning-references" open={!!contextItem}>
                    <summary>참고 범위 · {input.reference_ids.length}개 선택</summary>
                    <p className="muted small">현재 접근 가능한 항목을 직접 선택합니다. 원문과 revision을 초안에 기록합니다.</p>
                    {items.status === "loading" && <Loading />}
                    {items.status === "error" && <ErrorNotice error={items.error} retry={items.reload} />}
                    <div className="planning-reference-list">{available.map(item => <label key={item.id} className="planning-check">
                        <Checkbox checked={input.reference_ids.includes(item.id)} disabled={locked} onCheckedChange={checked => changed({...input, reference_ids: checked === true ? [...input.reference_ids, item.id] : input.reference_ids.filter(id => id !== item.id)})} />
                        <span>{item.title} <small className="muted">{item.kind === "requirement" ? "Story" : item.kind === "task" ? "Task" : item.kind} · r{item.revision}{item.kind === "task" ? ` · ${statusLabels[item.data.state] ?? item.data.state}` : ""}</small></span>
                    </label>)}</div>
                    {draft && <p className="muted small">저장된 참고 revision: {draft.references.map(reference => `${name(reference.id)} r${reference.revision}`).join(" · ") || "없음"}</p>}
                </details>
                {!draft && !input.proposals.length && <details><summary>기존 SkillRun 결과에서 후보 준비</summary>
                    <p className="muted small">이미 실행한 결과의 원문·revision·hash를 유지합니다. 새 AI 실행은 스킬 작업에서 진행해 주세요.</p>
                    {runs.status === "error" && <ErrorNotice error={runs.error} retry={runs.reload} />}
                    <Field label="검토할 SkillRun"><NativeSelect value={input.source_run_id ?? ""} disabled={locked || !can(project.id, "run.apply") || !can(project.id, "item.write")} onChange={event => changed({...input, source_run_id: event.target.value || undefined})}>
                        <option value="">스킬 작업 선택</option>{runs.status === "ready" && runs.data.filter(run => run.status === "review_ready" || run.status === "applied").map(run => <option key={run.id} value={run.id}>{run.operation} · {run.status} · {run.created_at}</option>)}
                    </NativeSelect></Field>
                    <ActionButton type="button" disabled={locked || !input.source_run_id || sourceForbidden} onClick={() => void run(async () => {const value = await persist(); setInput({mode: value.mode, intent: value.intent, reference_ids: value.references.map(reference => reference.id), proposals: value.proposals, ...(value.source_run_id ? {source_run_id: value.source_run_id} : {})}); setSelected(value.proposals.filter(selectedByDefault).map(proposal => proposal.id)); setNotice("기존 SkillRun 후보와 출처를 불러왔습니다. 변경별로 검토해 주세요.");})}>SkillRun 후보 가져오기</ActionButton>
                </details>}
                {input.source_run_id && <details><summary>연결된 SkillRun 출처</summary><p className="muted small">원문·revision·hash와 실행 결과를 서버 초안에 보존합니다. 적용에는 스킬 결과 적용과 항목 작성 권한이 필요합니다.</p><p className="muted small">SkillRun ID: {input.source_run_id}</p></details>}
                <ProposalAuthor value={author} onChange={setAuthor} items={available} proposals={input.proposals} disabled={locked || items.status !== "ready"} canCreate={kind => kind === "create_story" || kind === "record_decision" ? can(project.id, "item.write") : kind === "create_task" ? can(project.id, "task.create") : kind === "link" ? can(project.id, "relation.write") : available.some(item => can(project.id, item.kind === "task" ? "task.update" : item.kind === "test_case" ? "test.write" : "item.write"))}
                    onAdd={proposal => {changed({...input, proposals: [...input.proposals, proposal]}); if (selectedByDefault(proposal)) setSelected(values => [...values, proposal.id]);}} />
                <section aria-labelledby="planning-proposals-title">
                    <h3 id="planning-proposals-title">변경 후보 · {selected.length}/{input.proposals.length} 선택</h3>
                    {!input.proposals.length && <p className="muted">Story 또는 Task를 제목으로 추가하거나 기존 항목을 연결해 주세요.</p>}
                    <div className="planning-proposals">{input.proposals.map(proposal => {
                        const existing = available.find(item => item.id === proposal.item_id);
                        const change = preview?.changes.find(change => change.proposal_id === proposal.id);
                        return <article key={proposal.id} className="planning-proposal">
                            <div className="planning-proposal-head"><label className="planning-check">
                                <Checkbox checked={selected.includes(proposal.id)} disabled={locked} onCheckedChange={checked => choose(proposal.id, checked === true)} aria-label={`${proposalLabels[proposal.kind]} ${proposal.title ?? (proposal.kind === "link" ? `${name(proposal.source)} → ${name(proposal.target)}` : name(proposal.item_id))} 선택`} />
                                <span><small>{proposalLabels[proposal.kind]}</small><strong>{proposal.kind === "link" ? `${name(proposal.source)} → ${name(proposal.target)}` : proposal.title ?? name(proposal.item_id)}</strong></span>
                            </label><ActionButton type="button" disabled={locked} aria-label={`${proposal.title ?? proposalLabels[proposal.kind]} 후보 제거`} onClick={() => {changed({...input, proposals: input.proposals.filter(value => value.id !== proposal.id)}); setSelected(values => values.filter(id => id !== proposal.id));}}>제거</ActionButton></div>
                            {proposal.kind === "link" && <p className="muted small">{relationLabels[proposal.relation ?? "relates_to"]} · 새 항목을 참조하면 함께 선택해야 합니다. 기존 Task는 같은 ID로 재사용합니다.</p>}
                            {existing && <p className="muted small">현재 r{existing.revision} · {statusLabels[existing.kind === "task" ? existing.data.state : existing.status]} · {proposal.reopen ? "완료 Task 재개를 명시 선택함" : "상태·담당·일정은 유지"}</p>}
                            {proposal.body && proposal.kind !== "update_item" && <p className="planning-body">{proposal.body}</p>}
                            {(proposal.disposition || proposal.rationale) && <p className="muted small">분류: {proposal.disposition ? statusLabels[proposal.disposition] ?? proposal.disposition : "미설정"} · {proposal.rationale}</p>}
                            {proposal.kind === "update_item" && <div className="planning-diff"><Diff label="제목" before={existing?.title} after={proposal.title} /><Diff label="본문" before={existing?.body} after={proposal.body} /></div>}
                            {change && <details className="planning-server-diff"><summary>서버 미리보기 · 필드별 변경 확인</summary><ChangeDiff before={change.before} after={change.after} name={previewName} /></details>}
                        </article>;
                    })}</div>
                </section>
                {selectionErrors.map((message, index) => <p role="alert" key={index}>{message}</p>)}
                {(missingPermissions || sourceForbidden) && <p role="alert">선택한 변경에 필요한 현재 권한이 없습니다. 권한이 있는 변경만 선택해 주세요.</p>}
                {preview?.source && <p className="muted">원문 Idea ‘{preview.source.title}’도 생성됩니다. 선택한 참고 자료와 연결합니다.</p>}
                {preview?.audit && <p className="muted">SkillRun 적용의 선택과 이유를 Decision으로 기록합니다.</p>}
                {attempt && <div className="notice" role="status"><p>적용 결과를 확인하지 못했습니다. 입력과 요청 ID를 보존했습니다. 자동 재전송하지 않습니다.</p>
                    <div className="actions"><ActionButton type="button" disabled={busy || !readAllowed} onClick={checkResult}>적용 결과 확인</ActionButton>
                        <ActionButton type="button" disabled={busy || !writable} onClick={() => {if (attempt) void run(() => applyExact(attempt));}}>같은 요청 재시도</ActionButton></div></div>}
            </>}
            {receipt && readAllowed && <section role="status"><h3>기획 적용 완료</h3><p>새 항목 {receipt.created_items.length}개 · 기존 수정 {receipt.updated_items.length}개 · 연결 {receipt.links.length}개</p><details><summary>적용 기록 자세히</summary><p className="muted small">적용 요청 ID: {receipt.operation_id}</p></details></section>}
            {error && <ErrorNotice error={error} />}
        </div>
        <footer className="planning-footer">
            <ActionButton type="button" disabled={busy || !!attempt} onClick={close}>{receipt ? "닫기" : "취소 · 초안 보존"}</ActionButton>
            {!receipt && <div className="actions"><ActionButton type="button" disabled={locked || sourceForbidden} onClick={() => void run(async () => {await persist(); setNotice("초안을 저장했습니다. 업무 항목에는 반영하지 않았습니다.");})}>초안 저장</ActionButton>
                <ActionButton type="button" disabled={locked || !selected.length || !!selectionErrors.length || missingPermissions || sourceForbidden || items.status !== "ready"} onClick={inspect}>변경 미리보기</ActionButton>
                <ActionButton type="button" className="primary" disabled={locked || !preview || !selected.length || !!selectionErrors.length || missingPermissions || sourceForbidden || items.status !== "ready"} onClick={apply}>선택한 변경 적용</ActionButton></div>}
        </footer>
    </Modal>;
}

function Diff({label, before, after}: {label: string; before: unknown; after: unknown}) {
    if (after === undefined || JSON.stringify(before) === JSON.stringify(after)) return null;
    const format = (value: unknown): string => value === undefined || value === null || value === "" ? "(없음)"
        : typeof value === "boolean" ? value ? "예" : "아니요"
        : Array.isArray(value) ? value.length ? value.map(format).join("\n") : "(없음)"
        : typeof value === "object" ? Object.values(value).map(format).join(" · ") : String(value);
    return <div className="planning-diff-field"><strong>{label}</strong><div><span className="muted">이전</span><pre>{format(before)}</pre></div><div><span className="muted">이후</span><pre>{format(after)}</pre></div></div>;
}
const previewFieldLabels: Record<string, string> = {
    title: "제목", body: "본문", data: "속성", status: "자료 상태", state: "작업 상태", kind: "항목 종류",
    planned_date: "실행 예정일", due_date: "마감일", acceptance_criteria: "수용 조건", workflow: "작업 유형",
    category: "요구 분류", priority: "우선순위", disposition: "반영 분류", problem: "현재 문제", expected_outcome: "기대 결과",
    scope: "범위", exclusions: "제외 범위", processing_state: "Story 처리 상태", list_name: "목록", estimated_minutes: "예상 소요 · 분",
    context: "상황", energy: "필요 에너지", next_action: "다음 행동", abc_priority: "ABC 우선순위", abc_order: "ABC 순서",
    goal: "목표", github_issue_url: "GitHub 이슈", result_url: "결과 근거", target_sha: "검증한 코드 버전", requires_test: "테스트 필요",
    cancellation_reason: "종료 사유", feature_ids: "참고 Feature", source_id: "출발 항목", target_id: "도착 항목", relation: "연결 의미",
    source_revision: "출발 항목 revision", target_revision: "도착 항목 revision", custom_fields: "사용자 정의 속성", reason: "판단 이유",
    alternatives: "검토한 대안", excluded_reason: "제외 이유", source_url: "원문 링크", notes: "비고", steps: "검증 절차", expected: "기대 결과",
};
function ChangeDiff({before, after, name}: {before: Record<string, unknown> | null; after: Record<string, unknown>; name: (id: string) => string}) {
    const internalFields = new Set(["id", "project_id", "created_at", "updated_at", "board_order", "revision"]);
    const values: Record<string, string> = {...statusLabels, personal: "할 일", delivery: "구현 작업", requirement: "Story", task: "Task",
        idea: "원문 Idea", feature: "현재 Feature", decision: "결정 기록", test_case: "테스트", artifact: "임시 문서", functional: "기능", nonfunctional: "품질·비기능",
        low: "낮음", medium: "보통", high: "높음", any: "무관", none: "없음", raised: "제기됨", reviewing: "검토 중", planned: "계획됨", verifying: "검증 중", satisfied: "충족"};
    function display(key: string, value: unknown): unknown {
        if (Array.isArray(value)) return value.map(entry => display(key, entry));
        if (typeof value !== "string") return value;
        if (key.endsWith("_id") || key.endsWith("_ids")) return name(value);
        if (key === "relation") return relationLabels[value as keyof typeof relationLabels] ?? "관계";
        return ["status", "state", "kind", "workflow", "category", "priority", "disposition", "energy", "processing_state", "abc_priority"].includes(key) ? values[value] ?? value : value;
    }
    function fields(previous: Record<string, unknown> | null, current: Record<string, unknown>, parent = ""): React.ReactNode {
        return Object.entries(current).filter(([key]) => !internalFields.has(key)).map(([key, value]) => {
            const path = parent ? `${parent}.${key}` : key;
            const oldData = z.record(z.string(), z.unknown()).safeParse(previous?.[key]);
            const newData = z.record(z.string(), z.unknown()).safeParse(value);
            return newData.success ? fields(oldData.success ? oldData.data : null, newData.data, path)
                : <Diff key={path} label={previewFieldLabels[key] ?? (parent === "custom_fields" || parent.endsWith(".custom_fields") ? "사용자 정의 속성" : "추가 속성")} before={display(key, previous?.[key])} after={display(key, value)} />;
        });
    }
    return <div className="planning-diff">{typeof after.revision === "number" && <p className="muted small">{typeof before?.revision === "number" ? `현재 r${before.revision} → 적용 후 r${after.revision}` : `새 항목 r${after.revision}`}</p>}{fields(before, after)}</div>;
}

function ProposalAuthor({value, onChange, items, proposals, disabled, canCreate, onAdd}: {
    value: PlanningAuthor; onChange: (value: PlanningAuthor) => void;
    items: Item[]; proposals: PlanningProposal[]; disabled: boolean;
    canCreate: (kind: PlanningProposal["kind"]) => boolean; onAdd: (proposal: PlanningProposal) => void;
}) {
    const {kind, title, body, criteria, itemId, source, target, relation, reopen} = value;
    const update = (patch: Partial<PlanningAuthor>) => onChange({...value, ...patch});
    const existing = items.find(item => item.id === itemId);
    const endpoints = [...items.map(item => ({id: item.id, title: `${item.title} · ${item.kind === "requirement" ? "Story" : item.kind} r${item.revision}`})),
        ...proposals.filter(proposal => proposal.kind === "create_story" || proposal.kind === "create_task").map(proposal => ({id: proposal.id, title: `${proposal.title} · ${proposalLabels[proposal.kind]} 후보`}))];
    function add() {
        if (disabled || !canCreate(kind)) return;
        const proposal: PlanningProposal = {id: `candidate-${crypto.randomUUID()}`, kind};
        if (kind === "link") {if (!source || !target || source === target) return; Object.assign(proposal, {source, target, relation});}
        else {
            if (!title.trim() || kind === "update_item" && !existing) return;
            Object.assign(proposal, {title: title.trim(), body});
            if (kind === "update_item") Object.assign(proposal, {item_id: itemId, ...(reopen ? {reopen: true, data: {state: "todo"}} : {})});
            else if (kind === "create_story") proposal.data = {acceptance_criteria: criteria.split("\n").map(value => value.trim()).filter(Boolean)};
        }
        onAdd(proposal); onChange({...emptyPlanningAuthor, kind});
    }
    return <section className="planning-author" aria-label="변경 후보 직접 작성">
        <h3>직접 작성</h3>
        <Field label="변경 종류"><NativeSelect value={kind} disabled={disabled} onChange={event => onChange({...emptyPlanningAuthor, kind: event.target.value as PlanningProposal["kind"]})}>
            {Object.entries(proposalLabels).map(([value, label]) => <option key={value} value={value} disabled={!canCreate(value as PlanningProposal["kind"])}>{label}</option>)}
        </NativeSelect></Field>
        {!canCreate(kind) && <p className="muted small">이 변경을 작성할 권한이 없습니다. 가능한 변경 종류를 선택해 주세요.</p>}
        {kind === "update_item" && <Field label="수정할 기존 항목"><NativeSelect value={itemId} disabled={disabled} onChange={event => {const item = items.find(item => item.id === event.target.value); update({itemId: item?.id ?? "", title: item?.title ?? "", body: item?.body ?? "", reopen: false});}}><option value="">항목 선택</option>{items.map(item => <option key={item.id} value={item.id}>{item.title} · r{item.revision}</option>)}</NativeSelect></Field>}
        {kind === "link" ? <div className="planning-link-author"><Field label="연결 출발 항목"><NativeSelect value={source} disabled={disabled} onChange={event => update({source: event.target.value})}><option value="">항목 선택</option>{endpoints.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</NativeSelect></Field>
            <Field label="연결 의미"><NativeSelect value={relation} disabled={disabled} onChange={event => update({relation: event.target.value as typeof relation})}>{Object.entries(relationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></Field>
            <Field label="연결 도착 항목"><NativeSelect value={target} disabled={disabled} onChange={event => update({target: event.target.value})}><option value="">항목 선택</option>{endpoints.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</NativeSelect></Field>
            {source && source === target && <p role="alert">같은 항목을 연결할 수 없습니다.</p>}</div> : <>
            <Field label="후보 제목"><Input value={title} maxLength={300} disabled={disabled || !canCreate(kind)} onChange={event => update({title: event.target.value})} /></Field>
            <Field label="후보 본문 · 선택"><Textarea value={body} rows={2} disabled={disabled || !canCreate(kind)} onChange={event => update({body: event.target.value})} /></Field>
            {kind === "create_story" && <Field label="수용 조건 · 한 줄에 하나, 선택"><Textarea value={criteria} rows={2} disabled={disabled} onChange={event => update({criteria: event.target.value})} /></Field>}
            {kind === "update_item" && existing?.kind === "task" && existing.data.state === "done" && <label className="planning-check"><Checkbox checked={reopen} disabled={disabled} onCheckedChange={value => update({reopen: value === true})} /><span>완료 Task를 할 일로 명시적으로 재개</span></label>}
        </>}
        <ActionButton type="button" disabled={disabled || !canCreate(kind) || (kind === "link" ? !source || !target || source === target : !title.trim() || kind === "update_item" && !itemId)} onClick={add}>후보 추가</ActionButton>
        <ActionButton type="button" disabled={disabled} onClick={() => onChange({...emptyPlanningAuthor, kind})}>작성 중 입력 지우기</ActionButton>
    </section>;
}

const launcherRecoverySchema = z.object({open: z.boolean(), draftId: z.string().optional()});
export function PlanningDraftLauncher({project, contextItem, onApplied}: {project: Project; contextItem?: Item; onApplied: (receipt: PlanningReceipt) => void}) {
    const state = useRef<z.infer<typeof launcherRecoverySchema> | null>(null);
    const recovery = useAuthenticationDraft(`planning-launcher:${project.id}:${contextItem?.id ?? "project"}`, launcherRecoverySchema, () => state.current);
    const [open, setOpen] = useState(recovery.restored?.open ?? false);
    const [draftId, setDraftId] = useState<string | undefined>(recovery.restored?.draftId);
    state.current = open ? {open, draftId} : null;
    const can = useProjectPermissions();
    const editable = planningWritePermissions.some(permission => can(project.id, permission));
    const drafts = useResource(`planning-drafts:${project.id}:${project.access?.access_revision ?? 0}`, signal => planningApi.list(project.id, signal));
    return <div className="planning-launcher"><ActionButton type="button" disabled={!editable} onClick={() => {setDraftId(undefined); setOpen(true);}}>{contextItem ? "관련 작업 기획" : "기획 추가"}</ActionButton>
        {drafts.status === "error" && <ErrorNotice error={drafts.error} retry={drafts.reload} />}
        {drafts.status === "ready" && drafts.data.some(draft => draft.status !== "applied") && <details><summary>저장된 기획 초안</summary><ul>{drafts.data.filter(draft => draft.status !== "applied").map(draft => <li key={draft.id}><ActionButton type="button" onClick={() => {setDraftId(draft.id); setOpen(true);}}>{draft.intent.trim().slice(0, 60) || "제목 없는 기획"} · {draft.proposals.length}개 후보 · {draft.status === "cancelled" ? "보존됨" : "초안"}</ActionButton></li>)}</ul></details>}
        {open && <PlanningDialog key={draftId ?? "new"} project={project} contextItem={contextItem} draftId={draftId} onApplied={result => {drafts.reload(); onApplied(result);}} onClose={() => {setOpen(false); recovery.clear(); drafts.reload();}} />}
    </div>;
}
