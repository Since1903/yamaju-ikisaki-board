// Ver.5.1.3 stable pointer board layout editor / multi-day full-day leave / holiday board / overlap priority / multi-device sync
let supabaseClient=null;
let authSession=null;
let currentEmployeeProfile=null;
let statusRealtimeChannel=null;
let scheduleRealtimeChannel=null;
let remoteMode=false;
let statusRealtimeState='CLOSED';
let scheduleRealtimeState='CLOSED';
let remoteRefreshBusy=false;
let remoteRefreshTimer=null;
let realtimeHealthTimer=null;
const NORMAL_REFRESH_MS=15000;
const MONITOR_REFRESH_MS=5000;
const REALTIME_HEALTH_MS=30000;
let departmentMasterRows=[];
let jobTypeMasterRows=[];
const APP_VERSION='5.0';
let lastScheduleProcessAt=0;
const SCHEDULE_PROCESS_MIN_GAP_MS=4000;

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
  id:String(emp.id),dbId:Number(emp.id),authUserId:emp.auth_user_id||'',name:emp.name||'',department:emp.department||'',occupation:emp.job_type||'',role:emp.role||'',
  status:statusRow?.status||'在席',destination:statusRow?.destination||'本社',purpose:statusRow?.purpose||'',returnTime:(statusRow?.return_time||'').slice(0,5),phone:statusRow?.phone_status||'ok',direct:!!statusRow?.direct_go,goHome:!!statusRow?.direct_return,memo:statusRow?.memo||''
 };
}
async function loadMasterData(){
 if(!supabaseClient||!authSession)return;
 const [{data:deps,error:depErr},{data:jobs,error:jobErr}]=await Promise.all([
  supabaseClient.from('departments').select('id,name,sort_order,active,default_location').order('sort_order').order('id'),
  supabaseClient.from('job_types').select('id,name,sort_order,active').order('sort_order').order('id')
 ]);
 if(depErr)throw depErr;if(jobErr)throw jobErr;
 departmentMasterRows=deps||[];jobTypeMasterRows=jobs||[];
}
function activeMasterNames(rows){return rows.filter(r=>r.active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.id-b.id).map(r=>r.name)}
function fillEmployeeMasterSelects(department='',jobType=''){
 const dep=$('#newDepartment'),job=$('#newOccupation');if(!dep||!job)return;
 const deps=activeMasterNames(departmentMasterRows);if(department&&!deps.includes(department))deps.push(department);
 dep.innerHTML='<option value="">選択してください</option>'+deps.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');dep.value=department||'';
 const jobs=activeMasterNames(jobTypeMasterRows);if(jobType&&!jobs.includes(jobType))jobs.push(jobType);
 job.innerHTML='<option value="">未設定</option>'+jobs.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');job.value=jobType||'';
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
 const oldVisible=Array.isArray(data.settings.visibleEmployeeIds)?data.settings.visibleEmployeeIds.map(String):[];
 const kept=oldVisible.filter(id=>valid.has(id));
 // 初回のみ全員表示。以後は「0名表示」も端末設定として尊重する。
 data.settings.visibleEmployeeIds=Array.isArray(data.settings.visibleEmployeeIds)?kept:data.employees.map(e=>e.id);
 const oldOrder=Array.isArray(data.settings.employeeOrder)?data.settings.employeeOrder.map(String):[];
 const ordered=oldOrder.filter(id=>valid.has(id));
 data.employees.forEach(e=>{if(!ordered.includes(e.id))ordered.push(e.id);});
 data.settings.employeeOrder=ordered;
 remoteMode=true;
 const userLabel=document.querySelector('#loggedInUser');if(userLabel)userLabel.textContent=currentEmployeeProfile.name||authSession.user.email;
 const isAdmin=currentEmployeeProfile.role==='admin';
 const admin=document.querySelector('#adminBtn');if(admin)admin.hidden=!isAdmin;
 const add=document.querySelector('#addEmployeeBtn');if(add)add.hidden=true;
 save();
}

function scheduleFromDb(row){
 return {
  id:String(row.id),dbId:Number(row.id),employeeId:String(row.employee_id),startAt:row.start_at,endAt:row.end_at,status:row.status||'在席',destination:row.destination||'',purpose:row.purpose||'',phone:row.phone_status||'later',after:row.after_action||'present',direct:!!row.direct_go,goHome:!!row.direct_return,memo:row.memo||'',startDone:!!row.start_done,endDone:!!row.end_done,beforeSnapshot:row.before_snapshot||null
 };
}
async function loadRemoteSchedules(){
 if(!supabaseClient||!authSession)return;
 const {data:rows,error}=await supabaseClient.from('schedules').select('id,employee_id,start_at,end_at,status,destination,purpose,phone_status,after_action,direct_go,direct_return,memo,start_done,end_done,before_snapshot,updated_at').order('start_at');
 if(error)throw error;
 data.schedules=(rows||[]).map(scheduleFromDb);
 save();
}
function schedulePayloadFromForm(){
 const status=$('#scheduleStatus').value;
 const startDateKey=$('#scheduleDate').value;
 const endDateKey=$('#scheduleEndDate').value||startDateKey;
 const isMultiDayFull=status==='全休';
 const start=isMultiDayFull?'00:00':$('#scheduleStart').value;
 const end=isMultiDayFull?'23:59':$('#scheduleEnd').value;
 if(!startDateKey||!endDateKey)throw new Error('日付を入力してください。');
 if(!isMultiDayFull&&(!start||!end))throw new Error('開始・終了時刻を入力してください。');
 if(endDateKey<startDateKey)throw new Error('終了日は開始日以降にしてください。');
 if(!isMultiDayFull&&endDateKey!==startDateKey)throw new Error('複数日の指定は「全休」のみ利用できます。');
 const startDate=new Date(`${startDateKey}T${start}:00`);
 const endDate=new Date(`${endDateKey}T${end}:${isMultiDayFull?'59':'00'}`);
 if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime()))throw new Error('予定日時を確認してください。');
 if(!(endDate>startDate))throw new Error('終了日時は開始日時より後にしてください。');
 if(endDate<=new Date())throw new Error('終了日時が過去の予定は登録できません。');
 return {employee_id:Number($('#scheduleEmployee').value),start_at:startDate.toISOString(),end_at:endDate.toISOString(),status,destination:$('#scheduleDestination').value.trim()||null,purpose:$('#schedulePurpose').value.trim()||null,phone_status:$('#schedulePhone').value,after_action:$('#scheduleAfter').value,direct_go:$('#scheduleDirect').checked,direct_return:$('#scheduleGoHome').checked,memo:$('#scheduleMemo').value.trim()||null,updated_at:new Date().toISOString()};
}
async function processDueSchedulesRemote(force=false){
 if(!remoteMode||!supabaseClient||!authSession)return;
 const now=Date.now();
 if(!force&&now-lastScheduleProcessAt<SCHEDULE_PROCESS_MIN_GAP_MS)return;
 lastScheduleProcessAt=now;
 const {error}=await supabaseClient.rpc('process_due_schedules');
 if(error){
  // Cronが本体。クライアント側実行は補助なので、失敗時は表示更新を止めない。
  console.warn('schedule process fallback failed',error);
 }
}
async function saveScheduleRemote(id=''){
 const payload=schedulePayloadFromForm();
 if(id){
  const existing=data.schedules.find(x=>x.id===String(id));
  if(!existing)throw new Error('編集対象の予定が見つかりません。再読み込みしてください。');
  if(existing.endDone)throw new Error('完了済みの予定は編集できません。');
  if(existing.startDone)throw new Error('開始済みの予定は編集できません。終了後に新しい予定を登録してください。');
  // Ver.4: 予定変更時は実行フラグと開始前スナップショットを必ず初期化する。
  // これにより日時・状態を変更しても旧判定が残らない。
  Object.assign(payload,{start_done:false,end_done:false,before_snapshot:null});
  const {error}=await supabaseClient.from('schedules').update(payload).eq('id',Number(id));if(error)throw error;
 }else{
  Object.assign(payload,{created_by:authSession.user.id,start_done:false,end_done:false,before_snapshot:null});
  const {error}=await supabaseClient.from('schedules').insert(payload);if(error)throw error;
 }
 await processDueSchedulesRemote(true);
 await Promise.all([loadRemoteSchedules(),loadRemoteEmployees()]);
}
async function deleteScheduleRemote(id){
 const existing=data.schedules.find(x=>x.id===String(id));
 if(existing?.startDone&&!existing?.endDone)throw new Error('実行中の予定は削除できません。終了後に削除してください。');
 const {error}=await supabaseClient.from('schedules').delete().eq('id',Number(id));if(error)throw error;
 await loadRemoteSchedules();
}
function startScheduleRealtime(){
 if(!supabaseClient)return;
 if(scheduleRealtimeChannel)supabaseClient.removeChannel(scheduleRealtimeChannel);
 scheduleRealtimeChannel=supabaseClient.channel('yamaju-schedules').on('postgres_changes',{event:'*',schema:'public',table:'schedules'},async()=>{
  try{await Promise.all([loadRemoteSchedules(),loadRemoteEmployees()]);render();}catch(err){console.error(err)}
 }).subscribe(status=>{scheduleRealtimeState=status;});
}
function localDateParts(iso){
 const d=new Date(iso||Date.now());const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),h=String(d.getHours()).padStart(2,'0'),min=String(d.getMinutes()).padStart(2,'0');
 return {date:`${y}-${m}-${day}`,time:`${h}:${min}`};
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
 }).subscribe(status=>{statusRealtimeState=status;});
}
async function refreshRemoteState(forceRender=true){
 if(!remoteMode||!supabaseClient||remoteRefreshBusy)return;
 remoteRefreshBusy=true;
 try{
  // Ver.4: Supabase Cronが主処理。開いている端末も補助的に同じDB関数を実行し、
  // Cron遅延・一時停止時でも開始/終了を収束させる。
  await processDueSchedulesRemote(false);
  await Promise.all([loadRemoteEmployees(),loadRemoteSchedules()]);
  if(forceRender)render();
 }catch(err){console.error('remote refresh failed',err)}
 finally{remoteRefreshBusy=false;}
}
function currentRefreshMs(){
 return document.body.classList.contains('monitor')?MONITOR_REFRESH_MS:NORMAL_REFRESH_MS;
}
function scheduleRemoteRefresh(){
 if(remoteRefreshTimer)clearInterval(remoteRefreshTimer);
 remoteRefreshTimer=setInterval(()=>refreshRemoteState(true),currentRefreshMs());
}
async function ensureRealtimeHealthy(){
 if(!remoteMode||!supabaseClient||document.hidden)return;
 if(statusRealtimeState!=='SUBSCRIBED'){
  try{startStatusRealtime();}catch(err){console.error('status realtime reconnect failed',err)}
 }
 if(scheduleRealtimeState!=='SUBSCRIBED'){
  try{startScheduleRealtime();}catch(err){console.error('schedule realtime reconnect failed',err)}
 }
}
function startRemoteRefreshFallback(){
 scheduleRemoteRefresh();
 if(realtimeHealthTimer)clearInterval(realtimeHealthTimer);
 realtimeHealthTimer=setInterval(ensureRealtimeHealthy,REALTIME_HEALTH_MS);
 const refreshNow=()=>{refreshRemoteState(true);ensureRealtimeHealthy();};
 window.addEventListener('focus',refreshNow);
 window.addEventListener('online',refreshNow);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshNow();});
}
function enterMonitorMode(){
 document.body.classList.add('monitor');
 scheduleRemoteRefresh();
 refreshRemoteState(true);
 ensureRealtimeHealthy();
}
function exitMonitorMode(){
 document.body.classList.remove('monitor');
 scheduleRemoteRefresh();
 refreshRemoteState(true);
}
async function handleAuthenticated(session){
 authSession=session;
 try{await loadMasterData();await loadRemoteEmployees();await loadRemoteSchedules();showApp();render();startStatusRealtime();startScheduleRealtime();startRemoteRefreshFallback();}
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
 document.querySelector('#logoutBtn')?.addEventListener('click',async()=>{if(remoteRefreshTimer){clearInterval(remoteRefreshTimer);remoteRefreshTimer=null;}if(realtimeHealthTimer){clearInterval(realtimeHealthTimer);realtimeHealthTimer=null;}if(statusRealtimeChannel)await supabaseClient.removeChannel(statusRealtimeChannel);if(scheduleRealtimeChannel)await supabaseClient.removeChannel(scheduleRealtimeChannel);await supabaseClient.auth.signOut();authSession=null;currentEmployeeProfile=null;remoteMode=false;showLogin('ログアウトしました。');});
 if(!supabaseConfigured()){showLogin('初回設定：supabase-config.js にPublishable keyを設定してください。');return;}
 if(!window.supabase?.createClient){showLogin('Supabaseライブラリを読み込めませんでした。ネットワークを確認してください。');return;}
 supabaseClient=window.supabase.createClient(window.YAMAJU_SUPABASE.url,window.YAMAJU_SUPABASE.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(session)await handleAuthenticated(session);else showLogin();
 supabaseClient.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')showLogin();});
}

const KEY='yamaju-board-v2';
const HOLIDAY_STATUS_NAMES=['全休','午前休','午後休','時間休'];
const LEGACY_HOLIDAY_STATUS='休み';
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
 ],history:[],schedules:[],statuses:structuredClone(DEFAULT_STATUSES),settings:{currentUserId:'e1',visibleEmployeeIds:['e1','e2','e3','e4','e5'],employeeOrder:['e1','e2','e3','e4','e5'],boardColumns:'auto',pinSelfFirst:true}
};
let data=load();let currentView='board';
const $=s=>document.querySelector(s);
function migrate(v){
 if(!v||!Array.isArray(v.employees))return structuredClone(seed);
 v.settings ||= {currentUserId:v.employees[0]?.id||'',visibleEmployeeIds:v.employees.map(e=>e.id)};
 v.settings.visibleEmployeeIds ||= v.employees.map(e=>e.id);v.settings.currentUserId ||= v.employees[0]?.id||'';
 v.settings.employeeOrder=Array.isArray(v.settings.employeeOrder)?v.settings.employeeOrder.map(String):v.employees.map(e=>String(e.id));
 v.settings.boardColumns=String(v.settings.boardColumns||'auto');
 if(!['auto','1','2','3','4','5','6'].includes(v.settings.boardColumns))v.settings.boardColumns='auto';
 if(typeof v.settings.pinSelfFirst!=='boolean')v.settings.pinSelfFirst=true;
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
function timeRange(s){if(!s.endAt)return `${dateFmt(s.startAt)} ～ 終了なし`;const a=jstDateKey(s.startAt),b=jstDateKey(s.endAt);if(a&&b&&a!==b)return `${dateFmt(s.startAt)} ～ ${dateFmt(s.endAt)}`;return `${dateFmt(s.startAt)} ～ ${new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(new Date(s.endAt))}`}
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
 const d=$('#departmentFilter'),dp=d.value;const depNames=[...new Set([...activeMasterNames(departmentMasterRows),...uniq('department')])];d.innerHTML='<option value="">すべての部署</option>'+depNames.map(x=>`<option>${esc(x)}</option>`).join('');d.value=dp;
 const o=$('#occupationFilter'),op=o.value;const jobNames=[...new Set([...activeMasterNames(jobTypeMasterRows),...uniq('occupation')])];o.innerHTML='<option value="">すべての職種</option>'+jobNames.map(x=>`<option>${esc(x)}</option>`).join('');o.value=op;
 const sf=$('#statusFilter'),sv=sf.value;const filterNames=[...new Set([...sortedStatuses(true).map(s=>s.name),...data.employees.map(e=>e.status)])];sf.innerHTML='<option value="">すべての状態</option>'+filterNames.map(n=>`<option>${esc(n)}</option>`).join('');if(filterNames.includes(sv))sf.value=sv;
 $('#scheduleEmployee').innerHTML=data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}（${esc(e.department)} / ${esc(e.occupation)}）</option>`).join('');
}
function orderedVisibleEmployees(){
 const ids=new Set((data.settings.visibleEmployeeIds||[]).map(String));
 const map=new Map(data.employees.map(e=>[String(e.id),e]));
 const order=(data.settings.employeeOrder||[]).map(String).filter(id=>map.has(id));
 data.employees.forEach(e=>{if(!order.includes(String(e.id)))order.push(String(e.id));});
 let list=order.filter(id=>ids.has(id)).map(id=>map.get(id));
 if(data.settings.pinSelfFirst&&!layoutEditMode){const me=String(data.settings.currentUserId||'');list.sort((a,b)=>a.id===me?-1:b.id===me?1:0);}
 return list;
}
function defaultLocationForEmployee(e){
 const row=departmentMasterRows.find(d=>d.name===e?.department);
 const loc=String(row?.default_location||'').replace(/^'+|'+$/g,'').trim();
 return loc||'本社';
}
function showToast(message,type='success'){
 let toast=document.querySelector('#appToast');
 if(!toast){toast=document.createElement('div');toast.id='appToast';toast.className='app-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.appendChild(toast);}
 toast.textContent=message;toast.className=`app-toast ${type} show`;
 clearTimeout(showToast._timer);showToast._timer=setTimeout(()=>toast.classList.remove('show'),2400);
}
async function eraseMyStatus(){
 const me=data.employees.find(e=>e.id===data.settings.currentUserId);
 if(!me){showToast('自分の社員情報が見つかりません。','error');return;}
 const btn=document.querySelector('.eraser-btn');if(btn)btn.disabled=true;
 const before={...me},loc=defaultLocationForEmployee(me),nowIso=new Date().toISOString();
 Object.assign(me,{status:'在席',destination:loc,purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''});
 render();
 try{
  if(remoteMode){
   // 在席への復帰自体を最優先で保存する。
   await saveEmployeeStatusRemote(me);

   // 実行中予定の終了処理は補助処理。失敗しても在席復帰成功をエラー扱いにしない。
   try{
    const {data:running,error:findErr}=await supabaseClient.from('schedules').select('id').eq('employee_id',Number(me.dbId||me.id)).eq('start_done',true).eq('end_done',false).lte('start_at',nowIso).gt('end_at',nowIso);
    if(findErr)throw findErr;
    if(running?.length){
     const ids=running.map(x=>x.id);
     const {error:endErr}=await supabaseClient.from('schedules').update({end_done:true,updated_at:nowIso}).in('id',ids);
     if(endErr)throw endErr;
    }
   }catch(scheduleErr){console.warn('eraser: schedule close skipped',scheduleErr);}

   try{await loadSchedulesRemote();}catch(loadErr){console.warn('eraser: schedule reload skipped',loadErr);}
  }else{
   const now=Date.now();data.schedules.forEach(s=>{if(s.employeeId===me.id&&s.startDone&&!s.endDone&&new Date(s.startAt).getTime()<=now&&new Date(s.endAt).getTime()>now)s.endDone=true;});
  }
  pushHistory('manual',me,{before:before.status,after:'在席',destination:loc});save();render();showToast(`在席・${loc}に戻しました。`,'success');
 }catch(err){
  console.error(err);Object.assign(me,before);render();showToast('在席への復帰に失敗しました。','error');
 }
 finally{if(btn)btn.disabled=false;}
}
function jstDateKey(value){
 const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';
 const parts=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`;
}
function holidayDateLabel(key){
 const [y,m,d]=key.split('-').map(Number);if(!y||!m||!d)return key;
 const dt=new Date(Date.UTC(y,m-1,d,12));const wd=new Intl.DateTimeFormat('ja-JP',{weekday:'short',timeZone:'Asia/Tokyo'}).format(dt);
 return `${m}/${d}（${wd}）`;
}
function isHolidayStatus(name){return HOLIDAY_STATUS_NAMES.includes(name)||name===LEGACY_HOLIDAY_STATUS}
function holidayDayCount(s){
 const a=jstDateKey(s.startAt),b=jstDateKey(s.endAt);if(!a||!b)return 1;
 const [ay,am,ad]=a.split('-').map(Number),[by,bm,bd]=b.split('-').map(Number);
 return Math.max(1,Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000)+1);
}
function holidayDateRangeLabel(s){
 const a=jstDateKey(s.startAt),b=jstDateKey(s.endAt);if(!a)return '';
 if(!b||a===b)return holidayDateLabel(a);
 return `${holidayDateLabel(a)}～${holidayDateLabel(b)}`;
}
function holidayTimeLabel(s){
 if(s.status==='全休'||s.status===LEGACY_HOLIDAY_STATUS){const n=holidayDayCount(s);return n===1?'1日':`${n}日間`;}
 if(s.status==='午前休')return '午前';
 if(s.status==='午後休')return '午後';
 const a=localDateParts(s.startAt).time,b=localDateParts(s.endAt).time;
 return `${a}～${b}`;
}
function holidayScheduleRows(){
 const today=jstDateKey(new Date()),seen=new Map();
 [...data.schedules]
  .filter(s=>isHolidayStatus(s.status))
  .forEach(s=>{const startKey=jstDateKey(s.startAt),endKey=jstDateKey(s.endAt)||startKey;if(!startKey||!endKey||endKey<today)return;const k=`${startKey}|${endKey}|${s.employeeId}|${s.status}|${s.startAt}|${s.endAt}`;if(!seen.has(k))seen.set(k,{...s,dateKey:startKey,endDateKey:endKey});});
 return [...seen.values()].sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||String(a.startAt).localeCompare(String(b.startAt))||String(a.employeeId).localeCompare(String(b.employeeId),'ja'));
}
function render(){
 renderFilters();document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
 const toolbar=document.querySelector('.toolbar');if(toolbar)toolbar.hidden=currentView==='holiday';
 const board=$('#board');if(currentView==='holiday')return renderHolidayBoard(board);if(currentView==='history')return renderHistory(board);if(currentView==='schedule')return renderSchedules(board);renderBoard(board)
}
function renderBoard(board){
 const q=$('#searchInput').value.trim().toLowerCase(),dep=$('#departmentFilter').value,occ=$('#occupationFilter').value,st=$('#statusFilter').value;const base=orderedVisibleEmployees();
 const list=base.filter(e=>(!q||`${e.name} ${e.destination} ${e.purpose}`.toLowerCase().includes(q))&&(!dep||e.department===dep)&&(!occ||e.occupation===occ)&&(!st||e.status===st));
 board.className='board';
 const cols=String(data.settings.boardColumns||'auto');
 if(cols!=='auto'){board.classList.add('fixed-columns');board.style.setProperty('--board-cols',cols);}else{board.classList.remove('fixed-columns');board.style.removeProperty('--board-cols');}
 board.innerHTML='';const t=$('#employeeCardTemplate');
 list.forEach(e=>{const n=t.content.cloneNode(true),card=n.querySelector('.employee-card'),sm=statusByName(e.status),bg=sm.color||'#fff',fg=contrast(bg);card.dataset.employeeId=String(e.id);card.style.setProperty('--status-bg',bg);card.style.setProperty('--card-text',fg);n.querySelector('.employee-name').textContent=e.name;n.querySelector('.employee-meta').textContent=[e.department,e.occupation].filter(Boolean).join(' / ');n.querySelector('.status-pill').textContent=e.status;n.querySelector('.destination').textContent=sm.useDestination===false?'―':(e.destination||'―');n.querySelector('.purpose').textContent=e.purpose||' ';const shownReturn=(!sm.useReturn||e.goHome||!e.returnTime||e.returnTime==='00:00')?'―':e.returnTime;n.querySelector('.return-time').textContent=shownReturn;n.querySelector('.phone-status').textContent=phoneText(e.phone);const tags=n.querySelector('.tag-row');if(e.id===data.settings.currentUserId)tags.innerHTML+='<span class="tag">自分</span>';if(e.direct)tags.innerHTML+='<span class="tag">直行</span>';if(e.goHome)tags.innerHTML+='<span class="tag">直帰</span>';if(!sm.active)tags.innerHTML+='<span class="tag">停止中状態</span>';if(e.memo)tags.innerHTML+=`<span class="tag">${esc(e.memo)}</span>`;n.querySelector('.change-btn').addEventListener('click',()=>openEdit(e.id));const eraser=n.querySelector('.eraser-btn');if(e.id===data.settings.currentUserId){eraser.hidden=false;eraser.addEventListener('click',eraseMyStatus);}else eraser.remove();board.appendChild(n)});if(layoutEditMode)decorateBoardForLayoutEdit(board);
 $('#summary').textContent=`表示 ${list.length}名 / 登録${data.employees.length}名`;if(!list.length)board.innerHTML='<div class="empty card">該当する社員がいません</div>';
}
function renderHolidayBoard(board){
 const rows=holidayScheduleRows();board.className='holiday-board';
 board.innerHTML=`<section class="holiday-board-card card"><div class="holiday-board-head"><div><div class="eyebrow">HOLIDAY BOARD</div><h2>休み掲示板</h2></div><span class="holiday-count">${rows.length}件</span></div><div class="holiday-table"><div class="holiday-row holiday-header"><span>日付</span><span>休みの種類</span><span>時間</span><span>氏名</span></div>${rows.length?rows.map(s=>{const e=data.employees.find(x=>x.id===s.employeeId);const kind=s.status===LEGACY_HOLIDAY_STATUS?'全休':s.status;return `<div class="holiday-row"><strong class="holiday-date">${esc(holidayDateRangeLabel(s))}</strong><span class="holiday-kind">${esc(kind)}</span><span class="holiday-time">${esc(holidayTimeLabel(s))}</span><strong class="holiday-name">${esc(e?.name||'不明')}</strong></div>`}).join(''):'<div class="holiday-empty">登録されている休み予定はありません。</div>'}</div></section>`;
 $('#summary').textContent=`休み予定 ${rows.length}件`;
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
function applyEditRules(){const st=$('#editStatus').value,sm=statusByName(st),e=data.employees.find(x=>x.id===$('#editEmployeeId').value);if(st==='在席'&&e){$('#editDestination').value=defaultLocationForEmployee(e);}else if(sm.defaultDestination&&!$('#editDestination').value.trim())$('#editDestination').value=sm.defaultDestination;if(sm.useDestination===false){$('#editDestination').value='';$('#editPurpose').value=''}if(!sm.useReturn)$('#editReturn').value='';if($('#editGoHome').checked)$('#editReturn').value=''}
function openEdit(id){const e=data.employees.find(x=>x.id===id);$('#editEmployeeId').value=id;$('#editTitle').textContent=e.name;fillStatusSelect($('#editStatus'),e.status,true);$('#editDestination').value=e.destination;$('#editPurpose').value=e.purpose;$('#editReturn').value=e.returnTime;$('#editPhone').value=e.phone;$('#editDirect').checked=e.direct;$('#editGoHome').checked=e.goHome;$('#editMemo').value=e.memo||'';$('#editDialog').showModal()}
$('#editStatus').addEventListener('change',applyEditRules);$('#editGoHome').addEventListener('change',applyEditRules);
$('#saveEditBtn').addEventListener('click',async ev=>{ev.preventDefault();applyEditRules();const id=$('#editEmployeeId').value,e=data.employees.find(x=>x.id===id),before=e.status,status=$('#editStatus').value;const destination=status==='在席'?defaultLocationForEmployee(e):$('#editDestination').value.trim();Object.assign(e,{status,destination,purpose:$('#editPurpose').value.trim(),returnTime:$('#editReturn').value,phone:$('#editPhone').value,direct:$('#editDirect').checked,goHome:$('#editGoHome').checked,memo:$('#editMemo').value.trim()});pushHistory('manual',e,{before,after:e.status,destination:e.destination});save();try{await saveEmployeeStatusRemote(e);$('#editDialog').close();render();}catch(err){console.error(err);showToast('Supabaseへの保存に失敗しました。','error');}});
function applyScheduleStatusRules(){
 const st=$('#scheduleStatus').value,isFull=st==='全休';
 if(isHolidayStatus(st)){
  $('#scheduleDestination').value='';$('#schedulePurpose').value='';$('#scheduleDirect').checked=false;$('#scheduleGoHome').checked=false;$('#schedulePhone').value='ok';$('#scheduleAfter').value='present';
 }
 const endDate=$('#scheduleEndDate');const timeBox=$('#scheduleTimeFields');
 if(endDate){endDate.disabled=!isFull;if(!isFull)endDate.value=$('#scheduleDate').value;}
 if(timeBox)timeBox.hidden=isFull;
 if(isFull){$('#scheduleStart').value='00:00';$('#scheduleEnd').value='23:59';}
}
$('#scheduleStatus').addEventListener('change',applyScheduleStatusRules);$('#scheduleDate').addEventListener('change',()=>{if($('#scheduleStatus').value!=='全休')$('#scheduleEndDate').value=$('#scheduleDate').value;});
function openSchedule(id=''){
 const s=data.schedules.find(x=>x.id===String(id)),d=new Date();
 if(s?.startDone&&!s?.endDone)return alert('この予定は実行中のため編集できません。');
 if(s?.endDone)return alert('完了済みの予定は編集できません。');
 const sp=s?localDateParts(s.startAt):{date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,time:'09:00'};
 const ep=s?localDateParts(s.endAt):{date:sp.date,time:'10:00'};
 $('#scheduleDialogTitle').textContent=s?'予定を編集':'予定を登録';$('#saveScheduleBtn').textContent=s?'保存':'登録';$('#scheduleId').value=id;$('#scheduleDate').value=sp.date;$('#scheduleEndDate').value=ep.date||sp.date;$('#scheduleStart').value=sp.time;$('#scheduleEnd').value=ep.time;$('#scheduleEmployee').value=s?.employeeId||data.settings.currentUserId||data.employees[0]?.id;fillStatusSelect($('#scheduleStatus'),s?.status||activeStatusNames()[0]||'在席',true);$('#scheduleDestination').value=s?.destination||'';$('#schedulePurpose').value=s?.purpose||'';$('#schedulePhone').value=s?.phone||'later';$('#scheduleAfter').value=s?.after||'present';$('#scheduleDirect').checked=!!s?.direct;$('#scheduleGoHome').checked=!!s?.goHome;$('#scheduleMemo').value=s?.memo||'';applyScheduleStatusRules();$('#scheduleDialog').showModal();
}
$('#saveScheduleBtn').addEventListener('click',async ev=>{
 ev.preventDefault();const btn=$('#saveScheduleBtn');btn.disabled=true;
 try{
  if(remoteMode){await saveScheduleRemote($('#scheduleId').value);$('#scheduleDialog').close();render();return;}
  const status=$('#scheduleStatus').value,startDate=$('#scheduleDate').value,endDate=$('#scheduleEndDate').value||startDate,isFull=status==='全休';const start=isFull?'00:00':$('#scheduleStart').value,end=isFull?'23:59':$('#scheduleEnd').value;if(!startDate||!endDate)return alert('日付を入力してください。');if(endDate<startDate)return alert('終了日は開始日以降にしてください。');if(!isFull&&(!start||!end))return alert('開始・終了時刻を入力してください。');if(!isFull&&end<=start)return alert('終了時刻は開始時刻より後にしてください。');if(!isFull&&endDate!==startDate)return alert('複数日の指定は「全休」のみ利用できます。');const existing=data.schedules.find(x=>x.id===$('#scheduleId').value);const obj={id:existing?.id||crypto.randomUUID(),employeeId:$('#scheduleEmployee').value,startAt:`${startDate}T${start}:00`,endAt:`${endDate}T${end}:${isFull?'59':'00'}`,status,destination:$('#scheduleDestination').value.trim(),purpose:$('#schedulePurpose').value.trim(),phone:$('#schedulePhone').value,after:$('#scheduleAfter').value,direct:$('#scheduleDirect').checked,goHome:$('#scheduleGoHome').checked,memo:$('#scheduleMemo').value.trim(),startDone:existing?.startDone||false,endDone:existing?.endDone||false,beforeSnapshot:existing?.beforeSnapshot||null};if(existing)Object.assign(existing,obj);else data.schedules.push(obj);save();$('#scheduleDialog').close();render();
 }catch(err){console.error(err);alert(err.message||'予定の保存に失敗しました。');}finally{btn.disabled=false;}
});
async function deleteSchedule(id){
 const s=data.schedules.find(x=>x.id===String(id));if(!s||!confirm('この予定を削除しますか？'))return;
 try{if(remoteMode){await deleteScheduleRemote(id);render();return;}data.schedules=data.schedules.filter(x=>x.id!==id);save();render();}catch(err){console.error(err);alert(err.message||'予定の削除に失敗しました。');}
}
$('#addEmployeeBtn').addEventListener('click',()=>{if(currentEmployeeProfile?.role==='admin')openEmployeeManage();});

let employeeAdminRows=[];
function isCurrentAdmin(){return currentEmployeeProfile?.role==='admin'}
async function employeeAdminCall(action,payload={}){
 if(!supabaseClient||!authSession)throw new Error('ログイン情報を確認できません。');
 if(!isCurrentAdmin())throw new Error('管理者のみ実行できます。');
 const {data:result,error}=await supabaseClient.functions.invoke('manage-employee',{body:{action,...payload}});
 if(error){
  let msg=error.message||'社員管理APIの呼び出しに失敗しました。';
  try{if(error.context){const body=await error.context.clone().json();if(body?.error)msg=body.error;}}catch{}
  throw new Error(msg);
 }
 if(result?.error)throw new Error(result.error);
 return result||{};
}
function loginIdFromEmail(email=''){return String(email).split('@')[0]||''}
function setEmployeeAdminNotice(message='',isError=false){const n=$('#employeeAdminNotice');if(!n)return;n.hidden=!message;n.textContent=message;n.classList.toggle('error-notice',!!isError)}
async function refreshEmployeeAdmin(){
 const list=$('#employeeAdminList');if(!list)return;
 list.innerHTML='<div class="empty card">社員情報を読み込み中…</div>';setEmployeeAdminNotice();
 try{
  const result=await employeeAdminCall('list');employeeAdminRows=result.employees||[];renderEmployeeAdmin();
 }catch(err){console.error(err);list.innerHTML='';setEmployeeAdminNotice(err.message||'社員情報の取得に失敗しました。',true)}
}
function renderEmployeeAdmin(){
 const list=$('#employeeAdminList');if(!list)return;
 if(!employeeAdminRows.length){list.innerHTML='<div class="empty card">登録されている社員がいません。</div>';return}
 list.innerHTML=employeeAdminRows.map(e=>`<article class="employee-admin-row ${e.active?'':'inactive'}">
   <div class="employee-admin-main"><strong>${esc(e.name||'名称未設定')}</strong><span>${esc(e.email||'')}</span><small>${esc([e.department,e.job_type].filter(Boolean).join(' / ')||'部署・職種未設定')}</small></div>
   <span class="permission-badge ${e.role==='admin'?'admin':''}">${e.role==='admin'?'管理者':'一般'}</span>
   <span class="status-state ${e.active?'on':'off'}">${e.active?'有効':'無効'}</span>
   <div class="employee-admin-actions"><button type="button" class="small-btn secondary edit-employee-admin" data-id="${e.id}">編集</button><button type="button" class="small-btn ${e.active?'secondary':'primary'} toggle-employee-admin" data-id="${e.id}">${e.active?'無効化':'再開'}</button><button type="button" class="small-btn danger delete-employee-admin" data-id="${e.id}">削除</button></div>
 </article>`).join('');
 list.querySelectorAll('.edit-employee-admin').forEach(b=>b.addEventListener('click',()=>openEmployeeManage(Number(b.dataset.id))));
 list.querySelectorAll('.toggle-employee-admin').forEach(b=>b.addEventListener('click',()=>toggleEmployeeAdmin(Number(b.dataset.id))));
 list.querySelectorAll('.delete-employee-admin').forEach(b=>b.addEventListener('click',()=>deleteEmployeeAdmin(Number(b.dataset.id))));
}
function openEmployeeManage(employeeId=null){
 if(!isCurrentAdmin())return alert('管理者のみ利用できます。');
 const row=employeeId?employeeAdminRows.find(x=>Number(x.id)===Number(employeeId)):null;
 $('#employeeForm').reset();$('#employeeManageId').value=row?.id||'';$('#employeeDialogTitle').textContent=row?'社員を修正':'社員を追加';$('#saveEmployeeBtn').textContent=row?'保存':'追加';
 $('#newLoginId').value=row?loginIdFromEmail(row.email):'';$('#newPassword').value='';$('#newName').value=row?.name||'';fillEmployeeMasterSelects(row?.department||'',row?.job_type||'');$('#newAccessRole').value=row?.role||'user';
 $('#employeeFormHelp').textContent=row?'パスワードは変更する場合のみ入力してください。ログインIDを変更すると認証メールアドレスも更新されます。':'追加すると、認証アカウント・社員情報・初期状態（在席／本社／対応可）をまとめて作成します。';
 $('#employeeDialog').showModal();
}
$('#adminAddEmployeeBtn')?.addEventListener('click',()=>openEmployeeManage());

// ---- CSV bulk employee registration ---------------------------------------
let bulkEmployeeRows=[];
let bulkEmployeeErrors=[];
const BULK_HEADER_ALIASES={
 login_id:['login_id','ログインID','ログインid','ID','id'],
 password:['password','初期パスワード','パスワード'],
 name:['name','氏名','社員名','名前'],
 department:['department','部署'],
 job_type:['job_type','職種','jobtype'],
 role:['role','権限']
};
function normalizeHeader(v=''){return String(v).replace(/^\uFEFF/,'').trim().toLowerCase().replace(/\s+/g,'')}
function parseCsvText(text){
 const rows=[];let row=[],field='',quoted=false;const src=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(quoted){if(c==='"'&&src[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}
  else if(c==='"')quoted=true;
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
  else if(c!=='\r')field+=c;
 }
 if(field!==''||row.length){row.push(field);rows.push(row)}
 return rows.filter(r=>r.some(v=>String(v).trim()!==''));
}
function mapBulkHeaders(headers){
 const normalized=headers.map(normalizeHeader),map={};
 for(const [key,aliases] of Object.entries(BULK_HEADER_ALIASES)){
  const set=new Set(aliases.map(normalizeHeader));map[key]=normalized.findIndex(h=>set.has(h));
 }
 return map;
}
function normalizeBulkRole(v=''){const x=String(v).trim().toLowerCase();if(['admin','管理者','管理'].includes(x))return'admin';if(['user','一般','一般ユーザー','一般user'].includes(x)||x==='')return'user';return x}
function validateBulkRows(rawRows){
 if(!rawRows.length)return {rows:[],fatal:'CSVにデータがありません。'};
 const map=mapBulkHeaders(rawRows[0]),required=['login_id','password','name','department'];
 const missing=required.filter(k=>map[k]<0);if(missing.length)return {rows:[],fatal:`必須列がありません：${missing.join(', ')}`};
 const activeDeps=new Set(activeMasterNames(departmentMasterRows)),activeJobs=new Set(activeMasterNames(jobTypeMasterRows));
 const existingIds=new Set(employeeAdminRows.map(e=>loginIdFromEmail(e.email).toLowerCase()));const seen=new Set();
 const rows=rawRows.slice(1).map((r,i)=>{
  const get=k=>map[k]>=0?String(r[map[k]]??'').trim():'';
  const obj={rowNo:i+2,login_id:get('login_id').toLowerCase(),password:get('password'),name:get('name'),department:get('department'),job_type:get('job_type'),role:normalizeBulkRole(get('role')),errors:[],status:'pending'};
  if(!obj.login_id)obj.errors.push('ログインID必須');
  else if(!/^[a-z0-9._-]+$/i.test(obj.login_id))obj.errors.push('ログインIDは半角英数字 . _ - のみ');
  else if(existingIds.has(obj.login_id))obj.errors.push('既存IDと重複');
  else if(seen.has(obj.login_id))obj.errors.push('CSV内でID重複');
  seen.add(obj.login_id);
  if(obj.password.length<8)obj.errors.push('パスワード8文字以上');
  if(!obj.name)obj.errors.push('氏名必須');
  if(!obj.department)obj.errors.push('部署必須');else if(!activeDeps.has(obj.department))obj.errors.push('部署マスタにありません');
  if(obj.job_type&&!activeJobs.has(obj.job_type))obj.errors.push('職種マスタにありません');
  if(!['user','admin'].includes(obj.role))obj.errors.push('権限はuser/admin');
  obj.status=obj.errors.length?'error':'ready';return obj;
 }).filter(r=>r.login_id||r.name||r.department||r.password||r.job_type);
 return {rows,fatal:''};
}
function setBulkEmployeeNotice(message='',isError=false){const n=$('#bulkEmployeeNotice');if(!n)return;n.hidden=!message;n.textContent=message;n.classList.toggle('error-notice',!!isError)}
function renderBulkEmployeePreview(){
 const body=$('#bulkEmployeePreview'),summary=$('#bulkEmployeeSummary'),run=$('#runBulkEmployeeBtn');if(!body)return;
 const valid=bulkEmployeeRows.filter(r=>r.status==='ready').length,errors=bulkEmployeeRows.filter(r=>r.status==='error').length,success=bulkEmployeeRows.filter(r=>r.status==='success').length,failed=bulkEmployeeRows.filter(r=>r.status==='failed').length;
 summary.textContent=bulkEmployeeRows.length?`読込 ${bulkEmployeeRows.length}件｜登録可能 ${valid}件｜入力エラー ${errors}件${success||failed?`｜成功 ${success}件｜登録失敗 ${failed}件`:''}`:'';
 body.innerHTML=bulkEmployeeRows.slice(0,100).map(r=>`<tr class="bulk-row-${r.status}"><td>${r.rowNo}</td><td>${esc(r.login_id)}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.job_type||'―')}</td><td>${r.role==='admin'?'管理者':'一般'}</td><td>${r.status==='success'?'登録済':r.status==='failed'?`失敗：${esc(r.runError||'')}`:r.errors.length?esc(r.errors.join(' / ')):'OK'}</td></tr>`).join('');
 run.disabled=!valid;$('#downloadBulkErrorsBtn').hidden=!(errors||failed);
}
function openBulkEmployeeImport(){
 if(!isCurrentAdmin())return alert('管理者のみ利用できます。');
 bulkEmployeeRows=[];bulkEmployeeErrors=[];$('#bulkEmployeeFile').value='';setBulkEmployeeNotice();$('#bulkEmployeeProgress').hidden=true;renderBulkEmployeePreview();$('#employeeBulkDialog').showModal();
}
$('#adminBulkEmployeeBtn')?.addEventListener('click',openBulkEmployeeImport);
$('#bulkEmployeeFile')?.addEventListener('change',async ev=>{
 const file=ev.target.files?.[0];bulkEmployeeRows=[];setBulkEmployeeNotice();if(!file){renderBulkEmployeePreview();return;}
 try{const text=await file.text(),result=validateBulkRows(parseCsvText(text));if(result.fatal){setBulkEmployeeNotice(result.fatal,true);renderBulkEmployeePreview();return;}bulkEmployeeRows=result.rows;renderBulkEmployeePreview();if(!bulkEmployeeRows.length)setBulkEmployeeNotice('登録対象のデータ行がありません。',true);}
 catch(err){console.error(err);setBulkEmployeeNotice('CSVを読み込めませんでした。CSV UTF-8形式か確認してください。',true);}
});
function bulkTemplateCsv(){return '\uFEFFログインID,初期パスワード,氏名,部署,職種,権限\r\n';}
function downloadTextFile(text,name,type='text/csv;charset=utf-8'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500)}
$('#downloadBulkCsvTemplateBtn')?.addEventListener('click',()=>downloadTextFile(bulkTemplateCsv(),'山十_社員一括登録テンプレート.csv'));
$('#downloadBulkErrorsBtn')?.addEventListener('click',()=>{
 const bad=bulkEmployeeRows.filter(r=>r.status==='error'||r.status==='failed');let csv='\uFEFFログインID,初期パスワード,氏名,部署,職種,権限,エラー\r\n';
 const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';csv+=bad.map(r=>[r.login_id,r.password,r.name,r.department,r.job_type,r.role==='admin'?'admin':'user',r.status==='failed'?(r.runError||'登録失敗'):r.errors.join(' / ')].map(q).join(',')).join('\r\n');downloadTextFile(csv,'山十_社員一括登録_エラー.csv');
});
$('#runBulkEmployeeBtn')?.addEventListener('click',async()=>{
 const targets=bulkEmployeeRows.filter(r=>r.status==='ready');if(!targets.length)return;if(!confirm(`${targets.length}名を一括登録します。よろしいですか？`))return;
 const btn=$('#runBulkEmployeeBtn');btn.disabled=true;$('#bulkEmployeeProgress').hidden=false;let done=0,ok=0,ng=0;
 for(const r of targets){
  $('#bulkEmployeeProgressText').textContent=`${done}/${targets.length}件 処理中…`;$('#bulkEmployeeProgressBar').style.width=`${Math.round(done/targets.length*100)}%`;
  try{await employeeAdminCall('create',{email:loginEmailFromId(r.login_id),password:r.password,name:r.name,department:r.department,job_type:r.job_type||null,role:r.role});r.status='success';ok++;}
  catch(err){console.error(err);r.status='failed';r.runError=err.message||'登録に失敗しました。';ng++;}
  done++;$('#bulkEmployeeProgressText').textContent=`${done}/${targets.length}件 完了`;$('#bulkEmployeeProgressBar').style.width=`${Math.round(done/targets.length*100)}%`;renderBulkEmployeePreview();
 }
 setBulkEmployeeNotice(`一括登録が完了しました。成功 ${ok}件／失敗 ${ng}件`,ng>0);await refreshEmployeeAdmin();await loadRemoteEmployees();render();renderBulkEmployeePreview();btn.disabled=false;
});

$('#saveEmployeeBtn').addEventListener('click',async ev=>{
 ev.preventDefault();const id=$('#employeeManageId').value,loginId=$('#newLoginId').value.trim().toLowerCase(),password=$('#newPassword').value,name=$('#newName').value.trim(),department=$('#newDepartment').value.trim(),jobType=$('#newOccupation').value.trim(),role=$('#newAccessRole').value;
 if(!loginId||!name||!department)return alert('ログインID・氏名・部署を入力してください。');
 if(!id&&password.length<8)return alert('初期パスワードは8文字以上で入力してください。');
 if(id&&password&&password.length<8)return alert('新しいパスワードは8文字以上で入力してください。');
 const btn=$('#saveEmployeeBtn');btn.disabled=true;btn.textContent=id?'保存中…':'追加中…';
 try{
  const payload={email:loginEmailFromId(loginId),name,department,job_type:jobType||null,role};if(password)payload.password=password;if(id)payload.employee_id=Number(id);
  await employeeAdminCall(id?'update':'create',payload);$('#employeeDialog').close();await refreshEmployeeAdmin();await loadRemoteEmployees();render();
 }catch(err){console.error(err);alert(err.message||'社員情報の保存に失敗しました。')}finally{btn.disabled=false;btn.textContent=id?'保存':'追加'}
});
async function toggleEmployeeAdmin(id){
 const row=employeeAdminRows.find(x=>Number(x.id)===Number(id));if(!row)return;const action=row.active?'disable':'enable';const msg=row.active?`${row.name}さんのアカウントを無効化しますか？\n行先板には表示されず、ログインもできなくなります。`:`${row.name}さんのアカウントを再開しますか？`;if(!confirm(msg))return;
 try{await employeeAdminCall(action,{employee_id:id});await refreshEmployeeAdmin();await loadRemoteEmployees();render()}catch(err){console.error(err);alert(err.message||'アカウント状態の変更に失敗しました。')}
}
async function deleteEmployeeAdmin(id){
 const row=employeeAdminRows.find(x=>Number(x.id)===Number(id));if(!row)return;const typed=prompt(`${row.name}さんを完全に削除します。\n認証アカウント・社員情報・現在状態も削除されます。\n実行する場合は「削除」と入力してください。`);if(typed!=='削除')return;
 try{await employeeAdminCall('delete',{employee_id:id});await refreshEmployeeAdmin();await loadRemoteEmployees();render()}catch(err){console.error(err);alert(err.message||'社員の削除に失敗しました。')}
}

function masterConfig(type){return type==='department'?{table:'departments',label:'部署',rows:departmentMasterRows,list:'#departmentMasterList',notice:'#departmentAdminNotice',employeeField:'department'}:{table:'job_types',label:'職種',rows:jobTypeMasterRows,list:'#jobTypeMasterList',notice:'#jobAdminNotice',employeeField:'job_type'}}
function setMasterNotice(type,message='',isError=false){const n=$(masterConfig(type).notice);if(!n)return;n.hidden=!message;n.textContent=message;n.classList.toggle('error-notice',!!isError)}
async function refreshMasters(){await loadMasterData();renderMasterAdmin('department');renderMasterAdmin('job');renderFilters();}
function renderMasterAdmin(type){const c=masterConfig(type),wrap=$(c.list);if(!wrap)return;const rows=[...c.rows].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.id-b.id);if(!rows.length){wrap.innerHTML=`<div class="empty card">${c.label}が登録されていません。</div>`;return;}wrap.innerHTML=rows.map((r,i)=>`<article class="master-row ${r.active?'':'inactive'}"><div class="master-main"><strong>${esc(r.name)}</strong><small>並び順 ${i+1}</small></div><span class="status-state ${r.active?'on':'off'}">${r.active?'使用中':'停止'}</span><div class="master-move"><button type="button" class="small-btn secondary master-up" data-type="${type}" data-id="${r.id}" ${i===0?'disabled':''}>↑</button><button type="button" class="small-btn secondary master-down" data-type="${type}" data-id="${r.id}" ${i===rows.length-1?'disabled':''}>↓</button></div><div class="master-actions"><button type="button" class="small-btn secondary master-edit" data-type="${type}" data-id="${r.id}">編集</button><button type="button" class="small-btn ${r.active?'secondary':'primary'} master-toggle" data-type="${type}" data-id="${r.id}">${r.active?'停止':'再開'}</button><button type="button" class="small-btn danger master-delete" data-type="${type}" data-id="${r.id}">削除</button></div></article>`).join('');wrap.querySelectorAll('.master-edit').forEach(b=>b.addEventListener('click',()=>openMasterEdit(b.dataset.type,Number(b.dataset.id))));wrap.querySelectorAll('.master-toggle').forEach(b=>b.addEventListener('click',()=>toggleMaster(b.dataset.type,Number(b.dataset.id))));wrap.querySelectorAll('.master-delete').forEach(b=>b.addEventListener('click',()=>deleteMaster(b.dataset.type,Number(b.dataset.id))));wrap.querySelectorAll('.master-up').forEach(b=>b.addEventListener('click',()=>moveMaster(b.dataset.type,Number(b.dataset.id),-1)));wrap.querySelectorAll('.master-down').forEach(b=>b.addEventListener('click',()=>moveMaster(b.dataset.type,Number(b.dataset.id),1)));}
function openMasterEdit(type,id=null){if(!isCurrentAdmin())return alert('管理者のみ利用できます。');const c=masterConfig(type),row=id?c.rows.find(r=>Number(r.id)===Number(id)):null;$('#masterEditType').value=type;$('#masterEditId').value=row?.id||'';$('#masterEditTitle').textContent=row?`${c.label}を編集`:`${c.label}を追加`;$('#masterEditName').value=row?.name||'';$('#masterEditOrder').value=row?.sort_order||c.rows.length+1;$('#masterEditActive').checked=row?.active!==false;$('#masterEditDialog').showModal();}
async function propagateMasterRename(type,oldName,newName){if(oldName===newName)return;const result=await employeeAdminCall('list');const field=masterConfig(type).employeeField;const targets=(result.employees||[]).filter(e=>(e[field]||'')===oldName);for(const e of targets){await employeeAdminCall('update',{employee_id:Number(e.id),email:e.email,name:e.name,department:type==='department'?newName:e.department,job_type:type==='job'?newName:(e.job_type||null),role:e.role||'user'});} }
$('#saveMasterBtn')?.addEventListener('click',async ev=>{ev.preventDefault();const type=$('#masterEditType').value,c=masterConfig(type),id=Number($('#masterEditId').value)||null,name=$('#masterEditName').value.trim(),sort_order=Math.max(1,Number($('#masterEditOrder').value)||1),active=$('#masterEditActive').checked;if(!name)return alert(`${c.label}名を入力してください。`);const dup=c.rows.find(r=>r.name===name&&Number(r.id)!==id);if(dup)return alert(`同じ${c.label}名がすでにあります。`);const existing=id?c.rows.find(r=>Number(r.id)===id):null;const btn=$('#saveMasterBtn');btn.disabled=true;btn.textContent='保存中…';try{if(existing){const {error}=await supabaseClient.from(c.table).update({name,sort_order,active}).eq('id',id);if(error)throw error;if(existing.name!==name)await propagateMasterRename(type,existing.name,name);}else{const {error}=await supabaseClient.from(c.table).insert({name,sort_order,active});if(error)throw error;}$('#masterEditDialog').close();await refreshMasters();await refreshEmployeeAdmin();await loadRemoteEmployees();render();}catch(err){console.error(err);alert(err.message||`${c.label}の保存に失敗しました。`);}finally{btn.disabled=false;btn.textContent='保存';}});
async function toggleMaster(type,id){const c=masterConfig(type),row=c.rows.find(r=>Number(r.id)===Number(id));if(!row)return;if(row.active){const {count,error}=await supabaseClient.from('employees').select('id',{count:'exact',head:true}).eq(c.employeeField,row.name).eq('active',true);if(error)throw error;if(count>0&&!confirm(`${row.name} は ${count}名の社員に設定されています。\n停止すると新規選択肢から外れますが、既存社員の設定は残ります。続けますか？`))return;}try{const {error}=await supabaseClient.from(c.table).update({active:!row.active}).eq('id',id);if(error)throw error;await refreshMasters();}catch(err){console.error(err);alert(err.message||'状態変更に失敗しました。')}}
async function deleteMaster(type,id){const c=masterConfig(type),row=c.rows.find(r=>Number(r.id)===Number(id));if(!row)return;try{const {count,error}=await supabaseClient.from('employees').select('id',{count:'exact',head:true}).eq(c.employeeField,row.name);if(error)throw error;if(count>0)return alert(`${row.name} は ${count}名の社員に使用中のため削除できません。先に社員の${c.label}を変更するか、「停止」を使ってください。`);if(!confirm(`${row.name} を完全に削除しますか？`))return;const {error:delErr}=await supabaseClient.from(c.table).delete().eq('id',id);if(delErr)throw delErr;await refreshMasters();}catch(err){console.error(err);alert(err.message||'削除に失敗しました。')}}
async function moveMaster(type,id,delta){const c=masterConfig(type),rows=[...c.rows].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.id-b.id),i=rows.findIndex(r=>Number(r.id)===Number(id)),j=i+delta;if(i<0||j<0||j>=rows.length)return;const a=rows[i],b=rows[j],ao=a.sort_order||i+1,bo=b.sort_order||j+1;try{const {error:e1}=await supabaseClient.from(c.table).update({sort_order:bo}).eq('id',a.id);if(e1)throw e1;const {error:e2}=await supabaseClient.from(c.table).update({sort_order:ao}).eq('id',b.id);if(e2)throw e2;await refreshMasters();}catch(err){console.error(err);alert(err.message||'並び替えに失敗しました。')}}
$('#addDepartmentBtn')?.addEventListener('click',()=>openMasterEdit('department'));$('#addJobTypeBtn')?.addEventListener('click',()=>openMasterEdit('job'));

let layoutEditMode=false;
let layoutEditSnapshot=null;
let layoutDraggingCard=null;
let layoutDragPointerId=null;
let layoutDragStartX=0;
let layoutDragStartY=0;
let layoutDragMoved=false;
function profileOrderedEmployees(){
 const map=new Map(data.employees.map(e=>[String(e.id),e]));
 const order=(data.settings.employeeOrder||[]).map(String).filter(id=>map.has(id));
 data.employees.forEach(e=>{if(!order.includes(String(e.id)))order.push(String(e.id));});
 return order.map(id=>map.get(id));
}
function layoutVisibleSet(){return new Set((data.settings.visibleEmployeeIds||[]).map(String));}
function renderLayoutMemberList(){
 const list=$('#layoutMemberList');if(!list)return;
 const q=($('#layoutMemberSearch')?.value||'').trim().toLowerCase(),dep=$('#layoutDepartmentFilter')?.value||'',vis=layoutVisibleSet();
 const rows=profileOrderedEmployees().filter(e=>(!q||`${e.name} ${e.department} ${e.occupation}`.toLowerCase().includes(q))&&(!dep||e.department===dep));
 list.innerHTML=rows.map(e=>`<button type="button" class="layout-member-item ${vis.has(String(e.id))?'selected':''}" data-id="${esc(e.id)}"><span><strong>${esc(e.name)}</strong><small>${esc(e.department)}${e.occupation?` / ${esc(e.occupation)}`:''}</small></span><b>${vis.has(String(e.id))?'表示中':'追加'}</b></button>`).join('')||'<div class="layout-member-empty">該当する社員がいません。</div>';
 list.querySelectorAll('.layout-member-item').forEach(btn=>btn.addEventListener('click',()=>toggleLayoutEmployee(String(btn.dataset.id))));
}
function toggleLayoutEmployee(id){
 const ids=(data.settings.visibleEmployeeIds||[]).map(String),i=ids.indexOf(id);
 if(i>=0)ids.splice(i,1);else ids.push(id);
 data.settings.visibleEmployeeIds=ids;
 render();renderLayoutMemberList();
}
function decorateBoardForLayoutEdit(board){
 board.classList.add('layout-editing-board');
 board.querySelectorAll('.employee-card').forEach(card=>{
  card.draggable=false;
  const id=String(card.dataset.employeeId||'');
  const top=document.createElement('div');
  top.className='layout-card-editor';
  top.innerHTML='<button type="button" class="layout-card-grip" aria-label="ドラッグして並び替え" title="ドラッグして並び替え">☷</button><button type="button" class="layout-card-remove" title="表示から外す">×</button>';
  card.prepend(top);
  top.querySelector('.layout-card-remove').addEventListener('click',ev=>{ev.stopPropagation();toggleLayoutEmployee(id)});
  const grip=top.querySelector('.layout-card-grip');
  grip.addEventListener('pointerdown',ev=>startLayoutPointerDrag(ev,card,board));
 });
}
function startLayoutPointerDrag(ev,card,board){
 if(ev.button!==undefined&&ev.button!==0)return;
 ev.preventDefault();ev.stopPropagation();
 const grip=ev.currentTarget;
 layoutDraggingCard=card;layoutDragPointerId=ev.pointerId;layoutDragStartX=ev.clientX;layoutDragStartY=ev.clientY;layoutDragMoved=false;
 let dropTarget=null,dropAfter=false;
 card.classList.add('layout-card-dragging');
 document.body.classList.add('layout-pointer-dragging');
 try{grip.setPointerCapture(ev.pointerId);}catch(_){ }
 const clearMarkers=()=>board.querySelectorAll('.employee-card').forEach(c=>c.classList.remove('layout-drop-before','layout-drop-after'));
 const move=e=>{
  if(layoutDragPointerId!==null&&e.pointerId!==layoutDragPointerId)return;
  e.preventDefault();
  if(Math.hypot(e.clientX-layoutDragStartX,e.clientY-layoutDragStartY)>4)layoutDragMoved=true;
  if(!layoutDragMoved)return;
  const cards=[...board.querySelectorAll('.employee-card[data-employee-id]')].filter(c=>c!==card);
  if(!cards.length)return;
  let target=null,best=Infinity;
  for(const c of cards){
   const r=c.getBoundingClientRect();
   const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
   const d=dx*dx+dy*dy;
   if(d<best){best=d;target=c;}
  }
  if(!target)return;
  const tr=target.getBoundingClientRect();
  const sameRow=Math.abs(e.clientY-(tr.top+tr.height/2))<=Math.max(28,tr.height*.42);
  const after=sameRow ? e.clientX>(tr.left+tr.width/2) : e.clientY>(tr.top+tr.height/2);
  clearMarkers();
  target.classList.add(after?'layout-drop-after':'layout-drop-before');
  dropTarget=target;dropAfter=after;
 };
 const finish=e=>{
  if(layoutDragPointerId!==null&&e.pointerId!==layoutDragPointerId)return;
  document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',finish,true);document.removeEventListener('pointercancel',finish,true);
  try{if(grip.hasPointerCapture?.(layoutDragPointerId))grip.releasePointerCapture(layoutDragPointerId);}catch(_){ }
  clearMarkers();
  card.classList.remove('layout-card-dragging');document.body.classList.remove('layout-pointer-dragging');
  if(layoutDragMoved&&dropTarget){
   const ref=dropAfter?dropTarget.nextElementSibling:dropTarget;
   if(ref)board.insertBefore(card,ref);else board.appendChild(card);
   syncOrderFromBoard();
   showToast('並び順を変更しました。保存で確定します。');
  }
  layoutDraggingCard=null;layoutDragPointerId=null;
 };
 document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);
}
function syncOrderFromBoard(){
 const visibleOrder=[...document.querySelectorAll('#board .employee-card[data-employee-id]')].map(c=>String(c.dataset.employeeId));
 const rest=(data.settings.employeeOrder||[]).map(String).filter(id=>!visibleOrder.includes(id));
 data.settings.employeeOrder=[...visibleOrder,...rest];
}
function openLayoutEditor(){
 if(currentView!=='board'){currentView='board';render();}
 layoutEditSnapshot=JSON.parse(JSON.stringify(data.settings));layoutEditMode=true;
 document.body.classList.add('layout-editor-open');
 $('#layoutEditor').classList.add('open');$('#layoutEditor').setAttribute('aria-hidden','false');$('#layoutEditorBackdrop').hidden=false;
 const deps=[...new Set(data.employees.map(e=>e.department).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
 $('#layoutDepartmentFilter').innerHTML='<option value="">すべての部署</option>'+deps.map(x=>`<option>${esc(x)}</option>`).join('');
 $('#layoutBoardColumns').value=String(data.settings.boardColumns||'auto');
 render();renderLayoutMemberList();
}
function closeLayoutEditor(saveChanges=false){
 if(!saveChanges&&layoutEditSnapshot)data.settings=layoutEditSnapshot;
 if(saveChanges){syncOrderFromBoard();data.settings.boardColumns=$('#layoutBoardColumns').value||'auto';save();showToast('この端末のレイアウトを保存しました。');}
 layoutEditMode=false;layoutEditSnapshot=null;document.body.classList.remove('layout-editor-open');$('#layoutEditor').classList.remove('open');$('#layoutEditor').setAttribute('aria-hidden','true');$('#layoutEditorBackdrop').hidden=true;render();
}
function openProfile(){openLayoutEditor();}
$('#profileBtn').addEventListener('click',openProfile);
$('#closeLayoutEditorBtn')?.addEventListener('click',()=>closeLayoutEditor(false));
$('#cancelLayoutEditorBtn')?.addEventListener('click',()=>closeLayoutEditor(false));
$('#saveLayoutEditorBtn')?.addEventListener('click',()=>closeLayoutEditor(true));
$('#layoutEditorBackdrop')?.addEventListener('click',()=>closeLayoutEditor(false));
$('#layoutMemberSearch')?.addEventListener('input',renderLayoutMemberList);
$('#layoutDepartmentFilter')?.addEventListener('change',renderLayoutMemberList);
$('#layoutBoardColumns')?.addEventListener('change',ev=>{data.settings.boardColumns=ev.target.value||'auto';render();});
// 旧ダイアログの保存処理は互換用
$('#saveProfileBtn')?.addEventListener('click',ev=>{ev.preventDefault();data.settings.currentUserId=$('#currentUserSelect')?.value||data.settings.currentUserId;data.settings.boardColumns=$('#boardColumns')?.value||data.settings.boardColumns||'auto';data.settings.pinSelfFirst=$('#pinSelfFirst')?.checked!==false;save();$('#profileDialog')?.close();render();showToast('表示設定を保存しました。');});
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
function switchAdminView(view){
 document.querySelectorAll('.admin-tab').forEach(b=>b.classList.toggle('active',b.dataset.adminView===view));$('#statusAdminPanel').hidden=view!=='status';$('#employeeAdminPanel').hidden=view!=='employee';$('#departmentAdminPanel').hidden=view!=='department';$('#jobAdminPanel').hidden=view!=='job';if(view==='employee')refreshEmployeeAdmin();else if(view==='department')renderMasterAdmin('department');else if(view==='job')renderMasterAdmin('job');else renderStatusMaster();
}
function openAdmin(){switchAdminView('status');$('#adminDialog').showModal()}
$('#adminBtn').addEventListener('click',openAdmin);$('#addStatusBtn').addEventListener('click',()=>openStatusEdit());document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>switchAdminView(b.dataset.adminView)));
function openStatusEdit(id=''){const s=data.statuses.find(x=>x.id===id);$('#statusEditId').value=id;$('#statusEditTitle').textContent=s?'状態を編集':'状態を追加';$('#statusEditName').value=s?.name||'';$('#statusEditColor').value=s?.color||'#31b57b';$('#statusEditOrder').value=s?.order||data.statuses.length+1;$('#statusEditActive').checked=s?.active!==false;$('#statusEditUseReturn').checked=s?.useReturn!==false;$('#statusEditUseDestination').checked=s?.useDestination!==false;$('#statusEditDefaultDestination').value=s?.defaultDestination||'';$('#statusEditDialog').showModal()}
$('#saveStatusBtn').addEventListener('click',ev=>{ev.preventDefault();const id=$('#statusEditId').value,name=$('#statusEditName').value.trim();if(!name)return alert('状態名を入力してください。');const dup=data.statuses.find(s=>s.name===name&&s.id!==id);if(dup)return alert('同じ状態名がすでにあります。');const existing=data.statuses.find(s=>s.id===id),oldName=existing?.name;const obj={id:existing?.id||crypto.randomUUID(),name,color:$('#statusEditColor').value,active:$('#statusEditActive').checked,order:Number($('#statusEditOrder').value)||data.statuses.length+1,useReturn:$('#statusEditUseReturn').checked,useDestination:$('#statusEditUseDestination').checked,defaultDestination:$('#statusEditDefaultDestination').value.trim()};if(existing){Object.assign(existing,obj);if(oldName!==name){data.employees.forEach(e=>{if(e.status===oldName)e.status=name});data.schedules.forEach(s=>{if(s.status===oldName)s.status=name})}}else data.statuses.push(obj);normalizeStatusOrder();pushHistory('status-master',null,{action:existing?'編集':'追加',detail:existing?`${oldName} → ${name}`:`${name} を追加`});save();$('#statusEditDialog').close();renderStatusMaster();render()});
function normalizeStatusOrder(){sortedStatuses(true).forEach((s,i)=>s.order=i+1)}
function moveStatus(id,delta){const rows=sortedStatuses(true),i=rows.findIndex(s=>s.id===id),j=i+delta;if(i<0||j<0||j>=rows.length)return;[rows[i].order,rows[j].order]=[rows[j].order,rows[i].order];normalizeStatusOrder();save();renderStatusMaster();render()}
function toggleStatus(id){const s=data.statuses.find(x=>x.id===id);if(!s)return;if(s.active&&data.statuses.filter(x=>x.active).length<=1)return alert('使用中の状態を0件にはできません。');s.active=!s.active;pushHistory('status-master',null,{action:s.active?'再開':'停止',detail:`${s.name} を${s.active?'再開':'停止'}`});save();renderStatusMaster();render()}
function deleteStatus(id){const s=data.statuses.find(x=>x.id===id);if(!s)return;const usedNow=data.employees.some(e=>e.status===s.name),usedSchedule=data.schedules.some(x=>x.status===s.name);if(usedNow||usedSchedule)return alert(`「${s.name}」は社員の現在状態または予定で使用中のため削除できません。先に別の状態へ変更するか、「停止」を使ってください。`);if(!confirm(`「${s.name}」を完全に削除しますか？\n過去履歴の文字は残ります。`))return;data.statuses=data.statuses.filter(x=>x.id!==id);normalizeStatusOrder();pushHistory('status-master',null,{action:'削除',detail:`${s.name} を削除`});save();renderStatusMaster();render()}
function autoSwitch(){if(remoteMode)return;const now=new Date();let changed=false;const sorted=[...data.schedules].sort((a,b)=>a.startAt.localeCompare(b.startAt));sorted.forEach(s=>{const e=data.employees.find(x=>x.id===s.employeeId);if(!e)return;const start=new Date(s.startAt),end=new Date(s.endAt);if(!s.startDone&&start<=now){s.beforeSnapshot={status:e.status,destination:e.destination,purpose:e.purpose,returnTime:e.returnTime,phone:e.phone,direct:e.direct,goHome:e.goHome,memo:e.memo};const before=e.status,sm=statusByName(s.status);Object.assign(e,{status:s.status,destination:sm.useDestination===false?'':s.destination,purpose:sm.useDestination===false?'':s.purpose,returnTime:sm.useReturn?s.endAt.slice(11,16):'',phone:s.phone,direct:s.direct,goHome:s.goHome,memo:s.memo});s.startDone=true;pushHistory('auto-start',e,{before,after:e.status,destination:e.destination,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});changed=true}if(s.startDone&&!s.endDone&&end<=now){const newer=sorted.find(x=>x.employeeId===s.employeeId&&x.id!==s.id&&new Date(x.startAt)<=now&&now<new Date(x.endAt));const before=e.status;if(!newer){if(s.goHome){Object.assign(e,{status:'外出',returnTime:'',goHome:true})}else if(s.after==='previous'&&s.beforeSnapshot){Object.assign(e,s.beforeSnapshot)}else{const present=statusByName('在席').name==='在席'?'在席':activeStatusNames()[0];const psm=statusByName(present);Object.assign(e,{status:present,destination:psm.defaultDestination||'',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''})}}s.endDone=true;pushHistory('auto-end',e,{before,after:e.status,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});changed=true}});if(changed){save();render()}}

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

['searchInput','departmentFilter','occupationFilter','statusFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchInput'?'input':'change',render));document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>{currentView=b.dataset.view;render()}));$('#monitorBtn').addEventListener('click',enterMonitorMode);
$('#exitMonitorBtn').addEventListener('click',exitMonitorMode);
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&document.body.classList.contains('monitor'))exitMonitorMode()});
setInterval(autoSwitch,15000);
bootAuth();
