import { DateTimeValue } from "./date-time-settings";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { useReauthenticationCheckpoint } from "./reauthentication";
import { useProjectPermissions } from "./ProjectPermissions";
import { api, ApiError, errorMessage } from "./api";
import { useResource, type Resource } from "./hooks";
import {
    kindLabels, relationLabels, relationSchema,
} from "./models";
import type { Item, Link } from "./models";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Textarea } from "./pydemia-ui/textarea";
import { ActionButton, Badge, Empty, ErrorNotice, ExternalLink, Field, Loading, Modal, RouteLink } from "./ui";
import { contributingItems, visibleRelationGroups } from "./story-models";

export function itemRoute(item: Item) {
    return { project: item.project_id, view: item.kind === "task" ? "tasks" : item.kind === "test_case" ? "tests" : item.kind === "artifact" ? "documents" : item.kind === "requirement" ? "stories" : "materials", kind: item.kind, item: item.id };
}

function relationChanged() {window.dispatchEvent(new Event("projects:relations-changed"));}
function useRelationRefresh(reload: () => void) {
    useEffect(() => {
        window.addEventListener("projects:relations-changed", reload);
        return () => window.removeEventListener("projects:relations-changed", reload);
    }, [reload]);
}

function useRelationEndpoints(item: Item, items: Item[], links: Resource<Link[]>) {
    const available = new Set(items.map(entry => entry.id));
    const missing = links.status === "ready" ? [...new Set(links.data
        .filter(link => link.source_id === item.id || link.target_id === item.id)
        .flatMap(link => [link.source_id, link.target_id]).filter(id => !available.has(id)))] : [];
    const endpoints = useResource(`relation-endpoints:${item.id}:${missing.join(",")}`, async signal => {
        const result = await Promise.all(missing.map(async id => {
            try {return await api.item(id, signal);}
            catch (cause) {if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return null; throw cause;}
        }));
        return result.filter((entry): entry is Item => entry !== null);
    });
    return {items: endpoints.status === "ready" ? [...items, ...endpoints.data] : items, endpoints};
}

function useRelationProjectItems(projectId: string, items: Item[], selectedProject: string) {
    const can = useProjectPermissions();
    const allowed = can(projectId, "relation.write") && can(selectedProject, "relation.write");
    const projects = useResource("relation-projects", signal => api.projects(signal));
    const candidates = useResource(`relation-candidates:${projectId}:${selectedProject}:${allowed}:${selectedProject === projectId ? items.map(item => `${item.id}:${item.revision}`).join(",") : ""}`,
        signal => !allowed ? Promise.resolve([]) : selectedProject === projectId ? Promise.resolve(items.filter(item => item.project_id === projectId)) : api.items(selectedProject, signal));
    return {projects, candidates};
}

const relationDraftSchema = z.object({source: z.string(), target: z.string(), relation: z.string(), targetProject: z.string().optional()}).strict();
const testResultDraftSchema = z.object({outcome: z.string(), actual: z.string(), environment: z.string(), sha: z.string(), evidence: z.string()}).strict();

export function Relations({ item, items, onChanged }: {
    item: Item; items: Item[]; onChanged: () => void;
}) {
    const can = useProjectPermissions();
    const writable = can(item.project_id, "relation.write");
    const links = useResource(`links:${item.project_id}`, signal => api.links(item.project_id, signal));
    useRelationRefresh(links.reload);
    const visible = useRelationEndpoints(item, items, links);
    const recovery: AuthenticationDraft<z.infer<typeof relationDraftSchema>> = useAuthenticationDraft(`item:${item.project_id}:${item.id}:relation`, relationDraftSchema,
        () => target || source !== item.id || relation !== "relates_to" || targetProject !== item.project_id ? {source, target, relation, targetProject} : null);
    const [source, setSource] = useState(recovery.restored?.source ?? item.id);
    const [target, setTarget] = useState(recovery.restored?.target ?? "");
    const [relation, setRelation] = useState(recovery.restored?.relation ?? "relates_to");
    const [targetProject, setTargetProject] = useState(recovery.restored?.targetProject ?? item.project_id);
    const selection = useRelationProjectItems(item.project_id, items, targetProject);
    const targetItems = selection.candidates.status === "ready" ? selection.candidates.data : [];
    const selectableProjects = selection.projects.status === "ready" ? selection.projects.data.filter(project => can(project.id, "relation.write")) : [];
    const context = useRef(`${item.project_id}:${item.id}`);
    useEffect(() => {
        const next = `${item.project_id}:${item.id}`;
        if (context.current === next) return;
        context.current = next; setSource(item.id); setTarget(""); setTargetProject(item.project_id);
    }, [item.id, item.project_id]);
    const savedSelection = useRef({source: item.id, relation: "relates_to"});
    useReauthenticationCheckpoint(() => !target && source === savedSelection.current.source && relation === savedSelection.current.relation);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [removing, setRemoving] = useState<Link[] | null>(null);
    const all = new Map(visible.items.map(entry => [entry.id, entry]));
    async function add(event: React.FormEvent) {
        event.preventDefault();
        if (!writable || !can(targetProject, "relation.write") || !items.some(entry => entry.id === source && entry.project_id === item.project_id) || !targetItems.some(entry => entry.id === target && entry.project_id === targetProject)) return;
        setBusy(true); setError("");
        try {
            await api.createLink(item.project_id, { source_id: source, target_id: target, relation });
            savedSelection.current = {source, relation};
            relationChanged(); onChanged(); setTarget(""); recovery.clear();
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    async function remove() {
        if (!writable || !removing) return;
        setBusy(true); setError("");
        try {
            const remaining = [...removing];
            for (const link of removing) {
                await api.deleteLink(link.id); remaining.shift(); setRemoving([...remaining]);
            }
            setRemoving(null); relationChanged(); onChanged();
        }
        catch (error) { setError(errorMessage(error)); relationChanged(); onChanged(); }
        finally { setBusy(false); }
    }
    return <section>
        <h2>관계와 근거 revision</h2>
        <p className="muted">작업의 선행 관계는 <strong>작업 → 먼저 끝낼 작업</strong> 방향입니다. 테스트가 대상을 검증하는 경우 <strong>테스트 → 요구사항·작업</strong> 방향을 사용합니다.</p>
        {links.status === "loading" && <Loading />}
        {links.status === "error" && <ErrorNotice error={links.error} retry={links.reload} />}
        {visible.endpoints.status === "error" && <ErrorNotice error={visible.endpoints.error} retry={visible.endpoints.reload} />}
        {links.status === "ready" && <ul className="relation-list">
            {visibleRelationGroups(item, visible.items, links.data).map(group => {
                const link = group[0]!;
                const from = all.get(link.source_id)!, to = all.get(link.target_id)!;
                const stale = group.some(entry => all.get(entry.source_id)?.revision !== entry.source_revision || all.get(entry.target_id)?.revision !== entry.target_revision);
                const label = link.relation === "depends_on" ? link.source_id === item.id ? "먼저 끝낼 일" : "이 작업을 기다리는 일" : relationLabels[link.relation];
                return <li key={link.id}><div>
                    <RouteLink patch={itemRoute(from)}>{from.title}</RouteLink>
                    <small>r{link.source_revision} {link.relation === "relates_to" ? "↔" : "→"} {label} {link.relation === "relates_to" ? "↔" : "→"} r{link.target_revision}</small>
                    <RouteLink patch={itemRoute(to)}>{to.title}</RouteLink>
                    {stale && <Badge value="in_review" label="재검토 필요" />}
                </div><ActionButton className="small" disabled={busy || !writable} onClick={() => setRemoving(group)}>연결 해제</ActionButton></li>;
            })}
            {!visibleRelationGroups(item, visible.items, links.data).length && <li className="muted">현재 접근 가능한 연결이 없습니다.</li>}
        </ul>}
        <fieldset disabled={!writable}><form onSubmit={event => { void add(event); }} className="section-space">
            <h3>관계 추가</h3>
            <Field label="연결 대상 프로젝트"><NativeSelect value={targetProject} disabled={busy || !writable} onChange={event => {setTargetProject(event.target.value); setTarget("");}}>
                <option value={item.project_id}>현재 프로젝트</option>
                {selectableProjects.filter(project => project.id !== item.project_id).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </NativeSelect></Field>
            {selection.projects.status === "error" && <ErrorNotice error={selection.projects.error} retry={selection.projects.reload} />}
            {selection.candidates.status === "loading" && <Loading label="선택한 프로젝트의 항목을 불러오는 중…" />}
            {selection.candidates.status === "error" && <ErrorNotice error={selection.candidates.error} retry={selection.candidates.reload} />}
            <div className="form-grid">
                <Field label="시작 대상"><NativeSelect required value={source} onChange={event => setSource(event.target.value)}>
                    {items.filter(entry => entry.project_id === item.project_id).map(entry => <option key={entry.id} value={entry.id}>{kindLabels[entry.kind]} · {entry.title}</option>)}
                </NativeSelect></Field>
                <Field label="관계"><NativeSelect value={relation} onChange={event => setRelation(event.target.value)}>
                    {relationSchema.options.map(value => <option key={value} value={value}>{relationLabels[value]}</option>)}
                </NativeSelect></Field>
                <Field label="연결 대상"><NativeSelect required value={target} onChange={event => setTarget(event.target.value)}>
                    <option value="">대상 선택</option>
                    {targetItems.filter(entry => entry.id !== source).map(entry => <option key={entry.id} value={entry.id}>{kindLabels[entry.kind]} · {entry.title}</option>)}
                </NativeSelect></Field>
            </div>
            {error && <ErrorNotice error={error} />}
            <ActionButton type="submit" disabled={busy || !writable || !can(targetProject, "relation.write") || !targetItems.some(entry => entry.id === target)}>{busy ? "처리 중…" : "관계 저장"}</ActionButton>
        </form></fieldset>
        {removing && <Modal title="연결 해제 확인" onClose={() => {if (!busy) setRemoving(null);}}>
            <p>아래 저장된 연결을 해제합니다. 대상 항목과 작업은 유지합니다.</p>
            <ul>{removing.map(link => <li key={link.id}>
                {all.get(link.source_id)?.title} r{link.source_revision} → {relationLabels[link.relation]} → {all.get(link.target_id)?.title} r{link.target_revision}
                <small className="muted"> 연결 ID {link.id}</small>
            </li>)}</ul>
            {error && <ErrorNotice error={error} />}
            <div className="form-actions"><ActionButton type="button" disabled={busy} onClick={() => setRemoving(null)}>취소</ActionButton><ActionButton disabled={busy || !writable} onClick={() => void remove()}>연결 {removing.length}개 해제</ActionButton></div>
        </Modal>}
    </section>;
}

/** Canonical many-to-many contributes relation, usable from either Task or Story detail. */
export function StoryTaskLinks({item, items, onChanged}: {item: Item; items: Item[]; onChanged: () => void}) {
    const can = useProjectPermissions();
    const writable = can(item.project_id, "relation.write");
    const links = useResource(`story-task-links:${item.project_id}`, signal => api.links(item.project_id, signal));
    useRelationRefresh(links.reload);
    const visible = useRelationEndpoints(item, items, links);
    const [target, setTarget] = useState("");
    const [targetProject, setTargetProject] = useState(item.project_id);
    const selection = useRelationProjectItems(item.project_id, items, targetProject);
    const context = useRef(`${item.project_id}:${item.id}`);
    useEffect(() => {
        const next = `${item.project_id}:${item.id}`;
        if (context.current === next) return;
        context.current = next; setTarget(""); setTargetProject(item.project_id);
    }, [item.id, item.project_id]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const connected = links.status === "ready" ? contributingItems(item, visible.items, links.data) : [];
    const connectedIds = new Set(connected.map(entry => entry.id));
    const kind = item.kind === "task" ? "requirement" : "task";
    const candidates = selection.candidates.status === "ready" && can(targetProject, "relation.write") ? selection.candidates.data.filter(entry => entry.kind === kind && entry.project_id === targetProject && !connectedIds.has(entry.id)) : [];
    const label = item.kind === "task" ? "관련 Story" : "기여하는 Task";
    async function add(event: React.FormEvent) {
        event.preventDefault();
        if (!writable || busy || !can(targetProject, "relation.write") || !candidates.some(entry => entry.id === target)) return;
        setBusy(true); setError("");
        try {
            await api.createLink(item.project_id, {source_id: item.kind === "task" ? item.id : target,
                target_id: item.kind === "task" ? target : item.id, relation: "implements"});
            setTarget(""); relationChanged(); onChanged();
        } catch (cause) {setError(errorMessage(cause));} finally {setBusy(false);}
    }
    return <section className="section-space" aria-label={label}>
        <h2>{label}{links.status === "ready" ? ` · ${connected.length}` : ""}</h2>
        <p className="muted">현재 접근 가능한 항목만 표시합니다. 하나의 Task를 여러 Story에 연결할 수 있습니다.</p>
        {links.status === "loading" && <Loading />}
        {links.status === "error" && <ErrorNotice error={links.error} retry={links.reload} />}
        {visible.endpoints.status === "error" && <ErrorNotice error={visible.endpoints.error} retry={visible.endpoints.reload} />}
        {links.status === "ready" && <ul className="story-relation-chips">{connected.length ? connected.map(entry => <li key={entry.id}>
            <RouteLink patch={itemRoute(entry)}>{entry.title}</RouteLink>
            {entry.kind === "task" && <Badge value={entry.data.state} />}
        </li>) : <li className="muted">연결된 {item.kind === "task" ? "Story가" : "Task가"} 없습니다.</li>}</ul>}
        <form className="form-grid" onSubmit={event => void add(event)}>
            <Field label="연결 대상 프로젝트"><NativeSelect value={targetProject} disabled={!writable || busy} onChange={event => {setTargetProject(event.target.value); setTarget("");}}>
                <option value={item.project_id}>현재 프로젝트</option>
                {selection.projects.status === "ready" && selection.projects.data.filter(project => project.id !== item.project_id && can(project.id, "relation.write")).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </NativeSelect></Field>
            <Field label={`기존 ${item.kind === "task" ? "Story" : "Task"} 연결`}><NativeSelect required disabled={!writable || busy} value={target} onChange={event => setTarget(event.target.value)}>
                <option value="">항목 선택</option>{candidates.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </NativeSelect></Field>
            <ActionButton disabled={!writable || busy || !target}>{busy ? "연결 중…" : "연결"}</ActionButton>
        </form>
        {selection.projects.status === "error" && <ErrorNotice error={selection.projects.error} retry={selection.projects.reload} />}
        {selection.candidates.status === "loading" && <Loading label="선택한 프로젝트의 항목을 불러오는 중…" />}
        {selection.candidates.status === "error" && <ErrorNotice error={selection.candidates.error} retry={selection.candidates.reload} />}
        {error && <ErrorNotice error={error} />}
    </section>;
}

export function TestExecutions({ item, onChanged }: { item: Item; onChanged: () => void }) {
    const can = useProjectPermissions();
    const writable = can(item.project_id, "test.write");
    const runs = useResource(`test-runs:${item.project_id}`, signal => api.testRuns(item.project_id, signal));
    const recovery: AuthenticationDraft<z.infer<typeof testResultDraftSchema>> = useAuthenticationDraft(`item:${item.project_id}:${item.id}:test-result`, testResultDraftSchema,
        () => actual || environment !== savedFields.current.environment || sha !== savedFields.current.sha || evidence !== savedFields.current.evidence || outcome !== savedFields.current.outcome
            ? {outcome, actual, environment, sha, evidence} : null);
    const [outcome, setOutcome] = useState(recovery.restored?.outcome ?? "passed");
    const [actual, setActual] = useState(recovery.restored?.actual ?? "");
    const [environment, setEnvironment] = useState(recovery.restored?.environment ?? "");
    const [sha, setSha] = useState(recovery.restored?.sha ?? "");
    const [evidence, setEvidence] = useState(recovery.restored?.evidence ?? "");
    const savedFields = useRef({outcome: "passed", environment: "", sha: "", evidence: ""});
    useReauthenticationCheckpoint(() => !actual && outcome === savedFields.current.outcome && environment === savedFields.current.environment &&
        sha === savedFields.current.sha && evidence === savedFields.current.evidence);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function record(event: React.FormEvent) {
        event.preventDefault(); if (!writable) return; setBusy(true); setError("");
        try {
            await api.createTestRun(item.id, {
                outcome, actual, environment, target_sha: sha, evidence_url: evidence,
            });
            savedFields.current = {outcome, environment, sha, evidence};
            runs.reload(); onChanged(); setActual(""); recovery.clear();
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <section><h2>실행 기록</h2>
        <p className="muted">여기서는 직접 실행한 테스트의 결과를 기록합니다. 기록은 케이스 revision {item.revision}에 연결됩니다.</p>
        {runs.status === "loading" && <Loading />}
        {runs.status === "error" && <ErrorNotice error={runs.error} retry={runs.reload} />}
        {runs.status === "ready" && <>
            {!runs.data.some(run => run.case_id === item.id) && <Empty title="아직 실행 기록이 없습니다."><p>미실행 상태는 통과로 집계하지 않습니다.</p></Empty>}
            <ul className="record-list">{runs.data.filter(run => run.case_id === item.id).map(run => <li key={run.id}>
                <div className="row-head"><Badge value={run.outcome} /><span>케이스 r{run.case_revision}</span><DateTimeValue value={run.created_at} />
                    {run.case_revision !== item.revision && <Badge value="in_review" label="과거 케이스 기준" />}</div>
                <p className="preserve-lines">{run.actual}</p>
                <small className="muted">환경 {run.environment || "미기록"} · SHA {run.target_sha || "미기록"}</small>
                {run.evidence_url && <p><ExternalLink href={run.evidence_url}>실행 증빙 ↗</ExternalLink></p>}
            </li>)}</ul>
        </>}
        <fieldset disabled={!writable}><form className="section-space" onSubmit={event => { void record(event); }}>
            <h3>새 실행 결과 기록</h3>
            <div className="form-grid">
                <Field label="결과"><NativeSelect value={outcome} onChange={event => setOutcome(event.target.value)}>
                    <option value="passed">통과</option><option value="failed">실패</option><option value="aborted">중단</option>
                </NativeSelect></Field>
                <Field label="실행 환경"><Input required value={environment} onChange={event => setEnvironment(event.target.value)} placeholder="예: Windows 11 · Chrome 141 · dev" /></Field>
            </div>
            <Field label="실제 실행 결과"><Textarea required rows={4} value={actual} onChange={event => setActual(event.target.value)} placeholder="관찰한 결과와 실패·중단 사유를 기록해 주세요." /></Field>
            <div className="form-grid">
                <Field label="대상 commit SHA"><Input required maxLength={128} value={sha} onChange={event => setSha(event.target.value)} /></Field>
                <Field label="로그·증빙 URL"><Input type="url" value={evidence} onChange={event => setEvidence(event.target.value)} /></Field>
            </div>
            {error && <ErrorNotice error={error} />}
            <ActionButton type="submit" className="primary" disabled={busy || !writable}>{busy ? "기록 중…" : "실행 결과 저장"}</ActionButton>
        </form></fieldset>
    </section>;
}
