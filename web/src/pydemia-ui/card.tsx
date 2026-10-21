import type { ComponentProps } from "react";
import { cn } from "./utils";

type CardProps = ComponentProps<"div"> & {
    variant?: "default" | "subtle" | "elevated";
    size?: "default" | "compact";
};

const cardVariants = {
    default: "border-border bg-surface",
    subtle: "border-transparent bg-surface-subtle",
    elevated: "border-border bg-surface shadow-[var(--shadow-float)]",
} as const;

const cardSizes = {
    default: "[--card-spacing:var(--space-4)]",
    compact: "[--card-spacing:var(--space-3)]",
} as const;

function Card({
    variant = "default",
    size = "default",
    className,
    ...props
}: CardProps) {
    if (!Object.hasOwn(cardVariants, variant)) {
        throw new RangeError("Card variant is not supported.");
    }
    if (!Object.hasOwn(cardSizes, size)) {
        throw new RangeError("Card size is not supported.");
    }

    return (
        <div
            data-ui="card"
            className={cn(
                "rounded-sm border text-foreground",
                cardVariants[variant], cardSizes[size],
                className,
            )}
            data-variant={variant}
            data-size={size}
            {...props}
        />
    );
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "grid gap-1 px-[var(--card-spacing,var(--space-4))] " +
                "pt-[var(--card-spacing,var(--space-4))]",
                className,
            )}
            {...props}
        />
    );
}

function CardTitle({ className, ...props }: ComponentProps<"div">) {
    return <div data-ui="heading" className={cn("font-semibold", className)} {...props} />;
}

function CardDescription({ className, ...props }: ComponentProps<"div">) {
    return <div className={cn("text-sm text-muted", className)} {...props} />;
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "px-[var(--card-spacing,var(--space-4))] " +
                "py-[var(--card-spacing,var(--space-4))]",
                className,
            )}
            {...props}
        />
    );
}

function CardFooter({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "flex items-center gap-2 " +
                "px-[var(--card-spacing,var(--space-4))] " +
                "pb-[var(--card-spacing,var(--space-4))]",
                className,
            )}
            {...props}
        />
    );
}

export {
    Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
};
export type { CardProps };
