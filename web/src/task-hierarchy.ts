import type { Item, Link } from "./models";

type Task = Extract<Item, {kind: "task"}>;
export type TaskTreeRow = {task: Task; depth: number; hidden: boolean};

export function taskParents(links: readonly Link[]): ReadonlyMap<string, string> {
    return new Map(links.filter(link => link.relation === "subtask_of").map(link => [link.source_id, link.target_id]));
}

export function flattenTaskTree(roots: Task[], children: ReadonlyMap<string, Task[]>, collapsed: ReadonlySet<string>): TaskTreeRow[] {
    const visited = new Set<string>();
    const stack: TaskTreeRow[] = [...roots].reverse().map(task => ({task, depth: 0, hidden: false}));
    const rows: TaskTreeRow[] = [];
    while (stack.length) {
        const row = stack.pop()!;
        if (visited.has(row.task.id)) continue;
        visited.add(row.task.id);
        rows.push(row);
        const descendants = children.get(row.task.id) ?? [];
        for (let index = descendants.length - 1; index >= 0; index--) {
            stack.push({task: descendants[index]!, depth: row.depth + 1, hidden: row.hidden || collapsed.has(row.task.id)});
        }
    }
    return rows;
}

export function taskHierarchy(tasks: Task[], parents: ReadonlyMap<string, string>) {
    const byId = new Map(tasks.map(task => [task.id, task]));
    const children = new Map<string, Task[]>();
    const roots: Task[] = [];
    for (const task of tasks) {
        const parent = byId.get(parents.get(task.id) ?? "");
        if (!parent || parent.id === task.id || parent.project_id !== task.project_id) roots.push(task);
        else {
            const family = children.get(parent.id) ?? [];
            family.push(task);
            children.set(parent.id, family);
        }
    }
    return {roots, children};
}

export function subtreeDeadlineOrder(roots: Task[], children: ReadonlyMap<string, Task[]>, tasksByDeadline: Task[]) {
    const positions = new Map(tasksByDeadline.map((task, position) => [task.id, position]));
    const ranks = new Map(roots.map(root => [root.id, flattenTaskTree([root], children, new Set()).reduce(
        (rank, row) => Math.min(rank, positions.get(row.task.id) ?? rank), positions.get(root.id)!,
    )]));
    return {
        roots: [...roots].sort((left, right) => ranks.get(left.id)! - ranks.get(right.id)!),
        deadlineTask: (root: Task) => tasksByDeadline[ranks.get(root.id)!] ?? root,
    };
}
