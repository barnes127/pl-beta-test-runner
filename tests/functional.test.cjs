const {test}=require('node:test');
const assert=require('node:assert/strict');
const {functionalIds,validateSmokePlan,validateSmokeReport}=require('../dist/smoke-contract');
const {runFunctionalScenarios}=require('../dist/functional');
const {makeRunReport,validateRunReport,renderHtml}=require('../dist/report');
const {lifecycleError}=require('../dist/errors');
const {captureFailedUi,approvedScreenshotSnapshot}=require('../dist/screenshot');
const runId='12345678-1234-4234-8234-123456789abc';
const digest='a'.repeat(64);
const registry={digest,capabilities:[{id:'PL-CORE-ACCESS-001',registryStatus:'complete'},{id:'PL-CORE-SHELL-001',registryStatus:'complete'}]};

test('functional plan is fixed, nonce-bound and never enables evidence-probe screenshots',()=>{
 const plan={version:2,runId,suite:'batch-4-v1',isolationReview:'PENDING',evidenceProbe:false};
 assert.deepEqual(validateSmokePlan(plan,runId),plan);
 for(const invalid of [{...plan,evidenceProbe:true},{...plan,runId:'stale'},{...plan,script:'SECRET'},{...plan,isolationReview:'APPROVED'}])
  assert.throws(()=>validateSmokePlan(invalid,runId));
});
test('backend/action success with absent visible Docs state is a fixed FAIL, never a PASS',async()=>{
 const contents={executeJavaScript:async code=>!code.includes('Docs')};
 const smoke=await runFunctionalScenarios(contents,runId,async()=>{});
 assert.equal(smoke.status,'FAIL');
 assert.equal(smoke.scenarios[0].status,'PASS');
 assert.deepEqual(smoke.scenarios.slice(1).map(s=>s.status),['FAIL','NOT_RUN']);
 assert.equal(smoke.scenarios[1].reason,'FUNC_SHORTCUT_NAV_NOT_VISIBLE');
 assert.ok(smoke.trace.some(t=>t.target==='FUNC_SHORTCUT_NAV_NOT_VISIBLE'&&t.actual==='NOT_OBSERVED'));
 validateSmokeReport(smoke,runId);
 const report=makeRunReport({runId,functional:true,smoke,shutdownComplete:true,cleanupVerified:true,build:{sourceDigest:digest,assetDigest:digest,desktopDigest:digest,snapshotDigest:digest,provenance:'NOT_PROVEN'},appVersion:'0.0.1',registry},undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 assert.equal(report.overall,'FAIL');
 assert.equal(report.executionMode,'ISOLATED_FUNCTIONAL');
 assert.equal(report.failure.reasonCode,'FUNC_SHORTCUT_NAV_NOT_VISIBLE');
 assert.equal(report.evidence.reproduction.command,'pnpm qa functional');
 assert.notEqual(report.evidence.screenshot.status,'CAPTURED');
 assert.equal(report.coverage.applicableBehaviorDenominator,null);
 assert.deepEqual(report.coverage.scenarios[0].capabilityIds,['PL-CORE-ACCESS-001']);
 assert.deepEqual(report.coverage.scenarios[1].capabilityIds,['PL-CORE-SHELL-001']);
 validateRunReport(report);
 const html=renderHtml(report);
 assert.ok(html.includes('FUNC_SHORTCUT_NAV_NOT_VISIBLE'));
 assert.ok(!html.includes('<img'));
 const tampered=structuredClone(report);tampered.scenarios[1].result='PASS';
 assert.throws(()=>validateRunReport(tampered));
 const forged=structuredClone(report);forged.evidence.screenshot.status='CAPTURED';
 assert.throws(()=>validateRunReport(forged));
});
test('functional report refuses scenario substitution and unapproved screenshot capture',()=>{
 const scenarios=functionalIds.map(id=>({id,status:'PASS',durationMs:1}));
 const report={version:2,suite:'batch-4-v1',runId,status:'PASS',scenarios};
 validateSmokeReport(report,runId);
 assert.throws(()=>validateSmokeReport({...report,scenarios:[...scenarios].reverse()},runId));
 assert.throws(()=>validateSmokeReport({...report,scenarios:[{...scenarios[0],id:'PL-QA-BOOT-001'},...scenarios.slice(1)]},runId));
});
test('functional failure cannot invoke the real-window screenshot API',async()=>{
 let called=false;
 const smoke={version:2,suite:'batch-4-v1',runId,status:'FAIL',scenarios:[{id:functionalIds[0],status:'FAIL',reason:'FUNC_THEME_NOT_VISIBLE'},...functionalIds.slice(1).map(id=>({id,status:'NOT_RUN'}))]};
 const window={capturePage:async()=>{called=true;throw new Error('UNSAFE');}};
 const result=await captureFailedUi({},window,smoke,runId,async()=>{},approvedScreenshotSnapshot,()=>false);
 assert.equal(result.record.status,'OMITTED_SAFETY_GATE');
 assert.equal(result.record.reason,'CAPTURE_SCOPE_UNAPPROVED');
 assert.equal(called,false);
});
