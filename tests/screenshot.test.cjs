const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const zlib=require('node:zlib');
const {captureFailedUi,approvedScreenshotSnapshot,validatePng,screenshotCaptured,validateScreenshotTransfer,syntheticPageCheck,verifySyntheticFixtures}=require('../dist/screenshot');
const {smokeIds}=require('../dist/smoke-contract');
const {makeRunReport,writeRunReport,reviewRunReport,renderHtml}=require('../dist/report');
const {lifecycleError}=require('../dist/errors');
const runId='12345678-1234-4234-8234-123456789abc';
function crc(bytes){let value=-1;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^(value&1?0xedb88320:0);}return(value^-1)>>>0;}
function chunk(type,data){const name=Buffer.from(type);const length=Buffer.alloc(4);length.writeUInt32BE(data.length);const check=Buffer.alloc(4);check.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,check]);}
function png(width=1,height=1){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const raw=Buffer.alloc((1+width*4)*height);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function failedSmoke(){return {version:1,runId,status:'FAIL',scenarios:[{id:smokeIds[0],status:'FAIL',reason:'BOOT_EVIDENCE_PROBE_CONTEXT_MISMATCH',durationMs:4},...smokeIds.slice(1).map(id=>({id,status:'NOT_RUN',durationMs:0}))],trace:[{scenarioId:smokeIds[0],kind:'SCENARIO',outcome:'START',elapsedMs:0},{scenarioId:smokeIds[0],kind:'ASSERTION',outcome:'FAIL',elapsedMs:2,target:'BOOT_EVIDENCE_PROBE_CONTEXT_MISMATCH',expected:'EXACT_FIXTURE_TEXT',actual:'NOT_OBSERVED'},{scenarioId:smokeIds[0],kind:'SCENARIO',outcome:'FAIL',elapsedMs:4}]};}
function captureFixture(changes={}){const bytes=png();let checks=0;let calls=0;const window={isDestroyed:()=>false,isVisible:()=>true,capturePage:async()=>{calls++;return {isEmpty:()=>false,getSize:()=>({width:1,height:1}),toPNG:()=>bytes};}};const contents={executeJavaScript:async()=>'SAFE'};const verify=async()=>{checks++;};return {bytes,window,contents,verify,stats:()=>({checks,calls}),...changes};}
test('owned failed-window capture returns actual PNG bytes and nonce-bound metadata',async()=>{
 const fixture=captureFixture();const result=await captureFailedUi(fixture.contents,fixture.window,failedSmoke(),runId,fixture.verify,approvedScreenshotSnapshot,()=>false);
 assert.equal(result.record.status,'CAPTURED');assert.equal(result.record.scenarioId,smokeIds[0]);
 assert.deepEqual(result.png,fixture.bytes);assert.deepEqual(fixture.stats(),{checks:2,calls:1});
 const transfer=validateScreenshotTransfer({kind:'PL_BETA_SCREENSHOT_V1',record:result.record,png:result.png.toString('base64')},runId,smokeIds[0]);
 assert.deepEqual(transfer.png,fixture.bytes);
});
test('capture refuses uncertain ownership, nonce, containment, readiness, navigation, fixture or shutdown',async()=>{
 const smoke=failedSmoke();
 for(const [label,change,reason] of [
  ['wrong window',{verify:async()=>{throw new Error('WRONG_WINDOW')}},'SAFETY_CHECK_FAILED'],
  ['expired nonce',{verify:async()=>{throw new Error('NONCE_EXPIRED')}},'SAFETY_CHECK_FAILED'],
  ['unverified containment',{verify:async()=>{throw new Error('MOUNT_INVALID')}},'SAFETY_CHECK_FAILED'],
  ['before readiness',{verify:async()=>{throw new Error('NOT_READY')}},'SAFETY_CHECK_FAILED'],
  ['navigated renderer',{contents:{executeJavaScript:async()=>false}},'UI_CONTENT_UNEXPECTED'],
  ['unexpected fixture',{contents:{executeJavaScript:async()=>false}},'UI_CONTENT_UNEXPECTED'],
  ['destroyed window',{window:{isDestroyed:()=>true,isVisible:()=>true,capturePage:async()=>{throw new Error('SHOULD_NOT_CAPTURE')}}},'WINDOW_IDENTITY_INVALID']
 ]){
  const fixture=captureFixture(change);const result=await captureFailedUi(fixture.contents,fixture.window,smoke,runId,fixture.verify,approvedScreenshotSnapshot,()=>false);
  assert.equal(result.record.status,'OMITTED_SAFETY_GATE',label);assert.equal(result.record.reason,reason,label);assert.equal(result.png,undefined,label);
 }
 const fixture=captureFixture();
 assert.equal((await captureFailedUi(fixture.contents,fixture.window,smoke,runId,fixture.verify,'0'.repeat(64),()=>false)).record.reason,'SNAPSHOT_NOT_APPROVED');
 assert.equal((await captureFailedUi(fixture.contents,fixture.window,smoke,runId,fixture.verify,approvedScreenshotSnapshot,()=>true)).record.reason,'SHUTDOWN_STARTED');
 assert.equal(fixture.stats().calls,0);
 let seen=0;const changing=captureFixture({contents:{executeJavaScript:async()=>++seen===1?'SAFE':'UI_FIELD_UNEXPECTED'}});
 const changed=await captureFailedUi(changing.contents,changing.window,smoke,runId,changing.verify,approvedScreenshotSnapshot,()=>false);
 assert.equal(changed.record.reason,'UI_FIELD_UNEXPECTED');assert.equal(changed.png,undefined);assert.equal(changing.stats().calls,1);
 assert.equal(validateScreenshotTransfer({kind:'PL_BETA_SCREENSHOT_V1',record:changed.record},runId,smokeIds[0]).record.reason,'UI_FIELD_UNEXPECTED');
 const unsafe=captureFixture({contents:{executeJavaScript:async()=> 'CAPTURE_API_FAILED'}});
 assert.equal((await captureFailedUi(unsafe.contents,unsafe.window,smoke,runId,unsafe.verify,approvedScreenshotSnapshot,()=>false)).record.reason,'UI_CONTENT_UNEXPECTED');
});
test('capture exceptions, invalid and excessive PNG data are omitted without changing scenario failure',async()=>{
 for(const image of [
  {capturePage:async()=>{throw new Error('PRIVATE_TOKEN')}},
  {capturePage:async()=>({isEmpty:()=>false,getSize:()=>({width:1,height:1}),toPNG:()=>Buffer.from('not png')})},
  {capturePage:async()=>({isEmpty:()=>false,getSize:()=>({width:1300,height:1}),toPNG:()=>png(1300,1)})}
 ]){
  const fixture=captureFixture({window:{isDestroyed:()=>false,isVisible:()=>true,...image}});
  const result=await captureFailedUi(fixture.contents,fixture.window,failedSmoke(),runId,fixture.verify,approvedScreenshotSnapshot,()=>false);
  assert.equal(result.record.status,'OMITTED_CAPTURE_FAILED');assert.equal(result.png,undefined);
  assert.equal(failedSmoke().status,'FAIL');assert.ok(!JSON.stringify(result.record).includes('PRIVATE_TOKEN'));
 }
 const corrupt=Buffer.from(png());corrupt[45]^=1;
 for(const bad of [Buffer.from('x'),png(1300,1),Buffer.concat([png(),Buffer.from('partial')]),corrupt]) assert.throws(()=>validatePng(bad));
});
test('reviewed empty-project Copilot checkbox is eligible but editable or unclassified input is refused',()=>{
 const priorDocument=global.document,priorLocation=global.location;
 const contextCheckbox={value:'on',disabled:true,checked:false,matches:selector=>selector==='.copilotActions input[type="checkbox"]',getAttribute:()=>null};
 const state={fields:[contextCheckbox],errors:[],visible:'PL Creators Suite',unexpected:false,subtitle:'No project open',summary:'No project open',recents:[]};
 global.location={origin:'http://localhost:5173',pathname:'/'};
 global.document={querySelector:selector=>selector==='.sidebar .recentItem[title]'?state.recents[0]??null:state.unexpected?{}:null,querySelectorAll(selector){if(selector==='input, textarea')return state.fields;if(selector==='.errorBox')return state.errors;if(selector==='.workspaceHeader .workspaceSubtitle')return [{textContent:state.subtitle}];if(selector==='.workspaceHeader .workspaceSubtitle, .projectSummaryValue')return [{textContent:state.subtitle},{textContent:state.summary}];if(selector==='.sidebar .recentItem[title]')return state.recents;return [];},body:{get innerText(){return state.visible;}}};
 try {
  assert.equal(syntheticPageCheck(runId),'SAFE');
  for(const change of [{checked:true},{disabled:false},{matches:()=>false}]){
   Object.assign(contextCheckbox,change);assert.equal(syntheticPageCheck(runId),'UI_FIELD_UNEXPECTED');
   Object.assign(contextCheckbox,{checked:false,disabled:true,matches:selector=>selector==='.copilotActions input[type="checkbox"]'});
  }
  state.fields=[{value:'sk-SYNTHETIC_TOKEN_LOOKING_VALUE',matches:()=>false,getAttribute:()=>null}];assert.equal(syntheticPageCheck(runId),'UI_FIELD_UNEXPECTED');
  state.fields=[{value:'branden@example.test',matches:()=>false,getAttribute:()=>null}];assert.equal(syntheticPageCheck(runId),'UI_FIELD_UNEXPECTED');
  state.fields=[contextCheckbox];state.errors=[{textContent:'Unexpected private diagnostic'}];assert.equal(syntheticPageCheck(runId),'UI_ERROR_UNEXPECTED');
  state.errors=[];state.visible='Path: /home/private/project';assert.equal(syntheticPageCheck(runId),'UI_TEXT_UNEXPECTED');
  state.visible='PL Creators Suite';state.unexpected=true;assert.equal(syntheticPageCheck(runId),'UI_SURFACE_UNEXPECTED');state.unexpected=false;
  state.subtitle='Private project';assert.equal(syntheticPageCheck(runId),'UI_PROJECT_STATE_UNEXPECTED');state.subtitle='No project open';
  state.summary='Private project';assert.equal(syntheticPageCheck(runId),'UI_SUMMARY_UNEXPECTED');state.summary='No project open';
  state.recents=[{textContent:'private',getAttribute:()=>'/home/private'}];assert.equal(syntheticPageCheck(runId),'UI_RECENTS_UNEXPECTED');state.recents=[];
  global.location={origin:'https://example.test',pathname:'/'};assert.equal(syntheticPageCheck(runId),'UI_ORIGIN_UNEXPECTED');
 } finally {global.document=priorDocument;global.location=priorLocation;}
});
test('scratch fixture proof refuses extra project, symlink and nonfixture bytes',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-screenshot-fixture-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'PLProjects');await fs.mkdir(root);await verifySyntheticFixtures(runId,root);
 const name=`plqa-${runId.slice(0,12)}`;const project=path.join(root,name);await fs.mkdir(project);await fs.writeFile(path.join(project,'pl-project.json'),JSON.stringify({name,schemaVersion:1}));await verifySyntheticFixtures(runId,root);
 await fs.mkdir(path.join(project,'code'));await fs.writeFile(path.join(project,'code','qa-smoke.txt'),'secret fixture');await assert.rejects(verifySyntheticFixtures(runId,root));
 await fs.writeFile(path.join(project,'code','qa-smoke.txt'),`PL QA disposable content ${runId}\n`);await verifySyntheticFixtures(runId,root);
 await fs.symlink(project,path.join(root,`${name}-other`));await assert.rejects(verifySyntheticFixtures(runId,root));await fs.unlink(path.join(root,`${name}-other`));
 await fs.mkdir(path.join(root,'unexpected'));await assert.rejects(verifySyntheticFixtures(runId,root));
});
test('captured failure report image is private, verified, and tampering or incomplete shutdown refuses it',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-screenshot-report-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const runner=path.join(base,'runner');await fs.mkdir(runner);
 const image=png();const record=screenshotCaptured(runId,smokeIds[0],image);
 const build={sourceDigest:'a'.repeat(64),assetDigest:'a'.repeat(64),desktopDigest:'a'.repeat(64),snapshotDigest:approvedScreenshotSnapshot,provenance:'NOT_PROVEN'};
 const registry={digest:'b'.repeat(64),capabilities:[{id:'PL-CODE-FILE-001',registryStatus:'complete'},{id:'PL-CODE-FILE-002',registryStatus:'complete'},{id:'PL-CODE-FILE-003',registryStatus:'complete'},{id:'PL-CORE-SHELL-001',registryStatus:'complete'}]};
 const observation={runId,build,smoke:failedSmoke(),shutdownComplete:true,cleanupVerified:true,appVersion:'0.0.1',registry,screenshot:{record,png:image},evidenceProbe:true};
 const report=makeRunReport(observation,undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 assert.equal(report.overall,'FAIL');assert.equal(report.evidence.screenshot.status,'CAPTURED');assert.equal(report.evidence.reproduction.command,'pnpm qa evidence-check');
 assert.throws(()=>makeRunReport({...observation,evidenceProbe:false},undefined,lifecycleError('SMOKE_SCENARIO_FAILED')));
 const files=await writeRunReport(runner,report,image);const imagePath=path.join(runner,'artifacts','reports',runId,record.artifact);
 assert.equal((await fs.stat(imagePath)).mode&0o077,0);assert.equal((await reviewRunReport(runner,files.json)).screenshot.status,'CAPTURED');
 await assert.rejects(writeRunReport(runner,report,image));
 const html=await fs.readFile(path.join(runner,files.html),'utf8');assert.ok(html.includes(`<img src="${record.artifact}"`));assert.ok(!html.includes('https://'));
 await fs.writeFile(imagePath,Buffer.from('partial'));
 await assert.rejects(reviewRunReport(runner,files.json));
 await fs.unlink(imagePath);await fs.symlink(path.join(base,'outside.png'),imagePath);
 await assert.rejects(reviewRunReport(runner,files.json));
 await fs.unlink(imagePath);await fs.writeFile(imagePath,image,{mode:0o600});
 const tampered=structuredClone(report);tampered.evidence.screenshot.sha256='f'.repeat(64);
 await fs.writeFile(path.join(runner,files.json),JSON.stringify(tampered));
 await fs.writeFile(path.join(runner,files.html),renderHtml(tampered));
 await assert.rejects(reviewRunReport(runner,files.json));
 const blocked=makeRunReport({...observation,shutdownComplete:false,cleanupVerified:false},undefined,lifecycleError('OWNED_SHUTDOWN_FAILED'));
 assert.equal(blocked.overall,'BLOCKED');assert.equal(blocked.evidence.screenshot.status,'OMITTED_SAFETY_GATE');
});
test('partial report image write is removed and original UI failure remains FAIL',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-screenshot-partial-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const runner=path.join(base,'runner');await fs.mkdir(runner);
 const image=png();const record=screenshotCaptured(runId,smokeIds[0],image);
 const build={sourceDigest:'a'.repeat(64),assetDigest:'a'.repeat(64),desktopDigest:'a'.repeat(64),snapshotDigest:approvedScreenshotSnapshot,provenance:'NOT_PROVEN'};
 const registry={digest:'b'.repeat(64),capabilities:[{id:'PL-CODE-FILE-001',registryStatus:'complete'},{id:'PL-CODE-FILE-002',registryStatus:'complete'},{id:'PL-CODE-FILE-003',registryStatus:'complete'},{id:'PL-CORE-SHELL-001',registryStatus:'complete'}]};
 const report=makeRunReport({runId,build,smoke:failedSmoke(),shutdownComplete:true,cleanupVerified:true,appVersion:'0.0.1',registry,screenshot:{record,png:image},evidenceProbe:true},undefined,lifecycleError('SMOKE_SCENARIO_FAILED'));
 const originalOpen=fs.open;const interception=mock.method(fs,'open',async(...args)=>{
  const handle=await originalOpen(...args);return {writeFile:async()=>{await handle.writeFile(Buffer.from('partial'));throw new Error('disk full')},sync:()=>handle.sync(),close:()=>handle.close()};
 });
 let files;try {files=await writeRunReport(runner,report,image);}finally {interception.mock.restore();}
 const reviewed=await reviewRunReport(runner,files.json);
 assert.equal(reviewed.overall,'FAIL');assert.equal(reviewed.screenshot.status,'OMITTED_CAPTURE_FAILED');
 assert.equal(reviewed.screenshot.reason,'ARTIFACT_WRITE_FAILED');
 assert.deepEqual((await fs.readdir(path.join(runner,'artifacts','reports',runId))).sort(),['report.html','report.json']);
});
