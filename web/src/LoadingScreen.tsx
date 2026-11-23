import { Brand } from "./Brand";

export function ContentLoading({ label }: { label: string }) {
    return <section className="workspace-loading" aria-busy="true" aria-label={label}>
        <p className="workspace-loading-status" role="status"><span className="workspace-loading-dot" aria-hidden="true" />{label}</p>
        <div className="workspace-loading-lines" aria-hidden="true"><span /><span /><span /><span /></div>
    </section>;
}

/** Continues the static HTML shell while the authenticated session is pending. */
export function LoadingScreen() {
    return <main className="startup-screen"><Brand /><ContentLoading label="프로젝트 작업공간을 불러오는 중…" /></main>;
}
