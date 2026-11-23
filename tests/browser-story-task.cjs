/* Real Edge/PostgreSQL browser acceptance. Run via .projects/research/story-task/browser_harness.py. */
const {chromium, expect} = require('../web/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.STORY_QA_URL || 'http://127.0.0.1:5197';
const evidence = process.env.STORY_QA_EVIDENCE || path.resolve('.projects/research/story-task');
const results = [];
let browser, page, context, csrf, project, task, story, lastApply;
const fixture = {username: `storyqa_${Date.now()}`, password: 'browser-qa-fixture-password'};
async function req(method, url, data) {
  const r = await context.request.fetch(base + url, {method, data, headers: {'X-CSRF-Token': csrf || ''}});
  assert(r.ok(), `${method} ${url}: ${r.status()} ${await r.text()}`);
  return r.json();
}
async function items() { return req('GET', `/api/projects/${project.id}/items`); }
async function goto(view, more={}) {
  await page.goto(base+'/?'+new URLSearchParams({project:project.id,view,...more}));
  await expect(page.locator('.project-planning-toolbar')).toBeVisible();
}
async function shot(name) {await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(evidence, name+'.png'), fullPage:true});}
async function check(name, fn) {
  try {const detail=await fn();results.push({name,status:'passed',detail});console.log('PASS '+name);}
  catch(error) {results.push({name,status:'failed',error:String(error)});await shot('failure-'+results.length);throw error;}
}
async function addProposal(kind, title, criteria='') {
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('변경 종류', {exact:true}).selectOption(kind);
  await dialog.getByLabel('후보 제목', {exact:true}).fill(title);
  if(criteria) await dialog.getByLabel('수용 조건 · 한 줄에 하나, 선택',{exact:true}).fill(criteria);
  await dialog.getByRole('button',{name:'후보 추가',exact:true}).click();
}
async function addLink(source,target) {
  const d=page.getByRole('dialog');
  await d.getByLabel('변경 종류',{exact:true}).selectOption('link');
  await d.getByLabel('연결 출발 항목',{exact:true}).selectOption(await d.getByLabel('연결 출발 항목',{exact:true}).locator('option').filter({hasText:source+' ·'}).first().getAttribute('value'));
  await d.getByLabel('연결 의미',{exact:true}).selectOption('implements');
  await d.getByLabel('연결 도착 항목',{exact:true}).selectOption(await d.getByLabel('연결 도착 항목',{exact:true}).locator('option').filter({hasText:target+' ·'}).first().getAttribute('value'));
  await d.getByRole('button',{name:'후보 추가',exact:true}).click();
}
async function apply() {
  const d=page.getByRole('dialog');
  await d.getByRole('button',{name:'변경 미리보기',exact:true}).click();
  await expect(d.getByRole('button',{name:'선택한 변경 적용',exact:true})).toBeEnabled();
  const response=page.waitForResponse(r=>/\/api\/planning-drafts\/[^/]+\/apply$/.test(new URL(r.url()).pathname));
  await d.getByRole('button',{name:'선택한 변경 적용',exact:true}).click();
  const applied=await response;assert(applied.ok(),await applied.text());
  lastApply={url:new URL(applied.url()).pathname,body:applied.request().postDataJSON(),receipt:await applied.json()};
  await expect(d.getByRole('button',{name:'선택한 변경 적용',exact:true})).toHaveCount(0);
}
async function closeDialog() {
  const d=page.getByRole('dialog');
  if(await d.count()) await d.getByRole('button',{name:/닫기|취소/,exact:false}).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function inline(label,value) {
  await page.getByRole('button',{name:label+' 수정',exact:true}).click();
  await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByLabel(label,{exact:true}).press(label==='Story 제목'?'Enter':'Control+Enter');
  await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);
}
(async()=>{
try {
  browser=await chromium.launch({channel:'msedge',headless:true});
  context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
  page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const auth=await req('POST','/api/auth/register',fixture);csrf=auth.csrf_token;
  await page.goto(base+'/?view=projects');
  await check('01-title-only-project-and-cancel-initial-planning',async()=>{
    await page.getByRole('button',{name:'+ 프로젝트 만들기',exact:true}).first().click();
    await page.getByLabel('프로젝트 이름',{exact:true}).fill('Story QA 프로젝트');
    await page.getByRole('dialog').getByRole('button',{name:'프로젝트 만들기',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'프로젝트가 준비되었습니다'})).toBeVisible();
    project=(await req('GET','/api/projects')).find(x=>x.name==='Story QA 프로젝트');
    assert.equal(project.goal,'');
    await page.getByRole('button',{name:'지금 기획하기',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'최초 기획'})).toBeVisible();
    await closeDialog();assert.equal((await items()).length,0);
    assert((await req('GET','/api/projects')).some(x=>x.id===project.id));
    await shot('desktop-initial-cancel');return 'Project persists; no Story/Task created.';
  });
  task=await req('POST',`/api/projects/${project.id}/items`,{kind:'task',title:'공유 기존 Task',body:'보존 본문',data:{workflow:'personal',state:'todo',planned_date:'2026-11-10',due_date:'2026-11-20'}});
  await check('02-incremental-manual-independent-selection-and-atomic-apply',async()=>{
    await goto('stories');await page.locator('.project-planning-toolbar').getByRole('button',{name:'기획 추가',exact:true}).click();
    await page.getByLabel('변경 의도 · 문제, 기대 결과, 범위와 제외',{exact:true}).fill('기존 업무에 알림 개선 추가');
    await addProposal('create_story','알림 결과 확인','알림 금액을 확인한다');
    await addProposal('create_task','독립 신규 Task');
    await addLink('공유 기존 Task','알림 결과 확인');
    const d=page.getByRole('dialog');
    await d.getByLabel('변경 종류',{exact:true}).selectOption('update_item');
    await d.getByLabel('수정할 기존 항목',{exact:true}).selectOption(task.id);
    await d.getByLabel('후보 제목',{exact:true}).fill('선택하지 않은 기존 변경');
    await d.getByRole('button',{name:'후보 추가',exact:true}).click();
    await expect(d.getByRole('checkbox',{name:'기존 항목 수정 선택하지 않은 기존 변경 선택',exact:true})).not.toBeChecked();
    const storyChoice=d.getByRole('checkbox',{name:'새 Story 알림 결과 확인 선택',exact:true});
    await storyChoice.uncheck();
    await expect(d.getByRole('button',{name:'변경 미리보기',exact:true})).toBeDisabled();
    await expect(d.getByRole('alert')).toBeVisible();
    assert.equal((await items()).length,1);
    await storyChoice.check();await shot('desktop-planning-preview');await apply();await closeDialog();
    const replay=await req('POST',lastApply.url,lastApply.body);assert.deepEqual(replay,lastApply.receipt);
    const rows=await items();story=rows.find(x=>x.title==='알림 결과 확인');
    assert(story);assert.equal(rows.filter(x=>x.kind==='task').length,2);
    const original=rows.find(x=>x.id===task.id);assert.equal(original.title,task.title);assert.equal(original.revision,task.revision);assert.deepEqual(original.data,task.data);
    assert.equal((await req('GET',`/api/projects/${project.id}/links`)).filter(x=>x.source_id===task.id&&x.target_id===story.id).length,1);
    return 'Unselected referenced Story blocks preview; new Story+Task+existing Task link applied; existing update unchecked and untouched; exact apply retry returns same receipt without duplicates.';
  });
  await check('03-repeated-planning-shared-task-unique-count',async()=>{
    await goto('stories');await page.locator('.project-planning-toolbar').getByRole('button',{name:'기획 추가',exact:true}).click();
    await addProposal('create_story','공유 Task가 기여하는 두 번째 Story');await addLink(task.title,'공유 Task가 기여하는 두 번째 Story');
    await apply();await closeDialog();await goto('stories');
    await expect(page.getByLabel('접근 가능한 Story·Task 현황')).toContainText('Task 완료 0/2');
    const storyList = page.getByLabel('Story 항목');
    await expect(storyList.getByRole('link')).toHaveCount(2);
    await expect(storyList.getByText(/Task 0\/1/)).toHaveCount(0);
    await storyList.getByRole('link',{name:'공유 Task가 기여하는 두 번째 Story',exact:true}).click();
    await expect(page.locator('.story-detail')).toContainText('연결 Task 완료 0/1');
    assert.equal((await items()).filter(x=>x.kind==='task').length,2);await shot('desktop-story-summary');
    return 'Second independent planning operation reused existing Task; Story 2, unique Tasks 2.';
  });
  await check('04-story-inline-keyboard-verification-and-recheck',async()=>{
    const empty=(await items()).find(x=>x.title==='공유 Task가 기여하는 두 번째 Story');
    await goto('stories',{item:empty.id,kind:'requirement'});await page.getByRole('button',{name:'검증 결과 기록',exact:true}).click();
    await page.getByRole('dialog').getByLabel('종합 검증 근거',{exact:true}).fill('수용 조건이 없으면 충족을 기록하지 않는다');
    await expect(page.getByRole('dialog').getByRole('button',{name:'충족으로 기록',exact:true})).toBeDisabled();
    await expect(page.getByRole('dialog')).toContainText('수용 조건을 하나 이상');await closeDialog();
    await goto('stories',{item:story.id,kind:'requirement'});
    const title=page.getByRole('button',{name:'Story 제목 수정',exact:true});await title.focus();await page.keyboard.press('Enter');
    await expect(page.getByLabel('Story 제목',{exact:true})).toBeFocused();await page.getByLabel('Story 제목',{exact:true}).fill('알림 결과 확인 · 직접 편집');await page.keyboard.press('Enter');
    await expect(title).toBeFocused();
    await inline('현재 상태·문제','알림이 잘못 인식될 수 있다');await inline('기대 결과','수정 후 정확한 금액을 확인한다');
    await page.getByRole('button',{name:'검증 결과 기록',exact:true}).click();const d=page.getByRole('dialog');
    await d.getByRole('checkbox',{name:'알림 금액을 확인한다',exact:true}).check();await d.getByLabel('종합 검증 근거',{exact:true}).fill('실제 Edge에서 수정 금액과 저장 결과를 확인했다');
    await expect(d.getByRole('button',{name:'충족으로 기록',exact:true})).toBeDisabled();
    await d.getByLabel('수용 조건 1 검증 근거',{exact:true}).fill('알림에 표시한 금액을 실제 화면과 대조했다');
    await d.getByRole('button',{name:'충족으로 기록',exact:true}).click();await expect(d).toHaveCount(0);
    await expect(page.getByLabel('처리 상태',{exact:true})).toHaveValue('fulfilled');
    assert.equal((await req('GET',`/api/projects/${project.id}/stories`)).story_fulfilled,1);
    await inline('수용 조건','알림 금액을 확인한다\n수정한 금액을 재확인한다');
    await expect(page.locator('.story-detail').getByText('재확인 필요',{exact:true})).toBeVisible();
    const summary=await req('GET',`/api/projects/${project.id}/stories`);assert.equal(summary.story_fulfilled,0);
    assert.equal((await req('GET',`/api/items/${story.id}/story-verifications`)).length,1);assert.equal((await items()).find(x=>x.id===task.id).data.state,'todo');
    await shot('desktop-story-recheck');return 'Enter focus/edit/save/restore; explicit fulfillment despite open Task; changed criteria preserves proof and requires recheck.';
  });
  await check('05-task-four-views-and-legacy-story-route',async()=>{
    for(const view of ['list','board','calendar','insights']) {
      await goto('tasks',{taskLayout:view,taskDensity:'complex',taskScope:'all'});
      await expect(page.locator('.task-result-count')).toContainText('2개 작업');
      assert.equal((await items()).filter(x=>x.kind==='task').length,2);
      if(view==='list'||view==='board') {
        const related=page.locator('.task-story-disclosure');
        await expect(related).not.toHaveAttribute('open');
        await related.locator('summary').click();
        await expect(related).toHaveAttribute('open','');
        await expect(page.locator('.task-selected')).toHaveCount(0);
        const chips=page.locator('.task-story-chips');
        await expect(chips).toBeVisible();await expect(chips.getByRole('link')).toHaveCount(2);
        await expect(chips.getByRole('link').first()).toHaveCSS('text-decoration-line','none');
      }
      if (view === 'list') {
        const titleButton = page.getByRole('button', {name: task.title, exact: true});
        const row = page.locator('.task-row', {has: titleButton});
        const detail = page.locator('.task-selected');
        await row.click({position: {x: 4, y: 4}});
        await expect(detail).toContainText(task.body);
        await detail.getByRole('button', {name: '닫기', exact: true}).click();
        await expect(titleButton).toBeFocused();
        await titleButton.press('Space');
        await expect(detail).toContainText(task.body);
      }
    }
    await goto('planning',{kind:'requirement',item:story.id});await expect(page.getByRole('button',{name:'Story 제목 수정',exact:true})).toContainText('알림 결과 확인 · 직접 편집');
    await shot('desktop-legacy-story-route');
    await page.goto(base+'/?view=stories');await expect(page).toHaveURL(new RegExp('project='+project.id));
    return 'List/board/calendar/insights show same 2 Tasks; shared Task has 2 Story chips in list/board; old planning bookmark opens same Story ID; missing project restores last selection.';
  });
  await check('06-optional-iteration-baseline-diff-preserves-task-dates',async()=>{
    await goto('schedules');const create=page.locator('.schedule-create').first();await create.locator('select[name="kind"]').selectOption('iteration');await create.getByLabel('제목',{exact:true}).fill('QA Iteration');await create.getByRole('button',{name:'추가',exact:true}).click();
    const row=page.locator('.schedule-row').filter({hasText:'QA Iteration'});await expect(row).toBeVisible();await row.getByRole('button',{name:'일정 편집',exact:true}).click();
    await row.getByLabel('시작 예정일',{exact:true}).fill('2026-11-09');await row.getByLabel('종료 예정일',{exact:true}).fill('2026-11-23');await row.getByRole('button',{name:'저장',exact:true}).click();
    const assignment=page.locator('.schedule-assignment').filter({hasText:task.title});await assignment.locator('select').selectOption({label:'QA Iteration'});await assignment.getByRole('button',{name:'배정 저장',exact:true}).click();
    await expect(assignment.getByRole('list')).toContainText('미배정 → QA Iteration');
    const baseline=page.locator('.schedule-create').last();await baseline.getByLabel('기준선 이름',{exact:true}).fill('QA 일정 기준선');await baseline.getByLabel('선택·변경 사유',{exact:true}).fill('변경 전 계획 보존');await baseline.getByRole('button',{name:'일정 기준선 저장',exact:true}).click();
    await expect(page.locator('.schedule-snapshots')).toContainText('QA 일정 기준선');await row.getByRole('button',{name:'일정 편집',exact:true}).click();await row.getByLabel('종료 예정일',{exact:true}).fill('2026-11-25');await row.getByRole('button',{name:'저장',exact:true}).click();
    await page.getByRole('button',{name:'현재 계획과 비교',exact:true}).click();await expect(page.getByLabel('QA 일정 기준선 비교')).toContainText('QA Iteration');
    const original=(await items()).find(x=>x.id===task.id);assert.equal(original.data.planned_date,'2026-11-10');assert.equal(original.data.due_date,'2026-11-20');assert.equal(original.revision,task.revision);
    await shot('desktop-schedule-diff');return 'Optional Iteration assignment/history and snapshot date diff; Task dates/revision unchanged.';
  });
  await check('07-mobile-story-planning-and-schedule-overflow',async()=>{
    await page.setViewportSize({width:390,height:844});
    for(const view of ['stories','schedules']) {
      await goto(view,view==='stories'?{item:story.id,kind:'requirement'}:{});
      await expect(page.locator(view==='stories'?'.story-detail':'.schedules-page')).toBeVisible();
      const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(dimensions.scroll<=dimensions.width+1,`${view} document overflow ${JSON.stringify(dimensions)}`);
      await shot('mobile-'+view);
    }
    await goto('stories');await page.locator('.project-planning-toolbar').getByRole('button',{name:'기획 추가',exact:true}).click();await addProposal('create_story','모바일 미적용 후보');
    const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:'변경 미리보기',exact:true})).toBeInViewport();
    const overflow=await d.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert(overflow.scroll<=overflow.width+1,JSON.stringify(overflow));
    await shot('mobile-planning');await closeDialog();assert(!(await items()).some(x=>x.title==='모바일 미적용 후보'));
    await page.setViewportSize({width:1440,height:1000});return '390px Story, schedules and planning have no document/dialog horizontal overflow; cancel leaves candidate unapplied.';
  });
  await check('08-real-session-expiry-restores-story-inline-draft',async()=>{
    await goto('stories',{item:story.id,kind:'requirement'});await page.getByRole('button',{name:'기대 결과 수정',exact:true}).click();await page.getByLabel('기대 결과',{exact:true}).fill('로그인 후 복원할 결과 초안');
    await req('POST','/api/auth/logout');
    await page.getByLabel('기대 결과',{exact:true}).press('Control+Enter');await expect(page.getByLabel('사용자 이름',{exact:true})).toBeVisible();
    await page.getByLabel('사용자 이름',{exact:true}).fill(fixture.username);await page.getByLabel('비밀번호',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'로그인',exact:true}).click();
    await expect(page.getByLabel('기대 결과',{exact:true})).toHaveValue('로그인 후 복원할 결과 초안');
    const current=await context.request.get(base+`/api/items/${story.id}`);assert.notEqual((await current.json()).data.expected_outcome,'로그인 후 복원할 결과 초안');
    await shot('desktop-reauth-draft');await page.getByLabel('기대 결과',{exact:true}).press('Escape');
    return 'Actual logout/401/password relogin restores Story URL and unsaved inline draft without automatic replay.';
  });
  await check('09-viewer-story-and-schedule-readonly-controls',async()=>{
    csrf=(await (await context.request.get(base+'/api/session')).json()).csrf_token;
    const viewer=await browser.newContext({viewport:{width:1440,height:1000}});
    try {
      const identity=await (await viewer.request.post(base+'/api/auth/register',{data:{username:'viewer_'+Date.now(),password:fixture.password}})).json();
      const roles=await req('GET',`/api/projects/${project.id}/roles`);const current=(await req('GET','/api/projects')).find(x=>x.id===project.id);
      const invite=await req('POST',`/api/projects/${project.id}/invitations`,{expected_revision:current.access.access_revision,operation_id:crypto.randomUUID(),role_id:roles.find(x=>x.preset==='viewer').id,account_id:identity.user.id});
      const previewResponse=await viewer.request.post(base+`/api/project-invitations/${invite.id}/preview`,{headers:{'X-CSRF-Token':identity.csrf_token},data:{token:invite.token}});assert(previewResponse.ok(),await previewResponse.text());const invitationPreview=await previewResponse.json();
      const accepted=await viewer.request.post(base+`/api/project-invitations/${invite.id}/accept`,{headers:{'X-CSRF-Token':identity.csrf_token},data:{expected_revision:invitationPreview.access_revision,operation_id:crypto.randomUUID(),token:invite.token}});assert(accepted.ok(),await accepted.text());
      const p=await viewer.newPage();await p.goto(base+'/?'+new URLSearchParams({project:project.id,view:'stories',item:story.id,kind:'requirement'}));
      await expect(p.getByRole('button',{name:'Story 제목 수정',exact:true})).toBeDisabled();await expect(p.getByRole('button',{name:'검증 결과 기록',exact:true})).toBeDisabled();await expect(p.locator('.project-planning-toolbar').getByRole('button',{name:'관련 작업 기획',exact:true})).toBeDisabled();
      await p.goto(base+'/?'+new URLSearchParams({project:project.id,view:'schedules'}));await expect(p.locator('.schedule-row')).toHaveCount(1);await expect(p.getByRole('button',{name:'일정 편집',exact:true})).toHaveCount(0);await expect(p.getByRole('button',{name:'배정 저장',exact:true})).toHaveCount(0);await expect(p.getByRole('button',{name:'일정 기준선 저장',exact:true})).toHaveCount(0);
      await p.screenshot({path:path.join(evidence,'desktop-viewer-schedules.png'),fullPage:true});return 'Actual invited viewer sees Story/Iteration/history; edit/verify/planning controls disabled and schedule mutation controls absent.';
    }finally{await viewer.close();}
  });
  await check('10-long-story-tiles-fit-and-open-the-body', async () => {
    const longTitle = '환경 분리와 키 회전 및 복원 절차의 검증 근거 연결 '.repeat(4);
    const body = 'Story 목록에서 연 본문입니다.';
    const excerpt = '긴 제목 아래에 기대 결과와 진행 정보가 표시됩니다. '.repeat(8);
    const created = [];
    for (let index = 0; index < 12; index++) {
      created.push(await req('POST', `/api/projects/${project.id}/items`, {
        kind: 'requirement', title: `${index + 1} · ${longTitle}`.trim(), body,
        data: {expected_outcome: excerpt, processing_state: 'raised'},
      }));
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 850});
      await goto('stories');
      const cards = page.getByLabel('Story 항목').locator('.doc-item');
      await expect(cards).toHaveCount(14);
      if (width > 760) await expect(page.locator('.workspace-detail')).toContainText('목록에서 Story를 선택해 주세요.');
      const geometry = await cards.evaluateAll(elements => elements.map(element => {
        const bounds = element.getBoundingClientRect();
        return {top: bounds.top, bottom: bounds.bottom, contentBottom: element.lastElementChild.getBoundingClientRect().bottom};
      }));
      for (const [index, card] of geometry.entries()) {
        assert(card.contentBottom <= card.bottom + 1, `Story ${index + 1} overflows its tile at ${width}px`);
        if (index > 0) assert(geometry[index - 1].bottom <= card.top + 1, `Story tiles overlap at ${width}px`);
      }
      const tile = cards.and(page.getByRole('link', {name: created[0].title, exact: true}));
      await expect(tile).toHaveText(created[0].title);
      await expect(tile).toHaveCSS('text-decoration-line', 'none');
      await tile.click({position: {x: 6, y: 6}});
      await expect(page.locator('.story-detail')).toContainText(body);
      await expect(page.locator('.story-detail')).toContainText(excerpt.trim());
    }
    return 'Long Story titles fit in separate tiles. Body and excerpt appear in detail on desktop and mobile.';
  });
  await check('11-no-browser-runtime-errors',async()=>{assert.deepEqual(errors,[]);return 'No uncaught page errors during exercised flows.';});
} catch(error) {console.error(error.stack||error);process.exitCode=1;}
finally {fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'browser-result.json'),JSON.stringify({browser:'Microsoft Edge',viewport:[1440,1000],network_mock:false,results},null,2));if(browser) await browser.close();}
})();
