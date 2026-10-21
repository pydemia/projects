import type { ComponentProps } from "react";
import { cn } from "./utils";

type BarListItem = {
    id: string;
    label: string;
    value: number;
    valueText?: string;
};

type BarListProps = Omit<ComponentProps<"figure">, "children" | "title"> & {
    title: string;
    description?: string;
    items: readonly BarListItem[];
    max?: number;
    unit?: string;
    variant?: "panel" | "plain";
    emptyText?: string;
};

function BarList({
    title,
    description,
    items,
    max,
    unit = "",
    variant = "panel",
    emptyText = "표시할 데이터가 없습니다.",
    className,
    ...props
}: BarListProps) {
    if (typeof title !== "string" || !title.trim()) {
        throw new Error("BarList requires a title.");
    }
    if (!Array.isArray(items)) {
        throw new TypeError("BarList items must be an array.");
    }
    if (variant !== "panel" && variant !== "plain") {
        throw new RangeError("BarList variant is not supported.");
    }
    if (typeof emptyText !== "string" || !emptyText.trim()) {
        throw new Error("BarList requires empty text.");
    }
    if (max !== undefined && (!Number.isFinite(max) || max <= 0)) {
        throw new RangeError("BarList max must be positive and finite.");
    }

    const ids = new Set<string>();
    let largest = 0;
    for (const item of items) {
        if (!item || typeof item.id !== "string" || !item.id.trim() ||
            typeof item.label !== "string" || !item.label.trim() ||
            !Number.isFinite(item.value) || item.value < 0 ||
            (item.valueText !== undefined &&
                (typeof item.valueText !== "string" ||
                    !item.valueText.trim()))) {
            throw new RangeError(
                "BarList items need an id, label and nonnegative finite value.",
            );
        }
        if (ids.has(item.id)) {
            throw new Error(`BarList id is duplicated: ${item.id}`);
        }
        ids.add(item.id);
        largest = Math.max(largest, item.value);
    }
    if (max !== undefined && largest > max) {
        throw new RangeError("BarList max cannot be below an item value.");
    }
    const scale = max ?? (largest || 1);

    return (
        <figure {...props} data-ui="bar-list" data-variant={variant}
            data-surface={variant === "panel" ? "panel" : undefined}
            className={cn(
            "@container m-0 min-w-0 text-foreground",
            variant === "panel" &&
                "rounded-sm border border-border bg-surface p-[var(--space-4)]",
            className,
        )}>
            <figcaption className="mb-[var(--space-4)]">
                <strong data-slot="surface-heading"
                    className="text-sm font-semibold">{title}</strong>
                {description && (
                    <span data-slot="surface-meta"
                        className="mt-1 block text-xs text-muted">
                        {description}
                    </span>
                )}
            </figcaption>
            {items.length === 0 ? (
                <p className="m-0 text-sm text-muted">{emptyText}</p>
            ) : (
                <ul className="m-0 grid min-w-0 list-none gap-[var(--space-3)] p-0">
                    {items.map((item) => (
                        <li key={item.id} className="min-w-0">
                            <div className={
                                "flex min-w-0 items-baseline justify-between " +
                                "gap-[var(--space-3)] text-sm"
                            }>
                                <span className="min-w-0 break-words">
                                    {item.label}
                                </span>
                                <span className="shrink-0 font-medium tabular-nums">
                                    {item.valueText ?? `${item.value}${unit}`}
                                </span>
                            </div>
                            <div aria-hidden="true" className={cn(
                                "mt-[var(--space-1)] h-2.5 overflow-hidden rounded-full",
                                variant === "panel" && "bg-surface-subtle",
                            )}>
                                <div className="h-full rounded-full bg-accent"
                                    style={{ width: `${item.value / scale * 100}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </figure>
    );
}

export { BarList };
export type { BarListItem, BarListProps };
