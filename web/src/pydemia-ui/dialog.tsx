import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "./utils";
import { usePortalContainer } from "./foundation/portal-scope";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> &
    Pick<ComponentProps<typeof DialogPrimitive.Portal>, "container"> & {
    size?: "default" | "wide" | "fullscreen";
};

function DialogContent({
    container,
    size = "default",
    className,
    children,
    ...props
}: DialogContentProps) {
    const portalContainer = usePortalContainer(container);
    if (size !== "default" && size !== "wide" && size !== "fullscreen") {
        throw new RangeError("DialogContent size is not supported.");
    }

    return (
        <DialogPrimitive.Portal container={portalContainer}>
            <DialogPrimitive.Overlay
                className="fixed inset-0 z-50 bg-[var(--overlay)]"
            />
            <DialogPrimitive.Content
                data-ui="overlay-panel"
                data-size={size}
                className={cn(
                    "fixed z-50 overflow-y-auto border border-border " +
                    "bg-surface p-[var(--space-6)] text-foreground " +
                    "shadow-[var(--shadow-float)]",
                    size === "fullscreen"
                        ? "inset-0 h-dvh w-full rounded-none border-0"
                        : "left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] " +
                          "w-[calc(100vw-2rem)] -translate-x-1/2 " +
                          "-translate-y-1/2 rounded-sm",
                    size === "default" && "max-w-lg",
                    size === "wide" && "max-w-4xl",
                    className,
                )}
                {...props}
            >
                {children}
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
    return <div className={cn("grid gap-2", className)} {...props} />;
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn("mt-6 flex flex-wrap justify-end gap-2", className)}
            {...props}
        />
    );
}

function DialogTitle({
    className,
    ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
    return (
        <DialogPrimitive.Title
            data-ui="heading"
            className={cn("text-base font-semibold", className)}
            {...props}
        />
    );
}

function DialogDescription({
    className,
    ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description
            className={cn("text-sm text-muted", className)}
            {...props}
        />
    );
}

export {
    Dialog,
    DialogTrigger,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
export type { DialogContentProps };
