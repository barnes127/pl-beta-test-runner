const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {smokeIds}=require('../dist/smoke-contract');
const {lifecycleError}=require('../dist/errors');
const {makeRunReport,validateRunReport,renderHtml,escapeHtml,writeRunReport}=require('../dist/report');
const runId='12345678-1234-4234-8234-123456789abc';
const digest='a'.repeat(64);
const build={sourceDigest:digest,assetDigest:digest,desktopDigest:digest,snapshotDigest:digest,provenance:'NOT_PROVEN'};
const trace=smokeIds.flatMap((scenarioId,index)=>[{scenarioId,kind:'SCENARIO',outcome:'START',elapsedMs:index*2},{scenarioId,kind:'SCENARIO',outcome:'PASS',elapsedMs:index*2+1}]);
const smoke=()=>({version:1,runId,status:'PASS',scenarios:smokeIds.map(id=>({id,status:'PASS',durationMs:3})),trace});
const observed=(changes={})=>({runId,build,smoke:smoke(),shutdownComplete:true,cleanupVerified:true,...changes});
const success={status:'LIFECYCLE_VERIFIED'};

test('complete smoke plus verified shutdown and cleanup produces structured PASS and standalone HTML',()=>{
 const report=makeRunReport(observed(),success,undefined,'2026-10-17T12:00:00.000Z');
 assert.equal(report.overall,'PASS');assert.equal(report.scenarios.length,5);
 assert.ok(report.scenarios.every(s=>s.result==='PASS'&&s.durationMs===3));
 assert.equal(report.lifecycle.shutdown,'VERIFIED');assert.equal(report.lifecycle.cleanup,'VERIFIED');
 assert.equal(report.environment.isolationProof,'RUNTIME_VERIFIED');assert.equal(report.isolationReview,'PENDING');
 assert.equal(report.appBuild.snapshotDigest,digest);assert.equal(report.evidence.trace.length,10);
 const html=renderHtml(report);assert.ok(html.startsWith('<!doctype html>'));
 assert.ok(html.includes('Formal isolation review: PENDING'));
 assert.ok(html.includes('Automated isolation proof: RUNTIME_VERIFIED'));
 assert.ok(!html.includes('http://')&&!html.includes('https://'));
});
test('scenario failure after verified cleanup is FAIL with fixed reproduction and no raw details',()=>{
 const failed=smoke();failed.status='FAIL';failed.scenarios[3]={id:smokeIds[3],status:'FAIL',reason:'PERSIST_SAVED_BYTES_MISMATCH',durationMs:9};failed.scenarios[4]={id:smokeIds[4],status:'NOT_RUN',durationMs:0};
 failed.trace=trace.filter(e=>e.scenarioId!==smokeIds[4]).map(e=>e.scenarioId===smokeIds[3]&&e.outcome==='PASS'?{...e,outcome:'FAIL'}:e);
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
  [{build:undefined},'BLOCKED'],[{smoke:{...smoke(),trace:undefined}},'BLOCKED']
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
  v=>v.lifecycle.cleanup='UNVERIFIED',v=>v.environment.isolationProof='NOT_VERIFIED',
  v=>v.scenarios[0].durationMs=-1,v=>v.evidence.trace=[],v=>v.runId='../../SECRET'
 ]){
  const bad=structuredClone(good);mutate(bad);
  assert.throws(()=>validateRunReport(bad));assert.throws(()=>renderHtml(bad));
 }
 assert.equal(escapeHtml(`<script title="x&y">'`),'&lt;script title=&quot;x&amp;y&quot;&gt;&#39;');
 const failedSmoke=smoke();failedSmoke.status='FAIL';failedSmoke.scenarios[3]={id:smokeIds[3],status:'FAIL',reason:'PERSIST_SAVED_BYTES_MISMATCH',durationMs:9};failedSmoke.scenarios[4]={id:smokeIds[4],status:'NOT_RUN',durationMs:0};
 failedSmoke.trace=trace.filter(e=>e.scenarioId!==smokeIds[4]).map(e=>e.scenarioId===smokeIds[3]&&e.outcome==='PASS'?{...e,outcome:'FAIL'}:e);
 const failed=makeRunReport(observed({smoke:failedSmoke}),undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 failed.evidence.reproduction.actions=[failed.evidence.reproduction.actions.join('\0')];
 assert.throws(()=>validateRunReport(failed));
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
});
