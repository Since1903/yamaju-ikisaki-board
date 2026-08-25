// Ver.3.0 Supabase authentication / shared current status
let supabaseClient=null;
let authSession=null;
let currentEmployeeProfile=null;
let statusRealtimeChannel=null;
let remoteMode=false;

function supabaseConfigured(){
 const c=window.YAMAJU_SUPABASE||{};
 return !!(c.url&&c.publishableKey&&c.publishableKey!=='PASTE_YOUR_PUBLISHABLE_KEY_HERE');
}
function loginEmailFromId(id){
 const raw=String(id||'').trim().toLowerCase();
 const domain=(window.YAMAJU_SUPABASE?.loginDomain||'yamaju.local').trim();
 return raw.includes('@')?raw:`${raw}@${domain}`;
}
function showLogin(message=''){
 document.querySelector('#appRoot')?.setAttribute('hidden','');
 document.querySelector('#loginScreen')?.removeAttribute('hidden');
 const err=document.querySelector('#loginError');if(err)err.textContent=message;
}
function showApp(){
 document.querySelector('#loginScreen')?.setAttribute('hidden','');
 document.querySelector('#appRoot')?.removeAttribute('hidden');
}
function toEmployeeModel(emp,statusRow){
 return {
  id:String(emp.id),dbId:Number(emp.id),authUserId:emp.auth_user_id||'',name:emp.name||'',department:emp.department||'',occupation:emp.job_type||'その他',role:emp.role||'',
  status:statusRow?.status||'在席',destination:statusRow?.destination||'本社',purpose:statusRow?.purpose||'',returnTime:(statusRow?.return_time||'').slice(0,5),phone:statusRow?.phone_status||'ok',direct:!!statusRow?.direct_go,goHome:!!statusRow?.direct_return,memo:statusRow?.memo||''
 };
}
async function loadRemoteEmployees(){
 if(!supabaseClient||!authSession)return;
 const [{data:emps,error:empErr},{data:sts,error:stErr}]=await Promise.all([
  supabaseClient.from('employees').select('id,auth_user_id,name,department,job_type,role,active').eq('active',true).order('id'),
  supabaseClient.from('employee_status').select('id,employee_id,status,destination,purpose,return_time,phone_status,direct_go,direct_return,memo,updated_at')
 ]);
 if(empErr)throw empErr;if(stErr)throw stErr;
 const statusMap=new Map((sts||[]).map(s=>[String(s.employee_id),s]));
 data.employees=(emps||[]).map(e=>toEmployeeModel(e,statusMap.get(String(e.id))));
 currentEmployeeProfile=(emps||[]).find(e=>e.auth_user_id===authSession.user.id)||null;
 if(!currentEmployeeProfile)throw new Error('このログインユーザーに社員情報が紐付いていません。管理者へ連絡してください。');
 const me=String(currentEmployeeProfile.id),valid=new Set(data.employees.map(e=>e.id));
 data.settings.currentUserId=me;
 const kept=(data.settings.visibleEmployeeIds||[]).filter(id=>valid.has(String(id))).map(String);
 data.settings.visibleEmployeeIds=kept.length?kept:data.employees.map(e=>e.id);
 if(!data.settings.visibleEmployeeIds.includes(me))data.settings.visibleEmployeeIds.unshift(me);
 remoteMode=true;
 const userLabel=document.querySelector('#loggedInUser');if(userLabel)userLabel.textContent=currentEmployeeProfile.name||authSession.user.email;
 const isAdmin=currentEmployeeProfile.role==='admin';
 const admin=document.querySelector('#adminBtn');if(admin)admin.hidden=!isAdmin;
 const add=document.querySelector('#addEmployeeBtn');if(add)add.hidden=true;
 save();
}
async function saveEmployeeStatusRemote(e){
 if(!remoteMode||!supabaseClient)return;
 const payload={employee_id:Number(e.dbId||e.id),status:e.status,destination:e.destination||null,purpose:e.purpose||null,return_time:e.returnTime||null,phone_status:e.phone||'ok',direct_go:!!e.direct,direct_return:!!e.goHome,memo:e.memo||null,updated_at:new Date().toISOString()};
 const {data:existing,error:findErr}=await supabaseClient.from('employee_status').select('id').eq('employee_id',payload.employee_id).limit(1);
 if(findErr)throw findErr;
 if(existing&&existing.length){const {error}=await supabaseClient.from('employee_status').update(payload).eq('id',existing[0].id);if(error)throw error;}
 else {const {error}=await supabaseClient.from('employee_status').insert(payload);if(error)throw error;}
}
function startStatusRealtime(){
 if(!supabaseClient)return;
 if(statusRealtimeChannel)supabaseClient.removeChannel(statusRealtimeChannel);
 statusRealtimeChannel=supabaseClient.channel('yamaju-employee-status').on('postgres_changes',{event:'*',schema:'public',table:'employee_status'},async()=>{
  try{await loadRemoteEmployees();render();}catch(err){console.error(err)}
 }).subscribe();
}
async function handleAuthenticated(session){
 authSession=session;
 try{await loadRemoteEmployees();showApp();render();startStatusRealtime();}
 catch(err){console.error(err);await supabaseClient.auth.signOut();showLogin(err.message||'社員情報の取得に失敗しました。');}
}
async function bootAuth(){
 setupDialogSafety();
 const loginForm=document.querySelector('#loginForm');
 loginForm?.addEventListener('submit',async ev=>{
  ev.preventDefault();const btn=document.querySelector('#loginBtn'),err=document.querySelector('#loginError');if(err)err.textContent='';
  if(!supabaseConfigured()){if(err)err.textContent='SupabaseのPublishable keyが未設定です。';return;}
  btn.disabled=true;btn.textContent='ログイン中…';
  try{const email=loginEmailFromId(document.querySelector('#loginId').value),password=document.querySelector('#loginPassword').value;const {data:authData,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;await handleAuthenticated(authData.session);}
  catch(e){console.error(e);if(err)err.textContent='ログインIDまたはパスワードを確認してください。';}
  finally{btn.disabled=false;btn.textContent='ログイン';}
 });
 document.querySelector('#logoutBtn')?.addEventListener('click',async()=>{if(statusRealtimeChannel)await supabaseClient.removeChannel(statusRealtimeChannel);await supabaseClient.auth.signOut();authSession=null;currentEmployeeProfile=null;remoteMode=false;showLogin('ログアウトしました。');});
 if(!supabaseConfigured()){showLogin('初回設定：supabase-config.js にPublishable keyを設定してください。');return;}
 if(!window.supabase?.createClient){showLogin('Supabaseライブラリを読み込めませんでした。ネットワークを確認してください。');return;}
 supabaseClient=window.supabase.createClient(window.YAMAJU_SUPABASE.url,window.YAMAJU_SUPABASE.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(session)await handleAuthenticated(session);else showLogin();
 supabaseClient.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')showLogin();});
}

const KEY='yamaju-board-v2';
const DEFAULT_STATUSES=[
 {id:'present',name:'在席',color:'#bfe7c9',active:true,order:1,useReturn:false,useDestination:true,defaultDestination:'本社'},
 {id:'out',name:'外出',color:'#31b57b',active:true,order:2,useReturn:true,useDestination:true,defaultDestination:''},
 {id:'meeting',name:'会議',color:'#d8c3f2',active:true,order:3,useReturn:true,useDestination:true,defaultDestination:''},
 {id:'site',name:'現場',color:'#9fc7f2',active:true,order:4,useReturn:true,useDestination:true,defaultDestination:''},
 {id:'trip',name:'出張',color:'#f4c58d',active:true,order:5,useReturn:true,useDestination:true,defaultDestination:''},
 {id:'holiday',name:'休み',color:'#9edff0',active:true,order:6,useReturn:false,useDestination:false,defaultDestination:''}
];
const seed={
 employees:[
  {id:'e1',name:'渡邊 琉騎',department:'企画課',occupation:'事務職',role:'',status:'在席',destination:'本社',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''},
  {id:'e2',name:'山田 太郎',department:'営業部',occupation:'営業職',role:'',status:'外出',destination:'YKK AP',purpose:'打合せ',returnTime:'15:30',phone:'later',direct:false,goHome:false,memo:''},
  {id:'e3',name:'佐藤 花子',department:'管理部',occupation:'事務職',role:'',status:'会議',destination:'第2会議室',purpose:'社内会議',returnTime:'16:00',phone:'ng',direct:false,goHome:false,memo:''},
  {id:'e4',name:'田中 一郎',department:'工務',occupation:'現場職',role:'',status:'現場',destination:'○○マンション',purpose:'現調',returnTime:'17:00',phone:'later',direct:true,goHome:true,memo:''},
  {id:'e5',name:'山十 武',department:'住宅営業部',occupation:'営業職',role:'',status:'在席',destination:'本社',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''}
 ],history:[],schedules:[],statuses:structuredClone(DEFAULT_STATUSES),settings:{currentUserId:'e1',visibleEmployeeIds:['e1','e2','e3','e4','e5']}
};
let data=load();let currentView='board';
const $=s=>document.querySelector(s);
function migrate(v){
 if(!v||!Array.isArray(v.employees))return structuredClone(seed);
 v.settings ||= {currentUserId:v.employees[0]?.id||'',visibleEmployeeIds:v.employees.map(e=>e.id)};
 v.settings.visibleEmployeeIds ||= v.employees.map(e=>e.id);v.settings.currentUserId ||= v.employees[0]?.id||'';
 v.history ||= [];v.schedules ||= [];
 if(!Array.isArray(v.statuses)){
   const oldColors=v.settings.statusColors||{};
   v.statuses=DEFAULT_STATUSES.map(s=>({...s,color:oldColors[s.name]||s.color}));
   delete v.settings.statusColors;
 }
 v.statuses=v.statuses.map((s,i)=>({id:s.id||crypto.randomUUID(),name:s.name||`状態${i+1}`,color:s.color||'#d9e3df',active:s.active!==false,order:Number(s.order)||i+1,useReturn:s.useReturn!==false,useDestination:s.useDestination!==false,defaultDestination:s.defaultDestination||''}));
 v.employees.forEach(e=>{e.occupation ||= 'その他';if((e.status==='在席'||e.status==='休み'||e.goHome)&&e.returnTime==='00:00')e.returnTime='';});
 v.schedules.forEach(s=>{if(s.at&&!s.startAt)s.startAt=s.at;if(!('startDone'in s))s.startDone=!!s.done;if(!('endDone'in s))s.endDone=false;});
 return v;
}
function load(){try{return migrate(JSON.parse(localStorage.getItem(KEY))||structuredClone(seed))}catch{return structuredClone(seed)}}
function save(){localStorage.setItem(KEY,JSON.stringify(data))}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function phoneText(v){return v==='ng'?'対応不可':v==='later'?'折返し':'対応可'}
function uniq(field){return [...new Set(data.employees.map(e=>e[field]).filter(Boolean))].sort()}
function dateFmt(v){return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}
function timeRange(s){return `${dateFmt(s.startAt)} ～ ${s.endAt?new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(new Date(s.endAt)):'終了なし'}`}
function contrast(hex){const h=hex.replace('#','');const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return(r*299+g*587+b*114)/1000>150?'#142018':'#fff'}
function pushHistory(type,e,extra={}){data.history.push({id:crypto.randomUUID(),at:new Date().toISOString(),type,employeeId:e?.id||'',name:e?.name||'',...extra})}
function sortedStatuses(includeInactive=false){return [...data.statuses].filter(s=>includeInactive||s.active).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'ja'))}
function statusByName(name){return data.statuses.find(s=>s.name===name)||{name,color:'#d9e3df',active:true,order:999,useReturn:true,useDestination:true,defaultDestination:''}}
function activeStatusNames(){return sortedStatuses().map(s=>s.name)}
function fillStatusSelect(select,value='',includeInactiveCurrent=false){
 const names=sortedStatuses().map(s=>s.name);if(includeInactiveCurrent&&value&&!names.includes(value))names.push(value);
 select.innerHTML=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');if(value&&names.includes(value))select.value=value;
}
function renderFilters(){
 const d=$('#departmentFilter'),dp=d.value;d.innerHTML='<option value="">すべての部署</option>'+uniq('department').map(x=>`<option>${esc(x)}</option>`).join('');d.value=dp;
 const o=$('#occupationFilter'),op=o.value;o.innerHTML='<option value="">すべての職種</option>'+uniq('occupation').map(x=>`<option>${esc(x)}</option>`).join('');o.value=op;
 const sf=$('#statusFilter'),sv=sf.value;const filterNames=[...new Set([...sortedStatuses(true).map(s=>s.name),...data.employees.map(e=>e.status)])];sf.innerHTML='<option value="">すべての状態</option>'+filterNames.map(n=>`<option>${esc(n)}</option>`).join('');if(filterNames.includes(sv))sf.value=sv;
 $('#scheduleEmployee').innerHTML=data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}（${esc(e.department)} / ${esc(e.occupation)}）</option>`).join('');
}
function orderedVisibleEmployees(){const ids=new Set(data.settings.visibleEmployeeIds||data.employees.map(e=>e.id));let list=data.employees.filter(e=>ids.has(e.id));const me=data.settings.currentUserId;list.sort((a,b)=>a.id===me?-1:b.id===me?1:0);return list}
function render(){renderFilters();document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));const board=$('#board');if(currentView==='history')return renderHistory(board);if(currentView==='schedule')return renderSchedules(board);renderBoard(board)}
function renderBoard(board){
 const q=$('#searchInput').value.trim().toLowerCase(),dep=$('#departmentFilter').value,occ=$('#occupationFilter').value,st=$('#statusFilter').value;const base=orderedVisibleEmployees();
 const list=base.filter(e=>(!q||`${e.name} ${e.destination} ${e.purpose}`.toLowerCase().includes(q))&&(!dep||e.department===dep)&&(!occ||e.occupation===occ)&&(!st||e.status===st));
 board.className='board';board.innerHTML='';const t=$('#employeeCardTemplate');
 list.forEach(e=>{const n=t.content.cloneNode(true),card=n.querySelector('.employee-card'),sm=statusByName(e.status),bg=sm.color||'#fff',fg=contrast(bg);card.style.setProperty('--status-bg',bg);card.style.setProperty('--card-text',fg);n.querySelector('.employee-name').textContent=e.name;n.querySelector('.employee-meta').textContent=[e.department,e.occupation,e.role].filter(Boolean).join(' / ');n.querySelector('.status-pill').textContent=e.status;n.querySelector('.destination').textContent=sm.useDestination===false?'―':(e.destination||'―');n.querySelector('.purpose').textContent=e.purpose||' ';const shownReturn=(!sm.useReturn||e.goHome||!e.returnTime||e.returnTime==='00:00')?'―':e.returnTime;n.querySelector('.return-time').textContent=shownReturn;n.querySelector('.phone-status').textContent=phoneText(e.phone);const tags=n.querySelector('.tag-row');if(e.id===data.settings.currentUserId)tags.innerHTML+='<span class="tag">自分</span>';if(e.direct)tags.innerHTML+='<span class="tag">直行</span>';if(e.goHome)tags.innerHTML+='<span class="tag">直帰</span>';if(!sm.active)tags.innerHTML+='<span class="tag">停止中状態</span>';if(e.memo)tags.innerHTML+=`<span class="tag">${esc(e.memo)}</span>`;n.querySelector('.change-btn').addEventListener('click',()=>openEdit(e.id));board.appendChild(n)});
 $('#summary').textContent=`表示 ${list.length}名 / 登録${data.employees.length}名`;if(!list.length)board.innerHTML='<div class="empty card">該当する社員がいません</div>';
}
function renderHistory(board){
 board.className='history-list';const rows=[...data.history].reverse();
 board.innerHTML=rows.length?rows.map(h=>{let title='',body='';if(h.type==='schedule-create'){title=`${esc(h.name)}：予定登録`;body=`${esc(h.status)}｜${esc(h.destination||'―')}｜${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else if(h.type==='schedule-delete'){title=`${esc(h.name)}：予定削除`;body=`${esc(h.status)}｜${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else if(h.type==='auto-start'){title=`${esc(h.name)}：自動開始 ${esc(h.before)} → ${esc(h.after)}`;body=`${esc(h.destination||'―')}｜予定 ${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else if(h.type==='auto-end'){title=`${esc(h.name)}：自動終了 ${esc(h.before)} → ${esc(h.after)}`;body=`予定 ${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else if(h.type==='status-master'){title=`状態設定：${esc(h.action||'変更')}`;body=esc(h.detail||'');}else{title=`${esc(h.name)}：${esc(h.before||'')} → ${esc(h.after||'')}`;body=`${esc(h.destination||'―')} <span class="tag">手動</span>`}return `<article class="list-item card"><div class="list-row"><strong>${title}</strong><span class="list-muted">操作 ${dateFmt(h.at)}</span></div><div style="margin-top:7px">${body}</div></article>`}).join(''):'<div class="empty card">まだ履歴はありません</div>';
 $('#summary').textContent=`履歴 ${rows.length}件`;
}
function renderSchedules(board){
 board.className='schedule-list';const rows=[...data.schedules].sort((a,b)=>a.startAt.localeCompare(b.startAt));board.innerHTML='<button id="newScheduleInline" class="primary">＋ 予定を登録</button>'+(rows.length?rows.map(s=>{const e=data.employees.find(x=>x.id===s.employeeId);return `<article class="list-item card"><div class="list-row"><strong>${esc(e?.name||'不明')}：${esc(s.status)}</strong><span class="list-muted">${s.startDone?(s.endDone?'完了':'実行中'):'予定'}</span></div><div class="schedule-details"><div><b>時間</b><br>${esc(timeRange(s))}</div><div><b>行先</b><br>${esc(s.destination||'―')}</div><div><b>用件</b><br>${esc(s.purpose||'―')}</div></div><div class="schedule-actions"><button class="small-btn secondary edit-schedule" data-id="${s.id}">編集</button><button class="small-btn danger delete-schedule" data-id="${s.id}">削除</button></div></article>`}).join(''):'<div class="empty card">自動切換え予定はありません</div>');
 $('#summary').textContent=`予定 ${rows.length}件`;setTimeout(()=>{$('#newScheduleInline')?.addEventListener('click',()=>openSchedule());document.querySelectorAll('.edit-schedule').forEach(b=>b.addEventListener('click',()=>openSchedule(b.dataset.id)));document.querySelectorAll('.delete-schedule').forEach(b=>b.addEventListener('click',()=>deleteSchedule(b.dataset.id)));},0);
}
function applyEditRules(){const st=$('#editStatus').value,sm=statusByName(st);if(sm.defaultDestination&&!$('#editDestination').value.trim())$('#editDestination').value=sm.defaultDestination;if(sm.useDestination===false){$('#editDestination').value='';$('#editPurpose').value=''}if(!sm.useReturn)$('#editReturn').value='';if($('#editGoHome').checked)$('#editReturn').value=''}
function openEdit(id){const e=data.employees.find(x=>x.id===id);$('#editEmployeeId').value=id;$('#editTitle').textContent=e.name;fillStatusSelect($('#editStatus'),e.status,true);$('#editDestination').value=e.destination;$('#editPurpose').value=e.purpose;$('#editReturn').value=e.returnTime;$('#editPhone').value=e.phone;$('#editDirect').checked=e.direct;$('#editGoHome').checked=e.goHome;$('#editMemo').value=e.memo||'';$('#editDialog').showModal()}
$('#editStatus').addEventListener('change',applyEditRules);$('#editGoHome').addEventListener('change',applyEditRules);
$('#saveEditBtn').addEventListener('click',async ev=>{ev.preventDefault();applyEditRules();const id=$('#editEmployeeId').value,e=data.employees.find(x=>x.id===id),before=e.status;Object.assign(e,{status:$('#editStatus').value,destination:$('#editDestination').value.trim(),purpose:$('#editPurpose').value.trim(),returnTime:$('#editReturn').value,phone:$('#editPhone').value,direct:$('#editDirect').checked,goHome:$('#editGoHome').checked,memo:$('#editMemo').value.trim()});pushHistory('manual',e,{before,after:e.status,destination:e.destination});save();try{await saveEmployeeStatusRemote(e);$('#editDialog').close();render();}catch(err){console.error(err);alert('Supabaseへの保存に失敗しました。通信状態を確認してください。');}});
function openSchedule(id=''){const s=data.schedules.find(x=>x.id===id),d=new Date();$('#scheduleId').value=id;$('#scheduleDate').value=s?.startAt?.slice(0,10)||d.toISOString().slice(0,10);$('#scheduleStart').value=s?.startAt?.slice(11,16)||'09:00';$('#scheduleEnd').value=s?.endAt?.slice(11,16)||'10:00';$('#scheduleEmployee').value=s?.employeeId||data.settings.currentUserId||data.employees[0]?.id;fillStatusSelect($('#scheduleStatus'),s?.status||activeStatusNames()[0]||'在席',true);$('#scheduleDestination').value=s?.destination||'';$('#schedulePurpose').value=s?.purpose||'';$('#schedulePhone').value=s?.phone||'later';$('#scheduleAfter').value=s?.after||'present';$('#scheduleDirect').checked=!!s?.direct;$('#scheduleGoHome').checked=!!s?.goHome;$('#scheduleMemo').value=s?.memo||'';$('#scheduleDialog').showModal()}
$('#saveScheduleBtn').addEventListener('click',ev=>{ev.preventDefault();const date=$('#scheduleDate').value,start=$('#scheduleStart').value,end=$('#scheduleEnd').value;if(!date||!start||!end)return alert('開始・終了時刻を入力してください。');if(end<=start)return alert('終了時刻は開始時刻より後にしてください。');const existing=data.schedules.find(x=>x.id===$('#scheduleId').value);const obj={id:existing?.id||crypto.randomUUID(),employeeId:$('#scheduleEmployee').value,startAt:`${date}T${start}:00`,endAt:`${date}T${end}:00`,status:$('#scheduleStatus').value,destination:$('#scheduleDestination').value.trim(),purpose:$('#schedulePurpose').value.trim(),phone:$('#schedulePhone').value,after:$('#scheduleAfter').value,direct:$('#scheduleDirect').checked,goHome:$('#scheduleGoHome').checked,memo:$('#scheduleMemo').value.trim(),startDone:existing?.startDone||false,endDone:existing?.endDone||false,beforeSnapshot:existing?.beforeSnapshot||null};if(existing)Object.assign(existing,obj);else data.schedules.push(obj);const e=data.employees.find(x=>x.id===obj.employeeId);pushHistory('schedule-create',e,{status:obj.status,destination:obj.destination,startLabel:dateFmt(obj.startAt),endLabel:dateFmt(obj.endAt)});save();$('#scheduleDialog').close();render()});
function deleteSchedule(id){const s=data.schedules.find(x=>x.id===id);if(!s||!confirm('この予定を削除しますか？'))return;const e=data.employees.find(x=>x.id===s.employeeId);pushHistory('schedule-delete',e,{status:s.status,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});data.schedules=data.schedules.filter(x=>x.id!==id);save();render()}
$('#addEmployeeBtn').addEventListener('click',()=>{if(remoteMode)return alert('Ver.3.0では社員追加はSupabase管理画面から行ってください。');$('#employeeDialog').showModal()});
$('#saveEmployeeBtn').addEventListener('click',ev=>{ev.preventDefault();const name=$('#newName').value.trim(),department=$('#newDepartment').value.trim();if(!name||!department)return;const initial=statusByName('在席').active?'在席':activeStatusNames()[0]||data.statuses[0]?.name||'在席',sm=statusByName(initial);const e={id:crypto.randomUUID(),name,department,occupation:$('#newOccupation').value,role:$('#newRole').value.trim(),status:initial,destination:sm.defaultDestination||'',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''};data.employees.push(e);data.settings.visibleEmployeeIds.push(e.id);save();$('#employeeDialog').close();$('#employeeForm').reset();render()});
function openProfile(){$('#currentUserSelect').innerHTML=data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}（${esc(e.department)}）</option>`).join('');$('#currentUserSelect').value=data.settings.currentUserId;const vis=new Set(data.settings.visibleEmployeeIds);$('#visibleEmployees').innerHTML=data.employees.map(e=>`<label><input type="checkbox" value="${e.id}" ${vis.has(e.id)?'checked':''}> <span>${esc(e.name)} <small>${esc(e.department)}</small></span></label>`).join('');$('#profileDialog').showModal()}
$('#profileBtn').addEventListener('click',openProfile);
$('#saveProfileBtn').addEventListener('click',ev=>{ev.preventDefault();data.settings.currentUserId=$('#currentUserSelect').value;const checked=[...document.querySelectorAll('#visibleEmployees input:checked')].map(x=>x.value);if(!checked.includes(data.settings.currentUserId))checked.unshift(data.settings.currentUserId);data.settings.visibleEmployeeIds=checked;save();$('#profileDialog').close();render()});
function renderStatusMaster(){
 const wrap=$('#statusMasterList'),rows=sortedStatuses(true);wrap.innerHTML=rows.map((s,i)=>`<div class="status-row ${s.active?'':'inactive'}">
   <span class="status-swatch" style="background:${s.color}"></span>
   <div><div class="status-name">${esc(s.name)}</div><div class="status-sub">${s.useDestination?'行先あり':'行先なし'} / ${s.useReturn?'戻りあり':'戻りなし'}${s.defaultDestination?` / 初期:${esc(s.defaultDestination)}`:''}</div></div>
   <span class="status-state ${s.active?'on':'off'}">${s.active?'使用中':'停止'}</span>
   <span class="status-order">順番 ${i+1}</span>
   <div><button type="button" class="small-btn secondary move-btn status-up" data-id="${s.id}" ${i===0?'disabled':''}>↑</button> <button type="button" class="small-btn secondary move-btn status-down" data-id="${s.id}" ${i===rows.length-1?'disabled':''}>↓</button></div>
   <div class="status-actions"><button type="button" class="small-btn secondary edit-status" data-id="${s.id}">編集</button><button type="button" class="small-btn ${s.active?'secondary':'primary'} toggle-status" data-id="${s.id}">${s.active?'停止':'再開'}</button><button type="button" class="small-btn danger delete-status" data-id="${s.id}">削除</button></div>
 </div>`).join('');
 wrap.querySelectorAll('.edit-status').forEach(b=>b.addEventListener('click',()=>openStatusEdit(b.dataset.id)));wrap.querySelectorAll('.toggle-status').forEach(b=>b.addEventListener('click',()=>toggleStatus(b.dataset.id)));wrap.querySelectorAll('.delete-status').forEach(b=>b.addEventListener('click',()=>deleteStatus(b.dataset.id)));wrap.querySelectorAll('.status-up').forEach(b=>b.addEventListener('click',()=>moveStatus(b.dataset.id,-1)));wrap.querySelectorAll('.status-down').forEach(b=>b.addEventListener('click',()=>moveStatus(b.dataset.id,1)));
}
function openAdmin(){renderStatusMaster();$('#adminDialog').showModal()}
$('#adminBtn').addEventListener('click',openAdmin);$('#addStatusBtn').addEventListener('click',()=>openStatusEdit());
function openStatusEdit(id=''){const s=data.statuses.find(x=>x.id===id);$('#statusEditId').value=id;$('#statusEditTitle').textContent=s?'状態を編集':'状態を追加';$('#statusEditName').value=s?.name||'';$('#statusEditColor').value=s?.color||'#31b57b';$('#statusEditOrder').value=s?.order||data.statuses.length+1;$('#statusEditActive').checked=s?.active!==false;$('#statusEditUseReturn').checked=s?.useReturn!==false;$('#statusEditUseDestination').checked=s?.useDestination!==false;$('#statusEditDefaultDestination').value=s?.defaultDestination||'';$('#statusEditDialog').showModal()}
$('#saveStatusBtn').addEventListener('click',ev=>{ev.preventDefault();const id=$('#statusEditId').value,name=$('#statusEditName').value.trim();if(!name)return alert('状態名を入力してください。');const dup=data.statuses.find(s=>s.name===name&&s.id!==id);if(dup)return alert('同じ状態名がすでにあります。');const existing=data.statuses.find(s=>s.id===id),oldName=existing?.name;const obj={id:existing?.id||crypto.randomUUID(),name,color:$('#statusEditColor').value,active:$('#statusEditActive').checked,order:Number($('#statusEditOrder').value)||data.statuses.length+1,useReturn:$('#statusEditUseReturn').checked,useDestination:$('#statusEditUseDestination').checked,defaultDestination:$('#statusEditDefaultDestination').value.trim()};if(existing){Object.assign(existing,obj);if(oldName!==name){data.employees.forEach(e=>{if(e.status===oldName)e.status=name});data.schedules.forEach(s=>{if(s.status===oldName)s.status=name})}}else data.statuses.push(obj);normalizeStatusOrder();pushHistory('status-master',null,{action:existing?'編集':'追加',detail:existing?`${oldName} → ${name}`:`${name} を追加`});save();$('#statusEditDialog').close();renderStatusMaster();render()});
function normalizeStatusOrder(){sortedStatuses(true).forEach((s,i)=>s.order=i+1)}
function moveStatus(id,delta){const rows=sortedStatuses(true),i=rows.findIndex(s=>s.id===id),j=i+delta;if(i<0||j<0||j>=rows.length)return;[rows[i].order,rows[j].order]=[rows[j].order,rows[i].order];normalizeStatusOrder();save();renderStatusMaster();render()}
function toggleStatus(id){const s=data.statuses.find(x=>x.id===id);if(!s)return;if(s.active&&data.statuses.filter(x=>x.active).length<=1)return alert('使用中の状態を0件にはできません。');s.active=!s.active;pushHistory('status-master',null,{action:s.active?'再開':'停止',detail:`${s.name} を${s.active?'再開':'停止'}`});save();renderStatusMaster();render()}
function deleteStatus(id){const s=data.statuses.find(x=>x.id===id);if(!s)return;const usedNow=data.employees.some(e=>e.status===s.name),usedSchedule=data.schedules.some(x=>x.status===s.name);if(usedNow||usedSchedule)return alert(`「${s.name}」は社員の現在状態または予定で使用中のため削除できません。先に別の状態へ変更するか、「停止」を使ってください。`);if(!confirm(`「${s.name}」を完全に削除しますか？\n過去履歴の文字は残ります。`))return;data.statuses=data.statuses.filter(x=>x.id!==id);normalizeStatusOrder();pushHistory('status-master',null,{action:'削除',detail:`${s.name} を削除`});save();renderStatusMaster();render()}
function autoSwitch(){const now=new Date();let changed=false;const sorted=[...data.schedules].sort((a,b)=>a.startAt.localeCompare(b.startAt));sorted.forEach(s=>{const e=data.employees.find(x=>x.id===s.employeeId);if(!e)return;const start=new Date(s.startAt),end=new Date(s.endAt);if(!s.startDone&&start<=now){s.beforeSnapshot={status:e.status,destination:e.destination,purpose:e.purpose,returnTime:e.returnTime,phone:e.phone,direct:e.direct,goHome:e.goHome,memo:e.memo};const before=e.status,sm=statusByName(s.status);Object.assign(e,{status:s.status,destination:sm.useDestination===false?'':s.destination,purpose:sm.useDestination===false?'':s.purpose,returnTime:sm.useReturn?s.endAt.slice(11,16):'',phone:s.phone,direct:s.direct,goHome:s.goHome,memo:s.memo});s.startDone=true;pushHistory('auto-start',e,{before,after:e.status,destination:e.destination,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});changed=true}if(s.startDone&&!s.endDone&&end<=now){const newer=sorted.find(x=>x.employeeId===s.employeeId&&x.id!==s.id&&new Date(x.startAt)<=now&&now<new Date(x.endAt));const before=e.status;if(!newer){if(s.goHome){Object.assign(e,{status:'外出',returnTime:'',goHome:true})}else if(s.after==='previous'&&s.beforeSnapshot){Object.assign(e,s.beforeSnapshot)}else{const present=statusByName('在席').name==='在席'?'在席':activeStatusNames()[0];const psm=statusByName(present);Object.assign(e,{status:present,destination:psm.defaultDestination||'',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''})}}s.endDone=true;pushHistory('auto-end',e,{before,after:e.status,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});changed=true}});if(changed){save();render()}}

// ---- Dialog safety controls -------------------------------------------------
// Every modal must always be closable, even when required fields are empty.
// This also protects future dialogs from native form validation blocking ×/Cancel.
function setupDialogSafety(){
  document.querySelectorAll('dialog').forEach(dialog=>{
    const form=dialog.querySelector('form');
    if(form){
      form.setAttribute('novalidate','');
      form.addEventListener('submit',ev=>ev.preventDefault());
    }
    dialog.querySelectorAll('.icon-btn, button[value="cancel"]').forEach(btn=>{
      btn.type='button';
      btn.addEventListener('click',ev=>{
        ev.preventDefault();
        ev.stopPropagation();
        if(dialog.open) dialog.close('cancel');
      });
    });
    // Clicking the dimmed area outside a modal closes only that modal.
    dialog.addEventListener('click',ev=>{
      if(ev.target===dialog && dialog.open) dialog.close('cancel');
    });
  });
  // Employee form is the only modal whose values are not overwritten on every open.
  // Clear unfinished input whenever it is cancelled/closed.
  const employeeDialog=$('#employeeDialog');
  employeeDialog?.addEventListener('close',()=>{
    if(employeeDialog.returnValue==='cancel') $('#employeeForm')?.reset();
  });
}

['searchInput','departmentFilter','occupationFilter','statusFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchInput'?'input':'change',render));document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>{currentView=b.dataset.view;render()}));$('#monitorBtn').addEventListener('click',()=>document.body.classList.add('monitor'));
$('#exitMonitorBtn').addEventListener('click',()=>document.body.classList.remove('monitor'));
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&document.body.classList.contains('monitor'))document.body.classList.remove('monitor')});
setInterval(autoSwitch,15000);
bootAuth();
