import type { ComponentProps, ReactNode } from "react";
import { cn } from "./utils";

type NamedNavProps = ComponentProps<"nav"> & { "aria-label": string };
type BottomNavProps = NamedNavProps & {
    appearance?: "bar" | "dock";
};

function GlobalNav({ className, ...props }: NamedNavProps) {
    return (
        <nav
            className={cn(
                "flex min-w-0 items-center gap-1 overflow-x-auto",
                className,
            )}
            {...props}
            data-ui="global-nav"
        />
    );
}

type GlobalNavLinkProps = ComponentProps<"a"> & {
    variant?: "surface" | "underline";
};

function GlobalNavLink({
    variant = "surface",
    className,
    ...props
}: GlobalNavLinkProps) {
    return (
        <a
            className={cn(
                "shrink-0 px-[var(--space-3)] py-[var(--space-2)] " +
                "text-sm text-muted hover:text-foreground " +
                "aria-[current=page]:font-semibold",
                variant === "surface"
                    ? "rounded-sm hover:bg-surface-subtle " +
                      "aria-[current=page]:bg-surface-subtle " +
                      "aria-[current=page]:text-foreground"
                    : "border-b-2 border-transparent " +
                      "aria-[current=page]:border-accent " +
                      "aria-[current=page]:text-accent",
                className,
            )}
            data-variant={variant}
            {...props}
            data-slot="nav-link"
        />
    );
}

function SideNav({ className, ...props }: NamedNavProps) {
    return (
        <nav
            className={cn("grid min-w-0 gap-1", className)}
            {...props}
            data-ui="side-nav"
        />
    );
}

type SideNavLinkProps = ComponentProps<"a"> & {
    variant?: "rail" | "filled";
};

function SideNavLink({
    variant = "rail",
    className,
    ...props
}: SideNavLinkProps) {
    return (
        <a
            className={cn(
                "block rounded-sm px-[var(--space-3)] py-[var(--space-2)] " +
                "text-sm text-muted hover:bg-surface " +
                "hover:text-foreground aria-[current=page]:font-semibold",
                variant === "rail"
                    ? "border-l-2 border-transparent " +
                      "aria-[current=page]:border-accent " +
                      "aria-[current=page]:bg-surface " +
                      "aria-[current=page]:text-accent"
                    : "aria-[current=page]:bg-accent " +
                      "aria-[current=page]:text-accent-foreground " +
                      "aria-[current=page]:hover:text-accent-foreground",
                className,
            )}
            data-variant={variant}
            {...props}
            data-slot="nav-link"
        />
    );
}

function BottomNav({
    appearance = "bar",
    className,
    ...props
}: BottomNavProps) {
    if (appearance !== "bar" && appearance !== "dock") {
        throw new RangeError("BottomNav appearance is not supported.");
    }

    return (
        <nav
            className={cn(
                "group/bottom-nav flex min-w-0 overflow-x-auto " +
                "bg-surface text-foreground",
                appearance === "bar" && "border-t border-border",
                appearance === "dock" &&
                    "mx-[var(--space-3)] mb-[var(--space-3)] " +
                    "rounded-full border border-border p-[var(--space-1)] " +
                    "shadow-[var(--shadow-float)]",
                className,
            )}
            data-appearance={appearance}
            {...props}
            data-ui="bottom-nav"
        />
    );
}

type BottomNavLinkProps = Omit<ComponentProps<"a">, "children" | "href"> & {
    href: string;
    label: string;
    icon?: ReactNode;
};

function BottomNavLink({
    label,
    icon,
    className,
    ...props
}: BottomNavLinkProps) {
    if (typeof label !== "string" || !label.trim() ||
        typeof props.href !== "string" || !props.href.trim()) {
        throw new Error("BottomNavLink requires a label and href.");
    }

    return (
        <a
            className={cn(
                "flex min-h-16 min-w-16 flex-1 flex-col items-center " +
                "justify-center gap-1 px-[var(--space-2)] py-[var(--space-2)] " +
                "text-center text-xs text-muted hover:bg-surface-subtle " +
                "hover:text-foreground aria-[current=page]:bg-surface-subtle " +
                "aria-[current=page]:font-semibold " +
                "aria-[current=page]:text-accent " +
                "group-data-[appearance=dock]/bottom-nav:rounded-full " +
                "group-data-[appearance=dock]/bottom-nav:aria-[current=page]:bg-accent " +
                "group-data-[appearance=dock]/bottom-nav:aria-[current=page]:text-accent-foreground",
                className,
            )}
            {...props}
            data-slot="nav-link"
        >
            {icon && <span aria-hidden="true" className="size-5">{icon}</span>}
            <span>{label}</span>
        </a>
    );
}

export {
    GlobalNav, GlobalNavLink, SideNav, SideNavLink,
    BottomNav, BottomNavLink,
};
export type {
    GlobalNavLinkProps, SideNavLinkProps, BottomNavProps,
    BottomNavLinkProps,
};
