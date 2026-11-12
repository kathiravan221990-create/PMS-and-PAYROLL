/* ===== PMS layout (sample data) — same shell, CSS and helpers as CP PAYROLL ===== */
const MOCK={
 so:[{id:1,so:'2500154',date:'2025-05-07',vendor:'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED',variant:'SALTED CASHEW TINS',colour:'PRINTED',desc:'115 MM X 95 MM X 27 MM (HT) - SALTED CASHEW TINS',qty:700000,sent:420000},
     {id:2,so:'2500154',date:'2025-05-07',vendor:'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED',variant:'ALMOND TINS',colour:'PRINTED',desc:'101 MM DIA X 25 MM (HT) - ALMOND TINS',qty:300000,sent:120000},
     {id:3,so:'2501792',date:'2025-12-04',vendor:'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED',variant:'INDIGO',colour:'PRINTED',desc:'SALTED CASHEW NUTS TIN JAR 50G - INDIGO',qty:400000,sent:0},
     {id:4,so:'2600310',date:'2026-06-18',vendor:'CARATLANE TRADING PVT LTD - MH',variant:'CARATLANE',colour:'PRINTED',desc:'WALLET 27MM MANUAL',qty:150000,sent:37000}],
 shapes:{'RECTANGLE':{'WALLET 27MM AUTO':['115x95x27'],'WALLET 27MM MANUAL':['115x95x50','80x40x27']},'ROUND':{'101 DIA SLIP LID':['101x25']},'SQUARE':{'BUSH 65MM':['65X65X55']}},
 vendors:{'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED':['SALTED CASHEW TINS','ALMOND TINS','INDIGO'],'LBN INDUSTRIES':['PRINTED TIN'],'CARATLANE TRADING PVT LTD - MH':['CARATLANE']},
 colours:['PRINTED','COLOR','GOLD','CLEAR'],
 skids:[{no:'BOD/JUL/26/001',date:'2026-07-01',so:'',vendor:'LBN INDUSTRIES',variant:'PRINTED TIN',colour:'COLOR',shape:'SQUARE',job:'BUSH 65MM',spec:'65X65X55',comp:'BODY',gross:1200,net:1176,L:890,B:1016,W:0.19,from:'THINDIVANAM',dc:'J-175',status:'Used'},
        {no:'BOD/NOV/26/014',date:'2026-11-09',so:'2600310',vendor:'CARATLANE TRADING PVT LTD - MH',variant:'CARATLANE',colour:'PRINTED',shape:'RECTANGLE',job:'WALLET 27MM MANUAL',spec:'115x95x50',comp:'BODY',gross:1230,net:1210,L:890,B:1016,W:0.19,from:'PONDY',dc:'P-310',status:'Instock'},
        {no:'BOD/NOV/26/015',date:'2026-11-10',so:'2500154',vendor:'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED',variant:'ALMOND TINS',colour:'PRINTED',shape:'ROUND',job:'101 DIA SLIP LID',spec:'101x25',comp:'LID',gross:1210,net:1190,L:890,B:1016,W:0.19,from:'THINDIVANAM',dc:'J-402',status:'WIP'}]
};
/* ================= LIVE (Supabase) layer ================= */
const SB_URL='https://axnxhqcvevviwnncplwt.supabase.co';
const SB_KEY='sb_publishable_olHYJ6TZAcyqdGqIuhEyNw_GWe7nRv0';
const sb=supabase.createClient(SB_URL,SB_KEY);
let _busy=0,_lt;
function track(p){_busy++;clearTimeout(_lt);_lt=setTimeout(()=>{const l=document.getElementById('ldr');if(_busy>0&&l)l.style.display='flex'},150);
 const done=()=>{_busy=Math.max(0,_busy-1);if(!_busy){clearTimeout(_lt);const l=document.getElementById('ldr');if(l)l.style.display='none'}};
 return Promise.resolve(p).then(r=>{done();return r},e=>{done();throw e})}
const C=(fn,a)=>track(sb.schema('core_api').rpc(fn,a||{}));
const R=(fn,a)=>track(sb.schema('pms_api').rpc(fn,a||{}));
const pcan=p=>(ME?.permissions?.pms||[]).includes(p);
let TODAY=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
let EDIT_DAYS=7;let MXID={},MM_DIRTY=new Set();
const SAMPLE_VIEWS=[];let ATT_ROW={};
let DB_JOBS=[],CI_ID={},AI_ID={};
function cleanErr(m){m=String(m||'');const map={edit_window_closed:'This entry is older than '+EDIT_DAYS+' days. Only an Administrator or Manager can change it, or enter it with a back-date reason.',backdate_reason_required:'This date is older than '+EDIT_DAYS+' days. Type the reason for the back-dated entry.',skid_no_exists:'This skid number / name already exists.',skid_has_slitting:'This skid already has slitting entries. Delete those first.',man_power_required:'Enter the man power.',hours_required:'Enter the hours.',not_logged_in:'Please log in again.'};
 for(const k in map)if(m.includes(k))return map[k];if(m.includes('permission_denied'))return 'You do not have permission for this. ('+m+')';return m}
const dayDiff=d=>Math.round((Date.parse(TODAY)-Date.parse(d))/864e5);
const jobObj=(r,x)=>({vendor:r.vendor,variant:r.variant,colour:r.colour,shape:r.shape,job:r.job,spec:r.spec,...(x||{})});
function bdReason(){const b=document.getElementById('bdr');return b?b.value.trim():''}
function bdCheck(){const d=document.getElementById('d'),box=document.getElementById('bdbox');if(!d||!box)return;const n=d.value?dayDiff(d.value):0,old=n>EDIT_DAYS;
 box.style.display=old?'':'none';document.getElementById('bdn').textContent=old?` (${n} days ago)`:'';
 document.getElementById('bdmsg').textContent=pcan('edit_old')?'This date is older than '+EDIT_DAYS+' days. You can enter it directly; a reason is still recommended.':'This date is older than '+EDIT_DAYS+' days. Back-dating needs a reason and goes to the Administrator for review.'}
new MutationObserver(()=>{const m=document.getElementById('main');if(!m)return;const d=m.querySelector('#d[type=date]'),s=m.querySelector('#sv2');if(!d||!s||document.getElementById('bdbox'))return;
 const card=d.closest('.card'),box=document.createElement('div');box.id='bdbox';box.style.cssText='display:none;margin-top:12px;padding:10px 14px;border:1px solid #e0b53a;border-radius:12px;background:rgba(10,33,80,.55)';
 box.innerHTML='<b style="color:#f0cf6a">Back-dated entry<span id="bdn"></span></b><div class="mut" id="bdmsg" style="margin:4px 0"></div><label>Reason for back-dating<input id="bdr" placeholder="e.g. Power cut on that day, entry written on paper"></label>';
 card.appendChild(box);d.addEventListener('change',bdCheck);d.addEventListener('input',bdCheck);bdCheck()}).observe(document.documentElement,{childList:true,subtree:true});
async function saveLive(fn,payload,view,again){if(payload.entry_date&&dayDiff(payload.entry_date)>EDIT_DAYS&&!pcan('edit_old')&&bdReason().length<5)return toast(cleanErr('backdate_reason_required'),true);
 payload.backdate_reason=bdReason();const {error}=await R(fn,{p:payload});if(error)return toast(cleanErr(error.message),true);toast('Saved');await hydrate();again?again():go(view)}
async function delLive(kind,id){const {error}=await R('entry_delete',{p_kind:kind,p_id:id});if(error){toast(cleanErr(error.message),true);return false}await hydrate();return true}
async function hydrate(){const {data:D,error}=await R('bootstrap');if(error){toast(cleanErr(error.message),true);throw error}
 STOCK_BASE_LIVE=D.baseline;
 MOCK.so=D.so;SKIDS=D.skids;PROD=D.prod;SCRAP=D.scrap;SLITS=D.slits;OUT=D.out;CLED=D.cled;ALED=D.aled;
 OUT.forEach(o=>o.jid=jobId(o.colour,o.variant,o.shape,o.vendor,o.job,o.spec));
 OPEN_ST.length=0;D.open.forEach(x=>OPEN_ST.push(x));
 Object.keys(CARTON).forEach(k=>delete CARTON[k]);CI_ID={};D.carton_items.forEach(c=>{(CARTON[c.variation]=CARTON[c.variation]||[]).push(c.name);CI_ID[c.variation+'|'+c.name]=c.id});
 ATAPE=D.alum_items.map(a=>a.name);AI_ID={};D.alum_items.forEach(a=>AI_ID[a.name]=a.id);
 DB_JOBS=D.jobs;const V={},S={};D.jobs.forEach(j=>{(V[j.vendor]=V[j.vendor]||[]);if(!V[j.vendor].includes(j.variant))V[j.vendor].push(j.variant);((S[j.shape]=S[j.shape]||{})[j.job]=S[j.shape][j.job]||[]);if(!S[j.shape][j.job].includes(j.spec))S[j.shape][j.job].push(j.spec)});
 MOCK.vendors=V;MOCK.shapes=S;MOCK.colours=D.colours;
 const d0=new Date(Date.parse(TODAY)-92*864e5).toISOString().slice(0,10);
 const [jm,mx,rl,at,jc]=await Promise.all([R('job_master_list'),R('matrix_list'),R('rules_list'),R('att_range',{p_from:d0,p_to:TODAY}),R('job_calc_list')]);
 Object.keys(ATT_N).forEach(k=>delete ATT_N[k]);ATT_ROW={};
 (at.data||[]).forEach(x=>{(ATT_N[x.date]=ATT_N[x.date]||{})[x.des]=x.people;(ATT_ROW[x.date]=ATT_ROW[x.date]||{})[x.des]=x;DESIG[x.des]=!!x.counted});
 Object.keys(JC_SAVED).forEach(k=>delete JC_SAVED[k]);(jc.data||[]).forEach(x=>{JC_SAVED[x.job_spec_id]={L:x.L,B:x.B,W:x.W,nb:x.nb,nl:x.nl,nt:x.nt,sg:x.sg}});

 if(jm.error)throw jm.error;
 {const V2={};(D.vv||[]).forEach(x=>{V2[x.vendor]=V2[x.vendor]||[];if(x.variant&&!V2[x.vendor].includes(x.variant))V2[x.vendor].push(x.variant)});if(Object.keys(V2).length)MOCK.vendors=V2}
 JM=(jm.data||[]).map(o=>({id:o.job_spec_id,shape:o.shape,job:String(o.job).trim(),spec:o.spec,lid:o.lid_type||'',ht:o.height,bw:o.body_w,bh:o.body_h,bt:o.body_t,lw:o.lid_w,lh:o.lid_h,lt:o.lid_t,tw:o.bot_w,th:o.bot_h,tt:o.bot_t,wb:o.wt_body,wl:o.wt_lid,wt:o.wt_bottom,bbt:o.body_base_t,bbw:o.body_base_wt,lbt:o.lid_base_t,lbw:o.lid_base_wt,tbt:o.bot_base_t,tbw:o.bot_base_wt,img:o.picture_name,draft:!!o.is_draft}));
 {const S2={};JM.forEach(j=>{((S2[j.shape]=S2[j.shape]||{})[j.job]=S2[j.shape][j.job]||[]);if(!S2[j.shape][j.job].includes(j.spec))S2[j.shape][j.job].push(j.spec)});MOCK.shapes=S2}
 Object.keys(MM).forEach(k=>delete MM[k]);Object.keys(MMC).forEach(k=>delete MMC[k]);MXID={};
 (mx.data||[]).forEach(m=>{const k=String(m.job).trim().toUpperCase();MXID[k]=m.job_id;if(m.target)MM[k]=[+m.target,+(m.can_mp||m.can_total||0)];const c={};if(m.body_mp!=null)c.BODY=+m.body_mp;if(m.lid_mp!=null)c.LID=+m.lid_mp;if(m.bottom_mp!=null)c.BOTTOM=+m.bottom_mp;if(Object.keys(c).length)MMC[k]=c});
 if(rl.data){(rl.data.current||[]).forEach(c=>{const r=RULES.find(x=>x.k===c.key);if(r)r.v=c.value});THRESH=+rv('skid_wip_used_threshold')||50;EDIT_DAYS=+rv('edit_window_days')||7;
  RHIST.length=0;(rl.data.history||[]).forEach(h=>{const r=RULES.find(x=>x.k===h.key);RHIST.push({on:String(h.at||'').slice(0,10),n:r?r.n:h.key,o:'',v:(h.value&&typeof h.value==='object')?JSON.stringify(h.value):h.value,f:h.from,why:h.why||'',by:''})})}}
function showLogin(msg){$('#app').innerHTML=`<div class="login-wrap"><div class="login"><img src="__BRAND__" alt="Classic Pack" style="height:70px"><h1>PMS</h1><div class="sub">Sign in to continue</div>
<label>User ID<input id="em" autocomplete="username" autocapitalize="off" placeholder="Enter your User ID"></label>
<label>Password<input id="pw" type="password" autocomplete="current-password" placeholder="Enter your password"></label>
<button class="b" id="go">${I('inn')||''} Log in</button>${msg?`<div class="msg err">${esc(msg)}</div>`:''}</div></div>`;
 const go2=async()=>{const {error}=await sb.auth.signInWithPassword({email:(v=>v.includes('@')?v:v.toLowerCase()+'@classicpack.com')($('#em').value.trim()),password:$('#pw').value});if(error)return showLogin(error.message);start()};
 $('#go').onclick=go2;$('#pw').onkeydown=e=>{if(e.key==='Enter')go2()}}
async function start(){const {data:s}=await sb.auth.getSession();if(!s.session)return showLogin();
 const {data,error}=await C('me');if(error)return showLogin(cleanErr(error.message));
 if(!data||!data.active)return showLogin('This login is not registered. Ask the Administrator.');
 ME=data;if(!ME.roles||!ME.roles.pms)return showLogin('No PMS access for this login. Ask the Administrator.');
 try{await hydrate()}catch(e){return showLogin('Could not load data: '+cleanErr(e.message))}
 shell();$('#lo').onclick=async()=>{await sb.auth.signOut();ME=null;showLogin()};
 document.body.insertAdjacentHTML('beforeend','<div id="ldr" style="display:none;position:fixed;inset:0;background:rgba(5,15,43,.45);z-index:60;align-items:center;justify-content:center;color:#f0cf6a;font-weight:700">Loading…</div>');
 go(location.hash==='#so'?'so':location.hash==='#inward'?'inward':'status')}
function newJobModal(cb){const m=modal(`<h2>Add new job / job spec</h2><div class="mut">Creates the job; Quality completes its Job Master details later.</div><div class="fg" style="margin-top:8px">
 <label>Vendor<input id="nv" list="nvl"></label><datalist id="nvl">${Object.keys(MOCK.vendors).map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
 <label>Variant<input id="nva" list="nval"></label><datalist id="nval"></datalist>
 <label>Colour<select id="nc">${MOCK.colours.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>
 <label>Shape<select id="ns">${Object.keys(MOCK.shapes).map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>
 <label>Job Name<input id="nj"></label><label>Job Spec<input id="np"></label></div>
 <div class="row" style="margin-top:12px"><button class="b g" id="nok">Add</button><button class="b l" id="nno">Cancel</button></div>`);
 const q=s=>m.querySelector(s);q('#nv').oninput=()=>{q('#nval').innerHTML=(MOCK.vendors[q('#nv').value.trim().toUpperCase()]||[]).map(v=>`<option value="${esc(v)}">`).join('')};
 q('#nno').onclick=()=>m.remove();q('#nok').onclick=()=>{const j={vendor:q('#nv').value.trim().toUpperCase(),variant:q('#nva').value.trim().toUpperCase(),colour:q('#nc').value,shape:q('#ns').value,job:q('#nj').value.trim().toUpperCase(),spec:q('#np').value.trim()};
  if(!j.vendor||!j.variant||!j.job||!j.spec)return toast('Fill vendor, variant, job name and job spec',true);j.jid=jobId(j.colour,j.variant,j.shape,j.vendor,j.job,j.spec);
  if(!DB_JOBS.some(x=>jobId(x.colour,x.variant,x.shape,x.vendor,x.job,x.spec)===j.jid))DB_JOBS.push(j);m.remove();cb(j)}}

let STOCK_BASE_LIVE=null;
const NAVMAP={status:'status',so:'invoice',inward:'employees',outward:'register',scrap:'revisions',quality:'status',carton:'otherpay',slitting:'attendance',production:'dashboard',manpower:'users',skids:'photos',inventory:'months',daily:'slip',recon:'pfesi',datalog:'shifts',masters:'contractors',rules:'rulebook',tracking:'otherpay',backdate:'revisions',rscrap:'revisions',rslit:'attendance',rprod:'dashboard',rman:'users',jobcalc:'billing',boxreg:'register',cstock:'otherpay',astock:'otherpay'};
const TITLES={so:'Sale Order',inward:'Inward',outward:'Outward',scrap:'Scrap entry',quality:'Job Master',carton:'Carton & Alum/Tape entry',slitting:'Slitting',production:'Production',manpower:'Manpower',skids:'Skid details',inventory:'Inventory',daily:'Daily production report',recon:'Production vs Dispatch',datalog:'Data log',status:'Status check',masters:'Man Power Matrix',rules:'Rules',tracking:'Stock tracking',backdate:'Back-date review',rscrap:'Scrap report',rslit:'Slitting report',rprod:'Production report',rman:'Manpower report',jobcalc:'Job Calculator',boxreg:'Box Register',cstock:'Carton stock',astock:'Alum & Tape stock'};
const GROUPS=[['STATUS',[['status','Status check']]],['SCM',[['so','Sale Order'],['inward','Inward'],['outward','Outward'],['scrap','Scrap'],['carton','Carton & Alum/Tape']]],['QUALITY',[['quality','Job Master'],['jobcalc','Job Calculator']]],['PRODUCTION',[['slitting','Slitting'],['production','Production']]],['REPORTS',[['skids','Skid details'],['rslit','Slitting report'],['rprod','Production report'],['rman','Manpower report'],['inventory','Inventory'],['daily','Daily production report'],['recon','Production vs Dispatch'],['rscrap','Scrap report'],['boxreg','Box Register'],['cstock','Carton stock'],['astock','Alum & Tape stock']]],['SETTINGS',[['masters','Man Power Matrix'],['tracking','Stock tracking'],['backdate','Back-date review'],['rules','Rules']]]];
let THRESH=50;
// delete an entry from a list: confirm first, some rows are protected (guard returns the reason)
const bindDel=(list,key,what,label,after,guard)=>document.querySelectorAll('[data-del]').forEach(a=>a.onclick=()=>{
 const i=list.findIndex(x=>String(x[key])===a.dataset.del);if(i<0)return;const it=list[i],why=guard&&guard(it);
 if(why)return toast(why,true);
 if(!confirm('Delete this '+what.toLowerCase()+'?\n\n'+label(it)+'\n\nThis cannot be undone. The deletion is recorded in the audit log.'))return;
 const kind=({'Skid':'inward','Slitting entry':'slitting','Production entry':'production','Outward entry':'outward','Scrap entry':'scrap'})[what]||(CTAB==='carton'?'carton':'alum');delLive(kind,it.id).then(ok=>{if(ok){toast('Deleted');after()}})});

const MM={"BUSH 65MM": [44000, 34], "AJ 162MM": [4800, 23], "WALLET 27MM AUTO": [12000, 17], "WALLET 50MM MNAUAL": [4000, 18], "NUTCASE 38MM": [4000, 27], "10.5X8 RECTANGLE": [2000, 34], "101 DIA SLIP LID": [4000, 21], "101 DIA PLUG LID": [4000, 21], "101 DIA HUNDIAL": [4000, 21], "66 DIA": [3500, 19], "MYSURPA 27MM": [3500, 23], "ZTALC 35GM": [12000, 13], "ASOKA 35GM": [12000, 13], "ASOKA 70GM": [12000, 13], "509 ROUND": [4500, 21], "6 INCH ROUND": [4000, 21], "7 INCH ROUND": [4500, 21], "7.5 INCH ROUND": [4000, 21], "9 INCH ROUND": [3000, 23], "67.5MM  SQUARE": [3000, 22], "6X6 SQUARE": [3500, 25], "SQUARE 75MM": [4000, 13], "4X4 SQUARE": [4000, 13], "MINT FLIP": [3000, 23], "SLIDING2 PIECE": [3500, 19], "SLIDING3 PIECE": [3500, 19], "HEART": [4000, 11], "Z TALC SHOULDER": [20000, 8]}; const CARTON={"2 PLY - CARTONS": ["Abu  Jabal Layer Pad - 2 Ply", "Shoulder Layer Pad - 2 Ply"], "3 PLY - CARTONS": ["105 UDI Carton - 3 Ply (Inner)", "105 UDI Carton - 3 Ply (Outer)", "509 Carton - 3 Ply (60mm)", "6\" carton - 3 Ply (Round)", "6x6 Carton - 3 Ply (36 Packs)", "6x6 carton - 3 Ply", "7.5\" Carton - 3 Ply", "75mmx100mm Carton - 3 Ply (48 Pack)", "75mmx120mm Carton - 3 Ply", "9\" Carton (95mm) - 3 Ply (US bakers)", "9\" Carton - 3 Ply (101mm)", "9\" Carton - 3 Ply (124mm)", "9\" Carton - 3 Ply (97mm)", "AJ Carton - 3 Ply (90 mm)", "Almond 401 Carton - 3 Ply", "Asoka Body Carton - 3 Ply", "Delinut Carton - 3 Ply", "Garuda Carton - 3 Ply", "Indigo UDI Carton - 3 Ply (Inner)", "Indigo UDI Carton - 3 Ply (Outer)", "Spice Carton - 3 Ply (240 Pack)", "Wallet Carton - 3 Ply"], "5 PLY - CARTONS": ["10.5 x 8 Carton - 5 Ply", "10.5x8  Carton - 5 Ply (Printed)", "10.5x8 Carton - 5 Ply (70mm)", "10.5x8 Carton - 5 Ply (Export)", "10.5x8 Twining Carton - 5 Ply (Printed)", "105 Carton - 5 Ply (110 mm)", "105 Carton - 5 Ply (150 mm)", "105 Carton - 5 Ply (50mm)", "509 Carton - 5 Ply (60 mm)", "509 Carton - 5 Ply (90mm)", "509 Cookieman Carton - 5 Ply (60mm)", "509 Cookieman Carton - 5 Ply (90mm)", "6\" Carton - 5 Ply (Round)", "66 Dia Carton - 5 Ply", "6x6 Carton - 5 Ply", "6x6 Carton - 5 Ply (36 Packs)", "6x6 SKS Carton - 5 Ply", "7\" Carton (105mm) - 5 Ply", "7\" Carton - 5 Ply (70mm)", "7\" Carton - 5 Ply (80mm)", "7\" Carton 80mm - 5 Ply", "75 Sq x 100 mm Carton - 5 Ply", "75 Sq x 120 mm Carton - 5 Ply", "75mm x 120mm Carton - 5 Ply", "75mmx100mm Carton - 5 Ply (48 Pack)", "75mmx50mm Carton - 5 Ply", "75mmx70mm Carton - 5 Ply (Air Asia)", "8x6 Carton - 5 Ply", "9\" Carton - 5 Ply (101mm)", "9\" Carton - 5 Ply (136mm)", "9\" Carton - 5 Ply (145mm)", "9\" Carton - 5 Ply (70mm)", "Apollo Carton - 5 Ply", "Bush Bottom Carton - 5 Ply", "Bush Carton - 120 Pack (New Logo)", "Bush Carton - 48 Pack (New Logo)", "Bush Carton - 48 Pack (Old Logo)", "Delinut Carton - 5 Ply", "Delinut Carton - 5 Ply (Happilo)", "Garuda Carton - 5 Ply", "Heart Tin Carton - 5 Ply (16 Packs)", "Indigo Carton - 5 Ply", "Mysurepak Carton - 5 Ply", "New Rectangle Carton (170x105x35) - 5 Ply (430x360x240)", "Nutcase Carton - 5 Ply (64 Pack)", "Shoulder Carton - 5 Ply", "Wallet Carton - 5 Ply", "Wallet Carton - 5 Ply (60 Packs)", "Wallet Carton - 5 Ply (Lid)", "Z Talc 30gm Carton -5 Ply"], "7 PLY - CARTONS": ["10.5x8 Twining Carton - 7 Ply (Printed)", "D Mart Carton - 7 Ply (40 Pack)"], "OTHERS": ["101 Plug - Plastic", "Bush Bottom Layer Pad", "Bush Layer Pad - 120 Pack", "Bush Layer Pad - 48 Pack", "Corrugated Tray - Abu Jabal", "Sri Krishna Sweet Carton"]};
// Job ID exactly as the PRODUCTION sheet builds it: JOB(3)-COLOUR(3)-VARIANT initials+numbers-SHAPE(8)-VENDOR first word-SPEC without x
const jobId=(col,variant,shape,vendor,job,spec)=>{const t=x=>String(x||'').trim().toUpperCase();const w=t(variant).split(/\s+/).filter(Boolean);
 const letters=w.filter(x=>x!=='VARIANT'&&isNaN(x)).map(x=>x[0]).join(''),nums=w.filter(x=>!isNaN(x)).join('');
 return [t(job).slice(0,3),t(col).slice(0,3),letters+nums,t(shape).replace(/ /g,'').slice(0,8),(t(vendor)+' ').split(' ')[0],t(spec).replace(/X/g,'')].join('-')};
let OUT=[];const dispatched=id=>OUT.filter(o=>o.jid===id).reduce((a,o)=>a+(+o.qty||0),0);
let PROD=[{id:1,date:'2026-11-10',colour:'PRINTED',variant:'ALMOND TINS',shape:'ROUND',vendor:'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED',job:'101 DIA SLIP LID',spec:'101x25',comp:'CAN',actual:6750,mp:24,hrs:8,fg:1700,sfg:5050,scrap:60,cvar:'5 PLY - CARTONS',cname:'',cqty:0},
 {id:2,date:'2026-11-10',colour:'PRINTED',variant:'CARATLANE',shape:'RECTANGLE',vendor:'CARATLANE TRADING PVT LTD - MH',job:'WALLET 27MM MANUAL',spec:'115x95x50',comp:'BODY',actual:5200,mp:6,hrs:8,fg:0,sfg:5200,scrap:40,cvar:'',cname:'',cqty:0}];

let SLITS=[{id:1,date:'2026-07-02',skid:'BOD/JUL/26/001',count:850,body:60,lid:0,bottom:0,strip:2.3,ljl:1,bjl:1,bwt:0.023,lwt:0,btwt:0},
 {id:2,date:'2026-11-10',skid:'BOD/NOV/26/015',count:300,body:0,lid:6,bottom:0,strip:0.03,ljl:1,bjl:1,bwt:0,lwt:0.055,btwt:0}];
const sheetWt=x=>x.L*x.B*x.W*0.785/100000, skidNos=x=>x.net/sheetWt(x);
const slitUsed=n=>SLITS.filter(t=>t.skid===n).reduce((a,t)=>a+(+t.count||0),0);
const skidLeft=x=>skidNos(x)-slitUsed(x.no);
const skidStatus=x=>!SLITS.some(t=>t.skid===x.no)?'Instock':(skidLeft(x)>THRESH?'WIP':'Used');
const LIVE=['skids','rslit','rprod','rscrap','inventory','daily','recon','boxreg','cstock','astock','rules','status','masters','rman','so','inward','outward','scrap','carton','quality','jobcalc','slitting','production'];let SKIDS=MOCK.skids.slice(),sideCollapsed=false;
function shell(){
 $('#app').innerHTML=`<div class="layout"><aside><div class="brand"><img src="__BRAND__"><div><b>CP PMS</b><span>Classic Pack Pvt Ltd</span></div></div>
 <nav>${GROUPS.map(([g,a])=>[g,a.filter(t=>(t[0]!=='tracking'||pcan('tracking_edit'))&&(t[0]!=='backdate'||pcan('backdate_review')))]).map(([g,a])=>`<div class="ngrp">${g}</div>`+a.map(t=>`<button data-v="${t[0]}" title="${t[1]}"><span class="tile">${NAV[NAVMAP[t[0]]]}</span><span class="lb">${t[1]}</span></button>`).join('')).join('')}</nav><div class="side-foot">Role: <b style="color:var(--gold2)">${esc(ME&&ME.roles&&ME.roles.pms||"")}</b></div></aside>
 <div class="content"><div class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="menu" id="mn" title="Expand / collapse menu">${I('menu')}</button><h1 id="ttl"></h1></div><div class="who"><div class="av">${esc((ME&&ME.full_name||"?")[0].toUpperCase())}</div><div>${esc(ME&&ME.full_name||"")}</div><button id="lo">${I('logout')} Log out</button></div></div><main id="main"></main></div></div>`;
 document.querySelectorAll('aside nav button').forEach(b=>b.onclick=()=>go(b.dataset.v));
 $('#mn').onclick=()=>{sideCollapsed=!sideCollapsed;document.body.classList.toggle('sc',sideCollapsed)}}
function go(v){VIEW=v;document.querySelectorAll('aside nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));$('#ttl').innerHTML=I('open')+' '+TITLES[v];(VIEWS[v]||VIEWS.soon)();if(SAMPLE_VIEWS.includes(v)){const m=$('#main');if(m)m.insertAdjacentHTML('afterbegin','<div class="card" style="border-color:#e0b53a"><b style="color:#f0cf6a">Sample data</b> <span class="mut">This screen is not connected to the live database yet. Changes here are not saved.</span></div>')}}
const VIEWS={};
VIEWS.soon=()=>{$('#main').innerHTML=`<div class="card"><h2>${TITLES[VIEW]}</h2><div class="mut">Layout comes in the next batch.</div></div>`};

/* ---------------- Sale Order (drop) ---------------- */
VIEWS.so=()=>{
 $('#main').innerHTML=`<div class="card"><h2>Drop the Sale Order sheet</h2><div class="mut">Entry screens pick a Sale Order and take Vendor, Variant, Colour and quantity from it. Dropping the sheet again updates quantity and status; nothing is duplicated.</div>
 <div class="row noprint" style="margin-top:10px"><label>Sale Order Excel<input type="file" id="fl" accept=".xlsx,.xls,.xlsm"></label><button class="b g" id="pv">${bt('dl','Read sheet & preview')}</button><button class="b l" id="demo">${bt('eye','Show sample preview')}</button></div><div id="prev"></div></div>
 <div class="card"><h2>Dropped Sale Orders</h2><div class="row noprint"><label>Search<input id="q" placeholder="SO no, vendor, variant"></label><label>Show<select id="qs"><option>Open only</option><option>All</option></select></label><button class="b l" id="ex">${bt('dl','Export list')}</button></div>
 <div class="scroll" style="margin-top:10px"><table><tr><th>SO No</th><th>Date</th><th>Vendor</th><th>Variant</th><th>Colour</th><th>Description</th><th>Sale qty</th><th>Dispatched</th><th>Pending</th></tr><tbody id="sob"></tbody></table></div><div class="mut" id="soc"></div></div>`;
 const draw=()=>{const t=$('#q').value.toLowerCase();const r=MOCK.so.filter(x=>!t||(x.so+x.vendor+x.variant).toLowerCase().includes(t));$('#sob').innerHTML=r.map(x=>`<tr><td>${x.so}</td><td>${x.date}</td><td>${esc(x.vendor)}</td><td>${esc(x.variant)}</td><td>${x.colour}</td><td>${esc(x.desc)}</td><td>${x.qty.toLocaleString()}</td><td>${x.sent.toLocaleString()}</td><td><b>${(x.qty-x.sent).toLocaleString()}</b></td></tr>`).join('');$('#soc').textContent=r.length+' shown'};draw();$('#q').oninput=draw;
 $('#demo').onclick=()=>{$('#prev').innerHTML=`<h3>Preview before saving</h3><div class="kpi"><div><b>301</b>lines in sheet</div><div><b>12</b>new lines</div><div><b>3</b>updated</div><div><b>2</b>new vendors</div><div><b>4</b>new variants</div></div>
  <div class="scroll" style="margin-top:10px;max-height:240px"><table><tr><th>Action</th><th>SO No</th><th>Vendor</th><th>Variant</th><th>Sale qty</th></tr>
  <tr><td><span class="tag ok">NEW</span></td><td>2600455</td><td>LAKSHMI FOODS</td><td>MIXTURE TIN</td><td>50,000</td></tr>
  <tr><td><span class="tag ok">NEW</span></td><td>2600456</td><td>NEW VENDOR TRADERS <span class="tag warn">new vendor</span></td><td>GIFT BOX <span class="tag warn">new variant</span></td><td>20,000</td></tr>
  <tr><td><span class="tag warn">UPDATE</span></td><td>2500154</td><td>CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED</td><td>ALMOND TINS</td><td>300,000 → 310,000</td></tr></table></div>
  <div class="row noprint" style="margin-top:10px"><button class="b g">${bt('save','Save to PMS')}</button><button class="b l" id="cn">${bt('x','Cancel')}</button></div><div class="mut" style="margin-top:6px">A vendor spelled slightly differently from an existing vendor is joined to it automatically.</div>`;$('#cn').onclick=()=>$('#prev').innerHTML=''};
 $('#pv').onclick=()=>toast('Excel reading is added when the screens are connected',true)};

/* ---------------- Inward (list = Employees layout) ---------------- */
VIEWS.inward=()=>{
 $('#main').innerHTML=`<div class="card"><h2>Inward skids</h2><div class="row noprint"><label>Search<input id="es" placeholder="Skid no, DC no, vendor, job"></label>
 <label>Status<select id="ea"><option value="">All</option><option>Instock</option><option>WIP</option><option>Used</option></select></label>
 <label>Month<select id="em"><option value="">All</option><option>NOV 2026</option><option>JUL 2026</option></select></label>
 <button class="b l" id="eg">${bt('search','Search')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button><button class="b g" id="en">${bt('plus','New skid')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 const load=()=>{const t=$('#es').value.toLowerCase(),s=$('#ea').value;const d=SKIDS.filter(x=>(!s||skidStatus(x)===s)&&(!t||Object.values(x).join(' ').toLowerCase().includes(t)));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th>Skid No</th><th>Date</th><th>Sale Order</th><th>Vendor</th><th>Variant</th><th>Shape</th><th>Job Name</th><th>Job Spec</th><th>Component</th><th>Net kg</th><th>Nos</th><th>Balance Nos</th><th>Status</th><th>Actions</th></tr>
  ${d.map(x=>{const ss=x.L*x.B*x.W*7.85/1e6;return `<tr><td>${x.no}</td><td>${x.date}</td><td>${x.so||'<span class="tag">stock</span>'}</td><td>${esc(x.vendor)}</td><td>${esc(x.variant)}</td><td>${x.shape}</td><td>${esc(x.job)}</td><td>${esc(x.spec)}</td><td>${x.comp}</td><td>${x.net}</td><td>${Math.round(x.net/ss)}</td><td>${Math.round(skidLeft(x))}</td>
  <td><span class="tag ${skidStatus(x)==='Instock'?'ok':skidStatus(x)==='WIP'?'warn':''}">${skidStatus(x)}</span></td><td>${ib('eye','View',`data-e="${x.no}"`)}${ib('edit','Edit',`data-ed="${x.no}"`)}${ib('trash','Delete',`data-del="${x.no}"`,'bad')}</td></tr>`}).join('')}</table></div><div class="mut">${d.length} shown</div>`;
  bindDel(SKIDS,'no','Skid',x=>x.no,()=>VIEWS.inward(),x=>SLITS.some(t=>t.skid===x.no)?'This skid already has slitting entries. Delete those first.':'');
  document.querySelectorAll('[data-ed]').forEach(a=>a.onclick=()=>skidForm(SKIDS.find(x=>x.no===a.dataset.ed)));
  document.querySelectorAll('[data-e]').forEach(a=>a.onclick=()=>skidForm(SKIDS.find(x=>x.no===a.dataset.e)));
};
 load();$('#eg').onclick=load;$('#es').oninput=load;$('#ea').onchange=load;$('#en').onclick=()=>skidForm(null)};

/* ---------------- Inward entry (= New employee layout) ---------------- */
function skidForm(e,stock){const isNew=!e;stock=stock??(e?!e.so:false);
 $('#ttl').innerHTML=I('employees')+' '+(isNew?'New Skid':'Edit Skid');
 const v=k=>esc(e?.[k]??'');const sel=(id,l,opts,cur)=>`<label>${l}<select id="${id}">${opts.map(o=>`<option ${String(cur)===String(o)?'selected':''}>${o}</option>`).join('')}</select></label>`;
 const soNos=[...new Set(MOCK.so.map(r=>r.so))];const soOpts=soNos.map(n=>`<option ${e&&e.so===n?'selected':''}>${n}</option>`).join('');
 const r0=MOCK.so.find(r=>e&&e.so===r.so&&e.variant===r.variant);
 $('#main').innerHTML=`<div class="row noprint" style="margin-bottom:12px"><button class="b l" id="bk">${bt('x','Back to skids')}</button></div>
 <div class="card"><h2>1. Source</h2><div class="row noprint" style="margin-bottom:8px"><label>Entry type<select id="mode"><option value="so" ${stock?'':'selected'}>With Sale Order</option><option value="stock" ${stock?'selected':''}>Stock (no Sale Order)</option></select></label></div>
  <div class="fg" id="soBox" style="${stock?'display:none':''}"><label>Sale Order No<select id="so"><option value="">— pick Sale Order No —</option>${soOpts}</select></label>
   <label>Variant (from Sale Order)<select id="va"><option value="">— pick Sale Order first —</option></select></label>
   <label>Vendor (from Sale Order)<input id="ve" readonly value="${esc(r0?.vendor||'')}"></label><label>Colour (from Sale Order)<input id="col" readonly value="${esc(r0?.colour||'')}"></label><label>Sale qty<input id="sq" readonly value="${r0?r0.qty.toLocaleString():''}"></label><label>Pending qty<input id="pq" readonly value="${r0?(r0.qty-r0.sent).toLocaleString():''}"></label></div>
  <div class="fg" id="stBox" style="${stock?'':'display:none'}"><label>Vendor<select id="sv"><option value="">— pick —</option>${Object.keys(MOCK.vendors).map(x=>`<option ${e&&e.vendor===x?'selected':''}>${esc(x)}</option>`).join('')}<option value="__new">+ Enter manually…</option></select></label>
   <label id="svnl" style="display:none">New vendor name<input id="svn" placeholder="added to the vendor list automatically"></label>
   <label>Variant<select id="sva"><option value="">— pick vendor first —</option></select></label><label id="svanl" style="display:none">New variant name<input id="svan" placeholder="added to the variant list automatically"></label>
   ${sel('scol','Colour',MOCK.colours,e?.colour)}<label>Reason (no Sale Order)<input id="rs" placeholder="e.g. advance stock"></label></div></div>
 <div class="card"><h2>2. Job details</h2><div class="fg">
  <label>Shape<select id="sh"><option value="">— pick —</option>${Object.keys(MOCK.shapes).map(s=>`<option ${e&&e.shape===s?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>Job Name<select id="jb"><option value="">— pick shape first —</option></select></label><label>Job Spec<select id="sp"><option value="">— pick job first —</option></select></label>
  <label>Job ID (auto)<input id="jid" readonly value="—"></label></div>
  <div class="row noprint" style="margin-top:8px"><button class="b l" id="njb">${bt('plus','Job not listed — enter manually')}</button><span class="mut">A new Job Name or Job Spec you enter is added to the dropdown automatically.</span></div></div>
 <div class="card"><h2>3. Skid details</h2><div class="fg">
  <label>Date<input id="d" type="date" value="${e?e.date:TODAY}"></label><label>Skid No<input id="sk" value="${v('no')}" ${isNew?'placeholder="Skid no, or a name for opening stock"':'disabled'}></label>
  <label>DC No<input id="dc" value="${v('dc')}"></label>${sel('rf','Received from',['THINDIVANAM','PONDY','CHENNAI'],e?.from)}
  ${sel('cm','Components in skid',['BODY','LID','BOTTOM','BODY,LID','BODY,BOTTOM','LID,BOTTOM','BODY,LID,BOTTOM'],e?.comp)}<label>Gross weight (kg)<input id="gw" type="number" value="${v('gross')}"></label><label>Net weight (kg)<input id="nw" type="number" value="${v('net')}"></label>
  <label>Sheet length<input id="L" type="number" value="${v('L')}"></label><label>Sheet breadth<input id="B" type="number" value="${v('B')}"></label><label>Thickness<input id="W" type="number" step="0.01" value="${v('W')}"></label>
  <label>Single sheet weight kg (auto)<input id="ss" readonly></label><label>Weight in Nos (auto)<input id="wn" readonly></label></div>
  <div class="row noprint" style="margin-top:14px"><button class="b g" id="sv2">${bt('save',isNew?'Save skid':'Save changes')}</button><button class="b l" id="cx">${bt('x','Cancel')}</button></div></div>`;
 const opt=(id,arr,ph,cur)=>{$(id).innerHTML=`<option value="">${ph}</option>`+arr.map(o=>`<option ${o===cur?'selected':''}>${esc(o)}</option>`).join('')};
 const jid=()=>{const st=$('#mode').value==='stock';const ve=st?($('#sv').value==='__new'?$('#svn').value:$('#sv').value):$('#ve').value;const va=st?($('#sva').value==='__new'?$('#svan').value:$('#sva').value):$('#va').value;const co=st?$('#scol').value:$('#col').value;const s=$('#sh').value,j=$('#jb').value,p=$('#sp').value;$('#jid').value=(s&&j&&p&&ve&&va)?jobId(co,va,s,ve,j,p):'—'};
 ['#svn','#svan','#scol'].forEach(i=>{$(i).oninput=$(i).onchange=jid});
 const calc=()=>{const L=+$('#L').value,B=+$('#B').value,W=+$('#W').value,n=+$('#nw').value;const ss=L&&B&&W?L*B*W*7.85/1e6:0;$('#ss').value=ss?ss.toFixed(4):'';$('#wn').value=ss&&n?(n/ss).toFixed(1):''};
 ['#L','#B','#W','#nw'].forEach(i=>$(i).oninput=calc);calc();
 $('#mode').onchange=()=>{const st=$('#mode').value==='stock';$('#soBox').style.display=st?'none':'';$('#stBox').style.display=st?'':'none';jid()};
 const lines=()=>MOCK.so.filter(x=>x.so===$('#so').value);
 const fill=()=>{const r=lines().find(x=>x.variant===$('#va').value);$('#ve').value=r?r.vendor:'';$('#col').value=r?r.colour:'';$('#sq').value=r?r.qty.toLocaleString():'';$('#pq').value=r?(r.qty-r.sent).toLocaleString():'';jid()};
 const soChg=()=>{const L=lines();$('#va').innerHTML=(L.length==1?'':'<option value="">— pick variant —</option>')+L.map(x=>`<option ${e&&e.variant===x.variant?'selected':''}>${esc(x.variant)}</option>`).join('');if(!L.length)$('#va').innerHTML='<option value="">— pick Sale Order first —</option>';fill()};
 $('#so').onchange=soChg;$('#va').onchange=fill;soChg();
 const vv=()=>{const x=$('#sv').value,nw=x==='__new';$('#svnl').style.display=nw?'':'none';if(nw){$('#sva').innerHTML='<option value="__new">+ Enter manually…</option>';$('#svanl').style.display=''}else{opt('#sva',MOCK.vendors[x]||[],'— pick —',e?.variant);$('#sva').insertAdjacentHTML('beforeend','<option value="__new">+ Enter manually…</option>');$('#svanl').style.display='none'}};
 $('#sv').onchange=vv;vv();$('#sva').onchange=()=>$('#svanl').style.display=$('#sva').value==='__new'?'':'none';
 const shp=()=>{const s=$('#sh').value;opt('#jb',Object.keys(MOCK.shapes[s]||{}),s?'— pick —':'— pick shape first —',e?.job);jb()};const jb=()=>{const j=$('#jb').value;opt('#sp',(MOCK.shapes[$('#sh').value]||{})[j]||[],j?'— pick —':'— pick job first —',e?.spec);jid()};
 $('#sh').onchange=()=>{shp()};$('#jb').onchange=jb;$('#sp').onchange=jid;shp();
 $('#njb').onclick=()=>{const s=$('#sh').value;if(!s)return toast('Pick the shape first',true);const j=prompt('Job Name');if(!j)return;const sp=prompt('Job Spec');if(!sp)return;const J=j.toUpperCase();MOCK.shapes[s][J]=MOCK.shapes[s][J]||[];MOCK.shapes[s][J].push(sp.toUpperCase());jmDraft(s,J,sp.toUpperCase());shp();$('#jb').value=J;jb();$('#sp').value=sp.toUpperCase();jid();toast('Added to the dropdown')};
 $('#bk').onclick=$('#cx').onclick=()=>go('inward');
 $('#sv2').onclick=()=>{const r=MOCK.so.find(x=>x.so===$('#so').value&&x.variant===$('#va').value);const st=$('#mode').value==='stock';const rec={no:$('#sk').value||e?.no||'(new)',date:$('#d').value,so:st?'':(r?r.so:''),vendor:st?($('#svn').value||$('#sv').value):(r?r.vendor:''),variant:st?($('#svan').value||$('#sva').value):(r?r.variant:''),colour:st?$('#scol').value:(r?r.colour:''),shape:$('#sh').value,job:$('#jb').value,spec:$('#sp').value,comp:$('#cm').value,gross:+$('#gw').value,net:+$('#nw').value,L:+$('#L').value,B:+$('#B').value,W:+$('#W').value,from:$('#rf').value,dc:$('#dc').value};
  saveLive('inward_save',{id:e?.id,skid_no:rec.no,entry_date:rec.date,dc_no:rec.dc,received_from:rec.from,so_no:rec.so,so_line_id:r?r.id:null,stock_reason:$('#rs')?$('#rs').value:'',components_in_skid:rec.comp,gross_wt:rec.gross,net_wt:rec.net,sheet_l:rec.L,sheet_b:rec.B,sheet_w:rec.W,single_sheet_wt:+$('#ss').value||null,weight_in_nos:+$('#wn').value||null,job:jobObj(rec,{so_line_id:r?r.id:null})},'inward')};
}
/* ---------------- Slitting (list + entry; Employee layout) ---------------- */
VIEWS.slitting=()=>{
 $('#main').innerHTML=`<div class="card"><h2>Slitting entries</h2><div class="row noprint"><label>Search<input id="es" placeholder="Skid no, vendor, job"></label>
 <label>Month<select id="em"><option value="">All</option><option>NOV 2026</option><option>JUL 2026</option></select></label>
 <button class="b l" id="eg">${bt('search','Search')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button><button class="b g" id="en">${bt('plus','New slitting')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 const load=()=>{const t=$('#es').value.toLowerCase();const d=SLITS.map(r=>({r,k:SKIDS.find(x=>x.no===r.skid)})).filter(({r,k})=>!t||(r.skid+k.vendor+k.job).toLowerCase().includes(t));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th>Date</th><th>Skid No</th><th>Vendor</th><th>Job Name</th><th>Job Spec</th><th>Slitting count</th><th>Body</th><th>Lid</th><th>Bottom</th><th>Expected production</th><th>Variance kg</th><th>Skid status</th><th>Actions</th></tr>
  ${d.map(({r,k})=>{const c=slitCalc(r,k);return `<tr><td>${r.date}</td><td>${r.skid}</td><td>${esc(k.vendor)}</td><td>${esc(k.job)}</td><td>${esc(k.spec)}</td><td>${r.count}</td><td>${r.body}</td><td>${r.lid}</td><td>${r.bottom}</td><td><b>${c.exp.toLocaleString()}</b></td><td>${c.variance.toFixed(1)}</td><td><span class="tag ${skidStatus(k)==='WIP'?'warn':skidStatus(k)==='Used'?'':'ok'}">${skidStatus(k)}</span></td><td>${ib('eye','View',`data-e="${r.id}"`)}${ib('edit','Edit',`data-ed="${r.id}"`)}${ib('trash','Delete',`data-del="${r.id}"`,'bad')}</td></tr>`}).join('')}</table></div><div class="mut">${d.length} shown</div>`;
  bindDel(SLITS,'id','Slitting entry',x=>x.skid+' on '+x.date,()=>VIEWS.slitting());
  document.querySelectorAll('[data-e],[data-ed]').forEach(a=>a.onclick=()=>slitForm(SLITS.find(x=>x.id==(a.dataset.e||a.dataset.ed))))};
 load();$('#eg').onclick=load;$('#es').oninput=load;$('#en').onclick=()=>slitForm(null)};
// same formulas as the SLITTING sheet
function slitCalc(r,k){const c=(k.comp||'').toUpperCase();const sl={body:r.body*r.count,lid:r.lid*r.count,bottom:r.bottom*r.count};
 const inSkid=['body','lid','bottom'].filter(n=>c.includes(n.toUpperCase()));const exp=inSkid.length?Math.min(...inSkid.map(n=>sl[n])):0;
 const tin=(+r.bwt||0)+(+r.lwt||0)+(+r.btwt||0);const bif=((r.bwt||0)*r.body+(r.lid||0)*(r.lwt||0)+(r.bottom||0)*(r.btwt||0))*r.count;
 return {sl,exp,tin,bif,variance:k.net-bif}}
function slitForm(e){const isNew=!e;
 $('#ttl').innerHTML=I('attendance')+' '+(isNew?'New Slitting':'Edit Slitting');
 const open=SKIDS.filter(x=>skidStatus(x)!=='Used'||(e&&e.skid===x.no));
 const v=k=>esc(e?.[k]??'');
 $('#main').innerHTML=`<div class="row noprint" style="margin-bottom:12px"><button class="b l" id="bk">${bt('x','Back to slitting')}</button></div>
 <div class="card"><h2>1. Skid</h2><div class="fg"><label>Date<input id="d" type="date" value="${e?e.date:TODAY}"></label>
  <label>Skid No (Instock / WIP only)<select id="sk"><option value="">— pick skid —</option>${open.map(x=>`<option ${e&&e.skid===x.no?'selected':''}>${x.no}</option>`).join('')}</select></label>
  <label>Skid status (auto)<input id="st" readonly></label><label>Balance sheets (Nos)<input id="bal" readonly></label>
  <label>Vendor<input id="ve" readonly></label><label>Variant<input id="va" readonly></label><label>Colour<input id="col" readonly></label><label>Shape<input id="sh" readonly></label>
  <label>Job Name<input id="jb" readonly></label><label>Job Spec<input id="sp" readonly></label><label>Components in skid<input id="cm" readonly></label><label>Job ID (auto)<input id="jid" readonly></label>
  <label>Gross weight (kg)<input id="gw" readonly></label><label>Net weight (kg)<input id="nw" readonly></label><label>Sheet size L × B × W<input id="sz" readonly></label><label>Single sheet weight kg<input id="ss" readonly></label><label>Weight in Nos<input id="wn" readonly></label></div>
  <div class="mut" style="margin-top:6px">Skid details come from Inward. Changing them here never changes the Inward entry. Skid status is automatic: no slitting = Instock; sheets left above ${THRESH} = WIP; otherwise Used.</div></div>
 <div class="card"><h2>2. Slitting</h2><div class="fg"><label>Slitting count (sheets slit)<input id="cnt" type="number" value="${v('count')}"></label>
  <label>Body per sheet<input id="lb" type="number" value="${v('body')}"></label><label>Lid per sheet<input id="ll" type="number" value="${v('lid')}"></label><label>Bottom per sheet<input id="lbt" type="number" value="${v('bottom')}"></label>
  <div id="dfl" class="mut" style="grid-column:1/-1"></div><label>Body — total (auto)<input id="sb" readonly></label><label>Lid — total (auto)<input id="sl" readonly></label><label>Bottom — total (auto)<input id="sbt" readonly></label><label>Expected production (auto)<input id="ex" readonly></label></div></div>
 <div class="card"><h2>3. Weights</h2><div class="fg"><label>Strip weight (kg)<input id="sw" type="number" step="0.001" value="${v('strip')}"></label><label>Lid jally (kg)<input id="lj" type="number" step="0.001" value="${v('ljl')}"></label><label>Bottom jally (kg)<input id="bj" type="number" step="0.001" value="${v('bjl')}"></label><div></div>
  <label>Body weight (kg)<input id="wb" type="number" step="0.001" value="${v('bwt')}"></label><label>Lid weight (kg)<input id="wl" type="number" step="0.001" value="${v('lwt')}"></label><label>Bottom weight (kg)<input id="wbt" type="number" step="0.001" value="${v('btwt')}"></label><label>Tin weight (auto)<input id="tw" readonly></label>
  <label>Bifurcated skid kg (auto)<input id="bf" readonly></label><label>Raw skid kg (net)<input id="rw" readonly></label><label>Variance kg (auto)<input id="vr" readonly></label></div>
  <div class="row noprint" style="margin-top:14px"><button class="b g" id="sv2">${bt('save',isNew?'Save slitting':'Save changes')}</button><button class="b l" id="cx">${bt('x','Cancel')}</button></div></div>`;
 const rec=()=>({skid:$('#sk').value,date:$('#d').value,count:+$('#cnt').value||0,body:+$('#lb').value||0,lid:+$('#ll').value||0,bottom:+$('#lbt').value||0,strip:+$('#sw').value||0,ljl:+$('#lj').value||0,bjl:+$('#bj').value||0,bwt:+$('#wb').value||0,lwt:+$('#wl').value||0,btwt:+$('#wbt').value||0});
 const upd=()=>{const k=SKIDS.find(x=>x.no===$('#sk').value);const f=(id,val)=>$(id).value=val??'';
  if(k){f('#st',skidStatus(k));f('#bal',Math.round(skidLeft(k)-(e&&e.skid===k.no?-e.count:0)));f('#ve',k.vendor);f('#va',k.variant);f('#col',k.colour);f('#sh',k.shape);f('#jb',k.job);f('#sp',k.spec);f('#cm',k.comp);f('#jid',jobId(k.colour,k.variant,k.shape,k.vendor,k.job,k.spec));f('#gw',k.gross);f('#nw',k.net);f('#sz',k.L+' × '+k.B+' × '+k.W);f('#ss',sheetWt(k).toFixed(4));f('#wn',skidNos(k).toFixed(1));f('#rw',k.net);
   const cu=(k.comp||'').toUpperCase();[['BODY','#lb','#wb'],['LID','#ll','#wl'],['BOTTOM','#lbt','#wbt']].forEach(([n,a1,a2])=>{const on=cu.includes(n);[a1,a2].forEach(i=>{$(i).disabled=!on;if(!on)$(i).value=0})});
   if(!e){$('#dfl')&&($('#dfl').textContent='');
    {const last={};SLITS.filter(t=>t.skid!==k.no).forEach(t=>{const o=SKIDS.find(x=>x.no===t.skid);if(o&&o.job===k.job&&o.spec===k.spec&&+o.L===+k.L&&+o.B===+k.B&&+o.W===+k.W&&o.comp===k.comp&&(!last[o.comp]||t.date>last[o.comp].date))last[o.comp]=t});
     const t=last[k.comp];if(t){let used=false;[['BODY','#lb','body'],['LID','#ll','lid'],['BOTTOM','#lbt','bottom']].forEach(([n,i,f])=>{if((k.comp||'').toUpperCase().includes(n)&&!$(i).dataset.t&&t[f]){$(i).value=t[f];used=true}});if(used&&$('#dfl'))$('#dfl').textContent='Pieces per sheet taken from the last slitting of this job with the same sheet size ('+t.date+'). Change them if needed.'}}
   }
   const c=slitCalc(rec(),k);f('#sb',c.sl.body);f('#sl',c.sl.lid);f('#sbt',c.sl.bottom);f('#ex',c.exp);f('#tw',c.tin.toFixed(3));f('#bf',c.bif.toFixed(2));f('#vr',c.variance.toFixed(2))}};
 ['#lb','#ll','#lbt'].forEach(i=>$(i).addEventListener('input',ev=>{if(ev.isTrusted)ev.target.dataset.t=1}));['#sk','#cnt','#lb','#ll','#lbt','#wb','#wl','#wbt'].forEach(i=>{$(i).oninput=$(i).onchange=upd});upd();
 $('#bk').onclick=$('#cx').onclick=()=>go('slitting');
 $('#sv2').onclick=()=>{if(!$('#sk').value)return toast('Pick the skid',true);const r=rec(),k=SKIDS.find(x=>x.no===r.skid),c=slitCalc(r,k);saveLive('slitting_save',{id:e?.id,skid_id:k.id,entry_date:r.date,components_in_skid:k.comp,gross_wt:k.gross,net_wt:k.net,sheet_l:k.L,sheet_b:k.B,sheet_w:k.W,single_sheet_wt:sheetWt(k),weight_in_nos:skidNos(k),slitting_count:r.count,body_layout:r.body,lid_layout:r.lid,bottom_layout:r.bottom,body_sl:c.sl.body,lid_sl:c.sl.lid,bottom_sl:c.sl.bottom,expected_production:c.exp,strip_wt:r.strip,lid_jl:r.ljl,bottom_jl:r.bjl,body_wt:r.bwt,lid_wt:r.lwt,bottom_wt:r.btwt,tin_wt:c.tin,bifurcated_skid:c.bif,raw_skid:k.net,variance:c.variance},'slitting')}}
/* ---------------- Production (list + entry; Employee layout) ---------------- */
const MMC={};
const jobComps=k=>{const L=(typeof JM!=='undefined'?JM:[]).filter(x=>String(x.job).toUpperCase()===k),f={BODY:jmBody,LID:jmLid,BOTTOM:jmBot},c=['BODY','LID','BOTTOM'].filter(n=>L.some(x=>f[n](x)));return c.length?c:['BODY','LID','BOTTOM']};
const autoSplit=(k,mp)=>{const ty=MMC[k]||{},c=jobComps(k),un=c.filter(n=>ty[n]==null||ty[n]===''),left=Math.max(mp-c.reduce((a,n)=>a+(+ty[n]||0),0),0),o={};
 const b=un.length?Math.floor(left/un.length):0,r=un.length?left-b*un.length:0;un.forEach((n,i)=>o[n]=b+(i<r?1:0));return o};
const mmGet=(job,comp)=>{const k=String(job).trim().toUpperCase(),m=MM[k];if(!m||!m[0])return null;const ty=MMC[k]||{},auto=autoSplit(k,m[1]),c=(comp||'CAN').toUpperCase();
 if(c==='CAN'){const jc=jobComps(k),typed=jc.reduce((a,n)=>a+(+ty[n]||0),0),allTyped=jc.every(n=>ty[n]!=null&&ty[n]!=='');return [m[0],typed===0?m[1]:allTyped?typed:Math.max(m[1],typed)]}
 if(!jobComps(k).includes(c))return null;return [m[0],ty[c]??auto[c]??0]};
const expMP=r=>{const m=mmGet(r.job,r.comp);return m&&m[1]&&r.actual&&r.hrs?Math.round(m[1]/m[0]*r.actual*(8/r.hrs)):0};
let PV='CAN';
VIEWS.production=()=>{
 $('#main').innerHTML=`<div class="card"><h2>Production entries</h2><div class="row noprint"><label>View<select id="pvw"><option value="CAN" ${PV==='CAN'?'selected':''}>CAN</option><option value="COMP" ${PV==='COMP'?'selected':''}>Components</option></select></label>
 <label>Date<input type="date" id="pd"></label><label>Search<input id="es" placeholder="Job, vendor, job ID"></label><button class="b l" id="eg">${bt('search','Search')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button><button class="b g" id="en">${bt('plus','New production')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 const load=()=>{const t=$('#es').value.toLowerCase(),d0=$('#pd').value,v=$('#pvw').value;PV=v;
  const d=PROD.filter(r=>(v==='CAN'?r.comp==='CAN':r.comp!=='CAN')&&(!d0||r.date===d0)&&(!t||(r.vendor+r.job+r.spec+jobId(r.colour,r.variant,r.shape,r.vendor,r.job,r.spec)).toLowerCase().includes(t)));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th>Date</th><th>Job ID</th><th>Vendor</th><th>Job Name</th><th>Job Spec</th><th>Component</th><th>Actual production</th><th>Man power</th><th>Hours</th><th>Expected MP</th><th>Efficiency</th><th>FG</th><th>SFG</th><th>Dispatch</th><th>Scrap</th><th>Actions</th></tr>
  ${d.map(r=>{const id=jobId(r.colour,r.variant,r.shape,r.vendor,r.job,r.spec),em=expMP(r),ef=r.mp?em/r.mp:0;return `<tr><td>${r.date}</td><td>${id}</td><td>${esc(r.vendor)}</td><td>${esc(r.job)}</td><td>${esc(r.spec)}</td><td>${r.comp}</td><td><b>${(+r.actual).toLocaleString()}</b></td><td>${r.mp}</td><td>${r.hrs}</td><td>${em||''}</td><td>${em?`<span class="tag ${ef>=1?'ok':ef>=.8?'warn':'bad'}">${(ef*100).toFixed(0)}%</span>`:''}</td><td>${r.fg||''}</td><td>${r.sfg||''}</td><td>${dispatched(id)||''}</td><td>${r.scrap||''}</td><td>${ib('eye','View',`data-e="${r.id}"`)}${ib('edit','Edit',`data-ed="${r.id}"`)}${ib('trash','Delete',`data-del="${r.id}"`,'bad')}</td></tr>`}).join('')}</table></div><div class="mut">${d.length} shown · Expected MP = (matrix MP ÷ matrix target) × actual × (8 ÷ hours)</div>`;
  bindDel(PROD,'id','Production entry',x=>x.job+' '+x.comp+' on '+x.date,()=>VIEWS.production());
  document.querySelectorAll('[data-e],[data-ed]').forEach(a=>a.onclick=()=>prodForm(PROD.find(x=>x.id==(a.dataset.e||a.dataset.ed))))};
 load();$('#eg').onclick=load;$('#es').oninput=load;$('#pd').onchange=load;$('#pvw').onchange=load;$('#en').onclick=()=>prodForm(null)};
function prodForm(e){const isNew=!e;
 $('#ttl').innerHTML=I('dashboard')+' '+(isNew?'New Production':'Edit Production');
 const jobs=[];DB_JOBS.forEach(k=>{const id=jobId(k.colour,k.variant,k.shape,k.vendor,k.job,k.spec);if(!jobs.find(j=>j.id===id))jobs.push({id,colour:k.colour,variant:k.variant,shape:k.shape,vendor:k.vendor,job:k.job,spec:k.spec})});if(e&&!jobs.find(j=>j.id===jobId(e.colour,e.variant,e.shape,e.vendor,e.job,e.spec)))jobs.push({id:jobId(e.colour,e.variant,e.shape,e.vendor,e.job,e.spec),colour:e.colour,variant:e.variant,shape:e.shape,vendor:e.vendor,job:e.job,spec:e.spec});
 const cur=e?jobId(e.colour,e.variant,e.shape,e.vendor,e.job,e.spec):'';const v=k=>esc(e?.[k]??'');
 const sel=(id,l,opts,c)=>`<label>${l}<select id="${id}">${opts.map(o=>`<option ${String(c)===String(o)?'selected':''}>${o}</option>`).join('')}</select></label>`;
 $('#main').innerHTML=`<div class="row noprint" style="margin-bottom:12px"><button class="b l" id="bk">${bt('x','Back to production')}</button></div>
 <div class="card"><h2>1. Job</h2><div class="fg"><label>Shape<select id="psh"></select></label><label>Job Name<select id="pjb"></select></label><label>Job Spec<select id="psp"></select></label><label>Vendor<select id="psv"></select></label><label>Variant<select id="psva"></select></label><label>Colour<select id="pcol"></select></label><div class="mut" id="phint" style="grid-column:1/-1"></div>
  <label>Job ID (auto)<input id="jid" readonly></label><label>Vendor<input id="ve" readonly></label><label>Variant<input id="va" readonly></label>
  <label>Colour<input id="col" readonly></label><label>Shape<input id="sh" readonly></label><label>Job Name<input id="jb" readonly></label><label>Job Spec<input id="sp" readonly></label></div>
  <div class="row noprint" style="margin-top:8px"><button class="b l" id="njp">${bt('plus','Add new job / job spec')}</button><span class="mut">Production does not depend on a skid. Pick any job; if it is not listed, add it here.</span></div></div>
 <div class="card"><h2>2. Production</h2><div class="fg"><label>Date<input id="d" type="date" value="${e?e.date:TODAY}"></label>${sel('cm','Component',['CAN','BODY','LID','BOTTOM','TAGGER'],e?.comp)}
  <label>Actual production (Nos)<input id="ap" type="number" value="${v('actual')}"></label><label>Man power consumed<input id="mp" type="number" value="${v('mp')}"></label>
  <label>Hours consumed<input id="hr" type="number" step="0.5" value="${v('hrs')}"></label><label>Expected man power (auto)<input id="em" readonly></label><label>Man power efficiency (auto)<input id="ef" readonly></label><label>Dispatch to date (auto)<input id="dp" readonly></label></div><div id="mpbox" style="margin-top:10px"></div><div class="fg" style="margin-top:10px">
  <label>FG<input id="fg" type="number" value="${v('fg')}"></label><label>SFG<input id="sf" type="number" value="${v('sfg')}"></label><label>Scrap (Nos)<input id="sc" type="number" value="${v('scrap')}"></label></div></div>
 <div class="card"><h2>3. Carton used</h2><div class="fg"><label>Carton variation<select id="cv"><option value="">— none —</option>${Object.keys(CARTON).map(k=>`<option ${e&&e.cvar===k?'selected':''}>${k}</option>`).join('')}</select></label>
  <label>Carton name<select id="cn"><option value="">— pick variation first —</option></select></label><label>Quantity<input id="cq" type="number" value="${v('cqty')}"></label></div>
  <div class="row noprint" style="margin-top:14px"><button class="b g" id="sv2">${bt('save',isNew?'Save production':'Save changes')}</button><button class="b l" id="cx">${bt('x','Cancel')}</button></div></div>`;
 const J=()=>{const sh=$('#psh').value,jb=$('#pjb').value,sp=$('#psp').value,ve=$('#psv').value,va=$('#psva').value,co=$('#pcol').value;if(!(sh&&jb&&sp&&ve&&va&&co))return null;return {id:jobId(co,va,sh,ve,jb,sp),colour:co,variant:va,shape:sh,vendor:ve,job:jb,spec:sp}};
 const po=(id,arr,ph,cur)=>{$(id).innerHTML=`<option value="">${ph}</option>`+arr.map(o=>`<option value="${esc(o)}" ${o===cur?'selected':''}>${esc(o)}</option>`).join('')};
 const cj0=e?{shape:e.shape,job:e.job,spec:e.spec,vendor:e.vendor,variant:e.variant,colour:e.colour}:null;
 /* shape, job name and job spec always come from Job Master */
 const fSh=()=>po('#psh',Object.keys(MOCK.shapes).sort(),'— pick shape —',cj0?.shape);
 const fJb=c=>{const s=$('#psh').value;po('#pjb',Object.keys(MOCK.shapes[s]||{}).sort(),s?'— pick job name —':'— pick shape first —',c)};
 const fSp=c=>{const s=$('#psh').value,jb=$('#pjb').value;po('#psp',((MOCK.shapes[s]||{})[jb]||[]).slice().sort(),jb?'— pick job spec —':'— pick job name first —',c)};
 const fVe=c=>po('#psv',Object.keys(MOCK.vendors).sort(),'— pick vendor —',c);
 const fVa=c=>{const v=$('#psv').value;po('#psva',(MOCK.vendors[v]||[]).slice().sort(),v?'— pick variant —':'— pick vendor first —',c)};
 const fCo=c=>po('#pcol',MOCK.colours,'— pick colour —',c);
 const prior=()=>DB_JOBS.filter(j=>j.shape===$('#psh').value&&j.job===$('#pjb').value&&j.spec===$('#psp').value);
 const fHint=auto=>{const L=prior();$('#phint').textContent=L.length?'Produced before for: '+L.slice(0,6).map(j=>j.vendor+' · '+j.variant+' · '+j.colour).join('   |   '):($('#psp').value?'No earlier entry for this job spec - pick the vendor, variant and colour.':'');
  if(auto&&!e&&L.length===1){$('#psv').value=L[0].vendor;fVa(L[0].variant);$('#pcol').value=L[0].colour}};
 fSh();fJb(cj0?.job);fSp(cj0?.spec);fVe(cj0?.vendor);fVa(cj0?.variant);fCo(cj0?.colour);fHint(false);
 $('#psh').onchange=()=>{fJb();fSp();fHint();upd()};$('#pjb').onchange=()=>{fSp();fHint();upd()};$('#psp').onchange=()=>{fHint(true);upd()};
 $('#psv').onchange=()=>{fVa();upd()};$('#psva').onchange=()=>upd();$('#pcol').onchange=()=>upd();
 $('#njp').onclick=()=>newJobModal(j=>{((MOCK.shapes[j.shape]=MOCK.shapes[j.shape]||{})[j.job]=MOCK.shapes[j.shape][j.job]||[]);if(!MOCK.shapes[j.shape][j.job].includes(j.spec))MOCK.shapes[j.shape][j.job].push(j.spec);
  (MOCK.vendors[j.vendor]=MOCK.vendors[j.vendor]||[]);if(!MOCK.vendors[j.vendor].includes(j.variant))MOCK.vendors[j.vendor].push(j.variant);
  fSh();$('#psh').value=j.shape;fJb(j.job);fSp(j.spec);fVe(j.vendor);fVa(j.variant);$('#pcol').value=j.colour;fHint();upd()});
 const upd=()=>{const j=J(),f=(i,x)=>$(i).value=x??'';if(j){f('#jid',j.id);f('#ve',j.vendor);f('#va',j.variant);f('#col',j.colour);f('#sh',j.shape);f('#jb',j.job);f('#sp',j.spec);f('#dp',dispatched(j.id))}
  const cp=$('#cm').value;$('#fg').disabled=!['BODY','LID','BOTTOM','CAN'].includes(cp);$('#sf').disabled=cp!=='CAN';if($('#fg').disabled)$('#fg').value=0;if($('#sf').disabled)$('#sf').value=0;
  mpAssist(j,e);
  const r={job:j?.job||'',comp:$('#cm').value,actual:+$('#ap').value,hrs:+$('#hr').value},em=expMP(r);f('#em',em||'');f('#ef',em&&+$('#mp').value?(em/+$('#mp').value*100).toFixed(0)+' %':'')};
 mpTouched=hrTouched=!!e;['#cm','#ap','#mp','#hr','#d'].forEach(i=>$(i).oninput=$(i).onchange=ev=>{if(ev.type==='input'&&ev.target.id==='mp')mpTouched=true;if(ev.type==='input'&&ev.target.id==='hr')hrTouched=true;upd()});upd();
 const cv=()=>{$('#cn').innerHTML='<option value="">— pick —</option>'+(CARTON[$('#cv').value]||[]).map(n=>`<option ${e&&e.cname===n?'selected':''}>${esc(n)}</option>`).join('')};$('#cv').onchange=cv;cv();
 $('#bk').onclick=$('#cx').onclick=()=>go('production');
 $('#sv2').onclick=()=>{const j=J();if(!j)return toast('Pick the job',true);if(!+$('#ap').value)return toast('Enter the actual production',true);if(!(+$('#hr').value>0))return toast('Enter the hours consumed',true);if(!(+$('#mp').value>0))return toast('Enter the man power',true);
  const r={date:$('#d').value,colour:j.colour,variant:j.variant,shape:j.shape,vendor:j.vendor,job:j.job,spec:j.spec,comp:$('#cm').value,actual:+$('#ap').value,mp:+$('#mp').value||0,hrs:+$('#hr').value||0,fg:+$('#fg').value||0,sfg:+$('#sf').value||0,scrap:+$('#sc').value||0,cvar:$('#cv').value,cname:$('#cn').value,cqty:+$('#cq').value||0};
  saveLive('production_save',{id:e?.id,entry_date:r.date,job:jobObj(r),component:r.comp,actual_production:r.actual,man_power:r.mp,hours:r.hrs,fg:r.fg,sfg:r.sfg,scrap:r.scrap,carton_item_id:r.cname?CI_ID[r.cvar+'|'+r.cname]||null:null,carton_qty:r.cname?r.cqty:null},'production')}}
/* ---------------- Outward (dispatch) — list + entry ---------------- */
OUT=[{id:1,date:'2026-11-09',so:'2600310',vendor:'CARATLANE TRADING PVT LTD - MH',variant:'CARATLANE',colour:'PRINTED',shape:'RECTANGLE',job:'WALLET 27MM MANUAL',spec:'115x95x50',boxes:37,perbox:48,qty:1776,invoice:'INV-2611-014',dc:'241',contact:'9876543210',vehicle:'PY01AB1234'},
 {id:2,date:'2026-11-10',so:'2500154',vendor:'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED',variant:'ALMOND TINS',colour:'PRINTED',shape:'ROUND',job:'101 DIA SLIP LID',spec:'101x25',boxes:20,perbox:100,qty:2100,invoice:'',dc:'242',contact:'',vehicle:'TN32CD5678'},
 {id:3,date:'2026-11-10',so:'',vendor:'LBN INDUSTRIES',variant:'PRINTED TIN',colour:'COLOR',shape:'SQUARE',job:'BUSH 65MM',spec:'65X65X55',boxes:750,perbox:120,qty:90000,invoice:'INV-2611-015',dc:'243',contact:'',vehicle:'PY01EF9012'}];
OUT.forEach(o=>o.jid=jobId(o.colour,o.variant,o.shape,o.vendor,o.job,o.spec));
const owCheck=o=>{const p=(+o.boxes||0)*(+o.perbox||0);return {packed:p,diff:(+o.qty||0)-p,ok:p===(+o.qty||0)}};
const fgMade=id=>PROD.filter(r=>jobId(r.colour,r.variant,r.shape,r.vendor,r.job,r.spec)===id).reduce((a,r)=>a+(+r.fg||0)+(+r.sfg||0),0);
let OWM='';
VIEWS.outward=()=>{
 const mon=OUT.filter(o=>o.date.slice(0,7)==='2026-11'),bad=OUT.filter(o=>!owCheck(o).ok);
 $('#main').innerHTML=`<div class="kpi"><div><b>${mon.length}</b>Entries (Nov 2026)</div><div><b>${mon.reduce((a,o)=>a+(+o.qty||0),0).toLocaleString()}</b>Dispatched Nos (Nov 2026)</div><div><b>${mon.reduce((a,o)=>a+(+o.boxes||0),0).toLocaleString()}</b>Boxes (Nov 2026)</div><div><b>${bad.length}</b>Box check mismatches</div></div>
 <div class="card"><h2>Outward (dispatch)</h2><div class="row noprint"><label>Search<input id="es" placeholder="Sale Order, DC, invoice, vendor, job, vehicle"></label>
 <label>Month<select id="em"><option value="">All</option><option value="2026-11" selected>NOV 2026</option><option value="2026-07">JUL 2026</option></select></label>
 <label>Box check<select id="eb"><option value="">All</option><option value="ok">Matches</option><option value="bad">Mismatch</option></select></label>
 <button class="b l" id="eg">${bt('search','Search')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button><button class="b g" id="en">${bt('plus','New dispatch')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 const load=()=>{const t=$('#es').value.toLowerCase(),m=$('#em').value,b=$('#eb').value;
  const d=OUT.filter(o=>(!m||o.date.slice(0,7)===m)&&(!b||(b==='ok')===owCheck(o).ok)&&(!t||Object.values(o).join(' ').toLowerCase().includes(t)));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th>Date</th><th>DC No</th><th>Invoice</th><th>Sale Order</th><th>Vendor</th><th>Variant</th><th>Job ID</th><th>Job Name</th><th>Job Spec</th><th>Boxes</th><th>Packing</th><th>Dispatch Nos</th><th>Box check</th><th>Vehicle</th><th>Actions</th></tr>
  ${d.map(o=>{const c=owCheck(o);return `<tr><td>${o.date}</td><td>${esc(o.dc)}</td><td>${esc(o.invoice)}</td><td>${o.so||'<span class="tag">stock</span>'}</td><td>${esc(o.vendor)}</td><td>${esc(o.variant)}</td><td>${o.jid}</td><td>${esc(o.job)}</td><td>${esc(o.spec)}</td><td>${o.boxes}</td><td>${o.boxes}x${o.perbox}</td><td><b>${(+o.qty).toLocaleString()}</b></td>
  <td>${c.ok?'<span class="tag ok">OK</span>':`<span class="tag bad">${c.diff>0?'+':''}${c.diff.toLocaleString()}</span>`}</td><td>${esc(o.vehicle)}</td><td>${ib('eye','View',`data-e="${o.id}"`)}${ib('edit','Edit',`data-ed="${o.id}"`)}${ib('trash','Delete',`data-del="${o.id}"`,'bad')}</td></tr>`}).join('')}</table></div><div class="mut">${d.length} shown · Box check = Boxes × Qty per box compared with the dispatch quantity (should match)</div>`;
  bindDel(OUT,'id','Outward entry',x=>(x.job||'')+' on '+x.date,()=>VIEWS.outward());
  document.querySelectorAll('[data-e],[data-ed]').forEach(a=>a.onclick=()=>outForm(OUT.find(x=>x.id==(a.dataset.e||a.dataset.ed))))};
 load();$('#eg').onclick=load;$('#es').oninput=load;$('#em').onchange=load;$('#eb').onchange=load;$('#en').onclick=()=>outForm(null)};
function outForm(e,stock){const isNew=!e;stock=stock??(e?!e.so:false);
 $('#ttl').innerHTML=I('open')+' '+(isNew?'New Dispatch':'Edit Dispatch');
 const v=k=>esc(e?.[k]??'');
 const soNos=[...new Set(MOCK.so.map(r=>r.so))];const soOpts=soNos.map(n=>`<option ${e&&e.so===n?'selected':''}>${n}</option>`).join('');
 const r0=MOCK.so.find(r=>e&&e.so===r.so&&e.variant===r.variant);
 $('#main').innerHTML=`<div class="row noprint" style="margin-bottom:12px"><button class="b l" id="bk">${bt('x','Back to outward')}</button></div>
 <div class="card"><h2>1. Source</h2><div class="row noprint" style="margin-bottom:8px"><label>Entry type<select id="mode"><option value="so" ${stock?'':'selected'}>With Sale Order</option><option value="stock" ${stock?'selected':''}>Stock (no Sale Order)</option></select></label></div>
  <div class="fg" id="soBox" style="${stock?'display:none':''}"><label>Sale Order No<select id="so"><option value="">— pick Sale Order No —</option>${soOpts}</select></label>
   <label>Variant (from Sale Order)<select id="va"><option value="">— pick Sale Order first —</option></select></label>
   <label>Vendor (from Sale Order)<input id="ve" readonly value="${esc(r0?.vendor||'')}"></label><label>Colour (from Sale Order)<input id="col" readonly value="${esc(r0?.colour||'')}"></label>
   <label>Sale qty<input id="sq" readonly></label><label>Already dispatched<input id="sd" readonly></label><label>Pending qty<input id="pq" readonly></label><label>Pending after this dispatch<input id="pa" readonly></label></div>
  <div class="fg" id="stBox" style="${stock?'':'display:none'}"><label>Vendor<select id="sv"><option value="">— pick —</option>${Object.keys(MOCK.vendors).map(x=>`<option ${e&&e.vendor===x?'selected':''}>${esc(x)}</option>`).join('')}<option value="__new">+ Enter manually…</option></select></label>
   <label id="svnl" style="display:none">New vendor name<input id="svn" placeholder="added to the vendor list automatically"></label>
   <label>Variant<select id="sva"><option value="">— pick vendor first —</option></select></label><label id="svanl" style="display:none">New variant name<input id="svan" placeholder="added to the variant list automatically"></label>
   <label>Colour<select id="scol">${MOCK.colours.map(o=>`<option ${e?.colour===o?'selected':''}>${o}</option>`).join('')}</select></label><label>Reason (no Sale Order)<input id="rs" placeholder="e.g. advance stock"></label></div></div>
 <div class="card"><h2>2. Job details</h2><div class="fg">
  <label>Shape<select id="sh"><option value="">— pick —</option>${Object.keys(MOCK.shapes).map(s=>`<option ${e&&e.shape===s?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>Job Name<select id="jb"><option value="">— pick shape first —</option></select></label><label>Job Spec<select id="sp"><option value="">— pick job first —</option></select></label>
  <label>Job ID (auto)<input id="jid" readonly value="—"></label><label>FG + SFG made (Production)<input id="fgm" readonly></label><label>Dispatched so far (this job)<input id="djs" readonly></label><label>Stock available (auto)<input id="sa" readonly></label></div>
  <div class="mut" style="margin-top:6px">Stock available = FG + SFG entered in Production − dispatched. A dispatch above stock only shows a warning (rule: negative stock = warn).</div></div>
 <div class="card"><h2>3. Dispatch details</h2><div class="fg">
  <label>Date<input id="d" type="date" value="${e?e.date:TODAY}"></label><label>DC No<input id="dc" value="${v('dc')}"></label><label>Invoice No<input id="inv" value="${v('invoice')}"></label>
  <label>Vehicle No<input id="vh" value="${v('vehicle')}" placeholder="PY01AB1234"></label><label>Transport contact no<input id="tc" value="${v('contact')}" inputmode="numeric"></label>
  <label>No of boxes<input id="bx" type="number" value="${v('boxes')}"></label><label>Qty per box (Nos)<input id="pb" type="number" value="${v('perbox')}"></label><label>Packing style (auto)<input id="ps" readonly></label>
  <label>Dispatch quantity (Nos)<input id="dq" type="number" value="${v('qty')}"></label><label>Boxes × Qty per box (auto)<input id="pk" readonly></label><label>Box check (auto)<input id="bc" readonly></label></div>
  <div id="warn"></div>
  <div class="row noprint" style="margin-top:14px"><button class="b g" id="sv2">${bt('save',isNew?'Save dispatch':'Save changes')}</button><button class="b l" id="cx">${bt('x','Cancel')}</button></div></div>`;
 const opt=(id,arr,ph,cur)=>{$(id).innerHTML=`<option value="">${ph}</option>`+arr.map(o=>`<option ${o===cur?'selected':''}>${esc(o)}</option>`).join('')};
 const st=()=>$('#mode').value==='stock';
 const src=()=>{const s=st();return {ve:s?($('#sv').value==='__new'?$('#svn').value:$('#sv').value):$('#ve').value,va:s?($('#sva').value==='__new'?$('#svan').value:$('#sva').value):$('#va').value,co:s?$('#scol').value:$('#col').value}};
 const lines=()=>MOCK.so.filter(x=>x.so===$('#so').value);
 const calc=()=>{const s=src(),sh=$('#sh').value,j=$('#jb').value,p=$('#sp').value;const id=(sh&&j&&p&&s.ve&&s.va)?jobId(s.co,s.va,sh,s.ve,j,p):'';$('#jid').value=id||'—';
  const made=id?fgMade(id):0,done=id?OUT.filter(o=>o.jid===id&&o!==e).reduce((a,o)=>a+(+o.qty||0),0):0;$('#fgm').value=id?made.toLocaleString():'';$('#djs').value=id?done.toLocaleString():'';$('#sa').value=id?(made-done).toLocaleString():'';
  const b=+$('#bx').value,pb=+$('#pb').value,q=+$('#dq').value,pk=b*pb;$('#ps').value=b&&pb?b+'x'+pb:'';$('#pk').value=pk?pk.toLocaleString():'';
  $('#bc').value=!q||!pk?'':(pk===q?'✓ Matches':'✗ Difference '+(q-pk>0?'+':'')+(q-pk).toLocaleString());$('#bc').style.color=!q||!pk?'':(pk===q?'#0b6b3a':'#a4161a');
  const r=lines().find(x=>x.variant===$('#va').value);if(!st()&&r){const sd=OUT.filter(o=>o.so===r.so&&o.variant===r.variant&&o!==e).reduce((a,o)=>a+(+o.qty||0),0)+r.sent;$('#sq').value=r.qty.toLocaleString();$('#sd').value=sd.toLocaleString();$('#pq').value=(r.qty-sd).toLocaleString();$('#pa').value=(r.qty-sd-q).toLocaleString()}
  else if(!st()){['#sq','#sd','#pq','#pa'].forEach(i=>$(i).value='')}
  let w='';if(id&&q&&q>made-done)w+=`<div class="msg err" style="margin-top:8px">Dispatch ${q.toLocaleString()} is above the stock available (${(made-done).toLocaleString()}). You can still save — it will be flagged.</div>`;
  if(!st()&&r&&q&&r.qty-(OUT.filter(o=>o.so===r.so&&o.variant===r.variant&&o!==e).reduce((a,o)=>a+(+o.qty||0),0)+r.sent)-q<0)w+=`<div class="msg err" style="margin-top:8px">This dispatch is more than the Sale Order pending quantity.</div>`;
  if(pk&&q&&pk!==q)w+=`<div class="msg err" style="margin-top:8px">Boxes × Qty per box (${pk.toLocaleString()}) does not match the dispatch quantity (${q.toLocaleString()}). Check the box count before saving.</div>`;$('#warn').innerHTML=w};
 ['#bx','#pb','#dq','#svn','#svan','#scol'].forEach(i=>$(i).oninput=$(i).onchange=calc);
 $('#mode').onchange=()=>{$('#soBox').style.display=st()?'none':'';$('#stBox').style.display=st()?'':'none';calc()};
 const fill=()=>{const r=lines().find(x=>x.variant===$('#va').value);$('#ve').value=r?r.vendor:'';$('#col').value=r?r.colour:'';calc()};
 const soChg=()=>{const L=lines();$('#va').innerHTML=(L.length==1?'':'<option value="">— pick variant —</option>')+L.map(x=>`<option ${e&&e.variant===x.variant?'selected':''}>${esc(x.variant)}</option>`).join('');if(!L.length)$('#va').innerHTML='<option value="">— pick Sale Order first —</option>';fill()};
 $('#so').onchange=soChg;$('#va').onchange=fill;soChg();
 const vv=()=>{const x=$('#sv').value,nw=x==='__new';$('#svnl').style.display=nw?'':'none';if(nw){$('#sva').innerHTML='<option value="__new">+ Enter manually…</option>';$('#svanl').style.display=''}else{opt('#sva',MOCK.vendors[x]||[],'— pick —',e?.variant);$('#sva').insertAdjacentHTML('beforeend','<option value="__new">+ Enter manually…</option>');$('#svanl').style.display='none'}calc()};
 $('#sv').onchange=vv;vv();$('#sva').onchange=()=>{$('#svanl').style.display=$('#sva').value==='__new'?'':'none';calc()};
 const shp=()=>{const s=$('#sh').value;opt('#jb',Object.keys(MOCK.shapes[s]||{}),s?'— pick —':'— pick shape first —',e?.job);jb()};const jb=()=>{const j=$('#jb').value;opt('#sp',(MOCK.shapes[$('#sh').value]||{})[j]||[],j?'— pick —':'— pick job first —',e?.spec);calc()};
 $('#sh').onchange=shp;$('#jb').onchange=jb;$('#sp').onchange=calc;shp();calc();
 $('#bk').onclick=$('#cx').onclick=()=>go('outward');
 $('#sv2').onclick=()=>{const s=src(),r=lines().find(x=>x.variant===$('#va').value);if(!$('#sh').value||!$('#jb').value||!$('#sp').value)return toast('Pick shape, job name and job spec',true);if(!+$('#dq').value)return toast('Enter the dispatch quantity',true);if(!$('#dc').value)return toast('Enter the DC No',true);
  const rec={date:$('#d').value,so:st()?'':(r?r.so:''),vendor:s.ve,variant:s.va,colour:s.co,shape:$('#sh').value,job:$('#jb').value,spec:$('#sp').value,boxes:+$('#bx').value||0,perbox:+$('#pb').value||0,qty:+$('#dq').value,invoice:$('#inv').value,dc:$('#dc').value,contact:$('#tc').value,vehicle:$('#vh').value.toUpperCase()};rec.jid=jobId(rec.colour,rec.variant,rec.shape,rec.vendor,rec.job,rec.spec);
  saveLive('outward_save',{id:e?.id,entry_date:rec.date,so_no:rec.so,so_line_id:r?r.id:null,job:jobObj(rec,{so_line_id:r?r.id:null}),boxes:rec.boxes,packing_style:rec.perbox?rec.perbox+' per box':'',dispatch_qty:rec.qty,invoice:rec.invoice,dc_no:rec.dc,transport_contact:rec.contact,vehicle_no:rec.vehicle},'outward')};
}
/* ---------------- Scrap (list + entry) ---------------- */
let SCRAP=[{id:1,date:'2026-11-09',so:'2500154',vendor:'CONNEDIT BUSINESS SOLUTIONS PRIVATE LIMITED',variant:'ALMOND TINS',colour:'PRINTED',shape:'ROUND',job:'101 DIA SLIP LID',spec:'101x25',kb:0,kl:6.2,kbt:0,kbb:0,wb:0,wl:0.055,wbt:0,wbb:0},
 {id:2,date:'2026-11-10',so:'2600310',vendor:'CARATLANE TRADING PVT LTD - MH',variant:'CARATLANE',colour:'PRINTED',shape:'RECTANGLE',job:'WALLET 27MM MANUAL',spec:'115x95x50',kb:5.215,kl:0,kbt:0,kbb:0.69,wb:0.023,wl:0,wbt:0,wbb:0.045},
 {id:3,date:'2026-11-10',so:'',vendor:'LBN INDUSTRIES',variant:'PRINTED TIN',colour:'COLOR',shape:'SQUARE',job:'BUSH 65MM',spec:'65X65X55',kb:0,kl:0,kbt:0,kbb:73.13,wb:0,wl:0,wbt:0,wbb:0.052}];
SCRAP.forEach(r=>r.jid=jobId(r.colour,r.variant,r.shape,r.vendor,r.job,r.spec));
// counts exactly as the SCRAP sheet: BODY=ROUND(body/wt + body+bottom/wt), LID=lid/wt, BOTTOM=ROUND(bottom/wt + body+bottom/wt)
const dv=(a,b)=>b?a/b:0;
const scrapCnt=r=>({body:Math.round(dv(r.kb,r.wb)+dv(r.kbb,r.wbb)),lid:Math.round(dv(r.kl,r.wl)),bottom:Math.round(dv(r.kbt,r.wbt)+dv(r.kbb,r.wbb))});
const scrapKg=r=>(+r.kb||0)+(+r.kl||0)+(+r.kbt||0)+(+r.kbb||0);
VIEWS.scrap=()=>{
 const mon=SCRAP.filter(r=>r.date.slice(0,7)==='2026-11'),kg=mon.reduce((a,r)=>a+scrapKg(r),0),cn=mon.reduce((a,r)=>{const c=scrapCnt(r);return {b:a.b+c.body,l:a.l+c.lid,t:a.t+c.bottom}},{b:0,l:0,t:0});
 $('#main').innerHTML=`<div class="kpi"><div><b>${mon.length}</b>Entries (Nov 2026)</div><div><b>${kg.toFixed(1)}</b>Scrap kg (Nov 2026)</div><div><b>${cn.b.toLocaleString()}</b>Body Nos</div><div><b>${cn.l.toLocaleString()}</b>Lid Nos</div><div><b>${cn.t.toLocaleString()}</b>Bottom Nos</div></div>
 <div class="card"><h2>Scrap entries</h2><div class="row noprint"><label>Search<input id="es" placeholder="Vendor, job, job ID"></label>
 <label>Month<select id="em"><option value="">All</option><option value="2026-11" selected>NOV 2026</option><option value="2026-07">JUL 2026</option></select></label>
 <button class="b l" id="eg">${bt('search','Search')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button><button class="b g" id="en">${bt('plus','New scrap')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 const load=()=>{const t=$('#es').value.toLowerCase(),m=$('#em').value;const d=SCRAP.filter(r=>(!m||r.date.slice(0,7)===m)&&(!t||Object.values(r).join(' ').toLowerCase().includes(t)));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th rowspan=2>Date</th><th rowspan=2>Job ID</th><th rowspan=2>Vendor</th><th rowspan=2>Job Name</th><th rowspan=2>Job Spec</th><th colspan=5>Scrap kg</th><th colspan=3>Component count (auto)</th><th rowspan=2>Actions</th></tr><tr><th>Body</th><th>Lid</th><th>Bottom</th><th>Body+Bottom</th><th>Total</th><th>Body</th><th>Lid</th><th>Bottom</th></tr>
  ${d.map(r=>{const c=scrapCnt(r);return `<tr><td>${r.date}</td><td>${r.jid}</td><td>${esc(r.vendor)}</td><td>${esc(r.job)}</td><td>${esc(r.spec)}</td><td>${r.kb||''}</td><td>${r.kl||''}</td><td>${r.kbt||''}</td><td>${r.kbb||''}</td><td><b>${scrapKg(r).toFixed(2)}</b></td><td>${c.body||''}</td><td>${c.lid||''}</td><td>${c.bottom||''}</td><td>${ib('eye','View',`data-e="${r.id}"`)}${ib('edit','Edit',`data-ed="${r.id}"`)}${ib('trash','Delete',`data-del="${r.id}"`,'bad')}</td></tr>`}).join('')}</table></div><div class="mut">${d.length} shown · Count = scrap kg ÷ single component weight (Body+Bottom kg is split using its own weight)</div>`;
  bindDel(SCRAP,'id','Scrap entry',x=>(x.job||'')+' on '+x.date,()=>VIEWS.scrap());
  document.querySelectorAll('[data-e],[data-ed]').forEach(a=>a.onclick=()=>scrapForm(SCRAP.find(x=>x.id==(a.dataset.e||a.dataset.ed))))};
 load();$('#eg').onclick=load;$('#es').oninput=load;$('#em').onchange=load;$('#en').onclick=()=>scrapForm(null)};
function scrapForm(e,stock){const isNew=!e;stock=stock??(e?!e.so:false);
 $('#ttl').innerHTML=I('open')+' '+(isNew?'New Scrap':'Edit Scrap');const v=k=>esc(e?.[k]||'');
 const soNos=[...new Set(MOCK.so.map(r=>r.so))];const soOpts=soNos.map(n=>`<option ${e&&e.so===n?'selected':''}>${n}</option>`).join('');
 const r0=MOCK.so.find(r=>e&&e.so===r.so&&e.variant===r.variant);
 $('#main').innerHTML=`<div class="row noprint" style="margin-bottom:12px"><button class="b l" id="bk">${bt('x','Back to scrap')}</button></div>
 <div class="card"><h2>1. Source</h2><div class="row noprint" style="margin-bottom:8px"><label>Entry type<select id="mode"><option value="so" ${stock?'':'selected'}>With Sale Order</option><option value="stock" ${stock?'selected':''}>Stock (no Sale Order)</option></select></label></div>
  <div class="fg" id="soBox" style="${stock?'display:none':''}"><label>Sale Order No<select id="so"><option value="">— pick Sale Order No —</option>${soOpts}</select></label>
   <label>Variant (from Sale Order)<select id="va"><option value="">— pick Sale Order first —</option></select></label>
   <label>Vendor (from Sale Order)<input id="ve" readonly value="${esc(r0?.vendor||'')}"></label><label>Colour (from Sale Order)<input id="col" readonly value="${esc(r0?.colour||'')}"></label></div>
  <div class="fg" id="stBox" style="${stock?'':'display:none'}"><label>Vendor<select id="sv"><option value="">— pick —</option>${Object.keys(MOCK.vendors).map(x=>`<option ${e&&e.vendor===x?'selected':''}>${esc(x)}</option>`).join('')}<option value="__new">+ Enter manually…</option></select></label>
   <label id="svnl" style="display:none">New vendor name<input id="svn"></label><label>Variant<select id="sva"><option value="">— pick vendor first —</option></select></label><label id="svanl" style="display:none">New variant name<input id="svan"></label>
   <label>Colour<select id="scol">${MOCK.colours.map(o=>`<option ${e?.colour===o?'selected':''}>${o}</option>`).join('')}</select></label></div></div>
 <div class="card"><h2>2. Job details</h2><div class="fg">
  <label>Shape<select id="sh"><option value="">— pick —</option>${Object.keys(MOCK.shapes).map(s=>`<option ${e&&e.shape===s?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>Job Name<select id="jb"><option value="">— pick shape first —</option></select></label><label>Job Spec<select id="sp"><option value="">— pick job first —</option></select></label><label>Job ID (auto)<input id="jid" readonly value="—"></label></div></div>
 <div class="card"><h2>3. Scrap</h2><div class="row noprint" style="margin-bottom:6px"><label>Date<input id="d" type="date" value="${e?e.date:TODAY}"></label></div>
  <div class="mut" style="margin-bottom:6px">Scrap weight (kg)</div><div class="fg"><label>Body<input id="kb" type="number" step="0.001" value="${v('kb')}"></label><label>Lid<input id="kl" type="number" step="0.001" value="${v('kl')}"></label><label>Bottom<input id="kbt" type="number" step="0.001" value="${v('kbt')}"></label><label>Body + Bottom<input id="kbb" type="number" step="0.001" value="${v('kbb')}"></label></div>
  <div class="mut" style="margin:10px 0 6px">Single component weight (kg) — taken from the Job Master (Quality) for this job, you can change it</div><div class="fg"><label>Body<input id="wb" type="number" step="0.0001" value="${v('wb')}"></label><label>Lid<input id="wl" type="number" step="0.0001" value="${v('wl')}"></label><label>Bottom<input id="wbt" type="number" step="0.0001" value="${v('wbt')}"></label><label>Body + Bottom<input id="wbb" type="number" step="0.0001" value="${v('wbb')}"></label></div>
  <div class="mut" style="margin:10px 0 6px">Component count (auto)</div><div class="fg"><label>Body Nos<input id="cb" readonly></label><label>Lid Nos<input id="cl" readonly></label><label>Bottom Nos<input id="ct" readonly></label><label>Total scrap kg<input id="tk" readonly></label></div>
  <div class="row noprint" style="margin-top:14px"><button class="b g" id="sv2">${bt('save',isNew?'Save scrap':'Save changes')}</button><button class="b l" id="cx">${bt('x','Cancel')}</button></div></div>`;
 const opt=(id,arr,ph,cur)=>{$(id).innerHTML=`<option value="">${ph}</option>`+arr.map(o=>`<option ${o===cur?'selected':''}>${esc(o)}</option>`).join('')};
 const st=()=>$('#mode').value==='stock';const n=i=>+$(i).value||0;
 const src=()=>{const s=st();return {ve:s?($('#sv').value==='__new'?$('#svn').value:$('#sv').value):$('#ve').value,va:s?($('#sva').value==='__new'?$('#svan').value:$('#sva').value):$('#va').value,co:s?$('#scol').value:$('#col').value}};
 const lastW=()=>{const sh=$('#sh').value,j=$('#jb').value,p=$('#sp').value;const jm=jmFind(sh,j,p);if(jm&&(jmBody(jm)||jmLid(jm)||jmBot(jm)))return {b:jmBody(jm)?jmBody(jm)/1000:0,l:jmLid(jm)?jmLid(jm)/1000:0,t:jmBot(jm)?jmBot(jm)/1000:0};const sk=SKIDS.filter(k=>k.shape===sh&&k.job===j&&k.spec===p).map(k=>k.no);const L=SLITS.filter(t=>sk.includes(t.skid)).slice(-1)[0];return L?{b:L.bwt,l:L.lwt,t:L.btwt}:null};
 const calc=()=>{const s=src(),sh=$('#sh').value,j=$('#jb').value,p=$('#sp').value;$('#jid').value=(sh&&j&&p&&s.ve&&s.va)?jobId(s.co,s.va,sh,s.ve,j,p):'—';
  const c=scrapCnt({kb:n('#kb'),kl:n('#kl'),kbt:n('#kbt'),kbb:n('#kbb'),wb:n('#wb'),wl:n('#wl'),wbt:n('#wbt'),wbb:n('#wbb')});$('#cb').value=c.body||'';$('#cl').value=c.lid||'';$('#ct').value=c.bottom||'';$('#tk').value=(n('#kb')+n('#kl')+n('#kbt')+n('#kbb')).toFixed(3)};
 const autoW=()=>{if(e)return;const w=lastW();if(w){if(!$('#wb').value&&w.b)$('#wb').value=w.b;if(!$('#wl').value&&w.l)$('#wl').value=w.l;if(!$('#wbt').value&&w.t)$('#wbt').value=w.t}calc()};
 ['#kb','#kl','#kbt','#kbb','#wb','#wl','#wbt','#wbb','#svn','#svan','#scol'].forEach(i=>$(i).oninput=$(i).onchange=calc);
 $('#mode').onchange=()=>{$('#soBox').style.display=st()?'none':'';$('#stBox').style.display=st()?'':'none';calc()};
 const lines=()=>MOCK.so.filter(x=>x.so===$('#so').value);
 const fill=()=>{const r=lines().find(x=>x.variant===$('#va').value);$('#ve').value=r?r.vendor:'';$('#col').value=r?r.colour:'';calc()};
 const soChg=()=>{const L=lines();$('#va').innerHTML=(L.length==1?'':'<option value="">— pick variant —</option>')+L.map(x=>`<option ${e&&e.variant===x.variant?'selected':''}>${esc(x.variant)}</option>`).join('');if(!L.length)$('#va').innerHTML='<option value="">— pick Sale Order first —</option>';fill()};
 $('#so').onchange=soChg;$('#va').onchange=fill;soChg();
 const vv=()=>{const x=$('#sv').value,nw=x==='__new';$('#svnl').style.display=nw?'':'none';if(nw){$('#sva').innerHTML='<option value="__new">+ Enter manually…</option>';$('#svanl').style.display=''}else{opt('#sva',MOCK.vendors[x]||[],'— pick —',e?.variant);$('#sva').insertAdjacentHTML('beforeend','<option value="__new">+ Enter manually…</option>');$('#svanl').style.display='none'}calc()};
 $('#sv').onchange=vv;vv();$('#sva').onchange=()=>{$('#svanl').style.display=$('#sva').value==='__new'?'':'none';calc()};
 const shp=()=>{const s=$('#sh').value;opt('#jb',Object.keys(MOCK.shapes[s]||{}),s?'— pick —':'— pick shape first —',e?.job);jb()};const jb=()=>{const j=$('#jb').value;opt('#sp',(MOCK.shapes[$('#sh').value]||{})[j]||[],j?'— pick —':'— pick job first —',e?.spec);autoW()};
 $('#sh').onchange=shp;$('#jb').onchange=jb;$('#sp').onchange=autoW;shp();calc();
 $('#bk').onclick=$('#cx').onclick=()=>go('scrap');
 $('#sv2').onclick=()=>{const s=src(),r=lines().find(x=>x.variant===$('#va').value);if(!$('#sh').value||!$('#jb').value||!$('#sp').value)return toast('Pick shape, job name and job spec',true);if(!(n('#kb')||n('#kl')||n('#kbt')||n('#kbb')))return toast('Enter the scrap weight',true);
  const rec={date:$('#d').value,so:st()?'':(r?r.so:''),vendor:s.ve,variant:s.va,colour:s.co,shape:$('#sh').value,job:$('#jb').value,spec:$('#sp').value,kb:n('#kb'),kl:n('#kl'),kbt:n('#kbt'),kbb:n('#kbb'),wb:n('#wb'),wl:n('#wl'),wbt:n('#wbt'),wbb:n('#wbb')};rec.jid=jobId(rec.colour,rec.variant,rec.shape,rec.vendor,rec.job,rec.spec);
  saveLive('scrap_save',{id:e?.id,entry_date:rec.date,job:jobObj(rec,{so_line_id:r?r.id:null}),kg_body:rec.kb,kg_lid:rec.kl,kg_bottom:rec.kbt,kg_body_bottom:rec.kbb},'scrap')};
}
/* ---------------- QUALITY tile: Job Master + Job Calculator (weights feed Scrap) ---------------- */
const JM_DATA=[{"shape":"SQUARE","job":"BUSH 65MM","spec":"65X65X55","lid":"SLIP","ht":55,"bw":252.3,"bh":58.8,"bt":0.19,"lw":90,"lh":90,"lt":0.21,"tw":90,"th":90,"tt":0.2,"wb":22.13,"wl":10.5,"wt":10,"bbt":0.19,"bbw":22.127,"lbt":0.2,"lbw":10,"tbt":0.2,"tbw":10,"img":"BUSH 65MM H55MM.png"},{"shape":"RECTANGLE","job":"AJ 162MM","spec":"124x70x162","lid":"SLIP","ht":162,"bw":374,"bh":166,"bt":0.23,"lw":162.7,"lh":104.7,"lt":0.23,"tw":151.5,"th":93.55,"tt":0.23,"wb":112.09,"wl":26,"wt":22,"bbt":0.23,"bbw":112.093,"lbt":0.23,"lbw":26,"tbt":0.23,"tbw":22,"img":"AJ 162MM.png"},{"shape":"RECTANGLE","job":"WALLET 27MM AUTO","spec":"115x95x27","lid":"SLIP","ht":27,"bw":418,"bh":35,"bt":0.19,"lw":152,"lh":127,"lt":0.19,"tw":128,"th":108,"tt":0.19,"wb":21.82,"wl":25.65,"wt":18.05,"bbt":0.2,"bbw":21.821,"lbt":0.2,"lbw":27,"tbt":0.2,"tbw":19,"img":"WALLET 27MM AUTO.png"},{"shape":"RECTANGLE","job":"WALLET 27MM AUTO","spec":"115x95x40","lid":"SLIP","ht":40,"bw":418,"bh":48,"bt":0.23,"lw":152,"lh":127,"lt":0.2,"tw":128,"th":108,"tt":0.19,"wb":36.23,"wl":27,"wt":18.05,"bbt":0.2,"bbw":36.226,"lbt":0.2,"lbw":27,"tbt":0.2,"tbw":19,"img":"WALLET 27MM AUTO H40MM.png"},{"shape":"RECTANGLE","job":"WALLET 27MM AUTO","spec":"115x95x50","lid":"SLIP","ht":50,"bw":418,"bh":58,"bt":0.19,"lw":152,"lh":127,"lt":0.19,"tw":128,"th":108,"tt":0.19,"wb":36.16,"wl":25.65,"wt":18.05,"bbt":0.2,"bbw":36.16,"lbt":0.2,"lbw":27,"tbt":0.2,"tbw":19,"img":"WALLET 27MM AUTO H50MM.png"},{"shape":"RECTANGLE","job":"WALLET 27MM MANUAL","spec":"115x95x27","lid":"SLIP","ht":27,"bw":418,"bh":35,"bt":0.19,"lw":152,"lh":127,"lt":0.19,"tw":128,"th":108,"tt":0.19,"wb":21.82,"wl":25.65,"wt":18.05,"bbt":0.2,"bbw":21.821,"lbt":0.2,"lbw":27,"tbt":0.2,"tbw":19,"img":"WALLET 27MM MANUAL.png"},{"shape":"RECTANGLE","job":"WALLET 27MM MANUAL","spec":"115x95x40","lid":"SLIP","ht":40,"bw":418,"bh":48,"bt":0.19,"lw":152,"lh":127,"lt":0.19,"tw":128,"th":108,"tt":0.19,"wb":29.93,"wl":25.65,"wt":18.05,"bbt":0.2,"bbw":29.925,"lbt":0.2,"lbw":27,"tbt":0.2,"tbw":19,"img":"WALLET 27MM MANUAL H40MM.png"},{"shape":"RECTANGLE","job":"WALLET 27MM MANUAL","spec":"115x95x50","lid":"SLIP","ht":50,"bw":418,"bh":58,"bt":0.19,"lw":152,"lh":127,"lt":0.19,"tw":128,"th":108,"tt":0.19,"wb":36.16,"wl":25.65,"wt":18.05,"bbt":0.2,"bbw":36.16,"lbt":0.2,"lbw":27,"tbt":0.2,"tbw":19,"img":"WALLET 27MM MANUAL H50MM.png"},{"shape":"RECTANGLE","job":"NUTCASE 38MM","spec":"124x70x38","lid":"SLIP","ht":38,"bw":374.1,"bh":41,"bt":0.19,"lw":162.7,"lh":104.7,"lt":0.19,"tw":151.5,"th":93.45,"tt":0.19,"wb":22.88,"wl":22.45,"wt":19,"bbt":0.22,"bbw":22.877,"lbt":0.22,"lbw":26,"tbt":0.22,"tbw":22,"img":"NUTCASE 38MM.png"},{"shape":"RECTANGLE","job":"10.5x8 NECKED LID","spec":"10.5x8x40","lid":"NECK LID","ht":40,"bw":910,"bh":56,"bt":0.21,"lw":260.4,"lh":320.4,"lt":0.17,"tw":233,"th":293,"tt":0.19,"wb":84.01,"wl":96.83,"wt":90.04,"bbt":0.23,"bbw":84.008,"lbt":0.23,"lbw":131,"tbt":0.23,"tbw":109,"img":"10.5x8 NECKED LID H40MM.png"},{"shape":"RECTANGLE","job":"10.5x8 NECKED LID","spec":"10.5x8x50","lid":"NECK LID","ht":50,"bw":910,"bh":66,"bt":0.19,"lw":260.4,"lh":320.4,"lt":0.19,"tw":233,"th":293,"tt":0.19,"wb":89.58,"wl":108.22,"wt":90.04,"bbt":0.23,"bbw":89.579,"lbt":0.23,"lbw":131,"tbt":0.23,"tbw":109,"img":"10.5x8 NECKED LID H50MM.png"},{"shape":"RECTANGLE","job":"10.5x8 NECKED LID","spec":"10.5x8x60","lid":"NECK LID","ht":60,"bw":910,"bh":76,"bt":0.19,"lw":260.4,"lh":320.4,"lt":0.19,"tw":233,"th":293,"tt":0.19,"wb":103.15,"wl":108.22,"wt":90.04,"bbt":0.23,"bbw":103.152,"lbt":0.23,"lbw":131,"tbt":0.23,"tbw":109,"img":"10.5x8 NECKED LID H60MM.png"},{"shape":"RECTANGLE","job":"10.5x8 SLIP LID","spec":"10.5x8x40","lid":"SLIP","ht":40,"bw":913,"bh":43,"bt":0.19,"lw":247,"lh":309,"lt":0.19,"tw":229,"th":291,"tt":0.19,"wb":58.55,"wl":100.78,"wt":94.17,"bbt":0.23,"bbw":58.555,"lbt":0.23,"lbw":122,"tbt":0.23,"tbw":114,"img":"10.5x8 SLIP LID H40MM.png"},{"shape":"RECTANGLE","job":"10.5x8 SLIP LID","spec":"10.5x8x50","lid":"SLIP","ht":50,"bw":913,"bh":53,"bt":0.19,"lw":247,"lh":309,"lt":0.19,"tw":229,"th":291,"tt":0.19,"wb":72.17,"wl":100.78,"wt":94.17,"bbt":0.23,"bbw":72.172,"lbt":0.23,"lbw":122,"tbt":0.23,"tbw":114,"img":"10.5x8 SLIP LID H50MM.png"},{"shape":"RECTANGLE","job":"10.5x8 SLIP LID","spec":"10.5x8x60","lid":"SLIP","ht":60,"bw":913,"bh":63,"bt":0.19,"lw":247,"lh":309,"lt":0.19,"tw":229,"th":291,"tt":0.19,"wb":85.79,"wl":100.78,"wt":94.17,"bbt":0.23,"bbw":85.79,"lbt":0.23,"lbw":122,"tbt":0.23,"tbw":114,"img":"10.5x8 SLIP LID H60MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x25","lid":"SLIP","ht":25,"bw":324,"bh":28,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":13.53,"wl":19,"wt":15.2,"bbt":0.2,"bbw":13.531,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H25MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x40","lid":"SLIP","ht":40,"bw":324,"bh":43,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":20.78,"wl":19,"wt":15.2,"bbt":0.2,"bbw":20.78,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H40MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x50","lid":"SLIP","ht":50,"bw":324,"bh":53,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":25.61,"wl":19,"wt":15.2,"bbt":0.2,"bbw":25.612,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H50MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x60","lid":"SLIP","ht":60,"bw":324,"bh":63,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":30.44,"wl":19,"wt":15.2,"bbt":0.2,"bbw":30.444,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H60MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x75","lid":"SLIP","ht":75,"bw":324,"bh":78,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":37.69,"wl":19,"wt":15.2,"bbt":0.2,"bbw":37.693,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H75MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x80","lid":"SLIP","ht":80,"bw":324,"bh":83,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":40.11,"wl":19,"wt":15.2,"bbt":0.2,"bbw":40.109,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H80MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x100","lid":"SLIP","ht":100,"bw":324,"bh":103,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":49.77,"wl":19,"wt":15.2,"bbt":0.2,"bbw":49.774,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H100MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x110","lid":"SLIP","ht":110,"bw":324,"bh":113,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":54.61,"wl":19,"wt":15.2,"bbt":0.2,"bbw":54.607,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H110MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x120","lid":"SLIP","ht":120,"bw":324,"bh":123,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":59.44,"wl":19,"wt":15.2,"bbt":0.2,"bbw":59.439,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H120MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x130","lid":"SLIP","ht":130,"bw":324,"bh":133,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":64.27,"wl":19,"wt":15.2,"bbt":0.2,"bbw":64.272,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H130MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x150","lid":"SLIP","ht":150,"bw":324,"bh":153,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":73.94,"wl":19,"wt":15.2,"bbt":0.2,"bbw":73.937,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H150MM.png"},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x160","lid":"SLIP","ht":160,"bw":324,"bh":163,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":78.77,"wl":19,"wt":15.2,"bbt":0.2,"bbw":78.769,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H160MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x25","lid":"PLUG","ht":25,"bw":324,"bh":35,"bt":0.2,"lw":133,"lh":131,"lt":0.2,"tw":120,"th":118,"tt":0.2,"wb":17.8,"wl":20,"wt":16,"bbt":0.2,"bbw":17.804,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H25MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x40","lid":"PLUG","ht":40,"bw":324,"bh":50,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":24.16,"wl":19,"wt":15.2,"bbt":0.2,"bbw":24.162,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H40MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x50","lid":"PLUG","ht":50,"bw":324,"bh":60,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":28.99,"wl":19,"wt":15.2,"bbt":0.2,"bbw":28.995,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H50MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x60","lid":"PLUG","ht":60,"bw":324,"bh":70,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":33.83,"wl":19,"wt":15.2,"bbt":0.2,"bbw":33.827,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H60MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x75","lid":"PLUG","ht":75,"bw":324,"bh":85,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":41.08,"wl":19,"wt":15.2,"bbt":0.2,"bbw":41.076,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H75MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x80","lid":"PLUG","ht":80,"bw":324,"bh":90,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":43.49,"wl":19,"wt":15.2,"bbt":0.2,"bbw":43.492,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H80MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x100","lid":"PLUG","ht":100,"bw":324,"bh":110,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":53.16,"wl":19,"wt":15.2,"bbt":0.2,"bbw":53.157,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H100MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x110","lid":"PLUG","ht":110,"bw":324,"bh":120,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":57.99,"wl":19,"wt":15.2,"bbt":0.2,"bbw":57.99,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H110MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x120","lid":"PLUG","ht":120,"bw":324,"bh":130,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":62.82,"wl":19,"wt":15.2,"bbt":0.2,"bbw":62.822,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H120MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x130","lid":"PLUG","ht":130,"bw":324,"bh":140,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":67.65,"wl":19,"wt":15.2,"bbt":0.2,"bbw":67.654,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H130MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x150","lid":"PLUG","ht":150,"bw":324,"bh":160,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":77.32,"wl":19,"wt":15.2,"bbt":0.2,"bbw":77.319,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H150MM.png"},{"shape":"ROUND","job":"101 DIA PLUG LID","spec":"101x160","lid":"PLUG","ht":160,"bw":324,"bh":170,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":82.15,"wl":19,"wt":15.2,"bbt":0.2,"bbw":82.152,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA PLUG LID H160MM.png"},{"shape":"ROUND","job":"101 DIA HUNDIAL","spec":"101x130","lid":"SLIP","ht":130,"bw":324,"bh":133,"bt":0.19,"lw":133,"lh":131,"lt":0.19,"tw":120,"th":118,"tt":0.19,"wb":64.27,"wl":19,"wt":15.2,"bbt":0.2,"bbw":64.272,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA HUNDIAL H130MM.png"},{"shape":"ROUND","job":"66 DIA","spec":"66x100","lid":"SLIP","ht":100,"bw":null,"bh":103,"bt":null,"lw":null,"lh":null,"lt":null,"tw":null,"th":null,"tt":null,"wb":0,"wl":null,"wt":null,"bbt":null,"bbw":0,"lbt":null,"lbw":null,"tbt":null,"tbw":null,"img":"66 DIA H100MM.png"},{"shape":"RECTANGLE","job":"MYSURPA 27MM","spec":"80x40x27","lid":"SLIP","ht":27,"bw":260,"bh":32,"bt":0.2,"lw":112.5,"lh":72,"lt":0.2,"tw":98.5,"th":58,"tt":0.2,"wb":13.06,"wl":10,"wt":7,"bbt":0.2,"bbw":13.062,"lbt":0.2,"lbw":10,"tbt":0.2,"tbw":7,"img":"MYSURPA 27MM.png"},{"shape":"RECTANGLE","job":"MYSURPA 27MM","spec":"80x40x60","lid":"SLIP","ht":60,"bw":260,"bh":63,"bt":0.2,"lw":112.5,"lh":72,"lt":0.2,"tw":98.5,"th":58,"tt":0.2,"wb":25.72,"wl":10,"wt":7,"bbt":0.2,"bbw":25.717,"lbt":0.2,"lbw":10,"tbt":0.2,"tbw":7,"img":"MYSURPA 27MM H60MM.png"},{"shape":"RECTANGLE","job":"MYSURPA 27MM","spec":"80x40x100","lid":"SLIP","ht":100,"bw":260,"bh":103,"bt":0.2,"lw":112.5,"lh":72,"lt":0.2,"tw":98.5,"th":58,"tt":0.2,"wb":42.04,"wl":10,"wt":7,"bbt":0.2,"bbw":42.045,"lbt":0.2,"lbw":10,"tbt":0.2,"tbw":7,"img":"MYSURPA 27MM H100MM.png"},{"shape":"OVAL","job":"ZTALC 35GM CAN","spec":"OVAL 35 G","lid":"SLIP","ht":null,"bw":163.5,"bh":75,"bt":0.18,"lw":81,"lh":56,"lt":0.18,"tw":77,"th":48,"tt":0.18,"wb":17.33,"wl":4,"wt":4,"bbt":0.18,"bbw":17.327,"lbt":0.18,"lbw":4,"tbt":0.18,"tbw":4,"img":null},{"shape":"OVAL","job":"ASOKA 35GM","spec":"OVAL 35 G","lid":"SLIP","ht":null,"bw":163.5,"bh":75,"bt":0.18,"lw":81,"lh":56,"lt":0.18,"tw":77,"th":48,"tt":0.18,"wb":17.33,"wl":null,"wt":null,"bbt":0.18,"bbw":17.327,"lbt":0.18,"lbw":null,"tbt":0.18,"tbw":null,"img":null},{"shape":"OVAL","job":"ASOKA 70GM","spec":"OVAL 70 G","lid":"SLIP","ht":null,"bw":163.5,"bh":107,"bt":0.18,"lw":81,"lh":56,"lt":0.18,"tw":77,"th":48,"tt":0.18,"wb":24.72,"wl":4,"wt":4,"bbt":0.18,"bbw":24.72,"lbt":0.18,"lbw":4,"tbt":0.18,"tbw":4,"img":null},{"shape":"ROUND","job":"509 ROUND","spec":"141x60","lid":"SLIP","ht":60,"bw":448,"bh":66,"bt":0.18,"lw":175,"lh":173,"lt":0.18,"tw":165,"th":163,"tt":0.18,"wb":41.78,"wl":32,"wt":null,"bbt":0.18,"bbw":41.78,"lbt":0.18,"lbw":32,"tbt":0.18,"tbw":null,"img":"509 ROUND H60MM.png"},{"shape":"ROUND","job":"6 INCH ROUND","spec":"152x60","lid":"SLIP","ht":60,"bw":448,"bh":63,"bt":0.18,"lw":193,"lh":190,"lt":0.18,"tw":179,"th":176,"tt":0.18,"wb":39.88,"wl":38,"wt":32,"bbt":0.18,"bbw":39.881,"lbt":0.18,"lbw":38,"tbt":0.18,"tbw":32,"img":"6 INCH ROUND H60MM.png"},{"shape":"ROUND","job":"6 INCH ROUND","spec":"152x90","lid":"SLIP","ht":90,"bw":448,"bh":93,"bt":0.18,"lw":193,"lh":190,"lt":0.18,"tw":179,"th":176,"tt":0.18,"wb":58.87,"wl":38,"wt":32,"bbt":0.18,"bbw":58.871,"lbt":0.18,"lbw":38,"tbt":0.18,"tbw":32,"img":"6 INCH ROUND H90MM.png"},{"shape":"ROUND","job":"6 INCH ROUND","spec":"152x180","lid":"SLIP","ht":180,"bw":448,"bh":183,"bt":0.18,"lw":193,"lh":190,"lt":0.18,"tw":179,"th":176,"tt":0.18,"wb":115.84,"wl":38,"wt":32,"bbt":0.18,"bbw":115.843,"lbt":0.18,"lbw":38,"tbt":0.18,"tbw":32,"img":"6 INCH ROUND H180MM.png"},{"shape":"ROUND","job":"7.5 INCH ROUND","spec":"190X60","lid":"SLIP","ht":60,"bw":null,"bh":63,"bt":null,"lw":null,"lh":null,"lt":null,"tw":null,"th":null,"tt":null,"wb":0,"wl":null,"wt":null,"bbt":null,"bbw":0,"lbt":null,"lbw":null,"tbt":null,"tbw":null,"img":"7.5 INCH ROUND H60MM.png"},{"shape":"ROUND","job":"9 INCH ROUND","spec":"229x60","lid":"SLIP","ht":60,"bw":738,"bh":63,"bt":0.23,"lw":279,"lh":279,"lt":0.23,"tw":259,"th":259,"tt":0.23,"wb":83.94,"wl":101,"wt":85,"bbt":0.23,"bbw":83.945,"lbt":0.23,"lbw":101,"tbt":0.23,"tbw":85,"img":"9 INCH ROUND H60MM.png"},{"shape":"ROUND","job":"9 INCH ROUND","spec":"229x90","lid":"SLIP","ht":90,"bw":738,"bh":93,"bt":0.23,"lw":279,"lh":279,"lt":0.23,"tw":259,"th":259,"tt":0.23,"wb":123.92,"wl":101,"wt":85,"bbt":0.23,"bbw":123.919,"lbt":0.23,"lbw":101,"tbt":0.23,"tbw":85,"img":"9 INCH ROUND H90MM.png"},{"shape":"SQUARE","job":"67.5MM  SQUARE","spec":"67.5 x67.5x20","lid":"SLIP","ht":20,"bw":null,"bh":23,"bt":null,"lw":106.1,"lh":102.1,"lt":0.22,"tw":123.5,"th":119.5,"tt":0.22,"wb":0,"wl":13,"wt":17,"bbt":null,"bbw":0,"lbt":0.22,"lbw":13,"tbt":0.22,"tbw":17,"img":"67.5MM SQUARE H20MM.png"},{"shape":"SQUARE","job":"6x6 SQUARE","spec":"152x152x25","lid":"SLIP","ht":25,"bw":597,"bh":48,"bt":0.2,"lw":199,"lh":196,"lt":0.2,"tw":165.5,"th":162.52,"tt":0.2,"wb":44.99,"wl":55,"wt":39,"bbt":0.2,"bbw":44.99,"lbt":0.2,"lbw":55,"tbt":0.2,"tbw":39,"img":"6x6 SQUARE H25MM.png"},{"shape":"SQUARE","job":"6x6 SQUARE","spec":"152x152x30","lid":"SLIP","ht":30,"bw":597,"bh":53,"bt":0.2,"lw":199,"lh":196,"lt":0.2,"tw":165.5,"th":162.52,"tt":0.2,"wb":49.68,"wl":55,"wt":39,"bbt":0.2,"bbw":49.676,"lbt":0.2,"lbw":55,"tbt":0.2,"tbw":39,"img":"6x6 SQUARE H30MM.png"},{"shape":"SQUARE","job":"6x6 SQUARE","spec":"152x152x35","lid":"SLIP","ht":35,"bw":597,"bh":58,"bt":0.2,"lw":199,"lh":196,"lt":0.2,"tw":165.5,"th":162.52,"tt":0.2,"wb":54.36,"wl":55,"wt":39,"bbt":0.2,"bbw":54.363,"lbt":0.2,"lbw":55,"tbt":0.2,"tbw":39,"img":"6x6 SQUARE H35MM.png"},{"shape":"SQUARE","job":"6x6 SQUARE","spec":"152x152x40","lid":"SLIP","ht":40,"bw":597,"bh":63,"bt":0.2,"lw":199,"lh":196,"lt":0.2,"tw":165.5,"th":162.52,"tt":0.2,"wb":59.05,"wl":55,"wt":39,"bbt":0.2,"bbw":59.049,"lbt":0.2,"lbw":55,"tbt":0.2,"tbw":39,"img":"6x6 SQUARE H40MM.png"},{"shape":"SQUARE","job":"6x6 SQUARE","spec":"152x152x50","lid":"SLIP","ht":50,"bw":597,"bh":73,"bt":0.2,"lw":199,"lh":196,"lt":0.2,"tw":165.5,"th":162.52,"tt":0.2,"wb":68.42,"wl":55,"wt":39,"bbt":0.2,"bbw":68.422,"lbt":0.2,"lbw":55,"tbt":0.2,"tbw":39,"img":"6x6 SQUARE H50MM.png"},{"shape":"SQUARE","job":"6x6 SQUARE","spec":"152x152x60","lid":"SLIP","ht":60,"bw":597,"bh":83,"bt":0.2,"lw":199,"lh":196,"lt":0.2,"tw":165.5,"th":162.52,"tt":0.2,"wb":77.8,"wl":55,"wt":39,"bbt":0.2,"bbw":77.795,"lbt":0.2,"lbw":55,"tbt":0.2,"tbw":39,"img":"6x6 SQUARE H60MM.png"},{"shape":"SQUARE","job":"SQUARE 75MM","spec":"75X75X50","lid":"SLIP","ht":50,"bw":278.7,"bh":53,"bt":0.2,"lw":111,"lh":111,"lt":0.2,"tw":97,"th":97,"tt":0.2,"wb":23.19,"wl":15,"wt":12,"bbt":0.2,"bbw":23.191,"lbt":0.2,"lbw":15,"tbt":0.2,"tbw":12,"img":"SQUARE 75MM H50MM.png"},{"shape":"SQUARE","job":"4x4 SQUARE ","spec":"101X101X40","lid":"SLIP","ht":40,"bw":408,"bh":45,"bt":0.2,"lw":142,"lh":138.25,"lt":0.2,"tw":130,"th":126.5,"tt":0.2,"wb":28.83,"wl":26,"wt":23,"bbt":0.2,"bbw":28.825,"lbt":0.2,"lbw":26,"tbt":0.2,"tbw":23,"img":"4x4 SQUARE H40MM.png"},{"shape":"SQUARE","job":"4x4 SQUARE ","spec":"101X101X60","lid":"SLIP","ht":60,"bw":408,"bh":65,"bt":0.2,"lw":142,"lh":138.25,"lt":0.2,"tw":130,"th":126.5,"tt":0.2,"wb":41.64,"wl":26,"wt":23,"bbt":0.2,"bbw":41.636,"lbt":0.2,"lbw":26,"tbt":0.2,"tbw":23,"img":"4x4 SQUARE H60MM.png"},{"shape":"SQUARE","job":"4x4 SQUARE ","spec":"101X101X70","lid":"SLIP","ht":70,"bw":408,"bh":75,"bt":0.2,"lw":142,"lh":138.25,"lt":0.2,"tw":130,"th":126.5,"tt":0.2,"wb":48.04,"wl":26,"wt":23,"bbt":0.2,"bbw":48.042,"lbt":0.2,"lbw":26,"tbt":0.2,"tbw":23,"img":"4x4 SQUARE H70MM.png"},{"shape":"RECTANGLE","job":"MINT FLIP","spec":"None","lid":"SLIP","ht":null,"bw":122.5,"bh":55,"bt":0.22,"lw":46,"lh":51,"lt":0.22,"tw":51,"th":30,"tt":0.23,"wb":11.64,"wl":4,"wt":2.5,"bbt":0.22,"bbw":11.636,"lbt":0.22,"lbw":4,"tbt":0.23,"tbw":2.5,"img":null},{"shape":"RECTANGLE","job":"SLIDING2 PIECE","spec":"81x52x20","lid":"SLIP","ht":20,"bw":null,"bh":23,"bt":null,"lw":104.7,"lh":78.5,"lt":0.2,"tw":134.42,"th":103.23,"tt":0.22,"wb":0,"wl":10,"wt":15,"bbt":null,"bbw":0,"lbt":0.2,"lbw":10,"tbt":0.22,"tbw":15,"img":"SLIDING2 PIECE H20MM.png"},{"shape":"RECTANGLE","job":"SLIDING3 PIECE","spec":"81x52x20","lid":"SLIP","ht":20,"bw":263,"bh":27,"bt":0.2,"lw":104.7,"lh":78.5,"lt":0.2,"tw":93.75,"th":61.95,"tt":0.2,"wb":11.15,"wl":10,"wt":8,"bbt":0.2,"bbw":11.149,"lbt":0.2,"lbw":10,"tbt":0.2,"tbw":8,"img":"SLIDING3 PIECE H20MM.png"},{"shape":"HEART","job":"HEART ","spec":"230x210x30","lid":"SLIP","ht":30,"bw":712,"bh":33,"bt":0.23,"lw":271,"lh":262,"lt":0.23,"tw":241,"th":221.5,"tt":0.23,"wb":42.42,"wl":87,"wt":66,"bbt":0.23,"bbw":42.422,"lbt":0.23,"lbw":87,"tbt":0.23,"tbw":66,"img":"HEART H30MM.png"},{"shape":"HEXAGON","job":"HEXAGON","spec":"239x210x60","lid":"SLIP","ht":60,"bw":null,"bh":63,"bt":null,"lw":null,"lh":null,"lt":null,"tw":null,"th":null,"tt":null,"wb":null,"wl":null,"wt":null,"bbt":null,"bbw":null,"lbt":null,"lbw":null,"tbt":null,"tbw":null,"img":null},{"shape":"RECTANGLE","job":"86.5x57.5 ","spec":"86.5x57.5x22","lid":"SLIP","ht":22,"bw":null,"bh":25,"bt":null,"lw":null,"lh":null,"lt":null,"tw":null,"th":null,"tt":null,"wb":null,"wl":null,"wt":null,"bbt":null,"bbw":null,"lbt":null,"lbw":null,"tbt":null,"tbw":null,"img":null},{"shape":"RECTANGLE","job":"NUTCASE 38MM","spec":"124x70x90","lid":"SLIP","ht":90,"bw":374.1,"bh":93,"bt":0.22,"lw":162.7,"lh":104.7,"lt":0.22,"tw":151.5,"th":93.45,"tt":0.22,"wb":60.08,"wl":null,"wt":null,"bbt":0.22,"bbw":60.085,"lbt":0.22,"lbw":null,"tbt":0.22,"tbw":null,"img":"NUTCASE 38MM H90MM.png"},{"shape":"OVAL","job":"ASOKA 35GM PINK","spec":"OVAL 35 G","lid":"SLIP","ht":null,"bw":163.5,"bh":75,"bt":0.18,"lw":81,"lh":56,"lt":0.18,"tw":77,"th":48,"tt":0.18,"wb":17.33,"wl":null,"wt":null,"bbt":0.18,"bbw":17.327,"lbt":0.18,"lbw":null,"tbt":0.18,"tbw":null,"img":null},{"shape":"OVAL","job":"ASOKA 70GM PINK","spec":"OVAL 70 G","lid":"SLIP","ht":null,"bw":163.5,"bh":107,"bt":0.18,"lw":81,"lh":56,"lt":0.18,"tw":77,"th":48,"tt":0.18,"wb":24.72,"wl":4,"wt":4,"bbt":0.18,"bbw":24.72,"lbt":0.18,"lbw":4,"tbt":0.18,"tbw":4,"img":null},{"shape":"ROUND","job":"101 DIA SLIP LID","spec":"101x27","lid":"PLUG","ht":27,"bw":324,"bh":37,"bt":0.2,"lw":133,"lh":131,"lt":0.2,"tw":120,"th":118,"tt":0.2,"wb":18.82,"wl":20,"wt":16,"bbt":0.2,"bbw":18.821,"lbt":0.2,"lbw":20,"tbt":0.2,"tbw":16,"img":"101 DIA SLIP LID H27MM.png"},{"shape":"SQUARE","job":"4x4 SQUARE ","spec":"101X101X50","lid":"SLIP","ht":50,"bw":408,"bh":55,"bt":0.2,"lw":142,"lh":138.25,"lt":0.2,"tw":130,"th":126.5,"tt":0.2,"wb":35.23,"wl":26,"wt":23,"bbt":0.2,"bbw":35.231,"lbt":0.2,"lbw":26,"tbt":0.2,"tbw":23,"img":"4x4 SQUARE H50MM.png"},{"shape":"ROUND","job":"6 INCH ROUND","spec":"152x55","lid":"SLIP","ht":55,"bw":448,"bh":58,"bt":0.18,"lw":193,"lh":190,"lt":0.18,"tw":179,"th":176,"tt":0.18,"wb":36.72,"wl":38,"wt":32,"bbt":0.18,"bbw":36.715,"lbt":0.18,"lbw":38,"tbt":0.18,"tbw":32,"img":"6 INCH ROUND H55MM.png"},{"shape":"RECTANGLE","job":"10.5x8 SLIP LID","spec":"10.5x8x75","lid":"SLIP","ht":75,"bw":913,"bh":78,"bt":0.23,"lw":247,"lh":309,"lt":0.23,"tw":229,"th":291,"tt":0.23,"wb":128.58,"wl":122,"wt":114,"bbt":0.23,"bbw":128.577,"lbt":0.23,"lbw":122,"tbt":0.23,"tbw":114,"img":"10.5x8 SLIP LID H75MM.png"},{"shape":"SQUARE","job":"SQUARE 75MM","spec":"75X75X70","lid":"SLIP","ht":70,"bw":278.7,"bh":76,"bt":0.2,"lw":111,"lh":111,"lt":0.2,"tw":97,"th":97,"tt":0.2,"wb":33.25,"wl":15,"wt":12,"bbt":0.2,"bbw":33.254,"lbt":0.2,"lbw":15,"tbt":0.2,"tbw":12,"img":"SQUARE 75MM H70MM.png"},{"shape":"RECTANGLE","job":"AJ 184MM","spec":"124x70x184","lid":"SLIP","ht":184,"bw":486,"bh":189,"bt":0.23,"lw":130,"lh":197,"lt":0.23,"tw":117.2,"th":184.35,"tt":0.23,"wb":165.84,"wl":39,"wt":34,"bbt":0.23,"bbw":165.842,"lbt":0.23,"lbw":39,"tbt":0.23,"tbw":34,"img":"AJ 184MM.png"},{"shape":"ROUND","job":"7 INCH ROUND","spec":"175x60","lid":"INNER TYPE","ht":60,"bw":561,"bh":70,"bt":0.2,"lw":212,"lh":208,"lt":0.23,"tw":202,"th":202,"tt":0.2,"wb":61.65,"wl":59,"wt":46,"bbt":0.2,"bbw":61.654,"lbt":0.23,"lbw":59,"tbt":0.2,"tbw":46,"img":"7 INCH ROUND H60MM.png"},{"shape":"ROUND","job":"9 INCH ROUND","spec":"229x70","lid":"SLIP","ht":70,"bw":738,"bh":75,"bt":0.23,"lw":279,"lh":279,"lt":0.23,"tw":259,"th":259,"tt":0.23,"wb":99.93,"wl":101,"wt":85,"bbt":0.23,"bbw":99.934,"lbt":0.23,"lbw":101,"tbt":0.23,"tbw":85,"img":"9 INCH ROUND H70MM.png"},{"shape":"OVAL","job":"ZTALC 30GM CAN","spec":"OVAL 350G","lid":"SLIP","ht":null,"bw":163.5,"bh":60,"bt":0.18,"lw":81,"lh":56,"lt":0.18,"tw":77,"th":48,"tt":0.18,"wb":13.86,"wl":4,"wt":4,"bbt":0.18,"bbw":13.862,"lbt":0.18,"lbw":4,"tbt":0.18,"tbw":4,"img":null}];
let JM=JM_DATA.map((o,i)=>({id:i+1,...o,job:String(o.job).trim()}));
const JM_LID=['SLIP','PLUG','NECK LID','INNER TYPE'],JM_THK=[0.17,0.18,0.19,0.20,0.21,0.22,0.23,0.24];
const r2=x=>Math.round(x*100)/100;
// weights exactly as the Quality sheet: body = W x H x T x 0.785 / 100 (g); lid / bottom = base weight / base thickness x thickness
const jmBody=j=>j.bw&&j.bh&&j.bt?r2(j.bw*j.bh*j.bt*0.785/100):(j.wb||null);
const jmScale=(base,bt,t)=>base&&bt&&t?r2(base/bt*t):null;
const jmLid=j=>jmScale(j.lbw,j.lbt,j.lt)??j.wl??null, jmBot=j=>jmScale(j.tbw,j.tbt,j.tt)??j.wt??null;
const jmComplete=j=>!!(jmBody(j)&&jmLid(j)&&jmBot(j));
const jmMissing=j=>[!jmBody(j)&&'Body',!jmLid(j)&&'Lid',!jmBot(j)&&'Bottom'].filter(Boolean);
const jmFind=(sh,jb,sp)=>JM.find(j=>j.shape===sh&&j.job===jb&&String(j.spec).toLowerCase()===String(sp).toLowerCase());
// the Shape > Job Name > Job Spec drop-downs on every entry screen come from this master
function syncShapes(){const o={};JM.forEach(j=>{((o[j.shape]=o[j.shape]||{})[j.job]=o[j.shape][j.job]||[]).includes(j.spec)||o[j.shape][j.job].push(j.spec)});MOCK.shapes=o}
syncShapes();
// a job typed manually on an entry screen is saved as a draft so Quality can complete it
function jmDraft(shape,job,spec){if(!jmFind(shape,job,spec))JM.push({id:Date.now(),shape,job,spec,lid:'',draft:true,ht:+(String(spec).toLowerCase().replace(/\s/g,'').split('x').pop())||null});syncShapes()}
VIEWS.quality=()=>{
 const tot=JM.length,ok=JM.filter(jmComplete).length,drafts=JM.filter(j=>j.draft).length,jobs=new Set(JM.map(j=>j.job)).size;
 $('#main').innerHTML=`<div class="kpi"><div><b>${tot}</b>Job specs</div><div><b>${jobs}</b>Jobs</div><div><b>${ok}</b>Weights complete</div><div><b>${tot-ok}</b>Weights missing</div><div><b>${drafts}</b>New - need details</div></div>
 <div class="card"><h2>Job Master</h2><div class="row noprint"><label>Search<input id="es" placeholder="Job name, spec"></label>
 <label>Shape<select id="sh"><option value="">All</option>${[...new Set(JM.map(j=>j.shape))].sort().map(s=>`<option>${s}</option>`).join('')}</select></label>
 <label>Status<select id="st"><option value="">All</option><option value="ok">Weights complete</option><option value="miss">Weights missing</option><option value="new">New - need details</option></select></label>
 <button class="b l" id="eg">${bt('search','Search')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button><button class="b g" id="en">${bt('plus','New job')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 const load=()=>{const t=$('#es').value.toLowerCase(),sh=$('#sh').value,s=$('#st').value;
  const d=JM.filter(j=>(!sh||j.shape===sh)&&(!t||(j.job+' '+j.spec).toLowerCase().includes(t))&&(!s||(s==='ok'?jmComplete(j)&&!j.draft:s==='miss'?!jmComplete(j):!!j.draft)));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th>Shape</th><th>Job Name</th><th>Job Spec</th><th>Height</th><th>Lid type</th><th>Body blank</th><th>Body g</th><th>Lid g</th><th>Bottom g</th><th>With lid g</th><th>Without lid g</th><th>Picture</th><th>Status</th><th>Actions</th></tr>
  ${d.map(j=>{const b=jmBody(j),l=jmLid(j),t=jmBot(j),m=jmMissing(j);return `<tr><td>${j.shape}</td><td>${esc(j.job)}</td><td>${esc(j.spec)}</td><td>${j.ht??''}</td><td>${j.lid||''}</td><td>${j.bw?`${j.bw}×${j.bh}×${j.bt}`:''}</td><td>${b??''}</td><td>${l??''}</td><td>${t??''}</td><td>${b&&l&&t?r2(b+l+t):''}</td><td>${b&&t?r2(b+t):''}</td><td>${j.img?'<span class="tag ok">yes</span>':'<span class="tag">no</span>'}</td>
  <td>${j.draft?'<span class="tag warn">New - needs details</span>':m.length?`<span class="tag bad">Missing ${m.join(', ')}</span>`:'<span class="tag ok">Complete</span>'}</td><td>${ib('eye','View',`data-e="${j.id}"`)}${ib('edit','Edit',`data-ed="${j.id}"`)}</td></tr>`}).join('')}</table></div><div class="mut">${d.length} shown · Weights feed the Scrap calculation (component count = scrap kg ÷ single component weight)</div>`;
  document.querySelectorAll('[data-e],[data-ed]').forEach(a=>a.onclick=()=>jmForm(JM.find(x=>x.id==(a.dataset.e||a.dataset.ed))))};
 load();$('#eg').onclick=load;$('#es').oninput=load;$('#sh').onchange=load;$('#st').onchange=load;$('#en').onclick=()=>jmForm(null)};
function jmForm(e){const isNew=!e;$('#ttl').innerHTML=I('open')+' '+(isNew?'New Job':'Edit Job');const v=k=>esc(e?.[k]??'');
 const thk=(id,cur)=>`<select id="${id}"><option value="">—</option>${JM_THK.map(t=>`<option ${cur!=null&&Math.abs(cur-t)<.001?'selected':''}>${t.toFixed(2)}</option>`).join('')}</select>`;
 const shapes=['ROUND','SQUARE','RECTANGLE','OVAL','HEART','HEXAGON'];
 $('#main').innerHTML=`<div class="row noprint" style="margin-bottom:12px"><button class="b l" id="bk">${bt('x','Back to Job Master')}</button></div>
 <div class="card"><h2>1. Job</h2><div class="fg"><label>Shape<select id="sh"><option value="">— pick —</option>${shapes.map(s=>`<option ${e?.shape===s?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>Job Name<input id="jb" list="jbl" value="${v('job')}" placeholder="pick or type a new job name"><datalist id="jbl">${[...new Set(JM.map(j=>j.job))].map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
  <label>Job Spec (L x B x H or DIA x H)<input id="sp" value="${v('spec')}" placeholder="115x95x27"></label><label>Height (auto from spec)<input id="ht" readonly></label>
  <label>Lid type<select id="ld"><option value="">— pick —</option>${JM_LID.map(s=>`<option ${e?.lid===s?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>Job picture<input id="pic" type="file" accept="image/*"></label></div><div class="mut" id="picn" style="margin-top:6px">${e?.img?'Picture on file: '+esc(e.img):'No picture yet'}</div></div>
 <div class="card"><h2>2. Body blank</h2><div class="fg"><label>Width (mm)<input id="bw" type="number" step="0.01" value="${v('bw')}"></label><label>Height (mm)<input id="bh" type="number" step="0.01" value="${v('bh')}"></label><label>Thickness (mm)${thk('bt',e?.bt)}</label><label>Body weight g (auto)<input id="wb" readonly></label></div>
  <div class="mut" style="margin-top:6px">Body weight = Width × Height × Thickness × 0.785 ÷ 100</div></div>
 <div class="card"><h2>3. Lid blank</h2><div class="fg"><label>Width (mm)<input id="lw" type="number" step="0.01" value="${v('lw')}"></label><label>Height (mm)<input id="lh" type="number" step="0.01" value="${v('lh')}"></label><label>Thickness (mm)${thk('lt',e?.lt)}</label><label>Lid weight g (auto)<input id="wl" readonly></label>
  <label>Base thickness (mm)${thk('lbt',e?.lbt)}</label><label>Base weight g (measured)<input id="lbw" type="number" step="0.01" value="${v('lbw')}"></label></div>
  <div class="mut" style="margin-top:6px">Lid weight = Base weight ÷ Base thickness × Thickness. Weigh one lid blank and enter it as the base.</div></div>
 <div class="card"><h2>4. Bottom blank</h2><div class="fg"><label>Width (mm)<input id="tw" type="number" step="0.01" value="${v('tw')}"></label><label>Height (mm)<input id="th" type="number" step="0.01" value="${v('th')}"></label><label>Thickness (mm)${thk('tt',e?.tt)}</label><label>Bottom weight g (auto)<input id="wt" readonly></label>
  <label>Base thickness (mm)${thk('tbt',e?.tbt)}</label><label>Base weight g (measured)<input id="tbw" type="number" step="0.01" value="${v('tbw')}"></label></div></div>
 <div class="card"><h2>5. Totals (auto)</h2><div class="fg"><label>With lid g<input id="r1" readonly></label><label>Without lid g<input id="r2" readonly></label><label>Height with lid<input id="r3" readonly></label><label>Height without lid (− 3)<input id="r4" readonly></label></div>
  <div id="warn"></div><div class="row noprint" style="margin-top:14px"><button class="b g" id="sv2">${bt('save',isNew?'Save job':'Save changes')}</button><button class="b l" id="cx">${bt('x','Cancel')}</button></div></div>`;
 const n=i=>+$(i).value||0,val=i=>$(i).value;
 const calc=()=>{const sp=val('#sp').toLowerCase().replace(/\s/g,'').split('x').pop(),h=+sp||'';$('#ht').value=h;
  const J={bw:n('#bw'),bh:n('#bh'),bt:n('#bt'),lbw:n('#lbw'),lbt:n('#lbt'),lt:n('#lt'),tbw:n('#tbw'),tbt:n('#tbt'),tt:n('#tt')};const b=jmBody(J),l=jmScale(J.lbw,J.lbt,J.lt),t=jmScale(J.tbw,J.tbt,J.tt);
  $('#wb').value=b??'';$('#wl').value=l??'';$('#wt').value=t??'';$('#r1').value=b&&l&&t?r2(b+l+t):'';$('#r2').value=b&&t?r2(b+t):'';$('#r3').value=h;$('#r4').value=h?h-3:'';
  const m=[!b&&'Body',!l&&'Lid',!t&&'Bottom'].filter(Boolean);$('#warn').innerHTML=m.length?`<div class="msg err" style="margin-top:8px">Weight missing for: ${m.join(', ')}. The job is saved, but Scrap calculation cannot use it until these are filled.</div>`:''};
 document.querySelectorAll('#main input,#main select').forEach(i=>i.oninput=i.onchange=calc);calc();
 $('#pic').onchange=()=>{const f=$('#pic').files[0];$('#picn').textContent=f?'Picture selected: '+f.name:''};
 $('#bk').onclick=$('#cx').onclick=()=>go('quality');
 $('#sv2').onclick=()=>{if(!val('#sh')||!val('#jb').trim()||!val('#sp').trim())return toast('Enter shape, job name and job spec',true);
  const f=$('#pic').files[0];const rec={shape:val('#sh'),job:val('#jb').trim().toUpperCase(),spec:val('#sp').trim(),lid:val('#ld'),ht:+val('#ht')||null,bw:n('#bw')||null,bh:n('#bh')||null,bt:n('#bt')||null,lw:n('#lw')||null,lh:n('#lh')||null,lt:n('#lt')||null,tw:n('#tw')||null,th:n('#th')||null,tt:n('#tt')||null,lbt:n('#lbt')||null,lbw:n('#lbw')||null,tbt:n('#tbt')||null,tbw:n('#tbw')||null,img:f?f.name:e?.img,draft:false};
  if(isNew&&jmFind(rec.shape,rec.job,rec.spec)&&!jmFind(rec.shape,rec.job,rec.spec).draft)return toast('This job spec already exists - edit it instead',true);
  const ex=e||jmFind(rec.shape,rec.job,rec.spec);const o=ex||{};
  saveJM({job_spec_id:ex?ex.id:null,shape:rec.shape,job:rec.job,spec:rec.spec,lid_type:rec.lid,height:rec.ht,body_w:rec.bw,body_h:rec.bh,body_t:rec.bt,lid_w:rec.lw,lid_h:rec.lh,lid_t:rec.lt,bot_w:rec.tw,bot_h:rec.th,bot_t:rec.tt,wt_body:o.wb??null,wt_lid:o.wl??null,wt_bottom:o.wt??null,body_base_t:o.bbt??null,body_base_wt:o.bbw??null,lid_base_t:rec.lbt,lid_base_wt:rec.lbw,bot_base_t:rec.tbt,bot_base_wt:rec.tbw,picture_name:rec.img||null})}}
async function saveJM(p){const {error}=await R('job_master_save',{p});if(error)return toast(cleanErr(error.message),true);toast('Saved');await hydrate();go('quality')}

/* ---------------- Job Calculator (sheet layout -> scrap per sheet) ---------------- */
const JC_SAVED={};
VIEWS.jobcalc=()=>{
 $('#main').innerHTML=`<div class="card"><h2>Job Calculator</h2><div class="mut" style="margin-bottom:8px">Pick the job, enter the sheet size and how many pieces fit on one sheet. The component weights come from the Job Master.</div>
 <div class="fg"><label>Shape<select id="sh"><option value="">— pick —</option>${Object.keys(MOCK.shapes).sort().map(s=>`<option>${s}</option>`).join('')}</select></label><label>Job Name<select id="jb"><option value="">— pick shape first —</option></select></label><label>Job Spec<select id="sp"><option value="">— pick job first —</option></select></label><label>Lid type<input id="ld" readonly></label></div></div>
 <div class="card"><h2>Sheet and layout</h2><div class="fg"><label>Sheet length L (mm)<input id="L" type="number"></label><label>Sheet breadth B (mm)<input id="B" type="number"></label><label>Thickness W (mm)<input id="W" type="number" step="0.01"></label><label>Single sheet weight kg (auto)<input id="sw" readonly></label>
  <label>Body pieces per sheet<input id="nb" type="number"></label><label>Lid pieces per sheet<input id="nl" type="number"></label><label>Bottom pieces per sheet<input id="nt" type="number"></label><label>Strip weight g per sheet (enter)<input id="sg" type="number" step="0.1"></label></div></div>
 <div class="card"><h2>Weights and scrap per sheet (auto)</h2><div class="fg"><label>Body weight g<input id="wb" readonly></label><label>Lid weight g<input id="wl" readonly></label><label>Bottom weight g<input id="wt" readonly></label><label>Components on sheet g<input id="cw" readonly></label>
  <label>Total scrap per sheet g<input id="ts" readonly></label><label>Scrap %<input id="sp2" readonly></label><label>Jalli / other g (scrap − strip)<input id="jl" readonly></label><label>Pieces per sheet<input id="pc" readonly></label></div>
  <div id="warn"></div><div class="row noprint" style="margin-top:14px"><button class="b g" id="sv">${bt('save','Save as default layout for this job')}</button><span class="mut" id="sm"></span></div></div>`;
 const opt=(id,arr,ph)=>{$(id).innerHTML=`<option value="">${ph}</option>`+arr.map(o=>`<option>${esc(o)}</option>`).join('')};
 const n=i=>+$(i).value||0;
 const cur=()=>jmFind($('#sh').value,$('#jb').value,$('#sp').value);
 const calc=()=>{const j=cur();$('#ld').value=j?.lid||'';const sw=n('#L')*n('#B')*n('#W')*0.785/100000;$('#sw').value=sw?sw.toFixed(4):'';
  const b=j&&jmBody(j),l=j&&jmLid(j),t=j&&jmBot(j);$('#wb').value=b??'';$('#wl').value=l??'';$('#wt').value=t??'';
  const cw=(n('#nb')*(b||0))+(n('#nl')*(l||0))+(n('#nt')*(t||0));$('#cw').value=cw?cw.toFixed(2):'';$('#pc').value=n('#nb')+n('#nl')+n('#nt')||'';
  const sg=sw*1000,ts=sg&&cw?sg-cw:0;$('#ts').value=ts?ts.toFixed(2):'';$('#sp2').value=ts?(ts/sg*100).toFixed(1)+' %':'';$('#jl').value=ts&&n('#sg')?(ts-n('#sg')).toFixed(2):'';
  const m=j?jmMissing(j):[];$('#warn').innerHTML=(j&&m.length?`<div class="msg err" style="margin-top:8px">Weight missing in Job Master for: ${m.join(', ')}. Ask Quality to complete it.</div>`:'')+(ts<0?`<div class="msg err" style="margin-top:8px">Components weigh more than the sheet - check the pieces per sheet.</div>`:'')};
 $('#sh').onchange=()=>{opt('#jb',Object.keys(MOCK.shapes[$('#sh').value]||{}),'— pick —');opt('#sp',[],'— pick job first —');calc()};
 $('#jb').onchange=()=>{opt('#sp',(MOCK.shapes[$('#sh').value]||{})[$('#jb').value]||[],'— pick —');calc()};
 $('#sp').onchange=()=>{const j=cur(),k=j?j.id:0,s=JC_SAVED[k];if(s){$('#L').value=s.L;$('#B').value=s.B;$('#W').value=s.W;$('#nb').value=s.nb;$('#nl').value=s.nl;$('#nt').value=s.nt;$('#sg').value=s.sg;$('#sm').textContent='Saved layout loaded'}else $('#sm').textContent='';calc()};
 document.querySelectorAll('#main input').forEach(i=>i.oninput=calc);
 $('#sv').onclick=()=>{const j=cur();if(!j)return toast('Pick the job first',true);const v={L:$('#L').value,B:$('#B').value,W:$('#W').value,nb:$('#nb').value,nl:$('#nl').value,nt:$('#nt').value,sg:$('#sg').value};R('job_calc_save',{p:{job_spec_id:j.id,...v}}).then(({error})=>{if(error)return toast(cleanErr(error.message),true);JC_SAVED[j.id]=v;toast('Layout saved for this job')})}};
/* ---------------- Carton & Alum/Tape (purchase / issue ledger) ---------------- */
let ATAPE=['Bopp Tape - Brown','Bopp Tape - Transparent','Aluminium Foil'];
let CLED=[{id:1,date:'2026-11-03',type:'PURCHASE',item:'Wallet Carton - 3 Ply',variation:'3 PLY - CARTONS',qty:5000,rem:'Supplier invoice 4471'},
 {id:2,date:'2026-11-05',type:'PURCHASE',item:'6x6 Carton - 5 Ply',variation:'5 PLY - CARTONS',qty:2000,rem:''},
 {id:3,date:'2026-11-09',type:'ISSUED',item:'Wallet Carton - 3 Ply',variation:'3 PLY - CARTONS',qty:1200,rem:'Packing'}];
let ALED=[{id:1,date:'2026-11-02',type:'PURCHASE',item:'Bopp Tape - Brown',qty:120,rem:'Rolls'},{id:2,date:'2026-11-08',type:'ISSUED',item:'Bopp Tape - Brown',qty:30,rem:''},{id:3,date:'2026-11-04',type:'PURCHASE',item:'Aluminium Foil',qty:40,rem:'Kg'}];
let CTAB='carton';
// carton issued automatically from the Production screen (carton used) is shown too, read-only
const cartonAuto=()=>PROD.filter(r=>r.cname&&+r.cqty).map(r=>({id:'p'+r.id,date:r.date,type:'ISSUED',item:r.cname,variation:r.cvar,qty:+r.cqty,rem:'Production entry (auto)',auto:true}));
const ledAll=()=>CTAB==='carton'?[...CLED,...cartonAuto()]:ALED;
const ledBal=(item,list)=>list.filter(x=>x.item===item).reduce((a,x)=>a+(x.type==='PURCHASE'?1:-1)*(+x.qty||0),0);
VIEWS.carton=()=>{
 const L=ledAll(),mon=L.filter(x=>x.date.slice(0,7)==='2026-11'),pu=mon.filter(x=>x.type==='PURCHASE').reduce((a,x)=>a+(+x.qty),0),is=mon.filter(x=>x.type==='ISSUED').reduce((a,x)=>a+(+x.qty),0);
 const items=[...new Set(L.map(x=>x.item))],bal=items.reduce((a,i)=>a+ledBal(i,L),0),neg=items.filter(i=>ledBal(i,L)<0).length;
 $('#main').innerHTML=`<div class="kpi"><div><b>${items.length}</b>Items with movement</div><div><b>${pu.toLocaleString()}</b>Purchased (Nov 2026)</div><div><b>${is.toLocaleString()}</b>Issued (Nov 2026)</div><div><b>${bal.toLocaleString()}</b>Balance</div><div><b>${neg}</b>Negative stock</div></div>
 <div class="card"><div class="row noprint" style="margin-bottom:10px"><div class="seg"><button class="${CTAB==='carton'?'on':''}" id="tc">CARTON</button><button class="${CTAB==='alum'?'on':''}" id="ta">ALUM &amp; TAPE</button></div></div>
 <h2>${CTAB==='carton'?'Carton entries':'Alum &amp; Tape entries'}</h2><div class="row noprint"><label>Search<input id="es" placeholder="${CTAB==='carton'?'Carton name, variation':'Item'}"></label>
 <label>Type<select id="et"><option value="">All</option><option>PURCHASE</option><option>ISSUED</option></select></label>
 <label>Month<select id="em"><option value="">All</option><option value="2026-11" selected>NOV 2026</option></select></label>
 <button class="b l" id="eg">${bt('search','Search')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button><button class="b g" id="en">${bt('plus','New entry')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 $('#tc').onclick=()=>{CTAB='carton';VIEWS.carton()};$('#ta').onclick=()=>{CTAB='alum';VIEWS.carton()};
 const load=()=>{const t=$('#es').value.toLowerCase(),ty=$('#et').value,m=$('#em').value;const d=ledAll().filter(x=>(!ty||x.type===ty)&&(!m||x.date.slice(0,7)===m)&&(!t||(x.item+' '+(x.variation||'')).toLowerCase().includes(t))).sort((a,b)=>b.date.localeCompare(a.date));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th>Date</th>${CTAB==='carton'?'<th>Carton variation</th>':''}<th>${CTAB==='carton'?'Carton name':'Item'}</th><th>Type</th><th>Quantity</th><th>Balance now</th><th>Remarks</th><th>Actions</th></tr>
  ${d.map(x=>{const b=ledBal(x.item,ledAll());return `<tr><td>${x.date}</td>${CTAB==='carton'?`<td>${esc(x.variation||'')}</td>`:''}<td>${esc(x.item)}</td><td><span class="tag ${x.type==='PURCHASE'?'ok':'warn'}">${x.type}</span></td><td><b>${(+x.qty).toLocaleString()}</b></td><td>${b<0?`<span class="tag bad">${b.toLocaleString()}</span>`:b.toLocaleString()}</td><td>${esc(x.rem||'')}</td><td>${x.auto?'<span class="tag">auto</span>':ib('edit','Edit',`data-ed="${x.id}"`)}${ib('trash','Delete',`data-del="${x.id}"`,'bad')}</td></tr>`}).join('')}</table></div><div class="mut">${d.length} shown · Balance = Purchased − Issued${CTAB==='carton'?' · Cartons used in Production entries are added to Issued automatically':''}</div>`;
  bindDel(CTAB==='carton'?CLED:ALED,'id','Entry',x=>x.item+' on '+x.date,()=>VIEWS.carton());
  document.querySelectorAll('[data-ed]').forEach(a=>a.onclick=()=>cartonForm((CTAB==='carton'?CLED:ALED).find(x=>x.id==a.dataset.ed)))};
 load();$('#eg').onclick=load;$('#es').oninput=load;$('#et').onchange=load;$('#em').onchange=load;$('#en').onclick=()=>cartonForm(null)};
function cartonForm(e){const isNew=!e,car=CTAB==='carton';$('#ttl').innerHTML=I('open')+' '+(isNew?'New ':'Edit ')+(car?'Carton entry':'Alum & Tape entry');
 const v=k=>esc(e?.[k]??'');
 $('#main').innerHTML=`<div class="row noprint" style="margin-bottom:12px"><button class="b l" id="bk">${bt('x','Back')}</button></div>
 <div class="card"><h2>1. ${car?'Carton':'Item'}</h2><div class="fg">
  ${car?`<label>Carton variation<select id="cv"><option value="">— pick —</option>${Object.keys(CARTON).map(k=>`<option ${e?.variation===k?'selected':''}>${k}</option>`).join('')}</select></label>
  <label>Carton name<select id="cn"><option value="">— pick variation first —</option></select></label>`:
  `<label>Item<select id="it"><option value="">— pick —</option>${ATAPE.map(k=>`<option ${e?.item===k?'selected':''}>${esc(k)}</option>`).join('')}<option value="__new">+ Enter manually…</option></select></label><label id="itl" style="display:none">New item name<input id="itn" placeholder="added to the item list automatically"></label>`}
  <label>Balance now (auto)<input id="bn" readonly></label></div></div>
 <div class="card"><h2>2. Entry</h2><div class="fg"><label>Date<input id="d" type="date" value="${e?e.date:TODAY}"></label><label>Type<select id="ty"><option ${e?.type==='PURCHASE'?'selected':''}>PURCHASE</option><option ${e?.type==='ISSUED'?'selected':''}>ISSUED</option></select></label>
  <label>Quantity<input id="q" type="number" value="${v('qty')}"></label><label>Balance after this entry (auto)<input id="ba" readonly></label><label>Remarks<input id="rm" value="${v('rem')}" placeholder="${car?'Invoice no / issued to':'Unit / invoice no'}"></label></div>
  <div id="warn"></div><div class="row noprint" style="margin-top:14px"><button class="b g" id="sv2">${bt('save',isNew?'Save entry':'Save changes')}</button><button class="b l" id="sa">${bt('plus','Save &amp; add another')}</button><button class="b l" id="cx">${bt('x','Cancel')}</button></div></div>`;
 const item=()=>car?$('#cn').value:($('#it').value==='__new'?$('#itn').value.trim():$('#it').value);
 const calc=()=>{const it=item(),L=(car?[...CLED,...cartonAuto()]:ALED).filter(x=>!e||x.id!==e.id);const b=it?ledBal(it,L):0,q=+$('#q').value||0,a=b+($('#ty').value==='PURCHASE'?q:-q);$('#bn').value=it?b.toLocaleString():'';$('#ba').value=it&&q?a.toLocaleString():'';
  $('#warn').innerHTML=it&&q&&a<0?`<div class="msg err" style="margin-top:8px">This issue is more than the stock (${b.toLocaleString()}). You can still save - it will be flagged as negative stock.</div>`:''};
 if(car){const cv=()=>{$('#cn').innerHTML='<option value="">— pick —</option>'+(CARTON[$('#cv').value]||[]).map(n=>`<option ${e?.item===n?'selected':''}>${esc(n)}</option>`).join('');calc()};$('#cv').onchange=cv;$('#cn').onchange=calc;cv()}
 else{$('#it').onchange=()=>{$('#itl').style.display=$('#it').value==='__new'?'':'none';calc()};$('#itn').oninput=calc}
 ['#q','#ty'].forEach(i=>$(i).oninput=$(i).onchange=calc);calc();
 $('#bk').onclick=$('#cx').onclick=()=>go('carton');
 const save=again=>{const it=item();if(!it)return toast(car?'Pick the carton':'Pick the item',true);if(!+$('#q').value)return toast('Enter the quantity',true);
  const rec={date:$('#d').value,type:$('#ty').value,item:it,qty:+$('#q').value,rem:$('#rm').value};if(car)rec.variation=$('#cv').value;else if(!ATAPE.includes(it))ATAPE.push(it);
  const iid=car?CI_ID[rec.variation+'|'+it]:AI_ID[it];if(!iid)return toast('This item is not in the item list yet. Ask the Administrator to add it.',true);saveLive('ledger_save',{id:e?.id,kind:car?'carton':'alum',item_id:iid,entry_type:rec.type,qty:rec.qty,entry_date:rec.date},'carton',again?()=>cartonForm(null):null)};
 $('#sv2').onclick=()=>save(false);$('#sa').onclick=()=>save(true)}
/* ---------------- Man Power Matrix (editable master; drives Expected MP and efficiency) ---------------- */
VIEWS.masters=()=>{
 const jobsInMaster=[...new Set(JM.map(j=>j.job.toUpperCase()))];
 const rows=()=>[...new Set(Object.keys(MM).concat(Object.keys(MMC)).concat(jobsInMaster))].map(k=>({job:k,t:MM[k]?MM[k][0]:null,mp:MM[k]?MM[k][1]:null})).sort((a,b)=>a.job.localeCompare(b.job));
 $('#main').innerHTML=`<div class="kpi" id="k"></div><div class="card"><h2>Man Power Matrix</h2><div class="mut" style="margin-bottom:8px">Target quantity per 8 hours and the man power needed for each job. Enter the man power for the whole CAN, or for Body, Lid and Bottom separately (the CAN total is then their sum). Left blank, the CAN man power is split over the job's components, and any odd extra goes to Body first, then Lid. Production uses it: <b>Expected MP = MP ÷ Target × Actual production × (8 ÷ Hours)</b> and <b>Efficiency = Expected MP ÷ Man power consumed</b>.</div>
 <div class="row noprint"><label>Search<input id="es" placeholder="Job name"></label><label>Show<select id="ef"><option value="">All</option><option value="set">Matrix set</option><option value="miss">Not set</option></select></label><button class="b g" id="en">${bt('plus','New job')}</button><button class="b l" id="ex">${bt('dl','Export list')}</button></div><div id="el" style="margin-top:10px"></div></div>
 <div class="card"><h2>Efficiency check</h2><div class="fg"><label>Job<select id="cj"><option value="">— pick —</option>${Object.keys(MM).sort().map(j=>`<option>${esc(j)}</option>`).join('')}</select></label><label>Actual production (Nos)<input id="ca" type="number"></label><label>Hours<input id="ch" type="number" step="0.5" value="8"></label><label>Man power consumed<input id="cm" type="number"></label>
  <label>Expected MP (auto)<input id="ce" readonly></label><label>Efficiency (auto)<input id="cf" readonly></label></div></div>`;

 const cm=x=>{const g=mmGet(x.job,'CAN');return g?g[1]:(x.mp||0)};
 const cpart=x=>{const ty=MMC[x.job]||{},has=Object.keys(ty).length>0,jc=jobComps(x.job),auto=x.mp?autoSplit(x.job,x.mp):{};
  const ci=n=>jc.includes(n)?`<td><input class="mi" data-j="${esc(x.job)}" data-f="${n}" type="number" value="${ty[n]??''}" placeholder="${auto[n]!=null?auto[n]+' auto':''}" style="width:90px"></td>`:'<td>-</td>';
  return ci('BODY')+ci('LID')+ci('BOTTOM')+(has?`<td><b>${cm(x)}</b> <span class="mut">sum</span></td>`:`<td><input class="mi" data-j="${esc(x.job)}" data-f="mp" type="number" value="${x.mp??''}" style="width:90px"></td>`)};
 const kp=()=>{const r=rows();$('#k').innerHTML=`<div><b>${r.length}</b>Jobs</div><div><b>${r.filter(x=>x.t).length}</b>Matrix set</div><div><b>${r.filter(x=>!x.t).length}</b>Not set</div>`};
 const load=()=>{const t=$('#es').value.toLowerCase(),f=$('#ef').value;kp();const d=rows().filter(x=>(!t||x.job.toLowerCase().includes(t))&&(!f||(f==='set')===!!x.t));
  $('#el').innerHTML=`<div class="scroll"><table><tr><th>Job Name</th><th>Target quantity / 8 hours (CAN)</th><th>Body MP</th><th>Lid MP</th><th>Bottom MP</th><th>CAN MP (total)</th><th>Output per person / 8 hrs</th><th>Status</th><th>Actions</th></tr>
  ${d.map(x=>`<tr><td>${esc(x.job)}</td><td><input class="mi" data-j="${esc(x.job)}" data-f="t" type="number" value="${x.t??''}" style="width:130px"></td>${cpart(x)}<td>${cm(x)&&x.t?Math.round(x.t/cm(x)).toLocaleString():''}</td><td>${x.t&&cm(x)?'<span class="tag ok">Set</span>':'<span class="tag bad">Not set</span>'}</td><td>${MM[x.job]?ib('x','Remove from matrix',`data-rm="${esc(x.job)}"`,'d'):''}</td></tr>`).join('')}</table></div><div class="mut">${d.length} shown · type in the boxes — changes are kept as you go (use Save all to confirm)</div>
  <div class="row noprint" style="margin-top:10px"><button class="b g" id="sv">${bt('save','Save all')}</button></div>`;
  document.querySelectorAll('.mi').forEach(i=>i.onchange=()=>{const j=i.dataset.j,f=i.dataset.f,v=+i.value||0;MM_DIRTY.add(j);if(['BODY','LID','BOTTOM'].includes(f)){const t=MMC[j]=MMC[j]||{};if(i.value==='')delete t[f];else t[f]=v;if(!Object.keys(t).length)delete MMC[j]}else{const cur=MM[j]||[0,0];MM[j]=f==='t'?[v,cur[1]]:[cur[0],v];if(!MM[j][0]&&!MM[j][1])delete MM[j]}load()});
  document.querySelectorAll('[data-rm]').forEach(a=>a.onclick=()=>{if(confirm('Remove '+a.dataset.rm+' from the matrix?')){MM_DIRTY.add(a.dataset.rm);delete MM[a.dataset.rm];delete MMC[a.dataset.rm];load()}});
  $('#sv').onclick=async()=>{let n=0;for(const j of [...MM_DIRTY]){const id=MXID[j];if(!id){toast('Job '+j+' is not in Job Master yet. Add it in Job Master first.',true);MM_DIRTY.delete(j);continue}const m=MM[j]||[0,0],c=MMC[j]||{};const {error}=await R('matrix_save',{p:{job_id:id,target:m[0]||0,can_mp:m[1]||0,body_mp:c.BODY??null,lid_mp:c.LID??null,bottom_mp:c.BOTTOM??null}});if(error)return toast(cleanErr(error.message),true);MM_DIRTY.delete(j);n++}toast(n?('Saved '+n+' job(s)'):'Nothing to save');await hydrate();VIEWS.masters()}};
 load();$('#es').oninput=load;$('#ef').onchange=load;
 $('#en').onclick=()=>{const j=prompt('Job name');if(!j)return;const t=+prompt('Target quantity per 8 hours')||0,m=+prompt('Man power (MP)')||0;MM[j.trim().toUpperCase()]=[t,m];MM_DIRTY.add(j.trim().toUpperCase());VIEWS.masters()};
 const chk=()=>{const m=mmGet($('#cj').value,'CAN'),a=+$('#ca').value,h=+$('#ch').value,c=+$('#cm').value;const e=m&&a&&h?m[1]/m[0]*a*(8/h):0;$('#ce').value=e?e.toFixed(1):'';$('#cf').value=e&&c?(e/c*100).toFixed(0)+' %':''};
 ['#cj','#ca','#ch','#cm'].forEach(i=>$(i).oninput=$(i).onchange=chk)};

/* ---------------- Manpower report (actual manpower comes from PAYROLL attendance: punches, incl. OT) ---------------- */
const ATT_N={'2026-11-10':{HELPER:128,OPER:18,OPERATOR:6,PROD:3,SUPERVISOR:3,ADMIN:2,STORE:2,QC:1,HK:4,MAINT:1,ENG:4},'2026-11-09':{HELPER:131,OPER:19,OPERATOR:6,PROD:3,SUPERVISOR:3,ADMIN:2,STORE:2,QC:1,HK:4,MAINT:1,ENG:4}};
const PAYROLL_ATT=ATT_N;
const SPAN_CYC=[8.5,8.5,10.5,9.5,8,12,8.5,10,9,10.5,8.5,11];
/* sample punch spans (hours between punch-in and punch-out) for each person - the real ones come from Payroll */
const spansOf=(d,k)=>{const n=(ATT_N[d]||{})[k]||0,off=d.slice(-2)*1+k.length;return Array.from({length:n},(_,i)=>SPAN_CYC[(i+off)%SPAN_CYC.length])};
const DESIG_NAMES={HELPER:'Helper',OPER:'Operator (OPER)',OPERATOR:'Operator',PROD:'Production',SUPERVISOR:'Supervisor',ENG:'Engineer',HK:'Housekeeping',ADMIN:'Admin',STORE:'Store',QC:'QC',MAINT:'Maintenance'};
let DESIG={HELPER:true,OPER:true,OPERATOR:true,PROD:true,SUPERVISOR:false,ENG:false,HK:false,ADMIN:false,STORE:false,QC:false,MAINT:false};
const brk=h=>{const m1=rv('break1_min')/60,m2=rv('break2_min')/60;if(h>=rv('break2_from'))return m2;if(h>=rv('break1_from'))return m1;return Math.max(0,Math.min(h-rv('shift_hours'),m1))};
const workedOf=sp=>{const c=Math.min(sp,rv('max_punch_hours'));return c-brk(c)};
const desStat=(d,k)=>{const x=(ATT_ROW[d]||{})[k];return x?{n:x.people,punch:+x.punch_h,h:+x.worked_h,ot:+x.ot_h}:{n:0,punch:0,h:0,ot:0}};
const attOn=d=>{if(!ATT_N[d])return null;const sh=rv('shift_hours');let n=0,h=0,ot=0;Object.keys(ATT_N[d]).forEach(k=>{if(DESIG[k]){const x=desStat(d,k);n+=x.n;h+=x.h;ot+=x.ot}});return {n,h,ot,eq:h/sh,sh}};
VIEWS.rman=()=>{
 const dates=Object.keys(PAYROLL_ATT).sort().reverse();
 $('#main').innerHTML=`<div class="card"><div class="row noprint"><label>Date<select id="d">${dates.map(x=>`<option>${x}</option>`).join('')}</select></label><button class="b" id="g">${bt('open','Show')}</button><span class="mut" style="margin-left:auto">Actual man power comes from PAYROLL punches (worked hours, OT included) - no separate entry.</span></div></div><div id="b"></div>`;
 const paint=()=>{const d=$('#d').value,at=attOn(d),a=ATT_N[d]||{};
  const rows=PROD.filter(r=>r.date===d&&r.comp==='CAN'),per={};let exp=0;
  rows.forEach(r=>{const m=mmGet(r.job,'CAN');if(!m||!m[1])return;const e=m[1]/m[0]*r.actual;exp+=e;const p=per[r.job]=per[r.job]||{act:0,exp:0,mp:0,mh:0};p.act+=+r.actual;p.exp+=e;p.mp+=+r.mp||0;p.mh+=(+r.mp||0)*(+r.hrs||0)});
  const eff=at&&at.eq?exp/at.eq*100:null;
  $('#b').innerHTML=at?`<div class="kpi"><div><b>${at.n}</b>Production people present</div><div><b>${Math.round(at.h)}</b>Man-hours worked</div><div><b>${Math.round(at.ot)}</b>of which OT hours</div><div><b>${at.eq.toFixed(0)}</b>Equivalent man power (${at.sh} h)</div><div><b>${exp.toFixed(0)}</b>Expected man power</div><div><b>${eff==null?'-':eff.toFixed(0)+' %'}</b>Efficiency</div></div>
  <div class="card"><h2>Expected vs booked by job - ${d}</h2><div class="scroll"><table><tr><th>Job Name</th><th>Actual production</th><th>Expected man power (${at.sh} h)</th><th>Man power booked</th><th>Man-hours booked</th></tr>${Object.keys(per).map(j=>`<tr><td>${esc(j)}</td><td>${per[j].act.toLocaleString()}</td><td>${per[j].exp.toFixed(1)}</td><td>${per[j].mp||''}</td><td>${per[j].mh?per[j].mh.toFixed(0):''}</td></tr>`).join('')||'<tr><td colspan=5>No CAN production for this date</td></tr>'}</table></div></div>
  <div class="card"><h2>Payroll attendance by designation - ${d}</h2><div class="mut" style="margin-bottom:6px">Tick the designations that count as production man power (set the standing list in Rules). Punch hours = punch-out minus punch-in. Worked hours = punch hours less the break (rules below).</div>
  <div class="scroll"><table><tr><th>Counted</th><th>Designation</th><th>People present</th><th>Punch hours</th><th>Worked hours (after break)</th><th>OT hours</th></tr>${Object.keys(a).map(k=>{const x=desStat(d,k);return `<tr><td><input type="checkbox" data-k="${k}" ${DESIG[k]?'checked':''}></td><td>${DESIG_NAMES[k]||k}</td><td>${x.n}</td><td>${x.punch.toFixed(0)}</td><td>${x.h.toFixed(0)}</td><td>${x.ot.toFixed(0)}</td></tr>`}).join('')}</table></div></div>`:`<div class="card"><div class="mut">No Payroll attendance for ${d}.</div></div>`;
  document.querySelectorAll('[data-k]').forEach(c=>c.onchange=()=>{DESIG[c.dataset.k]=c.checked;paint()})};
 $('#g').onclick=paint;$('#d').onchange=paint;paint()};

/* ---------------- Status check (Manager) = Data log + things that need attention ---------------- */

const mx=a=>a.reduce((m,x)=>x>m?x:m,'');
const MODS=[{k:'production',dept:'Production Department',label:'Production',view:'production',monitor:true,allowed:0,last:()=>mx(PROD.map(r=>r.date))},
 {k:'slitting',dept:'Production Department',label:'Slitting',view:'slitting',monitor:true,allowed:0,last:()=>mx(SLITS.map(r=>r.date))},
 {k:'inward',dept:'SCM Department',label:'Inward',view:'inward',monitor:true,allowed:0,last:()=>mx(SKIDS.map(r=>r.date))},
 {k:'outward',dept:'SCM Department',label:'Outward',view:'outward',monitor:true,allowed:0,last:()=>mx(OUT.map(r=>r.date))},
 {k:'scrap',dept:'SCM Department',label:'Scrap',view:'scrap',monitor:true,allowed:0,last:()=>mx(SCRAP.map(r=>r.date))},
 {k:'carton',dept:'SCM Department',label:'Carton',view:'carton',monitor:true,allowed:2,last:()=>mx(CLED.map(r=>r.date))},
 {k:'alum',dept:'SCM Department',label:'Alum & Tape',view:'carton',monitor:true,allowed:2,last:()=>mx(ALED.map(r=>r.date))},
 {k:'payroll',dept:'HR Department',label:'Attendance (from Payroll)',view:null,monitor:true,allowed:0,last:()=>mx(Object.keys(PAYROLL_ATT))}];
const dd=(a,b)=>Math.round((Date.UTC(...a.split('-').map((x,i)=>i==1?x-1:+x))-Date.UTC(...b.split('-').map((x,i)=>i==1?x-1:+x)))/864e5);
const modSt=m=>{const l=m.last();if(!l)return {c:'',t:'NO DATA',d:0};const d=dd(TODAY,l)-m.allowed;return d<rv('data_log_amber_days')?{c:'ok',t:'Updated',d,l}:{c:d<rv('data_log_red_days')?'warn':'bad',t:'Pending',d,l}};
VIEWS.status=()=>{
 const ms=MODS.filter(m=>m.monitor),st=ms.map(modSt),ok=st.filter(s=>s.c==='ok').length,am=st.filter(s=>s.c==='warn').length,rd=st.filter(s=>s.c==='bad').length;
 const stock={};SKIDS.forEach(k=>{const s=skidStatus(k);stock[s]=(stock[s]||0)+1});
 const boxBad=OUT.filter(o=>!owCheck(o).ok).length,negC=[...new Set(CLED.concat(cartonAuto()).map(x=>x.item))].filter(i=>ledBal(i,CLED.concat(cartonAuto()))<0).length+[...new Set(ALED.map(x=>x.item))].filter(i=>ledBal(i,ALED)<0).length;
 const jmBad=JM.filter(j=>!jmComplete(j)||j.draft).length,soPend=MOCK.so.reduce((a,r)=>a+Math.max(0,r.qty-r.sent),0);
 const last=mx(PROD.map(r=>r.date)),pr=PROD.filter(r=>r.date===last&&r.comp==='CAN'),ex=pr.reduce((a,r)=>{const m=mmGet(r.job,'CAN');return a+(m&&m[1]?m[1]/m[0]*r.actual:0)},0),mpc=pr.reduce((a,r)=>a+(+r.mp||0),0);
 const over=OUT.some(o=>(+o.qty||0)>fgMade(o.jid));
 $('#main').innerHTML=`<div class="kpi"><div><b>${ok}</b>Updated</div><div><b>${am}</b>Pending amber</div><div><b>${rd}</b>Pending red</div><div><b>${ms.length}</b>Modules watched</div></div>
 <div class="card"><div class="row noprint"><h2 style="margin:0">Data entry status</h2><span class="mut" style="margin-left:auto">As on ${TODAY} · Updated = entered today or yesterday · amber from ${rv('data_log_amber_days')} days · red from ${rv('data_log_red_days')} days (set in Rules)</span></div>
 ${['Production Department','SCM Department','HR Department'].map(dp=>`<h3>${dp}</h3><div class="scroll"><table><tr><th>Module</th><th>Last entry</th><th>Days since entry</th><th>Allowed delay (days)</th><th>Days due</th><th>Status</th><th>Watch</th><th></th></tr>
 ${MODS.filter(m=>m.dept===dp).map(m=>{const s=modSt(m);return `<tr><td>${m.label}</td><td>${s.l||'—'}</td><td>${s.l?dd(TODAY,s.l):'—'}</td><td><input class="al" data-k="${m.k}" type="number" min="0" value="${m.allowed}" style="width:70px"></td><td><b>${s.l?Math.max(0,s.d):'—'}</b></td><td>${m.monitor?`<span class="tag ${s.c==='ok'?'ok':s.c==='warn'?'warn':'bad'}">${s.t}${s.t==='Pending'?' — '+s.d+' day'+(s.d===1?'':'s'):''}</span>`:'<span class="tag">not watched</span>'}</td><td><input type="checkbox" class="wt" data-k="${m.k}" ${m.monitor?'checked':''}></td><td>${m.view?ib('open','Open',`data-go="${m.view}"`):''}</td></tr>`}).join('')}</table></div>`).join('')}</div>
 <div class="card"><h2>Needs attention</h2><div class="scroll"><table><tr><th>Item</th><th>Count / value</th><th></th></tr>
 <tr><td>Skids in stock / WIP (not fully used)</td><td>${stock.Instock||0} in stock · ${stock.WIP||0} WIP</td><td>${ib('open','Open',`data-go="inward"`)}</td></tr>
 <tr><td>Dispatch box check mismatches</td><td>${boxBad?`<span class="tag bad">${boxBad}</span>`:'<span class="tag ok">0</span>'}</td><td>${ib('open','Open',`data-go="outward"`)}</td></tr>
 <tr><td>Dispatch above available stock</td><td>${over?'<span class="tag warn">yes</span>':'<span class="tag ok">no</span>'}</td><td>${ib('open','Open',`data-go="outward"`)}</td></tr>
 <tr><td>Negative carton / alum &amp; tape stock</td><td>${negC?`<span class="tag bad">${negC}</span>`:'<span class="tag ok">0</span>'}</td><td>${ib('open','Open',`data-go="carton"`)}</td></tr>
 <tr><td>Jobs needing Quality details (missing weights / new)</td><td>${jmBad?`<span class="tag warn">${jmBad}</span>`:'<span class="tag ok">0</span>'}</td><td>${ib('open','Open',`data-go="quality"`)}</td></tr>
 <tr><td>Sale Order quantity still pending</td><td>${soPend.toLocaleString()} Nos</td><td>${ib('open','Open',`data-go="so"`)}</td></tr>
 <tr><td>Man power efficiency on ${last} (CAN)</td><td>${mpc?`<span class="tag ${ex/mpc>=1?'ok':ex/mpc>=.8?'warn':'bad'}">${(ex/mpc*100).toFixed(0)} %</span> (expected ${ex.toFixed(1)} vs ${mpc})`:'—'}</td><td>${ib('open','Open',`data-go="rman"`)}</td></tr></table></div></div>`;
 document.querySelectorAll('[data-go]').forEach(a=>a.onclick=()=>go(a.dataset.go));
 document.querySelectorAll('.al').forEach(i=>i.onchange=()=>{MODS.find(m=>m.k===i.dataset.k).allowed=Math.max(0,+i.value||0);VIEWS.status()});
 document.querySelectorAll('.wt').forEach(i=>i.onchange=()=>{MODS.find(m=>m.k===i.dataset.k).monitor=i.checked;VIEWS.status()})};
/* ---------------- Rules (Admin) ---------------- */
const RULES=[
 {k:'skid_wip_used_threshold',n:'WIP / Used skid limit',d:'A skid with more sheets left than this is WIP; at or below it the skid is Used.',v:50,u:'sheets',t:'num'},
 {k:'edit_window_days',n:'Entry edit window',d:'Entries can be edited by the entry person for this many days. After that only Admin can edit.',v:7,u:'days',t:'num'},
 {k:'non_moving_months',n:'Non-moving skid age',d:'An Instock skid older than this is shown as Non-Moving in Inventory.',v:3,u:'months',t:'num'},
 {k:'negative_stock_mode',n:'Negative stock',d:'What happens when an issue or dispatch is more than the stock. Warn lets the entry save with a flag; Block stops it.',v:'warn',u:'',t:'sel',o:['warn','block']},
 {k:'mp_entry_mode',n:'Man power entry',d:'Suggested: Production shows a split of the Payroll present count that you can change. Manual: no suggestion, man power and hours are typed in.',v:'suggested',u:'',t:'sel',o:['suggested','manual']},
 {k:'shift_hours',n:'Shift hours',d:'Hours in a normal shift. Worked hours above this per person count as OT, and man-hours divided by it give the equivalent man power the matrix is based on.',v:8,u:'hours',t:'num'},
 {k:'break1_from',n:'Break 1 - punch of at least',d:'A punch this long or longer has the first break taken out. Below it, the day is taken as it is (an 8 hour punch stays 8; between 8 and this, only the part above 8 is taken out).',v:8.5,u:'hours',t:'num'},
 {k:'break1_min',n:'Break 1 - minutes taken out',d:'Minutes deducted for a punch that reaches Break 1.',v:30,u:'minutes',t:'num'},
 {k:'break2_from',n:'Break 2 - punch of at least',d:'A punch this long or longer has the second (longer) break taken out instead.',v:12,u:'hours',t:'num'},
 {k:'break2_min',n:'Break 2 - minutes taken out',d:'Minutes deducted for a punch that reaches Break 2.',v:60,u:'minutes',t:'num'},
 {k:'max_punch_hours',n:'Longest punch counted',d:'A punch longer than this is treated as a missed punch and counted only up to this many hours.',v:14,u:'hours',t:'num'},
 {k:'mp_gap_percent',n:'Man power gap allowed',d:'Allocated man-hours may differ from Payroll present man-hours by this much before the day shows amber.',v:10,u:'%',t:'num'},
 {k:'data_log_amber_days',n:'Status check - amber from',d:'A module turns amber when its last entry is this many days old (after its allowed delay).',v:2,u:'days',t:'num'},
 {k:'data_log_red_days',n:'Status check - red from',d:'A module turns red when its last entry is this many days old (after its allowed delay).',v:4,u:'days',t:'num'}];
const RHIST=[];
const rv=k=>RULES.find(r=>r.k===k).v;
VIEWS.rules=()=>{
 $('#main').innerHTML=`<div class="card"><h2>Rules</h2><div class="mut" style="margin-bottom:8px">Settings that every screen reads. Only Admin can change them. Each change is saved with the date it starts from and a reason, so you can see what was set earlier.</div><div class="scroll"><table><tr><th>Rule</th><th>What it does</th><th>Current value</th><th>Actions</th></tr>
 ${RULES.map(r=>`<tr><td style="text-align:left"><b>${r.n}</b></td><td>${r.d}</td><td><b>${r.v}</b> ${r.u}</td><td>${ib('edit','Change',`data-r="${r.k}"`)}</td></tr>`).join('')}</table></div></div>
 <div class="card"><h2>Designations counted as production man power</h2><div class="mut" style="margin-bottom:6px">Payroll has no department, so the designation decides who counts in the Production man power split and the Manpower report.</div><div class="row">${Object.keys(DESIG).map(k=>`<label style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" class="dz" data-k="${k}" ${DESIG[k]?'checked':''}> ${DESIG_NAMES[k]}</label>`).join('')}</div></div>
 <div class="card"><h2>Change history</h2><div class="scroll"><table><tr><th>Changed on</th><th>Rule</th><th>Old</th><th>New</th><th>Effective from</th><th>Reason</th><th>By</th></tr>${RHIST.map(h=>`<tr><td>${h.on}</td><td>${h.n}</td><td>${h.o}</td><td>${h.v}</td><td>${h.f}</td><td>${esc(h.why)}</td><td>${h.by}</td></tr>`).join('')||'<tr><td colspan=7>No changes yet - all rules are at their starting values</td></tr>'}</table></div></div>`;
 document.querySelectorAll('.dz').forEach(c=>c.onchange=()=>{DESIG[c.dataset.k]=c.checked;RHIST.unshift({on:TODAY,n:'Production designations',o:'-',v:(c.checked?'added ':'removed ')+DESIG_NAMES[c.dataset.k],f:TODAY,why:'Changed in Rules',by:'Admin'});VIEWS.rules()});
 document.querySelectorAll('[data-r]').forEach(a=>a.onclick=()=>{const r=RULES.find(x=>x.k===a.dataset.r);
  modal(`<h2>${r.n}</h2><div class="mut" style="margin-bottom:8px">${r.d}</div><div class="fg"><label>New value${r.u?' ('+r.u+')':''}${r.t==='sel'?`<select id="nv">${r.o.map(o=>`<option ${o===r.v?'selected':''}>${o}</option>`).join('')}</select>`:`<input id="nv" type="number" min="0" value="${r.v}">`}</label><label>Effective from<input id="nf" type="date" value="${TODAY}"></label><label style="grid-column:1/-1">Reason<input id="nr" placeholder="Why is it changing"></label></div>
  <div class="row noprint" style="margin-top:12px"><button class="b g" id="ok">${bt('save','Save rule')}</button></div>`);
  $('#ok').onclick=()=>{const raw=$('#nv').value,v=r.t==='sel'?raw:+raw;if(r.t==='num'&&(raw===''||v<0))return toast('Enter a valid number',true);if(!$('#nr').value.trim())return toast('Give a reason',true);
   if(r.k==='data_log_red_days'&&v<=rv('data_log_amber_days')||r.k==='data_log_amber_days'&&v>=rv('data_log_red_days'))return toast('Amber days must be less than red days',true);
   R('rule_set',{p_key:r.k,p_value:v,p_from:$('#nf').value||null,p_reason:$('#nr').value.trim()}).then(async({error})=>{if(error)return toast(cleanErr(error.message),true);document.querySelector('.modal')?.remove();toast('Saved');await hydrate();VIEWS.rules()})}})};
/* ---------------- Reports (layout, sample data) ---------------- */
const dlcsv=(n,rows)=>{const c=rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c],{type:'text/csv'}));a.download=n+'.csv';a.click()};
const uniq=(a,f)=>[...new Set(a.map(f).filter(Boolean))].sort();
const selOpts=(a,all)=>`<option value="">${all}</option>`+a.map(x=>`<option>${esc(x)}</option>`).join('');
const fl=(id,l,opts)=>`<label>${l}<select id="${id}">${opts}</select></label>`;
const tbl=(h,rows,empty)=>`<div class="scroll"><table><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join(''):`<tr><td colspan=${h.length}>${empty||'No records'}</td></tr>`}</table></div>`;
const kp=a=>`<div class="kpi">${a.map(([n,l])=>`<div><b>${n}</b>${l}</div>`).join('')}</div>`;
const tg=(c,t)=>`<span class="tag ${c}">${t}</span>`;
function rep(title,note,filters,paint,csv){
 $('#main').innerHTML=`<div id="kp"></div><div class="card"><h2>${title}</h2><div class="mut" style="margin-bottom:8px">${note}</div><div class="row noprint">${filters}<button class="b l" id="ex">${bt('dl','Export')}</button><button class="b l" id="pr">${bt('print','Print')}</button></div><div id="el" style="margin-top:10px"></div></div>`;
 let last=[];const run=()=>{const o=paint();$('#kp').innerHTML=o.kp?kp(o.kp):'';$('#el').innerHTML=o.html;last=o.csv||[]};
 document.querySelectorAll('#main select,#main input').forEach(i=>i.onchange=i.oninput=run);run();
 $('#ex').onclick=()=>dlcsv(title.replace(/\W+/g,'_'),last);$('#pr').onclick=()=>window.print()}
const mths=a=>uniq(a,x=>x.date.slice(0,7));
const mname=m=>m?new Date(m+'-01').toLocaleString('en',{month:'short',year:'numeric'}).toUpperCase():'';
const monSel=(a)=>fl('m','Month',`<option value="">All months</option>`+mths(a).map(x=>`<option value="${x}">${mname(x)}</option>`).join(''));

/* 1 Skid details */
VIEWS.skids=()=>rep('Skid details','Every skid from Inward with its status. Filter by Job, Spec, Vendor, Variant and month.',
 fl('j','Job Name',selOpts(uniq(SKIDS,x=>x.job),'All jobs'))+fl('s','Job Spec',selOpts(uniq(SKIDS,x=>x.spec),'All specs'))+fl('v','Vendor',selOpts(uniq(SKIDS,x=>x.vendor),'All vendors'))+fl('a','Variant',selOpts(uniq(SKIDS,x=>x.variant),'All variants'))+monSel(SKIDS),
 ()=>{const f=(i,k)=>$(i).value,d=SKIDS.filter(x=>(!f('#j')||x.job===f('#j'))&&(!f('#s')||x.spec===f('#s'))&&(!f('#v')||x.vendor===f('#v'))&&(!f('#a')||x.variant===f('#a'))&&(!f('#m')||x.date.slice(0,7)===f('#m')));
  const st=d.map(skidStatus),c=n=>st.filter(x=>x===n).length;
  const rows=d.map((x,i)=>[x.no,x.date,esc(x.vendor),esc(x.variant),esc(x.job),esc(x.spec),x.comp,x.net,Math.round(skidNos(x)),slitUsed(x.no),Math.max(0,Math.round(skidLeft(x))),tg(st[i]==='Used'?'':st[i]==='WIP'?'warn':'ok',st[i])]);
  const h=['Skid No','Date','Vendor','Variant','Job Name','Job Spec','Components','Net kg','Sheets','Slit','Left','Status'];
  return {kp:[[d.length,'Total skids'],[c('Used'),'Used'],[c('Instock'),'Instock'],[c('WIP'),'WIP']],html:tbl(h,rows),csv:[h].concat(rows.map(r=>r.map(x=>String(x).replace(/<[^>]*>/g,''))))}});

/* 2 Slitting report */
VIEWS.rslit=()=>rep('Slitting report','Slitting by skid with the count of Body / Lid / Bottom and the weight check.',
 monSel(SLITS)+fl('j','Job Name',selOpts(uniq(SLITS,r=>SKIDS.find(k=>k.no===r.skid)?.job),'All jobs')),
 ()=>{const d=SLITS.map(r=>({r,k:SKIDS.find(x=>x.no===r.skid)})).filter(({r,k})=>(!$('#m').value||r.date.slice(0,7)===$('#m').value)&&(!$('#j').value||k.job===$('#j').value));
  const rows=d.map(({r,k})=>{const c=slitCalc(r,k);return [r.date,r.skid,esc(k.vendor),esc(k.job),esc(k.spec),r.count,r.body*r.count||'',r.lid*r.count||'',r.bottom*r.count||'',c.exp.toLocaleString(),c.bif.toFixed(1),c.variance.toFixed(1)]});
  const h=['Date','Skid No','Vendor','Job Name','Job Spec','Sheets slit','Body','Lid','Bottom','Expected production','Bifurcated kg','Variance kg'];
  return {kp:[[d.length,'Entries'],[d.reduce((a,{r})=>a+r.count,0).toLocaleString(),'Sheets slit'],[d.reduce((a,{r,k})=>a+slitCalc(r,k).exp,0).toLocaleString(),'Expected production']],html:tbl(h,rows),csv:[h].concat(rows)}});

/* 3 Production report */
VIEWS.rprod=()=>rep('Production report','Production entries with man power efficiency, FG, SFG and scrap. The summary groups by job.',
 monSel(PROD)+fl('c','Component',selOpts(['CAN','BODY','LID','BOTTOM','TAGGER'],'All'))+fl('j','Job Name',selOpts(uniq(PROD,r=>r.job),'All jobs')),
 ()=>{const d=PROD.filter(r=>(!$('#m').value||r.date.slice(0,7)===$('#m').value)&&(!$('#c').value||r.comp===$('#c').value)&&(!$('#j').value||r.job===$('#j').value));
  const rows=d.map(r=>{const e=expMP(r),ef=r.mp&&e?e/r.mp:0;return [r.date,esc(r.job),esc(r.spec),r.comp,(+r.actual).toLocaleString(),r.mp,r.hrs,e||'',e?tg(ef>=1?'ok':ef>=.8?'warn':'bad',(ef*100).toFixed(0)+'%'):'',r.fg||'',r.sfg||'',r.scrap||'']});
  const h=['Date','Job Name','Job Spec','Component','Actual','Man power','Hours','Expected MP','Efficiency','FG','SFG','Scrap'];
  const by={};d.forEach(r=>{const b=by[r.job]=by[r.job]||{a:0,s:0,mp:0,e:0};b.a+=+r.actual;b.s+=+r.scrap||0;b.mp+=+r.mp||0;b.e+=expMP(r)});
  const sum=tbl(['Job Name','Actual','Scrap','Man power','Expected MP','Efficiency'],Object.keys(by).map(j=>[esc(j),by[j].a.toLocaleString(),by[j].s,by[j].mp,by[j].e||'',by[j].e&&by[j].mp?(by[j].e/by[j].mp*100).toFixed(0)+'%':'']));
  return {kp:[[d.length,'Entries'],[d.reduce((a,r)=>a+(+r.actual),0).toLocaleString(),'Actual production'],[d.reduce((a,r)=>a+(+r.scrap||0),0),'Scrap Nos']],html:tbl(h,rows)+'<h3 style="margin-top:14px">Summary by job</h3>'+sum,csv:[h].concat(rows.map(r=>r.map(x=>String(x).replace(/<[^>]*>/g,''))))}});

/* 4 Scrap report */
VIEWS.rscrap=()=>rep('Scrap report','Scrap kg and component counts by job. Counts use the Job Master weights.',
 monSel(SCRAP)+fl('j','Job Name',selOpts(uniq(SCRAP,r=>r.job),'All jobs')),
 ()=>{const d=SCRAP.filter(r=>(!$('#m').value||r.date.slice(0,7)===$('#m').value)&&(!$('#j').value||r.job===$('#j').value)),by={};
  d.forEach(r=>{const c=scrapCnt(r),b=by[r.job]=by[r.job]||{n:0,kg:0,b:0,l:0,t:0};b.n++;b.kg+=scrapKg(r);b.b+=c.body;b.l+=c.lid;b.t+=c.bottom});
  const rows=Object.keys(by).map(j=>[esc(j),by[j].n,by[j].kg.toFixed(2),by[j].b.toLocaleString(),by[j].l.toLocaleString(),by[j].t.toLocaleString()]),h=['Job Name','Entries','Scrap kg','Body Nos','Lid Nos','Bottom Nos'];
  return {kp:[[d.length,'Entries'],[d.reduce((a,r)=>a+scrapKg(r),0).toFixed(1),'Scrap kg'],[Object.keys(by).length,'Jobs']],html:tbl(h,rows),csv:[h].concat(rows)}});

/* 5 Inventory */
VIEWS.inventory=()=>rep('Inventory','Instock and WIP skids together: sheets still to be produced and the Body / Lid / Bottom they can still give. An Instock skid older than the non-moving age is flagged.',
 fl('j','Job Name',selOpts(uniq(SKIDS,x=>x.job),'All jobs'))+fl('s','Job Spec',selOpts(uniq(SKIDS,x=>x.spec),'All specs')),
 ()=>{const d=SKIDS.filter(x=>skidStatus(x)!=='Used'&&(!$('#j').value||x.job===$('#j').value)&&(!$('#s').value||x.spec===$('#s').value));
  const lay=k=>{const r=SLITS.filter(t=>SKIDS.find(x=>x.no===t.skid)?.job===k.job).sort((a,b)=>b.date.localeCompare(a.date))[0];return r||null};
  const old=x=>skidStatus(x)==='Instock'&&dd(TODAY,x.date)>rv('non_moving_months')*30;
  const rows=d.map(x=>{const L=Math.max(0,Math.round(skidLeft(x))),l=lay(x),c=(x.comp||'').toUpperCase();return [x.no,x.date,esc(x.vendor),esc(x.job),esc(x.spec),x.comp,skidStatus(x)==='WIP'?tg('warn','WIP'):tg('ok','Instock'),L.toLocaleString(),l&&c.includes('BODY')?(L*l.body).toLocaleString():'',l&&c.includes('LID')?(L*l.lid).toLocaleString():'',l&&c.includes('BOTTOM')?(L*l.bottom).toLocaleString():'',old(x)?tg('bad','Non-moving'):'']}),h=['Skid No','Date','Vendor','Job Name','Job Spec','Components','Status','Sheets left','Body possible','Lid possible','Bottom possible','Flag'];
  return {kp:[[d.length,'Skids in inventory'],[d.reduce((a,x)=>a+Math.max(0,Math.round(skidLeft(x))),0).toLocaleString(),'Sheets left'],[d.reduce((a,x)=>a+x.net,0).toLocaleString(),'Net kg'],[d.filter(old).length,'Non-moving']],html:tbl(h,rows)+'<div class="mut" style="margin-top:6px">Possible counts use the latest slitting layout of the same job. A job never slit before shows blank.</div>',csv:[h].concat(rows.map(r=>r.map(x=>String(x).replace(/<[^>]*>/g,''))))}});

/* stock ledger per job (CAN only): FG+SFG made - dispatched */
const canMade=(id,to)=>PROD.filter(r=>r.comp==='CAN'&&jobId(r.colour,r.variant,r.shape,r.vendor,r.job,r.spec)===id&&(!to||r.date<to)).reduce((a,r)=>a+(+r.fg||0)+(+r.sfg||0),0);
const disp=(id,to,on)=>OUT.filter(o=>o.jid===id&&(on?o.date===on:(!to||o.date<to))).reduce((a,o)=>a+(+o.qty||0),0);
/* 6 Daily production report */
/* ------------- stock ledger used by the Daily report and Production vs Dispatch (rules of the old PMS Elite file) -------------
   CAN stock      : Opening + Production (actual, scrap shown separately) - Dispatch (Outward)
   Component stock: Production of that component - what the matching CAN (same Job Name + Spec, same exact date) used:
                    BOTTOM -> CAN actual production + scrap ; LID and TAGGER -> CAN dispatch.  (Body is not tracked here)  */
const STOCK_BASE='2026-06-30';
const OPEN_ST=[/* CAN opening as of 1 Jul 2026 (from the old PMS Elite file: 'JULY 1st Opening') */
  {job:'BUSH 65MM',spec:'65X65X55',comp:'CAN',qty:43590,shape:'SQUARE'},
  {job:'WALLET 27MM AUTO',spec:'115x95x27',comp:'CAN',qty:16513,shape:'RECTANGLE'},
  {job:'WALLET 27MM MANUAL',spec:'115x95x50',comp:'CAN',qty:3868,shape:'RECTANGLE'},
  {job:'ZTALC 35GM CAN',spec:'OVAL 35 G',comp:'CAN',qty:18720,shape:'OVAL'},
  {job:'6x6 SQUARE',spec:'152x152x50',comp:'CAN',qty:971,shape:'SQUARE'},
  {job:'10.5x8 NECKED LID',spec:'10.5x8x50',comp:'CAN',qty:9282,shape:'RECTANGLE'},
  {job:'AJ 162MM',spec:'124x70x162',comp:'CAN',qty:35280,shape:'RECTANGLE'},
  {job:'101 DIA SLIP LID',spec:'101x25',comp:'CAN',qty:7500,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x50',comp:'CAN',qty:18520,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x75',comp:'CAN',qty:504,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x100',comp:'CAN',qty:75,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x120',comp:'CAN',qty:75,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x150',comp:'CAN',qty:522,shape:'ROUND'},
  {job:'101 DIA HUNDIAL',spec:'101x150',comp:'CAN',qty:850,shape:'ROUND'},
  {job:'MYSURPA 27MM',spec:'80x40x27',comp:'CAN',qty:4897,shape:'RECTANGLE'},
  {job:'66 DIA',spec:'66x100',comp:'CAN',qty:7320,shape:'ROUND'},
  {job:'509 ROUND',spec:'141X90',comp:'CAN',qty:1008,shape:'ROUND'},
  {job:'MINT FLIP',spec:'40X20X50',comp:'CAN',qty:50418,shape:'RECTANGLE'},
  {job:'101 DIA SLIP LID',spec:'101x60',comp:'CAN',qty:5220,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x85',comp:'CAN',qty:2438,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x105',comp:'CAN',qty:293,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x115',comp:'CAN',qty:11961,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x155',comp:'CAN',qty:722,shape:'ROUND'},
/* Components opening as of 1 Jul 2026 ('1st JULY Opening' Components) */
  {job:'10.5x8 NECKED LID',spec:'10.5x8x50',comp:'BOTTOM',qty:202,shape:'RECTANGLE'},
  {job:'10.5x8 NECKED LID',spec:'10.5x8x50',comp:'LID',qty:94,shape:'RECTANGLE'},
  {job:'101 DIA SLIP LID',spec:'101x25',comp:'BOTTOM',qty:740,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x25',comp:'LID',qty:188,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x50',comp:'BOTTOM',qty:20947,shape:'ROUND'},
  {job:'101 DIA SLIP LID',spec:'101x50',comp:'LID',qty:15527,shape:'ROUND'},
  {job:'AJ 162MM',spec:'124x70x162',comp:'BOTTOM',qty:6991,shape:'RECTANGLE'},
  {job:'AJ 162MM',spec:'124x70x162',comp:'LID',qty:12328,shape:'RECTANGLE'},
  {job:'BUSH 65MM',spec:'65X65X55',comp:'LID',qty:36385,shape:'SQUARE'},
  {job:'BUSH 65MM',spec:'65X65X55',comp:'TAGGER',qty:37910,shape:'SQUARE'},
  {job:'MYSURPA 27MM',spec:'80x40x27',comp:'BOTTOM',qty:2280,shape:'RECTANGLE'},
  {job:'MYSURPA 27MM',spec:'80x40x27',comp:'LID',qty:2191,shape:'RECTANGLE'},
  {job:'NUTCASE 38MM',spec:'124x70x38',comp:'BOTTOM',qty:11203,shape:'RECTANGLE'},
  {job:'NUTCASE 38MM',spec:'124x70x38',comp:'LID',qty:334,shape:'RECTANGLE'},
  {job:'WALLET 27MM AUTO',spec:'115x95x27',comp:'BOTTOM',qty:12750,shape:'RECTANGLE'},
  {job:'WALLET 27MM AUTO',spec:'115x95x27',comp:'LID',qty:9293,shape:'RECTANGLE'},
  {job:'WALLET 27MM MANUAL',spec:'115x95x50',comp:'BOTTOM',qty:3453,shape:'RECTANGLE'},
  {job:'WALLET 27MM MANUAL',spec:'115x95x50',comp:'LID',qty:2710,shape:'RECTANGLE'}];
const jsk=(j,sp)=>String(j).trim().toUpperCase()+'|'+String(sp).trim().toLowerCase();
const rid=r=>r.nopp?'-':jobId(r.colour,r.variant,r.shape,r.vendor,r.job,r.spec);
const baseQ=(j,sp,c)=>OPEN_ST.filter(x=>jsk(x.job,x.spec)===jsk(j,sp)&&x.comp===c).reduce((a,x)=>a+x.qty,0);
const canProd=(j,sp,from,to)=>PROD.filter(r=>r.comp==='CAN'&&jsk(r.job,r.spec)===jsk(j,sp)&&r.date>from&&r.date<=to);
const dispQ=(j,sp,from,to)=>OUT.filter(o=>jsk(o.job,o.spec)===jsk(j,sp)&&o.date>from&&o.date<=to).reduce((a,o)=>a+(+o.qty||0),0);
const sumA=(a,f)=>a.reduce((x,r)=>x+(+f(r)||0),0);
const dayBefore=d=>new Date(Date.parse(d)-864e5).toISOString().slice(0,10);
// CAN balance AFTER the given date
const canClose=(j,sp,d)=>baseQ(j,sp,'CAN')+sumA(canProd(j,sp,STOCK_BASE,d),r=>r.actual)-dispQ(j,sp,STOCK_BASE,d);
// component balance AFTER the given date
const compUse=(c,j,sp,from,to)=>c==='BOTTOM'?sumA(canProd(j,sp,from,to),r=>(+r.actual)+(+r.scrap||0)):dispQ(j,sp,from,to);
const compMade=(c,j,sp,from,to)=>sumA(PROD.filter(r=>r.comp===c&&jsk(r.job,r.spec)===jsk(j,sp)&&r.date>from&&r.date<=to),r=>r.actual);
const compClose=(c,j,sp,d)=>baseQ(j,sp,c)+compMade(c,j,sp,STOCK_BASE,d)-compUse(c,j,sp,STOCK_BASE,d);
const asOn=d=>{const x=new Date(d+'T00:00:00Z'),n=x.getUTCDate(),o=n%10===1&&n!==11?'st':n%10===2&&n!==12?'nd':n%10===3&&n!==13?'rd':'th';return 'DAILY PRODUCTION REPORT AS ON '+n+o+' '+x.toLocaleString('en',{month:'short',timeZone:'UTC'}).toUpperCase()+' '+x.getUTCFullYear()};
let DPM='CAN';
const jobsOf=()=>{const m=new Map();PROD.forEach(r=>{const k=jsk(r.job,r.spec);if(!m.has(k))m.set(k,r)});OPEN_ST.forEach(x=>{const k=jsk(x.job,x.spec);if(!m.has(k))m.set(k,{job:x.job,spec:x.spec,shape:x.shape,colour:'',variant:'',vendor:'',nopp:true})});return [...m.values()]};
VIEWS.daily=()=>{
 const dates=[...new Set(PROD.map(r=>r.date))].sort().reverse();
 rep('Daily production report',DPM==='CAN'?'Job-wise Opening / Production / FG / SFG / Scrap / Dispatch / Closing for one day. Dispatch comes from Outward. Stock rolls forward from 30 Jun 2026.':'Lid, Bottom and Tagger stock for one day. Bottom is used up by the CAN production plus scrap of the same day; Lid and Tagger by the CAN dispatch of the same day. Body is not tracked here.',
 `<div class="seg"><button class="${DPM==='CAN'?'on':''}" id="mc">CAN</button><button class="${DPM==='CAN'?'':'on'}" id="mo">Components</button></div>`+
 fl('d','Date',dates.map(d=>`<option>${d}</option>`).join(''))+monSel(PROD)+fl('j','Job Name',selOpts(uniq(PROD,r=>r.job),'All jobs'))+(DPM==='CAN'?'':fl('c','Component','<option value="">All (Lid / Bottom / Tagger)</option><option>LID</option><option>BOTTOM</option><option>TAGGER</option>')),
 ()=>{const dt=$('#d').value,jf=$('#j').value,mf=$('#m').value;if(mf&&dt.slice(0,7)!==mf){const f=dates.find(x=>x.slice(0,7)===mf);if(f&&f!==dt){$('#d').value=f}}
  const D=$('#d').value,pv=dayBefore(D),hd=`<div style="font-weight:700;color:#ffd777;margin-bottom:6px">${asOn(D)}</div>`;
  if(DPM==='CAN'){
   const ks=jobsOf().filter(r=>(!jf||r.job===jf)&&(canProd(r.job,r.spec,pv,D).length||dispQ(r.job,r.spec,pv,D)));
   const rows=[],cs=ks.map(b=>{const rs=canProd(b.job,b.spec,pv,D),op=canClose(b.job,b.spec,pv),pr=sumA(rs,r=>r.actual),fg=sumA(rs,r=>r.fg),sf=sumA(rs,r=>r.sfg),sc=sumA(rs,r=>r.scrap),dp=dispQ(b.job,b.spec,pv,D),cl=op+pr-dp;
     rows.push([rid(b),esc(b.job),esc(b.spec),op.toLocaleString(),pr.toLocaleString(),fg.toLocaleString(),sf.toLocaleString(),sc.toLocaleString(),dp.toLocaleString(),`<b>${cl.toLocaleString()}</b>`,cl<0?tg('bad','Negative stock'):op+pr<dp?tg('bad','Error'):tg('ok','OK')]);return {op,pr,dp,cl,b}});
   const h=['Job ID','Job Name','Job Spec','Opening stock','Production','FG','SFG','Scrap','Dispatch','Closing stock','Check'];
   // non-moving: stock still there and no CAN production for the non-moving age
   const nm=jobsOf().filter(r=>!jf||r.job===jf).map(r=>{const cl=canClose(r.job,r.spec,D);const last=PROD.filter(x=>x.comp==='CAN'&&jsk(x.job,x.spec)===jsk(r.job,r.spec)&&+x.actual>0&&x.date<=D).map(x=>x.date).sort().pop();
     const days=last?Math.round((Date.parse(D)-Date.parse(last))/864e5):null;return {r,cl,last,days}}).filter(x=>x.cl>0&&(x.days==null||x.days>rv('non_moving_months')*30));
   const h2=['Job ID','Job Name','Job Spec','Stock','Last CAN production','Reason'],r2=nm.map(x=>[rid(x.r),esc(x.r.job),esc(x.r.spec),x.cl.toLocaleString(),x.last||'-',x.last?'No CAN production for '+x.days+' days':'No CAN production since opening stock']);
   return {kp:[[ks.length,'Jobs with activity'],[cs.reduce((a,c)=>a+c.pr,0).toLocaleString(),'Production'],[cs.reduce((a,c)=>a+c.dp,0).toLocaleString(),'Dispatch'],[nm.length,'Non-moving jobs']],
    html:hd+tbl(h,rows,'No CAN production or dispatch on this date')+'<div class="mut" style="margin:6px 0 12px">Closing = Opening + Production (FG + SFG) − Dispatch. Scrap is shown for information and is never part of stock.</div>'+(nm.length?`<div class="sect">Non-moving stock</div>`+tbl(h2,r2):''),csv:[h].concat(rows.map(r=>r.map(x=>String(x).replace(/<[^>]*>/g,''))))}}
  const cf=$('#c').value,cl=cf?[cf]:['LID','BOTTOM','TAGGER'],rows=[];let neg=0;
  jobsOf().filter(r=>!jf||r.job===jf).forEach(b=>cl.forEach(c=>{if(!baseQ(b.job,b.spec,c)&&!PROD.some(r=>r.comp===c&&jsk(r.job,r.spec)===jsk(b.job,b.spec)))return;const made=compMade(c,b.job,b.spec,pv,D),use=compUse(c,b.job,b.spec,pv,D);if(!made&&!use)return;
   const op=compClose(c,b.job,b.spec,pv),cc=op+made-use;if(cc<0)neg++;rows.push([esc(b.job),esc(b.spec),c,op.toLocaleString(),made.toLocaleString(),use.toLocaleString(),`<b>${cc.toLocaleString()}</b>`,cc<0?tg('bad','Closing below zero - a Production figure on or before this date is wrong'):tg('ok','OK')])}));
  const h=['Job Name','Job Spec','Component','Opening stock','Production','Consumption','Closing stock','Check'];
  return {kp:[[rows.length,'Component rows'],[rows.reduce((a,r)=>a+(+String(r[4]).replace(/,/g,'')),0).toLocaleString(),'Produced'],[rows.reduce((a,r)=>a+(+String(r[5]).replace(/,/g,'')),0).toLocaleString(),'Consumed'],[neg,'Below zero']],
   html:hd+tbl(h,rows,'No component production or consumption on this date')+'<div class="mut" style="margin-top:6px">Consumption: BOTTOM = CAN production + scrap that day; LID and TAGGER = CAN dispatch that day (same Job Name + Spec).</div>',csv:[h].concat(rows.map(r=>r.map(x=>String(x).replace(/<[^>]*>/g,''))))}});
 $('#mc').onclick=()=>{DPM='CAN';VIEWS.daily()};$('#mo').onclick=()=>{DPM='COMP';VIEWS.daily()}};
/* 7 Production vs Dispatch (the matching report) */
VIEWS.recon=()=>rep('Production vs Dispatch','Production (CAN actual; scrap is shown elsewhere and never dispatched) against Dispatch, job-wise and month-wise, with Opening and Closing stock from the same ledger as the Daily report.',
 monSel(PROD.concat(OUT))+fl('j','Job Name',selOpts(uniq(PROD,r=>r.job),'All jobs')),
 ()=>{const m=$('#m').value,jf=$('#j').value,from=m?dayBefore(m+'-01'):STOCK_BASE,to=m?m+'-31':'2099-12-31';
  const ks=jobsOf().filter(r=>(!jf||r.job===jf));
  const rows=ks.map(b=>{const op=m?canClose(b.job,b.spec,from):baseQ(b.job,b.spec,'CAN'),pr=sumA(canProd(b.job,b.spec,from,to),r=>r.actual),dp=dispQ(b.job,b.spec,from,to),cl=op+pr-dp;
    return {b,op,pr,dp,cl,st:op+pr<dp?'E':dp===op+pr?'D':'S'}}).filter(x=>x.pr||x.dp);
  const h=['Job ID','Job Name','Job Spec','Opening','Production','Dispatch','Closing','Status'],
   out=rows.map(x=>[rid(x.b),esc(x.b.job),esc(x.b.spec),x.op.toLocaleString(),x.pr.toLocaleString(),x.dp.toLocaleString(),`<b>${x.cl.toLocaleString()}</b>`,x.st==='E'?tg('bad','⚠ Error - dispatch above stock'):x.st==='D'?tg('ok','✓ Dispatched'):tg('warn','📦 In stock')]);
  // Sale Order balance: what was ordered against what has been produced and dispatched for that order
  return {kp:[[rows.length,'Jobs'],[rows.filter(x=>x.st==='D').length,'Dispatched'],[rows.filter(x=>x.st==='S').length,'In stock'],[rows.filter(x=>x.st==='E').length,'Errors']],
   html:tbl(h,out,'No production or dispatch')+'<div class="mut" style="margin-top:6px"><b>✓ Dispatched</b>: Opening + Production equals Dispatch. <b>📦 In stock</b>: more was produced than dispatched, the balance is in stock. <b>⚠ Error</b>: Dispatch is above Opening + Production, so something was mis-entered.</div>',
   csv:[h].concat(out.map(r=>r.map(x=>String(x).replace(/<[^>]*>/g,''))))}});
/* 8 Box Register */
VIEWS.boxreg=()=>rep('Box Register','One row per dispatch line. Boxes × Qty per box is checked against the dispatch quantity. Mismatches come first. A matching row opens to its box-by-box list.',
 monSel(OUT)+fl('v','Vendor',selOpts(uniq(OUT,o=>o.vendor),'All vendors')),
 ()=>{const d=OUT.filter(o=>(!$('#m').value||o.date.slice(0,7)===$('#m').value)&&(!$('#v').value||o.vendor===$('#v').value)).sort((a,b)=>owCheck(a).ok-owCheck(b).ok||b.date.localeCompare(a.date));
  const rows=d.map(o=>{const c=owCheck(o);return [o.date,o.dc,o.invoice,esc(o.vendor),esc(o.job),esc(o.spec),o.boxes,o.perbox,c.packed.toLocaleString(),(+o.qty).toLocaleString(),c.ok?tg('ok','Matches'):tg('bad','Short/Excess '+(c.diff>0?'+':'')+c.diff),c.ok?`<details><summary>${o.boxes} boxes</summary>${Array.from({length:Math.min(o.boxes,60)},(_,i)=>`Box ${i+1}: ${o.perbox}`).join(' · ')}${o.boxes>60?' …':''}</details>`:'']}),h=['Date','DC No','Invoice','Vendor','Job Name','Job Spec','Boxes','Qty / box','Boxes × Qty','Dispatch qty','Check','Box list'];
  return {kp:[[d.length,'Dispatch lines'],[d.filter(o=>!owCheck(o).ok).length,'Mismatches'],[d.reduce((a,o)=>a+(+o.boxes||0),0).toLocaleString(),'Boxes']],html:tbl(h,rows),csv:[h].concat(rows.map(r=>r.slice(0,11).map(x=>String(x).replace(/<[^>]*>/g,''))))}});
/* 9 / 10 stock */
const stockRep=(title,led,key)=>()=>rep(title,'Purchased, issued and balance for each item. A negative balance is flagged.',
 monSel(led())+fl('v','Group',selOpts(uniq(led(),x=>x.variation||''),'All')),
 ()=>{const m=$('#m').value,g=$('#v').value,L=led().filter(x=>!g||x.variation===g),items=uniq(L,x=>x.item);
  const rows=items.map(i=>{const a=L.filter(x=>x.item===i&&(!m||x.date.slice(0,7)<=m)),p=a.filter(x=>x.type==='PURCHASE'&&(!m||x.date.slice(0,7)===m)).reduce((s,x)=>s+(+x.qty),0),is=a.filter(x=>x.type!=='PURCHASE'&&(!m||x.date.slice(0,7)===m)).reduce((s,x)=>s+(+x.qty),0),cl=a.reduce((s,x)=>s+(x.type==='PURCHASE'?1:-1)*(+x.qty),0),op=cl-p+is,ls=L.filter(x=>x.item===i).map(x=>x.date).sort().pop();
   return [esc(i),op.toLocaleString(),p.toLocaleString(),is.toLocaleString(),cl.toLocaleString(),ls,cl<0?tg('bad','Negative'):cl===0?tg('warn','Nil'):tg('ok','In stock')]}),h=['Item','Opening','Purchased','Issued','Balance','Last movement','Status'];
  return {kp:[[items.length,'Items'],[rows.filter(r=>/Negative/.test(r[6])).length,'Negative'],[rows.filter(r=>/Nil/.test(r[6])).length,'Nil']],html:tbl(h,rows),csv:[h].concat(rows.map(r=>r.map(x=>String(x).replace(/<[^>]*>/g,''))))}});
VIEWS.cstock=stockRep('Carton stock',()=>CLED.concat(cartonAuto()));
VIEWS.astock=stockRep('Alum & Tape stock',()=>ALED);
(()=>{const st=document.createElement('style');st.textContent=`body{background:linear-gradient(180deg,#8ec5f5 0%,#4f8fd6 28%,#1e4a94 62%,#050f2b 100%)!important;background-attachment:fixed!important}
main .card{background:linear-gradient(180deg,#5b94d8 0%,#2a5fb0 38%,#0a2150 100%)!important;border-color:#d9b341!important}
main .card h2,main .card h3,main .card>label,main .card .row>label,main .card .fg>label{color:#f3d36b!important}
main .card .mut{color:#ffe9a8!important}
main .card table td{background:linear-gradient(180deg,rgba(142,197,245,.35),rgba(10,33,80,.55))!important;color:#f3d36b!important;border-color:rgba(217,179,65,.35)!important}
main .card table td b{color:#ffdf7a!important}
main .card table tr:nth-child(even) td{background:linear-gradient(180deg,rgba(100,160,225,.30),rgba(8,28,70,.60))!important}
main .card table th{background:linear-gradient(180deg,#0f2c63,#07163a)!important;color:#f3d36b!important}
main .card table td input:not([type=checkbox]),main .card table td select{color:#0a2150}`;document.head.appendChild(st)})();

/* man power: Payroll man-hours (OT included) split across the day's jobs (suggestion) */
const presentOn=d=>{const x=attOn(d);return x?x.n:null};
const expMH=r=>{const m=mmGet(r.job,r.comp);return m&&m[1]&&r.actual?m[1]/m[0]*r.actual*8:0};
const suggestFor=(d,me,exclude)=>{const at=attOn(d),mine=expMH(me);if(!at||!mine)return null;const eo=PROD.filter(r=>r.date===d&&r!==exclude).reduce((a,r)=>a+expMH(r),0),mh=at.h*mine/(eo+mine),mp=Math.max(1,Math.min(at.n,Math.round(mh/at.sh)));return {mp,hr:Math.round(mh/mp*10)/10,mh}};
let mpTouched=false,hrTouched=false;
function mpAssist(j,e){
 const d=$('#d').value,at=attOn(d),mode=rv('mp_entry_mode'),auto=mode==='suggested'&&at;
 const me={job:j?.job||'',comp:$('#cm').value,actual:+$('#ap').value},others=PROD.filter(r=>r.date===d&&(!e||r.id!==e.id));
 const sg=auto?suggestFor(d,me,e):null,sugMP=sg?sg.mp:0,sugHr=sg?sg.hr:0;
 if(auto&&sg){if(!mpTouched)$('#mp').value=sugMP;if(!hrTouched)$('#hr').value=sugHr}
 const hrs=+$('#hr').value||0,alloc=others.reduce((a,r)=>a+(+r.mp||0)*(+r.hrs||0),0)+(+$('#mp').value||0)*hrs,pmh=at?at.h:0,gap=pmh?Math.abs(pmh-alloc)/pmh*100:0;
 const box=$('#mpbox');if(!box)return;
 box.innerHTML=!at?`<div class="mut">Payroll attendance is not available for ${d||'this date'} yet. Enter man power and hours by hand.</div>`:
 `<div class="scroll"><table><tr><th>Production people present</th><th>Man-hours worked</th><th>of which OT</th><th>Equivalent man power</th>${mode==='suggested'?'<th>Suggested man power</th><th>Calculated hours</th>':''}<th>Man-hours booked</th><th>Unbooked</th><th>Check</th></tr>
 <tr><td><b>${at.n}</b></td><td>${Math.round(pmh)}</td><td>${Math.round(at.ot)}</td><td>${at.eq.toFixed(0)}</td>${mode==='suggested'?`<td><b>${sugMP||'-'}</b></td><td><b>${sugHr||'-'}</b> ${sugMP?`<button class="b l" id="usg" style="padding:2px 10px">Use</button>`:''}</td>`:''}<td>${alloc.toFixed(0)}</td><td>${(pmh-alloc).toFixed(0)}</td><td>${alloc?`<span class="tag ${gap<=rv('mp_gap_percent')?'ok':'warn'}">${gap<=rv('mp_gap_percent')?'Within '+rv('mp_gap_percent')+'%':'Gap '+gap.toFixed(0)+'%'}</span>`:''}</td></tr></table></div>
 <div class="mut">${mode==='suggested'?'Calculated: the day\'s worked man-hours (OT included) are shared between the jobs in the ratio of their expected man-hours (matrix). Man power = job man-hours ÷ shift hours (not more than the people present); hours = job man-hours ÷ that man power. Both can be changed by typing over them. The split assumes all jobs of the day are entered; until then the check may show a gap.':'Manual mode: type the real man power and hours for this job.'} Man-hours = man power × hours.</div>`;
 const u=$('#usg');if(u)u.onclick=()=>{$('#mp').value=sugMP;$('#hr').value=sugHr;mpTouched=hrTouched=false;mpAssist(j,e)}}

PROD.push({id:3,date:'2026-11-10',colour:'COLOR',variant:'PRINTED TIN',shape:'SQUARE',vendor:'LBN INDUSTRIES',job:'BUSH 65MM',spec:'65X65X55',comp:'CAN',actual:90000,mp:0,hrs:0,fg:0,sfg:90000,scrap:0,cvar:'',cname:'',cqty:0},
 {id:4,date:'2026-11-10',colour:'COLOR',variant:'PRINTED TIN',shape:'ROUND',vendor:'LBN INDUSTRIES',job:'6 INCH ROUND',spec:'6 INCH',comp:'CAN',actual:5600,mp:0,hrs:0,fg:0,sfg:5600,scrap:0,cvar:'',cname:'',cqty:0},
 {id:5,date:'2026-11-10',colour:'PRINTED',variant:'CARATLANE',shape:'RECTANGLE',vendor:'CARATLANE TRADING PVT LTD - MH',job:'WALLET 27MM AUTO',spec:'115x95x27',comp:'CAN',actual:16500,mp:0,hrs:0,fg:0,sfg:16500,scrap:0,cvar:'',cname:'',cqty:0});

/* sample: book the day's man power exactly as the suggestion would */
(()=>{const d='2026-11-10';PROD.filter(r=>r.date===d&&r.comp==='CAN').forEach(r=>{const g=suggestFor(d,r,r);if(g){r.mp=g.mp;r.hrs=g.hr}})})();
start();
// sample history before 10 Nov so Opening / Closing are real running balances
(()=>{if(PROD.some(r=>r.id>=200))return;
 const base=n=>PROD.find(r=>r.job===n),mk=(n,date,comp,actual,fg,sfg,scrap)=>{const b=base(n);PROD.push({id:200+PROD.length,date,colour:b.colour,variant:b.variant,shape:b.shape,vendor:b.vendor,job:b.job,spec:b.spec,comp,actual,mp:8,hrs:8,fg,sfg,scrap,cvar:'',cname:'',cqty:0})};
 const ob=o=>OUT.find(x=>x.job===o);
 const mo=(n,date,qty,so,inv)=>{const b=base(n);OUT.push({id:200+OUT.length,date,so,vendor:b.vendor,variant:b.variant,colour:b.colour,shape:b.shape,job:b.job,spec:b.spec,boxes:Math.ceil(qty/50),perbox:50,qty,invoice:inv,dc:'D'+(200+OUT.length),contact:'',vehicle:'PY01AB1234',jid:jobId(b.colour,b.variant,b.shape,b.vendor,b.job,b.spec)})};
 mk('101 DIA SLIP LID','2026-11-06','LID',12000,12000,0,0);mk('101 DIA SLIP LID','2026-11-06','BOTTOM',12000,12000,0,0);
 mk('101 DIA SLIP LID','2026-11-08','CAN',2000,2000,0,20);mk('101 DIA SLIP LID','2026-11-09','CAN',1500,1500,0,10);mo('101 DIA SLIP LID','2026-11-09',1800,'2500154','INV-2611-011');
 mk('BUSH 65MM','2026-11-05','LID',100000,100000,0,0);mk('BUSH 65MM','2026-11-05','TAGGER',100000,0,0,0);mk('BUSH 65MM','2026-11-05','BOTTOM',100000,100000,0,0);
 mk('6 INCH ROUND','2026-11-07','LID',8000,8000,0,0);mk('6 INCH ROUND','2026-11-07','BOTTOM',8000,8000,0,0);
 mk('WALLET 27MM AUTO','2026-11-08','LID',20000,20000,0,0);mk('WALLET 27MM AUTO','2026-11-08','BOTTOM',20000,20000,0,0);
 mk('WALLET 27MM MANUAL','2026-11-06','LID',4000,4000,0,0);mk('WALLET 27MM MANUAL','2026-11-06','BOTTOM',4000,4000,0,0);
 mk('WALLET 27MM MANUAL','2026-11-08','CAN',3000,2000,1000,30);
 // deliberate check row: more dispatched than was ever produced, so the Error status is visible
 const b=base('BUSH 65MM');PROD.push({id:200+PROD.length,date:'2026-11-08',colour:b.colour,variant:b.variant,shape:'RECTANGLE',vendor:b.vendor,job:'NUTCASE 38MM',spec:'124x70x38',comp:'CAN',actual:1000,mp:8,hrs:8,fg:0,sfg:1000,scrap:0,cvar:'',cname:'',cqty:0});
 OUT.push({id:200+OUT.length,date:'2026-11-09',so:'',vendor:b.vendor,variant:b.variant,colour:b.colour,shape:'RECTANGLE',job:'NUTCASE 38MM',spec:'124x70x38',boxes:24,perbox:50,qty:1200,invoice:'INV-2611-012',dc:'D212',contact:'',vehicle:'PY01AB1234',jid:jobId(b.colour,b.variant,'RECTANGLE',b.vendor,'NUTCASE 38MM','124x70x38')});
 const bo=PROD.find(r=>r.id===2);if(bo){bo.fg=5200;bo.sfg=0}   // component rows: FG only (VBA rule)
})();

/* ---------------- Stage 2: To check and update, Stock tracking, Back-date review ---------------- */
const _st0=VIEWS.status;VIEWS.status=()=>{_st0();todoPanel()};
async function todoPanel(){const {data,error}=await R('todo_list');if(error||!data||VIEW!=='status')return;const m=$('#main');if(!m)return;
 const open=data.filter(x=>x.count>0),clear=data.filter(x=>x.count===0);
 const card=document.createElement('div');card.className='card';card.id='todo';
 card.innerHTML=`<h2>To check and update <span class="mut" style="font-weight:400;font-size:13px">(${esc(ME.roles.pms)})</span></h2>`+(open.length?`<div class="scroll"><table><tr><th style="text-align:left">What</th><th>Count</th><th>Actions</th></tr>${open.map(x=>`<tr><td style="text-align:left">${esc(x.label)}</td><td><b style="color:#f0cf6a">${Number(x.count).toLocaleString()}</b></td><td>${ib('eye','Show the first '+x.rows.length,`data-tl="${x.key}"`)}${ib('open','Open the screen',`data-to="${x.view}"`)}</td></tr>`).join('')}</table></div>`:'<div class="mut">Nothing to check right now.</div>')+(clear.length?`<div class="mut" style="margin-top:6px">All clear: ${clear.map(x=>esc(x.label)).join(' · ')}</div>`:'');
 m.insertBefore(card,m.firstChild);
 card.querySelectorAll('[data-to]').forEach(a=>a.onclick=()=>go(a.dataset.to));
 card.querySelectorAll('[data-tl]').forEach(a=>a.onclick=()=>{const x=data.find(y=>y.key===a.dataset.tl);modal(`<h2>${esc(x.label)}</h2><div class="mut">Showing ${x.rows.length} of ${Number(x.count).toLocaleString()}</div><div class="scroll" style="max-height:60vh"><table>${x.rows.map(r=>`<tr><td style="text-align:left">${esc(r)}</td></tr>`).join('')}</table></div>`)})}
VIEWS.tracking=async()=>{const {data,error}=await R('tracking_list');if(error)return toast(cleanErr(error.message),true);const rows=data||[];
 const od=(()=>{const d=new Date(Date.parse(STOCK_BASE_LIVE||'2026-06-30')+864e5);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})})();
 $('#main').innerHTML=`<div class="kpi"><div><b>${rows.length}</b>Components</div><div><b>${rows.filter(r=>r.tracked).length}</b>Tracked</div><div><b>${rows.filter(r=>!r.tracked).length}</b>Not tracked</div><div><b>${rows.filter(r=>r.tracked&&+r.stock_if_tracked<0).length}</b>Below zero</div></div>
 <div class="card"><h2>Stock tracking</h2><div class="mut" style="margin-bottom:8px">Switch tracking on or off for each LID, BOTTOM and TAGGER. CAN stock is always tracked. Stock = Opening (${od}) + made − used.</div>
 <div class="row noprint"><label>Search<input id="ts" placeholder="Job name, spec"></label><label>Component<select id="tc"><option value="">All</option><option>LID</option><option>BOTTOM</option><option>TAGGER</option></select></label><label>Show<select id="tf"><option value="">All</option><option value="on">Tracked</option><option value="off">Not tracked</option><option value="neg">Below zero</option></select></label></div><div id="tl" style="margin-top:10px"></div></div>`;
 const paint=()=>{const t=$('#ts').value.toLowerCase(),c=$('#tc').value,f=$('#tf').value;const d=rows.filter(r=>(!t||(r.job+' '+r.spec).toLowerCase().includes(t))&&(!c||r.component===c)&&(!f||(f==='on'?r.tracked:f==='off'?!r.tracked:r.tracked&&+r.stock_if_tracked<0)));
  $('#tl').innerHTML=`<div class="scroll"><table><tr><th>Job Name</th><th>Job Spec</th><th>Component</th><th>Opening – ${od}</th><th>Made</th><th>Used</th><th>Stock</th><th>Tracked</th></tr>${d.map(r=>`<tr><td>${esc(r.job)}</td><td>${esc(r.spec)}</td><td>${r.component}</td><td>${Number(r.opening).toLocaleString()}</td><td>${Number(r.made).toLocaleString()}</td><td>${Number(r.used).toLocaleString()}</td><td style="${+r.stock_if_tracked<0?'color:#ff9d9d;font-weight:700':''}">${Number(r.stock_if_tracked).toLocaleString()}</td><td><input type="checkbox" class="tk" data-s="${r.job_spec_id}" data-c="${r.component}" ${r.tracked?'checked':''}></td></tr>`).join('')}</table></div><div class="mut">${d.length} shown</div>`;
  document.querySelectorAll('.tk').forEach(k=>k.onchange=async()=>{const {error}=await R('tracking_set',{p_spec:+k.dataset.s,p_comp:k.dataset.c,p_tracked:k.checked});if(error){k.checked=!k.checked;return toast(cleanErr(error.message),true)}const r=rows.find(x=>x.job_spec_id==k.dataset.s&&x.component===k.dataset.c);if(r)r.tracked=k.checked;toast(k.checked?'Tracking on':'Tracking off');paint()})};
 ['#ts','#tc','#tf'].forEach(i=>$(i).oninput=$(i).onchange=paint);paint()};
VIEWS.backdate=async()=>{let st='Pending';
 const draw=async()=>{const {data,error}=await R('backdate_list',{p_status:st||null});if(error)return toast(cleanErr(error.message),true);const rows=data||[];
  $('#main').innerHTML=`<div class="card"><h2>Back-date review</h2><div class="mut" style="margin-bottom:8px">Entries made for a date older than ${EDIT_DAYS} days, with the reason given. Mark each one reviewed once you have checked it.</div>
  <div class="row noprint"><label>Show<select id="bs"><option ${st==='Pending'?'selected':''} value="Pending">Pending</option><option ${st==='Reviewed'?'selected':''} value="Reviewed">Reviewed</option><option ${!st?'selected':''} value="">All</option></select></label></div>
  <div class="scroll" style="margin-top:10px"><table><tr><th>Entry date</th><th>Reason</th><th>Entered by</th><th>Entered on</th><th>Status</th><th>Review note</th><th>Actions</th></tr>${rows.map(b=>`<tr><td>${b.entry_date}</td><td style="text-align:left">${esc(b.reason)}</td><td>${esc(b.by_name)}</td><td>${String(b.entered_at||'').slice(0,16).replace('T',' ')}</td><td><span class="tag ${b.status==='Pending'?'warn':'ok'}">${b.status}</span></td><td>${esc(b.review_note||'')}${b.reviewed_name?' <span class="mut">('+esc(b.reviewed_name)+')</span>':''}</td><td>${b.status==='Pending'?ib('save','Mark reviewed',`data-r="${b.id}"`):''}</td></tr>`).join('')||'<tr><td colspan=7>Nothing here</td></tr>'}</table></div></div>`;
  $('#bs').onchange=()=>{st=$('#bs').value;draw()};
  document.querySelectorAll('[data-r]').forEach(a=>a.onclick=()=>{const note=prompt('Review note (optional)');if(note===null)return;R('backdate_review',{p_id:+a.dataset.r,p_note:note||null}).then(({error})=>{if(error)return toast(cleanErr(error.message),true);toast('Marked reviewed');draw()})})};
 draw()};
