import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const alertVariants = cva(
    "grid gap-1 rounded-sm border p-[var(--space-4)] text-sm",
    {
        variants: {
            variant: {
                default: "text-foreground",
                info: "text-accent",
                success: "text-success",
                warning: "text-warning",
                destructive: "text-danger",
            },
            appearance: {
                outline: "bg-surface",
                soft: "border-transparent",
                plain: "border-transparent bg-transparent px-0 " +
                    "py-[var(--space-2)]",
            },
        },
        compoundVariants: [
            { variant: "default", appearance: "outline",
                class: "border-border" },
            { variant: "info", appearance: "outline",
                class: "border-accent" },
            { variant: "success", appearance: "outline",
                class: "border-success" },
            { variant: "warning", appearance: "outline",
                class: "border-warning" },
            { variant: "destructive", appearance: "outline",
                class: "border-danger" },
            { variant: "default", appearance: "soft",
                class: "bg-surface-subtle" },
            { variant: "info", appearance: "soft",
                class: "bg-accent/10" },
            { variant: "success", appearance: "soft",
                class: "bg-success/10" },
            { variant: "warning", appearance: "soft",
                class: "bg-warning/10" },
            { variant: "destructive", appearance: "soft",
                class: "bg-danger/10" },
        ],
        defaultVariants: { variant: "default", appearance: "outline" },
    },
);

type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

function Alert({
    className,
    variant = "default",
    appearance = "outline",
    ...props
}: AlertProps) {
    return (
        <div
            role={variant === "destructive" ? "alert" : "status"}
            data-ui="alert"
            data-variant={variant}
            data-appearance={appearance}
            data-surface={appearance === "plain" ? undefined : "status"}
            className={cn(alertVariants({ variant, appearance }), className)}
            {...props}
        />
    );
}

function AlertTitle({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="surface-title"
        className={cn("font-semibold", className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<"div">) {
    return <div className={cn("leading-relaxed", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
export type { AlertProps };
