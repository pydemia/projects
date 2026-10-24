import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "./api";
import type { GitPreview, Project } from "./models";
import { dateLabel } from "./models";
import { Button } from "./pydemia-ui/button";
import { Card, CardContent } from "./pydemia-ui/card";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Textarea } from "./pydemia-ui/textarea";
import { ErrorNotice, Field, Modal } from "./ui";

export function GitImport({ onClose, onCreated }: {
    onClose: () => void; onCreated: (project: Project) => void;
}) {
    const [url, setUrl] = useState("");
    const [preview, setPreview] = useState<GitPreview | null>(null);
    const [name, setName] = useState("");
    const [goal, setGoal] = useState("");
    const [profile, setProfile] = useState<"simple" | "standard">("simple");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function analyze(path = "") {
        setBusy(true); setError("");
        try {
            const result = await api.previewGit(url.trim(), path);
            setPreview(result); setName(result.suggested_name); setGoal(result.suggested_goal);
        } catch (error) { setPreview(null); setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    async function create(event: FormEvent) {
        event.preventDefault();
        if (!preview) return;
        setBusy(true); setError("");
        try {
            onCreated(await api.importGit({
                repository_url: preview.repository_url, path: preview.path,
                expected_sha: preview.sha, name: name.trim(), goal: goal.trim(), profile,
            }));
        } catch (error) {
            setError(errorMessage(error));
            if (error instanceof Error && error.message.includes("branch")) setPreview(null);
        } finally { setBusy(false); }
    }
    return <Modal title="GitHub 저장소에서 만들기" onClose={onClose}>
        <form onSubmit={event => { event.preventDefault(); void analyze(); }}>
            <Field label="GitHub 저장소 URL" hint="https://github.com/owner/repo 주소를 입력하세요.">
                <Input required disabled={busy} type="url" value={url} placeholder="https://github.com/pydemia/statusline" onChange={event => { setUrl(event.target.value); setPreview(null); }} />
            </Field>
            <Button type="submit" disabled={busy || !url.trim()}>{busy ? "읽는 중…" : "저장소 분석"}</Button>
        </form>
        {preview && <form onSubmit={event => { void create(event); }} className="git-import-details">
            <Card variant="subtle"><CardContent><strong>{preview.repository_full_name}</strong><p className="muted small">{preview.visibility === "private" ? "비공개" : "공개"} · {preview.branch} · {preview.sha.slice(0, 10)} · {preview.kind}</p><p className="muted small">목표 근거: {preview.manifest_path || "저장소 설명/유형"}</p></CardContent></Card>
            {preview.scopes.length > 1 && <Field label="가져올 package 폴더"><NativeSelect disabled={busy} value={preview.path} onChange={event => { void analyze(event.target.value); }}>{preview.scopes.map(scope => <option key={scope.path} value={scope.path}>{scope.label}</option>)}</NativeSelect></Field>}
            <Field label="프로젝트 이름"><Input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></Field>
            <Field label="목표"><Textarea rows={3} maxLength={20000} value={goal} onChange={event => setGoal(event.target.value)} /></Field>
            <Field label="프로필"><NativeSelect value={profile} onChange={event => setProfile(event.target.value as "simple" | "standard")}><option value="simple">간편</option><option value="standard">표준</option></NativeSelect></Field>
            <div className="git-import-history"><strong>가져올 작업 이력</strong><p className="muted small">최근 commit과 PR의 제목·상태·링크만 읽기 전용으로 저장합니다.</p><ul className="activity">{preview.activities.slice(0, 8).map(row => <li key={`${row.kind}:${row.external_id}`}><a href={row.url} target="_blank" rel="noopener noreferrer">{row.kind === "pr" ? "PR" : "commit"} · {row.title}</a><small>{row.state} · {dateLabel(row.occurred_at)}</small></li>)}</ul>{!preview.activities.length && <p className="muted small">가져올 최근 이력이 없습니다.</p>}</div>
            {preview.warnings.map(warning => <p className="hint" key={warning}>{warning}</p>)}
            <div className="form-actions"><Button variant="outline" type="button" onClick={onClose}>취소</Button><Button className="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "생성 중…" : "프로젝트 만들기"}</Button></div>
        </form>}
        {error && <ErrorNotice error={error} />}
    </Modal>;
}
