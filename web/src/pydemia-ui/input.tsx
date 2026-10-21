import type { ComponentProps } from "react";
import { cn } from "./utils";

type InputProps = ComponentProps<"input"> & {
    appearance?: "outline" | "filled" | "underline";
};

function Input({
    appearance = "outline", className, type = "text", ...props
}: InputProps) {
    if (!["outline", "filled", "underline"].includes(appearance)) {
        throw new RangeError("Input appearance is not supported.");
    }

    return (
        <input
            type={type}
            data-ui="input"
            data-appearance={appearance}
            className={cn(
                "h-[var(--control-height)] w-full min-w-0 rounded-sm border " +
                "border-border bg-surface px-[var(--space-3)] text-sm text-foreground " +
                "placeholder:text-muted disabled:cursor-not-allowed " +
                "disabled:opacity-50 aria-invalid:border-danger",
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

export { Input };
export type { InputProps };
