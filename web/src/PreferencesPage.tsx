import { Button } from "./pydemia-ui/button";
import { Card, CardContent } from "./pydemia-ui/card";
import { ThemeControls } from "./theme";
import { DateTimePreferences } from "./DateTimePreferences";
import { PageHead } from "./ui";
import "./preferences.css";

export type PreferencesPageProps = {
    username: string;
    onLogout?: () => void;
    logoutBusy?: boolean;
    runtimeConfigured?: boolean;
};

export function PreferencesPage({ username, onLogout, logoutBusy = false, runtimeConfigured }: PreferencesPageProps) {
    return <div className="preferences-page">
        <PageHead title="설정" description="계정과 화면 표시를 관리합니다." eyebrow="PREFERENCES" />
        <div className="preferences-sections">
            <section aria-labelledby="preferences-account-title">
                <h2 id="preferences-account-title">계정</h2>
                <Card className="preferences-section-card">
                    <CardContent className="preferences-account">
                        <dl className="preferences-account-details">
                            <dt>사용자 이름</dt>
                            <dd>{username}</dd>
                            {runtimeConfigured !== undefined && <><dt>AI 연결</dt><dd>{runtimeConfigured ? "연결됨" : "미설정"}</dd></>}
                        </dl>
                        {onLogout && <Button variant="outline" className="preferences-logout"
                            disabled={logoutBusy} onClick={onLogout}>
                            {logoutBusy ? "로그아웃 중…" : "로그아웃"}
                        </Button>}
                    </CardContent>
                </Card>
            </section>
            <section aria-labelledby="preferences-display-title">
                <h2 id="preferences-display-title">화면 설정</h2>
                <Card className="preferences-section-card">
                    <CardContent>
                        <ThemeControls idPrefix="preferences-" />
                        <p className="preferences-storage-hint">화면 설정은 현재 브라우저에 저장됩니다.</p>
                    </CardContent>
                </Card>
            </section>
            <section aria-labelledby="preferences-datetime-title">
                <h2 id="preferences-datetime-title">날짜와 시간</h2>
                <Card className="preferences-section-card"><CardContent><DateTimePreferences /></CardContent></Card>
            </section>
        </div>
    </div>;
}
