import { useState } from "react";
import { api, errorMessage } from "./api";
import { navigate, useResource } from "./hooks";
import { dateLabel, kindLabels, relationLabels, shortId } from "./models";
import type { Item, Link, Project } from "./models";
import { itemRoute } from "./Relations";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Card, CardContent } from "./pydemia-ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./pydemia-ui/accordion";
import { MetricCard } from "./pydemia-ui/metric-card";
import { SegmentedControl, SegmentedControlItem } from "./pydemia-ui/segmented-control";
import { Table, TableCell, TableHead } from "./pydemia-ui/table";
import { Textarea } from "./pydemia-ui/textarea";
import {
    ActionButton, Badge, Empty, ErrorNotice, Field, Loading, Modal, PageHead, RouteLink,
} from "./ui";

export function Overview({ project, items, revision }: {
    project: Project; items: Item[]; revision: number;
}) {
    const summary = useResource(`summary:${project.id}:${revision}`, signal => api.summary(project.id, signal));
    const activeTasks = items.filter(item => item.kind === "task" && item.data.state !== "done" && item.data.state !== "cancelled");
    const recent = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
    return <>
        <PageHead title={project.name} description={project.goal || "목표를 정리하며 프로젝트를 시작해 보세요."} eyebrow="PROJECT OVERVIEW">
            <RouteLink className="button primary" patch={{ view: "planning", kind: "idea", item: "", q: "" }}>아이디어 작성</RouteLink>
            <RouteLink className="button" patch={{ view: "runs", run: "", item: "" }}>스킬 작업</RouteLink>
        </PageHead>
        <Card variant="subtle" className="scope-note"><CardContent><strong>현재 프로젝트 전체</strong><span className="muted">{project.profile === "simple" ? "간편 프로필" : project.profile === "standard" ? "표준 프로필" : project.profile} · {items.length}개 업무 객체</span>
            <p>요건·문서·작업·테스트는 각각의 근거와 상태로 관리합니다. 기준선은 추적·변경 화면에서 확인할 수 있습니다.</p>
        </CardContent></Card>
        {project.repository_url && <RepositoryHistory project={project} />}
        {!project.repository_url && project.repository_imported_at && project.repository_kind && <Card className="overview-panel repository-history"><CardContent><section>
            <h2>Git ZIP에서 시작</h2>
            <p className="muted small">{project.repository_path || "ZIP 전체"} · {project.repository_kind} · {project.repository_manifest || "package 근거 없음"}</p>
            <p className="muted small">ZIP에는 commit·PR 이력이 없습니다. 분석한 ZIP의 파일명과 SHA-256은 시작 메모에서 확인할 수 있습니다.</p>
        </section></CardContent></Card>}
        {summary.status === "loading" && <Loading />}
        {summary.status === "error" && <ErrorNotice error={summary.error} retry={summary.reload} />}
        {summary.status === "ready" && <>
            <div className="metrics">
                <Metric label="작업 완료" done={summary.data.tasks.done} total={summary.data.tasks.total} note={`취소 ${summary.data.tasks.cancelled}건 제외 · 서버 집계`} />
                <MetricCard label="임시 문서" value={summary.data.artifacts.total} detail="Note 연계 예정 · 확정률 집계 제외" />
                <Metric label="테스트 통과" done={summary.data.tests.passed} total={summary.data.tests.total} note="현재 케이스 기준 · 미실행은 통과 제외" />
            </div>
            <div className="overview-grid"><Card className="overview-panel"><CardContent><section><div className="section-head"><h2>다음에 확인할 일</h2><RouteLink patch={{ view: "tasks", item: "", q: "" }}>작업 전체</RouteLink></div>
                {summary.data.needs_review > 0 && <div className="attention-row"><span className="number">검토</span><div><strong>근거 변경 검토 {summary.data.needs_review}건</strong><p>연결한 revision과 현재 내용이 달라진 대상을 확인해 주세요.</p></div><RouteLink className="button small" patch={{ view: "trace", item: "" }}>영향 확인</RouteLink></div>}
                {!items.length && <Empty title="첫 메모를 남길 준비가 되었습니다."><p>아이디어를 적거나 임시 Markdown 문서를 작성하고 스킬로 구체화할 수 있습니다.</p></Empty>}
                {activeTasks.slice(0, 5).map((task, index) => <div className="attention-row" key={task.id}><span className="number">{String(index + 1).padStart(2, "0")}</span><div><RouteLink patch={itemRoute(task)}>{task.title}</RouteLink><p><Badge value={task.kind === "task" ? task.data.state : task.status} /> · r{task.revision}</p></div><RouteLink className="button small" patch={itemRoute(task)}>열기</RouteLink></div>)}
                {!!items.length && !activeTasks.length && <p className="muted">진행할 작업이 없습니다. 요구사항과 테스트 근거를 함께 확인해 주세요.</p>}
            </section></CardContent></Card><Card className="overview-panel"><CardContent><section><h2>최근 편집</h2><ul className="activity">{recent.map(item => <li key={item.id}><RouteLink patch={itemRoute(item)}>{item.title}</RouteLink><small>{kindLabels[item.kind]} · r{item.revision} · {dateLabel(item.updated_at)}</small></li>)}</ul>{!recent.length && <p className="muted">아직 작성한 항목이 없습니다.</p>}</section></CardContent></Card></div>
        </>}
    </>;
}
function RepositoryHistory({ project }: { project: Project }) {
    const history = useResource(`repository-activity:${project.id}`, signal => api.repositoryActivity(project.id, signal));
    return <Card className="overview-panel repository-history"><CardContent><section>
        <div className="section-head"><h2>GitHub 작업 이력</h2><a href={project.repository_url ?? "#"} target="_blank" rel="noopener noreferrer">저장소 열기 ↗</a></div>
        <p className="muted small">{project.repository_path || "저장소 전체"} · {project.repository_branch} · {project.repository_sha?.slice(0, 10)} · {project.repository_manifest || "package 근거 없음"}</p>
        <p className="muted small">이관 당시 최근 commit·PR의 읽기 전용 기록입니다. PR은 저장소 전체 범위입니다.</p>
        {history.status === "loading" && <Loading />}
        {history.status === "error" && <ErrorNotice error={history.error} retry={history.reload} />}
        {history.status === "ready" && <><ul className="activity">{history.data.map(row => <li key={row.id}><a href={row.url} target="_blank" rel="noopener noreferrer">{row.kind === "pr" ? "PR" : "commit"} · {row.title}</a><small>{row.state} · {dateLabel(row.occurred_at)}</small></li>)}</ul>{!history.data.length && <p className="muted">가져온 commit·PR이 없습니다.</p>}</>}
    </section></CardContent></Card>;
}
function Metric({ label, done, total, note }: { label: string; done: number; total: number; note: string }) {
    const percentage = total ? Math.round(done / total * 100) : 0;
    return <MetricCard label={label} value={total ? `${percentage}%` : "미정의"} change={`${done} / ${total}`} detail={note} />;
}

export function TracePage({ projectId, items, baselineId, onChanged, revision }: {
    projectId: string; items: Item[]; baselineId: string;
    onChanged: () => void; revision: number;
}) {
    const trace = useResource(`trace:${projectId}:${revision}`, signal => api.trace(projectId, signal));
    const baselines = useResource(`baselines:${projectId}:${revision}`, signal => api.baselines(projectId, signal));
    const [review, setReview] = useState<Link | null>(null);
    const [impact, setImpact] = useState("none");
    const [traceFilter, setTraceFilter] = useState("all");
    const [reason, setReason] = useState("");
    const [baselineName, setBaselineName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const all = new Map(items.map(item => [item.id, item]));
    const traceRows = trace.status === "ready" ? trace.data.requirements.filter(row => {
        if (traceFilter === "review") return row.needs_review;
        if (traceFilter === "missing") return !row.links.some(link =>
            [link.source_id, link.target_id].some(id => id !== row.item.id && all.has(id)));
        return true;
    }) : [];
    const baseline = baselines.status === "ready" ? baselines.data.find(entry => entry.id === baselineId) : undefined;
    async function recordReview(event: React.FormEvent) {
        event.preventDefault(); if (!review) return;
        const source = all.get(review.source_id), target = all.get(review.target_id);
        if (!source || !target) { setError("현재 프로젝트에서 관계의 양쪽 대상을 찾을 수 없습니다."); return; }
        setBusy(true); setError("");
        try {
            await api.reviewLink(review.id, { expected_source_revision: source.revision, expected_target_revision: target.revision, impact, reason });
            setReview(null); setReason(""); trace.reload(); onChanged();
            setNotice(impact === "none" ? "영향 없음 판정을 현재 revision에 기록했습니다." : "조치 필요 판정을 기록했습니다. 후속 조치 전까지 재검토 상태를 유지합니다.");
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    async function createBaseline(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try {
            const created = await api.createBaseline(projectId, baselineName.trim());
            setBaselineName(""); baselines.reload(); navigate({ baseline: created.id });
            setNotice("현재 revision 묶음을 기준선으로 저장했습니다."); onChanged();
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <>
        <PageHead title="추적·변경" description="요구사항의 연결과 근거 변경을 확인하고, 판단 이유와 기준선을 남깁니다." />
        {notice && <p className="success-message" role="status">{notice}</p>}
        {error && !review && <ErrorNotice error={error} />}
        {trace.status === "loading" && <Loading />}
        {trace.status === "error" && <ErrorNotice error={trace.error} retry={trace.reload} />}
        {trace.status === "ready" && <>
            <div className="section-head"><h2>요구사항 연결표</h2><span className="muted">{traceRows.length} / {trace.data.requirements.length}건</span></div>
            <SegmentedControl label="연결표 필터" name="trace-filter" value={traceFilter} onValueChange={setTraceFilter} className="trace-filters">
                <SegmentedControlItem value="all">전체</SegmentedControlItem>
                <SegmentedControlItem value="review">재검토 필요</SegmentedControlItem>
                <SegmentedControlItem value="missing">연결 없음</SegmentedControlItem>
            </SegmentedControl>
            <Card className="trace-panel"><CardContent><div className="tablewrap"><Table className="trace-table"><thead><tr><TableHead>요구사항</TableHead><TableHead>설계·문서</TableHead><TableHead>구현 작업</TableHead><TableHead>검증 케이스</TableHead><TableHead>현재 상태</TableHead></tr></thead><tbody>
                {traceRows.map(row => {
                    const connected = [...new Set(row.links.flatMap(link => [link.source_id, link.target_id]))].filter(id => id !== row.item.id).flatMap(id => { const item = all.get(id); return item ? [item] : []; });
                    const renderKinds = (kinds: string[]) => connected.filter(item => kinds.includes(item.kind)).map(item => <div className="trace-cell-link" key={item.id}><RouteLink patch={itemRoute(item)}>{item.title}</RouteLink><small>r{item.revision}</small></div>);
                    return <tr key={row.item.id}><TableCell><RouteLink patch={itemRoute(row.item)}><strong>{row.item.title}</strong></RouteLink><small className="cell-sub">{shortId(row.item.id)} · r{row.item.revision}</small></TableCell><TableCell>{renderKinds(["artifact"]).length ? renderKinds(["artifact"]) : <span className="muted">연결 없음</span>}</TableCell><TableCell>{renderKinds(["task"]).length ? renderKinds(["task"]) : <span className="muted">연결 없음</span>}</TableCell><TableCell>{renderKinds(["test_case"]).length ? renderKinds(["test_case"]) : <span className="muted">연결 없음</span>}</TableCell><TableCell>{row.needs_review ? <Badge value="in_review" label="재검토 필요" /> : <Badge value="draft" label="근거 변경 없음" />}</TableCell></tr>;
                })}
            </tbody></Table></div></CardContent></Card>
            {!!trace.data.requirements.length && !traceRows.length && <Empty title="조건에 맞는 요구사항이 없습니다."><p>다른 필터를 선택해 연결 현황을 확인해 주세요.</p></Empty>}
            {!trace.data.requirements.length && <Empty title="등록된 요구사항이 없습니다."><RouteLink patch={{ view: "planning", kind: "requirement", item: "" }}>요구사항 작성으로 이동</RouteLink></Empty>}
            <section className="section-space"><h2>변경 영향 검토 · {trace.data.stale_links.length}건</h2>
                <p className="hint">연결 누락과 영향 검토 완료는 서로 다릅니다. ‘근거 변경 없음’은 구현·검증 완료를 뜻하지 않습니다.</p>
                <ul className="relation-list">{trace.data.stale_links.map(link => <li key={link.id}><div><strong>{all.get(link.source_id)?.title ?? shortId(link.source_id)}</strong><small>r{link.source_revision} → {relationLabels[link.relation]} → r{link.target_revision}</small><span>{all.get(link.target_id)?.title ?? shortId(link.target_id)}</span><small>현재 r{all.get(link.source_id)?.revision ?? "?"} → r{all.get(link.target_id)?.revision ?? "?"}</small></div><ActionButton className="small" onClick={() => { setReview(link); setReason(""); setError(""); setImpact("none"); }}>영향 판단</ActionButton></li>)}</ul>
                {!trace.data.stale_links.length && <p className="muted">현재 API가 보고한 재검토 관계가 없습니다.</p>}
            </section>
        </>}
        <section className="section-space baseline-section"><h2>기준선</h2><p className="muted">현재 객체의 revision 목록을 시점별로 고정합니다. 기준선 생성이 작업 완료나 테스트 통과를 대신하지 않습니다.</p>
            {baselines.status === "loading" && <Loading />}
            {baselines.status === "error" && <ErrorNotice error={baselines.error} retry={baselines.reload} />}
            {baselines.status === "ready" && <>
                <Field label="저장한 기준선"><NativeSelect value={baselineId} onChange={event => navigate({ baseline: event.target.value })}><option value="">기준선 선택</option>{baselines.data.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · {dateLabel(entry.created_at)}</option>)}</NativeSelect></Field>
                {baseline && <Accordion type="single" collapsible defaultValue="revisions" className="reference-details"><AccordionItem value="revisions"><AccordionTrigger>{baseline.name} · {Object.keys(baseline.revisions).length}개 revision</AccordionTrigger><AccordionContent><ul className="baseline-list">{Object.entries(baseline.revisions).map(([id, revision]) => { const item = all.get(id); return <li key={id}><span>{item ? <RouteLink patch={itemRoute(item)}>{item.title}</RouteLink> : shortId(id)}</span><span>r{revision}{item && item.revision !== revision && <small className="muted"> · 현재 r{item.revision}</small>}</span></li>; })}</ul></AccordionContent></AccordionItem></Accordion>}
            </>}
            <form className="inline-form" onSubmit={event => { void createBaseline(event); }}><Field label="새 기준선 이름"><Input required value={baselineName} onChange={event => setBaselineName(event.target.value)} placeholder="예: 첫 구현 범위 · 2026-10-21" /></Field><ActionButton disabled={busy || !baselineName.trim()} type="submit">{busy ? "처리 중…" : "현재 revision 묶음 저장"}</ActionButton></form>
        </section>
        {review && <Modal title="변경 영향 판단" onClose={() => setReview(null)}>
            <form onSubmit={event => { void recordReview(event); }}><p><strong>{all.get(review.source_id)?.title}</strong> → {relationLabels[review.relation]} → <strong>{all.get(review.target_id)?.title}</strong></p>
                <Field label="영향 판정"><NativeSelect value={impact} onChange={event => setImpact(event.target.value)}><option value="none">영향 없음 · 현재 revision으로 연결</option><option value="action_required">영향 있음 · 후속 조치 필요</option></NativeSelect></Field>
                <Field label="판단 근거와 필요한 조치"><Textarea required rows={5} value={reason} onChange={event => setReason(event.target.value)} /></Field>
                {error && <ErrorNotice error={error} />}
                <div className="form-actions"><ActionButton type="button" onClick={() => setReview(null)}>닫기</ActionButton><ActionButton className="primary" type="submit" disabled={busy || !reason.trim()}>{busy ? "저장 중…" : "영향 판단 저장"}</ActionButton></div>
            </form>
        </Modal>}
    </>;
}
