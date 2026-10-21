import type { ComponentProps } from "react";
import { cn } from "./utils";

function Label({ className, ...props }: ComponentProps<"label">) {
    return (
        <label
            className={cn("block text-sm font-medium text-foreground", className)}
            {...props}
        />
    );
}

export { Label };
