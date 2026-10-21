import type { Catalog, Item, Kind } from "./models";
import { artifactDefinition } from "./models";
import { Input } from "./pydemia-ui/input";
import { Textarea } from "./pydemia-ui/textarea";
import { ExternalLink, Field, StringList } from "./ui";

export function textValue(data: Record<string, unknown>, key: string): string {
    return typeof data[key] === "string" ? data[key] : "";
}
export function listValue(data: Record<string, unknown>, key: string): string[] {
    const value = data[key];
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
export function lines(value: string): string[] {
    return value.split("\n").map(line => line.trim()).filter(Boolean);
}

export function ArtifactFields({ data, onChange, catalog, items }: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
    catalog?: Catalog;
    items: Item[];
}) {
    const set = (key: string, value: unknown) => onChange({ ...data, [key]: value });
    const selectedType = artifactDefinition(catalog, data.artifact_type);
    const selectedSource = catalog?.sources.find(source => source.id === data.template_ref);
    const examples = listValue(data, "example_refs");
    const projectSources = listValue(data, "project_source_refs");
    return <>
        <div className="form-grid">
            <Field label="문서 종류">
                <select value={textValue(data, "artifact_type")} onChange={event => set("artifact_type", event.target.value)}>
                    {!catalog?.artifacts.some(type => type.id === data.artifact_type) && !catalog?.document_profiles.some(type => type.id === data.artifact_type) && <option value={textValue(data, "artifact_type")}>{textValue(data, "artifact_type")} · 기존 문서 종류</option>}
                    {catalog && <optgroup label="핵심 산출물 7종">{catalog.document_profiles.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</optgroup>}
                    {catalog && <optgroup label="참고 산출물 분류">{catalog.artifacts.filter(type => !catalog.document_profiles.some(profile => profile.id === type.id)).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</optgroup>}
                </select>
            </Field>
            <Field label="참조 양식" hint="양식은 입력 자료이며, 작성 규칙은 고정한 스킬 원문을 사용합니다.">
                <select value={textValue(data, "template_ref")} onChange={event => set("template_ref", event.target.value || null)}>
                    <option value="">지정하지 않음</option>
                    {catalog?.sources.map(source => <option key={source.id} value={source.id}>{source.id} · {source.name}</option>)}
                </select>
            </Field>
            <Field label="양식 버전·확인 시점">
                <Input value={textValue(data, "template_version")} onChange={event => set("template_version", event.target.value || null)} placeholder="예: v3.1 · 2026-10-21 확인" />
            </Field>
            <Field label="참조 확인 상태" hint="원문 자료를 직접 확인한 경우에만 확인 상태를 변경해 주세요.">
                <select value={textValue(data, "inspection_status")} onChange={event => set("inspection_status", event.target.value)}>
                    <option value="unverified">미확인</option>
                    <option value="verified">직접 확인함</option>
                    <option value="inaccessible">접근 실패</option>
                </select>
            </Field>
        </div>
        {selectedType && <details className="reference-details">
            <summary>종류별 시작 항목과 원본 확인 기록</summary>
            <p>{selectedType.original_observation}</p>
            <StringList values={selectedType.starter_fields} />
        </details>}
        {selectedSource && <div className="reference-note">
            <ExternalLink href={selectedSource.url}>{selectedSource.name} ↗</ExternalLink>
            <p>{selectedSource.inspection}</p><p className="muted">{selectedSource.reuse}</p>
        </div>}
        <details className="reference-details">
            <summary>예시 자료와 프로젝트 근거 선택</summary>
            <fieldset><legend>예시·공개 참조</legend><div className="check-list">
                {catalog?.sources.map(source => <label key={source.id}>
                    <input type="checkbox" checked={examples.includes(source.id)} onChange={event => set("example_refs", event.target.checked ? [...examples, source.id] : examples.filter(id => id !== source.id))} />
                    <span>{source.name}<small>{source.kind} · {source.format}</small></span>
                </label>)}
            </div></fieldset>
            <fieldset><legend>프로젝트 원본·근거</legend><div className="check-list">
                {items.map(item => <label key={item.id}>
                    <input type="checkbox" checked={projectSources.includes(item.id)} onChange={event => set("project_source_refs", event.target.checked ? [...projectSources, item.id] : projectSources.filter(id => id !== item.id))} />
                    <span>{item.title}<small>revision {item.revision}</small></span>
                </label>)}
                {!items.length && <p className="muted">등록된 프로젝트 근거가 없습니다.</p>}
            </div></fieldset>
        </details>
    </>;
}

export function ItemDataFields({ kind, data, onChange, catalog, items }: {
    kind: Kind;
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
    catalog?: Catalog;
    items: Item[];
}) {
    const set = (key: string, value: unknown) => onChange({ ...data, [key]: value });
    const textField = (key: string, label: string, hint?: string) => <Field key={key} label={label} hint={hint}>
        <Input value={textValue(data, key)} onChange={event => set(key, event.target.value)} />
    </Field>;
    const areaField = (key: string, label: string) => <Field key={key} label={label}>
        <Textarea rows={3} value={textValue(data, key)} onChange={event => set(key, event.target.value)} />
    </Field>;
    const listField = (key: string, label: string) => <Field key={key} label={label} hint="한 줄에 한 항목씩 작성해 주세요.">
        <Textarea rows={4} value={listValue(data, key).join("\n")} onChange={event => {
            // Keep the trailing empty line while editing a list in a textarea.
            set(key, event.target.value.split("\n"));
        }} />
    </Field>;
    switch (kind) {
        case "idea": return <>
            {textField("source_url", "출처 URL")}{areaField("notes", "가정·질문·보류 메모")}
        </>;
        case "feature": return <>
            {areaField("current_behavior", "현재 관찰한 동작")}
            <div className="form-grid">{textField("evidence_url", "화면·API·코드 근거 URL")}{textField("target_sha", "대상 commit SHA")}</div>
        </>;
        case "requirement": return <>
            <div className="form-grid">
                <Field label="요구 분류"><select value={textValue(data, "category")} onChange={event => set("category", event.target.value)}>
                    <option value="functional">기능 요구사항 · FR</option><option value="nonfunctional">비기능 요구사항 · NFR</option>
                </select></Field>
                <Field label="우선순위"><select value={textValue(data, "priority")} onChange={event => set("priority", event.target.value)}>
                    <option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option>
                </select></Field>
                <Field label="반영 분류"><select value={textValue(data, "disposition")} onChange={event => set("disposition", event.target.value)}>
                    <option value="new">신규</option><option value="extend">확장</option><option value="change">변경</option><option value="merge">통합</option><option value="duplicate">중복</option><option value="conflict">충돌</option><option value="defer">보류</option>
                </select></Field>
            </div>
            {listField("acceptance_criteria", "수용 조건")}
            <fieldset><legend>연결할 기존 기능</legend><div className="check-list">
                {items.filter(item => item.kind === "feature").map(item => <label key={item.id}>
                    <input type="checkbox" checked={listValue(data, "feature_ids").includes(item.id)} onChange={event => set("feature_ids", event.target.checked ? [...listValue(data, "feature_ids"), item.id] : listValue(data, "feature_ids").filter(id => id !== item.id))} />{item.title}
                </label>)}
                {!items.some(item => item.kind === "feature") && <p className="muted">먼저 기존 기능을 등록하면 선택할 수 있습니다.</p>}
            </div></fieldset>
            {areaField("excluded_reason", "제외·보류·충돌 사유")}
        </>;
        case "artifact": return <ArtifactFields data={data} onChange={onChange} catalog={catalog} items={items} />;
        case "task": return <>
            <Field label="작업 상태"><select value={textValue(data, "state")} onChange={event => set("state", event.target.value)}>
                <option value="todo">할 일</option><option value="in_progress">진행 중</option><option value="in_review">검토 중</option><option value="done">완료</option><option value="cancelled">취소</option>
            </select></Field>
            {listField("acceptance_criteria", "완료·수용 조건")}
            {(data.state === "cancelled" || textValue(data, "cancellation_reason")) && areaField("cancellation_reason", "작업 취소 사유")}
            <div className="form-grid">{textField("result_url", "결과물·PR·문서 URL")}{textField("target_sha", "검증 대상 commit SHA")}</div>
            <label className="check-row"><input type="checkbox" checked={data.requires_test !== false} onChange={event => set("requires_test", event.target.checked)} />이 작업의 완료에 테스트 근거가 필요함</label>
            <p className="hint">완료 전환 시 서버가 결과물·수용 조건·연결된 현행 테스트를 검사합니다.</p>
        </>;
        case "test_case": return <>
            {listField("steps", "실행 절차")}{areaField("expected", "기대 결과")}
        </>;
        case "decision": return <>
            {areaField("reason", "결정 이유")}{listField("alternatives", "검토한 대안")}
        </>;
    }
}

export function cleanData(data: Record<string, unknown>): Record<string, unknown> {
    const result = { ...data };
    for (const key of ["acceptance_criteria", "steps", "alternatives"]) {
        if (Array.isArray(result[key])) result[key] = listValue(result, key).map(value => value.trim()).filter(Boolean);
    }
    return result;
}
