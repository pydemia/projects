import { api } from "./api";
import { DateTimeValue } from "./date-time-settings";
import { useResource } from "./hooks";
import { ErrorNotice, RouteLink } from "./ui";

export function TaskContext({ itemId, revision }: { itemId: string; revision: number }) {
    const context = useResource(`task-context:${itemId}:${revision}`, signal => api.taskContext(itemId, signal));
    if (context.status === "loading") return <p role="status">소속·근거 이력 확인 중…</p>;
    if (context.status === "error") return <ErrorNotice error={context.error} retry={context.reload} />;
    const { transfers, origin_runs: runs, baselines, missing_item_ids: missing } = context.data;
    if (!transfers.length && !runs.length && !baselines.length && !missing.length) return null;
    return <section className="task-note-references" aria-label="소속·근거 이력">
        <h3>소속·근거 이력</h3>
        {missing.length > 0 && <p role="alert">백업에서 복원되지 않은 외부 참조 {missing.length}개가 있습니다. 과거 snapshot을 현재 작업으로 연결하지 않습니다. 연결 근거를 복원하기 전에는 완료·이동이 제한될 수 있습니다.</p>}
        {transfers.length > 0 && <ul>{transfers.map(transfer => <li key={transfer.id}>
            {transfer.source_project_name} → {transfer.target_project_name}
            {` · r${transfer.before_revision}→r${transfer.after_revision} · `}<DateTimeValue value={transfer.created_at} />
        </li>)}</ul>}
        {runs.length > 0 && <div><h4>이 작업의 SkillRun</h4><ul>{runs.map(run => <li key={run.id}>
            <RouteLink patch={{ project: run.project_id, view: "runs", run: run.id, item: "" }}>{run.project_name} · {run.operation} · {run.status}</RouteLink>
        </li>)}</ul></div>}
        {baselines.length > 0 && <div><h4>과거 기준선의 참조</h4><ul>{baselines.map(baseline => <li key={baseline.id}>
            <RouteLink patch={{ project: baseline.project_id, view: "trace", baseline: baseline.id, item: "" }}>{baseline.project_name} · {baseline.name} · r{baseline.revision}</RouteLink>
        </li>)}</ul></div>}
    </section>;
}
