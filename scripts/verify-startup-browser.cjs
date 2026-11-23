/* Real Edge/HTML/API/PostgreSQL. Deliberately hold module/session responses. */
const {chromium, expect} = require('../web/node_modules/@playwright/test');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const base = process.env.PROJECTS_WEB_URL;
const api = process.env.PROJECTS_API_URL;
const shots = 'docs/implementation/screenshots/startup';
function gate() { let release; const pending = new Promise(resolve => {release = resolve;}); return {pending, release}; }
async function checkBrandAppearance(page) {
    const home=page.getByRole('link',{name:'Projects 홈'});
    const read=()=>home.evaluate(element=>{
        const style=getComputedStyle(element), title=getComputedStyle(element.querySelector('span'));
        return {decoration:style.textDecorationLine,titleDecoration:title.textDecorationLine,border:style.borderTopWidth,
            background:style.backgroundColor,cursor:style.cursor,userSelect:style.userSelect,height:element.getBoundingClientRect().height,
            iconBorder:getComputedStyle(element.querySelector('img')).borderTopWidth};
    });
    await page.mouse.move(1,1);
    const rest=await read();
    expect(rest).toMatchObject({decoration:'none',titleDecoration:'none',border:'0px',iconBorder:'0px',cursor:'pointer',userSelect:'none'});
    expect(rest.height).toBeGreaterThanOrEqual(40);
    await home.hover();
    const hover=await read();
    expect(hover.decoration).toBe('none');expect(hover.titleDecoration).toBe('none');expect(hover.border).toBe('0px');
    expect(hover.background).not.toBe(rest.background);
}
async function main() {
    if (!base || !api) throw new Error('Use the isolated PostgreSQL browser launcher.');
    await fs.mkdir(shots, {recursive:true});
    const browser = await chromium.launch({channel:'msedge',headless:true});
    try {
        for (const [width, colorScheme] of [[1440,'light'],[390,'dark']]) {
            const context = await browser.newContext({viewport:{width,height:900},colorScheme,reducedMotion:'reduce'});
            const page = await context.newPage();
            const moduleGate = gate(), sessionGate = gate();
            const errors=[]; page.on('pageerror', error => errors.push(error.message));
            await page.route('**/src/main.tsx', async route => {await moduleGate.pending; await route.continue();});
            await page.route('**/api/session', async route => {await sessionGate.pending; await route.continue();});
            try {
                await page.goto(base+'/?view=projects', {waitUntil:'commit'});
                await expect(page.getByRole('status')).toHaveText('프로젝트 작업공간을 불러오는 중…');
                expect(await page.locator('.projects-theme').count()).toBe(0);
                expect(await page.locator('.workspace-loading-lines > span').count()).toBe(4);
                expect(await page.locator('.workspace-loading-dot').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
                expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
                await checkBrandAppearance(page);
                await page.screenshot({path:`${shots}/static-${width}-${colorScheme}.png`});
                console.log(`PASS static HTML loading before application JS (${width}/${colorScheme})`);
                moduleGate.release();
                await expect(page.locator('.projects-theme')).toBeVisible();
                await expect(page.getByRole('status')).toHaveText('프로젝트 작업공간을 불러오는 중…');
                sessionGate.release();
                await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
                expect(errors).toEqual([]);
                console.log(`PASS React loading while session pending then login transition (${width}/${colorScheme})`);
            } finally {moduleGate.release();sessionGate.release();await context.close();}
        }
        const context = await browser.newContext({viewport:{width:1440,height:1000}});
        const registered = await context.request.post(api+'/api/auth/register',{data:{username:'startup_'+randomUUID().slice(0,8),password:randomUUID()}});
        expect(registered.status()).toBe(201);
        const session = await registered.json();
        const projectResponse=await context.request.post(api+'/api/projects',{data:{name:'홈 이동 검증 프로젝트'},headers:{'X-CSRF-Token':session.csrf_token}});
        expect(projectResponse.status()).toBe(201);
        const project=await projectResponse.json();
        const page=await context.newPage();
        const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
        const projectGate=gate();
        await page.route('**/api/projects',async route=>{await projectGate.pending;await route.continue();});
        try {
            await page.goto(`${base}/?project=${project.id}&view=overview&run=old&baseline=old&q=search&taskStatus=blocked#old`);
            await expect(page.getByRole('status')).toHaveText('프로젝트 목록 불러오는 중…');
            projectGate.release();
            const home=page.getByRole('link',{name:'Projects 홈'});
            await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
            await checkBrandAppearance(page);
            await page.screenshot({path:`${shots}/home-hover-desktop.png`});
            await home.locator('img').click();
            await expect(page.getByRole('heading',{name:'프로젝트',exact:true})).toBeVisible();
            expect(new URL(page.url()).search).toBe('?view=projects');
            expect(new URL(page.url()).hash).toBe('');
            await page.goBack();
            await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
            await home.focus();await page.keyboard.press('Enter');
            await expect(page.getByRole('heading',{name:'프로젝트',exact:true})).toBeVisible();
            expect(new URL(page.url()).search).toBe('?view=projects');
            await home.focus();
            expect(await home.evaluate(element=>getComputedStyle(element).textDecorationLine)).toBe('none');
            await page.screenshot({path:`${shots}/home-focus-desktop.png`});
            expect(pageErrors).toEqual([]);
            console.log('PASS project loading, emblem home, cleared detail URL, Back and keyboard home');
        } finally {projectGate.release();await context.close();}
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
