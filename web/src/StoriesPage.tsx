import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, errorMessage } from "./api";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { DateTimeValue } from "./date-time-settings";
import { navigate, useResource, type Route } from "./hooks";
import { InlineBodyEdit, InlineTextEdit } from "./InlineEdit";
import { defaultData, type Item } from "./models";
import { useProjectPermissions } from "./ProjectPermissions";
import { Relations, StoryTaskLinks } from "./Relations";
import { storyApi } from "./story-api";
import { storyCriteria, storyState, storyStateLabels, storyProcessingStateSchema } from "./story-models";
import { Card, CardContent } from "./pydemia-ui/card";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { SearchInput } from "./pydemia-ui/search-input";
import { SideNav } from "./pydemia-ui/navigation";
import { Textarea } from "./pydemia-ui/textarea";
import { ActionButton, Badge, Empty, ErrorNotice, Field, Loading, Modal, PageHead, RouteLink } from "./ui";
import "./story-task.css";

const creationSchema = z.object({title: z.string()});
const inlineSchema = z.object({field: z.string(), value: z.string(), baseRevision: z.number().int()});
const verificationDraftSchema = z.object({
    revision: z.number().int(), evidence: z.string(),
    results: z.array(z.object({criterion: z.string(), passed: z.boolean(), evidence: z.string()})),
});

export function StoriesPage({projectId, userId, route, items, onChanged, onPlan}: {
    projectId: string; userId: string; route: Route; items: Item[]; onChanged: () => void; onPlan?: (item?: Item) => void;
}) {
    const can = useProjectPermissions();
    const [query, setQuery] = useState(route.q);
    const [creating, setCreating] = useState(false);
    const summary = useResource(`stories:${projectId}:${items.filter(item => item.kind === "requirement" || item.kind === "task").map(item => `${item.id}:${item.revision}`).join(",")}`,
        signal => storyApi.list(projectId, signal));
    useEffect(() => setQuery(route.q), [route.q]);
    const stories = items.filter(item => item.kind === "requirement");
    const filtered = stories.filter(item => `${item.title} ${item.body} ${item.data.problem ?? ""} ${item.data.expected_outcome ?? ""}`.toLocaleLowerCase().includes(route.q.toLocaleLowerCase()));
    const selected = stories.find(item => item.id === route.item);
    const selectedSummary = summary.status === "ready" ? summary.data.stories.find(entry => entry.item.id === selected?.id) : undefined;
    function changed() {summary.reload(); onChanged();}
    return <>
        <PageHead title="Story·요구사항" description="해결할 문제와 기대 결과를 정리하고 수용 조건의 검증 근거를 남깁니다.">
            <ActionButton className="primary" disabled={!can(projectId, "item.write")} onClick={() => setCreating(true)}>+ Story 추가</ActionButton>
            <ActionButton onClick={() => onPlan ? onPlan() : navigate({view: "planning", kind: "", item: ""})}>기획 추가</ActionButton>
        </PageHead>
        <div className="story-summary" aria-label="접근 가능한 Story·Task 현황">
            {summary.status === "loading" && <Loading />}
            {summary.status === "error" && <ErrorNotice error={summary.error} retry={summary.reload} />}
            {summary.status === "ready" && <>
                <span>Story 충족 <strong>{summary.data.story_fulfilled}/{summary.data.story_total}</strong></span>
                <span>Task 완료 <strong>{summary.data.task_done}/{summary.data.task_total}</strong></span>
                <small className="muted">현재 접근 가능한 범위 · 공유 Task는 한 번 집계</small>
            </>}
        </div>
        <div className={`document-layout story-workspace ${selected ? "has-selection" : ""}`}>
            <Card className="doclist workspace-collection" aria-label="Story 목록"><CardContent>
                <div className="workspace-list-heading"><h2>Story 목록</h2><span>{filtered.length}개</span></div>
                <SearchInput label="Story 검색" value={query} onValueChange={setQuery} onSearch={value => navigate({q: value, item: ""})} variant="toolbar" placeholder="제목·문제·기대 결과 검색" />
                <SideNav aria-label="Story 항목" className="doc-list-items">
                    {filtered.map(item => <RouteLink key={item.id} patch={{view: "stories", kind: "requirement", item: item.id}}
                        appearance="side" className="doc-item" current={selected?.id === item.id}><strong>{item.title}</strong></RouteLink>)}
                    {!filtered.length && <p className="muted">{route.q ? "검색 결과가 없습니다." : "아직 등록한 Story가 없습니다."}</p>}
                </SideNav>
            </CardContent></Card>
            <Card className="document-main workspace-detail"><CardContent>
                {selected ? <>
                    <ActionButton className="mobile-detail-back" onClick={() => navigate({item: ""})}>← Story 목록</ActionButton>
                    <StoryEditor key={selected.id} item={selected} items={items} userId={userId} onChanged={changed}
                        onPlan={onPlan}
                        verificationCurrent={selectedSummary?.verification_current}
                        taskProgress={selectedSummary && {done: selectedSummary.completed_task_count, total: new Set(selectedSummary.task_ids).size}} />
                </> : <Empty title={route.item ? "선택한 Story를 찾을 수 없습니다." : "제목으로 첫 Story를 추가해 보세요."}>
                    <p>{route.item ? "현재 접근할 수 있는 목록에서 다시 선택해 주세요." : "Task로 나누기 전에도 해결할 문제를 기록할 수 있습니다."}</p>
                </Empty>}
            </CardContent></Card>
        </div>
        {creating && <NewStory projectId={projectId} userId={userId} onClose={() => setCreating(false)} onCreated={item => {
            setCreating(false); changed(); navigate({view: "stories", kind: "requirement", item: item.id});
        }} />}
    </>;
}

function NewStory({projectId, userId, onClose, onCreated}: {
    projectId: string; userId: string; onClose: () => void; onCreated: (item: Item) => void;
}) {
    const can = useProjectPermissions();
    const writable = can(projectId, "item.write");
    const recovery: AuthenticationDraft<z.infer<typeof creationSchema>> = useAuthenticationDraft(`stories:${userId}:${projectId}:create`, creationSchema, () => title ? {title} : null);
    const [title, setTitle] = useState(recovery.restored?.title ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function create(event: React.FormEvent) {
        event.preventDefault(); if (!writable || busy || !title.trim()) return;
        setBusy(true); setError("");
        try {
            const item = await api.createItem(projectId, {kind: "requirement", title: title.trim(), body: "", data: {...defaultData("requirement"), processing_state: "raised"}});
            recovery.clear(); onCreated(item);
        } catch (cause) {setError(errorMessage(cause));} finally {setBusy(false);}
    }
    return <Modal title="Story 추가" onClose={onClose}><form onSubmit={event => void create(event)}>
        <p className="muted">제목만으로 추가하고 문제·결과·수용 조건은 상세에서 보완합니다.</p>
        <Field label="Story 제목"><Input autoFocus required maxLength={300} value={title} disabled={!writable || busy} onChange={event => setTitle(event.target.value)} /></Field>
        {error && <ErrorNotice error={error} />}
        <div className="form-actions"><ActionButton type="button" onClick={onClose}>닫기</ActionButton><ActionButton className="primary" disabled={!writable || busy || !title.trim()}>{busy ? "추가 중…" : "Story 추가"}</ActionButton></div>
    </form></Modal>;
}

export function StoryEditor({item, items, userId, onChanged, verificationCurrent, taskProgress, onPlan}: {
    item: Item; items: Item[]; userId: string; onChanged: () => void; verificationCurrent?: boolean;
    taskProgress?: {done: number; total: number}; onPlan?: (item?: Item) => void;
}) {
    const can = useProjectPermissions();
    const writable = can(item.project_id, "item.write");
    const [current, setCurrent] = useState(item);
    const recovery: AuthenticationDraft<z.infer<typeof inlineSchema>> = useAuthenticationDraft(`stories:${userId}:${item.id}:inline`, inlineSchema,
        () => activeField ? {field: activeField, value: draftValue, baseRevision: base.current.revision} : null);
    const [activeField, setActiveField] = useState<string | null>(recovery.restored?.field ?? null);
    const [draftValue, setDraftValue] = useState(recovery.restored?.value ?? "");
    const base = useRef(recovery.restored ? {...item, revision: recovery.restored.baseRevision} : item);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [verifyOpen, setVerifyOpen] = useState(false);
    useEffect(() => {if (item.revision > current.revision) setCurrent(item);}, [item, current.revision]);
    function begin(field: string) {base.current = current; setActiveField(field); setError("");}
    function draft(value: string | null) {
        if (value === null) {setActiveField(null); recovery.clear();} else setDraftValue(value);
    }
    async function save(field: string, value: unknown, inline = false) {
        if (!writable || busy) return;
        const snapshot = inline ? base.current : current;
        setBusy(true); setError("");
        try {
            const updated = await api.saveItem(item.id, {
                expected_revision: snapshot.revision,
                title: field === "title" ? String(value).trim() : snapshot.title,
                body: field === "body" ? value : snapshot.body,
                data: field === "title" || field === "body" ? snapshot.data : {...snapshot.data, [field]: value},
            });
            setCurrent(updated); onChanged();
        } catch (cause) {setError(errorMessage(cause)); throw cause;} finally {setBusy(false);}
    }
    async function confirm() {
        if (!writable || busy || activeField !== null) return;
        setBusy(true); setError("");
        try {setCurrent(await api.confirmItem(current.id, current.revision)); onChanged();}
        catch (cause) {setError(errorMessage(cause));} finally {setBusy(false);}
    }
    function inline(field: string) {
        return {disabled: !writable || busy || activeField !== null && activeField !== field,
            initialDraft: recovery.restored?.field === field ? recovery.restored.value : undefined,
            onBegin: () => begin(field), onDraftChange: draft,
            onSave: (value: string) => save(field, field === "acceptance_criteria" ? value.split("\n").map(line => line.trim()).filter(Boolean) : value, true)};
    }
    const state = storyState(current);
    const criteria = storyCriteria(current);
    return <article className="story-detail">
        <div className="row-head"><Badge value={current.status} /><span className="muted">현재 서버 revision {current.revision}</span>
            {current.status === "draft" && <ActionButton className="small" disabled={!writable || busy || activeField !== null} onClick={() => void confirm()}>자료 확정</ActionButton>}
        </div>
        <h1><InlineTextEdit label="Story 제목" variant="title" required maxLength={300} value={current.title} {...inline("title")} /></h1>
        <div className="story-property-row">
            <Field label="처리 상태"><NativeSelect value={state ?? ""} disabled={!writable || busy || activeField !== null} onChange={event => {void save("processing_state", event.target.value || null).catch(() => undefined);}}>
                <option value="">미설정</option>
                {storyProcessingStateSchema.options.map(value => <option key={value} value={value} disabled={value === "fulfilled"}>{storyStateLabels[value]}{value === "fulfilled" ? " · 검증으로 기록" : ""}</option>)}
            </NativeSelect></Field>
            <Field label="우선순위"><NativeSelect value={String(current.data.priority ?? "medium")} disabled={!writable || busy || activeField !== null} onChange={event => {void save("priority", event.target.value).catch(() => undefined);}}>
                <option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option>
            </NativeSelect></Field>
            {state === "fulfilled" && verificationCurrent === false && <Badge value="in_review" label="재확인 필요" />}
        </div>
        {taskProgress && <p className="muted small">연결 Task 완료 {taskProgress.done}/{taskProgress.total}
            {verificationCurrent !== undefined && <> · 검증된 수용 조건 {verificationCurrent ? criteria.length : 0}/{criteria.length}</>}
        </p>}
        <p className="muted small">처리 상태와 자료의 초안·확정·보관은 별도입니다. 연결 Task의 완료가 Story를 자동 충족시키지 않습니다.</p>
        {error && <ErrorNotice error={error} />}
        <div className="story-content-fields">
            {[["problem", "현재 상태·문제"], ["expected_outcome", "기대 결과"], ["scope", "범위"], ["exclusions", "제외 범위"]].map(([field, label]) => <section key={field}><h2>{label}</h2>
                <InlineBodyEdit label={label!} value={String(current.data[field!] ?? "")} {...inline(field!)} />
            </section>)}
            <section><h2>본문</h2><InlineBodyEdit label="Story 본문" value={current.body} {...inline("body")} /></section>
            <section><h2>수용 조건</h2><InlineBodyEdit label="수용 조건" value={criteria.join("\n")} placeholder="한 줄에 하나씩 확인할 조건을 작성합니다." {...inline("acceptance_criteria")} /></section>
        </div>
        <details className="section-space"><summary>분류·처분·현재 기능 참조</summary>
            <div className="story-property-row section-space">
                <Field label="요구 분류"><NativeSelect value={String(current.data.category ?? "functional")} disabled={!writable || busy || activeField !== null} onChange={event => void save("category", event.target.value).catch(() => undefined)}>
                    <option value="functional">기능</option><option value="nonfunctional">비기능</option>
                </NativeSelect></Field>
                <Field label="처분"><NativeSelect value={String(current.data.disposition ?? "new")} disabled={!writable || busy || activeField !== null} onChange={event => void save("disposition", event.target.value).catch(() => undefined)}>
                    {[["new", "신규"], ["extend", "확장"], ["change", "변경"], ["merge", "통합"], ["duplicate", "중복"], ["conflict", "충돌"], ["defer", "보류"], ["excluded", "제외"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </NativeSelect></Field>
            </div>
            <h3>제외 사유</h3><InlineTextEdit label="제외 사유" value={String(current.data.excluded_reason ?? "")} {...inline("excluded_reason")} />
            <fieldset disabled={!writable || busy || activeField !== null}><legend>현재 기능 참조</legend>
                {items.filter(entry => entry.kind === "feature").map(feature => {
                    const ids = Array.isArray(current.data.feature_ids) ? current.data.feature_ids.filter((id): id is string => typeof id === "string") : [];
                    return <label key={feature.id}><input type="checkbox" checked={ids.includes(feature.id)} onChange={event => void save("feature_ids", event.target.checked ? [...ids, feature.id] : ids.filter(id => id !== feature.id)).catch(() => undefined)} /> {feature.title}</label>;
                })}
                {!items.some(entry => entry.kind === "feature") && <p className="muted">현재 접근 가능한 기능 자료가 없습니다.</p>}
            </fieldset>
        </details>
        <StoryTaskLinks item={current} items={items} onChanged={onChanged} />
        {onPlan && <ActionButton onClick={() => onPlan(current)}>관련 작업 기획</ActionButton>}
        <section className="section-space"><div className="row-head"><h2>수용 조건 검증</h2>
            <ActionButton disabled={!writable || activeField !== null || busy} onClick={() => setVerifyOpen(true)}>검증 결과 기록</ActionButton></div>
            <p className="muted">현재 범위와 수용 조건을 확인한 근거를 기록합니다. 열린 Task가 있어도 검증할 수 있습니다.</p>
            <StoryVerificationHistory item={current} />
        </section>
        <details className="section-space"><summary>전체 관계·근거 revision</summary><Relations item={current} items={items} onChanged={onChanged} /></details>
        {verifyOpen && <StoryVerificationForm item={current} userId={userId} onClose={() => setVerifyOpen(false)} onVerified={updated => {setCurrent(updated); setVerifyOpen(false); onChanged();}} />}
    </article>;
}

function StoryVerificationHistory({item}: {item: Item}) {
    const history = useResource(`story-verification:${item.id}:${item.revision}`, signal => storyApi.verifications(item.id, signal));
    if (history.status === "loading") return <Loading />;
    if (history.status === "error") return <ErrorNotice error={history.error} retry={history.reload} />;
    return <ul className="record-list">{history.data.length ? history.data.map(record => <li key={record.id}>
        <div className="row-head"><span>검증 대상 r{record.item_revision}</span><DateTimeValue value={record.created_at} /></div>
        {record.archived_unverified && <><Badge value="in_review" label="가져온 과거 기록 · 현재 검증에 미포함" /><p className="muted small">원본 검증 이력을 보존한 기록입니다. 현재 Story의 충족 근거로 사용하려면 다시 검증해 주세요.</p></>}
        <p className="preserve-lines">{record.evidence}</p>
        <small className="muted">검증자 {record.actor_id}</small>
        <ul>{record.criterion_results.map((result, index) => <li key={index}>{result.passed ? "통과" : "미충족"} · {result.criterion}{result.evidence && <p>{result.evidence}</p>}</li>)}</ul>
    </li>) : <li className="muted">아직 검증 기록이 없습니다.</li>}</ul>;
}

function StoryVerificationForm({item, userId, onClose, onVerified}: {item: Item; userId: string; onClose: () => void; onVerified: (item: Item) => void}) {
    const can = useProjectPermissions();
    const writable = can(item.project_id, "item.write");
    const recovery: AuthenticationDraft<z.infer<typeof verificationDraftSchema>> = useAuthenticationDraft(`stories:${userId}:${item.id}:verification`, verificationDraftSchema,
        () => evidence || results.some(result => result.passed || result.evidence) ? {revision, evidence, results} : null);
    const [revision, setRevision] = useState(recovery.restored?.revision ?? item.revision);
    const [evidence, setEvidence] = useState(recovery.restored?.evidence ?? "");
    const [results, setResults] = useState(recovery.restored?.results ?? storyCriteria(item).map(criterion => ({criterion, passed: false, evidence: ""})));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const ready = writable && !busy && revision === item.revision && !!evidence.trim() && results.length > 0 && results.every(result => result.passed && !!result.evidence.trim());
    async function verify(event: React.FormEvent) {
        event.preventDefault(); if (!ready) return;
        setBusy(true); setError("");
        try {
            const result = await storyApi.verify(item.id, {expected_revision: revision, evidence, criterion_results: results});
            recovery.clear(); onVerified(result.item);
        } catch (cause) {setError(errorMessage(cause));} finally {setBusy(false);}
    }
    return <Modal title="Story 검증 결과 기록" onClose={onClose}><form onSubmit={event => void verify(event)}>
        <p className="muted">Story r{revision}의 현재 범위와 기대 결과를 확인합니다.</p>
        {revision !== item.revision && <><ErrorNotice error="작성 중 Story가 변경되었습니다. 최신 기준을 다시 확인해 주세요." />
            <ActionButton type="button" onClick={() => {setRevision(item.revision); setResults(storyCriteria(item).map(criterion => ({criterion, passed: false, evidence: ""})));}}>최신 기준으로 다시 확인</ActionButton></>}
        <fieldset disabled={!writable || busy}>
            {results.map((result, index) => <div className="story-criterion" key={index}>
                <label><input type="checkbox" checked={result.passed} onChange={event => setResults(results.map((entry, position) => position === index ? {...entry, passed: event.target.checked} : entry))} /> {result.criterion}</label>
                <Field label={`수용 조건 ${index + 1} 검증 근거`}><Textarea required rows={2} value={result.evidence} onChange={event => setResults(results.map((entry, position) => position === index ? {...entry, evidence: event.target.value} : entry))} /></Field>
            </div>)}
            {!results.length && <p>먼저 Story에 확인할 수용 조건을 하나 이상 작성해 주세요. 각 조건의 검증 근거를 기록한 뒤 충족으로 판정할 수 있습니다.</p>}
            <Field label="종합 검증 근거"><Textarea required rows={4} value={evidence} onChange={event => setEvidence(event.target.value)} /></Field>
        </fieldset>
        {error && <ErrorNotice error={error} />}
        <div className="form-actions"><ActionButton type="button" onClick={onClose}>닫기</ActionButton><ActionButton className="primary" disabled={!ready}>{busy ? "기록 중…" : "충족으로 기록"}</ActionButton></div>
    </form></Modal>;
}
