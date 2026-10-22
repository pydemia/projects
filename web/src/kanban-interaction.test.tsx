import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Kanban } from "./pydemia-ui/kanban";

it("scrolls a long column during a drag and leaves an invalid self-drop unchanged", () => {
    const changed = vi.fn();
    render(<Kanban label="검증 보드" columns={[{
        id: "todo", title: "할 일", cards: [{ id: "one", title: "첫 작업" }],
    }]} onColumnsChange={changed} />);
    const board = screen.getByRole("region", { name: "검증 보드" });
    const column = board.querySelector<HTMLElement>('[data-ui="kanban-column"]')!;
    const card = board.querySelector<HTMLElement>('[data-kanban-card="one"]')!;
    const dragData = { effectAllowed: "move", dropEffect: "move", setData: vi.fn(), setDragImage: vi.fn() };
    Object.defineProperty(column, "getBoundingClientRect", { value: () => ({ top: 100, bottom: 400 }) });
    column.scrollTop = 50;
    let observedY = -1;
    column.addEventListener("dragover", event => { observedY = event.clientY; });

    fireEvent.dragStart(screen.getByRole("button", { name: "첫 작업 끌어서 이동" }), { dataTransfer: dragData });
    expect(dragData.setData).toHaveBeenCalled();
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(over, "clientY", { value: 390 });
    Object.defineProperty(over, "dataTransfer", { value: dragData });
    fireEvent(column, over);
    expect(observedY).toBe(390);
    expect(column.scrollTop).toBe(68);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "clientY", { value: 0 });
    Object.defineProperty(drop, "dataTransfer", { value: dragData });
    fireEvent(card, drop);
    expect(changed).not.toHaveBeenCalled();
});
