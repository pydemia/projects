import { useEffect, useRef, useState } from "react";
import { api, ApiError, downloadArchive, errorMessage } from "./api";
import { loadDraft, navigate, removeDraft, storeDraft, useResource } from "./hooks";
import type { Draft, Route } from "./hooks";
import {
    artifactDefinition, dataSchemas, dateLabel, defaultData, kindLabels, shortId,
} from "./models";
import type { Catalog, Item, Kind, Revision } from "./models";
import { cleanData, ItemDataFields } from "./ItemFields";
import { itemRoute, Relations, TestExecutions } from "./Relations";
import { Input } from "./pydemia-ui/input";
import { Card, CardContent } from "./pydemia-ui/card";
import { DataList } from "./pydemia-ui/data-list";
import { SearchInput } from "./pydemia-ui/search-input";
import { SideNav } from "./pydemia-ui/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./pydemia-ui/tabs";
import { Textarea } from "./pydemia-ui/textarea";
import {
    ActionButton, Badge, Empty, ErrorNotice, ExternalLink, Field, Loading, Markdown, Modal,
    PageHead, RouteLink, StringList,
} from "./ui";

type EditorProps = {
    item: Item; items: Item[]; catalog?: Catalog; userId: string;
    onChanged: () => void;
};
function draftKey(userId: string, projectId: string, itemId: string) {
    return `projects:draft:${userId}:${projectId}:${itemId}`;
}
function fromItem(item: Item): Draft {
    return {
        title: item.title, body: item.body, data: item.data,
        baseRevision: item.revision, savedLocallyAt: new Date().toISOString(),
    };
}
function sameContent(draft: Draft, item: Item): boolean {
    return draft.title === item.title && draft.body === item.body &&
        JSON.stringify(draft.data) === JSON.stringify(item.data);
}

export function ItemsPage({ projectId, userId, route, items, catalog, onChanged }: {
    projectId: string; userId: string; route: Route; items: Item[];
    catalog?: Catalog; onChanged: () => void;
}) {
    const viewKinds: Kind[] = route.view === "tasks" ? ["task"] : route.view === "tests" ? ["test_case"] : route.view === "documents" ? ["artifact"] : ["idea", "feature", "requirement", "decision"];
    const validKind = viewKinds.find(kind => kind === route.kind) ?? viewKinds[0] ?? "idea";
    const [newKind, setNewKind] = useState<Kind | null>(null);
    const [query, setQuery] = useState(route.q);
    const listScroll = useRef(0);
    const previousItem = useRef(route.item);
    useEffect(() => setQuery(route.q), [route.q]);
    useEffect(() => {
        if (route.item && !previousItem.current) {
            listScroll.current = window.scrollY;
            window.scrollTo(0, 0);
        } else if (!route.item && previousItem.current) {
            window.requestAnimationFrame(() => window.scrollTo(0, listScroll.current));
        }
        previousItem.current = route.item;
    }, [route.item]);
    const selected = items.find(item => item.id === route.item && viewKinds.includes(item.kind));
    const filtered = items.filter(item => viewKinds.includes(item.kind) &&
        (viewKinds.length === 1 || item.kind === validKind) &&
        `${item.title} ${item.id} ${item.body}`.toLocaleLowerCase().includes(route.q.toLocaleLowerCase()));
    const title = route.view === "tasks" ? "구현 작업" : route.view === "tests" ? "테스트" : route.view === "documents" ? "임시 문서" : "기획";
    const description = route.view === "tasks" ? "완료 기준, 선행 작업과 실제 결과를 함께 관리합니다." : route.view === "tests" ? "케이스와 실행 기록을 구분하고 검증 근거를 남깁니다." : route.view === "documents" ? "임시 문서 저장소 · Note 연계 예정. Markdown 초안과 스킬 작업을 연결합니다." : "아이디어를 보존하며 기능·요구사항·결정으로 구체화합니다.";
    return <>
        <PageHead title={title} description={description}>
            <ActionButton className="primary" onClick={() => setNewKind(validKind)}>+ {kindLabels[validKind]} 만들기</ActionButton>
            <RouteLink className="button" patch={{ view: "runs", item: "", run: "" }}>스킬 작업</RouteLink>
        </PageHead>
        {viewKinds.length > 1 && <Tabs value={validKind} onValueChange={kind => navigate({ kind, item: "", q: "" })}>
            <TabsList variant="line" className="workspace-kind-tabs" aria-label="기획 대상 종류">
                {viewKinds.map(kind => <TabsTrigger key={kind} value={kind}>{kindLabels[kind]} <span>{items.filter(item => item.kind === kind).length}</span></TabsTrigger>)}
            </TabsList>
        </Tabs>}
        <div className={`document-layout ${selected ? "has-selection" : ""}`}>
            <Card className="doclist workspace-collection" aria-label={`${title} 목록`}>
                <CardContent>
                <div className="workspace-list-heading"><h2>{kindLabels[validKind]} 목록</h2><span>{filtered.length}개</span></div>
                <SearchInput label={`${title} 검색`} value={query} onValueChange={setQuery} onSearch={value => navigate({ q: value, item: "" })} variant="toolbar" placeholder="제목·ID·본문 검색" />
                <SideNav aria-label={`${title} 항목`} className="doc-list-items">
                    {filtered.map(item => <RouteLink key={item.id} patch={{ item: item.id }} appearance="side" className="doc-item" current={selected?.id === item.id}>
                        <strong>{item.title}</strong>
                        <span className="doc-item-meta"><small>{shortId(item.id)} · r{item.revision}</small><Badge value={item.kind === "task" ? item.data.state : item.status} /></span>
                    </RouteLink>)}
                    {!filtered.length && <p className="muted small">{route.q ? "검색 결과가 없습니다." : "아직 등록한 항목이 없습니다."}</p>}
                </SideNav></CardContent>
            </Card>
            <Card className="document-main workspace-detail"><CardContent>
                {selected && <ActionButton type="button" className="mobile-detail-back" onClick={() => navigate({ item: "" })}>← {kindLabels[validKind]} 목록</ActionButton>}
                {selected ? <RecordEditor key={selected.id} item={selected} items={items} catalog={catalog} userId={userId} onChanged={onChanged} /> : <Empty title={route.item ? "선택한 항목을 찾을 수 없습니다." : `첫 ${kindLabels[validKind]}부터 시작해 보세요.`}>
                    <p>{route.item ? "다른 종류를 선택했거나 접근할 수 없는 항목일 수 있습니다. 목록에서 다시 선택해 주세요." : "왼쪽 목록에서 항목을 열거나 새로 작성할 수 있습니다."}</p>
                    <ActionButton onClick={() => setNewKind(validKind)}>+ {kindLabels[validKind]} 만들기</ActionButton>
                </Empty>}
            </CardContent></Card>
        </div>
        {newKind && <NewItem kind={newKind} projectId={projectId} userId={userId} items={items} catalog={catalog}
            onClose={() => setNewKind(null)} onCreated={item => { setNewKind(null); onChanged(); navigate(itemRoute(item)); }} />}
    </>;
}

export function NewItem({ kind, projectId, userId, items, catalog, onClose, onCreated }: {
    kind: Kind; projectId: string; userId: string; items: Item[]; catalog?: Catalog;
    onClose: () => void; onCreated: (item: Item) => void;
}) {
    const key = draftKey(userId, projectId, `new-${kind}`);
    const [draft, setDraft] = useState<Draft>(() => loadDraft(key) ?? {
        title: "", body: "", data: defaultData(kind), baseRevision: 0,
        savedLocallyAt: new Date().toISOString(),
    });
    const [storageAvailable, setStorageAvailable] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        setStorageAvailable(storeDraft(key, { ...draft, savedLocallyAt: new Date().toISOString() }));
    }, [key, draft]);
    async function create(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError("");
        try {
            const item = await api.createItem(projectId, {
                kind, title: draft.title.trim(), body: draft.body,
                data: dataSchemas[kind].parse(cleanData(draft.data)),
            });
            removeDraft(key); onCreated(item);
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <Modal title={`${kindLabels[kind]} 만들기`} wide onClose={onClose}>
        <form onSubmit={event => { void create(event); }}>
            <p className="muted">{storageAvailable ? "작성 내용은 이 브라우저에 임시 보관합니다. 서버 저장은 만들기 버튼으로 완료합니다." : "브라우저 임시 보관이 불가능합니다. 닫기 전에 작성 내용을 별도로 복사해 주세요."}</p>
            <Field label="제목"><Input autoFocus required maxLength={300} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="본문 · Markdown"><Textarea rows={8} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></Field>
            <ItemDataFields kind={kind} data={draft.data} onChange={data => setDraft({ ...draft, data })} catalog={catalog} items={items} />
            {error && <ErrorNotice error={error} />}
            <div className="form-actions"><ActionButton type="button" onClick={onClose}>닫기 · 초안 보관</ActionButton>
                <ActionButton className="primary" type="submit" disabled={busy || !draft.title.trim()}>{busy ? "저장 중…" : "만들기"}</ActionButton></div>
        </form>
    </Modal>;
}

export function RecordEditor({ item, items, catalog, userId, onChanged }: EditorProps) {
    const key = draftKey(userId, item.project_id, item.id);
    const [serverItem, setServerItem] = useState(item);
    const [draft, setDraft] = useState<Draft>(() => loadDraft(key) ?? fromItem(item));
    const [tab, setTab] = useState(() => loadDraft(key) ? "edit" : "preview");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [conflict, setConflict] = useState<Item | null>(null);
    const [storageAvailable, setStorageAvailable] = useState(true);
    const [discardOpen, setDiscardOpen] = useState(false);
    const dirty = !sameContent(draft, serverItem);
    const tabs = [["preview", "본문"], ["edit", "편집"], ...(item.kind !== "artifact" ? [["history", "revision 이력"]] : []), ["links", "관계·근거"], ...(item.kind === "test_case" ? [["executions", "테스트 실행"]] : [])];
    useEffect(() => {
        if (item.revision > serverItem.revision ||
            (item.revision === serverItem.revision && item.updated_at > serverItem.updated_at)) {
            if (!dirty) setDraft(fromItem(item));
            setServerItem(item);
        }
    }, [item, serverItem.revision, serverItem.status, dirty]);
    useEffect(() => {
        if (dirty) setStorageAvailable(storeDraft(key, { ...draft, savedLocallyAt: new Date().toISOString() }));
        else removeDraft(key);
    }, [key, draft, dirty]);
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
    async function fetchConflict() {
        try { setConflict(await api.item(item.id)); }
        catch (error) { setError(`충돌 이후 최신 본문을 읽지 못했습니다. ${errorMessage(error)}`); }
    }
    async function save(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError(""); setNotice("");
        try {
            const updated = await api.saveItem(item.id, {
                expected_revision: draft.baseRevision, title: draft.title.trim(),
                body: draft.body, data: dataSchemas[item.kind].parse(cleanData(draft.data)),
            });
            removeDraft(key); setServerItem(updated); setDraft(fromItem(updated));
            setConflict(null); setNotice(`서버에 초안 r${updated.revision}을 저장했습니다.`);
            onChanged();
        } catch (error) {
            setError(errorMessage(error));
            if (error instanceof ApiError && error.status === 409) await fetchConflict();
        } finally { setBusy(false); }
    }
    async function confirm() {
        setBusy(true); setError(""); setNotice("");
        try {
            const updated = await api.confirmItem(item.id, serverItem.revision);
            setServerItem(updated); setDraft(fromItem(updated));
            setNotice(`revision ${updated.revision}을 확정했습니다.`); onChanged();
        } catch (error) {
            setError(errorMessage(error));
            if (error instanceof ApiError && error.status === 409) await fetchConflict();
        } finally { setBusy(false); }
    }
    async function portable() {
        setBusy(true); setError("");
        try { await downloadArchive(`/api/items/${item.id}/portable`, `${item.title}-standalone.zip`); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    function markdownDownload() {
        const url = URL.createObjectURL(new Blob([serverItem.body], { type: "text/markdown;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = `${serverItem.title.replace(/[<>:"/\\|?*]/g, "_")}.md`;
        document.body.append(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return <article className="document-editor">
        <div className="doc-heading"><div><div className="eyebrow">{kindLabels[item.kind]}</div>
            <h2>{serverItem.title}</h2><div className="doc-meta"><Badge value={serverItem.status} />
                <span>revision {serverItem.revision}</span><span className="mono">{shortId(item.id)}</span><span>{dateLabel(serverItem.updated_at)}</span>
            </div></div><div className="actions">
                {item.kind === "artifact" && <><ActionButton className="small" onClick={markdownDownload}>Markdown 내려받기</ActionButton><ActionButton className="small" disabled={busy} onClick={() => { void portable(); }}>실행 묶음 ZIP</ActionButton></>}
                <RouteLink className="button small" patch={{ view: "runs", item: item.id, run: "" }}>스킬로 작업</RouteLink>
                {item.kind !== "artifact" && <ActionButton className="small" disabled={busy || dirty || serverItem.status === "confirmed"} onClick={() => { void confirm(); }}>현재 revision 확정</ActionButton>}
            </div></div>
        {dirty && <div className="notice local" role="status"><strong>서버에 저장하지 않은 초안이 있습니다.</strong><p>{storageAvailable ? `이 브라우저에 보관 중입니다. 편집 기준은 r${draft.baseRevision}입니다.` : "브라우저 임시 저장에 실패했습니다. 페이지를 닫기 전에 본문을 복사해 주세요."}</p></div>}
        {notice && <p className="success-message" role="status">{notice}</p>}
        {error && <ErrorNotice error={error} />}
        {conflict && <section className="conflict-section" aria-label="동시 편집 충돌">
            <h3>다른 변경과 충돌했습니다. 내 초안은 그대로 보관합니다.</h3>
            <p>내 기준 r{draft.baseRevision} / 서버 r{conflict.revision}. 아래 두 본문을 비교한 뒤 편집 내용에 필요한 변경을 합쳐 주세요.</p>
            <div className="comparison"><div><h4>내 초안 · {draft.title}</h4><pre>{draft.body}</pre></div><div><h4>서버 최신 · {conflict.title}</h4><pre>{conflict.body}</pre></div></div>
            <details><summary>제목·분류 등 전체 필드 비교</summary><div className="comparison"><pre>{JSON.stringify({ title: draft.title, data: draft.data }, null, 2)}</pre><pre>{JSON.stringify({ title: conflict.title, data: conflict.data }, null, 2)}</pre></div></details>
            <ActionButton onClick={() => {
                setServerItem(conflict); setDraft({ ...draft, baseRevision: conflict.revision });
                setConflict(null); setTab("edit"); setError("");
                setNotice("서버 최신 revision을 편집 기준으로 선택했습니다. 합칠 내용을 편집한 뒤 저장해 주세요.");
            }}>서버 최신 revision을 기준으로 병합 편집</ActionButton>
        </section>}
        <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="editor-tabs" aria-label="항목 작업">
            {tabs.map(([value, label]) => <TabsTrigger key={value} value={value ?? "preview"}>{label}</TabsTrigger>)}
        </TabsList>
        {tab === "preview" && <TabsContent value="preview" className="doc-split"><div><Markdown body={serverItem.body} /><ItemDetails item={serverItem} catalog={catalog} /></div>
            <aside className="doc-aside"><h3>문서 기준</h3><p>현재 서버 revision {serverItem.revision}</p><p>{item.kind === "artifact" ? "임시 문서 저장소 · Note 연계 예정. revision 숫자는 저장 충돌 검사에 사용합니다." : serverItem.status === "confirmed" ? "이 revision은 확정되어 있습니다. 편집 후 저장하면 새 초안을 만듭니다." : "초안 저장과 확정은 별개입니다."}</p><h3>연결 근거</h3><p>관계·근거 탭에서 요구사항·작업·테스트와 revision을 연결할 수 있습니다.</p><ActionButton onClick={() => setTab("links")}>관계 확인</ActionButton></aside>
        </TabsContent>}
        {tab === "edit" && <TabsContent value="edit"><form onSubmit={event => { void save(event); }}>
            {serverItem.status === "confirmed" && <p className="hint">확정본을 보존하며 다음 초안 revision으로 저장합니다.</p>}
            <Field label="제목"><Input required maxLength={300} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="본문 · Markdown" hint="표와 코드 블록을 지원합니다. HTML은 미리보기에 실행하지 않습니다.">
                <Textarea className="editor" value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} />
            </Field>
            <details className="draft-preview"><summary>편집 중인 본문 미리보기</summary><Markdown body={draft.body} /></details>
            <ItemDataFields kind={item.kind} data={draft.data} onChange={data => setDraft({ ...draft, data })} catalog={catalog} items={items.filter(entry => entry.id !== item.id)} existingItem={item} />
            <div className="form-actions"><ActionButton type="button" disabled={busy || !dirty} onClick={() => setDiscardOpen(true)}>내 초안 버리기</ActionButton>
                <span className="muted small">{busy ? "서버 응답을 기다리는 중…" : dirty ? "서버 미저장" : `서버 r${serverItem.revision}과 같음`}</span>
                <ActionButton type="submit" className="primary" disabled={busy || !dirty || !!conflict || !draft.title.trim()}>{busy ? "저장 중…" : "초안 저장"}</ActionButton></div>
        </form></TabsContent>}
        {tab === "history" && <TabsContent value="history"><RevisionHistory item={serverItem} dirty={dirty} onRestored={updated => { setServerItem(updated); setDraft(fromItem(updated)); setTab("preview"); onChanged(); }} /></TabsContent>}
        {tab === "links" && <TabsContent value="links"><Relations item={serverItem} items={items} onChanged={onChanged} /></TabsContent>}
        {tab === "executions" && <TabsContent value="executions"><TestExecutions item={serverItem} onChanged={onChanged} /></TabsContent>}
        </Tabs>
        {discardOpen && <Modal title="저장하지 않은 초안 버리기" onClose={() => setDiscardOpen(false)}>
            <p>이 브라우저의 편집 내용을 지우고 현재 서버 r{serverItem.revision}을 불러옵니다.</p>
            <div className="form-actions"><ActionButton onClick={() => setDiscardOpen(false)}>계속 편집</ActionButton><ActionButton className="danger" onClick={() => { removeDraft(key); setDraft(fromItem(serverItem)); setConflict(null); setError(""); setDiscardOpen(false); }}>내 초안 버리기</ActionButton></div>
        </Modal>}
    </article>;
}

function ItemDetails({ item, catalog }: { item: Item; catalog?: Catalog }) {
    return <section className="item-details">
        {item.kind === "idea" && <><h3>가정·질문</h3><p className="preserve-lines">{item.data.notes || "등록된 메모 없음"}</p>{item.data.source_url && <p>출처: {item.data.source_url}</p>}</>}
        {item.kind === "feature" && <><h3>현재 동작</h3><p className="preserve-lines">{item.data.current_behavior || "미기록"}</p><p className="muted">근거 {item.data.evidence_url || "미기록"}<br />대상 SHA {item.data.target_sha || "미기록"}</p></>}
        {item.kind === "requirement" && <><h3>수용 조건</h3><StringList values={item.data.acceptance_criteria} /><p className="muted">{item.data.category === "functional" ? "기능" : "비기능"} 요구사항 · 우선순위 {item.data.priority} · <Badge value={item.data.disposition} /></p>{item.data.excluded_reason && <p>사유: {item.data.excluded_reason}</p>}</>}
        {item.kind === "task" && <><DataList label="작업 속성" layout="grid" items={[
            { id: "state", label: "상태", value: <Badge value={item.data.state} /> },
            { id: "workflow", label: "유형·목록", value: `${item.data.workflow === "personal" ? "개인 할 일" : "구현 작업"} · ${item.data.list_name}` },
            { id: "planned", label: "실행 예정", value: item.data.planned_date || null },
            { id: "due", label: "마감", value: item.data.due_date || null },
            { id: "estimate", label: "예상 소요", value: item.data.estimated_minutes ? `${item.data.estimated_minutes}분` : null },
            { id: "gtd", label: "GTD", value: `${item.data.next_action ? "다음 행동" : "보류"} · ${item.data.context || "맥락 무관"} · 에너지 ${{ any: "제약 없음", low: "낮음", medium: "보통", high: "높음" }[item.data.energy]}` },
            { id: "abc", label: "ABC", value: item.data.abc_priority === "none" ? null : `${item.data.abc_priority}${item.data.abc_order || ""}` },
            { id: "goal", label: "목표·가치", value: item.data.goal || null },
        ]} />
            {item.data.github_issue_url && <p><ExternalLink href={item.data.github_issue_url}>GitHub Issue 열기 ↗</ExternalLink></p>}
            {item.data.workflow === "delivery" && <><h3>완료·수용 조건</h3><StringList values={item.data.acceptance_criteria} /><p>테스트 근거 {item.data.requires_test ? "필요" : "비적용"}</p><p className="muted">결과 {item.data.result_url || "미기록"}<br />대상 SHA {item.data.target_sha || "미기록"}</p></>}</>}
        {item.kind === "test_case" && <><h3>실행 절차</h3><StringList values={item.data.steps} /><h3>기대 결과</h3><p className="preserve-lines">{item.data.expected || "미기록"}</p></>}
        {item.kind === "decision" && <><h3>결정 이유</h3><p>{item.data.reason || "미기록"}</p><h3>대안</h3><StringList values={item.data.alternatives} /></>}
        {item.kind === "artifact" && <><DataList label="양식·참조 manifest" layout="grid" items={[
            { id: "kind", label: "문서 종류", value: artifactDefinition(catalog, item.data.artifact_type)?.name ?? item.data.artifact_type },
            { id: "template", label: "양식", value: item.data.template_ref ? `${item.data.template_ref}${item.data.template_version ? ` · ${item.data.template_version}` : ""}` : null },
            { id: "inspection", label: "확인 상태", value: { unverified: "미확인", verified: "사용자 직접 확인", inaccessible: "접근 실패" }[item.data.inspection_status] ?? item.data.inspection_status },
            { id: "examples", label: "예시 참조", value: item.data.example_refs.join(", ") || null },
            { id: "sources", label: "프로젝트 근거", value: item.data.project_source_refs.map(shortId).join(", ") || null },
        ]} />
            <p className="hint">이 확인 상태는 실행 시 자료의 실제 읽기 결과와 별도로 기록합니다.</p>
        </>}
    </section>;
}

function RevisionHistory({ item, dirty, onRestored }: {
    item: Item; dirty: boolean; onRestored: (item: Item) => void;
}) {
    const revisions = useResource(`revisions:${item.id}:${item.revision}`, signal => api.revisions(item.id, signal));
    const [selected, setSelected] = useState<Revision | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function restore() {
        if (!selected) return;
        setBusy(true); setError("");
        try { onRestored(await api.restoreItem(item.id, item.revision, selected.revision)); setSelected(null); }
        catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <section><h2>revision 이력</h2><p className="muted">복원은 과거 내용을 새 초안으로 저장합니다. 기존 이력은 유지됩니다.</p>
        {dirty && <p className="notice">편집 중인 초안을 저장하거나 버린 뒤 복원할 수 있습니다.</p>}
        {revisions.status === "loading" && <Loading />}
        {revisions.status === "error" && <ErrorNotice error={revisions.error} retry={revisions.reload} />}
        {revisions.status === "ready" && <ul className="record-list">{[...revisions.data].sort((a, b) => b.revision - a.revision).map(revision => <li key={revision.revision}>
            <div className="row-head"><strong>r{revision.revision} · {revision.title}</strong><Badge value={revision.status} /><time>{dateLabel(revision.created_at)}</time><ActionButton className="small" onClick={() => setSelected(revision)}>내용·복원</ActionButton></div>
        </li>)}</ul>}
        {selected && <Modal title={`revision ${selected.revision} · ${selected.title}`} wide onClose={() => setSelected(null)}>
            <Markdown body={selected.body} />
            <details><summary>이 revision의 분류·참조 데이터</summary><pre>{JSON.stringify(selected.data, null, 2)}</pre></details>
            {error && <ErrorNotice error={error} />}
            <div className="form-actions"><ActionButton onClick={() => setSelected(null)}>닫기</ActionButton><ActionButton className="primary" disabled={busy || dirty || selected.revision === item.revision} onClick={() => { void restore(); }}>{busy ? "복원 중…" : "이 버전을 새 초안으로 복원"}</ActionButton></div>
        </Modal>}
    </section>;
}

