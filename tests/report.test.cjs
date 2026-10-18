const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {smokeIds}=require('../dist/smoke-contract');
const {lifecycleError}=require('../dist/errors');
const {makeRunReport,validateRunReport,renderHtml,escapeHtml,writeRunReport,reviewRunReport}=require('../dist/report');
const runId='12345678-1234-4234-8234-123456789abc';
const digest='a'.repeat(64);
const build={sourceDigest:digest,assetDigest:digest,desktopDigest:digest,snapshotDigest:digest,provenance:'NOT_PROVEN'};
const trace=smokeIds.flatMap((scenarioId,index)=>[{scenarioId,kind:'SCENARIO',outcome:'START',elapsedMs:index*3},{scenarioId,kind:'ASSERTION',outcome:'PASS',elapsedMs:index*3+1,target:'PROJECT_CONTEXT',expected:'VISIBLE_ELEMENT',actual:'OBSERVED'},{scenarioId,kind:'SCENARIO',outcome:'PASS',elapsedMs:index*3+2}]);
const smoke=()=>({version:1,runId,status:'PASS',scenarios:smokeIds.map(id=>({id,status:'PASS',durationMs:3})),trace});
const registry={digest,capabilities:[{id:'PL-CODE-FILE-001',registryStatus:'complete'},{id:'PL-CODE-FILE-002',registryStatus:'complete'},{id:'PL-CODE-FILE-003',registryStatus:'complete'},{id:'PL-CORE-PROJECT-001',registryStatus:'partial'},{id:'PL-CORE-SHELL-001',registryStatus:'complete'}]};
const observed=(changes={})=>({runId,build,smoke:smoke(),shutdownComplete:true,cleanupVerified:true,appVersion:'0.0.1',registry,...changes});
function failingSmoke(){const failed=smoke();failed.status='FAIL';failed.scenarios[3]={id:smokeIds[3],status:'FAIL',reason:'PERSIST_SAVED_BYTES_MISMATCH',durationMs:9};failed.scenarios[4]={id:smokeIds[4],status:'NOT_RUN',durationMs:0};failed.trace=trace.filter(e=>e.scenarioId!==smokeIds[4]).map(e=>e.scenarioId===smokeIds[3]?(e.kind==='ASSERTION'?{...e,outcome:'FAIL',target:'PERSIST_SAVED_BYTES_MISMATCH',expected:'EXACT_FIXTURE_BYTES',actual:'NOT_OBSERVED'}:e.kind==='SCENARIO'&&e.outcome==='PASS'?{...e,outcome:'FAIL'}:e):e);return failed;}
const success={status:'LIFECYCLE_VERIFIED'};

test('complete smoke plus verified shutdown and cleanup produces structured PASS and standalone HTML',()=>{
 const report=makeRunReport(observed(),success,undefined,'2026-10-17T12:00:00.000Z');
 assert.equal(report.overall,'PASS');assert.equal(report.scenarios.length,5);
 assert.ok(report.scenarios.every(s=>s.result==='PASS'&&s.durationMs===3));
 assert.equal(report.lifecycle.shutdown,'VERIFIED');assert.equal(report.lifecycle.cleanup,'VERIFIED');
 assert.equal(report.environment.isolationProof,'RUNTIME_VERIFIED');assert.equal(report.isolationReview,'PENDING');
 assert.equal(report.appBuild.snapshotDigest,digest);assert.equal(report.evidence.trace.length,15);
 assert.equal(report.appVersion,'0.0.1');assert.equal(report.coverage.registry,'INSPECTED_CHECKOUT');
 assert.equal(report.coverage.applicableBehaviorDenominator,null);
 assert.equal(report.coverage.scenarios[2].mapping,'UNMAPPED');
 const html=renderHtml(report);assert.ok(html.startsWith('<!doctype html>'));
 assert.ok(html.includes('Formal isolation review: PENDING'));
 assert.ok(html.includes('Automated isolation proof: RUNTIME_VERIFIED'));
 assert.ok(html.includes('Target / failing step')&&html.includes('PROJECT_CONTEXT'));
 assert.ok(html.includes('Registry inventory')&&html.includes('NOT_COVERED'));
 assert.ok(!html.includes('http://')&&!html.includes('https://'));
});
test('scenario failure after verified cleanup is FAIL with fixed reproduction and no raw details',()=>{
 const failed=failingSmoke();
 const report=makeRunReport(observed({smoke:failed}),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 assert.equal(report.overall,'FAIL');assert.equal(report.failure.reasonCode,'PERSIST_SAVED_BYTES_MISMATCH');
 assert.equal(report.failure.category,'PERSISTENCE');assert.equal(report.evidence.reproduction.command,'pnpm qa run');
 assert.equal(report.evidence.reproduction.scenarioId,smokeIds[3]);
 assert.equal(report.scenarios[4].result,'NOT_RUN');assert.equal(report.evidence.screenshot,'OMITTED_CONTENT_SAFETY_UNVERIFIED');
 assert.ok(!JSON.stringify(report).includes('/home/'));
});
test('a passing smoke never overrides incomplete shutdown, cleanup, build or trace',()=>{
 for(const [changes,expected] of [
  [{shutdownComplete:false,retained:true},'BLOCKED'],[{cleanupVerified:false,retained:true},'BLOCKED'],
  [{build:undefined},'BLOCKED'],[{registry:undefined},'BLOCKED'],[{appVersion:undefined},'BLOCKED'],[{smoke:{...smoke(),trace:undefined}},'BLOCKED']
 ]){
  const report=makeRunReport(observed(changes),success,undefined);
  assert.equal(report.overall,expected);
  assert.ok(report.failure);assert.notEqual(report.lifecycle.cleanup==='RETAINED_FOR_REVIEW',report.lifecycle.cleanup==='VERIFIED');
 }
 const noResult=makeRunReport({},undefined,new Error('SECRET token /home/private'));
 assert.equal(noResult.overall,'BLOCKED');assert.equal(noResult.failure.reasonCode,'INTERNAL');
 assert.ok(noResult.scenarios.every(s=>s.result==='NOT_RUN'));
 assert.ok(!JSON.stringify(noResult).includes('SECRET'));
});
test('report validator rejects malformed results, secrets, forged review and contradictory success',()=>{
 const good=makeRunReport(observed(),success,undefined);
 for(const mutate of [
  v=>v.token='SECRET',v=>v.scenarios[0].name='<script>SECRET</script>',
  v=>v.scenarios[0].reasonCode='SECRET',v=>v.appBuild.sourceDigest='SECRET',
  v=>v.evidence.trace[0].selector='SECRET',v=>v.isolationReview='APPROVED',
  v=>v.evidence.trace[1].actual='UNVERIFIED',
  v=>v.evidence.screenshot='artifacts/SECRET.png',v=>v.coverage.capabilities[0].token='SECRET',
  v=>v.coverage.scenarios[2].mapping='VERIFIED',v=>v.coverage.applicableBehaviorDenominator=94,
  v=>v.lifecycle.cleanup='UNVERIFIED',v=>v.environment.isolationProof='NOT_VERIFIED',
  v=>v.scenarios[0].durationMs=-1,v=>v.evidence.trace=[],v=>v.runId='../../SECRET'
 ]){
  const bad=structuredClone(good);mutate(bad);
  assert.throws(()=>validateRunReport(bad));assert.throws(()=>renderHtml(bad));
 }
 assert.equal(escapeHtml(`<script title="x&y">'`),'&lt;script title=&quot;x&amp;y&quot;&gt;&#39;');
 const failedSmoke=failingSmoke();
 const failed=makeRunReport(observed({smoke:failedSmoke}),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 failed.evidence.reproduction.actions=[failed.evidence.reproduction.actions.join('\0')];
 assert.throws(()=>validateRunReport(failed));
});
test('a controlled persistence mismatch is diagnosable from generated artifacts alone',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-report-failure-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const runner=path.join(base,'runner');await fs.mkdir(runner);
 const broken=failingSmoke();broken.scenarios[3].reason='PERSIST_SAVED_BYTES_MISMATCH';
 const report=makeRunReport(observed({smoke:broken}),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 const files=await writeRunReport(runner,report);
 const review=await reviewRunReport(runner,files.json);
 assert.equal(review.overall,'FAIL');assert.equal(review.failedScenario,'PL-QA-PERSIST-001');
 assert.deepEqual(review.failedStep,{target:'PERSIST_SAVED_BYTES_MISMATCH',expected:'EXACT_FIXTURE_BYTES',actual:'NOT_OBSERVED'});
 assert.equal(review.lifecycle.shutdown,'VERIFIED');assert.equal(review.lifecycle.cleanup,'VERIFIED');
 const html=await fs.readFile(path.join(runner,files.html),'utf8');
 assert.ok(html.includes('EXACT_FIXTURE_BYTES')&&html.includes('NOT_OBSERVED')&&html.includes('pnpm qa run'));
});
test('reports stay under a marked private runner artifact root and refuse aliases or adoption',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-report-test-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const runner=path.join(base,'pl-beta-test-runner');await fs.mkdir(runner);
 const report=makeRunReport(observed(),success,undefined);
 const files=await writeRunReport(runner,report);
 assert.equal(files.json,`artifacts/reports/${runId}/report.json`);
 assert.equal(files.html,`artifacts/reports/${runId}/report.html`);
 assert.equal(JSON.parse(await fs.readFile(path.join(runner,files.json),'utf8')).overall,'PASS');
 assert.ok((await fs.readFile(path.join(runner,files.html),'utf8')).includes('<!doctype html>'));
 const review=await reviewRunReport(runner,files.json);
 assert.equal(review.status,'REPORT_VERIFIED');assert.equal(review.overall,'PASS');
 assert.equal(review.isolationReview,'PENDING');
 const marker=path.join(runner,'artifacts/reports/.owner');
 const backup=marker+'.backup';
 const outsideMarker=path.join(base,'outside-marker');await fs.writeFile(outsideMarker,'pl-beta-runner-reports-v1\n');
 await fs.rename(marker,backup);await fs.symlink(outsideMarker,marker);
 await assert.rejects(reviewRunReport(runner,files.json));
 await assert.rejects(writeRunReport(runner,{...report,runId:'52345678-1234-4234-8234-123456789abc'}));
 await fs.unlink(marker);await fs.rename(backup,marker);
 assert.equal((await fs.stat(path.join(runner,'artifacts/reports'))).mode&0o077,0);
 assert.equal((await fs.stat(path.join(runner,files.json))).mode&0o077,0);
 await assert.rejects(writeRunReport(runner,report));
 const unmarked=path.join(base,'unmarked');await fs.mkdir(path.join(unmarked,'artifacts','reports'),{recursive:true});
 await assert.rejects(writeRunReport(unmarked,{...report,runId:'22345678-1234-4234-8234-123456789abc'}));
 const outside=path.join(base,'outside');await fs.mkdir(outside);
 const linked=path.join(base,'linked');await fs.mkdir(linked);await fs.symlink(outside,path.join(linked,'artifacts'));
 await assert.rejects(writeRunReport(linked,{...report,runId:'32345678-1234-4234-8234-123456789abc'}));
 assert.deepEqual(await fs.readdir(outside),[]);
 const alias=path.join(base,'alias');await fs.symlink(runner,alias);
 await assert.rejects(writeRunReport(alias,{...report,runId:'42345678-1234-4234-8234-123456789abc'}));
 await assert.rejects(writeRunReport(runner,{...report,runId:'../../SECRET'}));
 await assert.rejects(reviewRunReport(runner,'../../SECRET/report.json'));
 await fs.appendFile(path.join(runner,files.html),'SECRET');
 await assert.rejects(reviewRunReport(runner,files.json));
});
