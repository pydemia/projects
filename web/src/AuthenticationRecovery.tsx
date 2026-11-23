import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { reauthentication } from "./reauthentication";
import { ActionButton, Loading, Modal } from "./ui";
import "./authentication-recovery.css";

export function AuthenticationRecovery() {
    const state = useSyncExternalStore(reauthentication.subscribe, reauthentication.snapshot);
    const [dialog, setDialog] = useState<Element | null>(null);
    useLayoutEffect(() => {
        if (state.phase !== "blocked") { setDialog(null); return; }
        const update = () => {
            const dialogs = document.querySelectorAll('[role="dialog"]:not(.authentication-transition)');
            setDialog(dialogs.item(dialogs.length - 1));
        };
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.body, {childList: true, subtree: true});
        return () => observer.disconnect();
    }, [state.phase]);
    useEffect(() => {
        if (state.phase !== "required") return;
        const frame = window.requestAnimationFrame(() => { void reauthentication.run(); });
        return () => window.cancelAnimationFrame(frame);
    }, [state.phase]);
    if (state.phase === "idle") return null;
    if (state.phase === "blocked") return createPortal(<aside className={`authentication-recovery${dialog ? " in-dialog" : ""}`} role="alert">
        <strong>다시 로그인이 필요합니다.</strong>
        <p>{state.reason === "loop" ? "로그인 후에도 인증을 확인하지 못해 자동 이동을 멈췄습니다. 계정과 접근 권한을 확인한 뒤 다시 로그인해 주세요."
            : "작성 중인 내용을 보관하지 못해 이동을 멈췄습니다. 입력 내용을 복사해 보관하고 편집창을 닫거나, 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요."}</p>
        <ActionButton type="button" onClick={reauthentication.retry}>다시 로그인</ActionButton>
    </aside>, dialog ?? document.body);
    return <Modal title="다시 로그인합니다" className="authentication-transition" onClose={() => undefined}>
        <p>작성 중인 내용을 보관하고 로그인 화면으로 이동합니다. 로그인 후 지금 보던 화면으로 돌아옵니다.</p>
        <Loading label={state.phase === "redirecting" ? "로그인 화면으로 이동 중…" : "작성 중인 내용 보관 중…"} />
    </Modal>;
}
