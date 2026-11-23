(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const initial = {
    stories: [
      {id:'S1', title:'결제 알림을 확인하고 지출로 저장', state:'진행 중', problem:'알림을 보고 금액과 가맹점을 직접 입력한다.', outcome:'추출 결과를 확인·수정한 뒤 지출을 저장한다.', criteria:['지원 알림 예시에서 금액·가맹점을 확인할 수 있다.','사용자가 수정·확정하면 지출이 한 번 저장된다.']},
      {id:'S2', title:'송금 알림을 수입·지출로 구분해 저장', state:'계획됨', problem:'송금 알림을 별도로 분류해야 한다.', outcome:'송금 유형을 확인한 뒤 수입·지출로 기록한다.', criteria:['예시 송금 알림의 방향을 구분한다.','사용자가 구분 결과를 확인하고 저장한다.']},
    ],
    tasks: [
      {id:'T1',title:'Android 알림 수집 공통 모듈',state:'done',stories:['S1','S2'],depends:[],related:[]},
      {id:'T2',title:'카드 알림 형식 조사',state:'done',stories:['S1'],depends:[],related:[]},
      {id:'T3',title:'결제 금액·가맹점 추출',state:'in_progress',stories:['S1'],depends:['T2'],related:['T4']},
      {id:'T4',title:'확인·수정·저장 화면',state:'todo',stories:['S1'],depends:['T1'],related:['T3']},
      {id:'T5',title:'송금 알림 구분 규칙 정의',state:'todo',stories:['S2'],depends:[],related:[]},
      {id:'T6',title:'주간 백업·복구 점검',state:'todo',stories:[],depends:[],related:[]},
    ],
  };
  let data = structuredClone(initial), view='overview', layout='list', mode='change';
  let projectNumber=0, activeProject='existing';
  let projects=new Map([['existing',{name:'aftersum',data,pendingInitial:false}]]), appliedProjects=new Set();
  const drafts={initial:'첫 버전에서 결제 알림을 확인·수정하고 지출로 저장할 수 있게 한다.',change:'같은 알림이 중복 등록됩니다. 기존 수집·저장 동작을 유지하면서 중복 등록을 방지하고 싶습니다.'};
  const originalDrafts={...drafts};
  let selected=new Set(['story','task','new-link','reuse','dependency']);
  const references={initial:'',change:''};
  const planKey=()=>activeProject+'\n'+drafts[mode]+'\n'+references[mode];
  const states={todo:'할 일',in_progress:'진행 중',done:'완료'};
  const candidates=()=>mode==='initial' ? [
    {id:'story',type:'새 Story',title:'결제 알림을 확인하고 지출로 저장',note:'새 프로젝트의 기대 결과와 수용 조건',needs:[]},
    {id:'task',type:'새 Task',title:'결제 알림 입력·확인 화면 구현',note:'아직 실행하지 않은 새 작업',needs:[]},
    {id:'new-link',type:'연결',title:'새 Task → 새 Story',note:'Story에 기여하는 실제 활동을 연결',needs:['story','task']},
  ] : [
    {id:'story',type:'새 Story',title:'알림의 중복 등록 방지',note:'기존 Story와 별도의 문제·기대 결과',needs:[]},
    {id:'task',type:'새 Task',title:'알림 중복 판별과 회귀 검증',note:'새 실행 작업을 추가하며 기존 상태는 보존',needs:[]},
    {id:'new-link',type:'연결',title:'새 Task → 새 Story',note:'Story에 기여하는 연결 · 연결을 해제하면 독립 Task로 생성 가능',needs:['story','task']},
    {id:'reuse',type:'기존 연결',title:'T1 알림 수집 모듈 → 새 Story',note:'공통 Task 재사용 · T1의 ID·완료 상태는 그대로',needs:['story']},
    {id:'dependency',type:'선행 관계',title:'새 Task → 먼저 끝낼 T1',note:'새 작업이 기존 수집 기반에 의존 · 시작 자동 차단 없음',needs:['task']},
    {id:'update',type:'기존 수정 · 기본 미선택',title:'T3 설명에 중복 처리 범위 추가',note:'명시 선택 시 설명만 변경하는 제안. 상태·완료 이력은 유지',needs:[]},
  ].filter(row=>activeProject==='existing'||!['reuse','dependency','update'].includes(row.id));
  const nextTaskId=()=> 'T'+(Math.max(0,...data.tasks.map(task=>Number(task.id.slice(1))).filter(Number.isFinite))+1);
  const links=task=>task.stories.map(id=>`<span class="chip">${esc(id)}</span>`).join('')||'<span class="muted">연결 없음</span>';
  function showView(next){view=next;document.querySelectorAll('[data-screen]').forEach(element=>element.hidden=element.id!==view);document.querySelectorAll('[data-view]').forEach(button=>{if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});render();}
  function render(){
    $('#project-title').textContent=projects.get(activeProject).name;$('.project-name').textContent=projects.get(activeProject).name;
    $('#demo-project').innerHTML=[...projects].map(([id,project])=>`<option value="${id}">${esc(project.name)}</option>`).join('');$('#demo-project').value=activeProject;
    $('#story-count').textContent=`0 / ${data.stories.length}`;
    $('#task-count').textContent=`${data.tasks.filter(task=>task.state==='done').length} / ${data.tasks.length}`;
    $('#independent-count').textContent=data.tasks.filter(task=>!task.stories.length).length;
    $('#next-tasks').innerHTML=data.tasks.filter(task=>task.state!=='done').slice(0,3).map(task=>`<div class="next-task"><button class="title-button" data-task="${task.id}">${esc(task.title)}</button><span class="state ${task.state}">${states[task.state]}</span></div>`).join('');
    const storyQuery=$('#story-search').value.trim();
    $('#story-rows').innerHTML=data.stories.filter(story=>story.title.includes(storyQuery)).map(story=>{const tasks=data.tasks.filter(task=>task.stories.includes(story.id));return `<tr><td><button class="title-button" data-story="${story.id}">${esc(story.title)}</button><small>${story.id} · ${esc(story.outcome)}</small></td><td>${esc(story.state)}</td><td>${tasks.filter(task=>task.state==='done').length} / ${tasks.length}</td><td>0 / ${story.criteria.length}<small>수용 조건 별도 검증</small></td></tr>`;}).join('');
    const value=$('#story-filter').value;
    $('#story-filter').innerHTML='<option value="all">전체 Task</option><option value="none">Story 없는 Task</option>'+data.stories.map(story=>`<option value="${story.id}">${story.id} · ${esc(story.title)}</option>`).join('');
    $('#story-filter').value=[...$('#story-filter').options].some(option=>option.value===value)?value:'all';
    const filter=$('#story-filter').value, query=$('#task-search').value.trim();
    const tasks=data.tasks.filter(task=>task.title.includes(query)&&(filter==='all'||filter==='none'&&!task.stories.length||task.stories.includes(filter)));
    $('#task-rows').innerHTML=tasks.map(task=>`<tr><td><span class="state ${task.state}">${states[task.state]}</span></td><td><button class="title-button" data-task="${task.id}">${esc(task.title)}</button><small>${task.id}</small></td><td>${links(task)}</td><td>${task.depends.length?'먼저: '+task.depends.join(', '):''}${task.related.length?'<small>관련: '+task.related.join(', ')+'</small>':''}</td></tr>`).join('')||'<tr><td colspan="4">조건에 맞는 Task가 없습니다.</td></tr>';
    $('#task-board').innerHTML=['todo','in_progress','done'].map(state=>`<section class="column"><h3>${states[state]} · ${tasks.filter(task=>task.state===state).length}</h3>${tasks.filter(task=>task.state===state).map(task=>`<article class="task-card"><small>${task.id}</small><button class="title-button" data-task="${task.id}">${esc(task.title)}</button><div>${links(task)}</div></article>`).join('')}</section>`).join('');
    $('#task-list').hidden=layout!=='list';$('#task-board').hidden=layout!=='board';
    document.querySelectorAll('[data-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===layout)));
  }
  function detail(type,id){
    if(type==='story'){
      const story=data.stories.find(item=>item.id===id), tasks=data.tasks.filter(task=>task.stories.includes(id));
      $('#detail-title').textContent=`${id} · ${story.title}`;
      $('#detail-body').innerHTML=`<div class="detail-meta"><span class="chip">${esc(story.state)}</span><span>Task ${tasks.filter(task=>task.state==='done').length}/${tasks.length}</span><span>수용 조건 0/${story.criteria.length}</span></div><h3>현재 문제</h3><p>${esc(story.problem)}</p><h3>기대 결과</h3><p>${esc(story.outcome)}</p><section class="detail-block"><h3>수용 조건 · 아직 미검증</h3><ul>${story.criteria.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><p class="muted">연결 Task가 완료돼도 Story는 자동으로 충족되지 않습니다.</p></section><section class="detail-block"><h3>관련 Task</h3>${tasks.map(task=>`<p>${task.id} · ${esc(task.title)} · ${states[task.state]}${task.stories.length>1?' <span class="chip">다른 Story에도 기여</span>':''}</p>`).join('')||'<p>아직 연결된 Task가 없습니다.</p>'}<button data-plan-story="${story.id}">관련 작업 기획</button></section>`;
    }else{
      const task=data.tasks.find(item=>item.id===id);
      $('#detail-title').textContent=`${id} · ${task.title}`;
      $('#detail-body').innerHTML=`<p class="state ${task.state}">${states[task.state]}</p>${task.note?`<h3>본문</h3><p>${esc(task.note)}</p>`:''}<section class="detail-block"><h3>관련 Story · 다중 연결</h3>${task.stories.map(storyId=>`<p>${storyId} · ${esc(data.stories.find(story=>story.id===storyId).title)}</p>`).join('')||'<p>Story 연결 없이 실행하는 독립 Task입니다.</p>'}</section><section class="detail-block"><h3>먼저 끝낼 작업</h3><p>${task.depends.join(', ')||'선행 관계 없음'}</p><h3>이 작업을 기다리는 작업</h3><p>${data.tasks.filter(item=>item.depends.includes(id)).map(item=>item.id).join(', ')||'없음'}</p><h3>관련 작업</h3><p>${task.related.join(', ')||'연관 관계 없음'}</p><p class="muted">관련은 선후·부모/자식 의미가 없습니다. 선행 관계의 기존 완료 규칙은 유지합니다.</p></section>`;
    }
    $('#detail').showModal();
  }
  function saveDraft(){drafts[mode]=$('#plan-intent').value;references[mode]=$('#plan-reference').value;}
  function openInitialProject(){
    activeProject='new-'+(++projectNumber);data={stories:[],tasks:[]};projects.set(activeProject,{name:'새 프로젝트 예시 '+projectNumber,data,pendingInitial:true});
    showView('overview');openPlan('initial');
  }
  function openPlan(next){
    if($('#detail').open)$('#detail').close();mode=next??(projects.get(activeProject).pendingInitial?'initial':'change');
    selected=new Set(candidates().filter(row=>row.id!=='update').map(row=>row.id));
    $('#plan-title').textContent=mode==='initial'?'최초 프로젝트 기획':'추가 기능·개선 기획';
    $('#plan-reference').innerHTML=mode==='initial'?'<option value="idea">입력한 프로젝트 목적과 아이디어</option><option value="none">추가 참고 자료 없음</option>':(data.stories[0]?`<option value="story">${esc(data.stories[0].id+' · '+data.stories[0].title)}</option>`:'')+(data.tasks[0]?`<option value="task">${esc(data.tasks[0].id+' · '+data.tasks[0].title)}</option>`:'')+'<option value="none">참고 대상 없이 새 기획</option>';
    if(references[mode])$('#plan-reference').value=references[mode];
    $('#plan-context').textContent=mode==='initial'?projects.get(activeProject).name+' · 프로젝트는 이미 만들었습니다. 기획을 취소해도 빈 프로젝트는 남고, 기존 aftersum은 보존됩니다.':'진행 중인 '+projects.get(activeProject).name+' · 필요한 변경분을 추가합니다. 기존 완료 Task와 진행 상태는 유지합니다.';
    $('#plan-intent').value=drafts[mode];$('#plan-input').hidden=false;$('#plan-preview').hidden=true;$('#plan-apply').hidden=true;$('#plan-error').textContent='';
    $('#planner').showModal();
  }
  function renderCandidates(){
    const focusId=document.activeElement?.dataset.candidate;
    const rows=candidates(), invalid=rows.filter(row=>selected.has(row.id)&&row.needs.some(id=>!selected.has(id)));
    $('#candidate-list').innerHTML=rows.map(row=>`<label class="candidate ${invalid.includes(row)?'invalid':''}"><input type="checkbox" data-candidate="${row.id}" ${selected.has(row.id)?'checked':''}><span><span class="operation">${row.type}</span><strong>${esc(row.title)}</strong><small>${esc(row.note)}</small></span></label>`).join('');
    $('#selection-summary').textContent=`선택 ${rows.filter(row=>selected.has(row.id)).length}개 변경 · 기존 수정 ${selected.has('update')?1:0}개`;
    $('#plan-apply').textContent=`선택한 ${rows.filter(row=>selected.has(row.id)).length}개 적용`;
    $('#plan-error').textContent=invalid.length?'선택한 연결의 Story 또는 Task 후보가 빠졌습니다. 참조 대상을 선택하거나 연결을 해제해 주세요.':'';
    $('#plan-apply').disabled=invalid.length>0||!rows.some(row=>selected.has(row.id))||appliedProjects.has(planKey())&&mode==='change';
    if(appliedProjects.has(planKey())&&mode==='change')$('#plan-error').textContent='같은 예시 기획을 이미 적용했습니다. 다른 기획 의도를 입력하면 새 요청으로 검토할 수 있습니다.';
    if(focusId)document.querySelector(`[data-candidate="${focusId}"]`).focus();
  }
  function apply(){
    if($('#plan-apply').disabled)return;
    const initialMode=mode==='initial', storyId=initialMode?'S-new':'S'+(Math.max(0,...data.stories.map(story=>Number(story.id.slice(1))).filter(Number.isFinite))+1);
    const taskId=nextTaskId();
    if(selected.has('story'))data.stories.push({id:storyId,title:initialMode?'결제 알림을 확인하고 지출로 저장':'알림의 중복 등록 방지',state:'제기됨',problem:drafts[mode],outcome:initialMode?'확인한 결제 내용을 지출로 저장한다.':'같은 알림에서 지출이 중복 생성되지 않는다.',criteria:['지원 예시에서 기대 결과를 확인한다.','기존 정상 처리와 회귀 사례를 확인한다.']});
    if(selected.has('task'))data.tasks.push({id:taskId,title:initialMode?'결제 알림 입력·확인 화면 구현':'알림 중복 판별과 회귀 검증',state:'todo',stories:selected.has('new-link')?[storyId]:[],depends:selected.has('dependency')?['T1']:[],related:[]});
    if(selected.has('reuse'))data.tasks.find(task=>task.id==='T1').stories.push(storyId);
    if(selected.has('update'))data.tasks.find(task=>task.id==='T3').note='중복 처리 범위를 설명에 추가한 예시';
    if(!initialMode)appliedProjects.add(planKey());
    projects.get(activeProject).pendingInitial=false;
    const summary=`Story ${Number(selected.has('story'))}개 · Task ${Number(selected.has('task'))}개 · 연결 ${['new-link','reuse','dependency'].filter(id=>selected.has(id)).length}개 · 기존 수정 ${Number(selected.has('update'))}개`;
    $('#planner').close();showView(selected.has('story')?'stories':'tasks');$('#message').textContent=(initialMode?'최초 기획을 시안에 반영했습니다. ':'변경을 시안에만 적용했습니다. ')+summary;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.view)showView(button.dataset.view);
    if(button.dataset.layout){layout=button.dataset.layout;render();}
    if(button.dataset.task)detail('task',button.dataset.task);
    if(button.dataset.story)detail('story',button.dataset.story);
    if(button.dataset.planStory)openPlan('change');
  });
  document.addEventListener('change',event=>{const id=event.target.dataset.candidate;if(id){if(event.target.checked)selected.add(id);else selected.delete(id);renderCandidates();}});
  $('#story-search').addEventListener('input',render);$('#task-search').addEventListener('input',render);$('#story-filter').addEventListener('change',render);
  $('.brand').onclick=event=>{event.preventDefault();showView('overview');};
  $('#quick-task').addEventListener('submit',event=>{event.preventDefault();const title=$('#quick-title').value.trim();if(!title)return;data.tasks.push({id:nextTaskId(),title,state:'todo',stories:[],depends:[],related:[]});projects.get(activeProject).pendingInitial=false;$('#quick-title').value='';$('#message').textContent='독립 Task를 시안에 추가했습니다. Story 연결은 나중에 할 수 있습니다.';render();});
  $('#plan-open').onclick=()=>openPlan();$('#change-open').onclick=()=>openPlan('change');$('#initial-open').onclick=openInitialProject;
  $('#detail-close').onclick=()=>$('#detail').close();
  $('#make-preview').onclick=()=>{saveDraft();if(!drafts[mode].trim()){$('#plan-intent').focus();return;}$('#plan-input').hidden=true;$('#plan-preview').hidden=false;$('#plan-apply').hidden=false;renderCandidates();};
  $('#edit-intent').onclick=()=>{$('#plan-preview').hidden=true;$('#plan-input').hidden=false;$('#plan-apply').hidden=true;};
  const cancel=()=>{saveDraft();$('#planner').close();$('#message').textContent='기획 입력은 예시 안에 유지했습니다. 실제 Story와 Task는 바뀌지 않았습니다.';};
  $('#plan-close').onclick=cancel;$('#plan-cancel').onclick=cancel;$('#planner').addEventListener('cancel',saveDraft);$('#plan-apply').onclick=apply;
  $('#demo-project').onchange=()=>{activeProject=$('#demo-project').value;data=projects.get(activeProject).data;$('#message').textContent='선택한 예시 프로젝트로 전환했습니다.';render();};
  $('#reset').onclick=()=>{data=structuredClone(initial);activeProject='existing';projectNumber=0;projects=new Map([['existing',{name:'aftersum',data,pendingInitial:false}]]);appliedProjects=new Set();Object.assign(drafts,originalDrafts);references.initial='';references.change='';layout='list';$('#story-search').value='';$('#task-search').value='';$('#story-filter').value='all';$('#message').textContent='가상 예시를 초기 상태로 돌렸습니다.';showView('overview');};
  showView('overview');
})();
