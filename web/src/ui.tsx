import { cloneElement, lazy, Suspense, useEffect, useId, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { statusLabels } from "./models";
import { navigate, routeUrl } from "./hooks";
import type { Route } from "./hooks";

const MarkdownContent = lazy(() => import("./MarkdownContent"));

export function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
    return <div className="notice error" role="alert">
        <strong>작업을 완료하지 못했습니다.</strong><p>{error}</p>
        {retry && <button onClick={retry}>다시 시도</button>}
    </div>;
}
export function Loading({ label = "서버에서 불러오는 중…" }: { label?: string }) {
    return <p className="loading" role="status">{label}</p>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
    return <div className="empty"><h2>{title}</h2>{children}</div>;
}
export function Badge({ value, label }: { value: string; label?: string }) {
    return <span className={`badge status-${value}`}>
        {label ?? statusLabels[value] ?? value}
    </span>;
}
export function Field({ label, hint, children }: {
    label: string; hint?: string;
    children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
    const generatedId = useId();
    const inputId = children.props.id ?? generatedId;
    return <div className="field"><label htmlFor={inputId}>{label}</label>
        {cloneElement(children, {
            id: inputId,
            "aria-describedby": hint ? `${inputId}-hint` : children.props["aria-describedby"],
        })}
        {hint && <small className="muted" id={`${inputId}-hint`}>{hint}</small>}
    </div>;
}
export function PageHead({ title, description, children, eyebrow }: {
    title: string; description?: string; children?: ReactNode; eyebrow?: string;
}) {
    return <div className="pagehead"><div>
        <div className="eyebrow">{eyebrow ?? "PROJECT WORKSPACE"}</div>
        <h1>{title}</h1>{description && <p>{description}</p>}
    </div><div className="actions">{children}</div></div>;
}
export function RouteLink({ patch, children, className = "", current }: {
    patch: Partial<Route>; children: ReactNode; className?: string; current?: boolean;
}) {
    return <a href={routeUrl(patch)} className={className}
        aria-current={current ? "page" : undefined}
        onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
                event.preventDefault();
                navigate(patch);
            }
        }}>{children}</a>;
}
export function Modal({ title, children, onClose, wide = false }: {
    title: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        const dialog = ref.current;
        const previous = document.activeElement;
        dialog?.showModal();
        dialog?.querySelector<HTMLElement>("input:not([type='hidden']), textarea, select")?.focus();
        return () => {
            dialog?.close();
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, []);
    return <dialog ref={ref} className={wide ? "modal wide" : "modal"}
        aria-labelledby={titleId}
        onCancel={event => { event.preventDefault(); closeRef.current(); }}>
        <div className="modal-head"><h2 id={titleId}>{title}</h2>
            <button className="plain" aria-label="대화상자 닫기" onClick={onClose}>닫기 ×</button>
        </div><div className="modal-body">{children}</div>
    </dialog>;
}
export function safeMarkdownUrl(value: string): string {
    if (value.startsWith("#")) return value;
    try {
        const url = new URL(value, window.location.origin);
        if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return value;
    } catch { /* Invalid links render without a destination. */ }
    return "";
}
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
    const safe = safeMarkdownUrl(href);
    return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>
        : <span>{children} (잘못된 URL)</span>;
}
export function Markdown({ body }: { body: string }) {
    return <Suspense fallback={<Loading label="본문 미리보기 준비 중…" />}>
        <MarkdownContent body={body} />
    </Suspense>;
}
export function StringList({ values }: { values: string[] }) {
    return values.length ? <ul className="text-list">{values.map((value, index) =>
        <li key={`${index}-${value}`}>{value}</li>)}</ul> : <p className="muted">등록된 항목 없음</p>;
}
