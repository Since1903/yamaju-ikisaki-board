const KEY='yamaju-board-v2';
const STATUSES=['在席','外出','会議','現場','出張','休み'];
const DEFAULT_COLORS={在席:'#bfe7c9',外出:'#31b57b',会議:'#d8c3f2',現場:'#9fc7f2',出張:'#f4c58d',休み:'#9edff0'};
const seed={
 employees:[
  {id:'e1',name:'渡邊 琉騎',department:'企画課',occupation:'事務職',role:'',status:'在席',destination:'本社',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''},
  {id:'e2',name:'山田 太郎',department:'営業部',occupation:'営業職',role:'',status:'外出',destination:'YKK AP',purpose:'打合せ',returnTime:'15:30',phone:'later',direct:false,goHome:false,memo:''},
  {id:'e3',name:'佐藤 花子',department:'管理部',occupation:'事務職',role:'',status:'会議',destination:'第2会議室',purpose:'社内会議',returnTime:'16:00',phone:'ng',direct:false,goHome:false,memo:''},
  {id:'e4',name:'田中 一郎',department:'工務',occupation:'現場職',role:'',status:'現場',destination:'○○マンション',purpose:'現調',returnTime:'17:00',phone:'later',direct:true,goHome:true,memo:''},
  {id:'e5',name:'山十 武',department:'住宅営業部',occupation:'営業職',role:'',status:'在席',destination:'本社',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''}
 ],
 history:[],schedules:[],
 settings:{currentUserId:'e1',visibleEmployeeIds:['e1','e2','e3','e4','e5'],statusColors:{...DEFAULT_COLORS}}
};
let data=load(); let currentView='board';
const $=s=>document.querySelector(s);
function migrate(v){
 if(!v||!Array.isArray(v.employees)) return structuredClone(seed);
 v.settings ||= structuredClone(seed.settings); v.settings.statusColors={...DEFAULT_COLORS,...(v.settings.statusColors||{})};
 v.settings.visibleEmployeeIds ||= v.employees.map(e=>e.id); v.settings.currentUserId ||= v.employees[0]?.id||'';
 v.history ||= []; v.schedules ||= [];
 v.employees.forEach(e=>{e.occupation ||= 'その他';if((e.status==='在席'||e.status==='休み'||e.goHome)&&e.returnTime==='00:00')e.returnTime='';});
 v.schedules.forEach(s=>{if(s.at&&!s.startAt)s.startAt=s.at;if(!('startDone' in s))s.startDone=!!s.done;if(!('endDone' in s))s.endDone=false;});
 return v;
}
function load(){try{return migrate(JSON.parse(localStorage.getItem(KEY))||structuredClone(seed))}catch{return structuredClone(seed)}}
function save(){localStorage.setItem(KEY,JSON.stringify(data))}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function phoneText(v){return v==='ng'?'対応不可':v==='later'?'折返し':'対応可'}
function uniq(field){return [...new Set(data.employees.map(e=>e[field]).filter(Boolean))].sort()}
function dateFmt(v){return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}
function timeRange(s){return `${dateFmt(s.startAt)} ～ ${s.endAt?new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(new Date(s.endAt)):'終了なし'}`}
function contrast(hex){const h=hex.replace('#','');const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return (r*299+g*587+b*114)/1000>150?'#142018':'#fff'}
function pushHistory(type,e,extra={}){data.history.push({id:crypto.randomUUID(),at:new Date().toISOString(),type,employeeId:e?.id||'',name:e?.name||'',...extra})}
function renderFilters(){
 const d=$('#departmentFilter'),dp=d.value; d.innerHTML='<option value="">すべての部署</option>'+uniq('department').map(x=>`<option>${esc(x)}</option>`).join(''); d.value=dp;
 const o=$('#occupationFilter'),op=o.value; o.innerHTML='<option value="">すべての職種</option>'+uniq('occupation').map(x=>`<option>${esc(x)}</option>`).join(''); o.value=op;
 $('#scheduleEmployee').innerHTML=data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}（${esc(e.department)} / ${esc(e.occupation)}）</option>`).join('');
}
function orderedVisibleEmployees(){
 const ids=new Set(data.settings.visibleEmployeeIds||data.employees.map(e=>e.id)); let list=data.employees.filter(e=>ids.has(e.id));
 const me=data.settings.currentUserId; list.sort((a,b)=>a.id===me?-1:b.id===me?1:0); return list;
}
function render(){renderFilters();document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));const board=$('#board');if(currentView==='history')return renderHistory(board);if(currentView==='schedule')return renderSchedules(board);renderBoard(board)}
function renderBoard(board){
 const q=$('#searchInput').value.trim().toLowerCase(),dep=$('#departmentFilter').value,occ=$('#occupationFilter').value,st=$('#statusFilter').value;
 const base=orderedVisibleEmployees();
 const list=base.filter(e=>(!q||`${e.name} ${e.destination} ${e.purpose}`.toLowerCase().includes(q))&&(!dep||e.department===dep)&&(!occ||e.occupation===occ)&&(!st||e.status===st));
 board.className='board';board.innerHTML='';const t=$('#employeeCardTemplate');
 list.forEach(e=>{const n=t.content.cloneNode(true),card=n.querySelector('.employee-card');const bg=data.settings.statusColors[e.status]||DEFAULT_COLORS[e.status]||'#fff';const fg=contrast(bg);card.style.setProperty('--status-bg',bg);card.style.setProperty('--card-text',fg);card.style.backgroundColor=bg;card.style.color=fg;n.querySelector('.employee-name').textContent=e.name;n.querySelector('.employee-meta').textContent=[e.department,e.occupation,e.role].filter(Boolean).join(' / ');n.querySelector('.status-pill').textContent=e.status;n.querySelector('.destination').textContent=e.status==='休み'?'―':(e.destination||'―');n.querySelector('.purpose').textContent=e.status==='休み'?'休み':(e.purpose||' ');const shownReturn=(e.status==='休み'||e.status==='在席'||e.goHome||!e.returnTime||e.returnTime==='00:00')?'―':e.returnTime;n.querySelector('.return-time').textContent=shownReturn;n.querySelector('.phone-status').textContent=phoneText(e.phone);const tags=n.querySelector('.tag-row');if(e.id===data.settings.currentUserId)tags.innerHTML+='<span class="tag">自分</span>';if(e.direct)tags.innerHTML+='<span class="tag">直行</span>';if(e.goHome)tags.innerHTML+='<span class="tag">直帰</span>';if(e.memo)tags.innerHTML+=`<span class="tag">${esc(e.memo)}</span>`;n.querySelector('.change-btn').addEventListener('click',()=>openEdit(e.id));board.appendChild(n)});
 $('#summary').textContent=`表示 ${list.length}名 / 登録${data.employees.length}名`;if(!list.length)board.innerHTML='<div class="empty card">該当する社員がいません</div>';
}
function renderHistory(board){
 board.className='history-list';const rows=[...data.history].reverse();
 board.innerHTML=rows.length?rows.map(h=>{let title='',body='';if(h.type==='schedule-create'){title=`${esc(h.name)}：予定登録`;body=`${esc(h.status)}｜${esc(h.destination||'―')}｜${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else if(h.type==='schedule-delete'){title=`${esc(h.name)}：予定削除`;body=`${esc(h.status)}｜${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else if(h.type==='auto-start'){title=`${esc(h.name)}：自動開始 ${esc(h.before)} → ${esc(h.after)}`;body=`${esc(h.destination||'―')}｜予定 ${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else if(h.type==='auto-end'){title=`${esc(h.name)}：自動終了 ${esc(h.before)} → ${esc(h.after)}`;body=`予定 ${esc(h.startLabel||'')} ～ ${esc(h.endLabel||'')}`;}else{title=`${esc(h.name)}：${esc(h.before||'')} → ${esc(h.after||'')}`;body=`${esc(h.destination||'―')} <span class="tag">手動</span>`}return `<article class="list-item card"><div class="list-row"><strong>${title}</strong><span class="list-muted">操作 ${dateFmt(h.at)}</span></div><div style="margin-top:7px">${body}</div></article>`}).join(''):'<div class="empty card">まだ履歴はありません</div>';
 $('#summary').textContent=`履歴 ${rows.length}件`;
}
function renderSchedules(board){
 board.className='schedule-list';const rows=[...data.schedules].sort((a,b)=>a.startAt.localeCompare(b.startAt));
 board.innerHTML='<button id="newScheduleInline" class="primary">＋ 予定を登録</button>'+ (rows.length?rows.map(s=>{const e=data.employees.find(x=>x.id===s.employeeId);return `<article class="list-item card"><div class="list-row"><strong>${esc(e?.name||'不明')}：${esc(s.status)}</strong><span class="list-muted">${s.startDone?(s.endDone?'完了':'実行中'):'予定'}</span></div><div class="schedule-details"><div><b>時間</b><br>${esc(timeRange(s))}</div><div><b>行先</b><br>${esc(s.destination||'―')}</div><div><b>用件</b><br>${esc(s.purpose||'―')}</div></div><div class="schedule-actions"><button class="small-btn secondary edit-schedule" data-id="${s.id}">編集</button><button class="small-btn danger delete-schedule" data-id="${s.id}">削除</button></div></article>`}).join(''):'<div class="empty card">自動切換え予定はありません</div>');
 $('#summary').textContent=`予定 ${rows.length}件`;setTimeout(()=>{ $('#newScheduleInline')?.addEventListener('click',()=>openSchedule());document.querySelectorAll('.edit-schedule').forEach(b=>b.addEventListener('click',()=>openSchedule(b.dataset.id)));document.querySelectorAll('.delete-schedule').forEach(b=>b.addEventListener('click',()=>deleteSchedule(b.dataset.id)));},0);
}
function applyEditRules(){const st=$('#editStatus').value;if(st==='在席'){if(!$('#editDestination').value.trim())$('#editDestination').value='本社';$('#editReturn').value=''}if(st==='休み'){$('#editDestination').value='';$('#editPurpose').value='';$('#editReturn').value='';$('#editPhone').value='ng'}if($('#editGoHome').checked)$('#editReturn').value=''}
function openEdit(id){const e=data.employees.find(x=>x.id===id);$('#editEmployeeId').value=id;$('#editTitle').textContent=e.name;$('#editStatus').value=e.status;$('#editDestination').value=e.destination;$('#editPurpose').value=e.purpose;$('#editReturn').value=e.returnTime;$('#editPhone').value=e.phone;$('#editDirect').checked=e.direct;$('#editGoHome').checked=e.goHome;$('#editMemo').value=e.memo||'';$('#editDialog').showModal()}
$('#editStatus').addEventListener('change',applyEditRules);$('#editGoHome').addEventListener('change',applyEditRules);
$('#saveEditBtn').addEventListener('click',ev=>{ev.preventDefault();applyEditRules();const id=$('#editEmployeeId').value,e=data.employees.find(x=>x.id===id);const before=e.status;Object.assign(e,{status:$('#editStatus').value,destination:$('#editDestination').value.trim(),purpose:$('#editPurpose').value.trim(),returnTime:$('#editReturn').value,phone:$('#editPhone').value,direct:$('#editDirect').checked,goHome:$('#editGoHome').checked,memo:$('#editMemo').value.trim()});pushHistory('manual',e,{before,after:e.status,destination:e.destination});save();$('#editDialog').close();render()});
function openSchedule(id=''){
 const s=data.schedules.find(x=>x.id===id);$('#scheduleId').value=id;const d=new Date();$('#scheduleDate').value=s?.startAt?.slice(0,10)||d.toISOString().slice(0,10);$('#scheduleStart').value=s?.startAt?.slice(11,16)||'09:00';$('#scheduleEnd').value=s?.endAt?.slice(11,16)||'10:00';$('#scheduleEmployee').value=s?.employeeId||data.settings.currentUserId||data.employees[0]?.id;$('#scheduleStatus').value=s?.status||'外出';$('#scheduleDestination').value=s?.destination||'';$('#schedulePurpose').value=s?.purpose||'';$('#schedulePhone').value=s?.phone||'later';$('#scheduleAfter').value=s?.after||'present';$('#scheduleDirect').checked=!!s?.direct;$('#scheduleGoHome').checked=!!s?.goHome;$('#scheduleMemo').value=s?.memo||'';$('#scheduleDialog').showModal();
}
$('#saveScheduleBtn').addEventListener('click',ev=>{ev.preventDefault();const date=$('#scheduleDate').value,start=$('#scheduleStart').value,end=$('#scheduleEnd').value;if(!date||!start||!end)return alert('開始・終了時刻を入力してください。');if(end<=start)return alert('終了時刻は開始時刻より後にしてください。');const existing=data.schedules.find(x=>x.id===$('#scheduleId').value);const obj={id:existing?.id||crypto.randomUUID(),employeeId:$('#scheduleEmployee').value,startAt:`${date}T${start}:00`,endAt:`${date}T${end}:00`,status:$('#scheduleStatus').value,destination:$('#scheduleDestination').value.trim(),purpose:$('#schedulePurpose').value.trim(),phone:$('#schedulePhone').value,after:$('#scheduleAfter').value,direct:$('#scheduleDirect').checked,goHome:$('#scheduleGoHome').checked,memo:$('#scheduleMemo').value.trim(),startDone:existing?.startDone||false,endDone:existing?.endDone||false,beforeSnapshot:existing?.beforeSnapshot||null};if(existing)Object.assign(existing,obj);else data.schedules.push(obj);const e=data.employees.find(x=>x.id===obj.employeeId);pushHistory('schedule-create',e,{status:obj.status,destination:obj.destination,startLabel:dateFmt(obj.startAt),endLabel:dateFmt(obj.endAt)});save();$('#scheduleDialog').close();render()});
function deleteSchedule(id){const s=data.schedules.find(x=>x.id===id);if(!s||!confirm('この予定を削除しますか？'))return;const e=data.employees.find(x=>x.id===s.employeeId);pushHistory('schedule-delete',e,{status:s.status,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});data.schedules=data.schedules.filter(x=>x.id!==id);save();render()}
$('#addEmployeeBtn').addEventListener('click',()=>$('#employeeDialog').showModal());
$('#saveEmployeeBtn').addEventListener('click',ev=>{ev.preventDefault();const name=$('#newName').value.trim(),department=$('#newDepartment').value.trim();if(!name||!department)return;const e={id:crypto.randomUUID(),name,department,occupation:$('#newOccupation').value,role:$('#newRole').value.trim(),status:'在席',destination:'本社',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''};data.employees.push(e);data.settings.visibleEmployeeIds.push(e.id);save();$('#employeeDialog').close();$('#employeeForm').reset();render()});
function openProfile(){
 $('#currentUserSelect').innerHTML=data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}（${esc(e.department)}）</option>`).join('');$('#currentUserSelect').value=data.settings.currentUserId;
 const vis=new Set(data.settings.visibleEmployeeIds);$('#visibleEmployees').innerHTML=data.employees.map(e=>`<label><input type="checkbox" value="${e.id}" ${vis.has(e.id)?'checked':''}> ${esc(e.name)} <small>${esc(e.department)}</small></label>`).join('');
 $('#statusColors').innerHTML=STATUSES.map(s=>`<div class="color-item"><span>${s}</span><input type="color" data-status="${s}" value="${data.settings.statusColors[s]||DEFAULT_COLORS[s]}"></div>`).join('');$('#profileDialog').showModal();
}
$('#profileBtn').addEventListener('click',openProfile);
$('#saveProfileBtn').addEventListener('click',ev=>{ev.preventDefault();data.settings.currentUserId=$('#currentUserSelect').value;const checked=[...document.querySelectorAll('#visibleEmployees input:checked')].map(x=>x.value);if(!checked.includes(data.settings.currentUserId))checked.unshift(data.settings.currentUserId);data.settings.visibleEmployeeIds=checked;document.querySelectorAll('#statusColors input[type=color]').forEach(i=>data.settings.statusColors[i.dataset.status]=i.value);save();$('#profileDialog').close();render()});
function autoSwitch(){
 const now=new Date();let changed=false;const sorted=[...data.schedules].sort((a,b)=>a.startAt.localeCompare(b.startAt));
 sorted.forEach(s=>{const e=data.employees.find(x=>x.id===s.employeeId);if(!e)return;const start=new Date(s.startAt),end=new Date(s.endAt);
  if(!s.startDone&&start<=now){s.beforeSnapshot={status:e.status,destination:e.destination,purpose:e.purpose,returnTime:e.returnTime,phone:e.phone,direct:e.direct,goHome:e.goHome,memo:e.memo};const before=e.status;Object.assign(e,{status:s.status,destination:s.destination,purpose:s.purpose,returnTime:s.endAt.slice(11,16),phone:s.phone,direct:s.direct,goHome:s.goHome,memo:s.memo});s.startDone=true;pushHistory('auto-start',e,{before,after:e.status,destination:e.destination,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});changed=true;}
  if(s.startDone&&!s.endDone&&end<=now){const newer=sorted.find(x=>x.employeeId===s.employeeId&&x.id!==s.id&&new Date(x.startAt)<=now&&now<new Date(x.endAt));const before=e.status;if(!newer){if(s.goHome){Object.assign(e,{status:'外出',returnTime:'',goHome:true});}else if(s.after==='previous'&&s.beforeSnapshot){Object.assign(e,s.beforeSnapshot);}else{Object.assign(e,{status:'在席',destination:'本社',purpose:'',returnTime:'',phone:'ok',direct:false,goHome:false,memo:''});}}s.endDone=true;pushHistory('auto-end',e,{before,after:e.status,startLabel:dateFmt(s.startAt),endLabel:dateFmt(s.endAt)});changed=true;}
 });
 if(changed){save();render()}
}
['searchInput','departmentFilter','occupationFilter','statusFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchInput'?'input':'change',render));
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>{currentView=b.dataset.view;render()}));
$('#monitorBtn').addEventListener('click',()=>document.body.classList.toggle('monitor'));
setInterval(autoSwitch,15000);autoSwitch();render();
