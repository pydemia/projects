import { Check, ChevronDown } from "lucide-react";
import type { Item } from "./models";
import { statusLabels } from "./models";
import { Button } from "./pydemia-ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "./pydemia-ui/dropdown-menu";
import "./task-list-status.css";

type State = Extract<Item, {kind: "task"}>["data"]["state"];
const states: readonly State[] = ["todo", "in_progress", "in_review", "done", "cancelled"];

export function TaskListStatus({title, state, disabled, onChange}: {
    title: string; state: State; disabled: boolean; onChange: (state: State) => void;
}) {
    return <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" className="task-list-status" disabled={disabled}
            aria-label={`${title} 상태: ${statusLabels[state]} · 변경`} title={`상태: ${statusLabels[state]} · 변경`}>
            <span className="task-status-dot" data-state={state} aria-hidden="true" />
            <ChevronDown className="task-status-chevron" size={12} aria-hidden="true" />
        </Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="task-status-menu" aria-label={`${title} 상태 변경`}>
            <DropdownMenuLabel>상태</DropdownMenuLabel>
            {states.map(value => <DropdownMenuItem key={value} className="task-status-option"
                aria-current={value === state ? "true" : undefined}
                onSelect={() => {if (!disabled && value !== state) onChange(value);}}>
                <span className="task-status-dot" data-state={value} aria-hidden="true" />
                <span>{statusLabels[value]}</span>
                {value === state && <Check size={14} className="task-status-current" aria-hidden="true" />}
            </DropdownMenuItem>)}
        </DropdownMenuContent>
    </DropdownMenu>;
}
