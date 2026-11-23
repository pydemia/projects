import { useId, type ReactNode } from "react";
import { useMobileViewport } from "./hooks";
import { SidebarResizeHandle, useSidebarResize } from "./pydemia-ui/sidebar-resize";

export function CollectionLayout({ list, children, selected, className = "" }: {
    list: ReactNode;
    children: ReactNode;
    selected: boolean;
    className?: string;
}) {
    const mobile = useMobileViewport();
    const listId = useId();
    const { panelRef, style, handle } = useSidebarResize({
        defaultWidth: 360,
        minWidth: 216,
        maxWidth: 560,
        contentWidth: available => Math.max(352, Math.ceil(available * 0.54)),
        enabled: !mobile,
        storageKey: "projects:collection-width",
    });
    return <div className={`document-layout collection-layout ${className} ${selected ? "has-selection" : ""}`} style={style}>
        <section id={listId} ref={panelRef} className="workspace-list-pane">{list}</section>
        {!mobile && <SidebarResizeHandle {...handle} label="목록 너비" controls={listId} className="workspace-list-divider" />}
        {children}
    </div>;
}
