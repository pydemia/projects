import type { ComponentProps, ReactNode } from "react";
import { cn } from "./utils";

type PageHeaderProps = Omit<ComponentProps<"header">, "children" | "title"> & {
    title: ReactNode;
    subtitle?: ReactNode;
    eyebrow?: ReactNode;
    actions?: ReactNode;
    level?: 1 | 2;
    size?: "compact" | "default" | "hero";
};

const sizeClasses = {
    compact: {
        spacing: "gap-[var(--space-2)]",
        title: "text-lg",
        subtitle: "text-xs",
    },
    default: {
        spacing: "gap-[var(--space-4)]",
        title: "text-2xl",
        subtitle: "text-sm",
    },
    hero: {
        spacing: "gap-[var(--space-6)]",
        title: "text-4xl sm:text-5xl",
        subtitle: "text-base",
    },
} as const;

function PageHeader({
    title,
    subtitle,
    eyebrow,
    actions,
    level = 1,
    size = "default",
    className,
    ...props
}: PageHeaderProps) {
    if (!Object.hasOwn(sizeClasses, size)) {
        throw new RangeError("PageHeader size is not supported.");
    }
    const Heading = level === 1 ? "h1" : "h2";
    const styles = sizeClasses[size];

    return (
        <header
            className={cn(
                "flex min-w-0 flex-wrap items-end justify-between",
                styles.spacing,
                className,
            )}
            {...props}
        >
            <div className="min-w-0">
                {eyebrow && (
                    <p className={
                        "mb-[var(--space-2)] text-xs font-semibold " +
                        "uppercase tracking-wide text-accent"
                    }>
                        {eyebrow}
                    </p>
                )}
                <Heading data-ui="heading" className={cn(
                    "m-0 font-semibold leading-tight tracking-tight " +
                    "text-foreground",
                    styles.title,
                )}>
                    {title}
                </Heading>
                {subtitle && (
                    <p className={cn(
                        "mb-0 mt-[var(--space-2)] text-muted",
                        styles.subtitle,
                    )}>
                        {subtitle}
                    </p>
                )}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
    );
}

export { PageHeader };
export type { PageHeaderProps };
