import { useId, useRef, useState, type ComponentProps } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "./utils";

type SearchInputProps = Omit<
    ComponentProps<"form">, "children" | "onSubmit" | "role"
> & {
    label: string;
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    onSearch?: (value: string) => void;
    name?: string;
    placeholder?: string;
    disabled?: boolean;
    variant?: "field" | "toolbar";
    submitLabel?: string;
    clearLabel?: string;
};

function SearchInput({
    label,
    value,
    defaultValue = "",
    onValueChange,
    onSearch,
    name = "q",
    placeholder,
    disabled = false,
    variant = "field",
    submitLabel = "검색",
    clearLabel = "지우기",
    className,
    ...props
}: SearchInputProps) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [internalValue, setInternalValue] = useState(defaultValue);
    const query = value === undefined ? internalValue : value;

    if (!label.trim() || !name.trim() || !submitLabel.trim() ||
        !clearLabel.trim()) {
        throw new Error("SearchInput requires non-empty control labels.");
    }
    if (typeof defaultValue !== "string" || typeof query !== "string") {
        throw new TypeError("SearchInput query must be a string.");
    }
    if (value !== undefined && !onValueChange && !disabled) {
        throw new Error("Controlled SearchInput requires onValueChange.");
    }

    function changeQuery(next: string) {
        if (value === undefined) setInternalValue(next);
        onValueChange?.(next);
    }

    function clearSearch() {
        changeQuery("");
        onSearch?.("");
        inputRef.current?.focus();
    }

    return (
        <form
            {...props}
            data-ui="search-input"
            role="search"
            aria-label={label}
            className={cn("grid min-w-0 gap-2 text-foreground", className)}
            onSubmit={(event) => {
                if (!onSearch) return;
                event.preventDefault();
                onSearch(query);
            }}
        >
            <label htmlFor={inputId} className={cn(
                "text-sm font-medium",
                variant === "toolbar" && "sr-only",
            )}>
                {label}
            </label>
            <div data-slot="search-controls"
                className="flex min-w-0 items-center gap-2">
                <Input
                    ref={inputRef}
                    id={inputId}
                    type="search"
                    name={name}
                    value={query}
                    disabled={disabled}
                    placeholder={placeholder}
                    onChange={(event) => changeQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== "Escape" || !query.length ||
                            event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        clearSearch();
                    }}
                    className="min-w-0 flex-1 [&::-webkit-search-cancel-button]:hidden"
                />
                {query.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`${label} ${clearLabel}`}
                        className="shrink-0"
                        onClick={clearSearch}
                    >
                        {clearLabel}
                    </Button>
                )}
                <Button
                    type="submit"
                    variant={variant === "toolbar" ? "outline" : "primary"}
                    disabled={disabled}
                    className="shrink-0"
                >
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}

export { SearchInput };
export type { SearchInputProps };
