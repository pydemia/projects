import { useId, type ComponentProps, type ReactNode } from "react";
import { Label } from "./label";
import { cn } from "./utils";

type FieldControlProps = {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
    "aria-required"?: true;
};

type FieldProps = Omit<ComponentProps<"div">, "children"> & {
    controlId?: string;
    label: string;
    description?: string;
    error?: string;
    required?: boolean;
    children: (props: FieldControlProps) => ReactNode;
};

function Field({
    controlId,
    label,
    description,
    error,
    required = false,
    children,
    className,
    ...props
}: FieldProps) {
    const generatedId = useId();
    const inputId = controlId ?? generatedId;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");

    return (
        <div className={cn("grid gap-2", className)} {...props}
            data-ui="field">
            <Label htmlFor={inputId}>
                {label}
                {required && <span aria-hidden="true"> *</span>}
            </Label>
            {children({
                id: inputId,
                "aria-describedby": describedBy || undefined,
                "aria-invalid": error ? true : undefined,
                "aria-required": required || undefined,
            })}
            {description && (
                <p id={descriptionId} className="m-0 text-xs text-muted">
                    {description}
                </p>
            )}
            {error && (
                <p id={errorId} role="alert" className="m-0 text-xs text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}

export { Field };
export type { FieldControlProps, FieldProps };
