import type { ComponentProps, ReactNode } from "react";
import { Card } from "./card";
import { cn } from "./utils";

type MetricCardProps = Omit<
    ComponentProps<typeof Card>, "children" | "variant" | "size"
> & {
    label: string;
    value: ReactNode;
    change?: string;
    detail?: string;
    variant?: "default" | "compact" | "featured";
};

const variantClasses = {
    default: "min-w-0 p-[var(--space-4)]",
    compact: "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] " +
        "items-baseline gap-x-[var(--space-3)] gap-y-[var(--space-1)] " +
        "p-[var(--space-3)]",
    featured: "min-w-0 border-accent bg-accent p-[var(--space-6)] " +
        "text-accent-foreground",
} as const;

function MetricCard({
    className,
    label,
    value,
    change,
    detail,
    variant = "default",
    ...props
}: MetricCardProps) {
    if (!Object.hasOwn(variantClasses, variant)) {
        throw new RangeError("MetricCard variant is not supported.");
    }

    return (
        <Card
            role="group"
            aria-label={label}
            data-variant={variant}
            className={cn(variantClasses[variant], className)}
            {...props}
        >
            <p className={cn(
                "text-sm text-muted",
                variant === "compact" && "text-xs",
                variant === "featured" && "text-accent-foreground",
            )}>{label}</p>
            <p className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                variant === "compact" && "mt-0 text-lg",
                variant === "featured" && "text-3xl",
            )}>{value}</p>
            {(change || detail) && (
                <p className={cn(
                    "mt-2 text-xs text-muted",
                    variant === "compact" && "col-span-2 mt-0",
                    variant === "featured" &&
                        "text-sm text-accent-foreground",
                )}>
                    {change && <span className={cn(
                        "font-medium text-foreground",
                        variant === "featured" && "text-accent-foreground",
                    )}>{change}</span>}
                    {change && detail && " · "}
                    {detail}
                </p>
            )}
        </Card>
    );
}

export { MetricCard };
export type { MetricCardProps };
