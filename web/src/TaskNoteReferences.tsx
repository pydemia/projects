import { useState } from "react";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { useReauthenticationCheckpoint } from "./reauthentication";
import { z } from "zod";
import { errorMessage, request } from "./api";
import { useProjectPermissions, itemWritePermission } from "./ProjectPermissions";
import { useResource } from "./hooks";
import { itemSchema } from "./models";
import type { Item } from "./models";
import { Input } from "./pydemia-ui/input";
import { ActionButton, ErrorNotice, ExternalLink, Field } from "./ui";

const referenceDraftSchema = z.object({url: z.string(), revision: z.string(), hash: z.string()}).strict();
const referencesSchema = z.array(z.object({id: z.string(), provider: z.literal("note"), page_id: z.string(), url: z.string(), revision: z.string().nullable(), content_hash: z.string().nullable(), verification: z.literal("unverified")}));
export function TaskNoteReferences({item, onChanged}: {item: Item; onChanged: () => void}) {
    const can = useProjectPermissions();
    const writable = can(item.project_id, itemWritePermission(item.kind));
    const path = `/api/items/${encodeURIComponent(item.id)}/note-references`;
    const references = useResource(`note-refs:${item.id}:${item.revision}`, signal => request(path, referencesSchema, {signal}));
    const recovery: AuthenticationDraft<z.infer<typeof referenceDraftSchema>> = useAuthenticationDraft(`item:${item.project_id}:${item.id}:note-reference`, referenceDraftSchema,
        () => url || revision || hash ? {url, revision, hash} : null);
    const [url, setUrl] = useState(recovery.restored?.url ?? "");
    const [revision, setRevision] = useState(recovery.restored?.revision ?? "");
    const [hash, setHash] = useState(recovery.restored?.hash ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useReauthenticationCheckpoint(() => !(url || revision || hash));
    async function add(event: React.FormEvent) {
        event.preventDefault(); if (!writable) return; setBusy(true); setError("");
        try {await request(path, itemSchema, {method: "POST", body: {expected_revision: item.revision, url, ...(revision ? {revision} : {}), ...(hash ? {content_hash: hash} : {})}}); setUrl(""); setRevision(""); setHash(""); recovery.clear(); references.reload(); onChanged();}
        catch (cause) {setError(errorMessage(cause));}
        finally {setBusy(false);}
    }
    async function remove(id: string) {
        if (!writable) return;
        setBusy(true); setError("");
        try {await request(`${path}/${encodeURIComponent(id)}`, itemSchema, {method: "DELETE", body: {expected_revision: item.revision}}); references.reload(); onChanged();}
        catch (cause) {setError(errorMessage(cause));}
        finally {setBusy(false);}
    }
    return <section className="task-note-references" aria-label="Note 문서 참조"><h3>Note 문서 참조</h3><p className="hint">Projects는 연결 정보만 보관합니다. Note 권한·본문은 미확인입니다.</p>
        {references.status === "ready" && references.data.map(reference => <div key={reference.id}><ExternalLink href={reference.url}>Note에서 열기 · {reference.page_id}</ExternalLink><span> · 권한·본문 미확인</span><small>revision {reference.revision ?? "미지정"} · hash {reference.content_hash ?? "미지정"}</small><ActionButton disabled={busy || !writable} onClick={() => void remove(reference.id)}>참조 연결 해제</ActionButton></div>)}
        {references.status === "error" && <ErrorNotice error={references.error} retry={references.reload} />}
        <details><summary>Note 참조 연결</summary><fieldset disabled={!writable}><form onSubmit={event => void add(event)}><Field label="Note 문서 URL"><Input required type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://note.pydemia.ai/#/page/…" /></Field><Field label="문서 revision · 선택"><Input value={revision} onChange={event => setRevision(event.target.value)} /></Field><Field label="본문 hash · 선택"><Input value={hash} onChange={event => setHash(event.target.value)} /></Field><ActionButton type="submit" disabled={busy || !writable || !url.trim()}>참조 연결</ActionButton></form></fieldset></details>
        {error && <ErrorNotice error={error} />}
    </section>;
}
