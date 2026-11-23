/* Real Edge and API; public auth-options fixture selects the Microsoft-only UI. */
const {chromium,expect:playwrightExpect}=require('../web/node_modules/@playwright/test');
const fs=require('node:fs/promises');
const expect=playwrightExpect.configure({timeout:12000});
const base=process.env.PROJECTS_WEB_URL;
const shots='docs/implementation/screenshots/login-layout';
async function main(){
    if(!base)throw new Error('Use the disposable PostgreSQL browser launcher.');
    await fs.mkdir(shots,{recursive:true});
    const browser=await chromium.launch({channel:'msedge',headless:true});
    try{
        for(const [width,height,appearance,design] of [[583,1122,'dark','fluent'],[390,844,'dark','fluent'],[320,740,'light','glass'],[768,1024,'light','glass'],[1440,900,'dark','fluent'],[1920,1080,'light','glass']]){
            const context=await browser.newContext({viewport:{width,height},colorScheme:appearance});
            const page=await context.newPage();
            await page.addInitScript(({appearance,design})=>localStorage.setItem('projects:ui-theme:v2',JSON.stringify({version:1,design,appearance})),{appearance,design});
            await page.route('**/api/auth/options',route=>route.fulfill({json:{registration_enabled:false,auth_mode:'microsoft'}}));
            await page.goto(base+'/?view=projects');
            await expect(page.getByRole('link',{name:'Microsoft 계정으로 로그인'})).toBeVisible();
            const geometry=await page.evaluate(()=>{
                const rect=selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom};};
                return {brand:rect('.auth-page .brand'),theme:rect('.auth-theme'),intro:rect('.auth-intro'),form:rect('.auth-form'),
                    overflow:document.documentElement.scrollWidth>innerWidth,align:getComputedStyle(document.querySelector('.auth-page')).alignContent};
            });
            console.log(JSON.stringify({viewport:[width,height],appearance,design,...geometry}));
            expect(geometry.brand.y).toBeLessThanOrEqual(64);
            expect(geometry.brand.y).toBeGreaterThanOrEqual(12);
            expect(geometry.align).toBe('start');
            expect(geometry.overflow).toBe(false);
            expect(geometry.form.width).toBeGreaterThanOrEqual(width<=960?width-100:440);
            if(width<=960)expect(geometry.form.y).toBeGreaterThanOrEqual(geometry.intro.bottom);
            else expect(Math.abs(geometry.form.y-geometry.intro.y)).toBeLessThanOrEqual(2);
            const selectors=page.getByRole('group',{name:'화면 스타일 설정'});
            expect(await selectors.boundingBox()).toBeTruthy();
            for(const select of await selectors.locator('select').all()){
                const box=await select.boundingBox();expect(box.x).toBeGreaterThanOrEqual(12);expect(box.x+box.width).toBeLessThanOrEqual(width-12);
            }
            await page.screenshot({path:`${shots}/login-${width}-${appearance}.png`,fullPage:true});
            console.log(`PASS login layout ${width}x${height}/${appearance}/${design}`);
            await context.close();
        }
        const context=await browser.newContext({viewport:{width:390,height:844}});
        const page=await context.newPage();
        await page.goto(base+'/?view=login');
        await expect(page.getByLabel('비밀번호',{exact:true})).toBeVisible();
        await page.getByLabel('비밀번호',{exact:true}).focus();
        await page.setViewportSize({width:390,height:430});
        const login=page.getByRole('button',{name:'로그인',exact:true});
        await login.scrollIntoViewIfNeeded();
        const box=await login.boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(430);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        console.log('PASS focused password/short viewport: login remains scrollable and reachable');
        await context.close();
    }finally{await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
