import { cloneElement, lazy, Suspense, useEffect, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { statusLabels } from "./models";
import { navigate, routeUrl } from "./hooks";
import type { Route } from "./hooks";
import { Alert, AlertDescription, AlertTitle } from "./pydemia-ui/alert";
import { Badge as PydBadge } from "./pydemia-ui/badge";
import { Button } from "./pydemia-ui/button";
import type { ButtonProps } from "./pydemia-ui/button";
import { Empty as PydEmpty } from "./pydemia-ui/empty";
import { Field as PydField } from "./pydemia-ui/field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./pydemia-ui/dialog";
import { PageHeader } from "./pydemia-ui/page-header";
import { SideNavLink } from "./pydemia-ui/navigation";

const MarkdownContent = lazy(() => import("./MarkdownContent"));

/** Preserve native form-submit defaults while using the shared pydemia button. */
export function ActionButton({ className = "", variant, type = "submit", ...props }: ButtonProps) {
    const classes = className.split(/\s+/);
    const resolved = variant ?? (classes.includes("primary") ? "primary"
        : classes.includes("linkbtn") || classes.includes("plain") ? "ghost" : "outline");
    return <Button className={className} variant={resolved} type={type} {...props} />;
}

export function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
    return <Alert variant="destructive" appearance="soft" className="notice error">
        <AlertTitle>작업을 완료하지 못했습니다.</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        {retry && <Button variant="outline" onClick={retry}>다시 시도</Button>}
    </Alert>;
}
export function Loading({ label = "서버에서 불러오는 중…" }: { label?: string }) {
    return <p className="loading" role="status">{label}</p>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
    return <PydEmpty appearance="plain" className="empty"><h2>{title}</h2>{children}</PydEmpty>;
}
export function Badge({ value, label }: { value: string; label?: string }) {
    return <PydBadge variant={value === "failed" || value === "conflict" ? "danger" : "default"} className={`badge status-${value}`}>
        {label ?? statusLabels[value] ?? value}
    </PydBadge>;
}
export function Field({ label, hint, children }: {
    label: string; hint?: string;
    children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
    return <PydField label={label} description={hint} controlId={children.props.id} className="field">
        {control => cloneElement(children, {
            id: control.id,
            "aria-describedby": control["aria-describedby"] ?? children.props["aria-describedby"],
        })}
    </PydField>;
}
export function PageHead({ title, description, children, eyebrow }: {
    title: string; description?: string; children?: ReactNode; eyebrow?: string;
}) {
    return <PageHeader className="pagehead" title={title} subtitle={description}
        eyebrow={eyebrow ?? "PROJECT WORKSPACE"} actions={<div className="actions">{children}</div>} />;
}
export function RouteLink({ patch, children, className = "", current, appearance = "inline" }: {
    patch: Partial<Route>; children: ReactNode; className?: string; current?: boolean;
    appearance?: "inline" | "side";
}) {
    const props = { href: routeUrl(patch), className,
        "aria-current": current ? "page" as const : undefined,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
                event.preventDefault();
                navigate(patch);
            }
        } };
    return appearance === "side" ? <SideNavLink {...props}>{children}</SideNavLink> : <a {...props}>{children}</a>;
}
export function Modal({ title, children, onClose, wide = false, className = "" }: {
    title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string;
}) {
    const [viewport, setViewport] = useState(readVisibleViewport);
    const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" &&
        (window.matchMedia?.("(max-width: 760px)").matches ?? window.innerWidth <= 760));
    const [returnFocus] = useState<HTMLElement | null>(() => typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
    useEffect(() => {
        const visual = window.visualViewport;
        const mobileQuery = window.matchMedia?.("(max-width: 760px)");
        const update = () => setViewport(readVisibleViewport());
        const updateMobile = () => setIsMobile(mobileQuery?.matches ?? window.innerWidth <= 760);
        window.addEventListener("resize", update);
        visual?.addEventListener("resize", update);
        visual?.addEventListener("scroll", update);
        mobileQuery?.addEventListener("change", updateMobile);
        return () => {
            window.removeEventListener("resize", update);
            visual?.removeEventListener("resize", update);
            visual?.removeEventListener("scroll", update);
            mobileQuery?.removeEventListener("change", updateMobile);
        };
    }, []);
    const viewportStyle = {
        "--dialog-visible-top": `${viewport.top}px`,
        "--dialog-visible-height": `${viewport.height}px`,
        "--dialog-visible-bottom": `${viewport.bottom}px`,
    } as CSSProperties;
    return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
        <DialogContent size={isMobile ? "fullscreen" : wide ? "wide" : "default"} className={`projects-dialog ${className}`} style={viewportStyle}
            onCloseAutoFocus={event => { if (returnFocus?.isConnected) { event.preventDefault(); returnFocus.focus(); } }}>
            <DialogHeader className="modal-head"><DialogTitle>{title}</DialogTitle>
                <Button variant="ghost" className="plain" aria-label="대화상자 닫기" onClick={onClose}>닫기 ×</Button>
            </DialogHeader>
            <DialogDescription className="sr-only">{title} 작업을 진행합니다.</DialogDescription>
            <div className="modal-body">{children}</div>
        </DialogContent>
    </Dialog>;
}
function readVisibleViewport() {
    if (typeof window === "undefined") return { top: 0, height: 0, bottom: 0 };
    const visual = window.visualViewport;
    const top = visual?.offsetTop ?? 0;
    const height = visual?.height ?? window.innerHeight;
    return { top, height, bottom: Math.max(0, window.innerHeight - top - height) };
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
