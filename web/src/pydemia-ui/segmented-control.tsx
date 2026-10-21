import {
    Children, createContext, isValidElement, useContext,
    type ComponentProps, type ReactNode,
} from "react";
import { cn } from "./utils";

type SegmentedControlProps = Omit<ComponentProps<"fieldset">, "children"> & {
    label: string;
    name: string;
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    required?: boolean;
    children: ReactNode;
};

type SegmentedControlContextValue = Pick<
    SegmentedControlProps,
    "name" | "value" | "defaultValue" | "onValueChange" | "required"
>;

const SegmentedControlContext =
    createContext<SegmentedControlContextValue | null>(null);

function SegmentedControl({
    label,
    name,
    value,
    defaultValue,
    onValueChange,
    required,
    children,
    className,
    ...props
}: SegmentedControlProps) {
    if (typeof label !== "string" || !label.trim()) {
        throw new Error("SegmentedControl requires a label.");
    }
    if (typeof name !== "string" || !name.trim()) {
        throw new Error("SegmentedControl requires a form name.");
    }
    const items = Children.toArray(children);
    if (items.length === 0) {
        throw new Error("SegmentedControl requires at least one item.");
    }
    const values = new Set<string>();
    for (const item of items) {
        if (!isValidElement<SegmentedControlItemProps>(item) ||
            item.type !== SegmentedControlItem) {
            throw new Error("SegmentedControl requires direct items.");
        }
        if (values.has(item.props.value)) {
            throw new Error("SegmentedControl item values must be unique.");
        }
        values.add(item.props.value);
    }

    return (
        <SegmentedControlContext.Provider value={{
            name, value, defaultValue, onValueChange, required,
        }}>
            <fieldset {...props}
                className={cn("min-w-0 border-0 p-0", className)}>
                <legend className="sr-only">{label}</legend>
                <div className={
                    "inline-flex max-w-full gap-1 overflow-x-auto rounded-sm " +
                    "border border-border bg-surface-subtle p-1"
                } data-ui="segmented-control">
                    {children}
                </div>
            </fieldset>
        </SegmentedControlContext.Provider>
    );
}

type SegmentedControlItemProps = Omit<
    ComponentProps<"input">,
    "type" | "name" | "value" | "checked" | "defaultChecked" |
    "onChange" | "children"
> & {
    value: string;
    children: string;
};

function SegmentedControlItem({
    value,
    children,
    className,
    disabled,
    ...props
}: SegmentedControlItemProps) {
    const group = useContext(SegmentedControlContext);
    if (!group) {
        throw new Error("SegmentedControlItem requires SegmentedControl.");
    }
    if (typeof value !== "string" || !value.trim()) {
        throw new Error("SegmentedControlItem requires a value.");
    }
    if (typeof children !== "string" || !children.trim()) {
        throw new Error("SegmentedControlItem requires visible text.");
    }

    return (
        <label data-disabled={disabled ? "" : undefined}
            className={cn(
                "shrink-0 cursor-pointer data-[disabled]:cursor-not-allowed " +
                "data-[disabled]:opacity-50",
                className,
            )}>
            <input {...props} type="radio" name={group.name} value={value}
                disabled={disabled} required={group.required}
                checked={group.value === undefined
                    ? undefined : group.value === value}
                defaultChecked={group.value === undefined
                    ? group.defaultValue === value : undefined}
                onChange={() => group.onValueChange?.(value)}
                className="peer sr-only" />
            <span data-slot="segment" className={
                "inline-flex min-h-8 items-center justify-center rounded-sm " +
                "px-[var(--space-3)] text-sm font-medium text-foreground " +
                "transition-colors duration-[var(--motion-fast)] " +
                "peer-checked:bg-accent " +
                "peer-checked:text-accent-foreground " +
                "peer-focus-visible:outline-2 " +
                "peer-focus-visible:outline-focus " +
                "peer-focus-visible:outline-offset-2"
            }>{children}</span>
        </label>
    );
}

export { SegmentedControl, SegmentedControlItem };
export type { SegmentedControlProps, SegmentedControlItemProps };
