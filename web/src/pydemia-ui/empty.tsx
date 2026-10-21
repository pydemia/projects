import type { ComponentProps } from "react";
import { cn } from "./utils";

type EmptyProps = ComponentProps<"div"> & {
    appearance?: "dashed" | "panel" | "plain";
};

function Empty({
    appearance = "dashed", className, ...props
}: EmptyProps) {
    if (!["dashed", "panel", "plain"].includes(appearance)) {
        throw new RangeError("Empty appearance is not supported.");
    }

    return (
        <div
            data-ui="empty"
            data-appearance={appearance}
            data-surface={appearance === "panel"
                ? "panel" : appearance === "dashed" ? "drop-target" : undefined}
            className={cn(
                "flex min-w-0 flex-col items-center gap-3 rounded-sm " +
                "text-center",
                appearance === "dashed" &&
                    "border border-dashed border-border " +
                    "bg-surface-subtle p-[var(--space-6)]",
                appearance === "panel" &&
                    "border border-border bg-surface p-[var(--space-6)]",
                appearance === "plain" &&
                    "bg-transparent p-[var(--space-4)]",
                className,
            )}
            {...props}
        />
    );
}

function EmptyMedia({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            aria-hidden="true"
            className={cn("text-muted [&_svg]:size-6", className)}
            {...props}
        />
    );
}

function EmptyTitle({ className, ...props }: ComponentProps<"h3">) {
    return <h3 data-slot="surface-title"
        className={cn("font-semibold", className)} {...props} />;
}

function EmptyDescription({ className, ...props }: ComponentProps<"p">) {
    return <p className={cn("text-sm text-muted", className)} {...props} />;
}

function EmptyContent({ className, ...props }: ComponentProps<"div">) {
    return <div className={cn("flex flex-wrap justify-center gap-2", className)} {...props} />;
}

export { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent };
export type { EmptyProps };
