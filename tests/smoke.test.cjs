const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const {smokeIds,validateSmokePlan,validateSmokePermit,validateSmokeReport,publicSmokeReport}=require('../dist/smoke-contract');
const {pageOperation,assertSmokePath,runSmokeScenarios}=require('../dist/smoke');
const {validateSessionResult}=require('../dist/lifecycle-diagnostics');
const {RunnerError,publicError}=require('../dist/errors');
const runId='12345678-1234-4234-8234-123456789abc';
const pass=()=>({version:1,runId,status:'PASS',scenarios:smokeIds.map(id=>({id,status:'PASS'}))});

test('smoke plan and permit reject stale nonce, fabricated review approval and arbitrary controls',()=>{
 const plan={version:1,runId,suite:'batch-2-v1',isolationReview:'PENDING'};
 validateSmokePlan(plan,runId);validateSmokePermit({version:1,runId},runId);
 for(const bad of [{...plan,runId:'stale'},{...plan,isolationReview:'APPROVED'},{...plan,path:'/home/SECRET'},{...plan,suite:'arbitrary-script'}]) assert.throws(()=>validateSmokePlan(bad,runId));
 for(const bad of [{version:1,runId:'stale'},{version:1,runId,script:'SECRET'},null]) assert.throws(()=>validateSmokePermit(bad,runId));
});
test('smoke evidence accepts only the fixed ordered suite and a single fail-closed stopping point',()=>{
 const good=pass();assert.deepEqual(validateSmokeReport(good,runId),good);
 const fail=pass();fail.status='FAIL';fail.scenarios[1]={id:smokeIds[1],status:'FAIL',reason:'UI_ASSERTION_FAILED'};
 for(let i=2;i<smokeIds.length;i++)fail.scenarios[i]={id:smokeIds[i],status:'NOT_RUN'};
 validateSmokeReport(fail,runId);
 for(const bad of [{...good,runId:'stale'},{...good,token:'SECRET'},{...good,scenarios:[]},{...good,status:'FAIL'}]) assert.throws(()=>validateSmokeReport(bad,runId));
 for(const mutate of [v=>v.scenarios.reverse(),v=>v.scenarios[0].reason='SECRET',v=>v.scenarios[1].status='NOT_RUN',v=>v.scenarios[0].url='SECRET']) {
  const bad=pass();mutate(bad);assert.throws(()=>validateSmokeReport(bad,runId));
 }
 const afterFailure=structuredClone(fail);afterFailure.scenarios[2].status='PASS';assert.throws(()=>validateSmokeReport(afterFailure,runId));
 assert.equal(JSON.stringify(publicSmokeReport({...good,token:'SECRET'})).includes('SECRET'),false);
 const error=new RunnerError('LAUNCH_BLOCKED','Fixed failure.');error.smoke=fail;
 assert.deepEqual(publicError(error).smoke.scenarios,fail.scenarios);assert.equal('runId' in publicError(error).smoke,false);
});
test('Batch 1 cannot accept mutation reports; Batch 2 success requires evidence and verified shutdown',()=>{
 const good={version:1,runId,status:'LIFECYCLE_VERIFIED',shutdownComplete:true,guiMutations:true,smoke:pass()};
 assert.throws(()=>validateSessionResult(good,runId,0));
 assert.equal(validateSessionResult(good,runId,0,true).smoke.status,'PASS');
 for(const bad of [{...good,smoke:undefined},{...good,guiMutations:false},{...good,shutdownComplete:false}]) assert.throws(()=>validateSessionResult(bad,runId,0,true));
 assert.throws(()=>validateSessionResult(good,runId,3,true));
});
test('normal projects, target source, noncanonical scratch and profile paths are rejected before filesystem reads',async()=>{
 const reads=mock.method(fs,'lstat',async()=>{throw new Error('Must not inspect host paths');});
 try {
  for(const value of ['/home/owner/PLProjects/test','/target/apps/desktop/main.js','/scratch/config/recents.json','/scratch/home/PLProjects-other/test','/scratch/home/PLProjects/../test','/scratch/home/PLProjects']) await assert.rejects(assertSmokePath(value),e=>e.reason==='SCRATCH_ASSERTION_FAILED');
  assert.equal(reads.mock.callCount(),0);
 }finally{reads.mock.restore();}
});
test('scratch oracle checks every ancestor and refuses symlink and realpath escapes',async()=>{
 const seen=[];let alias='';
 const stat=mock.method(fs,'lstat',async p=>{seen.push(p);return {isSymbolicLink:()=>p===alias};});
 const real=mock.method(fs,'realpath',async p=>p===alias?'/scratch/data':p);
 try {
  await assertSmokePath('/scratch/home/PLProjects/test/code/test.txt');assert.ok(seen.includes('/scratch/home'));
  alias='/scratch/home/PLProjects/test';await assert.rejects(assertSmokePath('/scratch/home/PLProjects/test/code/test.txt'));
 }finally{stat.mock.restore();real.mock.restore();}
});
function element(text='') {
 return {textContent:text,disabled:false,clicks:0,scrolls:0,getBoundingClientRect:()=>({width:50,height:20,top:10,left:10,bottom:30,right:60}),scrollIntoView(){this.scrolls++;},click(){this.clicks++;}};
}
function domOperation(nodes,op,selector='',text='',value='') {
 const events=[];
 class Input {constructor(){Object.assign(this,element());this.content='';}get value(){return this.content;}set value(v){this.content=v;}dispatchEvent(e){events.push(e.type);}}
 class TextArea extends Input {get value(){return this.content;}set value(v){this.content=v;}}
 const input=new Input();const area=new TextArea();
 const context={document:{querySelectorAll:()=>nodes==='input'?[input]:nodes==='textarea'?[area]:nodes},getComputedStyle:()=>({visibility:'visible',opacity:'1'}),innerWidth:1280,innerHeight:800,HTMLInputElement:Input,HTMLTextAreaElement:TextArea,Event:class{constructor(type){this.type=type;}}};
 const result=vm.runInNewContext(`(${pageOperation.toString()})(${[op,selector,text,value].map(v=>JSON.stringify(v)).join(',')})`,context);
 return {result,input,area,events};
}
test('DOM actions reject ambiguous, disabled and hidden controls and assert viewport visibility',()=>{
 const a=element('Create');const b=element('Create');
 assert.equal(domOperation([a,b],'click','','Create').result,false);assert.equal(a.clicks,0);
 a.disabled=true;assert.equal(domOperation([a],'click','','Create').result,false);a.disabled=false;
 assert.equal(domOperation([a],'click','','Create').result,true);assert.equal(a.clicks,1);
 a.getBoundingClientRect=()=>({width:0,height:0});assert.equal(domOperation([a],'present').result,false);
 b.getBoundingClientRect=()=>({width:10,height:10,top:900,left:10,bottom:910,right:20});assert.equal(domOperation([b],'present').result,false);
});
test('serialized page helper uses native input/textarea setters and events without returning content',()=>{
 for(const kind of ['input','textarea']) {
  const value='unique\n"fixture"';const result=domOperation(kind,'fill','', '',value);
  assert.equal(result.result,true);assert.equal((kind==='input'?result.input:result.area).value,value);assert.deepEqual(result.events,['input','change']);
 }
 assert.equal(domOperation([element('Error')],'nonempty').result,true);
});
test('lost readiness stops the fixed suite before any mutation and never echoes raw failures',async()=>{
 let calls=0;const report=await runSmokeScenarios({executeJavaScript:async()=>{calls++;throw new Error('SECRET');}},runId,async()=>{throw new Error('SECRET');});
 assert.equal(report.status,'FAIL');assert.equal(report.scenarios[0].reason,'BOOT_READINESS_LOST');assert.equal(calls,0);
 assert.ok(report.scenarios.slice(1).every(v=>v.status==='NOT_RUN'));assert.equal(JSON.stringify(report).includes('SECRET'),false);validateSmokeReport(report,runId);
 await assert.rejects(runSmokeScenarios({executeJavaScript:async()=>true},'../../host',async()=>{}));
});

async function bootFixture(options={}) {
 const {verifyBootUI}=require('../dist/smoke');
 const processes=require('../dist/processes');let polls=0;let checks=0;const queries=[];
 const newProject=element('New Project');const state=element(options.projectText??'No project open');
 const sidebar=element('No project open');sidebar.getBoundingClientRect=()=>({width:60,height:20,top:900,left:10,bottom:920,right:70});
 const rectHidden=()=>({width:0,height:0,top:0,left:0,right:0,bottom:0});
 if(options.hiddenButton)newProject.getBoundingClientRect=rectHidden;
 if(options.hiddenState)state.getBoundingClientRect=rectHidden;
 const context={document:{querySelectorAll:selector=>{
  queries.push(selector);
  if(selector==='.topbarRight button')return options.missingButton?[]:options.ambiguousButton?[newProject,newProject]:[newProject];
  if(selector==='.workspaceHeader .workspaceSubtitle')return options.missingState?[]:options.ambiguousState?[state,state]:[state];
  if(selector==='.projectSummaryValue')return [sidebar];
  return [];
 }},getComputedStyle:()=>({visibility:'visible',opacity:'1'}),innerHeight:800,innerWidth:1280};
 const contents={executeJavaScript:async code=>{if(options.inspectionFails)throw new Error('SECRET');return vm.runInNewContext(code,context);}};
 const wait=mock.method(processes,'waitFor',async condition=>{
  // Two bounded fake render frames exercise polling without real timeouts.
  for(let frame=0;frame<2;frame++){polls++;if(await condition())return;}
  throw new Error('SECRET timeout');
 });
 try {
  if(options.dynamicButton){const original=context.document.querySelectorAll;let first=true;context.document.querySelectorAll=selector=>{
   if(selector==='.topbarRight button'&&first){first=false;return [];}
   return original(selector);
  };}
  const oldSidebar=vm.runInNewContext(`(${pageOperation.toString()})('text','.projectSummaryValue','','No project open')`,context);
  assert.equal(oldSidebar,false);
  const verify=async()=>{checks++;if(options.lostReadiness)throw new Error('SECRET');};
  if(options.fullSuite)return await runSmokeScenarios(contents,runId,verify);
  await verifyBootUI(contents,verify);
  return {polls,checks,queries};
 } finally {wait.mock.restore();}
}
test('boot checks equivalent visible workspace state even when sidebar summary is below viewport',async()=>{
 const result=await bootFixture();assert.equal(result.checks,1);
 assert.equal(result.queries.filter(s=>s==='.projectSummaryValue').length,1); // only the old-predicate reproduction
 assert.ok(result.queries.includes('.workspaceHeader .workspaceSubtitle'));
});
test('boot waits for rendering rather than failing on the first missing frame',async()=>{
 const result=await bootFixture({dynamicButton:true});assert.ok(result.polls>5);
});
for(const [options,reason] of [
 [{lostReadiness:true},'BOOT_READINESS_LOST'],[{inspectionFails:true},'BOOT_INSPECTION_FAILED'],
 [{missingButton:true},'BOOT_NEW_PROJECT_MISSING_OR_AMBIGUOUS'],[{ambiguousButton:true},'BOOT_NEW_PROJECT_MISSING_OR_AMBIGUOUS'],
 [{hiddenButton:true},'BOOT_NEW_PROJECT_NOT_VISIBLE'],[{missingState:true},'BOOT_PROJECT_STATE_MISSING_OR_AMBIGUOUS'],
 [{ambiguousState:true},'BOOT_PROJECT_STATE_MISSING_OR_AMBIGUOUS'],[{hiddenState:true},'BOOT_PROJECT_STATE_NOT_VISIBLE'],
 [{projectText:'Project: SECRET'},'BOOT_PROJECT_STATE_NOT_EMPTY']
])test('boot fails closed with sanitized assertion category '+reason,async()=>{
 await assert.rejects(bootFixture(options),error=>error.reason===reason&&!String(error).includes('SECRET'));
 const report=pass();report.status='FAIL';report.scenarios=smokeIds.map((id,i)=>i?{id,status:'NOT_RUN'}:{id,status:'FAIL',reason});
 assert.equal(publicSmokeReport(report).scenarios[0].reason,reason);
 assert.equal(JSON.stringify(publicSmokeReport(report)).includes('SECRET'),false);
});
test('boot reason codes cannot be attributed to unrelated scenarios or carry raw diagnostic fields',()=>{
 const report=pass();report.status='FAIL';report.scenarios=smokeIds.map((id,i)=>i===0?{id,status:'PASS'}:i===1?{id,status:'FAIL',reason:'BOOT_PROJECT_STATE_NOT_EMPTY'}:{id,status:'NOT_RUN'});
 assert.throws(()=>validateSmokeReport(report,runId));
 const bad=pass();bad.status='FAIL';bad.scenarios=smokeIds.map((id,i)=>i?{id,status:'NOT_RUN'}:{id,status:'FAIL',reason:'BOOT_PROJECT_STATE_NOT_EMPTY',actualText:'SECRET'});
 assert.equal(JSON.stringify(publicSmokeReport(bad)).includes('SECRET'),false);
});

test('actual smoke report preserves the boot assertion category and stops later scenarios',async()=>{
 const report=await bootFixture({fullSuite:true,projectText:'Project: SECRET'});
 assert.equal(report.status,'FAIL');assert.equal(report.scenarios[0].reason,'BOOT_PROJECT_STATE_NOT_EMPTY');
 assert.ok(report.scenarios.slice(1).every(s=>s.status==='NOT_RUN'));
 validateSmokeReport(report,runId);assert.equal(JSON.stringify(publicSmokeReport(report)).includes('SECRET'),false);
});

async function projectFixture(options={}) {
 const processes=require('../dist/processes');
 const name=`plqa-${runId.slice(0,12)}`;const base='/scratch/home/PLProjects';const root=`${base}/${name}`;
 const state={nav:false,modal:false,created:false,error:false,duplicateDone:false,project:'',name:'TestProject',base,manifestChanged:false,
  filename:'',fileExists:false,active:false,dirty:false,content:'',saved:'',reopened:false,scrolled:[],openedBeforeScroll:false};
 class Input {
  constructor(field){Object.assign(this,element());this.field=field;this.content=field==='name'?'TestProject':'';}
  get value(){return this.content;}
  set value(v){if(options[`${this.field}InputFails`])return;this.content=v;}
  dispatchEvent(event){if(event.type==='input')Promise.resolve().then(()=>{state[this.field]=this.content;});}
 }
 const nameInput=new Input('name');const rootInput=new Input('base');
 const fileInput=new Input('filename');
 class TextArea extends Input {
  get value(){return this.content;}
  set value(v){if(options.contentInputFails)return;this.content=v;}
  dispatchEvent(event){if(event.type==='input')Promise.resolve().then(()=>{state.content=this.content;state.dirty=!options.dirtyMissing;});}
 }
 const editor=new TextArea('editor');
 const codeCreate=element('Create');codeCreate.disabled=Boolean(options.codeCreateFails);
 codeCreate.click=()=>{if(!options.fileNotListed){state.fileExists=true;state.active=!options.editorNotOpen;state.dirty=false;state.content='';editor.content='';}};
 const save=element('Save File');save.disabled=Boolean(options.saveFails);
 save.click=()=>{if(!options.savedMissing){state.saved=state.content;state.dirty=false;}};
 const close=element('Close File');close.disabled=Boolean(options.closeFails);
 close.click=()=>{if(!options.editorRemainsAfterClose)state.active=false;};
 const fileButton=element();fileButton.disabled=Boolean(options.reopenFails);
 fileButton.click=()=>{state.reopened=true;state.active=true;state.dirty=false;state.content=options.reopenContentMismatch?'WRONG':state.saved;editor.content=state.content;};
 const listed=(active)=>{const el=element(active?'qa-smoke.txt ✓':'qa-smoke.txt');
  el.getBoundingClientRect=()=>state.scrolled.includes(active?'active':'closed')?{width:50,height:20,top:10,left:10,bottom:30,right:60}:{width:50,height:20,top:900,left:10,bottom:920,right:60};
  el.scrollIntoView=()=>{state.scrolled.push(active?'active':'closed');};return el;};
 const meta=(dirty)=>{const el=element(dirty?'Unsaved changes':'Saved');
  el.getBoundingClientRect=()=>state.scrolled.includes(dirty?'dirty':'saved')?{width:50,height:20,top:10,left:10,bottom:30,right:60}:{width:50,height:20,top:-30,left:10,bottom:-10,right:60};
  el.scrollIntoView=()=>{state.scrolled.push(dirty?'dirty':'saved');};return el;};
 const newButton=element('New Project');newButton.click=()=>{if(!options.modalNeverOpens)state.modal=true;state.error=false;};
 Object.defineProperty(newButton,'disabled',{get:()=>state.nav&&options.newActionFails});
 const nav=element();nav.click=()=>{state.nav=true;};
 const create=element('Create');Object.defineProperty(create,'disabled',{get:()=>Boolean(options.createActionFails||(state.created&&options.duplicateCreateFails))});
 create.click=()=>{
  if(!state.created) {
   if(options.rpcPending)return;
   if(options.rpcRejects){state.error=true;return;}
   state.created=true;state.project=`${state.base}/${state.name}`;state.modal=false;
  } else {
   state.error=!options.noDuplicateError;state.manifestChanged=Boolean(options.duplicateChangesManifest);
   if(options.duplicateChangesContext)state.project=root+'-wrong';
  }
 };
 const cancel=element('Cancel');cancel.disabled=Boolean(options.cancelActionFails);
 cancel.click=()=>{state.duplicateDone=true;if(!options.cancelStaysOpen)state.modal=false;};
 const context={document:{querySelectorAll:selector=>{
  if(selector==='.topbarRight button')return [newButton];
  if(selector==='button')return [newButton,...(options.persistence?[save,close]:[])];
  if(selector==='.nav .NavItem:nth-child(2) .navLabel'||selector==='.nav .NavItem.active .navLabel')return [element('Code IDE')];
  if(selector==='.nav .NavItem:nth-child(2)')return [nav];
  if(selector==='.workspaceHeader .workspaceTitle')return [element('code')];
  if(selector==='.emptyState')return [element('Open a project to use Code IDE.')];
  if(selector==='.workspaceHeader .workspaceSubtitle')return [element(state.project?`Project: ${options.wrongContext?root+'-wrong':state.project}`:'No project open')];
  if(selector==='.projectSummaryValue'){const offscreen=element(state.project||'No project open');offscreen.getBoundingClientRect=()=>({width:50,height:20,top:900,left:10,bottom:920,right:60});return [offscreen];}
  if(selector==='[role="dialog"]')return state.modal?[element()]:[];
  if(selector==='[role="dialog"] .modalTitle')return state.modal?[element('Create New Project')]:[];
  if(selector==='[role="dialog"] input[placeholder="My Project"]')return state.modal?[nameInput]:[];
  if(selector==='[role="dialog"] input[placeholder="Defaults to ~/PLProjects"]')return state.modal?[rootInput]:[];
  if(selector==='[role="dialog"] button')return state.modal?[create,cancel]:[];
  if(selector==='[role="dialog"] .errorBox')return state.modal&&state.error?[element('SECRET_ERROR')]:[];
  if(options.persistence&&state.created){
   if(selector==='input[placeholder="main.py"]')return [fileInput];
   if(selector==='.workspaceSplitSide button')return [codeCreate];
   if(selector==='.workspaceSplitSide button.listNutton strong')return state.fileExists&&!(options.closedFileNotListed&&!state.active)?[listed(state.active||options.editorNotOpen)]:[];
   if(selector==='.workspaceSplitSide button.listNutton')return state.fileExists?[fileButton]:[];
   if(selector==='textarea.codeEditor')return state.active?[editor]:[];
   if(selector==='.codeMeta .docsDirty')return state.active&&state.dirty?[meta(true)]:[];
   if(selector==='.codeMeta .docsSaved')return state.active&&!state.dirty?[meta(false)]:[];
  }
  return [];
 }},getComputedStyle:()=>({visibility:'visible',opacity:'1'}),innerWidth:1280,innerHeight:800,HTMLInputElement:Input,HTMLTextAreaElement:TextArea,Event:class{constructor(type){this.type=type;}}};
 const contents={executeJavaScript:async code=>vm.runInNewContext(code,context)};
 const mocks=[
  mock.method(processes,'waitFor',async condition=>{for(let i=0;i<3;i++)if(await condition())return;throw new Error('SECRET_TIMEOUT');}),
  mock.method(fs,'realpath',async p=>{assert.ok(p.startsWith('/scratch'));return p;}),
  mock.method(fs,'lstat',async p=>{assert.ok(p.startsWith('/scratch'));return {isSymbolicLink:()=>Boolean((options.unsafeScratch&&p==='/scratch/home')||(options.unsafeCodePath&&p===root+'/code'))};}),
  mock.method(fs,'readdir',async p=>{assert.equal(p,base);return state.created?(options.extraDirectory?[name,'unexpected']:[name]):[];}),
  mock.method(fs,'readFile',async (p,encoding)=>{
   if(p===root+'/code/qa-smoke.txt'){
    const bytes=options.savedBytesMismatch?'WRONG':options.reopenBytesMismatch&&state.reopened?'WRONG':state.saved;
    return encoding==='utf8'?bytes:Buffer.from(bytes);
   }
   assert.equal(p,root+'/pl-project.json');
   return Buffer.from(JSON.stringify({schemaVersion:options.badSchema?2:1,name:options.badManifestName?'SECRET':name,changed:state.manifestChanged}));
  })
 ];
 try {
  const report=await runSmokeScenarios(contents,runId,async()=>{
   if(options.lostProjectReadiness&&state.nav)throw new Error('SECRET');
   if(state.duplicateDone&&!options.persistence)throw new Error('Stop test after project scenario');
   if(options.lostPersistReadiness&&state.duplicateDone)throw new Error('SECRET');
  });
  return options.persistence||options.probeBackendUi?{report,state}:report;
 }
 finally {for(const m of mocks.reverse())m.mock.restore();}
}
test('project UI flow passes with offscreen sidebar, visible exact workspace context and duplicate rejection',async()=>{
 const report=await projectFixture();assert.ok(report.scenarios.slice(0,3).every(v=>v.status==='PASS'));
 assert.ok(report.scenarios.slice(0,3).every(v=>Number.isSafeInteger(v.durationMs)&&v.durationMs>=1));
 assert.ok(report.trace.length>0&&report.trace.length<=128);
 assert.ok(report.trace.every(e=>!('selector' in e)&&!('value' in e)));
 assert.equal(report.scenarios[3].status,'FAIL'); // fixture intentionally stops after project validation
 validateSmokeReport(report,runId);assert.equal(JSON.stringify(publicSmokeReport(report)).includes('SECRET'),false);
});
test('mocked backend success and manifest availability cannot pass when the visible project context stays wrong',async()=>{
 const {report,state}=await projectFixture({wrongContext:true,probeBackendUi:true});
 assert.equal(state.created,true); // the controlled fixture exposes the backend-success path
 assert.equal(report.scenarios[2].status,'FAIL');
 assert.equal(report.scenarios[2].reason,'PROJ_CONTEXT_NOT_UPDATED');
 assert.ok(report.trace.some(e=>e.scenarioId===smokeIds[2]&&e.target==='PROJECT_CONTEXT'&&e.expected==='EXACT_FIXTURE_TEXT'&&e.actual==='NOT_OBSERVED'));
 assert.ok(report.trace.some(e=>e.scenarioId===smokeIds[2]&&e.target==='PROJ_CONTEXT_NOT_UPDATED'&&e.outcome==='FAIL'));
 validateSmokeReport(report,runId);
});
for(const [options,reason] of [
 [{unsafeScratch:true},'PROJ_SCRATCH_ROOT_INVALID'],[{lostProjectReadiness:true},'PROJ_READINESS_LOST'],[{duplicateCreateFails:true},'PROJ_DUPLICATE_CREATE_FAILED'],
 [{newActionFails:true},'PROJ_NEW_PROJECT_ACTION_FAILED'],[{modalNeverOpens:true},'PROJ_MODAL_NOT_READY'],
 [{nameInputFails:true},'PROJ_NAME_INPUT_FAILED'],[{baseInputFails:true},'PROJ_ROOT_INPUT_FAILED'],
 [{createActionFails:true},'PROJ_CREATE_ACTION_FAILED'],[{rpcPending:true},'PROJ_MODAL_DID_NOT_CLOSE'],
 [{rpcRejects:true},'PROJ_CREATE_REJECTED'],[{wrongContext:true},'PROJ_CONTEXT_NOT_UPDATED'],
 [{badSchema:true},'PROJ_MANIFEST_INVALID'],[{badManifestName:true},'PROJ_MANIFEST_INVALID'],
 [{noDuplicateError:true},'PROJ_DUPLICATE_ERROR_NOT_VISIBLE'],[{duplicateChangesManifest:true},'PROJ_DUPLICATE_MANIFEST_CHANGED'],
 [{extraDirectory:true},'PROJ_DUPLICATE_DIRECTORY_COUNT_CHANGED'],[{duplicateChangesContext:true},'PROJ_DUPLICATE_CONTEXT_CHANGED'],
 [{cancelActionFails:true},'PROJ_DUPLICATE_CANCEL_FAILED'],[{cancelStaysOpen:true},'PROJ_DUPLICATE_MODAL_DID_NOT_CLOSE']
])test('project stage fails closed and propagates '+reason,async()=>{
 const report=await projectFixture(options);assert.equal(report.scenarios[2].reason,reason);
 assert.ok(report.scenarios.slice(3).every(v=>v.status==='NOT_RUN'));validateSmokeReport(report,runId);
 assert.equal(publicSmokeReport(report).scenarios[2].reason,reason);assert.equal(JSON.stringify(publicSmokeReport(report)).includes('SECRET'),false);
});
test('project codes are fixed, sanitized and restricted to project scenarios',async()=>{
 const {smokeReasons}=require('../dist/smoke-contract');const {projectStage}=require('../dist/smoke');
 for(const reason of smokeReasons.filter(v=>v.startsWith('PROJ_'))) {
  await assert.rejects(projectStage(reason,async()=>{throw new Error('SECRET /host/path');}),e=>e.reason===reason&&!String(e).includes('SECRET'));
  const report=pass();report.status='FAIL';report.scenarios=smokeIds.map((id,i)=>i<2?{id,status:'PASS'}:i===2?{id,status:'FAIL',reason}:{id,status:'NOT_RUN'});
  assert.equal(publicSmokeReport(report).scenarios[2].reason,reason);
  report.scenarios[1]={id:smokeIds[1],status:'FAIL',reason};report.scenarios[2]={id:smokeIds[2],status:'NOT_RUN'};
  assert.throws(()=>validateSmokeReport(report,runId));
 }
});
test('native controlled-input setter preserves React-style change detection and commits entered value',()=>{
 let tracked='TestProject';let controlled='TestProject';let changes=0;
 class Input {
  get value(){return this.content;}
  set value(v){this.content=v;}
  dispatchEvent(event){if(event.type==='input'&&this.value!==tracked){tracked=this.value;controlled=this.value;changes++;}}
 }
 const input=new Input();Object.assign(input,element());input.content=controlled;
 const native=Object.getOwnPropertyDescriptor(Input.prototype,'value');
 Object.defineProperty(input,'value',{get(){return native.get.call(this);},set(v){tracked=v;native.set.call(this,v);}});
 const context={document:{querySelectorAll:()=>[input]},HTMLInputElement:Input,HTMLTextAreaElement:class {},getComputedStyle:()=>({visibility:'visible',opacity:'1'}),innerHeight:800,innerWidth:1280,Event:class{constructor(type){this.type=type;}}};
 assert.equal(vm.runInNewContext(`(${pageOperation.toString()})('fill','input','','fixture-name')`,context),true);
 assert.equal(controlled,'fixture-name');assert.equal(changes,1);
 input.value='ordinary-assignment';input.dispatchEvent({type:'input'});
 assert.equal(changes,1);assert.equal(controlled,'fixture-name'); // demonstrates why ordinary assignment would miss onChange
});
test('page inspection scrolls an exact target into view and requires actual editor removal',()=>{
 const label=element('Saved');let visible=false;
 label.getBoundingClientRect=()=>visible?{width:50,height:20,top:10,left:10,bottom:30,right:60}:{width:50,height:20,top:-30,left:10,bottom:-10,right:60};
 label.scrollIntoView=()=>{visible=true;};
 assert.equal(domOperation([label],'text','','','Saved').result,false);
 assert.equal(domOperation([label],'scroll').result,true);
 assert.equal(domOperation([label],'text','','','Saved').result,true);
 assert.equal(domOperation([label],'missing').result,false);
 assert.equal(domOperation([],'missing').result,true);
});
test('persistence mock drives UI create, active file, edit, save, disk, close and reopen despite offscreen labels',async()=>{
 const {report,state}=await projectFixture({persistence:true});
 assert.ok(report.scenarios.slice(0,4).every(s=>s.status==='PASS'));
 assert.ok(state.scrolled.includes('active'));
 assert.ok(state.scrolled.includes('dirty'));
 assert.ok(state.scrolled.includes('saved'));
 assert.ok(state.scrolled.includes('closed'));
 assert.equal(state.saved,`PL QA disposable content ${runId}\n`);
 validateSmokeReport(report,runId);
});
for(const [options,reason] of [
 [{lostPersistReadiness:true},'PERSIST_READINESS_LOST'],
 [{filenameInputFails:true},'PERSIST_FILE_NAME_INPUT_FAILED'],
 [{codeCreateFails:true},'PERSIST_CREATE_ACTION_FAILED'],
 [{fileNotListed:true},'PERSIST_FILE_NOT_LISTED'],
 [{editorNotOpen:true},'PERSIST_EDITOR_NOT_OPEN'],
 [{contentInputFails:true},'PERSIST_CONTENT_INPUT_FAILED'],
 [{dirtyMissing:true},'PERSIST_DIRTY_STATE_MISSING'],
 [{saveFails:true},'PERSIST_SAVE_ACTION_FAILED'],
 [{savedMissing:true},'PERSIST_SAVED_STATE_MISSING'],
 [{unsafeCodePath:true},'PERSIST_SCRATCH_PATH_INVALID'],
 [{savedBytesMismatch:true},'PERSIST_SAVED_BYTES_MISMATCH'],
 [{closeFails:true},'PERSIST_CLOSE_ACTION_FAILED'],
 [{editorRemainsAfterClose:true},'PERSIST_EDITOR_NOT_CLOSED'],
 [{closedFileNotListed:true},'PERSIST_CLOSED_FILE_NOT_LISTED'],
 [{reopenFails:true},'PERSIST_REOPEN_ACTION_FAILED'],
 [{reopenContentMismatch:true},'PERSIST_REOPEN_CONTENT_MISMATCH'],
 [{reopenBytesMismatch:true},'PERSIST_REOPEN_BYTES_MISMATCH']
])test('persistence stage fails closed with '+reason,async()=>{
 const {report}=await projectFixture({persistence:true,...options});
 assert.ok(report.scenarios.slice(0,3).every(s=>s.status==='PASS'));
 assert.equal(report.scenarios[3].reason,reason);
 assert.equal(report.scenarios[4].status,'NOT_RUN');
 validateSmokeReport(report,runId);
 assert.equal(publicSmokeReport(report).scenarios[3].reason,reason);
 assert.equal(JSON.stringify(publicSmokeReport(report)).includes('SECRET'),false);
});
test('persistence diagnostics discard raw errors and cannot be attributed to other scenarios',async()=>{
 const {smokeReasons}=require('../dist/smoke-contract');const {persistStage}=require('../dist/smoke');
 for(const reason of smokeReasons.filter(v=>v.startsWith('PERSIST_'))){
  await assert.rejects(persistStage(reason,async()=>{throw new Error('SECRET /host/path');}),e=>e.reason===reason&&!String(e).includes('SECRET'));
  const report=pass();report.status='FAIL';report.scenarios=smokeIds.map((id,i)=>i<3?{id,status:'PASS'}:i===3?{id,status:'FAIL',reason}:{id,status:'NOT_RUN'});
  assert.equal(publicSmokeReport(report).scenarios[3].reason,reason);
  report.scenarios[2]={id:smokeIds[2],status:'FAIL',reason};report.scenarios[3]={id:smokeIds[3],status:'NOT_RUN'};
  assert.throws(()=>validateSmokeReport(report,runId));
 }
});
