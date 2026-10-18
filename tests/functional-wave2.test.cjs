const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {wave2Ids,validateSmokePlan,validateSmokeReport}=require('../dist/smoke-contract');
const {runWave2Scenarios,diagnosticsExportStatusCheck,healthResultState}=require('../dist/functional-wave2');
const processes=require('../dist/processes');
const {makeRunReport,validateRunReport,renderHtml,writeRunReport,reviewRunReport}=require('../dist/report');
const {lifecycleError}=require('../dist/errors');
const runId='12345678-1234-4234-8234-123456789abc';
const digest='a'.repeat(64);
const registry={digest,capabilities:[{id:'PL-CORE-DIAG-001',registryStatus:'complete'},{id:'PL-CORE-SHELL-001',registryStatus:'complete'}]};
const trace=wave2Ids.flatMap((scenarioId,index)=>[{scenarioId,kind:'SCENARIO',outcome:'START',elapsedMs:index*3},{scenarioId,kind:'ASSERTION',outcome:'PASS',elapsedMs:index*3+1,target:'STATUS_BAR',expected:'VISIBLE_ELEMENT',actual:'OBSERVED'},{scenarioId,kind:'SCENARIO',outcome:'PASS',elapsedMs:index*3+2}]);
const passed=()=>({version:2,suite:'batch-4-v2',runId,status:'PASS',scenarios:wave2Ids.map(id=>({id,status:'PASS',durationMs:1})),trace:structuredClone(trace)});
const build={sourceDigest:digest,assetDigest:digest,desktopDigest:digest,snapshotDigest:digest,provenance:'NOT_PROVEN'};
const observation=(smoke,changes={})=>({runId,wave2:true,smoke,shutdownComplete:true,cleanupVerified:true,build,appVersion:'0.0.1',registry,...changes});

test('Wave 2 plan and ordered result are fixed; no evidence probe or foreign scenario',()=>{
 const plan={version:2,runId,suite:'batch-4-v2',isolationReview:'PENDING',evidenceProbe:false};
 assert.deepEqual(validateSmokePlan(plan,runId),plan);
 for(const bad of [{...plan,evidenceProbe:true},{...plan,runId:'stale'},{...plan,selector:'SECRET'},{...plan,isolationReview:'APPROVED'}]) assert.throws(()=>validateSmokePlan(bad,runId));
 assert.deepEqual(validateSmokeReport(passed(),runId),passed());
 const mixed=passed();mixed.scenarios[0].id='PL-QA-FUNC-KEY-001';assert.throws(()=>validateSmokeReport(mixed,runId));
});
test('Wave 2 action success with absent UI cannot validate as PASS',async t=>{
 const falsePositive=passed();
 falsePositive.trace[1]={...falsePositive.trace[1],outcome:'FAIL',actual:'NOT_OBSERVED'};
 assert.throws(()=>validateSmokeReport(falsePositive,runId));
 const failed=passed();failed.status='FAIL';
 failed.scenarios[1]={id:wave2Ids[1],status:'FAIL',reason:'W2_DIAG_EXPORT_UI_MISSING',durationMs:1};
 failed.scenarios[2]={id:wave2Ids[2],status:'NOT_RUN',durationMs:0};
 failed.trace=trace.filter(e=>e.scenarioId!==wave2Ids[2]).map(e=>e.scenarioId===wave2Ids[1] ? e.kind==='ASSERTION'?{...e,target:'W2_DIAG_EXPORT_UI_MISSING',expected:'VISIBLE_ELEMENT',outcome:'FAIL',actual:'NOT_OBSERVED'}:e.outcome==='PASS'?{...e,outcome:'FAIL'}:e : e);
 validateSmokeReport(failed,runId);
 const report=makeRunReport(observation(failed),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 assert.equal(report.overall,'FAIL');
 assert.equal(report.failure.reasonCode,'W2_DIAG_EXPORT_UI_MISSING');
 assert.equal(report.failure.category,'UI');
 assert.equal(report.evidence.reproduction.command,'pnpm qa functional-wave2');
 assert.notEqual(report.evidence.screenshot.status,'CAPTURED');
 assert.equal(report.coverage.applicableBehaviorDenominator,null);
 assert.ok(renderHtml(report).includes('W2_DIAG_EXPORT_UI_MISSING'));
 validateRunReport(report);
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-w2-report-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const runner=path.join(base,'runner');await fs.mkdir(runner);
 const files=await writeRunReport(runner,report);
 const reviewed=await reviewRunReport(runner,files.json);
 assert.equal(reviewed.overall,'FAIL');
 assert.equal(reviewed.failedScenario,wave2Ids[1]);
 assert.equal(reviewed.failedStep.target,'W2_DIAG_EXPORT_UI_MISSING');
 assert.equal(reviewed.lifecycle.cleanup,'VERIFIED');
 const wrong=structuredClone(report);wrong.executionMode='ISOLATED_FUNCTIONAL';assert.throws(()=>validateRunReport(wrong));
});
test('Wave 2 PASS still requires verified cleanup and exact diagnostics mapping',()=>{
 const good=makeRunReport(observation(passed()),{status:'LIFECYCLE_VERIFIED'},undefined);
 assert.equal(good.overall,'PASS');
 assert.deepEqual(good.coverage.scenarios[1].capabilityIds,['PL-CORE-DIAG-001']);
 assert.equal(good.coverage.capabilities.find(c=>c.id==='PL-CORE-DIAG-001').coverage,'VALIDATED_BEHAVIOR');
 assert.equal(good.evidence.screenshot.status,'OMITTED_NOT_APPLICABLE');
 const blocked=makeRunReport(observation(passed(),{cleanupVerified:false,retained:true}),{status:'LIFECYCLE_VERIFIED'},undefined);
 assert.equal(blocked.overall,'BLOCKED');
 assert.equal(blocked.lifecycle.cleanup,'RETAINED_FOR_REVIEW');
});
test('Wave 2 readiness failure stops before filesystem or UI action',async()=>{
 let called=false;
 const result=await runWave2Scenarios({executeJavaScript:async()=>{called=true;return true;}},runId,async()=>{throw new Error('SECRET');});
 assert.equal(result.status,'FAIL');
 assert.equal(result.scenarios[0].reason,'W2_READINESS_LOST');
 assert.deepEqual(result.scenarios.slice(1).map(s=>s.status),['NOT_RUN','NOT_RUN']);
 assert.equal(called,false);
 assert.ok(!JSON.stringify(result).includes('SECRET'));
 validateSmokeReport(result,runId);
});
test('diagnostics confirmation predicate is executable and rejects arbitrary status content',()=>{
 const check=new Function('document',`return ${diagnosticsExportStatusCheck}`);
 const page=text=>({querySelectorAll:()=>[{textContent:text}]});
 assert.equal(check(page('Diagnostics exported: /scratch/home/.plcs/diagnostic-exports/pl-diagnostics-2026-10-17T12-00-00-000Z-abcdef12.json')),true);
 for(const unsafe of ['Diagnostics exported: /home/user/private.json','Export failed: SECRET','Diagnostics exported: /scratch/home/.plcs/diagnostic-exports/other.json']) assert.equal(check(page(unsafe)),false);
});
test('all mocked UI actions succeed but missing private export file still fails',async()=>{
 const absent=mock.method(fs,'lstat',async()=>{const error=new Error();error.code='ENOENT';throw error;});
 const empty=mock.method(fs,'readdir',async()=>[]);
 try {
  const result=await runWave2Scenarios({executeJavaScript:async code=>code.includes('function healthResultState')?'READY':true},runId,async()=>{});
  assert.equal(result.status,'FAIL');
  assert.deepEqual(result.scenarios.map(s=>s.status),['PASS','FAIL','NOT_RUN']);
  assert.equal(result.scenarios[1].reason,'W2_DIAG_EXPORT_FILE_INVALID');
  assert.ok(result.trace.some(t=>t.target==='DIAGNOSTIC_FILE'&&t.actual==='NOT_OBSERVED'));
  validateSmokeReport(result,runId);
 }finally{absent.mock.restore();empty.mock.restore();}
});
test('Health state recognizes source-defined unknown and loading without accepting errors',()=>{
 const summary=(severity,strong=true)=>({getAttribute:()=>severity,querySelector:selector=>selector==='strong'&&strong?{}:null});
 const inspect=(severity,opts={})=>{
  const rail={querySelector:selector=>selector==='[role="alert"]'&&opts.alert?{}:selector==='.healthContextSummary'&&severity!==null?summary(severity,opts.strong!==false):selector==='.healthContextEmpty'&&opts.loading?{textContent:'Checking suite health...'}:null};
  const old=global.document;global.document={querySelector:selector=>selector==='.healthContextRail'&&opts.rail!==false?rail:null};
  try{return healthResultState();}finally{global.document=old;}
 };
 assert.equal(inspect(null,{loading:true}),'LOADING');
 assert.equal(inspect('unknown'),'READY');
 assert.equal(inspect('healthy'),'READY');
 assert.equal(inspect('warning'),'READY');
 assert.equal(inspect('error'),'UNAVAILABLE');
 assert.equal(inspect('unavailable'),'UNAVAILABLE');
 assert.equal(inspect('unknown',{alert:true}),'ERROR');
 assert.equal(inspect('mystery'),'INVALID');
 assert.equal(inspect('healthy',{strong:false}),'INVALID');
 assert.equal(inspect(null),'MISSING');
 assert.equal(inspect(null,{rail:false}),'MISSING');
});
test('Health loading may become ready, while missing and error states fail before export',async()=>{
 const wait=mock.method(processes,'waitFor',async predicate=>{for(let i=0;i<3;i++)if(await predicate())return;throw new Error('bounded timeout');});
 const absent=mock.method(fs,'lstat',async()=>{const error=new Error();error.code='ENOENT';throw error;});
 const empty=mock.method(fs,'readdir',async()=>[]);
 try {
  for(const [states,reason] of [[['LOADING','READY'],'W2_DIAG_EXPORT_FILE_INVALID'],[['MISSING'],'W2_HEALTH_RESULT_MISSING'],[['ERROR'],'W2_HEALTH_SERVICE_ERROR'],[['UNAVAILABLE'],'W2_HEALTH_RESULT_UNAVAILABLE'],[['LOADING'],'W2_HEALTH_LOADING_TIMEOUT']]) {
   let healthCalls=0;let exportAction=false;
   const result=await runWave2Scenarios({executeJavaScript:async code=>{
    if(code.includes('function healthResultState'))return states[Math.min(healthCalls++,states.length-1)];
    if(code.includes('Export Diagnostics'))exportAction=true;
    return true;
   }},runId,async()=>{});
   assert.equal(result.scenarios[1].reason,reason);
   assert.deepEqual(result.scenarios.map(s=>s.status),['PASS','FAIL','NOT_RUN']);
   assert.equal(exportAction,reason==='W2_DIAG_EXPORT_FILE_INVALID');
   validateSmokeReport(result,runId);
  }
 }finally{wait.mock.restore();absent.mock.restore();empty.mock.restore();}
});
