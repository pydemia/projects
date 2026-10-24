import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "./api";
import type { GitZipPreview, Project } from "./models";
import { Button } from "./pydemia-ui/button";
import { Card, CardContent } from "./pydemia-ui/card";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Textarea } from "./pydemia-ui/textarea";
import { ErrorNotice, Field, Modal } from "./ui";

async function encode(file: File): Promise<string> {
    if (file.size > 8_000_000) throw new Error("Git ZIP은 8 MB 이하여야 합니다.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
}

export function GitZipImport({ onClose, onCreated }: {
    onClose: () => void; onCreated: (project: Project) => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [encoded, setEncoded] = useState("");
    const [preview, setPreview] = useState<GitZipPreview | null>(null);
    const [name, setName] = useState("");
    const [goal, setGoal] = useState("");
    const [profile, setProfile] = useState<"simple" | "standard">("simple");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function analyze(path = "", archive = encoded) {
        if (!file) return;
        setBusy(true); setError("");
        try {
            const content = archive || await encode(file);
            const result = await api.previewGitZip({ archive_base64: content, archive_name: file.name, path });
            setEncoded(content); setPreview(result);
            setName(result.suggested_name); setGoal(result.suggested_goal);
        } catch (error) { setPreview(null); setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    async function create(event: FormEvent) {
        event.preventDefault();
        if (!preview) return;
        setBusy(true); setError("");
        try {
            onCreated(await api.importGitZip({
                archive_base64: encoded, archive_name: preview.archive_name,
                path: preview.path, expected_sha256: preview.archive_sha256,
                name: name.trim(), goal: goal.trim(), profile,
            }));
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
    }
    return <Modal title="Git ZIP에서 프로젝트 만들기" onClose={onClose}>
        <form onSubmit={event => { event.preventDefault(); void analyze("", ""); }}>
            <p>GitHub의 Download ZIP 또는 <code>git archive</code> ZIP을 선택해 주세요. package 정보로 프로젝트 목표를 제안합니다.</p>
            <Field label="Git 소스 ZIP · 최대 8 MB">
                <Input type="file" required accept=".zip,application/zip" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setEncoded(""); setPreview(null); }} />
            </Field>
            <Button type="submit" disabled={busy || !file}>{busy ? "읽는 중…" : "ZIP 분석"}</Button>
        </form>
        {preview && <form onSubmit={event => { void create(event); }} className="git-import-details">
            <Card variant="subtle"><CardContent><strong>{preview.suggested_name}</strong><p className="muted small">{preview.kind} · {preview.archive_name}</p><p className="muted small">목표 근거: {preview.manifest_path || "유형"}</p></CardContent></Card>
            {preview.scopes.length > 1 && <Field label="가져올 package 폴더"><NativeSelect disabled={busy} value={preview.path} onChange={event => { void analyze(event.target.value); }}>{preview.scopes.map(scope => <option key={scope.path} value={scope.path}>{scope.label}</option>)}</NativeSelect></Field>}
            <Field label="프로젝트 이름"><Input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></Field>
            <Field label="목표"><Textarea rows={3} maxLength={20000} value={goal} onChange={event => setGoal(event.target.value)} /></Field>
            <Field label="프로필"><NativeSelect value={profile} onChange={event => setProfile(event.target.value as "simple" | "standard")}><option value="simple">간편</option><option value="standard">표준</option></NativeSelect></Field>
            {preview.warnings.map(warning => <p className="hint" key={warning}>{warning}</p>)}
            <div className="form-actions"><Button variant="outline" type="button" onClick={onClose}>취소</Button><Button className="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "생성 중…" : "프로젝트 만들기"}</Button></div>
        </form>}
        {error && <ErrorNotice error={error} />}
    </Modal>;
}
