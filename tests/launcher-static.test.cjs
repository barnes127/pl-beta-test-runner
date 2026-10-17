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
 [{commandLine:{hasSwitch:flag=>flag==='no-sandbox'}},'/scratch/home','41.10.6','SECURITY_PREFERENCES_INVALID']
]) test('Electron contract rejects '+reason,()=>{
 const f=appFixture(options);assert.throws(()=>initializeElectronPaths(f.app,home,version,f.create),e=>{assert.equal(e.lifecycle.reasonCode,reason);assert.equal(JSON.stringify(publicError(e)).includes('SECRET'),false);return true;});
});
test('silent path override failure and wrong preload/security settings fail closed',()=>{
 const f=appFixture({setPath:()=>{}});assert.throws(()=>initializeElectronPaths(f.app,'/scratch/home','41.10.6',f.create),e=>e.lifecycle.reasonCode==='STORAGE_PATH_MISMATCH');
 const good={sandbox:true,contextIsolation:true,nodeIntegration:false,preload:'/target/apps/desktop/preload.js',webSecurity:true};verifyWebPreferences(good);
 for(const change of [{sandbox:false},{contextIsolation:false},{nodeIntegration:true},{webSecurity:false},{preload:'/other.js'}]) assert.throws(()=>verifyWebPreferences({...good,...change}),e=>e.lifecycle.reasonCode==='SECURITY_PREFERENCES_INVALID');
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
 } finally {await cleanupScratch(scratch);}
});
test('CLI launch refuses approval gate without loading target app',async t=>{
 const base=await reviewFixture(t);
 const output=path.join(base,'result.json');const file=await fs.open(output,'wx',0o600);
 try {
   const child=require('node:child_process').spawn(process.execPath,['dist/cli.js','launch'],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore',file.fd,'ignore']});
   const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
   assert.equal(code,3);
 } finally {await file.close();}
 const result=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(result.code,'LAUNCH_BLOCKED');assert.match(result.message,/separate owner approval/);
});
async function sessionFixture(options,callback) {
 const proc=require('../dist/processes');const proof=require('../dist/isolation-proof');
 let status;const stopped=[];const children=[];const oldExit=process.exitCode;
 const mocks=[
 mock.method(proof,'proveInsideSandbox',async()=>[]),mock.method(proof,'verifyApplicationMounts',()=>{}),
 mock.method(fs,'access',async()=>{}),
 mock.method(fs,'readFile',async file=>file.endsWith('expected-namespaces.json')?JSON.stringify({runId:'fixture'}):JSON.stringify({status:'READY',securityVerified:true,preloadVerified:true,electron:'41.10.6'})),
 mock.method(fs,'writeFile',async(file,data)=>{
   if(file==='/scratch/stop-electron') {if(options.stopRequestFails) throw new Error('SECRET');if(!options.hangElectron) children[2].child.exitCode=options.exitFailure?2:0;}
   if(file==='/scratch/session-result.json') status=JSON.parse(data);
 }),
 mock.method(fs,'readdir',async()=>[String(process.pid),'1']),
 mock.method(proc,'spawnOwned',async(command)=>{const child={pid:children.length+10,start:'1',child:{exitCode:null,signalCode:null}};children.push(child);return child;}),
 mock.method(proc,'assertPortFree',async()=>{}),mock.method(proc,'assertListenerOwner',async()=>{}),
 mock.method(proc,'waitFor',async condition=>{if(!await condition()) throw new Error('timeout');}),
 mock.method(proc,'stopOwned',async child=>{stopped.push(child.pid);child.child.exitCode=0;if(options.stopFails && child===children[2]) throw new Error('SECRET');})];
 try {await require('../dist/sandbox-session').session();await callback(status,stopped);}
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
