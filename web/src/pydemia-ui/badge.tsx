import type { ComponentProps } from "react";
import { cn } from "./utils";

type BadgeProps = ComponentProps<"span"> & {
    variant?: "default" | "outline" | "accent" | "danger";
};

const variantClasses = {
    default: "border-border bg-surface-subtle text-foreground",
    outline: "border-border bg-transparent text-foreground",
    accent: "border-accent bg-accent text-accent-foreground",
    danger: "border-danger bg-surface text-danger",
} as const;

function Badge({
    className,
    variant = "default",
    ...props
}: BadgeProps) {
    if (!Object.hasOwn(variantClasses, variant)) {
        throw new RangeError("Badge variant is not supported.");
    }

    return (
        <span
            data-ui="badge"
            data-variant={variant}
            className={cn(
                "inline-flex items-center rounded-sm border px-2 py-0.5 " +
                "text-xs font-medium",
                variantClasses[variant],
                className,
            )}
            {...props}
        />
    );
}

export { Badge };
export type { BadgeProps };
