const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const net=require('node:net');
const {EventEmitter}=require('node:events');
const {classifyStartup,startupCollector,emptyChecks,diagnostic,validateProof}=require('../dist/isolation-diagnostics');
const {RunnerError,publicError}=require('../dist/errors');
const {proveInsideSandbox,writeProofReport}=require('../dist/isolation-proof');
const table=['/','/usr','/bin','/lib','/lib64','/runner','/runtime/node','/isolation-inputs'].map((p,i)=>`${i+1} 0 0:1 / ${p} ro - tmpfs none ro`).join('\n')+'\n99 0 0:1 / /scratch rw - tmpfs none rw';
for(const [text,stage,reasonCode] of [
 ['bwrap: Creating new namespace failed: Operation not permitted','NAMESPACE_CREATION','NAMESPACE_SETUP_DENIED'],
 ['bwrap: Failed to bind mount /private/SECRET: Permission denied','MOUNT_SETUP','MOUNT_SETUP_FAILED'],
 ['bwrap: execvp /runtime/node: No such file or directory','BINARY_LIBRARY_AVAILABILITY','RUNTIME_EXECUTION_FAILED'],
 ['Error: Cannot find module /runner/PRIVATE.js','BINARY_LIBRARY_AVAILABILITY','PROOF_MODULE_UNAVAILABLE'],
 ['error while loading shared libraries: libPRIVATE.so: cannot open shared object file','BINARY_LIBRARY_AVAILABILITY','RUNTIME_LIBRARY_UNAVAILABLE'],
 ['bwrap: loopback: Failed to create NETLINK_ROUTE socket: Operation not permitted','PRIVATE_LOOPBACK_NETWORKING','PRIVATE_LOOPBACK_SETUP_DENIED'],
 ['PL_ISOLATION_PROOF_WRITE_FAILED','PROOF_VALIDATION','PROOF_WRITE_FAILED'],
 ['rpcToken=SECRET ENV_SECRET /home/private/unknown-error','PROOF_VALIDATION','SANDBOX_STARTUP_UNCLASSIFIED']
]) test(`startup stderr maps only to sanitized ${reasonCode}`,()=>{
 const result=classifyStartup(text);assert.equal(result.stage,stage);assert.equal(result.reasonCode,reasonCode);
 assert.equal(JSON.stringify(result).includes('SECRET'),false);
 assert.ok(result.checks.filter(c=>c.stage!==stage).every(c=>c.status==='NOT_VERIFIED'));
});
test('stderr classifier handles split chunks, caps input and discards raw data',()=>{
 const collector=startupCollector();collector.accept(Buffer.from('bwrap: loopback: Failed to create NET'));
 collector.accept(Buffer.from('LINK_ROUTE socket: Operation not permitted SECRET'));
 assert.equal(collector.result().reasonCode,'PRIVATE_LOOPBACK_SETUP_DENIED');
 assert.equal(collector.result().reasonCode,'SANDBOX_STARTUP_UNCLASSIFIED');
 collector.accept(Buffer.from('x'.repeat(100000)+'SECRET'));
 assert.equal(JSON.stringify(collector.result()).includes('SECRET'),false);
});
test('proof protocol accepts only current complete success and rejects malformed/stale/nonzero results',()=>{
 const report={version:1,runId:'fixture',status:'PROBE_VERIFIED',checks:emptyChecks().map(c=>({...c,status:'PASS'}))};
 assert.equal(validateProof(report,'fixture',0).diagnostic,undefined);
 assert.equal(validateProof({...report,runId:'stale'},'fixture',0).diagnostic.reasonCode,'PROOF_STALE');
 assert.equal(validateProof(report,'fixture',3).diagnostic.reasonCode,'PROOF_PROCESS_FAILED');
 assert.equal(validateProof({...report,token:'SECRET'},'fixture',0).diagnostic.reasonCode,'PROOF_MALFORMED');
 assert.equal(validateProof({...report,checks:emptyChecks()},'fixture',0).diagnostic.reasonCode,'PROOF_MALFORMED');
 const failure=diagnostic('FILESYSTEM_CONTAINMENT','ENVIRONMENT_NOT_ISOLATED');
 assert.equal(validateProof({version:1,runId:'fixture',status:'BLOCKED',checks:failure.checks,diagnostic:failure},'fixture',3).diagnostic.reasonCode,'ENVIRONMENT_NOT_ISOLATED');
});
test('public diagnostics strip untrusted child fields and reject secret reason strings',()=>{
 const details=diagnostic('PROOF_VALIDATION','PROOF_MALFORMED');details.token='SECRET';
 assert.equal(JSON.stringify(publicError(new RunnerError('ISOLATION_BLOCKED','Fixed message',details))).includes('SECRET'),false);
 details.reasonCode='TOKEN_SECRET';
 const out=publicError(new RunnerError('ISOLATION_BLOCKED','Fixed message',details));
 assert.equal(out.isolation.reasonCode,'PROOF_MALFORMED');assert.equal(JSON.stringify(out).includes('SECRET'),false);
});
async function proofFixture(options,run) {
 const originalEnv=process.env;
 const cwd=mock.method(process,'cwd',()=>'/scratch');
 const originalExit=process.exitCode;
 const expected={version:1,runId:'fixture',namespaces:Object.fromEntries(['pid','net','mnt','user','ipc'].map(n=>[n,`${n}:outside`]))};
 let report;
 const reads=mock.method(fs,'readFile',async filename=>{
   if(filename.endsWith('expected-namespaces.json')) return options.badExpected?'invalid':JSON.stringify(expected);
   if(filename.endsWith('mountinfo') && options.mountInspectionDenied) throw new Error('SECRET');
   if(filename.endsWith('mountinfo')) return options.badMount ? table.replace('/runner ro','/runner rw'):table;
   if(filename.endsWith('/net/dev') && options.netInspectionDenied) throw new Error('SECRET');
   if(filename.endsWith('/net/dev')) return 'headers\nheaders\n lo: 0 0\n'+(options.extraInterface?'eth0: 0 0':'');
   throw new Error('Unexpected read');
 });
 const links=mock.method(fs,'readlink',async filename=>{
   const name=filename.split('/').at(-1);return `${name}:${options.sameNamespace?'outside':'inside'}`;
 });
 const dirs=mock.method(fs,'readdir',async()=>options.visibleHome?['PRIVATE_DATA']:[]);
 const writes=mock.method(fs,'writeFile',async(filename,data)=>{
   if(filename==='/scratch/isolation-proof.json'){report=JSON.parse(data);return;}
   throw Object.assign(new Error('SECRET raw OS detail'),{code:options.writeErrno ?? 'EROFS'});
 });
 const sockets=mock.method(net,'createServer',()=>{
   const socket=new EventEmitter();
   socket.listen=(_port,_host,ready)=>{queueMicrotask(()=>options.bindDenied?socket.emit('error',Object.assign(new Error('SECRET'),{code:'EPERM'})):ready());};
   socket.close=done=>done();return socket;
 });
 process.env={...require('../dist/isolation-environment').isolatedEnvironment,...(options.secretEnv?{PRIVATE_TOKEN:'SECRET'}:{})};
 try {await run(()=>report);}
 finally {process.env=originalEnv;cwd.mock.restore();process.exitCode=originalExit;reads.mock.restore();links.mock.restore();dirs.mock.restore();writes.mock.restore();sockets.mock.restore();}
}
test('complete proof reports all stages passed under mocked private resources',async()=>{
 await proofFixture({},async()=>assert.ok((await proveInsideSandbox()).every(check=>check.status==='PASS')));
});
for(const [options,stage,reason] of [
 [{sameNamespace:true},'NAMESPACE_CREATION','NAMESPACE_IDENTITY_MISMATCH'],
 [{badMount:true},'MOUNT_SETUP','MOUNT_NOT_READ_ONLY'],
 [{mountInspectionDenied:true},'MOUNT_SETUP','MOUNT_INSPECTION_FAILED'],
 [{netInspectionDenied:true},'PRIVATE_LOOPBACK_NETWORKING','LOOPBACK_INSPECTION_FAILED'],
 [{extraInterface:true},'PRIVATE_LOOPBACK_NETWORKING','LOOPBACK_INTERFACE_INVALID'],
 [{bindDenied:true},'PRIVATE_LOOPBACK_NETWORKING','LOOPBACK_BIND_DENIED'],
 [{visibleHome:true},'FILESYSTEM_CONTAINMENT','HOST_DIRECTORY_VISIBLE'],
 [{secretEnv:true},'FILESYSTEM_CONTAINMENT','ENV_UNEXPECTED_VARIABLE'],
 [{writeErrno:'ENOENT'},'FILESYSTEM_CONTAINMENT','WRITE_CONTAINMENT_FAILED'],
 [{writeErrno:'EEXIST'},'FILESYSTEM_CONTAINMENT','WRITE_CONTAINMENT_FAILED'],
 [{badExpected:true},'PROOF_VALIDATION','PROOF_MALFORMED']
]) test(`proof emits ${reason} without leaking raw failures`,async()=>{
 await proofFixture(options,async()=>{
   await assert.rejects(proveInsideSandbox(),error=>{
     const result=publicError(error);
     assert.equal(result.isolation.stage,stage);assert.equal(result.isolation.reasonCode,reason);
     assert.equal(JSON.stringify(result).includes('SECRET'),false);return true;
   });
 });
});
test('proof process persists a sanitized failure report rather than swallowing it',async()=>{
 await proofFixture({badMount:true},async report=>{
   await writeProofReport();assert.equal(process.exitCode,3);
   assert.equal(report().status,'BLOCKED');assert.equal(report().diagnostic.reasonCode,'MOUNT_NOT_READ_ONLY');
   const result=validateProof(report(),'fixture',3);
   assert.equal(result.diagnostic.reasonCode,'MOUNT_NOT_READ_ONLY');
   assert.equal(result.checks.find(c=>c.stage==='NAMESPACE_CREATION').status,'PASS');
 });
});
for(const [missing,stage,reason] of [
 ['/usr/bin/bwrap','BINARY_LIBRARY_AVAILABILITY','BWRAP_UNAVAILABLE'],
 [process.execPath,'BINARY_LIBRARY_AVAILABILITY','RUNTIME_BINARY_UNAVAILABLE'],
 ['/lib64','MOUNT_SETUP','MOUNT_SOURCE_UNAVAILABLE']
]) test(`parent precheck reports ${reason} before spawning`,async t=>{
 const os=require('node:os');const path=require('node:path');
 const {initializeScratchRoot,createScratch,cleanupScratch}=require('../dist/scratch');
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-diagnostic-'));
 const scratch=await createScratch(await initializeScratchRoot(base));
 const original=fs.access;
 const access=mock.method(fs,'access',async(filename,mode)=>{
   if(filename===missing) throw Object.assign(new Error('SECRET /private'),{code:'EACCES'});
   return original(filename,mode);
 });
 const spawn=mock.method(require('../dist/processes'),'spawnOwned',async()=>{throw new Error('Must not spawn');});
 try {
   await assert.rejects(require('../dist/isolation').isolationPreflight(scratch,process.cwd()),error=>{
     assert.equal(error.diagnostic.stage,stage);assert.equal(error.diagnostic.reasonCode,reason);
     assert.equal(JSON.stringify(publicError(error)).includes('SECRET'),false);return true;
   });
   assert.equal(spawn.mock.callCount(),0);
 } finally {access.mock.restore();spawn.mock.restore();await cleanupScratch(scratch);await fs.rm(base,{recursive:true,force:true});}
});
