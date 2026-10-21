import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";

type NativeSelectProps = ComponentProps<"select"> & {
    appearance?: "outline" | "filled" | "underline";
};

function NativeSelect({
    appearance = "outline", className, ...props
}: NativeSelectProps) {
    if (!["outline", "filled", "underline"].includes(appearance)) {
        throw new RangeError("NativeSelect appearance is not supported.");
    }

    return (
        <div className="relative w-full">
            <select
                data-ui="native-select"
                data-appearance={appearance}
                className={cn(
                    "h-[var(--control-height)] w-full appearance-none rounded-sm " +
                    "border border-border bg-surface px-[var(--space-3)] " +
                    "pr-9 text-sm text-foreground disabled:cursor-not-allowed " +
                    "disabled:opacity-50 aria-invalid:border-danger",
                    appearance === "filled" &&
                        "border-transparent bg-surface-subtle",
                    appearance === "underline" &&
                        "rounded-none border-x-0 border-t-0 bg-transparent pl-0",
                    className,
                )}
                {...props}
            />
            <ChevronDown
                aria-hidden="true"
                className={
                    "pointer-events-none absolute right-3 top-1/2 size-4 " +
                    "-translate-y-1/2 text-muted"
                }
            />
        </div>
    );
}

export { NativeSelect };
export type { NativeSelectProps };
