import { useEffect, useState, type FormEvent } from "react";
import { dateFormatError, dateFormats, defaultDateTimeSettings, formatDateOnly, formatTime, resolveTimeZone, timeFormatError, timeFormats } from "./date-time";
import { DateTimeValue, saveDateTimeSettings, useDateTimeSettings } from "./date-time-settings";
import { useReauthenticationCheckpoint } from "./reauthentication";
import { Button } from "./pydemia-ui/button";
import { Input } from "./pydemia-ui/input";
import { NativeSelect } from "./pydemia-ui/native-select";
import { Field } from "./ui";

const example = new Date("2026-11-03T07:05:09Z");
const modeFor = (value: string, choices: string[]) => choices.includes(value) ? value : "custom";
const commonZones = [
    ["UTC", "UTC"], ["Asia/Seoul", "서울"], ["Asia/Tokyo", "도쿄"], ["Asia/Shanghai", "상하이"],
    ["Asia/Singapore", "싱가포르"], ["Asia/Kolkata", "콜카타"], ["America/New_York", "뉴욕"],
    ["America/Los_Angeles", "로스앤젤레스"], ["Europe/London", "런던"], ["Europe/Berlin", "베를린"],
    ["Australia/Sydney", "시드니"], ["Pacific/Auckland", "오클랜드"],
];
const supportedZones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
export function DateTimePreferences() {
    const settings = useDateTimeSettings();
    const [draft, setDraft] = useState(settings);
    const [dateMode, setDateMode] = useState(() => modeFor(settings.dateFormat, dateFormats));
    const [timeMode, setTimeMode] = useState(() => modeFor(settings.timeFormat, timeFormats));
    const [notice, setNotice] = useState("");
    const [persisted, setPersisted] = useState(true);
    useEffect(() => {
        setDraft(settings); setDateMode(modeFor(settings.dateFormat, dateFormats)); setTimeMode(modeFor(settings.timeFormat, timeFormats));
    }, [settings]);
    const dateError = dateFormatError(draft.dateFormat), timeError = timeFormatError(draft.timeFormat);
    const dirty = draft.dateFormat !== settings.dateFormat || draft.timeFormat !== settings.timeFormat || draft.timeZone !== settings.timeZone;
    const otherZones = [...new Set([...supportedZones, draft.timeZone])].filter(zone => zone !== "system" && !commonZones.some(([code]) => code === zone)).sort();
    useReauthenticationCheckpoint(() => !dirty);
    function apply(event: FormEvent) {
        event.preventDefault();
        if (dateError || timeError) return;
        const saved = saveDateTimeSettings(draft);
        setPersisted(saved);
        setNotice(saved ? "날짜·시간 형식을 적용했습니다." : "현재 화면에 적용했지만 브라우저에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요.");
    }
    return <form className="preferences-datetime" onSubmit={apply} noValidate>
        <Field label="시간대" hint="기록 시각에 적용합니다. 마감일처럼 날짜만 있는 값은 그대로 유지합니다."><NativeSelect value={draft.timeZone} onChange={event => {setDraft(current => ({...current, timeZone: event.target.value})); setNotice("");}}>
            <option value="system">기기 설정 따르기 · {resolveTimeZone("system")}</option>
            <optgroup label="주요 시간대">{commonZones.map(([code, name]) => <option key={code} value={code}>{name}{name === code ? "" : ` · ${code}`}</option>)}</optgroup>
            {otherZones.length > 0 && <optgroup label="다른 시간대">{otherZones.map(zone => <option key={zone} value={zone}>{zone}</option>)}</optgroup>}
        </NativeSelect></Field>
        <div className="preferences-datetime-grid">
            <div><Field label="날짜 표시 형식"><NativeSelect value={dateMode} onChange={event => {
                const value = event.target.value; setDateMode(value); setNotice("");
                if (value !== "custom") setDraft(current => ({...current, dateFormat: value}));
            }}>{dateFormats.map(pattern => <option key={pattern} value={pattern}>{formatDateOnly("2026-11-03", pattern)} · {pattern}</option>)}<option value="custom">직접 입력</option></NativeSelect></Field>
                {dateMode === "custom" && <Field label="사용자 지정 날짜 형식" hint="YYYY/YY: 연 · MM/M: 월 · DD/D: 일"><Input maxLength={64} value={draft.dateFormat} aria-invalid={!!dateError} aria-errormessage={dateError ? "preferences-date-format-error" : undefined}
                    onChange={event => {setDraft(current => ({...current, dateFormat: event.target.value})); setNotice("");}} /></Field>}
                {dateError && <p id="preferences-date-format-error" className="preferences-format-error" role="alert">{dateError}</p>}
            </div>
            <div><Field label="시간 표시 형식"><NativeSelect value={timeMode} onChange={event => {
                const value = event.target.value; setTimeMode(value); setNotice("");
                if (value !== "custom") setDraft(current => ({...current, timeFormat: value}));
            }}>{timeFormats.map(pattern => <option key={pattern} value={pattern}>{formatTime(example, pattern, draft.timeZone)} · {pattern}</option>)}<option value="custom">직접 입력</option></NativeSelect></Field>
                {timeMode === "custom" && <Field label="사용자 지정 시간 형식" hint="HH/H: 24시간 · hh/h: 12시간 · mm/m: 분 · ss/s: 초 · A: 오전/오후 · a: am/pm"><Input maxLength={64} value={draft.timeFormat} aria-invalid={!!timeError} aria-errormessage={timeError ? "preferences-time-format-error" : undefined}
                    onChange={event => {setDraft(current => ({...current, timeFormat: event.target.value})); setNotice("");}} /></Field>}
                {timeError && <p id="preferences-time-format-error" className="preferences-format-error" role="alert">{timeError}</p>}
            </div>
        </div>
        <div className="preferences-datetime-preview" aria-live="polite"><h3>표시 미리보기</h3>
            <dl><dt>날짜</dt><dd>{dateError ? "올바른 형식을 입력해 주세요." : formatDateOnly("2026-11-03", draft.dateFormat)}</dd>
                <dt>시간</dt><dd>{timeError ? "올바른 형식을 입력해 주세요." : formatTime(example, draft.timeFormat, draft.timeZone)}</dd>
                <dt>기록 시각</dt><dd>{dateError || timeError ? "—" : <DateTimeValue value={example.toISOString()} settings={draft} />}</dd></dl>
        </div>
        <div className="form-actions"><Button type="submit" disabled={(!dirty && persisted) || !!dateError || !!timeError}>형식 적용</Button>
            <Button type="button" variant="ghost" onClick={() => {setDraft(defaultDateTimeSettings); setDateMode(defaultDateTimeSettings.dateFormat); setTimeMode(defaultDateTimeSettings.timeFormat); setNotice("");}}>기본값 선택</Button></div>
        {notice && <p className="preferences-storage-hint" role={persisted ? "status" : "alert"}>{notice}</p>}
        <p className="preferences-storage-hint">현재 브라우저에 저장되며 작업 날짜와 기록 시각에 적용됩니다. 날짜 입력기의 표시 형식은 브라우저·기기 설정을 따릅니다.</p>
    </form>;
}
