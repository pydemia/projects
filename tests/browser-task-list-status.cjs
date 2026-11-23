/* Real Edge, PostgreSQL and API check for separate selection and status controls. */
const {chromium, expect} = require('../web/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.STORY_QA_URL || 'http://127.0.0.1:5197';
const evidence = process.env.STORY_QA_EVIDENCE;
const results = [];
let browser, context, page, csrf, project, personal, delivery;
async function request(method, route, data) {
    const response = await context.request.fetch(base + route, {method, data, headers: {'X-CSRF-Token': csrf || ''}});
    assert(response.ok(), `${method} ${route} status=${response.status()}`);
    return response.json();
}
const current = item => request('GET', `/api/items/${item.id}`);
async function visit(density='detailed') {
    await page.goto(base+'/?'+new URLSearchParams({project:project.id,view:'tasks',taskLayout:'list',taskScope:'all',taskStatus:'all',taskDensity:density}));
    await expect(page.locator('.task-row').first()).toBeVisible();
}
const trigger = title => page.getByRole('button', {name:new RegExp('^'+title+' 상태:')});
async function choose(item, state, label) {
    await trigger(item.title).click();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/items/${item.id}` && r.request().method() === 'PUT');
    await page.getByRole('menuitem', {name:label,exact:true}).click();
    return response;
}
async function check(name, action) {
    await action(); results.push({name,status:'passed'}); console.log('PASS '+name);
}
async function shot(name) {await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}
(async () => {
    browser = await chromium.launch({channel:'msedge',headless:true});
    context = await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
    page = await context.newPage();
    const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    const auth = await request('POST','/api/auth/register',{username:'statusqa_'+Date.now(),password:'status-browser-fixture-password'});
    csrf=auth.csrf_token;
    project=await request('POST','/api/projects',{name:'상태 선택 QA'});
    personal=await request('POST',`/api/projects/${project.id}/items`,{kind:'task',title:'개인 할 일',body:'',data:{workflow:'personal',requires_test:false}});
    delivery=await request('POST',`/api/projects/${project.id}/items`,{kind:'task',title:'근거가 필요한 작업',body:'',data:{workflow:'delivery',requires_test:false}});
    await check('desktop-selection-versus-round-status-and-keyboard',async()=>{
        await visit();
        const button=trigger(personal.title);
        const row=page.locator(".task-row").filter({hasText:personal.title}).first();
        await expect(row.getByRole('checkbox')).toHaveCount(1);
        await expect(row.getByRole('checkbox')).toHaveAttribute('aria-label','개인 할 일 일괄 선택');
        const geometry=await button.locator('.task-status-dot').evaluate(dot=>({radius:getComputedStyle(dot).borderRadius,corner:getComputedStyle(dot).getPropertyValue('corner-shape'),width:dot.getBoundingClientRect().width}));
        assert.equal(geometry.radius,'50%'); assert.equal(geometry.width,14);
        if(geometry.corner) assert.match(geometry.corner,/^(round|superellipse\(1\))$/);
        await button.focus();await page.keyboard.press('Enter');
        await expect(page.getByRole('menuitem')).toHaveCount(5);
        await shot('desktop-menu');
        await page.keyboard.press('Escape');await expect(button).toBeFocused();
        assert.equal((await current(personal)).revision,personal.revision);
        await row.getByRole('checkbox').click();
        assert.equal((await current(personal)).data.state,'todo');
    });
    await check('explicit-progress-completion-and-reopening',async()=>{
        assert.equal((await choose(personal,'in_progress','진행 중')).status(),200);
        await expect(trigger(personal.title)).toHaveAttribute('aria-label','개인 할 일 상태: 진행 중 · 변경');
        assert.equal((await current(personal)).data.state,'in_progress');
        assert.equal((await choose(personal,'done','완료')).status(),200);
        await expect(trigger(personal.title)).toHaveAttribute('aria-label','개인 할 일 상태: 완료 · 변경');
        assert.equal((await current(personal)).data.state,'done');
        assert.equal((await choose(personal,'todo','할 일')).status(),200);
        await expect(trigger(personal.title)).toHaveAttribute('aria-label','개인 할 일 상태: 할 일 · 변경');
    });
    await check('delivery-completion-evidence-gate-keeps-current-state',async()=>{
        assert.equal((await choose(delivery,'done','완료')).status(),409);
        await expect(page.getByText(/작업 상세에서 완료 근거/)).toBeVisible();
        assert.equal((await current(delivery)).data.state,'todo');
        await expect(trigger(delivery.title).locator('.task-status-dot')).toHaveAttribute('data-state','todo');
    });
    await check('cancellation-requires-reason',async()=>{
        await trigger(delivery.title).click();await page.getByRole('menuitem',{name:'취소',exact:true}).click();
        const dialog=page.getByRole('dialog',{name:'작업 취소'});
        await expect(dialog.getByRole('button',{name:'취소 확정'})).toBeDisabled();
        await dialog.getByRole('textbox',{name:'취소 사유'}).fill('요청 범위에서 제외');
        const saved=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/items/${delivery.id}` && r.request().method()==='PUT');
        await dialog.getByRole('button',{name:'취소 확정'}).click(); assert.equal((await saved).status(),200);
        assert.equal((await current(delivery)).data.cancellation_reason,'요청 범위에서 제외');
    });
    await check('mobile-light-and-dark-touch-layout',async()=>{
        await page.setViewportSize({width:390,height:844});
        for(const appearance of ['light','dark']) {
            await page.evaluate(value=>localStorage.setItem('projects:ui-theme:v2',JSON.stringify({version:1,design:'fluent',appearance:value,colormap:'design'})),appearance);
            await visit();
            const cancelSelection=page.getByRole('button',{name:'선택 취소',exact:true});
            if(await cancelSelection.count()) await cancelSelection.click();
            const button=trigger(personal.title);
            const row=page.locator(".task-row").filter({hasText:personal.title}).first();
            const checkbox=row.getByRole('checkbox');await expect(checkbox).toBeHidden();
            const bounds=await button.boundingBox();assert(bounds.width>=44 && bounds.height>=44);
            const title=await row.locator('.task-row-main').boundingBox();assert(title.x>=bounds.x+bounds.width);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
            await button.click();await expect(page.getByRole('menuitem',{name:'진행 중',exact:true})).toBeVisible();
            const menu=await page.getByRole('menu').boundingBox();assert(menu.x>=0 && menu.x+menu.width<=390 && menu.y+menu.height<=844);
            await shot('mobile-'+appearance);await page.keyboard.press('Escape');
            await page.getByRole('button',{name:'선택',exact:true}).click();
            await expect(row.getByRole('checkbox')).toBeVisible();
            await expect(button).toBeHidden();
            await page.getByRole('button',{name:'선택 취소',exact:true}).click();
            await expect(button).toBeVisible();
        }
    });
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'browser-result.json'),JSON.stringify({results,page_errors:errors},null,2));
})().catch(async error=>{
    console.error(error.message);if(page)await shot('failure');process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();});
