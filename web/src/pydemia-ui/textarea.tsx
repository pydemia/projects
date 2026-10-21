import type { ComponentProps } from "react";
import { cn } from "./utils";

type TextareaProps = ComponentProps<"textarea"> & {
    appearance?: "outline" | "filled" | "underline";
};

function Textarea({
    appearance = "outline", className, ...props
}: TextareaProps) {
    if (!["outline", "filled", "underline"].includes(appearance)) {
        throw new RangeError("Textarea appearance is not supported.");
    }

    return (
        <textarea
            data-ui="textarea"
            data-appearance={appearance}
            className={cn(
                "min-h-24 w-full min-w-0 rounded-sm border border-border " +
                "bg-surface px-[var(--space-3)] py-[var(--space-2)] " +
                "text-sm text-foreground placeholder:text-muted " +
                "disabled:cursor-not-allowed disabled:opacity-50 " +
                "aria-invalid:border-danger",
                appearance === "filled" &&
                    "border-transparent bg-surface-subtle",
                appearance === "underline" &&
                    "rounded-none border-x-0 border-t-0 bg-transparent px-0",
                className,
            )}
            {...props}
        />
    );
}

export { Textarea };
export type { TextareaProps };
