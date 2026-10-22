import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Dot } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./utils";
import { usePortalContainer } from "./foundation/portal-scope";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuGroup = MenuPrimitive.Group;
const DropdownMenuSub = MenuPrimitive.Sub;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const itemStyle =
    "relative flex cursor-default select-none items-center gap-2 " +
    "min-w-0 rounded-sm px-[var(--space-3)] py-2 text-sm outline-none " +
    "[overflow-wrap:anywhere] " +
    "data-[highlighted]:bg-surface-subtle " +
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

const contentStyle =
    "z-50 min-w-[min(10rem,var(--radix-dropdown-menu-content-available-width))] " +
    "max-w-[var(--radix-dropdown-menu-content-available-width)] " +
    "max-h-[var(--radix-dropdown-menu-content-available-height)] " +
    "overflow-y-auto rounded-sm border border-border bg-surface " +
    "p-1 text-foreground shadow-[var(--shadow-float)]";

function DropdownMenuContent({
    container,
    className, sideOffset = 4, ...props
}: ComponentProps<typeof MenuPrimitive.Content> &
    Pick<ComponentProps<typeof MenuPrimitive.Portal>, "container">) {
    const portalContainer = usePortalContainer(container);
    return (
        <MenuPrimitive.Portal container={portalContainer}>
            <MenuPrimitive.Content
                data-ui="overlay-panel"
                sideOffset={sideOffset}
                className={cn(contentStyle, className)}
                {...props}
            />
        </MenuPrimitive.Portal>
    );
}

type DropdownMenuItemProps =
    ComponentProps<typeof MenuPrimitive.Item> & {
        variant?: "default" | "danger";
    };

function DropdownMenuItem({
    className, variant = "default", ...props
}: DropdownMenuItemProps) {
    return (
        <MenuPrimitive.Item
            className={cn(
                itemStyle,
                variant === "danger" && "text-danger",
                className,
            )}
            {...props}
        />
    );
}

function DropdownMenuLabel({
    className, ...props
}: ComponentProps<typeof MenuPrimitive.Label>) {
    return (
        <MenuPrimitive.Label
            className={cn(
                "px-[var(--space-3)] py-2 text-xs font-semibold text-muted",
                className,
            )}
            {...props}
        />
    );
}

function DropdownMenuSeparator({
    className, ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
    return (
        <MenuPrimitive.Separator
            className={cn("my-1 h-px bg-border", className)}
            {...props}
        />
    );
}

function DropdownMenuCheckboxItem({
    className, children, ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
    return (
        <MenuPrimitive.CheckboxItem
            className={cn(itemStyle, "pl-8", className)}
            {...props}
        >
            <span className="absolute left-2 inline-flex size-4 items-center">
                <MenuPrimitive.ItemIndicator>
                    <Check aria-hidden="true" className="size-4" />
                </MenuPrimitive.ItemIndicator>
            </span>
            {children}
        </MenuPrimitive.CheckboxItem>
    );
}

function DropdownMenuRadioItem({
    className, children, ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
    return (
        <MenuPrimitive.RadioItem
            className={cn(itemStyle, "pl-8", className)}
            {...props}
        >
            <span className="absolute left-2 inline-flex size-4 items-center">
                <MenuPrimitive.ItemIndicator>
                    <Dot aria-hidden="true" className="size-4" />
                </MenuPrimitive.ItemIndicator>
            </span>
            {children}
        </MenuPrimitive.RadioItem>
    );
}

function DropdownMenuSubTrigger({
    className, children, ...props
}: ComponentProps<typeof MenuPrimitive.SubTrigger>) {
    return (
        <MenuPrimitive.SubTrigger
            className={cn(itemStyle, className)}
            {...props}
        >
            {children}
            <ChevronRight aria-hidden="true"
                className="ml-auto size-4 rtl:rotate-180" />
        </MenuPrimitive.SubTrigger>
    );
}

function DropdownMenuSubContent({
    container,
    className, sideOffset = 4, ...props
}: ComponentProps<typeof MenuPrimitive.SubContent> &
    Pick<ComponentProps<typeof MenuPrimitive.Portal>, "container">) {
    const portalContainer = usePortalContainer(container);
    return (
        <MenuPrimitive.Portal container={portalContainer}>
            <MenuPrimitive.SubContent
                data-ui="overlay-panel"
                sideOffset={sideOffset}
                className={cn(contentStyle, className)}
                {...props}
            />
        </MenuPrimitive.Portal>
    );
}

export {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
    DropdownMenuGroup, DropdownMenuCheckboxItem, DropdownMenuRadioGroup,
    DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubTrigger,
    DropdownMenuSubContent,
};
export type { DropdownMenuItemProps };
