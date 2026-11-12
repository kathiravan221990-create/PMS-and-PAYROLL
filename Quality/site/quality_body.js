/* ===== CP QUALITY — Job Master + Job Calculator (standalone, same look as CP PAYROLL / CP PMS) ===== */
const MOCK={shapes:{}};
/* ================= LIVE (Supabase) layer - same project as CP PMS ================= */
const SB_URL='https://axnxhqcvevviwnncplwt.supabase.co';
const SB_KEY='sb_publishable_olHYJ6TZAcyqdGqIuhEyNw_GWe7nRv0';
const sb=supabase.createClient(SB_URL,SB_KEY);
const C=(fn,a)=>sb.schema('core_api').rpc(fn,a||{});
const R=(fn,a)=>sb.schema('pms_api').rpc(fn,a||{});
function cleanErr(m){m=String(m||'');if(m.includes('permission_denied'))return 'You do not have permission for this. ('+m+')';return m}

const NAVMAP={quality:'status',jobcalc:'billing'};
const TITLES={quality:'Job Master',jobcalc:'Job Calculator'};
const GROUPS=[['QUALITY',[['quality','Job Master'],['jobcalc','Job Calculator']]]];
function shell(){
 $('#app').innerHTML=`<div class="layout"><aside><div class="brand"><img src="__BRAND__"><div><b>CP QUALITY</b><span>Classic Pack Pvt Ltd</span></div></div>
 <nav>${GROUPS.map(([g,a])=>`<div class="ngrp">${g}</div>`+a.map(t=>`<button data-v="${t[0]}" title="${t[1]}"><span class="tile">${NAV[NAVMAP[t[0]]]}</span><span class="lb">${t[1]}</span></button>`).join('')).join('')}</nav><div class="side-foot">Role: <b style="color:var(--gold2)">quality</b></div></aside>
 <div class="content"><div class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="menu" id="mn" title="Expand / collapse menu">${I('menu')}</button><h1 id="ttl"></h1></div><div class="who"><div class="av">K</div><div>Kathiravan</div><button id="lo">${I('logout')} Log out</button></div></div><main id="main"></main></div></div>`;
 document.querySelectorAll('aside nav button').forEach(b=>b.onclick=()=>go(b.dataset.v));
 $('#mn').onclick=()=>{sideCollapsed=!sideCollapsed;document.body.classList.toggle('sc',sideCollapsed)}}
function go(v){VIEW=v;document.querySelectorAll('aside nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));$('#ttl').innerHTML=I('open')+' '+TITLES[v];(VIEWS[v]||VIEWS.soon)()}
const VIEWS={};
/* ---------------- QUALITY tile: Job Master + Job Calculator (weights feed Scrap) ---------------- */
let JM=[];
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
  const ex=e||jmFind(rec.shape,rec.job,rec.spec);
  const wb=jmBody(rec),wl=jmScale(rec.lbw,rec.lbt,rec.lt),wt=jmScale(rec.tbw,rec.tbt,rec.tt);
  R('job_master_save',{p:{job_spec_id:ex?ex.id:null,shape:rec.shape,job:rec.job,spec:rec.spec,lid_type:rec.lid,height:rec.ht,body_w:rec.bw,body_h:rec.bh,body_t:rec.bt,lid_w:rec.lw,lid_h:rec.lh,lid_t:rec.lt,bot_w:rec.tw,bot_h:rec.th,bot_t:rec.tt,wt_body:wb,wt_lid:wl,wt_bottom:wt,body_base_t:rec.bt,body_base_wt:wb,lid_base_t:rec.lbt,lid_base_wt:rec.lbw,bot_base_t:rec.tbt,bot_base_wt:rec.tbw,picture_name:rec.img||null}}).then(async({error})=>{if(error)return toast(cleanErr(error.message),true);toast('Saved');await hydrate();go('quality')})}}

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

async function hydrate(){
 const [jm,jc]=await Promise.all([R('job_master_list'),R('job_calc_list')]);
 if(jm.error)throw jm.error;
 JM=(jm.data||[]).map(o=>({id:o.job_spec_id,shape:o.shape,job:String(o.job).trim(),spec:o.spec,lid:o.lid_type||'',ht:o.height,bw:o.body_w,bh:o.body_h,bt:o.body_t,lw:o.lid_w,lh:o.lid_h,lt:o.lid_t,tw:o.bot_w,th:o.bot_h,tt:o.bot_t,wb:o.wt_body,wl:o.wt_lid,wt:o.wt_bottom,bbt:o.body_base_t,bbw:o.body_base_wt,lbt:o.lid_base_t,lbw:o.lid_base_wt,tbt:o.bot_base_t,tbw:o.bot_base_wt,img:o.picture_name,draft:!!o.is_draft}));
 syncShapes();
 Object.keys(JC_SAVED).forEach(k=>delete JC_SAVED[k]);(jc.data||[]).forEach(x=>{JC_SAVED[x.job_spec_id]={L:x.L,B:x.B,W:x.W,nb:x.nb,nl:x.nl,nt:x.nt,sg:x.sg}})}
function showLogin(msg){$('#app').innerHTML=`<div class="login-wrap"><div class="login"><img src="__BRAND__" alt="Classic Pack" style="height:70px"><h1>CP QUALITY</h1><div class="sub">Sign in to continue</div>
<label>User ID<input id="em" autocomplete="username" autocapitalize="off" placeholder="Enter your User ID"></label>
<label>Password<input id="pw" type="password" autocomplete="current-password" placeholder="Enter your password"></label>
<button class="b" id="go">${I('inn')||''} Log in</button>${msg?`<div class="msg err">${esc(msg)}</div>`:''}</div></div>`;
 const go2=async()=>{const {error}=await sb.auth.signInWithPassword({email:(v=>v.includes('@')?v:v.toLowerCase()+'@classicpack.com')($('#em').value.trim()),password:$('#pw').value});if(error)return showLogin(error.message);start()};
 $('#go').onclick=go2;$('#pw').onkeydown=e=>{if(e.key==='Enter')go2()}}
async function start(){const {data:s}=await sb.auth.getSession();if(!s.session)return showLogin();
 const {data,error}=await C('me');if(error)return showLogin(cleanErr(error.message));
 if(!data||!data.active)return showLogin('This login is not registered. Ask the Administrator.');
 ME=data;if(!ME.roles||!ME.roles.pms)return showLogin('No access for this login. Ask the Administrator.');
 try{await hydrate()}catch(e){return showLogin('Could not load data: '+cleanErr(e.message))}
 shell();$('#lo').onclick=async()=>{await sb.auth.signOut();ME=null;showLogin()};
 go('quality')}
start();
