import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import {
    forwardRef, type ComponentProps, type ComponentPropsWithoutRef,
    type ElementRef,
} from "react";
import { cn } from "./utils";

const Accordion = forwardRef<
    ElementRef<typeof AccordionPrimitive.Root>,
    ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>
>((props, forwardedRef) => (
    <AccordionPrimitive.Root {...props} ref={forwardedRef}
        data-ui="accordion" />
));

function AccordionItem({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Item>) {
    return (
        <AccordionPrimitive.Item
            data-ui="accordion-item"
            className={cn("border-b border-border", className)}
            {...props}
        />
    );
}

function AccordionTrigger({
    className,
    children,
    ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
    return (
        <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
                data-ui="accordion-trigger"
                className={cn(
                    "group flex min-h-[var(--control-height)] flex-1 items-center " +
                    "justify-between gap-2 py-[var(--space-2)] text-left " +
                    "font-medium disabled:opacity-50",
                    className,
                )}
                {...props}
            >
                {children}
                <ChevronDown
                    aria-hidden="true"
                    className={"size-4 shrink-0 transition-transform " +
                        "duration-[var(--motion-fast)] " +
                        "group-data-[state=open]:rotate-180"}
                />
            </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
    );
}

function AccordionContent({
    className,
    ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
    return (
        <AccordionPrimitive.Content
            data-ui="accordion-content"
            className={cn("overflow-hidden pb-[var(--space-3)] text-sm", className)}
            {...props}
        />
    );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
