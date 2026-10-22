import { useEffect, useState } from "react";
import { z } from "zod";
import { api, errorMessage } from "./api";
import { loadDraft, navigate, removeDraft, storeDraft, useResource } from "./hooks";
import type { Resource, Route } from "./hooks";
import {
    artifactDefinition, dateLabel, defaultData, operationLabels, operationSchema, shortId,
} from "./models";
import type { Bundle, Catalog, Item, Operation, Runtime, SkillRun } from "./models";
import { ArtifactFields } from "./ItemFields";
import { itemRoute } from "./Relations";
import { Card, CardContent } from "./pydemia-ui/card";
import { Checkbox } from "./pydemia-ui/checkbox";
import { NativeSelect } from "./pydemia-ui/native-select";
import { SearchInput } from "./pydemia-ui/search-input";
import { SideNav } from "./pydemia-ui/navigation";
import { Textarea } from "./pydemia-ui/textarea";
import {
    ActionButton, Badge, Empty, ErrorNotice, Field, Loading, Markdown, PageHead,
    RouteLink, StringList,
} from "./ui";

function operationSkills(operation: Operation): string {
    if (operation === "analyze_idea") return "requirements-authoring requirements-verification";
    if (operation === "review_document") return "document-review requirements-verification";
    if (operation === "plan") return "development-workflow requirements-verification";
    return "document-writing-workflow";
}
const runDraftSchema = z.object({
    operation: operationSchema, target: z.string(),
    sourceIds: z.array(z.string().uuid()),
    manifest: z.record(z.string(), z.unknown()),
});

export function RunsPage({ projectId, userId, route, items, catalog, runtime, onRuntimeReload, onChanged }: {
    projectId: string; userId: string; route: Route; items: Item[];
    catalog?: Catalog; runtime: Resource<Runtime>; onRuntimeReload: () => void;
    onChanged: () => void;
}) {
    const runs = useResource(`runs:${projectId}`, signal => api.runs(projectId, signal));
    const [query, setQuery] = useState("");
    const visibleRuns = runs.status === "ready" ? runs.data.filter(run =>
        `${operationLabels[run.operation]} ${run.instruction} ${run.status}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : [];
    return <>
        <PageHead title="스킬 작업" description="원문 bundle과 근거를 고정해 실행하고, 결과를 검토한 뒤 선택 적용합니다.">
            <RouteLink className="button primary" patch={{ run: "new", item: "" }}>+ 새 실행</RouteLink>
            <ActionButton onClick={runs.reload}>이력 새로고침</ActionButton>
        </PageHead>
        <div className={`document-layout run-layout ${route.run ? "has-selection" : ""}`}>
            <Card className="doclist workspace-collection" aria-label="스킬 실행 이력"><CardContent><div className="workspace-list-heading"><h2>실행 이력</h2><span>{visibleRuns.length}개</span></div>
                <SearchInput label="실행 이력 검색" value={query} onValueChange={setQuery} onSearch={() => undefined} variant="toolbar" placeholder="작업 종류·요청·상태 검색" />
                {runs.status === "loading" && <Loading />}
                {runs.status === "error" && <ErrorNotice error={runs.error} retry={runs.reload} />}
                {runs.status === "ready" && <SideNav aria-label="스킬 실행 항목" className="doc-list-items">
                    {!runs.data.length && <p className="muted">아직 실행한 작업이 없습니다.</p>}
                    {!!runs.data.length && !visibleRuns.length && <p className="muted">일치하는 실행 이력이 없습니다.</p>}
                    {[...visibleRuns].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(run => <RouteLink key={run.id} patch={{ run: run.id }} appearance="side" className="doc-item" current={route.run === run.id}>
                        <strong>{operationLabels[run.operation]}</strong><small className="truncate-two">{run.instruction}</small><Badge value={run.status} /><small>{dateLabel(run.created_at)}</small>
                    </RouteLink>)}
                </SideNav>}</CardContent></Card>
            <Card className="document-main workspace-detail"><CardContent>
                {route.run && <ActionButton className="mobile-detail-back" type="button" onClick={() => navigate({ run: "", item: "" })}>← 실행 이력</ActionButton>}
                {route.run && route.run !== "new" ? <RunDetail key={route.run} runId={route.run} projectId={projectId} userId={userId} items={items} onStatusChanged={runs.reload} onChanged={() => { runs.reload(); onChanged(); }} /> : <RunComposer key={`${projectId}:${route.item}`} projectId={projectId} userId={userId} targetId={route.item} items={items} catalog={catalog} runtime={runtime} onRuntimeReload={onRuntimeReload} onCreated={run => { runs.reload(); navigate({ run: run.id }); }} />}</CardContent></Card>
        </div>
    </>;
}

function RunComposer({ projectId, userId, targetId, items, catalog, runtime, onRuntimeReload, onCreated }: {
    projectId: string; userId: string; targetId: string; items: Item[];
    catalog?: Catalog; runtime: Resource<Runtime>; onRuntimeReload: () => void;
    onCreated: (run: SkillRun) => void;
}) {
    const initialTarget = items.find(item => item.id === targetId);
    const key = `projects:run-draft:${userId}:${projectId}:${targetId || "new"}`;
    const [saved] = useState(() => loadDraft(key));
    const [savedSettings] = useState(() => {
        const parsed = runDraftSchema.safeParse(saved?.data);
        return parsed.success ? parsed.data : null;
    });
    const [operation, setOperation] = useState<Operation>(() => savedSettings?.operation ?? (initialTarget?.kind === "idea" ? "analyze_idea" : initialTarget?.kind === "artifact" ? "revise_document" : initialTarget ? "plan" : "write_document"));
    const [target, setTarget] = useState(() => savedSettings && items.some(item => item.id === savedSettings.target) ? savedSettings.target : initialTarget?.id ?? "");
    const [instruction, setInstruction] = useState(saved?.body ?? "");
    const [skillText, setSkillText] = useState(saved?.title ?? operationSkills(operation));
    const [sourceIds, setSourceIds] = useState<string[]>(() => savedSettings ? savedSettings.sourceIds.filter(id => items.some(item => item.id === id)) : initialTarget ? [initialTarget.id] : []);
    const [manifest, setManifest] = useState<Record<string, unknown>>(savedSettings?.manifest ?? (initialTarget?.kind === "artifact" ? initialTarget.data : defaultData("artifact")));
    const [storageAvailable, setStorageAvailable] = useState(true);
    const [bundles, setBundles] = useState<Bundle[]>([]);
    const [resolvedKey, setResolvedKey] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const selectedTarget = items.find(item => item.id === target);
    const targetRequired = operation === "analyze_idea" || operation === "revise_document" || operation === "review_document";
    const eligibleTargets = items.filter(item => operation === "analyze_idea" ? item.kind === "idea" : operation === "revise_document" || operation === "review_document" || operation === "write_document" ? item.kind === "artifact" : true);
    const skills = [...new Set(skillText.split(/[,\s]+/).map(value => value.trim()).filter(Boolean))];
    const skillKey = skills.join(",");
    const kind = artifactDefinition(catalog, manifest.artifact_type);
    useEffect(() => {
        if (!instruction && !skillText) return;
        setStorageAvailable(storeDraft(key, {
            title: skillText, body: instruction,
            data: { operation, target, sourceIds, manifest },
            baseRevision: 0, savedLocallyAt: new Date().toISOString(),
        }));
    }, [key, instruction, skillText, operation, target, sourceIds, manifest]);
    async function resolve() {
        setBusy(true); setError("");
        try {
            const response = await api.resolve(skills);
            setBundles(response.bundles); setResolvedKey(skillKey);
        } catch (error) { setError(errorMessage(error)); setBundles([]); setResolvedKey(""); }
        finally { setBusy(false); }
    }
    async function start(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try {
            if (resolvedKey !== skillKey) {
                const response = await api.resolve(skills);
                setBundles(response.bundles); setResolvedKey(skillKey);
            }
            const run = await api.createRun(projectId, {
                operation, instruction, target_id: target || null, skill_ids: skills,
                source_ids: sourceIds,
                reference_manifest: selectedTarget?.kind === "artifact" ? selectedTarget.data : manifest,
            });
            removeDraft(key); onCreated(run);
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <section><h2>새 스킬 작업</h2>
        {!storageAvailable && <p className="notice" role="status">이 브라우저에 실행 요청 초안을 보관하지 못했습니다. 페이지를 닫기 전에 요청을 복사해 주세요.</p>}
        {runtime.status === "loading" && <Loading label="실행 공급자 설정 확인 중…" />}
        {runtime.status === "error" && <ErrorNotice error={runtime.error} retry={onRuntimeReload} />}
        {runtime.status === "ready" && <div className={`notice ${runtime.data.configured ? "runtime-ready" : ""}`}>
            <strong>{runtime.data.configured ? `실행 공급자 · ${runtime.data.provider === "codex_login" ? "현재 Codex 로그인" : runtime.data.provider === "openai_compatible" ? "OpenAI 호환 API" : runtime.data.provider} / ${runtime.data.model || "Codex 기본 모델"}` : "LLM 실행 공급자가 설정되지 않았습니다."}</strong>
            <p>{runtime.data.configured ? `지원 기능: ${runtime.data.capabilities.join(", ") || "공급자가 별도로 제공하지 않음"}` : "서버의 projects.local.yaml에서 Codex 로그인 또는 OpenAI 호환 API를 설정한 뒤 실행할 수 있습니다. 메모와 수동 편집·저장은 계속 사용할 수 있습니다."}</p><ActionButton className="small" onClick={onRuntimeReload}>설정 다시 확인</ActionButton>
        </div>}
        <form onSubmit={event => { void start(event); }}>
            <div className="form-grid">
                <Field label="작업 종류"><NativeSelect value={operation} onChange={event => {
                    const next = operationSchema.parse(event.target.value);
                    if (skillText.split(/[,\s]+/).filter(Boolean).join(" ") === operationSkills(operation)) setSkillText(operationSkills(next));
                    setOperation(next);
                    const chosen = items.find(item => item.id === target);
                    if ((next === "analyze_idea" && chosen?.kind !== "idea") ||
                        (["write_document", "revise_document", "review_document"].includes(next) && chosen?.kind !== "artifact")) setTarget("");
                }}>
                    {operationSchema.options.map(value => <option key={value} value={value}>{operationLabels[value]}</option>)}
                </NativeSelect></Field>
                <Field label="대상"><NativeSelect required={targetRequired} value={target} onChange={event => {
                    setTarget(event.target.value);
                    const next = items.find(item => item.id === event.target.value);
                    if (next?.kind === "artifact") setManifest(next.data);
                }}>
                    <option value="">{targetRequired ? operation === "analyze_idea" ? "요건화할 아이디어 선택" : "수정·검수할 임시 문서 선택" : "새 임시 Markdown 문서 · 기존 대상 없음"}</option>
                    {eligibleTargets.map(item => <option key={item.id} value={item.id}>{item.title} · r{item.revision}</option>)}
                </NativeSelect></Field>
            </div>
            {selectedTarget && <p className="hint">대상 기준: {selectedTarget.title} · r{selectedTarget.revision}. 결과 적용 시 서버가 이 revision을 다시 검사합니다.</p>}
            <Field label="작업 요청" hint="목적·보존할 내용·수정 범위·검수할 항목을 구체적으로 적어 주세요."><Textarea required rows={6} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="선택한 근거의 의미를 보존해 초안을 작성하고, 미확인 가정과 질문을 구분해 주세요." /></Field>
            <Field label="스킬 ID" hint="쉼표 또는 공백으로 구분합니다. 실행 시 원문 bundle과 revision을 고정합니다."><Textarea required rows={2} value={skillText} onChange={event => setSkillText(event.target.value)} /></Field>
            {kind && <div className="actions small"><span className="muted">문서 종류 추천:</span>{[kind.suggested_primary_skill, kind.review_skill, kind.verification_skill].map(skill => <ActionButton type="button" className="small" key={skill} onClick={() => setSkillText([...new Set([...skills, skill])].join("\n"))}>+ {skill}</ActionButton>)}</div>}
            <div className="section-space"><ActionButton type="button" disabled={busy || !skills.length} onClick={() => { void resolve(); }}>{busy ? "처리 중…" : "스킬 원문 bundle 확인"}</ActionButton>
                {bundles.length > 0 && resolvedKey === skillKey && <details className="reference-details" open><summary>확인한 고정 bundle · {bundles.length}개</summary>{bundles.map(bundle => <div className="bundle-row" key={bundle.id}><strong>{bundle.id}</strong><small>source revision: {bundle.source_revision}</small><small>cache: {bundle.cache_key}</small><ul>{bundle.files.map(file => <li key={file.path}><span>{file.path}</span><code>{file.sha256}</code></li>)}</ul></div>)}</details>}
            </div>
            <fieldset className="section-space"><legend>실행에 사용할 프로젝트 근거</legend><p className="hint">대상과 선택 근거를 현재 revision으로 고정합니다. 아이디어 요건화에서는 프로젝트의 기존 기능·요건도 함께 대조합니다.</p><div className="check-list source-list">
                {items.map(item => {
                    const automatic = (operation === "analyze_idea" && (item.kind === "feature" || item.kind === "requirement")) || item.id === target;
                    return <Checkbox key={item.id} variant="card" label={item.title}
                        description={`${shortId(item.id)} · r${item.revision}${automatic ? " · 자동 포함" : ""}`}
                        checked={automatic || sourceIds.includes(item.id)} disabled={automatic}
                        onCheckedChange={checked => setSourceIds(checked === true ? [...sourceIds, item.id] : sourceIds.filter(id => id !== item.id))} />;
                })}
                {!items.length && <p className="muted">프로젝트 근거 없이 요청한 내용으로 실행합니다. 확인이 필요한 부분은 결과에서 검토해 주세요.</p>}
            </div></fieldset>
            {selectedTarget?.kind === "artifact" ? <details className="reference-details"><summary>대상 문서의 양식·참조 manifest</summary><pre>{JSON.stringify(selectedTarget.data, null, 2)}</pre><p className="hint">대상 문서의 편집 화면에서 참조를 변경할 수 있습니다.</p></details> : <details className="reference-details"><summary>문서 종류와 양식·예시 참조 선택</summary><ArtifactFields data={manifest} onChange={setManifest} catalog={catalog} items={items} /></details>}
            {error && <ErrorNotice error={error} />}
            <div className="form-actions"><span className="muted small">결과를 검토하기 전에는 기존 본문을 변경하지 않습니다.</span><ActionButton className="primary" type="submit" disabled={busy || !instruction.trim() || !skills.length || (targetRequired && !target) || runtime.status !== "ready" || !runtime.data.configured}>{busy ? "실행 등록 중…" : "스킬 실행"}</ActionButton></div>
        </form>
    </section>;
}

function RunDetail({ runId, projectId, userId, items, onChanged, onStatusChanged }: {
    runId: string; projectId: string; userId: string; items: Item[];
    onChanged: () => void; onStatusChanged: () => void;
}) {
    const run = useResource(`run:${runId}`, signal => api.run(runId, signal));
    const [indices, setIndices] = useState<number[]>([]);
    const [applyDocument, setApplyDocument] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [pollExpired, setPollExpired] = useState(false);
    const activeStatus = run.status === "ready" ? run.data.status : "";
    useEffect(() => {
        if (activeStatus) onStatusChanged();
    }, [activeStatus, onStatusChanged]);
    useEffect(() => {
        if (activeStatus !== "queued" && activeStatus !== "running") return;
        let polls = 0;
        const interval = window.setInterval(() => {
            if (++polls > 150) { window.clearInterval(interval); setPollExpired(true); return; }
            run.reload();
        }, 2000);
        return () => window.clearInterval(interval);
    }, [activeStatus, run.reload]);
    async function action(action: "cancel" | "retry") {
        setBusy(true); setError(""); setNotice("");
        try { await api.runAction(runId, action); run.reload(); onChanged(); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    async function apply() {
        setBusy(true); setError(""); setNotice("");
        try {
            const result = await api.applyRun(runId, indices, applyDocument);
            if (result.status === "applied") setNotice("선택한 결과를 새 초안으로 저장했습니다.");
            run.reload(); onChanged();
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    if (run.status === "loading") return <Loading />;
    if (run.status === "error") return <ErrorNotice error={run.error} retry={run.reload} />;
    const data = run.data;
    if (data.project_id !== projectId) return <ErrorNotice error="현재 프로젝트의 실행이 아닙니다." />;
    const result = data.result;
    const target = items.find(item => item.id === data.target_id);
    const hasLocalDraft = data.target_id ? !!loadDraft(`projects:draft:${userId}:${projectId}:${data.target_id}`) : false;
    return <section>
        <div className="doc-heading"><div><div className="eyebrow">SKILL RUN · {shortId(data.id)}</div><h2>{operationLabels[data.operation]}</h2><div className="doc-meta"><Badge value={data.status} /><time>{dateLabel(data.updated_at)}</time></div></div><div className="actions"><ActionButton className="small" onClick={run.reload}>최신 상태 확인</ActionButton>
            {(data.status === "queued" || data.status === "running") && <ActionButton disabled={busy} onClick={() => { void action("cancel"); }}>실행 취소</ActionButton>}
            {data.status === "review_ready" && <ActionButton disabled={busy} onClick={() => { void action("cancel"); }}>결과 취소</ActionButton>}
            {(data.status === "failed" || data.status === "cancelled") && <ActionButton disabled={busy} onClick={() => { void action("retry"); }}>다시 실행</ActionButton>}
        </div></div>
        {error && <ErrorNotice error={error} />}
        {notice && <p className="success-message" role="status">{notice}</p>}
        {data.error && <ErrorNotice error={data.error} />}
        {pollExpired && <p className="notice">자동 갱신을 5분 후 중단했습니다. ‘최신 상태 확인’으로 현재 실행 상태를 다시 불러올 수 있습니다.</p>}
        {(data.status === "queued" || data.status === "running") && <p role="status" className="notice">{data.status === "queued" ? "서버 실행을 기다리고 있습니다." : "서버에서 스킬을 실행하고 있습니다."} 결과가 올 때까지 문서 본문은 바뀌지 않습니다.</p>}
        <section className="run-request"><h3>작업 요청</h3><p className="preserve-lines">{data.instruction}</p><p className="hint">대상: {target?.title ?? (data.target_id ? shortId(data.target_id) : "새 임시 Markdown 문서")} {data.target_revision !== null && `· r${data.target_revision}`}</p></section>
        <details className="reference-details"><summary>고정 스킬·입력 근거·참조 manifest</summary><h3>skills.lock</h3><pre>{JSON.stringify(data.skills_lock, null, 2)}</pre><h3>입력 revision</h3><pre>{JSON.stringify(data.source_snapshots, null, 2)}</pre><h3>참조 manifest</h3><pre>{JSON.stringify(data.reference_manifest, null, 2)}</pre></details>
        {result ? <>
            {result.document !== null && <section className="run-result section-space"><div className="section-head"><h2>문서 제안</h2>{data.status === "review_ready" && <Checkbox variant="card" label="이 문서 결과 적용 선택" checked={applyDocument} onCheckedChange={checked => setApplyDocument(checked === true)} />}</div>
                <Markdown body={result.document} />
                {target && <details className="reference-details"><summary>현재 저장한 본문과 비교</summary><div className="comparison"><div><h3>현재 본문 · r{target.revision}</h3><pre>{target.body}</pre></div><div><h3>실행 제안</h3><pre>{result.document}</pre></div></div></details>}
            </section>}
            {result.review && <section className="section-space"><h2>검수·리뷰 결과</h2><Markdown body={result.review} /></section>}
            {result.requirements.length > 0 && <section className="section-space"><h2>요건·변경 후보 · {result.requirements.length}건</h2>
                <p className="hint">선택한 후보만 요건·설계 변경 요청·작업·테스트 초안으로 연결합니다. 충돌·보류는 결정 기록까지만 남깁니다.</p>
                <div className="proposal-list">{result.requirements.map((candidate, index) => <article className="proposal" key={`${index}:${candidate.title}`}>
                    {data.status === "review_ready" && <Checkbox aria-label={`${candidate.title} 채택 후보로 선택`} checked={indices.includes(index)} onCheckedChange={checked => setIndices(checked === true ? [...indices, index] : indices.filter(value => value !== index))} />}
                    <div><div className="row-head"><h3>{candidate.title}</h3><Badge value={candidate.disposition} /></div><Markdown body={candidate.body} /><p className="muted">판정 이유: {candidate.rationale}</p><h4>수용 조건</h4><StringList values={candidate.acceptance_criteria} />
                        <details><summary>연결할 설계 변경 {candidate.design_changes.length} · 작업 {candidate.tasks.length} · 테스트 {candidate.tests.length}</summary><h4>설계 변경</h4><ul>{candidate.design_changes.map((change, at) => <li key={at}>{items.find(item => item.id === change.artifact_id)?.title ?? shortId(change.artifact_id)} · {change.instruction}</li>)}</ul>
                            <h4>작업</h4>{candidate.tasks.map((task, at) => <div key={at}><strong>{task.title}</strong><p>{task.body}</p><StringList values={task.acceptance_criteria} /></div>)}
                            <h4>테스트</h4>{candidate.tests.map((test, at) => <div key={at}><strong>{test.title}</strong><StringList values={test.steps} /><p>기대 결과: {test.expected}</p></div>)}</details>
                    </div>
                </article>)}</div>
            </section>}
            <div className="form-grid section-space"><section><h3>미확인 가정</h3><StringList values={result.assumptions} /></section><section><h3>미해결 질문</h3><StringList values={result.questions} /></section></div>
            <section><h3>결과가 참조한 근거</h3><ul className="text-list">{result.source_ids.map(id => { const item = items.find(item => item.id === id); return <li key={id}>{item ? <RouteLink patch={itemRoute(item)}>{item.title}</RouteLink> : shortId(id)}</li>; })}</ul></section>
            {data.status === "review_ready" && (result.document !== null || result.requirements.length > 0 || (data.operation === "review_document" && !!result.review.trim())) && <div className="apply-area">
                {hasLocalDraft && <p className="notice">대상 문서의 미저장 초안이 이 브라우저에 있습니다. 적용 후에도 내 초안을 보존하며, 이후 저장 시 revision 충돌을 확인해야 합니다.</p>}
                <p className="hint">적용 결과는 새 초안으로 저장합니다.</p>
                <ActionButton className="primary" disabled={busy || (!applyDocument && indices.length === 0 && data.operation !== "review_document")} onClick={() => { void apply(); }}>{busy ? "적용 중…" : data.operation === "review_document" ? "검수 결과 기록" : applyDocument ? "선택한 결과를 초안으로 저장" : `선택 후보 ${indices.length}건 적용`}</ActionButton>
            </div>}
        </> : data.status !== "running" && data.status !== "queued" && <Empty title="확인할 생성 결과가 없습니다."><p>실패·취소되었거나 아직 결과가 저장되지 않은 실행입니다.</p></Empty>}
        {data.applied_ids.length > 0 && <section className="section-space"><h3>적용으로 생성·수정한 항목</h3><ul className="text-list">{data.applied_ids.map(id => { const item = items.find(item => item.id === id); return <li key={id}>{item ? <RouteLink patch={itemRoute(item)}>{item.title}</RouteLink> : shortId(id)}</li>; })}</ul></section>}
    </section>;
}
