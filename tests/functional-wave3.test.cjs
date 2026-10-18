const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const processes=require('../dist/processes');
const {wave3Ids,validateSmokePlan,validateSmokeReport}=require('../dist/smoke-contract');
const {runWave3Scenarios}=require('../dist/functional-wave3');
const {makeRunReport,validateRunReport,writeRunReport,reviewRunReport}=require('../dist/report');
const {lifecycleError}=require('../dist/errors');
const {omittedScreenshot}=require('../dist/screenshot');
const runId='12345678-1234-4234-8234-123456789abc';
const digest='a'.repeat(64);
const registry={digest,capabilities:[{id:'PL-CORE-SHELL-001',registryStatus:'complete'}]};
const build={sourceDigest:digest,assetDigest:digest,desktopDigest:digest,snapshotDigest:digest,provenance:'NOT_PROVEN'};
const observation=(smoke,extra={})=>({runId,wave3:true,smoke,shutdownComplete:true,cleanupVerified:true,build,appVersion:'0.0.1',registry,...extra});
async function fixture(fn){
 const absent=mock.method(fs,'lstat',async()=>{const error=new Error();error.code='ENOENT';throw error;});
 const wait=mock.method(processes,'waitFor',async predicate=>{for(let i=0;i<2;i++)if(await predicate())return;throw new Error('bounded timeout');});
 try{return await fn();}finally{absent.mock.restore();wait.mock.restore();}
}

test('Wave 3 permit and result accept only the fixed nonce-bound layout scenario',()=>{
 const plan={version:2,runId,suite:'batch-4-v3',isolationReview:'PENDING',evidenceProbe:false};
 assert.deepEqual(validateSmokePlan(plan,runId),plan);
 for(const bad of [{...plan,evidenceProbe:true},{...plan,runId:'stale'},{...plan,selector:'SECRET'},{...plan,isolationReview:'APPROVED'}]) assert.throws(()=>validateSmokePlan(bad,runId));
 const smoke={version:2,suite:'batch-4-v3',runId,status:'PASS',scenarios:[{id:wave3Ids[0],status:'PASS',durationMs:1}]};
 validateSmokeReport(smoke,runId);
 assert.throws(()=>validateSmokeReport({...smoke,scenarios:[{...smoke.scenarios[0],id:'PL-QA-FUNC-SETTINGS-001'}]},runId));
 assert.throws(()=>validateSmokeReport({...smoke,suite:'batch-4-v2'},runId));
});
test('fixed layout workflow records visible and private saved-state assertions',async()=>fixture(async()=>{
 const smoke=await runWave3Scenarios({executeJavaScript:async()=>true},runId,async()=>{});
 assert.equal(smoke.status,'PASS');
 assert.deepEqual(smoke.scenarios.map(s=>s.status),['PASS']);
 assert.ok(smoke.trace.some(e=>e.target==='LAYOUT_STATE'&&e.outcome==='PASS'));
 assert.ok(smoke.trace.filter(e=>e.target==='LAYOUT_PERSISTENCE'&&e.outcome==='PASS').length===2);
 validateSmokeReport(smoke,runId);
 const report=makeRunReport(observation(smoke),{status:'LIFECYCLE_VERIFIED'},undefined);
 assert.equal(report.overall,'PASS');
 assert.equal(report.executionMode,'ISOLATED_FUNCTIONAL_WAVE3');
 assert.deepEqual(report.coverage.scenarios[0].capabilityIds,['PL-CORE-SHELL-001']);
 assert.equal(report.evidence.screenshot.status,'OMITTED_NOT_APPLICABLE');
 validateRunReport(report);
}));
test('visible UI success with absent private saved state is FAIL and reviewable',async t=>{
 const smoke=await fixture(()=>runWave3Scenarios({executeJavaScript:async code=>!code.includes('=== true')},runId,async()=>{}));
 assert.equal(smoke.status,'FAIL');
 assert.equal(smoke.scenarios[0].reason,'W3_RESET_STATE_NOT_PERSISTED');
 validateSmokeReport(smoke,runId);
 const report=makeRunReport(observation(smoke,{screenshot:{record:omittedScreenshot(runId,wave3Ids[0],'OMITTED_SAFETY_GATE','CAPTURE_SCOPE_UNAPPROVED')}}),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 assert.equal(report.overall,'FAIL');
 assert.equal(report.failure.reasonCode,'W3_RESET_STATE_NOT_PERSISTED');
 assert.equal(report.evidence.reproduction.command,'pnpm qa functional-wave3');
 assert.equal(report.evidence.screenshot.status,'OMITTED_SAFETY_GATE');
 validateRunReport(report);
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-w3-report-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'runner');await fs.mkdir(root);
 const files=await writeRunReport(root,report);
 const reviewed=await reviewRunReport(root,files.json);
 assert.equal(reviewed.overall,'FAIL');
 assert.equal(reviewed.failedStep.target,'LAYOUT_PERSISTENCE');
 assert.equal(reviewed.failure.reasonCode,'W3_RESET_STATE_NOT_PERSISTED');
 assert.equal(reviewed.lifecycle.cleanup,'VERIFIED');
 const blocked=makeRunReport(observation(smoke,{cleanupVerified:false,retained:true}),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 assert.equal(blocked.overall,'BLOCKED');
 assert.equal(blocked.lifecycle.cleanup,'RETAINED_FOR_REVIEW');
 const forged=structuredClone(report);forged.evidence.screenshot.status='CAPTURED';assert.throws(()=>validateRunReport(forged));
});
test('missing visible update and uncertain readiness cannot become PASS',async()=>fixture(async()=>{
 const absent=await runWave3Scenarios({executeJavaScript:async code=>!code.includes(')("missing",')},runId,async()=>{});
 assert.equal(absent.status,'FAIL');
 assert.equal(absent.scenarios[0].reason,'W3_PANEL_DID_NOT_CLOSE');
 assert.ok(absent.trace.some(e=>e.target==='LAYOUT_STATE'&&e.outcome==='FAIL'));
 const ownership=await runWave3Scenarios({executeJavaScript:async()=>true},runId,async()=>{throw new Error('SECRET');});
 assert.equal(ownership.status,'FAIL');
 assert.equal(ownership.scenarios[0].reason,'W3_READINESS_LOST');
 assert.ok(!JSON.stringify(ownership).includes('SECRET'));
}));
test('reset status is scrolled into view before exact text is required',async()=>fixture(async()=>{
 const operations=[];
 const smoke=await runWave3Scenarios({executeJavaScript:async code=>{
  operations.push(code);
  return !code.includes(')("text",".statusLeft > span:first-child"');
 }},runId,async()=>{});
 assert.equal(smoke.status,'FAIL');
 assert.equal(smoke.scenarios[0].reason,'W3_RESET_STATUS_MISSING');
 const scroll=operations.findIndex(code=>code.includes(')("scroll",".statusLeft > span:first-child"'));
 const text=operations.findIndex(code=>code.includes(')("text",".statusLeft > span:first-child"'));
 assert.ok(scroll>=0&&text>scroll);
 assert.ok(smoke.trace.some(e=>e.target==='STATUS_BAR'&&e.expected==='VISIBLE_ELEMENT'&&e.outcome==='PASS'));
 assert.ok(smoke.trace.some(e=>e.target==='STATUS_BAR'&&e.expected==='EXACT_FIXTURE_TEXT'&&e.outcome==='FAIL'));
 const hidden=await runWave3Scenarios({executeJavaScript:async code=>!code.includes(')("scroll",".statusLeft > span:first-child"')},runId,async()=>{});
 assert.equal(hidden.scenarios[0].reason,'W3_RESET_STATUS_NOT_VISIBLE');
 assert.ok(!hidden.trace.some(e=>e.target==='STATUS_BAR'&&e.expected==='EXACT_FIXTURE_TEXT'));
 validateSmokeReport(hidden,runId);
 const report=makeRunReport(observation(hidden),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 assert.equal(report.failure.reasonCode,'W3_RESET_STATUS_NOT_VISIBLE');
 validateRunReport(report);
}));
