import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { useId, type ComponentProps } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "./utils";

type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> & (
    | { variant?: "default"; label?: never; description?: never }
    | { variant: "card"; label: string; description?: string }
);

function Checkbox({
    className, variant = "default", label, description, ...props
}: CheckboxProps) {
    const generatedId = useId();
    const card = variant === "card";
    if (card && (typeof label !== "string" || !label.trim())) {
        throw new Error("Checkbox card requires a label.");
    }
    const labelId = `${generatedId}-label`;
    const descriptionId = `${generatedId}-description`;
    const describedBy = card && description
        ? [props["aria-describedby"], descriptionId].filter(Boolean).join(" ")
        : props["aria-describedby"];
    const indicator = <CheckboxPrimitive.Indicator
        className="text-accent-foreground">
        <Check aria-hidden="true"
            className="size-3 group-data-[state=indeterminate]:hidden" />
        <Minus aria-hidden="true"
            className="hidden size-3 group-data-[state=indeterminate]:block" />
    </CheckboxPrimitive.Indicator>;

    return (
        <CheckboxPrimitive.Root
            data-ui="checkbox-control"
            data-variant={variant}
            {...props}
            className={cn(
                "group relative inline-flex shrink-0 items-center rounded-sm " +
                "border border-border bg-surface text-foreground " +
                "data-[state=checked]:border-accent data-[state=checked]:bg-accent " +
                "data-[state=indeterminate]:border-accent " +
                "data-[state=indeterminate]:bg-accent " +
                "aria-invalid:border-danger disabled:cursor-not-allowed " +
                "disabled:opacity-50 focus-visible:outline-2 " +
                "focus-visible:outline-offset-2 focus-visible:outline-focus",
                card
                    ? "min-h-16 w-full justify-start gap-3 p-[var(--space-3)] " +
                      "text-left text-sm data-[state=checked]:bg-surface-subtle " +
                      "data-[state=indeterminate]:bg-surface-subtle"
                    : "size-5 justify-center text-accent-foreground " +
                      "after:absolute after:-inset-1",
                className,
            )}
            aria-labelledby={card && !props["aria-label"]
                ? props["aria-labelledby"] ?? labelId
                : props["aria-labelledby"]}
            aria-describedby={describedBy}
        >
            {card ? <span aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-sm border border-border group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent group-data-[state=indeterminate]:border-accent group-data-[state=indeterminate]:bg-accent">
                {indicator}
            </span> : indicator}
            {card && <span className="grid min-w-0 gap-1">
                <span id={labelId} className="font-medium">{label}</span>
                {description && <span id={descriptionId}
                    className="text-xs text-muted">{description}</span>}
            </span>}
        </CheckboxPrimitive.Root>
    );
}

export { Checkbox };
export type { CheckboxProps };
