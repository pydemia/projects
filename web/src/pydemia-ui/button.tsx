import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
    "inline-flex h-[var(--control-height)] items-center justify-center " +
    "gap-2 rounded-sm border px-[var(--space-3)] text-sm font-medium " +
    "transition-colors duration-[var(--motion-fast)] " +
    "disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                primary: "border-accent bg-accent text-accent-foreground " +
                    "hover:opacity-90",
                outline: "border-border bg-surface text-foreground " +
                    "hover:bg-surface-subtle",
                ghost: "border-transparent bg-transparent text-foreground " +
                    "hover:bg-surface-subtle",
            },
            size: {
                default: "px-[var(--space-3)]",
                icon: "w-[var(--control-height)] px-0",
            },
        },
        defaultVariants: { variant: "primary", size: "default" },
    },
);

type ButtonProps = ComponentProps<"button"> &
    VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
    return (
        <button
            type={type}
            data-ui="button"
            data-variant={variant ?? "primary"}
            className={cn(buttonVariants({ variant, size }), className)}
            {...props}
        />
    );
}

export { Button, buttonVariants };
export type { ButtonProps };
