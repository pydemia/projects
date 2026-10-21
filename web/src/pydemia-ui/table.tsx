import type { ComponentProps } from "react";
import { cn } from "./utils";

type TableProps = ComponentProps<"table"> & {
    appearance?: "lined" | "grid" | "plain";
};

const appearanceClasses = {
    lined: "",
    grid: "border border-border [&>*>tr>*]:border",
    plain: "[&>*>tr>*]:border-0",
} as const;

function Table({
    appearance = "lined", className, ...props
}: TableProps) {
    if (!Object.hasOwn(appearanceClasses, appearance)) {
        throw new RangeError("Table appearance is not supported.");
    }

    return <table
        data-appearance={appearance}
        className={cn(
            "w-full border-collapse text-sm",
            appearanceClasses[appearance], className,
        )}
        {...props}
    />;
}

function TableHead({ className, ...props }: ComponentProps<"th">) {
    return (
        <th
            className={cn(
                "border-b border-border px-[var(--space-3)] py-2 text-left font-medium text-muted",
                className,
            )}
            {...props}
        />
    );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
    return (
        <td
            className={cn("border-b border-border px-[var(--space-3)] py-[var(--density-row-block)]", className)}
            {...props}
        />
    );
}

export { Table, TableHead, TableCell };
export type { TableProps };
