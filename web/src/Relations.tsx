import { useState } from "react";
import { api, errorMessage } from "./api";
import { useResource } from "./hooks";
import {
    dateLabel, kindLabels, relationLabels, relationSchema, shortId,
} from "./models";
import type { Item, Link } from "./models";
import { Badge, Empty, ErrorNotice, ExternalLink, Field, Loading, RouteLink } from "./ui";

export function itemRoute(item: Item) {
    return { view: item.kind === "task" ? "tasks" : item.kind === "test_case" ? "tests" : item.kind === "artifact" ? "documents" : "planning", kind: item.kind, item: item.id };
}

export function Relations({ item, items, onChanged }: {
    item: Item; items: Item[]; onChanged: () => void;
}) {
    const links = useResource(`links:${item.project_id}`, signal => api.links(item.project_id, signal));
    const [source, setSource] = useState(item.id);
    const [target, setTarget] = useState("");
    const [relation, setRelation] = useState("relates_to");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const all = new Map(items.map(entry => [entry.id, entry]));
    async function add(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true); setError("");
        try {
            await api.createLink(item.project_id, { source_id: source, target_id: target, relation });
            links.reload(); onChanged(); setTarget("");
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    async function remove(link: Link) {
        setBusy(true); setError("");
        try { await api.deleteLink(link.id); links.reload(); onChanged(); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <section>
        <h2>관계와 근거 revision</h2>
        <p className="muted">작업의 선행 관계는 <strong>작업 → 먼저 끝낼 작업</strong> 방향입니다. 테스트가 대상을 검증하는 경우 <strong>테스트 → 요구사항·작업</strong> 방향을 사용합니다.</p>
        {links.status === "loading" && <Loading />}
        {links.status === "error" && <ErrorNotice error={links.error} retry={links.reload} />}
        {links.status === "ready" && <ul className="relation-list">
            {links.data.filter(link => link.source_id === item.id || link.target_id === item.id).map(link => {
                const from = all.get(link.source_id), to = all.get(link.target_id);
                const stale = from?.revision !== link.source_revision || to?.revision !== link.target_revision;
                return <li key={link.id}><div>
                    {from ? <RouteLink patch={itemRoute(from)}>{from.title}</RouteLink> : shortId(link.source_id)}
                    <small>r{link.source_revision} → {relationLabels[link.relation]} → r{link.target_revision}</small>
                    {to ? <RouteLink patch={itemRoute(to)}>{to.title}</RouteLink> : shortId(link.target_id)}
                    {stale && <Badge value="in_review" label="재검토 필요" />}
                </div><button className="small" disabled={busy} onClick={() => { void remove(link); }}>연결 해제</button></li>;
            })}
            {!links.data.some(link => link.source_id === item.id || link.target_id === item.id) && <li className="muted">연결된 관계가 없습니다.</li>}
        </ul>}
        <form onSubmit={event => { void add(event); }} className="section-space">
            <h3>관계 추가</h3>
            <div className="form-grid">
                <Field label="시작 대상"><select required value={source} onChange={event => setSource(event.target.value)}>
                    {items.map(entry => <option key={entry.id} value={entry.id}>{kindLabels[entry.kind]} · {entry.title}</option>)}
                </select></Field>
                <Field label="관계"><select value={relation} onChange={event => setRelation(event.target.value)}>
                    {relationSchema.options.map(value => <option key={value} value={value}>{relationLabels[value]}</option>)}
                </select></Field>
                <Field label="연결 대상"><select required value={target} onChange={event => setTarget(event.target.value)}>
                    <option value="">대상 선택</option>
                    {items.filter(entry => entry.id !== source).map(entry => <option key={entry.id} value={entry.id}>{kindLabels[entry.kind]} · {entry.title}</option>)}
                </select></Field>
            </div>
            {error && <ErrorNotice error={error} />}
            <button type="submit" disabled={busy || !target}>{busy ? "처리 중…" : "관계 저장"}</button>
        </form>
    </section>;
}

export function TestExecutions({ item, onChanged }: { item: Item; onChanged: () => void }) {
    const runs = useResource(`test-runs:${item.project_id}`, signal => api.testRuns(item.project_id, signal));
    const [outcome, setOutcome] = useState("passed");
    const [actual, setActual] = useState("");
    const [environment, setEnvironment] = useState("");
    const [sha, setSha] = useState("");
    const [evidence, setEvidence] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function record(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try {
            await api.createTestRun(item.id, {
                outcome, actual, environment, target_sha: sha, evidence_url: evidence,
            });
            runs.reload(); onChanged(); setActual("");
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
                <div className="row-head"><Badge value={run.outcome} /><span>케이스 r{run.case_revision}</span><time>{dateLabel(run.created_at)}</time>
                    {run.case_revision !== item.revision && <Badge value="in_review" label="과거 케이스 기준" />}</div>
                <p className="preserve-lines">{run.actual}</p>
                <small className="muted">환경 {run.environment || "미기록"} · SHA {run.target_sha || "미기록"}</small>
                {run.evidence_url && <p><ExternalLink href={run.evidence_url}>실행 증빙 ↗</ExternalLink></p>}
            </li>)}</ul>
        </>}
        <form className="section-space" onSubmit={event => { void record(event); }}>
            <h3>새 실행 결과 기록</h3>
            <div className="form-grid">
                <Field label="결과"><select value={outcome} onChange={event => setOutcome(event.target.value)}>
                    <option value="passed">통과</option><option value="failed">실패</option><option value="aborted">중단</option>
                </select></Field>
                <Field label="실행 환경"><input required value={environment} onChange={event => setEnvironment(event.target.value)} placeholder="예: Windows 11 · Chrome 141 · dev" /></Field>
            </div>
            <Field label="실제 실행 결과"><textarea required rows={4} value={actual} onChange={event => setActual(event.target.value)} placeholder="관찰한 결과와 실패·중단 사유를 기록해 주세요." /></Field>
            <div className="form-grid">
                <Field label="대상 commit SHA"><input required maxLength={128} value={sha} onChange={event => setSha(event.target.value)} /></Field>
                <Field label="로그·증빙 URL"><input type="url" value={evidence} onChange={event => setEvidence(event.target.value)} /></Field>
            </div>
            {error && <ErrorNotice error={error} />}
            <button type="submit" className="primary" disabled={busy}>{busy ? "기록 중…" : "실행 결과 저장"}</button>
        </form>
    </section>;
}
