import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { errorMessage } from "./api";
import { Markdown } from "./ui";
import { Button } from "./pydemia-ui/button";
import { Input } from "./pydemia-ui/input";
import { Textarea } from "./pydemia-ui/textarea";
import "./inline-edit.css";

type InlineEditProps = {
    label: string;
    value: string;
    onSave: (value: string) => Promise<void>;
    onBegin?: () => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    initialDraft?: string;
    onDraftChange?: (draft: string | null) => void;
    onEditingChange?: (editing: boolean) => void;
};

export type InlineTextEditProps = InlineEditProps & {
    required?: boolean;
    maxLength?: number;
    variant?: "title" | "plain";
    dragSurface?: boolean;
    preview?: ReactNode;
};

export type InlineBodyEditProps = InlineEditProps;

// Compose the existing Pydemia UI controls; the app owns draft/revision persistence.
// Pydemia Editable's explicit save/cancel flow informed this interaction.
function useInlineEdit({ value, onSave, onBegin, disabled, initialDraft, onDraftChange, onEditingChange }: InlineEditProps) {
    const [editing, setEditing] = useState(initialDraft !== undefined);
    const [draft, setDraft] = useState(initialDraft ?? value);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pendingRef = useRef(false);
    const restoreFocusRef = useRef(false);
    const previewRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
        } else if (restoreFocusRef.current) {
            previewRef.current?.focus();
            restoreFocusRef.current = false;
        }
    }, [editing]);

    function begin() {
        if (disabled || editing) return;
        onBegin?.();
        setDraft(value);
        setError(null);
        setEditing(true);
        onDraftChange?.(value);
        onEditingChange?.(true);
    }

    function close() {
        restoreFocusRef.current = true;
        setEditing(false);
        setError(null);
        onDraftChange?.(null);
        onEditingChange?.(false);
    }

    function cancel() {
        if (pendingRef.current) return;
        setDraft(value);
        close();
    }

    async function save(validationError?: string) {
        if (pendingRef.current || disabled) return;
        if (validationError) {
            setError(validationError);
            inputRef.current?.focus();
            return;
        }
        if (draft === value) {
            close();
            return;
        }
        pendingRef.current = true;
        setPending(true);
        setError(null);
        try {
            await onSave(draft);
            close();
        } catch (cause) {
            setError(errorMessage(cause));
            inputRef.current?.focus();
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    }

    function changeDraft(next: string) {
        if (pendingRef.current || disabled) return;
        setDraft(next);
        onDraftChange?.(next);
    }

    return { editing, draft, changeDraft, pending, error, begin, cancel, save, inputRef, previewRef };
}

function isComposing(event: KeyboardEvent) {
    return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

export function InlineTextEdit({ required = false, maxLength, variant = "plain", dragSurface = false, preview, ...props }: InlineTextEditProps) {
    const edit = useInlineEdit(props);
    const errorId = useId();
    const save = () => edit.save(required && !edit.draft.trim() ? "값을 입력해 주세요." : undefined);

    return <span className={`inline-edit inline-edit-${variant} ${props.className ?? ""}`} aria-busy={edit.pending}>
        {edit.editing ? <>
            <Input ref={node => { edit.inputRef.current = node; }} aria-label={props.label} value={edit.draft}
                required={required} maxLength={maxLength} placeholder={props.placeholder}
                disabled={props.disabled} readOnly={edit.pending} aria-invalid={!!edit.error}
                aria-describedby={edit.error ? errorId : undefined}
                onChange={event => edit.changeDraft(event.target.value)}
                onKeyDown={event => {
                    if (isComposing(event)) return;
                    if (event.key === "Escape") { event.preventDefault(); edit.cancel(); }
                    else if (event.key === "Enter") { event.preventDefault(); void save(); }
                }} />
            <span className="inline-edit-actions">
                <Button disabled={props.disabled || edit.pending} onClick={() => void save()}>
                    {edit.pending ? "저장 중…" : "저장"}
                </Button>
                <Button variant="ghost" disabled={edit.pending} onClick={edit.cancel}>취소</Button>
            </span>
            {edit.error && <span className="inline-edit-error" id={errorId} role="alert">{edit.error}</span>}
        </> : preview ? <span className="inline-edit-preview">
            {preview}
            <Button ref={edit.previewRef} variant="ghost" size="icon" className="inline-edit-trigger"
                aria-label={`${props.label} 수정`} disabled={props.disabled} onClick={edit.begin}><Pencil size={15} aria-hidden="true" /></Button>
        </span> : <button ref={edit.previewRef} type="button" data-ui="inline-edit-value" data-kanban-title-edit={dragSurface || undefined} className="inline-edit-value"
            aria-label={`${props.label} 수정`} disabled={props.disabled} onClick={edit.begin}>
            {props.value || <span className="inline-edit-placeholder">{props.placeholder ?? "클릭하여 작성"}</span>}
        </button>}
    </span>;
}

export function InlineBodyEdit(props: InlineBodyEditProps) {
    const edit = useInlineEdit(props);
    const errorId = useId();
    const hintId = useId();

    function beginFromBody(event: MouseEvent<HTMLDivElement>) {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, summary, [role='button'], [contenteditable='true']")) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        edit.begin();
    }

    return <div className={`inline-edit inline-body-edit ${props.className ?? ""}`} aria-busy={edit.pending}>
        {edit.editing ? <>
            <Textarea ref={node => { edit.inputRef.current = node; }} rows={12} aria-label={props.label} value={edit.draft}
                placeholder={props.placeholder} disabled={props.disabled} readOnly={edit.pending}
                aria-invalid={!!edit.error} aria-describedby={`${hintId}${edit.error ? ` ${errorId}` : ""}`}
                onChange={event => edit.changeDraft(event.target.value)}
                onKeyDown={event => {
                    if (isComposing(event)) return;
                    if (event.key === "Escape") { event.preventDefault(); edit.cancel(); }
                    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault(); void edit.save();
                    }
                }} />
            <div className="inline-edit-actions">
                <Button disabled={props.disabled || edit.pending} onClick={() => void edit.save()}>
                    {edit.pending ? "저장 중…" : "저장"}
                </Button>
                <Button variant="ghost" disabled={edit.pending} onClick={edit.cancel}>취소</Button>
                <span id={hintId} className="inline-edit-hint">Markdown · Ctrl/⌘ + Enter로 저장</span>
            </div>
            {edit.error && <p className="inline-edit-error" id={errorId} role="alert">{edit.error}</p>}
        </> : <>
            <div className={`inline-body-preview${props.disabled ? " is-disabled" : ""}`} onClick={beginFromBody}>
                {props.value ? <Markdown body={props.value} /> : <p className="inline-edit-placeholder">
                    {props.placeholder ?? "클릭하여 본문을 작성해 주세요."}
                </p>}
            </div>
            <Button ref={edit.previewRef} variant="ghost" className="inline-body-edit-trigger"
                aria-label={`${props.label} 수정`} disabled={props.disabled} onClick={edit.begin}>본문 수정</Button>
        </>}
    </div>;
}
