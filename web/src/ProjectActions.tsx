import { useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuthenticationDraft, type AuthenticationDraft } from "./auth-drafts";
import { canProject } from "./ProjectPermissions";
import { navigate } from "./hooks";
import { downloadArchive, errorMessage } from "./api";
import type { Project } from "./models";
import { ProjectNameEdit } from "./ProjectNameEdit";
import { Button } from "./pydemia-ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./pydemia-ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "./pydemia-ui/popover";
const renameMenuDraftSchema = z.object({open: z.literal(true)}).strict();

export function ProjectActions({ project, onRenamed, disabled = false, recoverySurface = "list" }: {
    project: Project; onRenamed?: (project: Project) => void; disabled?: boolean;
    recoverySurface?: string;
}) {
    const recovery: AuthenticationDraft<z.infer<typeof renameMenuDraftSchema>> = useAuthenticationDraft(`project:${project.id}:rename-menu:${recoverySurface}`, renameMenuDraftSchema,
        () => renaming ? {open: true} : null);
    const [renaming, setRenaming] = useState(!!recovery.restored);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [renameBusy, setRenameBusy] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [dialogContainer, setDialogContainer] = useState<HTMLElement | undefined>(undefined);
    useLayoutEffect(() => {setDialogContainer(trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? undefined);}, []);
    async function exportProject() {
        if (busy || !canProject(project, "project.export")) return;
        setBusy(true); setError("");
        try {await downloadArchive(`/api/projects/${encodeURIComponent(project.id)}/export`, `${project.name.replace(/[<>:"/\\|?*]/g, "_")}-project.zip`);}
        catch (cause) {setError(errorMessage(cause));}
        finally {setBusy(false);}
    }
    return <Popover open={renaming} onOpenChange={open => {if (!renameBusy) {setRenaming(open); if (!open) recovery.clear();}}}><PopoverAnchor asChild><span className="project-actions">
        <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}><DropdownMenuTrigger asChild>
            <Button ref={trigger} variant="ghost" className="project-actions-trigger" disabled={disabled || busy} aria-label={`${project.name} 프로젝트 메뉴`}>⋯</Button>
        </DropdownMenuTrigger><DropdownMenuContent align="end" container={dialogContainer}>
            <DropdownMenuItem disabled={!canProject(project, "project.update")} onSelect={() => {if (!canProject(project, "project.update")) return; setRenaming(true); setError("");}}>이름 수정</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate({project: project.id, view: "project-settings", item: "", run: ""})}>프로젝트 설정 · 멤버·권한</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canProject(project, "project.export")} onSelect={() => void exportProject()}>프로젝트 ZIP 내려받기</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        {busy && <span role="status" className="muted small">ZIP 준비 중…</span>}
        {error && <span className="inline-edit-error" role="alert">{error}</span>}
    </span></PopoverAnchor><PopoverContent className="project-rename-inline" align="end" container={dialogContainer} aria-label="프로젝트명 수정"
        onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => {if (renameBusy) event.preventDefault();}}
        onCloseAutoFocus={event => {event.preventDefault(); trigger.current?.focus();}}>
        <ProjectNameEdit key={project.id} project={project} startEditing onPendingChange={setRenameBusy} recoverySurface={`menu:${recoverySurface}`}
            onSaved={onRenamed} onEditingChange={editing => {if (!editing) {setRenaming(false); recovery.clear();}}} />
    </PopoverContent></Popover>;
}
