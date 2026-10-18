const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {initializeElectronPaths,verifyWebPreferences}=require('../dist/electron-contract');
const {publicError}=require('../dist/errors');
const {validateSessionResult}=require('../dist/lifecycle-diagnostics');
const {sandboxArgs}=require('../dist/isolation');
const {inspectRendererBuild,prepareRuntime}=require('../dist/runtime-files');
const {initializeScratchRoot,createScratch,cleanupScratch}=require('../dist/scratch');
async function reviewFixture(t) {
 const scratch=await createScratch(await initializeScratchRoot(process.cwd()));
 t.after(()=>cleanupScratch(scratch));return scratch.directory;
}
function appFixture(options={}) {
 const values={home:'/scratch/home'};const sets=[];const created=[];
 const app={isReady:()=>!!options.ready,isPackaged:false,getAppPath:()=>'/target',getPath:name=>values[name],setPath:(name,value)=>{assert.notEqual(name,'logs');values[name]=value;sets.push(name);},setAppLogsPath:value=>{values.logs=value;},commandLine:{hasSwitch:()=>false},...options};
 return {app,values,sets,created,create:directory=>created.push(directory)};
}
test('Electron contract uses documented paths before ready, with package-root identity and explicit logs API',()=>{
 const f=appFixture();initializeElectronPaths(f.app,'/scratch/home','41.10.6',f.create);
 assert.deepEqual(f.sets,['home','appData','userData','sessionData','temp','crashDumps']);
 assert.equal(f.values.logs,'/scratch/electron-logs');assert.equal(f.values.home,'/scratch/home');
 assert.equal(f.created.length,7);assert.equal('setAppPath' in f.app,false);
});
for(const [options,home,version,reason] of [
 [{ready:true},'/scratch/home','41.10.6','ELECTRON_ALREADY_READY'],
 [{getAppPath:()=>'/runner'},'/scratch/home','41.10.6','APP_PATH_MISMATCH'],
 [{isPackaged:true},'/scratch/home','41.10.6','APP_PATH_MISMATCH'],
 [{},'/home/SECRET','41.10.6','STORAGE_PATH_MISMATCH'],
 [{},'/scratch/home','40.0.0','ELECTRON_VERSION_MISMATCH'],
 [{commandLine:{hasSwitch:flag=>flag==='no-sandbox'}},'/scratch/home','41.10.6','SWITCH_NO_SANDBOX']
]) test('Electron contract rejects '+reason,()=>{
 const f=appFixture(options);assert.throws(()=>initializeElectronPaths(f.app,home,version,f.create),e=>{assert.equal(e.lifecycle.reasonCode,reason);assert.equal(JSON.stringify(publicError(e)).includes('SECRET'),false);return true;});
});
test('silent path override failure and wrong preload/security settings fail closed',()=>{
 const f=appFixture({setPath:()=>{}});assert.throws(()=>initializeElectronPaths(f.app,'/scratch/home','41.10.6',f.create),e=>e.lifecycle.reasonCode==='STORAGE_PATH_MISMATCH');
 const good={sandbox:true,contextIsolation:true,nodeIntegration:false,preload:'/target/apps/desktop/preload.js',webSecurity:true};verifyWebPreferences(good);
 for(const [change,reason] of [[{sandbox:false},'PREF_SANDBOX_INVALID'],[{contextIsolation:false},'PREF_CONTEXT_ISOLATION_INVALID'],[{nodeIntegration:true},'PREF_NODE_INTEGRATION_INVALID'],[{webSecurity:false},'PREF_WEB_SECURITY_DISABLED'],[{preload:'/SECRET.js'},'PREF_PRELOAD_PATH_MISMATCH']]) assert.throws(()=>verifyWebPreferences({...good,...change}),e=>e.lifecycle.reasonCode===reason && !JSON.stringify(publicError(e)).includes('SECRET'));
});
test('staged inputs have no writable alias under private state',()=>{
 const args=sandboxArgs('/owned/run','/runner/dist','/node');
 const bindings=[];for(let i=0;i<args.length;i++) if(args[i]==='--bind') bindings.push([args[i+1],args[i+2]]);
 assert.deepEqual(bindings,[['/owned/run/state','/scratch']]);
 assert.equal(args.includes('/owned/run/target'),false);
 const input=args.indexOf('/isolation-inputs');assert.equal(args[input-2],'--ro-bind');assert.equal(args[input-1],'/owned/run/inputs');
});
test('session success requires current nonce, clean exit and completed shutdown',()=>{
 const good={version:1,runId:'fixture',status:'LIFECYCLE_VERIFIED',shutdownComplete:true,guiMutations:false};
 assert.equal(validateSessionResult(good,'fixture',0).status,'LIFECYCLE_VERIFIED');
 for(const [value,exit] of [[{...good,runId:'stale'},0],[{...good,shutdownComplete:false},0],[good,3],[{...good,token:'SECRET'},0],[{...good,guiMutations:true},0]]) assert.throws(()=>validateSessionResult(value,'fixture',exit));
 const blocked={...good,status:'BLOCKED',diagnostic:{reasonCode:'SECRET'}};
 assert.equal(JSON.stringify(validateSessionResult(blocked,'fixture',3)).includes('SECRET'),false);
});
test('never-settling readiness promise is bounded',async()=>{
 await assert.rejects(require('../dist/processes').waitFor(()=>new Promise(()=>{}),40),e=>e.code==='TIMEOUT');
});
async function targetFixture(t) {
 const base=await reviewFixture(t);
 const files=['package.json','pnpm-lock.yaml','apps/renderer/package.json','apps/renderer/index.html','apps/renderer/vite.config.ts','apps/renderer/tsconfig.json','apps/renderer/tsconfig.app.json','apps/renderer/tsconfig.node.json','apps/renderer/src/app.ts','apps/renderer/public/asset.svg','packages/platform/src/index.ts','apps/renderer/dist/index.html','apps/renderer/dist/assets/app.js','apps/desktop/main.js','apps/desktop/package.json'];
 for(const name of files) {const file=path.join(base,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,name.endsWith('package.json')?'{}':'fixture');await fs.utimes(file,100,100);}
 for(const name of ['apps/renderer/dist/index.html','apps/renderer/dist/assets/app.js']) await fs.utimes(path.join(base,name),200,200);
 return base;
}
test('stale renderer outputs block; freshness hashes do not claim provenance',async t=>{
 const root=await targetFixture(t);const good=await inspectRendererBuild(root);
 assert.equal(good.provenance,'NOT_PROVEN');assert.match(good.assetDigest,/^[a-f0-9]{64}$/);
 await fs.utimes(path.join(root,'apps/renderer/src/app.ts'),300,300);
 await assert.rejects(inspectRendererBuild(root),e=>e.code==='CONFIG');
});
test('package wrapper uses directory application root and runner bootstrap without editing source',async t=>{
 const root=await targetFixture(t);
 const base=await reviewFixture(t);
 const scratch=await createScratch(await initializeScratchRoot(base));
 try {
   const target=await prepareRuntime({targetRoot:root},scratch);
   const pkg=JSON.parse(await fs.readFile(path.join(target,'package.json'),'utf8'));
   assert.equal(pkg.main,'/runner/electron-entry.js');
   assert.equal(await fs.readFile(path.join(root,'apps/desktop/main.js'),'utf8'),'fixture');
   assert.ok((await fs.stat(path.join(scratch.directory,'build-evidence.json'))).isFile());
   const manifest=JSON.parse(await fs.readFile(path.join(scratch.directory,'inputs/preload-contract.json'),'utf8'));
   const evidence=JSON.parse(await fs.readFile(path.join(scratch.directory,'build-evidence.json'),'utf8'));
   assert.deepEqual(manifest,{version:1,runId:scratch.nonce,snapshotDigest:evidence.snapshotDigest});
 } finally {await cleanupScratch(scratch);}
});
test('launch approval accepts only the adjacent canonical disposable checkout',async t=>{
 const base=await reviewFixture(t);const runner=path.join(base,'runner');const target=path.join(base,'pl-creators-suite');
 await fs.mkdir(runner);await fs.mkdir(target);
 const {assertApprovedLaunchTarget}=require('../dist/launch-authorization');
 await assertApprovedLaunchTarget(target,runner);
 for(const candidate of [runner,base,path.join(base,'missing')])
   await assert.rejects(assertApprovedLaunchTarget(candidate,runner),e=>e.code==='LAUNCH_BLOCKED');
 const alias=path.join(base,'alias');await fs.symlink(target,alias);
 await assert.rejects(assertApprovedLaunchTarget(alias,runner),e=>e.code==='LAUNCH_BLOCKED');
 await fs.rmdir(target);await fs.symlink(runner,target);
 await assert.rejects(assertApprovedLaunchTarget(runner,runner),e=>e.code==='LAUNCH_BLOCKED');
 await assert.rejects(assertApprovedLaunchTarget(target,runner),e=>e.code==='LAUNCH_BLOCKED');
});
async function sessionFixture(options,callback) {
 const proc=require('../dist/processes');const proof=require('../dist/isolation-proof');
 let status;const stopped=[];const children=[];const events=[];let permitted=false;const oldExit=process.exitCode;
 const mocks=[
 mock.method(proof,'proveInsideSandbox',async()=>{events.push('proof');return [];}),mock.method(proof,'verifyApplicationMounts',()=>{}),
 mock.method(fs,'access',async()=>{}),
 mock.method(fs,'readFile',async file=>{
   if(file.endsWith('expected-namespaces.json')) return JSON.stringify({runId:'fixture'});
   if(file.endsWith('smoke-plan.json')) return JSON.stringify({version:1,runId:'fixture',suite:'batch-2-v1',isolationReview:options.invalidPlan?'APPROVED':'PENDING'});
   if(file.endsWith('smoke-result.json')) {
     assert.equal(permitted,true);
     if(options.pendingSmoke) throw Object.assign(new Error('SECRET'),{code:'ENOENT'});
     return JSON.stringify(options.smokeReport);
   }
   return JSON.stringify({status:'READY',securityVerified:true,preloadVerified:true,preloadDeclaredVerified:true,preloadBridgeVerified:true,preloadInspection:'PRESENT',electron:'41.10.6',...options.readiness});
 }),
 mock.method(fs,'rename',async(from,to)=>{assert.equal(to,'/scratch/smoke-permit.json');events.push('permit');permitted=true;}),
 mock.method(fs,'writeFile',async(file,data)=>{
   if(file==='/scratch/smoke-permit.tmp') {assert.equal(events.filter(e=>e==='proof').length,2);assert.equal(events.at(-1),'listener');}
   if(file==='/scratch/stop-electron') {if(options.stopRequestFails) throw new Error('SECRET');if(!options.hangElectron) children[2].child.exitCode=options.exitFailure?2:0;}
   if(file==='/scratch/session-result.json') status=JSON.parse(data);
 }),
 mock.method(fs,'readdir',async()=>[String(process.pid),'1']),
 mock.method(proc,'spawnOwned',async(command)=>{const child={pid:children.length+10,start:'1',child:{exitCode:null,signalCode:null}};children.push(child);return child;}),
 mock.method(proc,'assertPortFree',async()=>{}),mock.method(proc,'assertListenerOwner',async()=>{events.push('listener');if(options.loseOwnershipAtPermit && events.filter(e=>e==='listener').length===3) throw require('../dist/errors').lifecycleError('RPC_OWNERSHIP_FAILED');}),
 mock.method(proc,'waitFor',async condition=>{if(!await condition()) throw new Error('timeout');}),
 mock.method(proc,'stopOwned',async child=>{stopped.push(child.pid);child.child.exitCode=0;if(options.stopFails && child===children[2]) throw new Error('SECRET');})];
 try {await require('../dist/sandbox-session').session(options.smoke ?? false);await callback(status,stopped,events);}
 finally {process.exitCode=oldExit;for(const m of mocks.reverse())m.mock.restore();}
}
test('forced Electron termination cannot become lifecycle success',async()=>{
 await sessionFixture({hangElectron:true},async(result,stopped)=>{assert.equal(result.status,'BLOCKED');assert.equal(result.diagnostic.reasonCode,'ELECTRON_SHUTDOWN_TIMEOUT');assert.deepEqual(stopped,[12,11,10]);});
});
test('failed stop request still attempts every owned shutdown',async()=>{
 await sessionFixture({stopRequestFails:true},async(result,stopped)=>{assert.equal(result.status,'BLOCKED');assert.equal(result.diagnostic.reasonCode,'STOP_REQUEST_FAILED');assert.deepEqual(stopped,[12,11,10]);});
});
test('uncertain shutdown keeps result blocked and cleanup unverified',async()=>{
 await sessionFixture({stopFails:true},async(result,stopped)=>{assert.equal(result.status,'BLOCKED');assert.equal(result.shutdownComplete,false);assert.equal(result.diagnostic.reasonCode,'OWNED_SHUTDOWN_FAILED');assert.equal(stopped.length,3);assert.equal(JSON.stringify(result).includes('SECRET'),false);});
});

test('application lifecycle requires explicit readonly target and Electron mounts',()=>{
 const proof=require('../dist/isolation-proof');
 const base=['/','/usr','/bin','/lib','/lib64','/runner','/runtime/node','/isolation-inputs','/target','/electron'].map((p,i)=>`${i} 0 0:1 / ${p} ro - tmpfs none ro`).join('\n')+'\n99 0 0:1 / /scratch rw - tmpfs none rw';
 proof.verifyApplicationMounts(base);
 assert.throws(()=>proof.verifyApplicationMounts(base.replace('/electron ro','/absent ro')));
 assert.throws(()=>proof.verifyApplicationMounts(base.replace('/target ro','/target rw')));
});
test('renderer resolves query-bearing index without exposing path traversal or symlink targets',async t=>{
 const base=await reviewFixture(t);
 const root=path.join(base,'dist');await fs.mkdir(root);await fs.writeFile(path.join(root,'index.html'),'fixture');await fs.writeFile(path.join(base,'private'),'secret fixture');
 const {resolveRendererAsset}=require('../dist/renderer-server');
 assert.equal(await resolveRendererAsset(root,'/?rpcToken=DUMMY'),path.join(root,'index.html'));
 await assert.rejects(resolveRendererAsset(root,'/..%2fprivate'));
 await fs.symlink(path.join(base,'private'),path.join(root,'escape.js'));
 await assert.rejects(resolveRendererAsset(root,'/escape.js'));
});
async function outerLaunchFixture(t,shutdownComplete) {
 const base=await reviewFixture(t);
 const processes=require('../dist/processes');let run;
 const mocks=[
 mock.method(require('../dist/doctor'),'doctor',async()=>({electronExecutable:'/distribution/electron'})),
 mock.method(require('../dist/isolation'),'isolationPreflight',async()=>({status:'PREFLIGHT_VERIFIED'})),
 mock.method(require('../dist/runtime-files'),'prepareRuntime',async()=>'/snapshot'),mock.method(fs,'access',async()=>{}),
 mock.method(processes,'spawnOwned',async(_command,args)=>{
   const state=args[args.indexOf('--bind')+1];run=path.dirname(state);
   assert.ok((await fs.stat(path.join(run,'.active-process.json'))).isFile());
   const marker=JSON.parse(await fs.readFile(path.join(run,'.pl-beta-runner-owner.json'),'utf8'));
   await fs.mkdir(state);await fs.writeFile(path.join(state,'session-result.json'),JSON.stringify({version:1,runId:marker.nonce,status:'BLOCKED',guiMutations:false,shutdownComplete,diagnostic:{reasonCode:'ELECTRON_STARTUP_FAILED'}}));
   return {pid:123,start:'1',child:{exitCode:3,signalCode:null}};
 }),mock.method(processes,'waitFor',async()=>{}),mock.method(processes,'stopOwned',async()=>{})];
 try {
   const config=structuredClone(require('../config/example.target.json'));
   await assert.rejects(require('../dist/launch').launch(config,base),error=>{
     assert.equal(error.lifecycle.reasonCode,'ELECTRON_STARTUP_FAILED');
     assert.equal(error.lifecycle.cleanup,shutdownComplete?undefined:'RETAINED_FOR_REVIEW');return true;
   });
   if(shutdownComplete) await assert.rejects(fs.stat(run),error=>error.code==='ENOENT');
   else assert.ok((await fs.stat(path.join(run,'.active-process.json'))).isFile());
 } finally {for(const m of mocks.reverse())m.mock.restore();}
}
test('outer launcher retains process lease and scratch when inner shutdown is unverified',async t=>outerLaunchFixture(t,false));
test('outer launcher cleans a failed startup only when inner shutdown is verified',async t=>outerLaunchFixture(t,true));
test('port preflight destroys unsolicited connections before closing',async()=>{
 const {EventEmitter}=require('node:events');let destroyed=0;
 const factory=mock.method(require('node:net'),'createServer',()=>{
   const server=new EventEmitter();server.listen=(_options,ready)=>{queueMicrotask(()=>{server.emit('connection',{destroy:()=>destroyed++});ready();});};server.close=callback=>callback();return server;
 });
 try {await require('../dist/processes').assertPortFree(5173);assert.equal(destroyed,2);} finally {factory.mock.restore();}
});
test('a stuck port-probe close is bounded and fails closed',async()=>{
 const {EventEmitter}=require('node:events');
 const factory=mock.method(require('node:net'),'createServer',()=>{
   const server=new EventEmitter();server.listen=(_options,ready)=>queueMicrotask(ready);server.close=()=>{};return server;
 });
 try {await assert.rejects(require('../dist/processes').assertPortFree(5173),e=>e.code==='PORT_UNAVAILABLE');} finally {factory.mock.restore();}
});

test('missing or failing internal preference inspector blocks rather than assuming security',()=>{
 const {inspectWebPreferences}=require('../dist/electron-contract');
 for(const contents of [{},{getLastWebPreferences:()=>{throw new Error('SECRET');}},{getLastWebPreferences:()=>null}]) assert.throws(()=>inspectWebPreferences(contents),error=>{assert.equal(error.lifecycle.reasonCode,'PREFERENCE_INSPECTION_UNAVAILABLE');assert.equal(JSON.stringify(publicError(error)).includes('SECRET'),false);return true;});
 inspectWebPreferences({getLastWebPreferences:()=>({sandbox:true,contextIsolation:true,nodeIntegration:false,preload:'/target/apps/desktop/preload.js'})});
});

test('security diagnostics distinguish every prohibited switch without echoing input',()=>{
 for(const [flag,reason] of [['no-sandbox','SWITCH_NO_SANDBOX'],['disable-web-security','SWITCH_DISABLE_WEB_SECURITY'],['disable-gpu-sandbox','SWITCH_DISABLE_GPU_SANDBOX'],['disable-setuid-sandbox','SWITCH_DISABLE_SETUID_SANDBOX']]) {
  const f=appFixture({commandLine:{hasSwitch:value=>value===flag}});
  assert.throws(()=>initializeElectronPaths(f.app,'/scratch/home','41.10.6',f.create),e=>e.lifecycle.reasonCode===reason);
 }
});
test('missing preferences and noncanonical preload representations remain rejected with specific codes',()=>{
 const good={sandbox:true,contextIsolation:true,nodeIntegration:false,preload:'/target/apps/desktop/preload.js'};
 for(const [change,reason] of [[{sandbox:undefined},'PREF_SANDBOX_MISSING'],[{contextIsolation:undefined},'PREF_CONTEXT_ISOLATION_MISSING'],[{nodeIntegration:undefined},'PREF_NODE_INTEGRATION_MISSING'],[{preload:undefined},'PREF_PRELOAD_MISSING'],[{preload:{}},'PREF_PRELOAD_TYPE_INVALID'],[{preload:'file:///target/apps/desktop/preload.js'},'PREF_PRELOAD_PATH_MISMATCH'],[{preload:'/target/apps/desktop/../desktop/preload.js'},'PREF_PRELOAD_PATH_MISMATCH']]) {
  assert.throws(()=>verifyWebPreferences({...good,...change}),e=>e.lifecycle.reasonCode===reason);
 }
});
test('readiness identifies the sole actual Suite BrowserWindow and fixed origin without exposing query secrets',()=>{
 const {verifySuiteWindow}=require('../dist/electron-contract');
 const contents={getType:()=> 'window',getURL:()=> 'http://localhost:5173/?rpcToken=SECRET'};
 const win={webContents:contents,isDestroyed:()=>false};
 const windows={fromWebContents:()=>win,getAllWindows:()=>[win]};
 verifySuiteWindow(contents,windows);
 for(const modified of [{...windows,fromWebContents:()=>null},{...windows,getAllWindows:()=>[win,{}]}]) assert.throws(()=>verifySuiteWindow(contents,modified),e=>e.lifecycle.reasonCode==='SUITE_WINDOW_IDENTITY_INVALID');
 for(const url of ['http://localhost:5174/?SECRET','http://localhost:5173/other?SECRET','file:///SECRET','INVALID_SECRET']) {
  assert.throws(()=>verifySuiteWindow({...contents,getURL:()=>url},{...windows,fromWebContents:()=>null}),e=>!JSON.stringify(publicError(e)).includes('SECRET'));
  contents.getURL=()=>url;
  assert.throws(()=>verifySuiteWindow(contents,windows),e=>e.lifecycle.reasonCode==='SUITE_WINDOW_LOCATION_INVALID' && !JSON.stringify(publicError(e)).includes('SECRET'));
 }
 contents.getType=()=> 'webview';
 assert.throws(()=>verifySuiteWindow(contents,windows),e=>e.lifecycle.reasonCode==='SUITE_WINDOW_IDENTITY_INVALID');
});
test('specific security failures survive session and public sanitization without extra metadata',()=>{
 const {lifecycleReasons}=require('../dist/lifecycle-diagnostics');
 for(const reasonCode of lifecycleReasons.filter(code=>/^(SWITCH_|PREF_|PRELOAD_|SUITE_WINDOW_)/.test(code))) {
  const result=validateSessionResult({version:1,runId:'fixture',status:'BLOCKED',shutdownComplete:true,guiMutations:false,diagnostic:{reasonCode,path:'SECRET',token:'SECRET'}},'fixture',3);
  assert.deepEqual(result.diagnostic,{reasonCode});
  const error=require('../dist/errors').lifecycleError(reasonCode);
  assert.equal(publicError(error).lifecycle.reasonCode,reasonCode);
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
 }
});

async function stagedDeclarationFixture(t) {
 const base=await reviewFixture(t);const target=path.join(base,'target');
 await fs.mkdir(path.join(target,'apps/desktop'),{recursive:true});
 for(const file of ['main.js','preload.js']) await fs.copyFile(path.join(__dirname,'fixtures/reviewed-desktop',file),path.join(target,'apps/desktop',file));
 await fs.writeFile(path.join(target,'asset.js'),'fixture');
 const manifest=path.join(base,'preload-contract.json');
 const refresh=async()=>fs.writeFile(manifest,JSON.stringify({version:1,runId:'fixture',snapshotDigest:await require('../dist/runtime-files').runtimeTreeDigest(target)}));
 await refresh();return {target,manifest,refresh};
}
test('real Electron export descriptor prevents replacement but snapshot verification requires no interception',async t=>{
 // Descriptor shape extracted read-only from Electron 41's embedded
 // lib/common/define-properties.ts: enumerable getter, no configurable/setter.
 const Original=class {};const electron={};
 Object.defineProperties(electron,{BrowserWindow:{enumerable:true,get:()=>Original}});
 const before=Object.getOwnPropertyDescriptor(electron,'BrowserWindow');
 assert.equal(before.configurable,false);assert.equal(before.set,undefined);
 assert.throws(()=>Object.defineProperty(electron,'BrowserWindow',{configurable:true,value:new Proxy(Original,{})}),TypeError);
 const f=await stagedDeclarationFixture(t);
 await require('../dist/preload-contract').verifyStagedPreloadDeclaration(f.target,f.manifest,'fixture');
 assert.deepEqual(Object.getOwnPropertyDescriptor(electron,'BrowserWindow'),before);
 assert.equal(electron.BrowserWindow,Original);
});
test('reviewed exact snapshot permits omitted inspector preload only with independent declaration and observed bridge',async t=>{
 const f=await stagedDeclarationFixture(t);
 await require('../dist/preload-contract').verifyStagedPreloadDeclaration(f.target,f.manifest,'fixture');
 const {inspectWebPreferences,verifyPreloadBridge}=require('../dist/electron-contract');
 const contents={getLastWebPreferences:()=>({sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true})};
 assert.equal(inspectWebPreferences(contents,true),'OMITTED_DECLARATION_VERIFIED');verifyPreloadBridge(true);
 assert.throws(()=>inspectWebPreferences(contents),e=>e.lifecycle.reasonCode==='PREF_PRELOAD_MISSING');
 for(const absent of [false,undefined,null,'true']) assert.throws(()=>verifyPreloadBridge(absent),e=>e.lifecycle.reasonCode==='PRELOAD_BRIDGE_MISSING');
});
test('changed or removed preload declaration cannot pass even with a refreshed snapshot manifest',async t=>{
 const f=await stagedDeclarationFixture(t);const main=path.join(f.target,'apps/desktop/main.js');const original=await fs.readFile(main,'utf8');
 const verify=()=>require('../dist/preload-contract').verifyStagedPreloadDeclaration(f.target,f.manifest,'fixture');
 for(const changed of [original.replace('preload.js','incorrect.js'),original.replace('preload: path.join(__dirname, "preload.js"),',''),original.replace('sandbox: true','sandbox: false')]) {
  assert.notEqual(changed,original);await fs.writeFile(main,changed);await f.refresh();
  await assert.rejects(verify(),e=>e.lifecycle.reasonCode==='PRELOAD_REVIEW_MISMATCH');
 }
 await fs.writeFile(main,original);await fs.writeFile(path.join(f.target,'apps/desktop/preload.js'),'SECRET');await f.refresh();
 await assert.rejects(verify(),e=>e.lifecycle.reasonCode==='PRELOAD_REVIEW_MISMATCH' && !JSON.stringify(publicError(e)).includes('SECRET'));
});
test('snapshot nonce, tree changes, missing files and symlink escapes fail closed',async t=>{
 const f=await stagedDeclarationFixture(t);const verify=runId=>require('../dist/preload-contract').verifyStagedPreloadDeclaration(f.target,f.manifest,runId);
 await assert.rejects(verify('wrong'),e=>e.lifecycle.reasonCode==='PRELOAD_SNAPSHOT_INVALID');
 await fs.writeFile(path.join(f.target,'asset.js'),'changed');
 await assert.rejects(verify('fixture'),e=>e.lifecycle.reasonCode==='PRELOAD_SNAPSHOT_INVALID');
 await f.refresh();await verify('fixture');
 const preload=path.join(f.target,'apps/desktop/preload.js');await fs.unlink(preload);
 await assert.rejects(verify('fixture'),e=>e.lifecycle.reasonCode==='PRELOAD_FILE_INVALID');
 await fs.symlink(path.join(__dirname,'fixtures/reviewed-desktop/preload.js'),preload);
 await assert.rejects(verify('fixture'),e=>e.lifecycle.reasonCode==='PRELOAD_FILE_INVALID');
});
test('verified declaration never overrides contradictory inspector preload or effective security settings',()=>{
 const {inspectWebPreferences}=require('../dist/electron-contract');
 const good={sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true};
 for(const [change,reason] of [[{preload:'/SECRET'},'PREF_PRELOAD_PATH_MISMATCH'],[{preload:{}},'PREF_PRELOAD_TYPE_INVALID'],[{sandbox:undefined},'PREF_SANDBOX_MISSING'],[{sandbox:false},'PREF_SANDBOX_INVALID'],[{contextIsolation:false},'PREF_CONTEXT_ISOLATION_INVALID'],[{nodeIntegration:true},'PREF_NODE_INTEGRATION_INVALID'],[{webSecurity:false},'PREF_WEB_SECURITY_DISABLED']]) {
  assert.throws(()=>inspectWebPreferences({getLastWebPreferences:()=>({...good,...change})},true),e=>e.lifecycle.reasonCode===reason && !JSON.stringify(publicError(e)).includes('SECRET'));
 }
 assert.equal(inspectWebPreferences({getLastWebPreferences:()=>({...good,preload:'/target/apps/desktop/preload.js'})},true),'PRESENT');
});
test('supervisor requires separate declaration and bridge proof, including omitted-inspector case',async()=>{
 await sessionFixture({readiness:{preloadInspection:'OMITTED_DECLARATION_VERIFIED'}},async result=>assert.equal(result.status,'LIFECYCLE_VERIFIED'));
 for(const readiness of [{preloadDeclaredVerified:undefined},{preloadBridgeVerified:false},{preloadInspection:'UNKNOWN'}]) {
  await sessionFixture({readiness},async result=>assert.equal(result.status,'BLOCKED'));
 }
});
function mockedSmokeReport(fail=false) {
 const ids=require('../dist/smoke-contract').smokeIds;
 return {version:1,runId:'fixture',status:fail?'FAIL':'PASS',scenarios:ids.map((id,i)=>fail?(i===0?{id,status:'FAIL',reason:'UI_ASSERTION_FAILED'}:{id,status:'NOT_RUN'}):{id,status:'PASS'})};
}
test('smoke permit follows fresh isolation and listener proof, and success still requires clean lifecycle',async()=>{
 await sessionFixture({smoke:true,smokeReport:mockedSmokeReport()},async(result,stopped,events)=>{
  assert.equal(result.status,'LIFECYCLE_VERIFIED');assert.equal(result.guiMutations,true);assert.equal(result.shutdownComplete,true);assert.equal(result.smoke.status,'PASS');
  assert.equal(events.filter(e=>e==='permit').length,1);assert.deepEqual(stopped,[12,11,10]);
  assert.equal(require('../dist/lifecycle-diagnostics').validateSessionResult(result,'fixture',0,true).status,'LIFECYCLE_VERIFIED');
 });
});
test('invalid plan and lost listener ownership cannot publish a smoke mutation permit',async()=>{
 for(const options of [{invalidPlan:true},{loseOwnershipAtPermit:true}]) await sessionFixture({smoke:true,...options},async(result,stopped,events)=>{
  assert.equal(result.status,'BLOCKED');assert.equal(result.guiMutations,false);assert.equal(events.includes('permit'),false);
 });
});
test('failed or stalled smoke scenarios still stop every owned process and report failure',async()=>{
 for(const options of [{smokeReport:mockedSmokeReport(true)},{pendingSmoke:true}]) await sessionFixture({smoke:true,...options},async(result,stopped)=>{
  assert.equal(result.status,'BLOCKED');assert.equal(result.guiMutations,true);assert.equal(result.shutdownComplete,true);assert.deepEqual(stopped,[12,11,10]);
  assert.equal(result.diagnostic.reasonCode,options.pendingSmoke?'SMOKE_TIMEOUT':'SMOKE_SCENARIO_FAILED');
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
 });
});
