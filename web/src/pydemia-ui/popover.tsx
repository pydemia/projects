import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "./utils";
import { usePortalContainer } from "./foundation/portal-scope";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;
const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
    container,
    className,
    align = "center",
    sideOffset = 6,
    ...props
}: ComponentProps<typeof PopoverPrimitive.Content> &
    Pick<ComponentProps<typeof PopoverPrimitive.Portal>, "container">) {
    const portalContainer = usePortalContainer(container);
    return (
        <PopoverPrimitive.Portal container={portalContainer}>
            <PopoverPrimitive.Content
                data-ui="overlay-panel"
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    "z-50 w-72 max-w-[calc(100vw-2rem)] rounded-sm border " +
                    "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto " +
                    "[overflow-wrap:anywhere] " +
                    "border-border bg-surface p-[var(--space-4)] text-foreground " +
                    "shadow-[var(--shadow-float)]",
                    className,
                )}
                {...props}
            />
        </PopoverPrimitive.Portal>
    );
}

export { Popover, PopoverTrigger, PopoverClose, PopoverAnchor, PopoverContent };
