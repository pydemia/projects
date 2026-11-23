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

    fireEvent.dragStart(screen.getByText("첫 작업"), { dataTransfer: dragData });
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

it("moves a card by its title or description without a dedicated handle", () => {
    const changed = vi.fn();
    render(<Kanban label="본문 드래그" columns={[
        {id: "todo", title: "할 일", cards: [{id: "one", title: "본문 작업", description: "카드 설명"}]},
        {id: "doing", title: "진행 중", cards: []},
    ]} onColumnsChange={changed} />);
    const card = screen.getByText("본문 작업").closest("li")!;
    const target = screen.getByRole("heading", {name: /진행 중\s*0/}).closest("section")!;
    expect(card.draggable).toBe(true);
    expect(card.querySelector("[data-kanban-drag-handle]")).toBeNull();
    for (const source of [screen.getByText("본문 작업"), screen.getByText("카드 설명")]) {
        const dataTransfer = {setData: vi.fn(), setDragImage: vi.fn()};
        fireEvent.pointerDown(source);
        fireEvent.dragStart(source, {dataTransfer});
        fireEvent.drop(target, {dataTransfer});
        expect(changed).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({cardId: "one", fromColumnId: "todo", toColumnId: "doing"}));
        fireEvent.dragEnd(source);
    }
    expect(changed).toHaveBeenCalledTimes(2);
});

it("opens the card from its surface and keeps the keyboard menu independent", async () => {
    const opened = vi.fn();
    const changed = vi.fn();
    render(<Kanban label="작업 보드" columns={[
        {id: "todo", title: "할 일", cards: [{id: "one", title: "작업", description: "설명"}]},
        {id: "doing", title: "진행 중", cards: []},
    ]} onColumnsChange={changed} onCardOpen={opened} />);
    fireEvent.click(screen.getByText("설명"));
    expect(opened).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("button", {name: "작업 작업 메뉴"}), {key: "Enter"});
    fireEvent.click(await screen.findByRole("menuitem", {name: "진행 중 열로 이동"}));
    expect(opened).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
        cardId: "one", toColumnId: "doing",
    }));
});

it("does not start card drags from controls even when the browser targets the draggable ancestor", () => {
    const changed = vi.fn();
    const clicked = vi.fn();
    render(<Kanban label="조작 보호" columns={[
        {id: "todo", title: "할 일", cards: [{id: "one", title: "작업"}]},
        {id: "doing", title: "진행 중", cards: []},
    ]} onColumnsChange={changed} renderCard={() => <>
        <button onClick={clicked}>상태 메뉴</button><a href="#detail">상세</a>
        <label>선택<input type="checkbox" /></label><input aria-label="입력" />
        <span contentEditable suppressContentEditableWarning>메모 편집</span>
    </>} />);
    const card = screen.getByText("작업").closest("li")!;
    const target = screen.getByRole("heading", {name: /진행 중\s*0/}).closest("section")!;
    for (const control of [screen.getByText("상태 메뉴"), screen.getByText("상세"), screen.getByText("선택"), screen.getByRole("checkbox"), screen.getByLabelText("입력"), screen.getByText("메모 편집")]) {
        const dataTransfer = {setData: vi.fn(), setDragImage: vi.fn()};
        fireEvent.pointerDown(control);
        expect(fireEvent.dragStart(card, {dataTransfer})).toBe(false);
        fireEvent.drop(target, {dataTransfer});
        fireEvent.pointerUp(control);
        expect(dataTransfer.setData).not.toHaveBeenCalled();
    }
    fireEvent.click(screen.getByText("상태 메뉴"));
    expect(clicked).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
});
