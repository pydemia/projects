import {
    useId, useLayoutEffect, useRef, useState,
    type ComponentProps, type DragEvent, type ReactNode,
} from "react";
import { cn } from "./utils";

type KanbanCard = {
    id: string;
    title: string;
    description?: string;
};

type KanbanColumn = {
    id: string;
    title: string;
    cards: readonly KanbanCard[];
};

type KanbanMove = {
    cardId: string;
    fromColumnId: string;
    toColumnId: string;
    fromIndex: number;
    toIndex: number;
};

type KanbanProps = Omit<ComponentProps<"div">, "children"> & {
    label: string;
    columns: readonly KanbanColumn[];
    onColumnsChange: (
        columns: KanbanColumn[], move: KanbanMove,
    ) => void;
    renderCard?: (card: KanbanCard) => ReactNode;
    renderColumnFooter?: (column: KanbanColumn) => ReactNode;
    canReorder?: boolean;
    canMove?: (move: KanbanMove) => boolean;
};

const actionLabels = {
    left: "왼쪽 열로",
    right: "오른쪽 열로",
    up: "위로",
    down: "아래로",
} as const;

function validateColumns(columns: readonly KanbanColumn[]) {
    if (columns.length === 0) {
        throw new Error("Kanban requires at least one column.");
    }
    const columnIds = new Set<string>();
    const cardIds = new Set<string>();

    for (const column of columns) {
        if (!column.id.trim() || !column.title.trim() ||
            columnIds.has(column.id)) {
            throw new Error("Kanban columns need unique IDs and titles.");
        }
        columnIds.add(column.id);
        for (const card of column.cards) {
            if (!card.id.trim() || !card.title.trim() ||
                cardIds.has(card.id)) {
                throw new Error("Kanban cards need unique IDs and titles.");
            }
            cardIds.add(card.id);
        }
    }
}

function moveKanbanCard(
    columns: readonly KanbanColumn[],
    cardId: string,
    toColumnId: string,
    beforeCardId: string | null = null,
): { columns: KanbanColumn[]; move: KanbanMove } | null {
    validateColumns(columns);
    const fromColumn = columns.find((column) =>
        column.cards.some((card) => card.id === cardId));
    const targetColumn = columns.find((column) =>
        column.id === toColumnId);
    if (!fromColumn) throw new RangeError("Kanban card was not found.");
    if (!targetColumn) throw new RangeError("Kanban column was not found.");
    if (beforeCardId === cardId) return null;

    const fromIndex = fromColumn.cards.findIndex((card) =>
        card.id === cardId);
    const next = columns.map((column) => ({
        ...column,
        cards: [...column.cards],
    }));
    const source = next.find((column) => column.id === fromColumn.id)!;
    const target = next.find((column) => column.id === toColumnId)!;
    const [card] = source.cards.splice(fromIndex, 1);
    const toIndex = beforeCardId === null
        ? target.cards.length
        : target.cards.findIndex((item) => item.id === beforeCardId);
    if (toIndex < 0) {
        throw new RangeError("Kanban target card was not found in its column.");
    }
    if (source === target && toIndex === fromIndex) return null;
    target.cards.splice(toIndex, 0, card!);

    return {
        columns: next,
        move: {
            cardId,
            fromColumnId: fromColumn.id,
            toColumnId,
            fromIndex,
            toIndex,
        },
    };
}

function Kanban({
    label,
    columns,
    onColumnsChange,
    renderCard,
    renderColumnFooter,
    canReorder = true,
    canMove,
    className,
    ...props
}: KanbanProps) {
    if (!label.trim()) throw new Error("Kanban needs a board label.");
    validateColumns(columns);
    const id = useId();
    const boardRef = useRef<HTMLDivElement>(null);
    const draggedCard = useRef<string | null>(null);
    const pendingFocus = useRef<string | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ column: string; before: string | null } | null>(null);
    const [announcement, setAnnouncement] = useState("");

    useLayoutEffect(() => {
        if (!pendingFocus.current) return;
        const card = [...(boardRef.current?.querySelectorAll<HTMLElement>(
            "[data-kanban-card]",
        ) ?? [])].find((item) =>
            item.dataset.kanbanCard === pendingFocus.current);
        const button = card?.querySelector<HTMLButtonElement>(
            "button[data-kanban-action]:not(:disabled)",
        );
        button?.focus();
        pendingFocus.current = null;
    }, [columns]);

    function move(
        card: KanbanCard,
        toColumn: KanbanColumn,
        beforeCardId: string | null = null,
        restoreFocus = false,
    ) {
        const result = moveKanbanCard(
            columns, card.id, toColumn.id, beforeCardId,
        );
        if (!result) return;
        if (canMove && !canMove(result.move)) return;
        if (restoreFocus) pendingFocus.current = card.id;
        onColumnsChange(result.columns, result.move);
        setAnnouncement(`${card.title}: ${toColumn.title} 열의 ` +
            `${result.move.toIndex + 1}번째 위치로 이동했습니다.`);
    }

    function beginDrag(event: DragEvent, cardId: string) {
        draggedCard.current = cardId;
        setDragging(cardId);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", cardId);
        const card = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-kanban-card]");
        if (card) event.dataTransfer.setDragImage(card, 20, 20);
    }

    function endDrag() {
        draggedCard.current = null;
        setDragging(null);
        setDropTarget(null);
    }

    function allowDrop(event: DragEvent) {
        if (!draggedCard.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const board = boardRef.current;
        if (board) {
            const bounds = board.getBoundingClientRect();
            if (event.clientX < bounds.left + 48) board.scrollLeft -= 18;
            if (event.clientX > bounds.right - 48) board.scrollLeft += 18;
        }
        const column = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-ui='kanban-column']");
        if (column) {
            const bounds = column.getBoundingClientRect();
            if (event.clientY < bounds.top + 48) column.scrollTop -= 18;
            if (event.clientY > bounds.bottom - 48) column.scrollTop += 18;
        }
    }

    function dropOnColumn(event: DragEvent, column: KanbanColumn) {
        event.preventDefault();
        const cardId = draggedCard.current;
        if (cardId) {
            const card = columns.flatMap((item) => item.cards)
                .find((item) => item.id === cardId);
            if (card) move(card, column);
        }
        endDrag();
    }

    function beforeAtPointer(event: DragEvent, column: KanbanColumn, cardIndex: number): string | null {
        const target = event.currentTarget as HTMLElement;
        const middle = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
        return event.clientY < middle ? column.cards[cardIndex]!.id : column.cards[cardIndex + 1]?.id ?? null;
    }

    function dropBeforeCard(
        event: DragEvent, column: KanbanColumn, cardIndex: number,
    ) {
        event.preventDefault();
        event.stopPropagation();
        const cardId = draggedCard.current;
        if (cardId) {
            const card = columns.flatMap((item) => item.cards)
                .find((item) => item.id === cardId);
            if (card) move(card, column, beforeAtPointer(event, column, cardIndex));
        }
        endDrag();
    }

    return (
        <div
            ref={boardRef}
            role="region"
            aria-label={label}
            tabIndex={0}
            className={cn("min-w-0 overflow-x-auto", className)}
            {...props}
            data-ui="kanban"
        >
            <div className="flex min-w-max gap-[var(--space-3)] pb-2">
                {columns.map((column, columnIndex) => (
                    <section
                        key={column.id}
                        data-ui="kanban-column"
                        data-surface="panel"
                        aria-labelledby={`${id}-column-${columnIndex}`}
                        className={cn(
                            "w-64 shrink-0 rounded-sm border border-border " +
                            "bg-surface-subtle p-[var(--space-3)] max-h-[70vh] overflow-y-auto",
                            dragging && "border-dashed",
                            dropTarget?.column === column.id && dropTarget.before === null && "ring-2 ring-accent",
                        )}
                        onDragOver={(event) => {
                            allowDrop(event);
                            if (draggedCard.current && event.target === event.currentTarget)
                                setDropTarget({ column: column.id, before: null });
                        }}
                        onDrop={(event) => dropOnColumn(event, column)}
                    >
                        <h3 id={`${id}-column-${columnIndex}`}
                            data-slot="surface-header"
                            className={
                                "mb-[var(--space-3)] flex items-center " +
                                "justify-between gap-2 text-sm font-semibold"
                            }>
                            <span data-slot="surface-title">{column.title}</span>
                            <span data-slot="surface-meta"
                                className="text-xs font-normal text-muted">
                                {column.cards.length}
                            </span>
                        </h3>
                        {column.cards.length === 0 ? (
                            <p className={
                                "rounded-sm border border-dashed " +
                                "border-border p-[var(--space-3)] text-xs text-muted"
                            } data-surface="drop-target">
                                카드가 없습니다
                            </p>
                        ) : (
                            <ul className="grid gap-[var(--space-2)]">
                                {column.cards.map((card, cardIndex) => (
                                    <li
                                        key={card.id}
                                        data-kanban-card={card.id}
                                        data-surface="row"
                                        onDragOver={(event) => {
                                            event.stopPropagation();
                                            allowDrop(event);
                                            if (draggedCard.current) setDropTarget({
                                                column: column.id,
                                                before: beforeAtPointer(event, column, cardIndex),
                                            });
                                        }}
                                        onDrop={(event) =>
                                            dropBeforeCard(event, column, cardIndex)}
                                        className={cn(
                                            "rounded-sm border border-border " +
                                            "bg-surface p-[var(--space-3)] " +
                                            "shadow-[var(--shadow-float)]",
                                            dragging === card.id && "opacity-50",
                                            dropTarget?.column === column.id && dropTarget.before === card.id && "border-t-4 border-t-accent",
                                        )}
                                    >
                                        <button type="button" draggable onDragStart={(event) => beginDrag(event, card.id)}
                                            onDragEnd={endDrag} aria-label={`${card.title} 끌어서 이동`}
                                            className="mb-2 cursor-grab rounded-sm border border-border px-2 text-xs text-muted active:cursor-grabbing">⋮⋮</button>
                                        <p className="m-0 text-sm font-medium">
                                            {card.title}
                                        </p>
                                        {card.description && (
                                            <p className="mb-0 mt-1 text-xs text-muted">
                                                {card.description}
                                            </p>
                                        )}
                                        {renderCard?.(card)}
                                        <div role="group"
                                            aria-label={`${card.title} 이동`}
                                            className="mt-[var(--space-2)] flex gap-1">
                                            {([
                                                ["left", "←", columnIndex > 0],
                                                ["right", "→", columnIndex < columns.length - 1],
                                                ["up", "↑", canReorder && cardIndex > 0],
                                                ["down", "↓", canReorder && cardIndex < column.cards.length - 1],
                                            ] as const).map(([direction, symbol, enabled]) => (
                                                <button
                                                    key={direction}
                                                    type="button"
                                                    data-kanban-action={direction}
                                                    data-slot="surface-action"
                                                    aria-label={
                                                        `${card.title} ${actionLabels[direction]} 이동`
                                                    }
                                                    disabled={!enabled}
                                                    className={
                                                        "grid size-7 place-items-center rounded-sm " +
                                                        "border border-border text-xs " +
                                                        "hover:bg-surface-subtle disabled:opacity-40"
                                                    }
                                                    onClick={() => {
                                                        if (direction === "left") {
                                                            move(card, columns[columnIndex - 1]!, null, true);
                                                        } else if (direction === "right") {
                                                            move(card, columns[columnIndex + 1]!, null, true);
                                                        } else if (direction === "up") {
                                                            move(card, column,
                                                                column.cards[cardIndex - 1]!.id, true);
                                                        } else {
                                                            move(card, column,
                                                                column.cards[cardIndex + 2]?.id ?? null,
                                                                true);
                                                        }
                                                    }}
                                                >
                                                    <span aria-hidden="true">{symbol}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {renderColumnFooter?.(column)}
                    </section>
                ))}
            </div>
            <span className="sr-only" role="status" aria-live="polite">
                {announcement}
            </span>
        </div>
    );
}

export { Kanban, moveKanbanCard };
export type { KanbanCard, KanbanColumn, KanbanMove, KanbanProps };
