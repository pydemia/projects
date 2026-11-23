import { clearAcceptanceToken } from "./acceptance-token";

export function Brand({ clientNavigation = false }: { clientNavigation?: boolean }) {
    return <a className="brand brand-home" href="?view=projects" aria-label="Projects 홈"
        onClick={clientNavigation ? event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            clearAcceptanceToken();
            window.history.pushState(null, "", "?view=projects");
            window.dispatchEvent(new PopStateEvent("popstate"));
        } : undefined}>
        <img className="brandmark" src="/favicon.svg" alt="" aria-hidden="true" /><span>Projects</span>
    </a>;
}
