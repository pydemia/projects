/* Planning mock. Synthetic records, no API calls or production data. */
const $ = selector => document.querySelector(selector);
const today = "2026-11-02";
const tasks = [
    { id: "TASK-101", title: "작업 보기 전환 시 필터와 초안 유지", project: "Projects", state: "in_progress", planned: today, due: "2026-11-04", list: "제품 개선", body: "목록에서 선택한 작업을 보드와 캘린더에서도 이어서 편집합니다.", revision: 3, relation: "요구 1 · 테스트 2 · Note 문서 1", abc: "A1" },
    { id: "TASK-102", title: "프로젝트 이동 대상 선택기 검토", project: "Projects", state: "todo", planned: "2026-10-30", due: "", list: "제품 개선", body: "원래 프로젝트와 대상 프로젝트를 함께 표시합니다.", revision: 1, relation: "요구 1", abc: "A2" },
    { id: "TASK-103", title: "회의 기록에서 실행할 일 정리", project: "Note", state: "todo", planned: today, due: today, list: "Inbox", body: "선택한 문서를 근거로 연결합니다.", revision: 2, relation: "Note 문서 1", abc: "B1" },
    { id: "TASK-104", title: "스킬 참조 revision 확인", project: "Skills", state: "todo", planned: "", due: "", list: "Inbox", body: "원문과 hash를 유지합니다.", revision: 1, relation: "관계 없음", abc: "B2" },
    { id: "TASK-105", title: "완료 gate 회귀 시나리오 정리", project: "Projects", state: "in_review", planned: "2026-11-05", due: "2026-11-06", list: "구현", body: "프로젝트를 옮긴 뒤에도 같은 근거로 완료를 판정합니다.", revision: 4, relation: "테스트 3", abc: "A3" },
    { id: "TASK-106", title: "모바일 작업 상세 줄바꿈 확인", project: "Projects", state: "todo", planned: "", due: "2026-11-01", list: "품질", body: "긴 한국어 작업명과 작은 화면을 확인합니다.", revision: 1, relation: "테스트 1", abc: "B3" },
    { id: "TASK-107", title: "지난 검토 의견 반영", project: "Projects", state: "done", planned: today, due: "", list: "품질", body: "완료한 가상 작업", revision: 2, relation: "테스트 1", abc: "C1" },
];
const labels = { todo: "할 일", in_progress: "진행 중", in_review: "검토 중", done: "완료" };
const base = { project: "all", set: "all", layout: "list", density: "compact", query: "", status: "open", item: "" };
let state = { ...base }, saved = { ...base }, moving = null, undo = null, returnFocus = null;
const drafts = new Map();
const projectMemory = new Map();
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function open(task) { return task.state !== "done"; }
function inSet(task, scope) {
    if (scope === "all") return true;
    if (!open(task)) return false;
    if (scope === "inbox") return task.list === "Inbox";
    if (scope === "today") return (!!task.planned && task.planned <= today) || (!!task.due && task.due <= today);
    return task.planned > today || (!task.planned && task.due > today);
}
function scoped() { return tasks.filter(t => state.project === "all" || t.project === state.project); }
function beforeSearch() { return scoped().filter(t => inSet(t, state.set) && (state.status === "all" || (state.status === "open" ? open(t) : t.state === state.status))); }
function visible() { return beforeSearch().filter(t => t.title.includes(state.query)); }
function notification(message, canUndo = false) {
    $("#toast").innerHTML = escapeHTML(message) + (canUndo ? ' <button id="undo">되돌리기</button>' : "");
}
function config(view) { return Object.fromEntries(Object.entries(view).filter(([key]) => key !== "item")); }
function writeURL(replace = false) {
    const params = new URLSearchParams(state);
    history[replace ? "replaceState" : "pushState"](null, "", `${location.pathname}?${params}`);
}
function restoreURL() {
    const params = new URLSearchParams(location.search);
    state = { ...base };
    for (const key of Object.keys(base)) if (params.has(key)) state[key] = params.get(key);
    if (!["all", "Projects", "Note", "Skills"].includes(state.project)) state.project = "all";
    if (!["all", "today", "inbox", "upcoming"].includes(state.set)) state.set = "all";
    if (!["list", "board", "calendar", "insights"].includes(state.layout)) state.layout = "list";
    if (state.project === "all") state.layout = "list";
    if (!["compact", "detailed"].includes(state.density)) state.density = "compact";
    if (!["open", "all", "done"].includes(state.status)) state.status = "open";
}
function update(patch) { state = { ...state, ...patch }; writeURL(); render(); }
function taskButton(task) { return `<button class="title" data-task="${task.id}">${escapeHTML(task.title)}</button>`; }
function row(task) {
    return `<div class="row ${state.item === task.id ? "selected" : ""}" data-row="${task.id}"><input type="checkbox" aria-label="${escapeHTML(task.title)} 선택"><div>${taskButton(task)}<span class="project-link">${escapeHTML(task.project)} · ${escapeHTML(task.list)}</span><span class="extra sub">${task.abc} · ${task.id} · rev ${task.revision} · ${task.relation}</span></div><span class="state">${labels[task.state]}</span><span class="date">${task.planned ? `계획 ${task.planned.slice(5)}` : task.due ? `마감 ${task.due.slice(5)}` : "날짜 없음"}</span><button data-move="${task.id}" aria-label="${escapeHTML(task.title)} 프로젝트 이동">↗</button></div>`;
}
function renderList(items) {
    if (state.set !== "today") return items.map(row).join("");
    const buckets = [[], [], []];
    for (const task of items) buckets[task.due && task.due < today ? 0 : task.planned === today || task.due === today ? 1 : 2].push(task);
    return buckets.map((group, i) => group.length ? `<div class="group ${i === 0 || i === 2 ? "warning" : ""}">${["마감 지남", "오늘 계획·마감", "미처리 계획"][i]} · ${group.length}</div>${group.map(row).join("")}` : "").join("");
}
function renderBoard(items) {
    return '<p class="muted">상태별 표시 · 기존 수동 순서 유지 · 시안에서는 드래그하지 않습니다.</p><div class="board">' + ["todo", "in_progress", "in_review", ...(items.some(t => t.state === "done") ? ["done"] : [])].map(key => `<section class="column"><h3>${labels[key]} · ${items.filter(t => t.state === key).length}</h3>${items.filter(t => t.state === key).map(task => `<article class="card ${state.item === task.id ? "selected" : ""}" data-row="${task.id}"><div class="card-top">${taskButton(task)}<button data-move="${task.id}" aria-label="${escapeHTML(task.title)} 프로젝트 이동">↗</button></div><span class="project-link">${task.project}</span><div class="date">${task.planned || task.due || "날짜 없음"}</div><div class="extra sub">${task.abc} · ${task.id} · rev ${task.revision}</div></article>`).join("")}</section>`).join("") + "</div>";
}
function renderCalendar(items) {
    const dated = items.filter(t => t.planned || t.due), undated = items.filter(t => !t.planned && !t.due);
    const onWeek = dated.filter(t => (t.planned || t.due) >= today && (t.planned || t.due) <= "2026-11-08");
    const outside = dated.filter(t => !onWeek.includes(t));
    return `<p class="calendar-info">11월 2일–8일 · 실행 예정일, 없으면 마감일<br>결과 ${items.length}개 = 이번 주 ${onWeek.length} + 다른 기간 ${outside.length} + 날짜 없음 ${undated.length}</p><div class="week">${Array.from({ length: 7 }, (_, i) => { const day = `2026-11-0${i + 2}`; return `<section class="day"><small>${i + 2} ${["월", "화", "수", "목", "금", "토", "일"][i]}</small>${onWeek.filter(t => (t.planned || t.due) === day).map(taskButton).join("")}</section>`; }).join("")}</div>${outside.length ? `<h3 class="undated">다른 기간 · ${outside.length}</h3>${outside.map(row).join("")}` : ""}${undated.length ? `<h3 class="undated">날짜 없음 · ${undated.length}</h3>${undated.map(row).join("")}` : ""}`;
}
function render() {
    document.body.classList.toggle("detailed", state.density === "detailed");
    $("#page-title").textContent = state.project === "all" ? "내 작업" : `${state.project} · 작업`;
    for (const key of ["project", "density", "query", "status"]) $("#" + key).value = state[key];
    document.querySelectorAll("[data-set]").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.set === state.set)); const n = scoped().filter(t => inSet(t, b.dataset.set) && open(t)).length; if (!b.closest(".bottom")) b.textContent = `${{ all: "모든 작업", today: "오늘", inbox: "Inbox", upcoming: "예정" }[b.dataset.set]} ${n}`; });
    document.querySelectorAll("[data-layout]").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.layout === state.layout)); b.disabled = state.project === "all" && b.dataset.layout !== "list"; b.title = b.disabled ? "프로젝트를 선택하면 사용 가능" : ""; });
    $("#dirty").textContent = JSON.stringify(config(state)) === JSON.stringify(config(saved)) ? "저장됨" : "변경 중";
    const items = visible();
    $("#count").textContent = `결과 ${items.length}개 / 검색 전 ${beforeSearch().length}개 · ${state.project === "all" ? "전체 프로젝트 · 목록" : state.project} · ${{ open: "열림", all: "모든 상태", done: "완료" }[state.status]}`;
    $("#collection").innerHTML = !items.length ? `<div class="empty"><h2>조건에 맞는 작업이 없습니다</h2><p>다른 열린 작업 ${scoped().filter(open).length}개를 모든 작업에서 확인할 수 있습니다.</p><button id="clear">모든 작업 보기 · 검색 초기화</button></div>` : state.layout === "board" ? renderBoard(items) : state.layout === "calendar" ? renderCalendar(items) : state.layout === "insights" ? '<p class="muted">현재 필터의 상태 분포 · 기간별 이력 집계가 아닙니다.</p>' + Object.entries(labels).map(([key, label]) => `<div class="stat"><span>${label}</span><div class="bar"><span style="width:${items.filter(t => t.state === key).length / items.length * 100}%"></span></div><b>${items.filter(t => t.state === key).length}</b></div>`).join("") : renderList(items);
    const task = tasks.find(t => t.id === state.item);
    $("#detail").hidden = !task;
    $("#workspace").classList.toggle("has-detail", !!task);
    if (task) {
        $("#detail").innerHTML = `<div class="detail-head"><small>${task.project} / ${escapeHTML(task.list)}</small><button id="close-detail">← 목록</button></div><span class="pill">${task.id} · rev ${task.revision}</span><h2 style="margin-top:14px">${escapeHTML(task.title)}</h2>${items.includes(task) ? "" : '<p class="outside">현재 보기의 조건 밖 · 상세와 초안은 유지됩니다.</p>'}<dl><dt>상태</dt><dd>${labels[task.state]}</dd><dt>계획일</dt><dd>${task.planned || "없음"}</dd><dt>마감일</dt><dd>${task.due || "없음"}</dd></dl><button data-move="${task.id}">다른 프로젝트로 이동</button><label for="draft">작업 메모 <span id="draft-label" class="muted">${drafts.has(task.id) ? "· 미저장 초안" : ""}</span></label><textarea id="draft">${escapeHTML(drafts.get(task.id) ?? task.body)}</textarea><small>보기 전환과 뒤로 가기에서 이 시안의 메모를 유지합니다.</small><div class="relation"><h3>관계·근거</h3><p>${task.relation}</p><button id="note-link">Note에서 열기 ↗</button></div>`;
    }
}
function beginMove(id, trigger) {
    const task = tasks.find(t => t.id === id);
    moving = id; returnFocus = trigger;
    if (drafts.has(id) && drafts.get(id) !== task.body) { $("#draft-choice").showModal(); return; }
    showMove();
}
function showMove() {
    const task = tasks.find(t => t.id === moving);
    $("#move-task").textContent = `${task.id} · ${task.title}`;
    [...$("#target").options].forEach(o => { o.disabled = o.value === task.project; });
    $("#target").value = ["Projects", "Note", "Skills"].find(p => p !== task.project);
    refreshImpact(); $("#move").showModal();
}
function refreshImpact() { const task = tasks.find(t => t.id === moving); $("#impact").innerHTML = `<p><b>${task.project} → ${$("#target").value}</b></p><p>${task.relation} · 유지</p><p>진행 중 SkillRun 0 · 충돌 0 · 가상 검사 결과</p><p>상태·계획일·마감일 유지 / rev ${task.revision} → ${task.revision + 1}</p>`; }
document.addEventListener("click", event => {
    const b = event.target.closest("button"); if (!b) return;
    if (b.dataset.set) { if (state.status === "done" && b.dataset.set !== "all") { notification("완료 작업은 모든 작업에서 확인하세요."); return; } update({ set: b.dataset.set }); }
    if (b.dataset.layout) update({ layout: b.dataset.layout });
    if (b.dataset.task) update({ item: b.dataset.task });
    if (b.dataset.project) { $("#project").value = b.dataset.project; $("#project").dispatchEvent(new Event("change")); }
    if (b.dataset.move) beginMove(b.dataset.move, b);
    if (b.id === "close-detail") { const id = state.item; update({ item: "" }); document.querySelector(`[data-task="${id}"]`)?.focus(); }
    if (b.id === "clear") update({ set: "all", query: "", status: "open" });
    if (b.id === "theme") { document.documentElement.classList.toggle("dark"); b.textContent = document.documentElement.classList.contains("dark") ? "Light 보기" : "Dark 보기"; }
    if (b.id === "save-view") { saved = { ...state }; sessionStorage.setItem("projects-planning-view", JSON.stringify(saved)); render(); notification("검토용 보기를 이 탭에 저장했습니다. 작업 메모는 저장하지 않습니다."); }
    if (b.id === "restore-view") update({ ...saved, item: state.item });
    if (b.id === "note-link") notification("가상 Note 참조입니다. 실제 서비스는 호출하지 않습니다.");
    if (b.id === "mobile-more") notification("프로젝트·표시 방식·정보량은 화면 상단에서 바꿀 수 있습니다.");
    if (b.id === "cancel-move") $("#move").close();
    if (b.id === "cancel-draft") $("#draft-choice").close();
    if (b.id === "move-saved" || b.id === "save-then-move") { if (b.id === "save-then-move") { const task = tasks.find(t => t.id === moving); task.body = drafts.get(moving); task.revision += 1; drafts.delete(moving); render(); } $("#draft-choice").close(); showMove(); }
    if (b.id === "confirm-move") { const task = tasks.find(t => t.id === moving); undo = { id: task.id, project: task.project, expected: task.revision + 1 }; task.project = $("#target").value; task.revision += 1; $("#move").close(); render(); notification(`${task.project}로 이동했습니다. 동일 ID·관계를 유지합니다.`, true); }
    if (b.id === "undo" && undo) { const task = tasks.find(t => t.id === undo.id); if (task.revision !== undo.expected) { notification("이동 후 작업이 변경되어 되돌릴 수 없습니다."); return; } task.project = undo.project; task.revision += 1; undo = null; render(); notification("원래 프로젝트로 되돌렸습니다."); }
    if (b.id === "new-task") { $("#new-project").value = state.project === "all" ? "" : state.project; $("#new-title").value = ""; $("#create-hint").textContent = state.set === "today" ? "계획일 기본값: 11월 2일" : state.set === "upcoming" ? "계획일 기본값: 11월 3일" : "계획일 없음 · Inbox 분류"; $("#create").showModal(); }
    if (b.id === "cancel-create") $("#create").close();
    if (b.id === "confirm-create") { const project = $("#new-project"), title = $("#new-title"); if (!project.value) { project.focus(); return; } if (!title.value.trim()) { title.focus(); return; } const task = { id: `TASK-${108 + tasks.length}`, title: title.value.trim(), project: project.value, state: "todo", planned: state.set === "today" ? today : state.set === "upcoming" ? "2026-11-03" : "", due: "", list: "Inbox", body: "", revision: 1, relation: "관계 없음", abc: "미지정" }; tasks.push(task); $("#create").close(); update({ item: task.id }); notification("가상 작업을 추가했습니다. 새로고침하면 원본 예시로 돌아갑니다."); }
});
$("#project").addEventListener("change", event => {
    const project = event.target.value;
    if (project === "all" && state.layout !== "list" && !window.confirm("전체 프로젝트는 목록으로 표시됩니다. 현재 프로젝트의 보기는 돌아오면 복원합니다.")) { event.target.value = state.project; return; }
    projectMemory.set(state.project, { layout: state.layout, set: state.set, query: state.query, status: state.status });
    update({ ...projectMemory.get(project), project, ...(project === "all" ? { layout: "list" } : {}) });
});
$("#density").addEventListener("change", e => update({ density: e.target.value }));
$("#status").addEventListener("change", e => { if (e.target.value === "done" && state.set !== "all") { e.target.value = state.status; notification("완료 작업은 모든 작업에서 확인하세요."); return; } update({ status: e.target.value }); });
$("#query").addEventListener("input", e => { state.query = e.target.value; writeURL(true); render(); $("#query").focus(); });
$("#detail").addEventListener("input", e => { if (e.target.id === "draft") { drafts.set(state.item, e.target.value); $("#draft-label").textContent = "· 미저장 초안"; } });
$("#target").addEventListener("change", refreshImpact);
$("#move").addEventListener("close", () => { if (returnFocus?.isConnected) returnFocus.focus(); else $("#project").focus(); });
window.addEventListener("popstate", () => { restoreURL(); render(); });
try { const value = JSON.parse(sessionStorage.getItem("projects-planning-view")); if (value && typeof value === "object") saved = { ...base, ...value }; } catch { /* Keep the illustrative default. */ }
restoreURL(); render();
