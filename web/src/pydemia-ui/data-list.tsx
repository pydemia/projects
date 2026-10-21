import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./utils";

type DataListItem = {
    id: string;
    label: string;
    value: ReactNode | null;
};

type DataListProps = Omit<
    ComponentProps<"div">, "children" | "aria-labelledby"
> & {
    label: string;
    items: readonly DataListItem[];
    layout?: "rows" | "grid";
    emptyText?: string;
    missingText?: string;
};

function DataList({
    label,
    items,
    layout = "rows",
    emptyText = "표시할 정보가 없습니다.",
    missingText = "값 없음",
    className,
    ...props
}: DataListProps) {
    const labelId = useId();
    if (typeof label !== "string" || !label.trim()) {
        throw new Error("DataList requires a label.");
    }
    if (!Array.isArray(items)) {
        throw new TypeError("DataList items must be an array.");
    }
    if (layout !== "rows" && layout !== "grid") {
        throw new RangeError("DataList layout is not supported.");
    }
    if (typeof emptyText !== "string" || !emptyText.trim() ||
        typeof missingText !== "string" || !missingText.trim()) {
        throw new Error("DataList requires empty and missing text.");
    }

    const ids = new Set<string>();
    for (const item of items) {
        if (!item || typeof item.id !== "string" || !item.id.trim() ||
            typeof item.label !== "string" || !item.label.trim() ||
            !Object.hasOwn(item, "value") || item.value === undefined) {
            throw new Error("DataList items need id, label and value.");
        }
        if (ids.has(item.id)) {
            throw new Error(`DataList id is duplicated: ${item.id}`);
        }
        ids.add(item.id);
    }

    return (
        <div {...props} role="group" aria-labelledby={labelId}
            className={cn("@container min-w-0", className)}>
            <p id={labelId}
                className={
                    "m-0 mb-[var(--space-2)] text-sm font-medium " +
                    "text-foreground"
                }>
                {label}
            </p>
            {items.length === 0 ? (
                <p className="m-0 text-sm text-muted">{emptyText}</p>
            ) : (
                <dl className={cn(
                    "m-0 grid gap-x-[var(--space-4)] gap-y-[var(--space-2)]",
                    layout === "grid" && "@xs:grid-cols-2",
                )}>
                    {items.map((item) => (
                        <div key={item.id} className={cn(
                            "min-w-0",
                            layout === "rows" &&
                                "grid grid-cols-2 gap-[var(--space-3)]",
                        )}>
                            <dt className="min-w-0 text-sm text-muted">
                                {item.label}
                            </dt>
                            <dd className={cn(
                                "m-0 min-w-0 break-words text-sm " +
                                "font-medium text-foreground",
                                layout === "rows" && "text-right",
                                layout === "grid" && "mt-[var(--space-1)]",
                            )}>
                                {item.value === null ? missingText : item.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

export { DataList };
export type { DataListItem, DataListProps };
