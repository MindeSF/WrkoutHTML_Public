(function(){
'use strict';
const app=document.getElementById('app');
const LS='workoutlog_v1';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clone=o=>JSON.parse(JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fmtDate=ms=>new Date(ms).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
const fmtShort=ms=>new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const fmtRest=s=>{s=Math.max(0,s|0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const num=v=>{const x=parseFloat(String(v==null?'':v).replace(',','.'));return isFinite(x)?x:0};
const fmtNum=(v,d)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d==null?1:d});
function fmtBig(v){v=Math.round(v);if(v>=1e6)return fmtNum(v/1e6,2)+'M';if(v>=1e4)return fmtNum(v/1e3,1)+'k';return fmtNum(v,0)}
function safeUrl(u){u=String(u||'').trim();if(!u)return'';if(!/^https?:\/\//i.test(u))u='https://'+u;try{const x=new URL(u);return(x.protocol==='https:'||x.protocol==='http:')&&x.hostname.includes('.')?x.href:''}catch(e){return''}}

/* ---------- data model ----------
 program: {v:2, unit, length, days:[{id,name}], lib:{id:{id,name,video,notes,subs}}, cycle:{num,week}, cycles:{num:{end,done}}}
 weeks:   {n:{n, days:{dayId:[slot]}}}   slot: {sid, exId, warmup, sets, reps, rirs[], rest}
 sessions:{id:{id,cycle,week,dayId,dayName,date,finished,note,items[]}}
*/
let S={program:defProgram(),weeks:{},sessions:{},templates:{}};
const DEFAULT_TEMPLATE='Min Max Phase 2';
function normTemplates(m){const o={};if(m&&typeof m==='object')for(const k in m){const t=m[k];if(!t||!t.program)continue;const id=String(t.id||k);
  const np=normProgram(t.program);o[id]={id,name:String(t.name||'Template').slice(0,60),created:+t.created||Date.now(),program:{days:np.days,lib:np.lib,length:np.length,unit:np.unit,starts:np.starts,incs:np.incs,incDefaults:np.incDefaults},weeks:normWeeks(t.weeks)}}return o}
function snapshotTemplate(name,id){const p=S.program;return{id:id||('t'+nid()),name:String(name).trim().slice(0,60),created:Date.now(),program:clone({days:p.days,lib:p.lib,length:p.length,unit:p.unit,starts:p.starts||{},incs:p.incs||{},incDefaults:p.incDefaults||INC_DEF}),weeks:clone(S.weeks)}}
const tplByName=n=>Object.values(S.templates).find(t=>norm(t.name)===norm(n));
function loadTemplate(t){
  const p=S.program,src=clone(t);
  const oldLib=clone(p.lib);Object.assign(p.lib,src.program.lib);keepVideos(oldLib);
  p.days=src.program.days;p.length=src.program.length;p.unit=src.program.unit;p.starts=Object.assign({},p.starts||{},src.program.starts||{});if(src.program.incs)p.incs=Object.assign({},p.incs||{},src.program.incs);if(src.program.incDefaults)p.incDefaults=Object.assign({},src.program.incDefaults);p.cycle.week=clamp(p.cycle.week,1,p.length);
  S.weeks=src.weeks;saveProgram(0);saveWeeks(Object.keys(S.weeks).map(Number));
}
function defProgram(){return{v:2,unit:'kg',length:12,days:[],lib:{},cycle:{num:1,week:1},cycles:{}}}
const RATE=['Not rated','Too easy','Easy','Just right','Hard','Too difficult'];
const perfName=it=>it.swap||it.name;
const normSets=a=>(Array.isArray(a)?a:[]).filter(Boolean).slice(0,20).map(z=>({w:String(z.w==null?'':z.w).slice(0,12),r:String(z.r==null?'':z.r).slice(0,12),done:!!z.done}));
const normRirs=a=>(Array.isArray(a)?a:[]).slice(0,12).map(v=>String(v==null?'':v).trim().slice(0,10));
function normSubs(a){return(Array.isArray(a)?a:[]).filter(z=>z&&String(z.name||'').trim()).slice(0,10).map(z=>({name:String(z.name).trim().slice(0,80),video:String(z.video||'').slice(0,600),notes:String(z.notes||'').slice(0,2000)}))}
function warmCount(t){const n=String(t||'').match(/\d+/g);return n?Math.min(5,Math.max(...n.map(Number))):0}
function normLib(x){return{id:String(x.id),name:String(x.name||'Exercise').slice(0,80),video:String(x.video||'').slice(0,600),notes:String(x.notes||'').slice(0,2000),subs:normSubs(x.subs)}}
function normSlot(x){const sets=clamp(parseInt(x.sets)||3,1,12);return{sid:String(x.sid||('q'+nid())),exId:String(x.exId||''),warmup:String(x.warmup==null?'':x.warmup).slice(0,10),sets,reps:String(x.reps||'').slice(0,20),rirs:normRirs(x.rirs).slice(0,sets),rest:clamp(parseInt(x.rest)||0,0,900),ss:String(x.ss||'').trim().slice(0,10),tech:String(x.tech||'').trim().slice(0,60)}}
function normWeek(w,n){const o={n:+n,days:{}};if(w&&w.days&&typeof w.days==='object'){for(const k in w.days){if(Array.isArray(w.days[k]))o.days[k]=w.days[k].filter(x=>x&&x.exId).slice(0,30).map(normSlot)}}return o}
function normWeeks(m){const o={};if(m&&typeof m==='object'){for(const k in m){const n=parseInt(k);if(n>0&&n<=52)o[n]=normWeek(m[k],n)}}return o}
const weekHas=w=>!!(w&&Object.values(w.days).some(a=>a.length));
function isLegacy(p){return!!(p&&typeof p==='object'&&!p.lib&&Array.isArray(p.days)&&p.days.some(d=>d&&Array.isArray(d.exercises)))}
function normProgram(p){
  p=(p&&typeof p==='object')?clone(p):{};
  const len=clamp(parseInt(p.length)||12,1,52);
  const lib={};if(p.lib&&typeof p.lib==='object')for(const k in p.lib){const x=p.lib[k];if(x&&x.id)lib[String(x.id)]=normLib(x)}
  const cyc=p.cycle||{};const cycles={};
  if(p.cycles&&typeof p.cycles==='object')for(const k in p.cycles){const c=p.cycles[k];if(c&&parseInt(k)>0)cycles[parseInt(k)]={end:+c.end||0,done:!!c.done,week:parseInt(c.week)||0}}
  return{v:2,unit:p.unit==='lb'?'lb':'kg',length:len,starts:normStarts(p.starts),incs:normIncs(p.incs),incDefaults:normIncDefaults(p.incDefaults),
    days:(Array.isArray(p.days)?p.days:[]).filter(d=>d&&d.id).map(d=>({id:String(d.id),name:String(d.name||'Day').slice(0,40)})),
    lib,cycle:{num:Math.max(1,parseInt(cyc.num)||1),week:clamp(parseInt(cyc.week)||1,1,len)},cycles};
}
// Version 1 kept one list of exercises per day. Copy it into every week of a 12-week plan.
function migrateLegacy(p){
  const prog=normProgram({unit:p.unit,length:12,days:p.days.map(d=>({id:d.id,name:d.name})),cycle:{num:1,week:p.week}});
  const base={};
  p.days.forEach(d=>{base[d.id]=(d.exercises||[]).filter(x=>x&&x.id).map(x=>{
    prog.lib[x.id]=normLib(x);
    const sets=parseInt(x.sets)||3;
    const rirs=normRirs(x.rirs).some(Boolean)?x.rirs:(x.rir?Array.from({length:sets},()=>x.rir):[]);
    return normSlot({sid:'q'+x.id,exId:x.id,warmup:x.warmup,sets,reps:x.reps,rirs,rest:x.rest});
  })});
  const weeks={};for(let n=1;n<=12;n++)weeks[n]={n,days:clone(base)};
  return{program:prog,weeks};
}
function normSession(x,id){
  if(!x||typeof x!=='object')return null;
  const s={id:String(id||x.id||('s'+nid())),cycle:Math.max(1,parseInt(x.cycle)||1),week:Math.max(1,parseInt(x.week)||1),dayId:String(x.dayId||''),dayName:String(x.dayName||'Workout'),date:+x.date||Date.now(),finished:!!x.finished,note:String(x.note||'').slice(0,3000),items:[]};
  if(Array.isArray(x.items))s.items=x.items.filter(Boolean).slice(0,40).map(it=>({exId:String(it.exId||''),sid:String(it.sid||''),name:String(it.name||'Exercise'),warmup:String(it.warmup||''),planSets:parseInt(it.planSets)||0,reps:String(it.reps||''),target:String(it.target||''),rest:Math.max(0,parseInt(it.rest)||0),ss:String(it.ss||'').slice(0,10),tech:String(it.tech||'').slice(0,60),video:String(it.video||''),subs:normSubs(it.subs),rirs:normRirs(it.rirs),swap:String(it.swap||'').slice(0,80),swapVideo:String(it.swapVideo||'').slice(0,600),rating:clamp(parseInt(it.rating)||0,0,5),warm:normSets(it.warm),sets:normSets(it.sets)}));
  return s;
}
function normSessions(m){const o={};if(m&&typeof m==='object'){for(const k in m){const s=normSession(m[k],m[k]&&m[k].id||k);if(s)o[s.id]=s}}return o}
function loadLocal(){try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(j&&j.program)return j}catch(e){}return null}
function saveLocal(){try{const ss={};for(const k in S.sessions)if(!S.sessions[k].draft)ss[k]=S.sessions[k];localStorage.setItem(LS,JSON.stringify(Object.assign({},S,{sessions:ss})));ghSchedule();return true}catch(e){return false}}
function applyLoaded(o){
  if(isLegacy(o.program)){const m=migrateLegacy(o.program);S.program=m.program;S.weeks=m.weeks;return true}
  S.program=normProgram(o.program);S.weeks=normWeeks(o.weeks);return false;
}

const deleted=new Set();
const uploading=new Set();
const sessList=()=>Object.values(S.sessions).filter(s=>!deleted.has(s.id)&&!s.draft).sort((a,b)=>b.date-a.date);
function touch(s){if(s&&s.draft){delete s.draft;s.date=Date.now()}}
const openSessionFor=dayId=>sessList().find(s=>s.dayId===dayId&&!s.finished);
const finishedFor=(c,w,dayId)=>sessList().find(s=>s.cycle===c&&s.week===w&&s.dayId===dayId&&s.finished);
const findDay=id=>S.program.days.find(d=>d.id===id);
const libEx=id=>S.program.lib[id]||null;
const libName=id=>{const x=libEx(id);return x?x.name:'Exercise'};
function week(n){if(!S.weeks[n])S.weeks[n]={n:+n,days:{}};return S.weeks[n]}
function daySlots(n,dayId){const w=S.weeks[n];return(w&&w.days[dayId])||[]}
function plannedDays(n){return S.program.days.filter(d=>daySlots(n,d.id).length)}
function weekProgress(c,n){const pd=plannedDays(n);return{planned:pd.length,done:pd.filter(d=>finishedFor(c,n,d.id)).length}}
// sid (the slot in the plan) is checked first, so an exercise done twice in one workout
// (e.g. a heavy set and a 20-rep set) each shows its own "last time".
function lastFor(name,excludeId,before,sid){
  const n=norm(name);
  const scan=pick=>{
    for(const s of sessList()){
      if(s.id===excludeId||(before&&s.date>=before))continue;
      const it=s.items.find(i=>pick(i)&&i.sets.some(x=>x.w||x.r));
      if(it)return{date:s.date,week:s.week,cycle:s.cycle,sets:it.sets,warm:it.warm,rating:it.rating};
    }
    return null;
  };
  // never borrow from the other slot of the same exercise in this workout (heavy set vs 20-rep set)
  const cur=S.sessions[excludeId],other=cur&&sid?cur.items.filter(x=>x.sid!==sid&&norm(perfName(x))===n).map(x=>x.sid):[];
  return(sid&&scan(i=>i.sid===sid&&norm(perfName(i))===n))||scan(i=>norm(perfName(i))===n&&!other.includes(i.sid));
}

/* ---------- storage: your Claude account when available, this phone otherwise ---------- */
let mode='loading',db=null,uid=null,progRef=null,weeksCol=null,sessCol=null,statusState='loading';
const W={};
function pending(key){const w=W[key];return!!(w&&(w.t||w.busy))}
const pendingS=id=>pending('s:'+id)||uploading.has(id);
function anyPending(except){return Object.keys(W).some(k=>k!==except&&pending(k))}
function queueWrite(key,refFn,dataFn,delay){
  const w=W[key]||(W[key]={t:null,busy:false,again:false,fn:null});
  w.fn=()=>runWrite(key,refFn,dataFn);
  clearTimeout(w.t);
  if(mode==='cloud')setStatus('saving');
  w.t=setTimeout(()=>{w.t=null;w.fn()},delay==null?700:delay);
}
async function runWrite(key,refFn,dataFn){
  const w=W[key];
  if(w.busy){w.again=true;return}
  w.busy=true;
  saveLocal();
  if(mode==='cloud'){
    const d=dataFn();
    if(d){
      try{await refFn().set(d);setStatus(anyPending(key)?'saving':'saved')}
      catch(e){
        if(e&&(e.code==='unavailable'||e.code==='resource_exhausted')){
          await sleep(900+Math.random()*1500);
          try{await refFn().set(dataFn()||d);setStatus('saved')}catch(e2){onWriteError(e2)}
        }else onWriteError(e);
      }
    }
  }else if(mode==='local'){setStatus('local')}
  w.busy=false;
  if(w.again){w.again=false;runWrite(key,refFn,dataFn)}
}
function flushAll(){for(const k in W){const w=W[k];if(w.t){clearTimeout(w.t);w.t=null;w.fn()}}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushAll()});
window.addEventListener('pagehide',flushAll);

function saveProgram(delay){queueWrite('program',()=>progRef,()=>clone(S.program),delay)}
function saveWeek(n,delay){n=+n;queueWrite('w:'+n,()=>weeksCol.doc('w'+n),()=>S.weeks[n]?clone(S.weeks[n]):null,delay)}
function saveWeeks(list){list.forEach((n,i)=>saveWeek(n,150+i*180))}
function saveSession(id,delay){if(S.sessions[id]&&S.sessions[id].draft)return;queueWrite('s:'+id,()=>sessCol.doc(id),()=>(S.sessions[id]&&!deleted.has(id))?clone(S.sessions[id]):null,delay)}
async function uploadSessions(ids){
  const items=ids.map(id=>S.sessions[id]).filter(Boolean).map(clone);
  items.forEach(s=>uploading.add(s.id));
  saveLocal();
  if(mode!=='cloud'){items.forEach(s=>uploading.delete(s.id));return}
  setStatus('saving');
  for(const s of items){
    if(deleted.has(s.id)){uploading.delete(s.id);continue}
    try{await sessCol.doc(s.id).set(s)}catch(e){onWriteError(e);break}
    uploading.delete(s.id);
  }
  items.forEach(s=>uploading.delete(s.id));
  if(mode==='cloud')setStatus(anyPending()?'saving':'saved');
}
function onWriteError(e){
  const c=e&&e.code;
  if(c==='quota_exceeded')banner('Your workout storage is full. Delete some old workouts in History so new ones can be saved to your account. Until then, changes are kept on this phone.');
  else banner("Couldn't save to your Claude account, so changes are being kept on this phone for now. Reopen the page later to sync them.");
  mode='local';setStatus('local');
}
function onStoreError(){
  if(mode!=='cloud')return;
  mode='local';setStatus('local');
  banner('Lost the connection to your saved data. Changes are being kept on this phone and will sync next time you open the page.');
}
function statusHTML(){return ghTopStatus();
  const m={loading:['busy','Loading…'],saving:['busy','Saving…'],saved:['ok','Saved'],local:['ok','Saved on phone'],offline:['warn','Not synced yet']}[statusState]||['',''];
  return'<span class="dot '+m[0]+'"></span>'+m[1];
}
function setStatus(s){statusState=s;const el=document.getElementById('status');if(el)el.innerHTML=statusHTML()}
function banner(msg){const b=document.getElementById('banner');b.textContent=msg||'';b.hidden=!msg}
let toastT=0;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600)}

async function boot(){
  const local=loadLocal();
  if(local){S.sessions=normSessions(local.sessions);S.templates=normTemplates(local.templates);if(applyLoaded(local))saveLocal()}
  render();
  mode='local';setStatus('local');
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
  setTimeout(()=>{if(ghOn()&&(GH.pending||!GH.last||Date.now()-GH.last>864e5))ghBackup(false)},3000);
  return;
  let c=null;
  for(let i=0;i<40&&!c;i++){if(window.claude&&typeof window.claude.use==='function')c=window.claude;else await sleep(100)}
  let usr=null;
  if(c){try{const r=await Promise.all([c.use('db'),c.use('user')]);db=r[0];usr=r[1]}catch(e){}}
  if(usr){try{uid=await usr.id()}catch(e){uid=null}}
  if(db&&uid){try{startCloud()}catch(e){mode='local';setStatus('local')}}
  else{mode='local';setStatus('local')}
}

function startCloud(){
  mode='cloud';setStatus('loading');
  progRef=db.doc('data/users/'+uid+'/program');
  weeksCol=progRef.collection('weeks');
  sessCol=progRef.collection('sessions');
  const ok={p:false,w:false,s:false},mig={p:false,w:false,s:false};
  const timer=setTimeout(()=>{if(!(ok.p&&ok.w&&ok.s)&&mode==='cloud'){setStatus('offline');banner("Can't reach your saved data yet. Showing what's stored on this phone; it will sync when the connection is back.")}},10000);
  const check=()=>{if(ok.p&&ok.w&&ok.s){clearTimeout(timer);if(statusState==='loading'||statusState==='offline'){banner('');setStatus(anyPending()?'saving':'saved')}}};
  progRef.onSnapshot(snap=>{
    if(!snap.metadata.fromCache)ok.p=true;
    if(!(pending('program')||snap.metadata.hasPendingWrites)){
      if(snap.exists){
        const raw=snap.data();
        if(isLegacy(raw)){
          const m=migrateLegacy(raw);S.program=m.program;
          const todo=[];for(const n in m.weeks){if(!weekHas(S.weeks[n])){S.weeks[n]=m.weeks[n];todo.push(+n)}}
          saveProgram(0);saveWeeks(todo);saveLocal();softRender();
        }else{
          const np=normProgram(raw);
          if(JSON.stringify(np)!==JSON.stringify(S.program)){S.program=np;saveLocal();softRender()}
        }
      }else if(ok.p&&!mig.p){mig.p=true;if(S.program.days.length||Object.keys(S.program.lib).length)saveProgram(0)}
    }
    check();
  },err=>{ok.p=true;check();onStoreError(err)});
  weeksCol.onSnapshot(snap=>{
    if(!snap.metadata.fromCache)ok.w=true;
    const cloud={};
    snap.docs.forEach(d=>{if(d.exists){const n=parseInt(String(d.id).slice(1));if(n>0&&n<=52)cloud[n]=normWeek(d.data(),n)}});
    let next;
    if(!ok.w)next=Object.assign({},S.weeks,cloud);
    else{
      next=cloud;
      if(!mig.w){mig.w=true;const missing=Object.keys(S.weeks).filter(n=>!cloud[n]&&weekHas(S.weeks[n]));missing.forEach(n=>next[n]=S.weeks[n]);saveWeeks(missing.map(Number))}
    }
    for(const n in S.weeks){if(pending('w:'+n))next[n]=S.weeks[n]}
    const before=JSON.stringify(S.weeks);S.weeks=next;
    if(JSON.stringify(S.weeks)!==before){saveLocal();softRender()}
    check();
  },err=>{ok.w=true;check();onStoreError(err)});
  sessCol.onSnapshot(snap=>{
    if(!snap.metadata.fromCache)ok.s=true;
    const cloud={};
    snap.docs.forEach(d=>{if(d.exists&&!deleted.has(d.id)){const s=normSession(d.data(),d.id);if(s)cloud[s.id]=s}});
    let next;
    if(!ok.s)next=Object.assign({},S.sessions,cloud);
    else{
      next=cloud;
      if(!mig.s){mig.s=true;const missing=Object.keys(S.sessions).filter(id=>!cloud[id]&&!deleted.has(id));if(missing.length){missing.forEach(id=>next[id]=S.sessions[id]);uploadSessions(missing)}}
    }
    for(const id in S.sessions){if(pendingS(id))next[id]=S.sessions[id]}
    const before=JSON.stringify(S.sessions);S.sessions=next;
    if(JSON.stringify(S.sessions)!==before){saveLocal();softRender()}
    check();
  },err=>{ok.s=true;check();onStoreError(err)});
}

/* ---------- views ---------- */
let view={name:'home'};
let needRender=false;
// When you open an exercise from Program, coming back (Save, Back, Remove) returns you to
// the same spot and briefly highlights the exercise, instead of jumping to the top.
let progReturn=null;
function go(v){
  const ret=progReturn&&v.name==='program'&&v.pweek===progReturn.week?progReturn:null;
  if(v.name!=='exercise')progReturn=null;
  view=v;render();
  if(!ret){window.scrollTo(0,0);return}
  window.scrollTo(0,ret.y);
  const row=ret.sid&&app.querySelector('.exname[data-sid="'+ret.sid+'"]');
  if(row){const r=row.getBoundingClientRect();if(r.top<70||r.bottom>window.innerHeight-90)row.scrollIntoView({block:'center'});
    const ex=row.closest('.exrow');if(ex){ex.classList.add('flash');setTimeout(()=>ex.classList.remove('flash'),1200)}}
}
let wakeLock=null;
async function syncWake(){
  const s=view.name==='workout'?S.sessions[view.id]:null;
  const want=!!(s&&!s.finished&&document.visibilityState==='visible'&&navigator.wakeLock);
  try{
    if(want&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}
    else if(!want&&wakeLock){const w=wakeLock;wakeLock=null;await w.release()}
  }catch(e){wakeLock=null}
}
document.addEventListener('visibilitychange',syncWake);
function render(){setTimeout(syncWake,0);
  const f={home:vHome,workout:vWorkout,history:vHistory,stats:vStats,program:vProgram,exercise:vExercise,exhist:vExHist}[view.name]||vHome;
  app.innerHTML=f();
  const back=view.back&&view.back.name;
  const tab={home:'home',workout:back==='history'?'history':'home',history:'history',stats:'stats',program:'program',exercise:'program',exhist:back==='history'?'history':'home'}[view.name];
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  const chips=document.getElementById('wchips'),on=chips&&chips.querySelector('.chip.on');
  if(on)chips.scrollLeft=on.offsetLeft-chips.clientWidth/2+on.clientWidth/2;
}
function rerender(){const y=window.scrollY;render();window.scrollTo(0,y)}
const typing=()=>{const a=document.activeElement;return!!(a&&app.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.type!=='range'&&a.type!=='checkbox')};
function softRender(){if(typing()){needRender=true;return}rerender()}
app.addEventListener('focusout',()=>{setTimeout(()=>{if(needRender&&!typing()){needRender=false;rerender()}},60)});

function top(title,back){
  return'<div class="top"><div class="tl">'+(back?'<button class="btn back" data-act="back" aria-label="Back">‹</button>':'')+'<h1>'+esc(title)+'</h1></div><button class="status" id="status" data-act="ghGo" aria-label="Backup status, open GitHub backup settings">'+statusHTML()+'</button></div>';
}
function rirText(rirs){const r=(rirs||[]).map(v=>v||'–');if(!r.some(v=>v!=='–'))return'';const u=[...new Set(r)];return'RIR '+(u.length===1?u[0]:r.join(' / '))}
function slotSummary(x){const a=[];if(x.ss)a.push('Superset '+x.ss);if(warmCount(x.warmup))a.push(x.warmup+' warm-up');a.push(x.sets+'×'+(x.reps||'?'));const rt=rirText(x.rirs);if(rt)a.push(rt);if(x.rest)a.push(fmtRest(x.rest)+' rest');else if(x.ss)a.push('no rest, go to partner');if(x.tech)a.push('Last set: '+x.tech);return a.join(' · ')}
function itemPills(it){
  const a=[];
  if(it.planSets){a.push(it.planSets+' working set'+(it.planSets===1?'':'s'));if(it.reps)a.push(it.reps+' reps')}
  else if(it.target)a.push(it.target);
  if(it.rest)a.push('Rest '+fmtRest(it.rest));
  let h='';
  if(it.ss)h+='<span class="pill ss">Superset '+esc(it.ss)+(it.rest?'':' · straight to partner')+'</span>';
  if(it.tech)h+='<span class="pill tech">Last set: '+esc(it.tech)+'</span>';
  return h+a.map(x=>'<span class="pill">'+esc(x)+'</span>').join('');
}
const setStr=sets=>sets.filter(x=>x.w||x.r).map(x=>esc(x.w||'–')+'×'+esc(x.r||'–')).join(' · ');

/* ----- home ----- */
function weekStrip(c,cur){
  const p=S.program;let h='<div class="strip" style="grid-template-columns:repeat('+p.length+',1fr)" aria-hidden="true">';
  for(let n=1;n<=p.length;n++){const g=weekProgress(c,n);const cls=g.planned&&g.done>=g.planned?'full':(g.done?'part':'');h+='<span class="'+cls+(n===cur?' cur':'')+'" title="Week '+n+': '+g.done+' of '+g.planned+' workouts"></span>'}
  return h+'</div>';
}
function vHome(){
  const p=S.program,c=p.cycle;
  let h=top('Workouts');
  if(!p.days.length){
    return h+'<div class="card empty"><h2>Set up your program</h2><p class="sub">Add your training days, then plan each week: exercises, warm-ups, sets, reps, RIR per set and rest times. After that, tap a day at the gym and everything for that week is ready to log.</p><button class="btn primary block" data-act="tab" data-tab="program">Set up program</button></div>';
  }
  const g=weekProgress(c.num,c.week);
  h+='<div class="card cyc"><div class="cycrow"><div><div class="sub">Cycle '+c.num+'</div><div class="num">Week '+c.week+' <span class="of">of '+p.length+'</span></div></div><div class="row"><button class="btn icon" data-act="week" data-d="-1" aria-label="Previous week"'+(c.week<=1?' disabled':'')+'>−</button><button class="btn icon" data-act="week" data-d="1" aria-label="Next week"'+(c.week>=p.length?' disabled':'')+'>+</button></div></div>';
  h+=weekStrip(c.num,c.week);
  h+='<div class="sub" style="margin-top:6px">'+g.done+' of '+g.planned+' workouts done this week</div>';
  const acts=[];
  if(g.planned&&g.done>=g.planned){
    if(c.week<p.length)acts.push('<button class="btn primary block" data-act="nextWeek">Week complete · Start week '+(c.week+1)+'</button>');
    else acts.push('<button class="btn primary block" data-act="finishCycle" data-confirm>Finish cycle '+c.num+' & see stats</button>');
  }else if(c.week===p.length)acts.push('<button class="btn block" data-act="finishCycle" data-confirm>Finish cycle '+c.num+' & see stats</button>');
  if(acts.length)h+='<div class="acts">'+acts.join('')+'</div>';
  const pc=c.num-1,pm=p.cycles[pc];
  if(pc>=1&&pm&&pm.done&&!sessList().some(s=>s.cycle===c.num))h+='<button class="linkbtn" data-act="undoCycle" data-confirm>Undo finishing cycle '+pc+'</button>';
  h+='</div>';
  if(!g.planned)h+='<div class="card"><h3>Nothing planned for week '+c.week+'</h3><p class="sub">Add this week\'s exercises in Program, or copy them from the week before.</p><button class="btn primary block" data-act="planWeek" data-n="'+c.week+'">Plan week '+c.week+'</button></div>';
  for(const d of p.days){
    const slots=daySlots(c.week,d.id);
    const fin=finishedFor(c.num,c.week,d.id),open=openSessionFor(d.id);
    const right=open?'<span class="badge">In progress</span>':(fin?'<span class="badge ok">Done ✓</span>':'<span class="chev">›</span>');
    const sub=slots.length?(slots.length+' exercise'+(slots.length===1?'':'s')+(fin?' · '+fmtDate(fin.date):'')):'Nothing planned this week';
    h+='<button class="card day'+(slots.length||open?'':' dim')+'" data-act="startDay" data-day="'+esc(d.id)+'"><div><h2>'+esc(d.name)+'</h2><div class="sub">'+sub+'</div></div>'+right+'</button>';
  }
  return h;
}

/* ----- workout ----- */
function rateHTML(it,i){
  const unset=!it.rating;
  return'<div class="rate'+(unset?' unset':'')+'" data-i="'+i+'"><div class="rh"><span>How did it feel?</span><span class="rv r'+it.rating+'">'+(unset?'Slide to rate':RATE[it.rating])+'</span></div>'+
    '<input type="range" min="1" max="5" step="1" value="'+(it.rating||3)+'" data-in="rating" data-i="'+i+'" aria-label="Rate '+esc(perfName(it))+' from too easy to too difficult" aria-valuetext="'+esc(RATE[it.rating||3])+'">'+
    '<div class="ticks"><span>Too easy</span><span>Just right</span><span>Too difficult</span></div>'+
    (unset?'':'<button class="linkbtn" data-act="clearRate" data-i="'+i+'">Clear rating</button>')+'</div>';
}
const libByName=n=>{n=norm(n);return n?Object.values(S.program.lib).find(x=>norm(x.name)===n)||null:null};
// compares a set with the same set last time by estimated 1-rep max (weight x (1 + reps/30))
function cmpHTML(st,ls){
  if(!ls||!st||!(st.w&&st.r)||!(ls.w&&ls.r))return'';
  const a=e1rm(st.w,st.r),b=e1rm(ls.w,ls.r);if(!a||!b)return'';
  const d=(a-b)/b;
  if(Math.abs(d)<0.005)return'<span class="flat">= same</span>';
  return d>0?'<span class="up">▲ better</span>':'<span class="down">▼ lower</span>';
}
// Permanently replace the planned exercise with today's substitute in every week of the plan.
// The old exercise is kept (history still finds it) and added as a substitution, so it's easy to switch back.
function replaceEverywhere(it){
  const p=S.program,from=it.exId,fromLib=libEx(from);if(!fromLib)return null;
  let to=libByName(it.swap);
  if(to&&to.id===from)return null;
  if(!to){
    const z=subsFor(it).find(q=>norm(q.name)===norm(it.swap));
    const id='x'+nid();
    to=normLib({id,name:it.swap,video:safeUrl(it.swapVideo)||(z?safeUrl(z.video):''),notes:fromLib.notes,
      subs:fromLib.subs.filter(q=>norm(q.name)!==norm(it.swap))});
    p.lib[id]=to;
  }
  if(!to.subs.some(q=>norm(q.name)===norm(fromLib.name))&&to.subs.length<10)to.subs.push({name:fromLib.name,video:fromLib.video,notes:fromLib.notes});
  let count=0;const touched=[];
  for(const n in S.weeks){let hit=false;const w=S.weeks[n];
    for(const k in w.days)w.days[k].forEach(sl=>{if(sl.exId===from){sl.exId=to.id;count++;hit=true}});
    if(hit)touched.push(+n);
  }
  saveProgram(0);saveWeeks(touched);
  return{from,fromName:fromLib.name,to,count};
}
// Notes always come from the planned exercise, even when you've swapped it for today.
// ---- drop-set calculator ----
// "Two Drop Sets (~25% per)" -> {count:2, pct:.25}
function dropInfo(it){
  const t=String(it.tech||'');if(!/drop/i.test(t))return null;
  const words={one:1,single:1,two:2,double:2,three:3,triple:3};
  const m=t.match(/(\d+)\s*drop/i)||t.match(/(one|single|two|double|three|triple)\s*drop/i);
  const count=m?(parseInt(m[1])||words[m[1].toLowerCase()]||1):1;
  const pm=t.match(/(\d+(?:\.\d+)?)\s*%/);
  return{count:Math.min(count,4),pct:(pm?parseFloat(pm[1]):25)/100};
}
function roundLoad(w){const lb=S.program.unit==='lb',step=lb?(w>=40?5:2.5):(w>=20?2.5:1);return Math.max(step,Math.round(w/step)*step)}
// If you hit the target reps, each drop is the set % off. If you fell short, first work out what weight you
// could have done for the bottom of the target (estimated 1-rep max: weight x (1 + reps/30)), then drop from that.
function dropHTML(it){
  const d=dropInfo(it);if(!d)return'';
  const last=it.sets[it.sets.length-1]||{},w=num(last.w),r=parseInt(last.r)||0,u=S.program.unit;
  const tm=String(it.reps||'').match(/\d+/),min=tm?parseInt(tm[0]):0;
  if(!(w>0))return'<b>Drop set calculator</b><span class="sub">Enter kg and reps to see drop weights</span>';
  let base=w,short=false;
  if(r>0&&min&&r<min){base=w*(1+r/30)/(1+min/30);short=true}
  const drops=[];let cur=base;
  for(let k=0;k<d.count;k++){cur=cur*(1-d.pct);drops.push(cur)}
  const first=roundLoad(drops[0]),eff=Math.round((1-drops[0]/w)*100);
  let h='<b>Drop set calculator</b><div class="drops">'+drops.map((x,k)=>'<span>Drop '+(k+1)+' <b>≈ '+fmtNum(roundLoad(x),1)+' '+esc(u)+'</b></span>').join('')+'</div>';
  if(short)h+='<span class="sub">'+r+' rep'+(r===1?'':'s')+' (target '+esc(it.reps)+') → bigger first drop, ~'+eff+'% off</span>';
  return h;
}
function notesFor(it){const lx=libEx(it.exId);return{txt:lx?lx.notes:'',name:it.name}}
function notesHTML(n){return'<div class="notebox"><div class="nh">'+esc(n.name)+'</div><p>'+esc(n.txt)+'</p></div>'}
function subsFor(it){const x=libEx(it.exId);return(x?x.subs:it.subs)||[]}
function swapHTML(it,i){
  const subs=subsFor(it),lx=libEx(it.exId);
  // each option has its own video button, so you can watch it before deciding to swap
  const vbtn=(url,name)=>url?'<a class="btn sm vid" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="Watch '+esc(name)+' video">▶ Video</a>':'<span class="btn sm vid novid" aria-hidden="true">No video</span>';
  const anyVideo=safeUrl(lx&&lx.video)||subs.some(z=>safeUrl(z.video)||safeUrl((libByName(z.name)||{}).video));
  let h='<div class="swap"><div class="sub">Pick an exercise for today</div>';
  h+='<div class="optrow"><button class="opt'+(it.swap?'':' on')+'" data-act="swapPick" data-i="'+i+'" data-k="-1"><span>'+esc(it.name)+'</span><span class="sub">Planned</span></button>'+vbtn(safeUrl(lx?lx.video:it.video),it.name)+'</div>';
  subs.forEach((z,k)=>{
    const v=safeUrl(z.video)||safeUrl((libByName(z.name)||{}).video);
    h+='<div class="optrow"><button class="opt'+(norm(it.swap)===norm(z.name)?' on':'')+'" data-act="swapPick" data-i="'+i+'" data-k="'+k+'"><span>'+esc(z.name)+'</span></button>'+vbtn(v,z.name)+'</div>';
  });
  if(!subs.length)h+='<p class="sub">No substitutions saved for this exercise yet. You can add them in Program.</p>';
  else if(!anyVideo)h+='<p class="sub" style="margin:2px 0 0">No video links saved for these yet. Add them in Program → tap the exercise.</p>';
  h+='<div class="row other"><input class="field" id="so-'+i+'" placeholder="Something else…" maxlength="80" autocomplete="off"><button class="btn sm" data-act="swapOther" data-i="'+i+'">Use</button></div></div>';
  return h;
}
function vWorkout(){
  const s=S.sessions[view.id];
  if(!s||deleted.has(s.id))return top('Workout',true)+'<div class="card sub">This workout isn\'t available any more.</div>';
  const u=S.program.unit;
  let h=top(s.dayName,true);
  h+='<div class="meta"><span class="sub">'+fmtDate(s.date)+'</span><span class="row"><span class="pill">Cycle '+s.cycle+'</span><button class="btn sm icon" data-act="sweek" data-d="-1" aria-label="Earlier week"'+(s.week<=1?' disabled':'')+'>−</button><span class="pill">Week '+s.week+'</span><button class="btn sm icon" data-act="sweek" data-d="1" aria-label="Later week"'+(s.week>=S.program.length?' disabled':'')+'>+</button></span>'+(s.finished?'<span class="badge">Done</span>':'')+'</div>';
  if(!s.items.length)h+='<div class="card sub">No exercises in this workout.</div>';
  s.items.forEach((it,i)=>{
    const lx=libEx(it.exId);
    const pn=perfName(it);
    const sx=it.swap?libByName(it.swap):null;
    const video=it.swap?(safeUrl(it.swapVideo)||safeUrl(sx&&sx.video)):safeUrl(lx?lx.video:it.video);
    const nt=notesFor(it);
    const nOpen=!!(view.notesOpen&&view.notesOpen[i]);
    const last=prevFor(pn,s,it.sid),sug=suggestFor(it,last);
    const open=view.swapOpen===i;
    h+='<section class="card"><div class="exh"><div><h3><button data-act="exhist" data-name="'+esc(pn)+'">'+esc(pn)+'</button></h3>'+(it.swap?'<div class="sub">Instead of '+esc(it.name)+'</div>':'')+'</div><div class="exa">'+(video?'<a class="btn sm" href="'+esc(video)+'" target="_blank" rel="noopener noreferrer">▶ Video</a>':'')+(nt.txt?'<button class="btn sm'+(nOpen?' swapped':'')+'" data-act="notesOpen" data-i="'+i+'" aria-expanded="'+nOpen+'">Notes</button>':'')+'<button class="btn sm'+(it.swap||open?' swapped':'')+'" data-act="swapOpen" data-i="'+i+'" aria-expanded="'+open+'">⇄ Swap</button></div></div>';
    if(open)h+=swapHTML(it,i);
    if(it.swap&&!s.finished&&libEx(it.exId))h+='<div class="always"><span class="sub">Gym never has '+esc(it.name)+'?</span><button class="btn sm" data-act="swapAlways" data-i="'+i+'" data-confirm>Use '+esc(it.swap)+' in all '+S.program.length+' weeks</button></div>';
    h+='<div class="tgt">'+itemPills(it)+'</div>';
    if(nOpen)h+=notesHTML(nt);
    if(last&&last.start){}
    else if(last)h+='<div class="last">Last time · <b>Week '+last.week+'</b>'+(last.cycle!==s.cycle?' (cycle '+last.cycle+')':'')+' · '+fmtDate(last.date)+(last.rating?' · felt <b class="r'+last.rating+'">'+RATE[last.rating]+'</b>':'')+(sug?(sug.dir==='up'?' · <b class="up">Try '+fmtW(sug.w)+' '+esc(S.program.unit)+' ↑</b>':' · stay at '+fmtW(sug.w)+' '+esc(S.program.unit)):'')+'</div>';
    else h+='<div class="last">First time doing this one. Next time you\'ll see these numbers under each set.</div>';
    if(warmCount(it.warmup))h+='<div class="warmline">Warm-up <b>'+esc(it.warmup)+' set'+(it.warmup.trim()==='1'?'':'s')+'</b> first, then your working sets</div>';
    h+='<div class="sets"><div class="h">Set</div><div class="h">'+u+'</div><div class="h">Reps</div><div class="h">RIR</div><div class="h">Done</div>';
    const row=(st,j,kind)=>{
      const src=last?(kind==='warm'?last.warm:last.sets):null;
      const ls=(src&&src[j])||{};
      const dc=(st.done?' done':'')+(kind==='warm'?' wu':'');
      const tr=kind==='warm'?'':(it.rirs[j]||'');
      const lab=String(j+1);
      const nm=esc(pn)+(kind==='warm'?' warm-up '+(j+1):' set '+(j+1));
      return'<div class="setn'+(kind==='warm'?' wu':'')+'">'+lab+'</div>'+
        '<input class="'+dc+'" inputmode="decimal" enterkeyhint="next" autocomplete="off" data-in="w" data-kind="'+kind+'" data-i="'+i+'" data-j="'+j+'" value="'+esc(st.w)+'" placeholder="'+esc(kind!=='warm'&&sug&&sug.dir==='up'?fmtW(sug.w):(ls.w||''))+'" aria-label="'+nm+' weight">'+
        '<input class="'+dc+'" inputmode="numeric" enterkeyhint="done" autocomplete="off" data-in="r" data-kind="'+kind+'" data-i="'+i+'" data-j="'+j+'" value="'+esc(st.r)+'" placeholder="'+esc(it.reps||ls.r||'')+'" aria-label="'+nm+' reps, target '+esc(it.reps||'')+'">'+
        '<div class="rirc'+(tr===''?' none':'')+'" aria-label="Target RIR '+esc(tr||'none')+'">'+esc(tr===''?'–':tr)+'</div>'+
        '<button class="chk'+(st.done?' on':'')+(kind==='warm'?' wu':'')+'" data-act="done" data-kind="'+kind+'" data-i="'+i+'" data-j="'+j+'" aria-pressed="'+st.done+'" aria-label="Mark '+nm+' done">✓</button>';
    };
    it.sets.forEach((st,j)=>{
      h+=row(st,j,'work');
      const ls=last&&last.sets[j],isLast=j===it.sets.length-1;
      const prev=ls&&(ls.w||ls.r)?(last.start?'Target':'Last')+': <b>'+esc(ls.w||'–')+' '+esc(S.program.unit)+' × '+esc(ls.r||'–')+'</b>':'';
      const tech=isLast&&it.tech?'<span class="techtag">Last set: '+esc(it.tech)+'</span>':'';
      if(prev||tech)h+='<div class="prev">'+tech+(prev?'<span>'+prev+' <i id="cmp-'+i+'-'+j+'">'+cmpHTML(st,ls)+'</i></span>':'')+'</div>';
      if(isLast&&dropInfo(it))h+='<div class="dropcalc" id="drop-'+i+'">'+dropHTML(it)+'</div>';
    });
    h+='</div><div class="exf"><button class="btn sm ghost" data-act="addSet" data-i="'+i+'">+ Set</button>'+(it.sets.length>1?'<button class="btn sm ghost" data-act="rmSet" data-i="'+i+'">− Set</button>':'')+'</div>';
    {const ro=!!(view.rateOpen&&view.rateOpen[i]);
     h+=ro?rateHTML(it,i)+'<button class="linkbtn" data-act="rateToggle" data-i="'+i+'">Hide</button>'
       :'<div class="rate"><button class="ratebtn" data-act="rateToggle" data-i="'+i+'" aria-expanded="false"><span>How did it feel?</span><span class="rv r'+(it.rating||0)+'">'+(it.rating?RATE[it.rating]:'Tap to rate')+' ›</span></button></div>';}
    h+='</section>';
  });
  h+='<div class="card"><label class="lbl">Workout notes<textarea data-in="note" rows="3" placeholder="How did it feel? Anything to change next time?">'+esc(s.note)+'</textarea></label></div>';
  h+=s.finished?'<button class="btn block" data-act="back">Done</button>':'<button class="btn primary block big" data-act="finish">Finish workout</button>';
  if(!s.draft)h+='<button class="btn ghost danger block mt" data-act="delSession" data-confirm>Delete this workout</button>';
  return h;
}

function vExHist(){
  const n=norm(view.exName);
  let h=top(view.exName,true);
  const rows=[];
  for(const s of sessList()){const it=s.items.find(i=>norm(perfName(i))===n);if(it&&it.sets.some(x=>x.w||x.r))rows.push({s,it})}
  if(!rows.length)return h+'<div class="card sub">No sets logged for this exercise yet.</div>';
  h+=progressChart(rows);
  h+='<p class="sub" style="margin:-6px 2px 12px">Every logged session, newest first. Weight ('+S.program.unit+') × reps.</p><div class="card">';
  rows.forEach(({s,it})=>{h+='<div class="hrow"><div><div>'+fmtDate(s.date)+'</div><div class="sub">Cycle '+s.cycle+' · Week '+s.week+' · '+esc(s.dayName)+'</div></div><div><div class="v">'+setStr(it.sets)+'</div>'+(it.rating?'<div class="sub r'+it.rating+'" style="text-align:right">'+RATE[it.rating]+'</div>':'')+'</div></div>'});
  return h+'</div>';
}

function vHistory(){
  const list=sessList();
  let h=top('History');
  if(!list.length)return h+'<div class="card sub">No workouts logged yet. Each workout you start shows up here.</div>';
  let grp=null;
  for(const s of list){
    const g='Cycle '+s.cycle+' · Week '+s.week;
    if(g!==grp){grp=g;h+='<div class="wk">'+g+'</div>'}
    let done=0,total=0;s.items.forEach(it=>{total+=it.sets.length;done+=it.sets.filter(x=>x.done).length});
    h+='<button class="card day" data-act="open" data-id="'+esc(s.id)+'"><div><h2>'+esc(s.dayName)+'</h2><div class="sub">'+fmtDate(s.date)+' · '+done+'/'+total+' sets done</div></div>'+(s.finished?'<span class="chev">›</span>':'<span class="badge">In progress</span>')+'</button>';
  }
  return h;
}

/* ----- program ----- */
function vProgram(){
  const p=S.program;
  let h=top('Program');
  if(!p.days.length){
    h+='<div class="card"><h2>Start your program</h2><p class="sub">Create your training days first. Then pick a week and add that week\'s exercises with their sets, reps, RIR and rest. Copy a week forward and only change what\'s different.</p><label class="btn primary block">Load backup file<input type="file" accept=".json,application/json,text/plain" data-in="bkfile" hidden></label><button class="btn block mt" data-act="showRestore">Paste a backup</button><button class="btn block mt" data-act="quick">Add empty Upper, Lower, Push, Pull, Arms</button><button class="btn block mt" data-act="addDay">Add a single day</button></div>';
    return h+settingsHTML();
  }
  const n=view.pweek=clamp(view.pweek||p.cycle.week,1,p.length);
  h+='<div class="chips weeks" id="wchips" role="tablist" aria-label="Program week">';
  for(let k=1;k<=p.length;k++)h+='<button class="chip'+(k===n?' on':'')+(weekHas(S.weeks[k])?' has':'')+'" role="tab" aria-selected="'+(k===n)+'" data-act="pweek" data-n="'+k+'">W'+k+(k===p.cycle.week?'<i title="Current week"></i>':'')+'</button>';
  h+='</div>';
  const has=weekHas(S.weeks[n]);
  h+='<div class="weekbar"><h2>Week '+n+'</h2><div class="row">'+(n>1?'<button class="btn sm" data-act="copyPrev"'+(has?' data-confirm':'')+'>Copy week '+(n-1)+'</button>':'')+(n<p.length&&has?'<button class="btn sm" data-act="copyLater" data-confirm>Copy to weeks '+(n+1)+'–'+p.length+'</button>':'')+'</div></div>';
  if(!has&&n>1&&weekHas(S.weeks[n-1]))h+='<p class="hint">Tip: tap "Copy week '+(n-1)+'" to start from last week, then just change the sets and reps.</p>';
  p.days.forEach((d,di)=>{
    const slots=daySlots(n,d.id),prev=n>1?daySlots(n-1,d.id):[];
    h+='<section class="card"><div class="dayedit"><input class="field" data-in="dayName" data-day="'+esc(d.id)+'" value="'+esc(d.name)+'" aria-label="Day name" maxlength="40"><button class="btn icon sm" data-act="mvDay" data-day="'+esc(d.id)+'" data-d="-1" aria-label="Move day up"'+(di===0?' disabled':'')+'>↑</button><button class="btn icon sm" data-act="mvDay" data-day="'+esc(d.id)+'" data-d="1" aria-label="Move day down"'+(di===p.days.length-1?' disabled':'')+'>↓</button></div>';
    if(!slots.length)h+='<p class="sub">No exercises in week '+n+'.</p>';
    slots.forEach((x,xi)=>{
      const lx=libEx(x.exId);
      h+='<div class="exrow"><button class="exname" data-act="editEx" data-day="'+esc(d.id)+'" data-sid="'+esc(x.sid)+'"><strong>'+esc(libName(x.exId))+'</strong><span class="sub">'+esc(slotSummary(x))+(lx&&lx.video?' · ▶':'')+(lx&&lx.subs.length?' · '+lx.subs.length+' sub'+(lx.subs.length===1?'':'s'):'')+'</span></button><div class="exbtns"><button class="btn icon sm" data-act="mvEx" data-day="'+esc(d.id)+'" data-sid="'+esc(x.sid)+'" data-d="-1" aria-label="Move up"'+(xi===0?' disabled':'')+'>↑</button><button class="btn icon sm" data-act="mvEx" data-day="'+esc(d.id)+'" data-sid="'+esc(x.sid)+'" data-d="1" aria-label="Move down"'+(xi===slots.length-1?' disabled':'')+'>↓</button></div></div>';
    });
    h+='<div class="exf"><button class="btn sm" data-act="newEx" data-day="'+esc(d.id)+'">+ Exercise</button>'+(prev.length?'<button class="btn sm ghost" data-act="copyDayPrev" data-day="'+esc(d.id)+'"'+(slots.length?' data-confirm':'')+'>Copy from week '+(n-1)+'</button>':'')+'<button class="btn sm ghost danger" data-act="delDay" data-day="'+esc(d.id)+'" data-confirm>Delete day</button></div></section>';
  });
  h+='<button class="btn block" data-act="addDay">+ Add day</button>';
  return h+settingsHTML();
}
function settingsHTML(){
  const p=S.program;
  let h='<div class="sect">Settings</div><div class="card"><div class="setrow"><span>Weight unit</span><div class="seg"><button data-act="unit" data-u="kg" class="'+(p.unit==='kg'?'on':'')+'">kg</button><button data-act="unit" data-u="lb" class="'+(p.unit==='lb'?'on':'')+'">lb</button></div></div>';
  h+='<div class="lenrow"><div><div>Program length</div><div class="sub">Weeks in one cycle</div></div><div class="row"><button class="btn icon sm" data-act="len" data-d="-1" aria-label="Fewer weeks"'+(p.length<=1?' disabled':'')+'>−</button><span class="num" style="font-size:22px;min-width:34px;text-align:center">'+p.length+'</span><button class="btn icon sm" data-act="len" data-d="1" aria-label="More weeks"'+(p.length>=52?' disabled':'')+'>+</button></div></div></div>';
  {const st=S.program.starts||{},ks=Object.keys(st).sort();
   if(ks.length){h+='<div class="sect">Starting points</div><div class="card"><details class="notes" style="margin-top:0"><summary>'+ks.length+' exercises have a starting point</summary><p class="sub" style="margin:6px 0 8px">Shown as a guide until you log that exercise; then your own history takes over. Change one by tapping the exercise above.</p>'+ks.map(k=>'<div class="hrow"><div style="text-transform:capitalize">'+esc(k)+'</div><div class="v">'+esc(st[k].w)+' '+esc(S.program.unit)+(st[k].r?' × '+esc(st[k].r):'')+'</div></div>').join('')+'</details></div>'}}
  h+='<div class="sect">Templates</div><div class="card"><p class="sub" style="margin-top:0">A template saves your whole plan: days, exercises, notes, substitutions and every week\'s sets, reps, RIR, rest and techniques. Your workout history isn\'t part of it.</p>';
  const tpls=Object.values(S.templates).sort((a,b)=>a.created-b.created);
  tpls.forEach(t=>{const nd=t.program.days.length,ne=new Set(Object.values(t.weeks).flatMap(w=>Object.values(w.days).flat().map(x=>x.exId))).size;
    h+='<div class="tplrow"><div><b>'+esc(t.name)+'</b><div class="sub">'+t.program.length+' weeks · '+nd+' day'+(nd===1?'':'s')+' · '+ne+' exercises · saved '+fmtShort(t.created)+'</div></div><div class="exbtns"><button class="btn sm" data-act="tplLoad" data-id="'+esc(t.id)+'" data-confirm>Load</button><button class="btn sm ghost danger" data-act="tplDel" data-id="'+esc(t.id)+'" data-confirm aria-label="Delete template '+esc(t.name)+'">✕</button></div></div>';});
  if(!tpls.length)h+='<p class="sub">No templates yet.</p>';
  if(S.program.days.length)h+='<div class="row other mt" style="flex-wrap:nowrap"><input class="field" id="tplname" placeholder="Template name" maxlength="60" autocomplete="off" value="'+esc(tpls.length?'':DEFAULT_TEMPLATE)+'" style="margin:0;flex:1;min-width:0"><button class="btn sm" data-act="tplSave">Save current plan</button></div><p class="sub" style="margin:8px 0 0">Loading a template replaces the plan for all weeks. Your history is kept.</p>';
  h+='</div>';
  {const dfl=p.incDefaults||INC_DEF;
   h+='<div class="sect">Rest timer</div><div class="card"><div class="setrow"><div><div>Alert when rest is over</div><div class="sub">Also works with the screen locked. The screen stays on during workouts anyway.</div></div><button class="btn sm'+(alertsOn()?' primary':'')+'" data-act="restAlerts" aria-pressed="'+alertsOn()+'">'+(alertsOn()?'On':'Off')+'</button></div></div>';
  h+='<div class="sect">Weight steps</div><div class="card"><p class="sub" style="margin-top:0">The smallest jump your gym allows. Used to suggest your next weight when you hit the top of the rep range. Override any single exercise by tapping it above.</p><div class="incgrid">'+Object.keys(INC_DEF).map(k=>'<label class="rirf"><span>'+INC_LABEL[k]+'</span><input data-in="incDef" data-k="'+k+'" inputmode="decimal" value="'+esc(dfl[k])+'" maxlength="8" autocomplete="off" aria-label="'+INC_LABEL[k]+' step in '+esc(p.unit)+'"></label>').join('')+'</div></div>';}
  h+='<div class="sect" id="ghsect">GitHub backup</div><div class="card">'+ghCardHTML()+'</div>';
  h+='<div class="sect">Backup</div><div class="card"><p class="sub" style="margin-top:0">Everything is saved on this phone. Save a backup file every week or two (it goes to your Downloads) so your history is safe if the phone is reset.</p><div class="exf" style="margin-top:0"><button class="btn sm primary" data-act="saveBackupFile">Save backup file</button><label class="btn sm">Load backup file<input type="file" accept=".json,application/json,text/plain" data-in="bkfile" hidden></label></div><div class="exf"><button class="btn sm ghost" data-act="copyBackup">Copy backup</button><button class="btn sm" data-act="showRestore">'+(view.restore?'Hide paste':'Paste a backup…')+'</button></div>';
  if(view.backupText)h+='<textarea class="mono mt" readonly rows="5">'+esc(view.backupText)+'</textarea><p class="sub">Couldn\'t copy automatically. Select all of the text above and copy it.</p>';
  if(view.restore)h+='<textarea class="mono mt" data-in="restore" rows="5" placeholder="Paste your backup here">'+esc(view.restoreText||'')+'</textarea><button class="btn sm primary mt" data-act="doRestore" data-confirm>Restore this backup</button>';
  return h+'</div>';
}

/* ----- exercise editor (one week's slot) ----- */
function rirCount(d){return clamp(parseInt(d.sets)||0,0,12)}
function rirFields(d){
  const n=rirCount(d);
  while(d.rirs.length<n)d.rirs.push('');
  if(!n)return'<p class="sub" style="margin:-4px 0 14px">Enter the number of working sets above to set a RIR target for each one.</p>';
  let h='<div class="rirgrid">';
  for(let k=0;k<n;k++)h+='<label class="rirf"><span>Set '+(k+1)+'</span><input data-in="rirSet" data-k="'+k+'" inputmode="decimal" value="'+esc(d.rirs[k]||'')+'" placeholder="–" maxlength="10" autocomplete="off" aria-label="Set '+(k+1)+' RIR target"></label>';
  return h+'</div>';
}
function vExercise(){
  const d=view.draft,p=S.program,n=view.week,day=findDay(view.dayId);
  let h=top('Exercise',true);
  h+='<p class="sub" style="margin:-8px 2px 12px">'+esc(day?day.name:'')+' · Week '+n+'</p>';
  const libs=Object.values(p.lib).sort((a,b)=>a.name.localeCompare(b.name));
  h+='<div class="card">';
  h+='<label class="lbl">Exercise<select class="field" data-in="libId"><option value="new"'+(d.libId==='new'?' selected':'')+'>＋ New exercise</option>'+libs.map(x=>'<option value="'+esc(x.id)+'"'+(d.libId===x.id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>';
  h+='<label class="lbl">Name<input data-in="name" value="'+esc(d.name)+'" placeholder="e.g. Incline dumbbell press" autocomplete="off" maxlength="80"></label>';
  h+='<label class="lbl">Video link<input data-in="video" type="url" inputmode="url" autocapitalize="off" autocorrect="off" value="'+esc(d.video)+'" placeholder="Paste the link from your PDF"></label>';
  h+='<label class="lbl" style="margin-bottom:0">Notes<textarea data-in="notes" rows="3" placeholder="Form cues, set-up tips…">'+esc(d.notes)+'</textarea></label>';
  h+='<div class="grid2" style="margin-top:12px"><label class="lbl" style="margin-bottom:0">Starting '+esc(p.unit)+'<input data-in="startW" inputmode="decimal" value="'+esc(d.startW||'')+'" placeholder="–" maxlength="12" autocomplete="off"></label><label class="lbl" style="margin-bottom:0">Starting reps<input data-in="startR" inputmode="numeric" value="'+esc(d.startR||'')+'" placeholder="–" maxlength="12" autocomplete="off"></label></div><label class="lbl" style="margin:12px 0 0">Weight step ('+esc(p.unit)+')<input data-in="incStep" inputmode="decimal" value="'+esc(d.incStep||'')+'" placeholder="'+(equipOf(d.name)==='bw'?'none (bodyweight)':esc((p.incDefaults||INC_DEF)[equipOf(d.name)])+' ('+INC_LABEL[equipOf(d.name)].toLowerCase()+' default)')+'" maxlength="8" autocomplete="off"></label><p class="hint" style="margin:6px 0 0">The smallest jump your gym allows on this exercise; used to suggest your next weight. Starting kg/reps: a guide shown until you have logged this exercise. After that, your last session is used.</p>';
  if(d.libId!=='new')h+='<p class="hint" style="margin:10px 0 0">Name, video, notes and substitutions are shared by every week that uses this exercise. To use a different exercise from this week on, pick it above or choose "New exercise".</p>';
  h+='</div>';
  h+='<div class="sect">Week '+n+' targets</div><div class="card">'+
    '<div class="grid2"><label class="lbl">Warm-up sets<input data-in="warmup" value="'+esc(d.warmup)+'" placeholder="e.g. 1-2" maxlength="10"></label><label class="lbl">Working sets<input data-in="sets" inputmode="numeric" value="'+esc(d.sets)+'" placeholder="3"></label></div>'+
    '<div class="grid2"><label class="lbl">Reps<input data-in="reps" value="'+esc(d.reps)+'" placeholder="e.g. 6-8" maxlength="20"></label><label class="lbl">Rest (seconds)<input data-in="rest" inputmode="numeric" value="'+esc(d.rest)+'" placeholder="e.g. 120"></label></div>'+
    '<div class="lbl">Effort / RIR per set</div><div id="rirbox">'+rirFields(d)+'</div>'+
    '<div class="grid2"><label class="lbl">Superset<input data-in="ss" value="'+esc(d.ss||'')+'" placeholder="e.g. S1" maxlength="10" autocomplete="off"></label><label class="lbl">Last-set technique<input data-in="tech" value="'+esc(d.tech||'')+'" placeholder="e.g. Myo-reps" maxlength="60" autocomplete="off"></label></div></div>';
  h+='<div class="sect">Substitutions</div><div class="card"><p class="sub" style="margin-top:0">Alternatives you can swap to during a workout, e.g. when the machine is taken.</p>';
  d.subs.forEach((z,k)=>{
    h+='<div class="subrow"><div class="subf"><input class="field" data-in="subName" data-k="'+k+'" value="'+esc(z.name)+'" placeholder="Exercise name" maxlength="80" autocomplete="off" aria-label="Substitution '+(k+1)+' name"><input class="field small" data-in="subVideo" data-k="'+k+'" type="url" inputmode="url" autocapitalize="off" autocorrect="off" value="'+esc(z.video)+'" placeholder="Video link (optional)" aria-label="Substitution '+(k+1)+' video link"></div><button class="btn icon sm ghost danger" data-act="rmSub" data-k="'+k+'" aria-label="Remove substitution">✕</button></div>';
  });
  h+='<button class="btn sm" data-act="addSub"'+(d.subs.length>=10?' disabled':'')+'>+ Add substitution</button></div>';
  if(n<p.length)h+='<div class="card"><label class="toggle"><input type="checkbox" data-in="later"'+(d.later?' checked':'')+'><span>Also apply to weeks '+(n+1)+'–'+p.length+'<span class="sub" style="display:block">Sets the same exercise and targets in every later week.</span></span></label></div>';
  h+='<button class="btn primary block big" data-act="saveEx">Save</button>';
  if(view.sid){
    h+='<button class="btn ghost danger block mt" data-act="delEx" data-confirm>Remove from week '+n+'</button>';
    if(n<p.length)h+='<button class="btn ghost danger block" data-act="delExLater" data-confirm>Remove from weeks '+n+'–'+p.length+'</button>';
  }
  return h;
}
function libToDraft(d,id){const x=libEx(id);if(x){d.name=x.name;d.video=x.video;d.notes=x.notes;d.subs=clone(x.subs)}else{d.name='';d.video='';d.notes='';d.subs=[]}const st=x&&(S.program.starts||{})[norm(x.name)];d.startW=st?st.w:'';d.startR=st?st.r:'';d.incStep=x?((S.program.incs||{})[norm(x.name)]||''):''}
// When an existing exercise is picked for a new slot, start from its most recent targets.
function latestSlotFor(exId,before){for(let n=before;n>=1;n--){const w=S.weeks[n];if(!w)continue;for(const k in w.days){const s=w.days[k].find(x=>x.exId===exId);if(s)return s}}return null}

/* ----- stats ----- */
function e1rm(w,r){w=num(w);r=parseInt(r);if(!(w>0)||!(r>0))return 0;return r===1?w:w*(1+r/30)}
function cycleList(){const set=new Set(sessList().map(s=>s.cycle));set.add(S.program.cycle.num);Object.keys(S.program.cycles).forEach(k=>set.add(+k));return[...set].filter(n=>n>0).sort((a,b)=>a-b)}
// upto: only count weeks 1..upto (to compare a cycle in progress with earlier cycles at the same point)
function cycleStats(c,upto){
  const p=S.program;
  const ss=sessList().filter(s=>s.cycle===c&&(!upto||s.week<=upto)).sort((a,b)=>a.date-b.date);
  const fin=ss.filter(s=>s.finished);
  const meta=p.cycles[c]||{};
  const current=!upto&&c===p.cycle.num&&!meta.done;
  let reach=current?p.cycle.week:Math.max(p.length,...ss.map(s=>s.week),1);
  if(upto)reach=upto;
  const weeks=[];let planned=0,hit=0,full=0,missed=0,counted=0;
  for(let w=1;w<=Math.max(p.length,reach);w++){
    const pl=plannedDays(w).length;
    const doneIds=new Set(fin.filter(s=>s.week===w).map(s=>s.dayId));
    const done=fin.filter(s=>s.week===w).length;
    const isCounted=w<=reach;
    const closed=isCounted&&!(current&&w===reach);
    weeks.push({w,planned:pl,done,doneDays:doneIds.size,counted:isCounted});
    if(isCounted&&pl){counted++;planned+=pl;hit+=Math.min(doneIds.size,pl);if(doneIds.size>=pl)full++;}
    if(closed&&pl&&!done)missed++;
  }
  let sets=0,reps=0,vol=0;const ex={};const ratings=[0,0,0,0,0,0];
  for(const s of ss){
    for(const it of s.items){
      const name=perfName(it);let best=null;
      for(const st of it.sets){
        if(!(st.done||(st.w&&st.r)))continue;
        sets++;const r=parseInt(st.r)||0;reps+=r;vol+=num(st.w)*r;
        const e=e1rm(st.w,st.r);if(e&&(!best||e>best.e))best={e,w:st.w,r:st.r};
      }
      if(it.rating)ratings[it.rating]++;
      if(best){(ex[norm(name)]||(ex[norm(name)]={name,points:[]})).points.push({date:s.date,week:s.week,...best})}
    }
  }
  const exList=Object.values(ex).map(x=>{const f=x.points[0],l=x.points[x.points.length-1];const top=x.points.reduce((a,b)=>b.e>a.e?b:a);return{name:x.name,n:x.points.length,first:f,last:l,top,change:f.e?(l.e-f.e)/f.e:0}});
  const start=ss.length?ss[0].date:0,end=meta.end||(ss.length?ss[ss.length-1].date:0);
  return{c,current,done:!!meta.done,reach,weeks,planned,hit,full,missed,counted,workouts:fin.length,sets,reps,vol,ex:exList,ratings,start,end,has:ss.length>0,
    calWeeks:start?Math.max(1,Math.round((end-start)/(7*864e5))+1):0};
}
function delta(cur,prev,opts){
  opts=opts||{};
  if(prev==null)return'';
  const d=cur-prev;const good=opts.lowerBetter?d<0:d>0;
  const cls=d===0?'flat':(good?'up':'down');
  const arrow=d===0?'=':(d>0?'▲':'▼');
  const val=opts.pct?Math.abs(Math.round(d*100))+' pts':(opts.big?fmtBig(Math.abs(d)):fmtNum(Math.abs(d),1));
  return'<div class="d"><span class="'+cls+'">'+arrow+'</span> '+(d===0?'same as':val+(d>0?' more than':' fewer than'))+' cycle '+opts.vs+'</div>';
}
function vStats(){
  const p=S.program;
  let h=top('Stats');
  const cycles=cycleList();
  const c=view.cyc&&cycles.includes(view.cyc)?view.cyc:(()=>{const cur=cycleStats(p.cycle.num);if(cur.has)return p.cycle.num;const done=cycles.filter(n=>n<p.cycle.num);return done.length?done[done.length-1]:p.cycle.num})();
  if(cycles.length>1){h+='<div class="chips">';cycles.forEach(n=>{h+='<button class="chip has'+(n===c?' on':'')+'" data-act="cyc" data-n="'+n+'">Cycle '+n+'</button>'});h+='</div>'}
  const st=cycleStats(c);
  const prevNum=cycles.filter(n=>n<c).reverse().find(n=>cycleStats(n).has);
  const pv=prevNum?cycleStats(prevNum,st.current?st.reach:null):null;
  h+='<div class="card"><div class="sub">'+(st.done?'Completed cycle':(st.current?'Current cycle · week '+p.cycle.week+' of '+p.length:'Cycle'))+'</div><h2 style="font-size:30px">Cycle '+c+'</h2>';
  if(st.has)h+='<div class="sub">'+fmtShort(st.start)+' – '+fmtShort(st.end)+' · '+st.calWeeks+' calendar week'+(st.calWeeks===1?'':'s')+'</div>';
  h+='</div>';
  if(!st.has)return h+'<div class="card sub">No workouts logged in cycle '+c+' yet. Stats appear here as you train.</div>';
  const pct=st.planned?st.hit/st.planned:0,ppct=pv&&pv.planned?pv.hit/pv.planned:null;
  const vs={vs:prevNum};
  h+='<div class="tiles">';
  h+='<div class="tile"><div class="k">Workouts done</div><div class="v">'+st.workouts+' <small>/ '+st.planned+'</small></div>'+(pv?delta(st.workouts,pv.workouts,vs):'<div class="d">planned so far</div>')+'</div>';
  h+='<div class="tile"><div class="k">Consistency</div><div class="v">'+Math.round(pct*100)+'%</div>'+(pv?delta(pct,ppct,{...vs,pct:true}):'<div class="d">of planned workouts</div>')+'</div>';
  h+='<div class="tile"><div class="k">Full weeks</div><div class="v">'+st.full+' <small>/ '+st.counted+'</small></div>'+(pv?delta(st.full,pv.full,vs):'<div class="d">every workout done</div>')+'</div>';
  h+='<div class="tile"><div class="k">Missed weeks</div><div class="v">'+st.missed+'</div>'+(pv?delta(st.missed,pv.missed,{...vs,lowerBetter:true}):'<div class="d">no workouts at all</div>')+'</div>';
  h+='<div class="tile"><div class="k">Working sets</div><div class="v">'+fmtNum(st.sets,0)+'</div>'+(pv?delta(st.sets,pv.sets,vs):'<div class="d">'+fmtNum(st.reps,0)+' reps</div>')+'</div>';
  h+='<div class="tile"><div class="k">Volume lifted</div><div class="v">'+fmtBig(st.vol)+' <small>'+p.unit+'</small></div>'+(pv?delta(st.vol,pv.vol,{...vs,big:true}):'<div class="d">weight × reps</div>')+'</div>';
  h+='</div>';
  // week-by-week bars (single series: share of planned workouts done)
  h+='<div class="card"><h3>Workouts each week</h3><div class="sub">Share of that week\'s planned workouts you finished</div><div class="bars" role="list">';
  st.weeks.forEach(w=>{
    const f=w.planned?Math.min(1,w.doneDays/w.planned):(w.done?1:0);
    const cls=!w.counted?' future':(f?'':' none');
    const label='Week '+w.w+': '+(w.counted?w.doneDays+' of '+w.planned+' planned workouts':'not reached yet');
    h+='<div class="b'+cls+'" role="listitem" tabindex="0" data-tip="'+esc(label)+'" aria-label="'+esc(label)+'"><i style="height:'+(w.counted?Math.max(2,f*100):100)+'%"></i></div>';
  });
  h+='</div><div class="blabels">'+st.weeks.map(w=>'<span>'+(st.weeks.length>16&&w.w%2===0?'':w.w)+'</span>').join('')+'</div></div>';
  // strength
  const prevEx={};if(pv)pv.ex.forEach(x=>prevEx[norm(x.name)]=x);
  const prog=st.ex.filter(x=>x.n>=2).sort((a,b)=>b.change-a.change);
  const once=st.ex.filter(x=>x.n<2);
  h+='<div class="card"><h3>Strength</h3><div class="sub" style="margin-bottom:8px">Best set in your first vs latest session of each exercise this cycle</div>';
  if(!prog.length)h+='<p class="sub">Log an exercise in at least two sessions to see progress.</p>';
  prog.forEach(x=>{
    const ch=Math.round(x.change*100);const cls=ch>0?'up':(ch<0?'down':'flat');
    const pe=prevEx[norm(x.name)];
    let cmp='';
    if(pe){const d=(x.top.e-pe.top.e)/pe.top.e;const dc=Math.round(d*100);cmp='<div class="sub">Best this cycle '+esc(x.top.w)+'×'+esc(x.top.r)+' vs '+esc(pe.top.w)+'×'+esc(pe.top.r)+' in cycle '+prevNum+' <span class="'+(dc>0?'up':dc<0?'down':'flat')+'">'+(dc>0?'▲ ':dc<0?'▼ ':'')+Math.abs(dc)+'%</span></div>'}
    h+='<div class="exstat"><div class="t"><b>'+esc(x.name)+'</b><span class="pct '+cls+'">'+(ch>0?'▲ ':ch<0?'▼ ':'')+Math.abs(ch)+'%</span></div><div class="sub">'+esc(x.first.w)+'×'+esc(x.first.r)+' → '+esc(x.last.w)+'×'+esc(x.last.r)+' · '+x.n+' sessions</div>'+cmp+'</div>';
  });
  if(once.length)h+='<p class="sub" style="margin-top:10px">Logged once so far: '+once.map(x=>esc(x.name)).join(', ')+'</p>';
  h+='</div>';
  // ratings
  const totalR=st.ratings.reduce((a,b)=>a+b,0);
  if(totalR){
    const mx=Math.max(...st.ratings.slice(1));
    h+='<div class="card"><h3>How exercises felt</h3><div class="sub" style="margin-bottom:6px">'+totalR+' rated exercise'+(totalR===1?'':'s')+'</div>';
    for(let r=1;r<=5;r++)h+='<div class="rbar"><span>'+RATE[r]+'</span><div class="tr"><i style="width:'+(mx?st.ratings[r]/mx*100:0)+'%"></i></div><span class="n">'+st.ratings[r]+'</span></div>';
    h+='</div>';
  }
  h+='<p class="foot">Progress % compares estimated one-rep max (weight × (1 + reps ÷ 30)), so sets with different reps can be compared fairly. Weeks before the current one with no workouts count as missed.'+(pv?' Arrows compare with cycle '+prevNum+(st.current?' at the same point (weeks 1–'+st.reach+')':'')+'.':' Finish more cycles to compare them against each other.')+'</p>';
  return h;
}

/* ---------- actions ---------- */
function startDay(dayId){
  const c=S.program.cycle;
  const open=openSessionFor(dayId);
  if(open)return go({name:'workout',id:open.id,back:{name:'home'}});
  const fin=finishedFor(c.num,c.week,dayId);
  if(fin)return go({name:'workout',id:fin.id,back:{name:'home'}});
  const d=findDay(dayId);if(!d)return;
  const slots=daySlots(c.week,dayId);
  if(!slots.length){toast('Nothing planned for '+d.name+' in week '+c.week);return go({name:'program',pweek:c.week})}
  const mk=n=>Array.from({length:n},()=>({w:'',r:'',done:false}));
  const s={id:'s'+nid(),cycle:c.num,week:c.week,dayId:d.id,dayName:d.name,date:Date.now(),finished:false,note:'',
    items:slots.map(sl=>{const x=libEx(sl.exId)||{name:'Exercise',video:'',subs:[]};return{exId:sl.exId,sid:sl.sid,name:x.name,warmup:sl.warmup,planSets:sl.sets,reps:sl.reps,target:'',rest:sl.rest,ss:sl.ss||'',tech:sl.tech||'',video:x.video,subs:clone(x.subs),rirs:sl.rirs.slice(),swap:'',swapVideo:'',rating:0,warm:[],sets:mk(sl.sets)}})};
  for(const k in S.sessions)if(S.sessions[k].draft)delete S.sessions[k];
  s.draft=true;S.sessions[s.id]=s;
  go({name:'workout',id:s.id,back:{name:'home'}});
}
/* ---------- imported programme (transcribed from the old app's export) ---------- */
const IMPORTED=null;
// Matches days and exercises you already have by name, so history, video links and
// any substitutions you added yourself are kept. Replaces weeks 1-12 for those days.
function importProgramme(){
  if(!IMPORTED)return;
  const src=clone(IMPORTED),p=S.program;
  const dayMap={};
  src.program.days.forEach(d=>{const ex=p.days.find(x=>norm(x.name)===norm(d.name));dayMap[d.id]=ex?ex.id:d.id});
  const days=src.program.days.map(d=>({id:dayMap[d.id],name:d.name}));
  p.days.forEach(d=>{if(!days.some(x=>x.id===d.id))days.push(d)});
  const exMap={};
  for(const k in src.program.lib){
    const x=src.program.lib[k];const ex=Object.values(p.lib).find(y=>norm(y.name)===norm(x.name));
    if(ex){
      exMap[k]=ex.id;if(!ex.notes)ex.notes=x.notes;
      const have=new Set(ex.subs.map(z=>norm(z.name)));
      x.subs.forEach(z=>{if(!have.has(norm(z.name))&&ex.subs.length<10)ex.subs.push(z)});
    }else{exMap[k]=k;p.lib[k]=normLib(x)}
  }
  p.days=days;p.length=12;p.cycle.week=clamp(p.cycle.week,1,12);
  const list=[];
  for(const n in src.weeks){
    const w=src.weeks[n],nd={};
    for(const did in w.days)nd[dayMap[did]]=w.days[did].map(sl=>normSlot(Object.assign({},sl,{exId:exMap[sl.exId]})));
    const old=S.weeks[n];if(old)for(const k in old.days)if(!(k in nd))nd[k]=old.days[k];
    S.weeks[n]={n:+n,days:nd};list.push(+n);
  }
  saveProgram(0);saveWeeks(list);
}
function keepVideos(oldLib){
  const byName={};Object.values(oldLib||{}).forEach(x=>{byName[norm(x.name)]=x});
  Object.values(S.program.lib).forEach(x=>{const o=(oldLib||{})[x.id]||byName[norm(x.name)];if(!o)return;
    if(!x.video&&o.video)x.video=o.video;
    x.subs.forEach(z=>{if(z.video)return;const m=o.subs.find(q=>norm(q.name)===norm(z.name));if(m&&m.video)z.video=m.video});
  });
}
function restoreFrom(txt){
  let o=null;try{o=JSON.parse(txt||'')}catch(err){}
  if(o&&!o.program&&o.starts&&typeof o.starts==='object'){const n=mergeStarts(o.starts);toast('Loaded '+n+' starting points');return true}
  if(!o||!o.program){toast("That doesn't look like a backup from this tracker");return false}
  const oldLib=clone(S.program.lib);
  applyLoaded(o);keepVideos(oldLib);
  const ids=[];
  (Array.isArray(o.sessions)?o.sessions:[]).forEach(x=>{const ss=normSession(x,x&&x.id);if(ss){deleted.delete(ss.id);S.sessions[ss.id]=ss;ids.push(ss.id)}});
  Object.assign(S.templates,normTemplates(o.templates));
  let msg='Backup restored';
  if(!Object.keys(S.templates).length&&S.program.days.length){const t=snapshotTemplate(DEFAULT_TEMPLATE);S.templates[t.id]=t;msg+=' · saved as template "'+DEFAULT_TEMPLATE+'"'}
  saveProgram(0);saveWeeks(Object.keys(S.weeks).map(Number));uploadSessions(ids);saveLocal();
  view.restore=false;view.restoreText='';toast(msg);return true;
}
const backupJSON=()=>JSON.stringify({app:'workout-log',v:2,exported:Date.now(),program:S.program,weeks:S.weeks,sessions:sessList(),templates:S.templates});
app.addEventListener('change',e=>{
  const t=e.target;if(!(t.dataset&&t.dataset.in==='bkfile')||!t.files||!t.files[0])return;
  const f=t.files[0];t.value='';
  f.text().then(txt=>{if(restoreFrom(txt)){view.pweek=S.program.cycle.week;rerender()}}).catch(()=>toast("Couldn't read that file"));
});
/* ---------- GitHub auto-backup ----------
   Saves the same backup file you get from "Save backup file" into your private GitHub repository.
   One file, overwritten each time; GitHub keeps every earlier version in the repository's history.
   The access key is stored only on this phone and is never included in backups. */
const GHK='workoutlog_github';
let GH=(()=>{try{return JSON.parse(localStorage.getItem(GHK)||'null')||{}}catch(e){return{}}})();
function ghSave(){try{localStorage.setItem(GHK,JSON.stringify(GH))}catch(e){}}
const ghOn=()=>!!(GH.repo&&GH.token);
const phoneEmpty=()=>!S.program.days.length&&!sessList().length;
let ghBusy=false,ghTimer=0,ghAgain=false;
function b64(txt){const by=new TextEncoder().encode(txt);let s='';for(let i=0;i<by.length;i+=0x8000)s+=String.fromCharCode.apply(null,by.subarray(i,i+0x8000));return btoa(s)}
function gh(path,opt){
  opt=opt||{};
  const headers={'Authorization':'Bearer '+GH.token,'Accept':opt.accept||'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(opt.body)headers['Content-Type']='application/json';
  return fetch('https://api.github.com/repos/'+GH.repo+path,{method:opt.method||'GET',headers,body:opt.body,cache:'no-store'});
}
const ghFile=()=>'/contents/'+String(GH.path||'workout-log-backup.json').split('/').map(encodeURIComponent).join('/');
function ghErrText(){
  const e=String(GH.err||'');
  if(e==='401')return'GitHub did not accept the access key. Check it, or make a new one.';
  if(e==='404')return'Can not find that repository. Check the name and that the key has access to it.';
  if(e==='403')return'The access key can not write to that repository. It needs Contents: Read and write.';
  return'Could not reach GitHub. It will try again.';
}
async function ghBackup(manual){
  if(!ghOn())return;
  if(ghBusy){ghAgain=true;return}   // a backup is already running: run again right after so nothing is missed
  if(phoneEmpty()){GH.pending=false;ghSave();refreshGh();if(manual)toast('Nothing to back up yet. Restore from GitHub or load a backup first');return}
  if(!navigator.onLine){GH.pending=true;ghSave();refreshGh();if(manual)toast('No signal. It will back up when you are online');return}
  ghBusy=true;clearTimeout(ghTimer);refreshGh();
  try{
    let sha;
    const g=await gh(ghFile()+'?ref=main');
    if(g.ok)sha=(await g.json()).sha;else if(g.status!==404)throw new Error(g.status);
    const body={message:'Workout Log backup '+new Date().toISOString().slice(0,16).replace('T',' '),content:b64(backupJSON())};
    if(sha)body.sha=sha;
    const r=await gh(ghFile(),{method:'PUT',body:JSON.stringify(body)});
    if(!r.ok)throw new Error(r.status);
    GH.last=Date.now();GH.pending=false;GH.err='';ghSave();
    if(manual)toast('Backed up to GitHub ✓');
  }catch(e){
    GH.pending=true;GH.err=String(e&&e.message||e);ghSave();
    if(manual)toast(ghErrText());
  }
  ghBusy=false;refreshGh();
  if(ghAgain){ghAgain=false;ghBackup(false)}
}
// any change on the phone: back up ~20 s later (so a burst of edits makes one backup)
function ghSchedule(){if(!ghOn())return;GH.pending=true;ghSave();clearTimeout(ghTimer);ghTimer=setTimeout(()=>ghBackup(false),20000);refreshGh()}
async function ghRestore(){
  if(!ghOn())return;
  if(!navigator.onLine){toast('No signal. Try again when you are online');return}
  try{
    const r=await gh(ghFile()+'?ref=main',{accept:'application/vnd.github.raw+json'});
    if(!r.ok){GH.err=String(r.status);toast(r.status===404?'No backup in that repository yet':ghErrText());return}
    if(restoreFrom(await r.text())){view.pweek=S.program.cycle.week;rerender()}
  }catch(e){toast('Could not reach GitHub')}
}
async function ghConnect(){
  const repo=(document.getElementById('ghrepo')||{}).value||'',token=(document.getElementById('ghtoken')||{}).value||'';
  const rp=repo.trim().replace(/^https?:\/\/github\.com\//i,'').replace(/\.git$/,'').replace(/\/+$/,'');
  if(!/^[\w.-]+\/[\w.-]+$/.test(rp)){toast('Enter the repository as owner/name, e.g. MindeSF/WorkoutHTML');return}
  if(!token.trim()){toast('Paste your GitHub access key');return}
  if(!navigator.onLine){toast('Connect while you have signal');return}
  GH={repo:rp,token:token.trim(),path:'workout-log-backup.json',pending:true};
  try{
    const r=await gh('');
    if(!r.ok){GH.err=String(r.status);const t=ghErrText();GH={};ghSave();toast(t);refreshGh();return}
  }catch(e){GH={};ghSave();toast('Could not reach GitHub');refreshGh();return}
  let remote=false;try{remote=(await gh(ghFile()+'?ref=main')).ok}catch(e){}
  if(remote&&phoneEmpty()){GH.pending=false;ghSave();rerender();toast('Connected. Found your backup on GitHub: tap Restore from GitHub to load it');return}
  ghSave();toast('Connected to '+rp);rerender();ghBackup(true);
}
function ghStatus(){
  if(ghBusy)return'<span class="dot busy"></span>Backing up…';
  if(GH.pending){
    if(!navigator.onLine)return'<span class="dot warn"></span>No signal. It will back up when you are online.';
    if(ghRealErr())return'<span class="dot warn"></span>'+esc(ghErrText());
    if(GH.err)return'<span class="dot busy"></span>No signal. It will back up when you are online.';
    return'<span class="dot busy"></span>Changes waiting to back up';
  }
  if(GH.last)return'<span class="dot ok"></span>Backed up '+esc(fmtDate(GH.last))+' at '+new Date(GH.last).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return'<span class="dot"></span>Not backed up yet';
}
function ghCardHTML(){
  if(!ghOn())return'<p class="sub" style="margin-top:0">Back up automatically to your private GitHub repository whenever you have signal. At the gym with no signal, it waits and backs up next time you are online.</p>'+
    '<label class="lbl">Repository<input class="field" id="ghrepo" value="'+esc(GH.repo||'MindeSF/WorkoutHTML')+'" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="owner/name"></label>'+
    '<label class="lbl">Access key<input class="field" id="ghtoken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label>'+
    '<button class="btn sm primary" data-act="ghConnect">Connect</button>';
  return'<div class="ghs" id="ghstatus">'+ghStatus()+'</div><p class="sub" style="margin:6px 0 10px">To <b>'+esc(GH.repo)+'</b> · '+esc(GH.path||'workout-log-backup.json')+'</p>'+
    '<div class="exf" style="margin-top:0"><button class="btn sm primary" data-act="ghNow">Back up now</button><button class="btn sm" data-act="ghRestore" data-confirm>Restore from GitHub</button><button class="btn sm ghost danger" data-act="ghOff" data-confirm>Disconnect</button></div>';
}
// compact live status for the top-right corner of every screen
const ghRealErr=()=>/^\d+$/.test(String(GH.err||''));   // GitHub answered with an error (bad key, no access); not just "no signal"
function ghTopStatus(){
  if(!ghOn())return'<span class="dot warn"></span>GitHub not connected';
  if(ghBusy)return'<span class="dot busy"></span>Backing up…';
  if(GH.pending){
    if(ghRealErr())return'<span class="dot warn"></span>Backup problem';
    if(!navigator.onLine||GH.err)return'<span class="dot busy"></span>No signal · will back up';
    return'<span class="dot busy"></span>Backup waiting';
  }
  if(GH.last){const d=new Date(GH.last),today=d.toDateString()===new Date().toDateString();
    return'<span class="dot ok"></span>Backed up '+(today?d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString(undefined,{day:'numeric',month:'short'}))}
  return'<span class="dot busy"></span>Not backed up yet';
}
function refreshGh(){
  const el=document.getElementById('ghstatus');if(el)el.innerHTML=ghStatus();
  const st=document.getElementById('status');if(st)st.innerHTML=ghTopStatus();
}
// keep trying while the app is open (a weak gym signal can fail without the phone ever going "offline")
setInterval(()=>{if(ghOn()&&GH.pending&&navigator.onLine&&!ghBusy)ghBackup(false);refreshGh()},300000);
window.addEventListener('online',()=>{refreshGh();if(GH.pending)ghBackup(false)});
window.addEventListener('offline',refreshGh);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&GH.pending&&navigator.onLine)ghBackup(false)});
function normStarts(m){const o={};if(m&&typeof m==='object')Object.keys(m).slice(0,300).forEach(k=>{const v=m[k];if(v&&String(v.w||'').trim())o[norm(k)]={w:String(v.w).trim().slice(0,12),r:String(v.r||'').trim().slice(0,12),note:String(v.note||'').slice(0,80)}});return o}
// What to compare against: your last time doing it (any week, any run), otherwise its starting point
const INC_DEF={machine:'5',db:'2',plate:'0.25'};
const INC_LABEL={machine:'Cable & machine',db:'Dumbbell',plate:'Barbell & plates'};
function normIncs(m){const o={};if(m&&typeof m==='object')Object.keys(m).slice(0,300).forEach(k=>{const v=String(m[k]||'').trim().replace(',','.');if(num(v)>0)o[norm(k)]=v.slice(0,8)});return o}
function normIncDefaults(m){const o=Object.assign({},INC_DEF);if(m&&typeof m==='object')for(const k in INC_DEF){const v=String(m[k]||'').trim().replace(',','.');if(num(v)>0)o[k]=v.slice(0,8)}return o}
// Which kind of equipment an exercise uses, from its name. Bodyweight moves get no weight step.
function equipOf(name){
  const n=String(name||'').toLowerCase();
  if(/\b(pull-up|chin-up|nordic|sissy squat|dip)\b/.test(n))return'bw';
  if(/\bdb\b|dumbbell/.test(n))return'db';
  if(/barbell|ez-bar|smith|hack squat|leg press|t-bar|deadlift|\brdl\b|plate|hyperextension/.test(n))return'plate';
  return'machine';
}
function stepFor(name){
  const p=S.program,own=(p.incs||{})[norm(name)];if(own)return num(own);
  const e=equipOf(name);if(e==='bw')return 0;
  return num((p.incDefaults||INC_DEF)[e]||INC_DEF[e]);
}
const fmtW=x=>String(Math.round(x*100)/100);
// Double progression: every set at your top weight last time reached the top of the rep range -> go up one step.
function suggestFor(it,last){
  if(!last||last.start)return null;
  const nums=String(it.reps||'').match(/\d+/g);if(!nums)return null;
  const lo=+nums[0],hi=+nums[nums.length-1];
  const sets=(last.sets||[]).filter(x=>num(x.w)>0&&parseInt(x.r)>0);if(!sets.length)return null;
  const top=Math.max(...sets.map(x=>num(x.w))),atTop=sets.filter(x=>num(x.w)===top);
  const step=stepFor(perfName(it));
  if(step>0&&atTop.every(x=>parseInt(x.r)>=hi))return{dir:'up',w:top+step,step};
  return{dir:atTop.some(x=>parseInt(x.r)<lo)?'low':'hold',w:top,step};
}
// One series: best set per session as estimated 1-rep max, oldest to newest. Tap a point for the details.
function progressChart(rows){
  const pts=rows.slice().reverse().map(({s,it})=>{let best=null;it.sets.forEach(x=>{const e=e1rm(x.w,x.r);if(e&&(!best||e>best.e))best={e,w:x.w,r:x.r}});return best&&{date:s.date,...best}}).filter(Boolean);
  if(pts.length<2)return'<div class="card sub">Log this exercise in two sessions to see a progress chart.</div>';
  const W=320,H=150,L=34,R=10,T=12,B=24,u=esc(S.program.unit);
  let lo=Math.min(...pts.map(p=>p.e)),hi=Math.max(...pts.map(p=>p.e));
  const pad=Math.max((hi-lo)*0.15,hi*0.03,1);lo=Math.max(0,lo-pad);hi=hi+pad;
  const X=i=>L+(W-L-R)*(pts.length===1?0.5:i/(pts.length-1)),Y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const ticks=[lo,(lo+hi)/2,hi];
  let g='';
  ticks.forEach(v=>{g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="#2a2e33" stroke-width="1"/><text x="'+(L-6)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end" font-size="12" fill="#9aa0a8">'+Math.round(v)+'</text>'});
  const line=pts.map((p,i)=>X(i).toFixed(1)+','+Y(p.e).toFixed(1)).join(' ');
  g+='<polyline points="'+line+'" fill="none" stroke="#c8f169" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  pts.forEach((p,i)=>{const lab=fmtDate(p.date)+': '+p.w+' '+u+' × '+p.r+' (est. 1-rep max '+Math.round(p.e)+' '+u+')';
    g+='<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.e).toFixed(1)+'" r="4" fill="#c8f169" stroke="#16181b" stroke-width="2"/><circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.e).toFixed(1)+'" r="14" fill="transparent" tabindex="0" data-tip="'+esc(lab)+'"><title>'+esc(lab)+'</title></circle>'});
  const d0=new Date(pts[0].date).toLocaleDateString(undefined,{day:'numeric',month:'short'}),d1=new Date(pts[pts.length-1].date).toLocaleDateString(undefined,{day:'numeric',month:'short'});
  g+='<text x="'+L+'" y="'+(H-6)+'" font-size="12" fill="#9aa0a8">'+esc(d0)+'</text><text x="'+(W-R)+'" y="'+(H-6)+'" text-anchor="end" font-size="12" fill="#9aa0a8">'+esc(d1)+'</text>';
  const ch=Math.round((pts[pts.length-1].e-pts[0].e)/pts[0].e*100);
  return'<div class="card"><div class="exh"><h3>Progress</h3><span class="pct '+(ch>0?'up':ch<0?'down':'flat')+'" style="font:700 19px \'Bebas Neue\',system-ui">'+(ch>0?'▲ ':ch<0?'▼ ':'')+Math.abs(ch)+'%</span></div><div class="sub">Best set each session, as estimated 1-rep max ('+u+')</div>'+
    '<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Progress over '+pts.length+' sessions, from '+Math.round(pts[0].e)+' to '+Math.round(pts[pts.length-1].e)+' '+u+' estimated 1-rep max" style="display:block;margin-top:10px;overflow:visible">'+g+'</svg></div>';
}
function prevFor(name,s,sid){
  const l=lastFor(name,s.id,s.date,sid);if(l)return l;
  const st=(S.program.starts||{})[norm(name)];if(!st||!st.w)return null;
  return{start:true,note:st.note,sets:Array.from({length:20},()=>({w:st.w,r:st.r})),warm:[],rating:0};
}
function mergeStarts(m){
  const add=normStarts(m),n=Object.keys(add).length;
  S.program.starts=Object.assign(S.program.starts||{},add);
  const t=tplByName(DEFAULT_TEMPLATE);if(t)t.program.starts=Object.assign(t.program.starts||{},add);
  saveProgram(0);saveLocal();return n;
}
function move(arr,i,d){const j=i+d;if(i<0||j<0||j>=arr.length)return false;const t=arr[i];arr[i]=arr[j];arr[j]=t;return true}
function copyWeekTo(from,to){const src=S.weeks[from];S.weeks[to]={n:to,days:src?clone(src.days):{}}}

app.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b||!app.contains(b))return;
  if(b.hasAttribute('data-confirm')&&b.dataset.armed!=='1'){
    b.dataset.armed='1';const orig=b.textContent;b.textContent='Tap again to confirm';b.classList.add('armed');
    setTimeout(()=>{if(b.isConnected&&b.dataset.armed==='1'){b.dataset.armed='';b.textContent=orig;b.classList.remove('armed')}},3000);
    return;
  }
  const a=b.dataset.act,p=S.program,i=+b.dataset.i,j=+b.dataset.j,dd=+b.dataset.d;
  const s=view.name==='workout'?S.sessions[view.id]:null;
  if(s&&s.draft&&['done','addSet','rmSet','addWarm','rmWarm','clearRate','swapPick','swapOther','swapAlways','finish'].includes(a))touch(s);
  switch(a){
    case 'back':go(view.back||{name:'home'});break;
    case 'tab':go({name:b.dataset.tab});break;
    /* home & cycle */
    case 'week':p.cycle.week=clamp(p.cycle.week+dd,1,p.length);saveProgram();rerender();break;
    case 'nextWeek':p.cycle.week=clamp(p.cycle.week+1,1,p.length);saveProgram(0);rerender();toast('On to week '+p.cycle.week+' 💪');break;
    case 'undoCycle':{
      const pc=p.cycle.num-1,pm=p.cycles[pc];if(pc<1||!pm)break;
      delete p.cycles[pc];p.cycle={num:pc,week:clamp(pm.week||1,1,p.length)};
      saveProgram(0);go({name:'home'});toast('Back to cycle '+pc+', week '+p.cycle.week);break;
    }
    case 'finishCycle':{
      const n=p.cycle.num;p.cycles[n]={end:Date.now(),done:true,week:p.cycle.week};
      p.cycle={num:n+1,week:1};
      saveProgram(0);toast('Cycle '+n+' complete 🎉');go({name:'stats',cyc:n});break;
    }
    case 'planWeek':go({name:'program',pweek:+b.dataset.n});break;
    case 'startDay':startDay(b.dataset.day);break;
    case 'open':go({name:'workout',id:b.dataset.id,back:{name:'history'}});break;
    case 'exhist':go({name:'exhist',exName:b.dataset.name,back:view});break;
    case 'cyc':view.cyc=+b.dataset.n;rerender();break;
    /* workout */
    case 'sweek':if(s){s.week=clamp(s.week+dd,1,S.program.length);
      // pick up that week's targets; sets you've already logged are left alone
      const plan=daySlots(s.week,s.dayId);
      s.items.forEach(it=>{const sl=plan.find(x=>x.sid===it.sid);if(!sl)return;
        Object.assign(it,{warmup:sl.warmup,planSets:sl.sets,reps:sl.reps,rirs:sl.rirs.slice(),rest:sl.rest,ss:sl.ss||'',tech:sl.tech||''});
        if(!it.sets.some(x=>x.w||x.r||x.done))it.sets=Array.from({length:sl.sets},()=>({w:'',r:'',done:false}));});saveSession(s.id);rerender()}break;
    case 'done':{
      if(!s)break;const it=s.items[i];if(!it)break;
      const warm=b.dataset.kind==='warm',arr=warm?it.warm:it.sets,st=arr[j];if(!st)break;
      st.done=!st.done;
      if(st.done){
        const last=prevFor(perfName(it),s,it.sid),ls=last&&(warm?last.warm:last.sets)[j];
        {const sg=warm?null:suggestFor(it,last);if(!st.w){if(sg&&sg.dir==='up')st.w=fmtW(sg.w);else if(ls&&ls.w)st.w=ls.w}}
        if(!st.r){if(!warm&&/^\d+$/.test(String(it.reps).trim()))st.r=String(it.reps).trim();else if(ls&&ls.r)st.r=ls.r}
        if(it.rest&&!warm)startRest(it.rest,perfName(it));
      }
      saveSession(s.id,300);rerender();break;
    }
    case 'addSet':if(s){s.items[i].sets.push({w:'',r:'',done:false});saveSession(s.id);rerender()}break;
    case 'rmSet':if(s&&s.items[i].sets.length>1){s.items[i].sets.pop();saveSession(s.id);rerender()}break;
    case 'addWarm':if(s&&s.items[i].warm.length<8){s.items[i].warm.push({w:'',r:'',done:false});saveSession(s.id);rerender()}break;
    case 'rmWarm':if(s&&s.items[i].warm.length){s.items[i].warm.pop();saveSession(s.id);rerender()}break;
    case 'rateToggle':view.rateOpen=view.rateOpen||{};view.rateOpen[i]=!view.rateOpen[i];rerender();break;
    case 'clearRate':if(s){s.items[i].rating=0;saveSession(s.id);rerender()}break;
    case 'notesOpen':view.notesOpen=view.notesOpen||{};view.notesOpen[i]=!view.notesOpen[i];rerender();break;
    case 'swapAlways':{
      if(!s)break;const it=s.items[i];if(!it||!it.swap)break;
      const r=replaceEverywhere(it);if(!r)break;
      s.items.forEach(x=>{if(x.exId===r.from){x.exId=r.to.id;x.name=r.to.name;x.swap='';x.swapVideo='';x.video=r.to.video;x.subs=clone(r.to.subs)}});
      view.swapOpen=null;saveSession(s.id,0);rerender();
      toast(r.to.name+' now replaces '+r.fromName+' in '+r.count+' workout'+(r.count===1?'':'s')+' across all weeks');break;
    }
    case 'swapOpen':view.swapOpen=view.swapOpen===i?null:i;rerender();break;
    case 'swapPick':{
      if(!s)break;const it=s.items[i];const k=+b.dataset.k;
      if(k<0){it.swap='';it.swapVideo=''}
      else{const z=subsFor(it)[k];if(!z)break;it.swap=z.name;it.swapVideo=safeUrl(z.video)||safeUrl((libByName(z.name)||{}).video)}
      view.swapOpen=null;saveSession(s.id,0);rerender();toast(it.swap?'Swapped to '+it.swap+' for today':'Back to '+it.name);break;
    }
    case 'swapOther':{
      if(!s)break;const it=s.items[i];const inp=document.getElementById('so-'+i);const v=inp?inp.value.trim().slice(0,80):'';
      if(!v){toast('Type the exercise you’re doing instead');if(inp)inp.focus();break}
      it.swap=norm(v)===norm(it.name)?'':v;it.swapVideo='';view.swapOpen=null;saveSession(s.id,0);rerender();toast('Swapped to '+v+' for today');break;
    }
    case 'finish':if(s){s.finished=true;saveSession(s.id,0);setTimeout(()=>ghBackup(false),50);stopRest();toast('Workout saved 💪');go({name:'home'})}break;
    case 'delSession':if(s){
      const id=s.id;deleted.add(id);delete S.sessions[id];
      const w=W['s:'+id];if(w&&w.t){clearTimeout(w.t);w.t=null}
      saveLocal();
      if(mode==='cloud'){sessCol.doc(id).delete().catch(()=>{})}
      stopRest();toast('Workout deleted');go(view.back&&view.back.name==='history'?{name:'history'}:{name:'home'});
    }break;
    /* program */
    case 'pweek':view.pweek=+b.dataset.n;rerender();break;
    case 'copyPrev':{const n=view.pweek;if(n>1){copyWeekTo(n-1,n);saveWeek(n,0);rerender();toast('Copied week '+(n-1)+' into week '+n)}break}
    case 'copyLater':{const n=view.pweek,list=[];for(let k=n+1;k<=p.length;k++){copyWeekTo(n,k);list.push(k)}saveWeeks(list);rerender();toast('Copied week '+n+' to weeks '+(n+1)+'–'+p.length);break}
    case 'copyDayPrev':{const n=view.pweek,id=b.dataset.day;week(n).days[id]=clone(daySlots(n-1,id));saveWeek(n,0);rerender();toast('Copied from week '+(n-1));break}
    case 'importProg':importProgramme();view.pweek=1;rerender();toast('12-week programme loaded 💪');break;
    case 'quick':['Upper','Lower','Push','Pull','Arms'].forEach(n=>p.days.push({id:'d'+nid(),name:n}));saveProgram(0);rerender();break;
    case 'addDay':p.days.push({id:'d'+nid(),name:'Day '+(p.days.length+1)});saveProgram(0);rerender();
      {const ins=app.querySelectorAll('.dayedit input');const l=ins[ins.length-1];if(l){l.focus();l.select()}}break;
    case 'mvDay':{const k=p.days.findIndex(x=>x.id===b.dataset.day);if(move(p.days,k,dd)){saveProgram();rerender()}break}
    case 'delDay':{
      const id=b.dataset.day;p.days=p.days.filter(x=>x.id!==id);
      const touched=[];for(const n in S.weeks){if(S.weeks[n].days[id]){delete S.weeks[n].days[id];touched.push(+n)}}
      saveProgram(0);saveWeeks(touched);rerender();toast('Day deleted');break;
    }
    case 'mvEx':{const arr=daySlots(view.pweek,b.dataset.day);const k=arr.findIndex(x=>x.sid===b.dataset.sid);if(move(arr,k,dd)){saveWeek(view.pweek);rerender()}break}
    case 'newEx':progReturn={y:window.scrollY,week:view.pweek,sid:null};go({name:'exercise',week:view.pweek,dayId:b.dataset.day,sid:null,pweek:view.pweek,draft:{libId:'new',name:'',video:'',notes:'',subs:[],warmup:'',sets:'3',reps:'',rirs:[],rest:'120',ss:'',tech:'',later:false},back:{name:'program',pweek:view.pweek}});break;
    case 'editEx':{
      progReturn={y:window.scrollY,week:view.pweek,sid:b.dataset.sid};
      const sl=daySlots(view.pweek,b.dataset.day).find(x=>x.sid===b.dataset.sid);if(!sl)break;
      const d={libId:libEx(sl.exId)?sl.exId:'new',warmup:sl.warmup,sets:String(sl.sets),reps:sl.reps,rirs:sl.rirs.slice(),rest:sl.rest?String(sl.rest):'',ss:sl.ss||'',tech:sl.tech||'',later:false};
      libToDraft(d,sl.exId);
      go({name:'exercise',week:view.pweek,dayId:b.dataset.day,sid:sl.sid,draft:d,back:{name:'program',pweek:view.pweek}});break;
    }
    case 'addSub':if(view.name==='exercise'&&view.draft.subs.length<10){view.draft.subs.push({name:'',video:'',notes:''});rerender();const ins=app.querySelectorAll('[data-in=subName]');const l=ins[ins.length-1];if(l)l.focus()}break;
    case 'rmSub':if(view.name==='exercise'){view.draft.subs.splice(+b.dataset.k,1);rerender()}break;
    case 'saveEx':{
      const d=view.draft,n=view.week;if(!findDay(view.dayId)){go({name:'program',pweek:n});break}
      if(!d.name.trim()){toast('Give the exercise a name');break}
      const url=safeUrl(d.video);
      if(d.video.trim()&&!url){toast("That video link doesn't look right");break}
      const subs=d.subs.filter(z=>z.name.trim());
      const badSub=subs.find(z=>z.video.trim()&&!safeUrl(z.video));
      if(badSub){toast('The video link for '+badSub.name.trim()+" doesn't look right");break}
      const exId=d.libId==='new'?'x'+nid():d.libId;
      {p.starts=p.starts||{};const sk=norm(d.name),w=String(d.startW||'').trim(),r=String(d.startR||'').trim(),old=p.starts[sk];
       if(w)p.starts[sk]={w,r,note:old&&old.w===w&&old.r===r?old.note:'set by you'};else delete p.starts[sk];
       p.incs=p.incs||{};const inc=String(d.incStep||'').trim().replace(',','.');if(num(inc)>0)p.incs[sk]=inc;else delete p.incs[sk];}
      p.lib[exId]=normLib({id:exId,name:d.name.trim(),video:url,notes:d.notes,subs:subs.map(z=>({name:z.name,video:safeUrl(z.video),notes:z.notes||''}))});
      const slot=normSlot({sid:view.sid||('q'+nid()),exId,warmup:d.warmup.trim(),sets:d.sets,reps:d.reps.trim(),rirs:d.rirs.slice(0,rirCount(d)),rest:d.rest,ss:d.ss,tech:d.tech});
      const upsert=wk=>{const arr=week(wk).days[view.dayId]||(week(wk).days[view.dayId]=[]);const k=arr.findIndex(x=>x.sid===slot.sid);if(k>=0)arr[k]=clone(slot);else arr.push(clone(slot))};
      const list=[n];upsert(n);
      if(d.later&&n<p.length)for(let k=n+1;k<=p.length;k++){upsert(k);list.push(k)}
      saveProgram(0);saveWeeks(list);
      toast(list.length>1?'Saved to weeks '+n+'–'+p.length:'Saved to week '+n);go({name:'program',pweek:n});break;
    }
    case 'delEx':case 'delExLater':{
      const n=view.week,to=a==='delExLater'?p.length:n,list=[];
      for(let k=n;k<=to;k++){const arr=daySlots(k,view.dayId);const f=arr.filter(x=>x.sid!==view.sid);if(f.length!==arr.length){week(k).days[view.dayId]=f;list.push(k)}}
      saveWeeks(list);toast('Removed');go({name:'program',pweek:n});break;
    }
    case 'unit':p.unit=b.dataset.u==='lb'?'lb':'kg';saveProgram(0);rerender();break;
    case 'len':p.length=clamp(p.length+dd,1,52);p.cycle.week=clamp(p.cycle.week,1,p.length);view.pweek=clamp(view.pweek||1,1,p.length);saveProgram();rerender();break;
    case 'tplSave':{
      const inp=document.getElementById('tplname'),name=inp?inp.value.trim():'';
      if(!name){toast('Give the template a name');if(inp)inp.focus();break}
      const old=tplByName(name),t=snapshotTemplate(name,old&&old.id);S.templates[t.id]=t;saveLocal();rerender();
      toast((old?'Updated':'Saved')+' template "'+t.name+'"');break;
    }
    case 'tplLoad':{const t=S.templates[b.dataset.id];if(!t)break;loadTemplate(t);view.pweek=1;rerender();toast('Loaded "'+t.name+'"');break}
    case 'tplDel':{const t=S.templates[b.dataset.id];if(!t)break;delete S.templates[t.id];saveLocal();rerender();toast('Deleted "'+t.name+'"');break}
    case 'ghGo':go({name:'program'});{const el=document.getElementById('ghsect');if(el)el.scrollIntoView({block:'start'})}break;
    case 'restAlerts':toggleRestAlerts();break;
    case 'ghConnect':ghConnect();break;
    case 'ghNow':ghBackup(true);break;
    case 'ghRestore':ghRestore();break;
    case 'ghOff':GH={};ghSave();rerender();toast('Disconnected from GitHub');break;
    case 'saveBackupFile':{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([backupJSON()],{type:'application/json'}));
      a.download='workout-log-backup-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a);a.click();
      setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
      toast('Backup saved to your Downloads');break;
    }
    case 'copyBackup':{
      const txt=JSON.stringify({app:'workout-log',v:2,exported:Date.now(),program:S.program,weeks:S.weeks,sessions:sessList()});
      const fallback=()=>{view.backupText=txt;rerender()};
      try{navigator.clipboard.writeText(txt).then(()=>toast('Backup copied. Paste it into a note to keep it safe.'),fallback)}catch(err){fallback()}
      break;
    }
    case 'showRestore':view.restore=!view.restore;view.backupText='';rerender();break;
    case 'doRestore':{
      if(restoreFrom(view.restoreText))rerender();break;
    }
  }
});

app.addEventListener('input',e=>{
  const t=e.target,f=t.dataset&&t.dataset.in;if(!f)return;
  if(view.name==='workout'){
    const s=S.sessions[view.id];if(!s)return;touch(s);
    if(f==='note')s.note=t.value.slice(0,3000);
    else if(f==='rating'){const it=s.items[+t.dataset.i];if(!it)return;setRating(it,t,+t.value)}
    else{const it=s.items[+t.dataset.i];if(!it)return;const st=(t.dataset.kind==='warm'?it.warm:it.sets)[+t.dataset.j];if(!st)return;st[f]=t.value.trim().slice(0,12);
      const el=document.getElementById('cmp-'+t.dataset.i+'-'+t.dataset.j);
      if(el&&t.dataset.kind!=='warm'){const last=prevFor(perfName(it),s,it.sid);el.innerHTML=cmpHTML(st,last&&last.sets[+t.dataset.j])}
      const dc=document.getElementById('drop-'+t.dataset.i);if(dc)dc.innerHTML=dropHTML(it)}
    saveSession(s.id);
  }else if(view.name==='program'){
    if(f==='dayName'){const d=findDay(t.dataset.day);if(d){d.name=t.value.slice(0,40);saveProgram()}}
    else if(f==='restore')view.restoreText=t.value;
    else if(f==='incDef'){const v=t.value.trim().replace(',','.');S.program.incDefaults=S.program.incDefaults||Object.assign({},INC_DEF);if(num(v)>0){S.program.incDefaults[t.dataset.k]=v;saveProgram()}}
  }else if(view.name==='exercise'){
    const d=view.draft;
    if(f==='subName'||f==='subVideo'||f==='subNotes'){const z=d.subs[+t.dataset.k];if(z)z[{subName:'name',subVideo:'video',subNotes:'notes'}[f]]=t.value}
    else if(f==='rirSet')d.rirs[+t.dataset.k]=t.value;
    else if(f==='later')d.later=t.checked;
    else if(f==='libId'){
      d.libId=t.value;libToDraft(d,d.libId==='new'?null:d.libId);
      if(!view.sid&&d.libId!=='new'){const sl=latestSlotFor(d.libId,view.week);if(sl){d.warmup=sl.warmup;d.sets=String(sl.sets);d.reps=sl.reps;d.rirs=sl.rirs.slice();d.rest=sl.rest?String(sl.rest):'';d.ss=sl.ss||'';d.tech=sl.tech||''}}
      rerender();
    }
    else{d[f]=t.value;if(f==='sets'){const box=document.getElementById('rirbox');if(box)box.innerHTML=rirFields(d)}}
  }
});
function setRating(it,el,v){
  v=clamp(v|0,1,5);it.rating=v;
  const box=el.closest('.rate');if(!box)return;
  box.classList.remove('unset');
  const rv=box.querySelector('.rv');rv.textContent=RATE[v];rv.className='rv r'+v;
  el.setAttribute('aria-valuetext',RATE[v]);
  if(!box.querySelector('[data-act=clearRate]')){const c=document.createElement('button');c.className='linkbtn';c.dataset.act='clearRate';c.dataset.i=el.dataset.i;c.textContent='Clear rating';box.appendChild(c)}
}
// tapping the slider without moving it (e.g. on "Just right") still records a rating
app.addEventListener('pointerup',e=>{
  const t=e.target;if(!(t.dataset&&t.dataset.in==='rating')||view.name!=='workout')return;
  const s=S.sessions[view.id],it=s&&s.items[+t.dataset.i];
  if(it&&!it.rating){touch(s);setRating(it,t,+t.value);saveSession(s.id)}
});
app.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.target.tagName!=='INPUT')return;
  const ins=[...app.querySelectorAll('.sets input')];const k=ins.indexOf(e.target);
  if(k>=0){e.preventDefault();if(ins[k+1])ins[k+1].focus();else e.target.blur()}
});
// arrow keys move between weeks on the Program tab (when not typing in a field)
document.addEventListener('keydown',e=>{
  if(view.name!=='program'||!S.program.days.length||typing()||e.altKey||e.ctrlKey||e.metaKey)return;
  const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!d)return;
  const n=clamp((view.pweek||1)+d,1,S.program.length);if(n===view.pweek)return;
  e.preventDefault();view.pweek=n;rerender();
  const c=document.querySelector('#wchips .chip.on');if(c)c.focus({preventScroll:true});
});
// chart tooltips (hover on desktop, tap on phone)
const tip=document.createElement('div');tip.className='tip';tip.hidden=true;document.body.appendChild(tip);
function showTip(el){const r=el.getBoundingClientRect();tip.textContent=el.dataset.tip;tip.hidden=false;tip.style.left=Math.min(window.innerWidth-80,Math.max(80,r.left+r.width/2))+'px';tip.style.top=(r.top-6)+'px'}
app.addEventListener('pointerover',e=>{const el=e.target.closest('[data-tip]');if(el)showTip(el)});
app.addEventListener('pointerout',e=>{if(e.target.closest('[data-tip]'))tip.hidden=true});
app.addEventListener('focusin',e=>{const el=e.target.closest('[data-tip]');if(el)showTip(el)});
app.addEventListener('focusout',()=>{tip.hidden=true});
window.addEventListener('scroll',()=>{tip.hidden=true},{passive:true});
document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)go({name:b.dataset.tab})});

/* ---------- rest timer ---------- */
const restEl=document.getElementById('rest'),rT=restEl.querySelector('.t'),rL=restEl.querySelector('.l'),rBar=restEl.querySelector('.bar');
let rest={end:0,total:1,iv:0,hide:0,label:''};
const PREFK='workoutlog_prefs';
let PREFS=(()=>{try{return JSON.parse(localStorage.getItem(PREFK)||'null')||{}}catch(e){return{}}})();
function savePrefs(){try{localStorage.setItem(PREFK,JSON.stringify(PREFS))}catch(e){}}
const alertsOn=()=>!!(PREFS.restAlert&&'Notification' in window&&Notification.permission==='granted'&&'serviceWorker' in navigator);
let restNote=0;
function scheduleRestAlert(sec,label){
  clearTimeout(restNote);if(!alertsOn())return;
  restNote=setTimeout(()=>{
    if(document.visibilityState==='visible')return;   // the in-app bar and vibration already cover this
    navigator.serviceWorker.ready.then(r=>r.showNotification('Rest over',{body:'Next set: '+label,tag:'rest',renotify:true,vibrate:[300,120,300],icon:'icon-192.png',badge:'icon-192.png'})).catch(()=>{});
  },sec*1000);
}
async function toggleRestAlerts(){
  if(PREFS.restAlert){PREFS.restAlert=false;savePrefs();rerender();toast('Rest alerts off');return}
  if(!('Notification' in window)){toast('This phone does not support alerts for this app');return}
  let perm=Notification.permission;
  if(perm!=='granted'){try{perm=await Notification.requestPermission()}catch(e){perm='denied'}}
  if(perm!=='granted'){toast('Alerts are blocked. Allow notifications for this app in your phone settings');return}
  PREFS.restAlert=true;savePrefs();rerender();toast(alertsOn()?'Rest alerts on':'Alerts are blocked. Allow notifications for this app in your phone settings');
}
function startRest(sec,label){scheduleRestAlert(sec,label);
  clearInterval(rest.iv);clearTimeout(rest.hide);
  rest.end=Date.now()+sec*1000;rest.total=sec*1000;rest.label=label;
  rL.textContent='Rest · '+label;restEl.classList.remove('over');restEl.hidden=false;
  rest.iv=setInterval(tick,250);tick();
}
function tick(){
  const left=rest.end-Date.now();
  rT.textContent=fmtRest(Math.ceil(Math.max(0,left)/1000));
  rBar.style.width=Math.max(0,Math.min(100,100*left/rest.total))+'%';
  if(left<=0){
    clearInterval(rest.iv);restEl.classList.add('over');rL.textContent='Rest done. Next set!';
    try{if(navigator.vibrate)navigator.vibrate([200,100,200])}catch(e){}
    rest.hide=setTimeout(stopRest,8000);
  }
}
function stopRest(){clearInterval(rest.iv);clearTimeout(rest.hide);clearTimeout(restNote);restEl.hidden=true}
restEl.addEventListener('click',e=>{
  const b=e.target.closest('[data-rest]');if(!b)return;
  if(b.dataset.rest==='skip')return stopRest();
  const left=Math.max(0,rest.end-Date.now());startRest(Math.round(left/1000)+30,rest.label);
});

boot();
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
  navigator.serviceWorker.addEventListener('message',e=>{
    if(e.data!=='workout-log-updated')return;
    const b=document.getElementById('banner');
    b.innerHTML='A new version of Workout Log is ready. <button class="btn sm primary" id="upd" style="margin-left:8px">Reload</button>';b.hidden=false;
    document.getElementById('upd').onclick=()=>{flushAll();setTimeout(()=>location.reload(),300)};
  });
}
})();

