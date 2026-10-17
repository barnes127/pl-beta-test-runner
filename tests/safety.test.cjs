const {test, mock} = require('node:test');
const {EventEmitter} = require('node:events');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {spawnSync} = require('node:child_process');
const {validateConfig,loadConfig,assertRuntime} = require('../dist/config');
const {RunnerError,publicError} = require('../dist/errors');
const {initializeScratchRoot,createScratch,cleanupScratch,validateScratch} = require('../dist/scratch');
const {spawnOwned,stopOwned,waitFor,assertPortFree,assertListenerOwner} = require('../dist/processes');
const template = require('../config/example.target.json');
const clone = () => structuredClone(template);
const code = expected => error => error instanceof RunnerError && error.code === expected;
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(),'pl-runner-unit-'));
  t.after(() => fs.rm(base,{recursive:true,force:true}));
  const root = await initializeScratchRoot(base);
  return {base,root,scratch:await createScratch(root)};
}
test('safe configuration validates and runtime versions are pinned', () => {
  assert.equal(validateConfig(clone()).allowGuiMutations,false);
  assertRuntime('22.12.0','pnpm/10.31.0 npm/? node/v22.12.0');
  assert.throws(() => assertRuntime('20.20.2'),code('RUNTIME'));
  assert.throws(() => assertRuntime('22.12.0','npm/10.31.0'),code('RUNTIME'));
});
for (const [name,edit] of [
  ['mutation flag', c => c.allowGuiMutations=true],
  ['remote renderer',c => c.renderer.url='https://example.com'],
  ['RPC interface',c => c.rpc.host='0.0.0.0'],
  ['port fallback',c => c.renderer.strictPort=false],
  ['fabricated isolation approval',c => c.isolation.status='verified'],
  ['arbitrary command',c => c.command='echo SECRET'],
  ['nested extra option',c => c.rpc.command='echo SECRET'],
  ['path escape entrypoint',c => c.desktopAppRelativePath='../outside'],
  ['packaged mode',c => c.buildMode='packaged'],
  ['blank target',c => c.targetRoot=''],
]) test(`reject unsafe config: ${name}`,() => {
  const config=clone(); edit(config); assert.throws(() => validateConfig(config),code('CONFIG'));
});
test('missing target and malformed JSON return safe errors',async t => {
  const {base}=await fixture(t);
  const filename=path.join(base,'config.json');
  const c=clone(); c.targetRoot='./absent';
  await fs.writeFile(filename,JSON.stringify(c));
  await assert.rejects(loadConfig(filename),code('CONFIG'));
  await fs.writeFile(filename,'SECRET invalid JSON');
  await assert.rejects(loadConfig(filename),error => code('CONFIG')(error) && !error.message.includes('SECRET'));
});
test('marked scratch create/validate/delete; root and unrelated data survive',async t => {
  const {base,root,scratch}=await fixture(t);
  await fs.writeFile(path.join(base,'keep'),'preserved');
  assert.equal(await validateScratch(scratch),scratch.directory);
  await cleanupScratch(scratch);
  assert.equal(await fs.readFile(path.join(base,'keep'),'utf8'),'preserved');
  assert.ok((await fs.stat(root)).isDirectory());
});
test('existing unmarked root cannot be adopted',async t => {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-runner-unmarked-'));
  t.after(() => fs.rm(base,{recursive:true,force:true}));
  await fs.mkdir(path.join(base,'.scratch'),{mode:0o700});
  await assert.rejects(initializeScratchRoot(base));
  assert.deepEqual(await fs.readdir(path.join(base,'.scratch')),[]);
});
test('unmarked and wrong-nonce directories cannot be deleted',async t => {
  const {root,scratch}=await fixture(t);
  await assert.rejects(cleanupScratch({...scratch,nonce:'wrong'}),code('UNSAFE_PATH'));
  await fs.unlink(path.join(scratch.directory,'.pl-beta-runner-owner.json'));
  await assert.rejects(cleanupScratch(scratch),code('UNSAFE_PATH'));
  assert.ok((await fs.stat(scratch.directory)).isDirectory());
  await assert.rejects(cleanupScratch({...scratch,directory:root}),code('UNSAFE_PATH'));
});
test('symlink root and run-directory escapes are refused',async t => {
  const {base,root,scratch}=await fixture(t);
  const outside=path.join(base,'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside,'keep'),'safe');
  const link=path.join(root,'run-link'); await fs.symlink(outside,link);
  await assert.rejects(cleanupScratch({...scratch,directory:link}),code('UNSAFE_PATH'));
  const alias=path.join(base,'alias'); await fs.symlink(base,alias);
  await assert.rejects(initializeScratchRoot(alias),code('UNSAFE_PATH'));
  assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'safe');
});
test('marker symlink and sibling-prefix escape are refused',async t => {
  const {base,root,scratch}=await fixture(t);
  const marker=path.join(scratch.directory,'.pl-beta-runner-owner.json');
  const outside=path.join(base,'marker-copy'); await fs.copyFile(marker,outside);
  await fs.unlink(marker); await fs.symlink(outside,marker);
  await assert.rejects(validateScratch(scratch),code('UNSAFE_PATH'));
  const sibling=root+'-outside'; await fs.mkdir(sibling);
  await assert.rejects(cleanupScratch({...scratch,directory:sibling}),code('UNSAFE_PATH'));
});
test('nested symlink cleanup unlinks link without following it',async t => {
  const {base,scratch}=await fixture(t);
  const outside=path.join(base,'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside,'keep'),'safe');
  await fs.symlink(outside,path.join(scratch.directory,'escape'));
  await cleanupScratch(scratch);
  assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'safe');
});
test('occupied port fails closed and wrong listener owner is rejected',async t => {
  const server=net.createServer();
  try { await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); }); }
  catch(error) { if(error.code==='EPERM') { t.skip('Managed environment forbids TCP bind; simulated conflict test runs separately.'); return; } throw error; }
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port=server.address().port;
  await assert.rejects(assertPortFree(port),code('PORT_CONFLICT'));
  await assert.rejects(assertListenerOwner(port,process.pid,'fake-start-time'),code('OWNERSHIP'));
});
test('owned process identity and bounded shutdown',async () => {
  const child=await spawnOwned(process.execPath,['-e',"setInterval(()=>{},1000)"],{cwd:process.cwd(),env:{PATH:'/usr/bin:/bin'}});
  try {
    // Read only the child-owned socket inode, not command-line/environment data.
    await waitFor(async () => (await fs.readdir(`/proc/${child.pid}/fd`)).length>3,1000);
    await assert.rejects(stopOwned({...child,start:'wrong'}),code('OWNERSHIP'));
  } finally { await stopOwned(child,100); }
  assert.ok(child.child.exitCode!==null || child.child.signalCode!==null);
});
test('failed executable and startup timeout are bounded',async () => {
  await assert.rejects(spawnOwned('/nonexistent/pl-runner',[],{cwd:process.cwd(),env:{}}),code('PROCESS_FAILED'));
  await assert.rejects(waitFor(async()=>false,50),code('TIMEOUT'));
});
test('forced shutdown works when a child ignores SIGTERM',async () => {
  const child=await spawnOwned(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{cwd:process.cwd(),env:{}});
  try { await new Promise(resolve=>setTimeout(resolve,150)); }
  finally { await stopOwned(child,50); }
  assert.ok(child.child.signalCode!==null);
});
test('unknown errors with secret content are replaced with safe output',() => {
  assert.equal(JSON.stringify(publicError(new Error('rpcToken=SECRET'))).includes('SECRET'),false);
});
async function cliExit(args,env={}) {
  const child=await spawnOwned(process.execPath,['dist/cli.js',...args],{cwd:process.cwd(),env});
  try {
    await waitFor(async()=>child.child.exitCode!==null,2000);
    return child.child.exitCode;
  } finally { await stopOwned(child); }
}
test('CLI rejects unknown input and keeps GUI scenarios disabled',async()=> {
  assert.equal(await cliExit(['invalid-SECRET'],{PRIVATE_TOKEN:'ENV_SECRET'}),2);
  assert.equal(await cliExit(['run']),3);
});
test('simulated occupied and unobservable ports fail closed',async()=> {
  for (const reason of ['EADDRINUSE','EPERM']) {
    const replacement=mock.method(net,'createServer',()=> {
      const server=new EventEmitter();
      server.listen=()=>{ queueMicrotask(()=>server.emit('error',Object.assign(new Error('secret'),{code:reason}))); return server; };
      return server;
    });
    try { await assert.rejects(assertPortFree(5173),code(reason==='EADDRINUSE'?'PORT_CONFLICT':'PORT_UNAVAILABLE')); }
    finally { replacement.mock.restore(); }
  }
});
test('listener proof accepts exact ownership and rejects ambiguous, wrong and remote listeners',async()=> {
  const p=require('node:fs/promises');
  const fields=Array(22).fill('0'); fields[0]='S'; fields[19]='42';
  let listeners='0: 0100007F:9755 00000000:0000 0A 0 0 0 0 0 123';
  let descriptor='socket:[123]';
  const read=mock.method(p,'readFile',async filename => filename.endsWith('/stat')
    ? '1 (fixture) '+fields.join(' ') : 'header\n'+(filename.endsWith('tcp6')?'':listeners));
  const dirs=mock.method(p,'readdir',async()=>['4']);
  const links=mock.method(p,'readlink',async()=>descriptor);
  try {
    await assertListenerOwner(38741,1,'42');
    descriptor='socket:[999]';
    await assert.rejects(assertListenerOwner(38741,1,'42'),code('OWNERSHIP'));
    descriptor='socket:[123]';
    listeners+='\n1: 0100007F:9755 00000000:0000 0A 0 0 0 0 0 456';
    await assert.rejects(assertListenerOwner(38741,1,'42'),code('OWNERSHIP'));
    listeners='0: 00000000:9755 00000000:0000 0A 0 0 0 0 0 123';
    await assert.rejects(assertListenerOwner(38741,1,'42'),code('OWNERSHIP'));
  } finally { read.mock.restore(); dirs.mock.restore(); links.mock.restore(); }
});
test('shutdown reaps live descendants after leader exits',async t=> {
  const {base}=await fixture(t);
  const ready=path.join(base,'descendant-ready');
  const script="const {spawn}=require('child_process');const child=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});require('fs').writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000)";
  const owned=await spawnOwned(process.execPath,['-e',script,ready],{cwd:process.cwd(),env:{}});
  try {
    await waitFor(async()=>{try{return Boolean(await fs.readFile(ready,'utf8'));}catch{return false;}},1000);
  } finally { await stopOwned(owned,100); }
  const pid=Number(await fs.readFile(ready,'utf8'));
  try { assert.equal((await require('../dist/processes').processIdentity(pid)).state,'Z'); }
  catch(error) { assert.ok(error instanceof RunnerError && error.code==='OWNERSHIP'); }
});
test('failed isolation probe removes only its marked scratch directory',async t=> {
  const {base,root,scratch}=await fixture(t);
  const p=require('node:fs/promises');
  const {isolationPreflight}=require('../dist/isolation');
  // Use a real Bubblewrap subprocess; this runtime is known to reject net setup.
  let result;
  try { result=await isolationPreflight(scratch,process.cwd()); }
  catch(error) { assert.equal(error.code,'ISOLATION_BLOCKED'); }
  finally { await cleanupScratch(scratch); }
  if(result) assert.equal(result.reviewed,false);
  assert.ok((await p.stat(root)).isDirectory());
  assert.ok((await p.stat(base)).isDirectory());
});
test('cleanup refuses a run whose process shutdown is unconfirmed',async t=> {
  const {scratch}=await fixture(t);
  const {markScratchBusy,markScratchIdle}=require('../dist/scratch');
  markScratchBusy(scratch);
  await assert.rejects(cleanupScratch(scratch),code('OWNERSHIP'));
  assert.ok((await fs.stat(scratch.directory)).isDirectory());
  markScratchIdle(scratch);
  await cleanupScratch(scratch);
});
test('existing Suite process and unreadable process inventory fail closed',async()=> {
  const p=require('node:fs/promises');
  const dirs=mock.method(p,'readdir',async()=>['123']);
  let denied=false;
  const read=mock.method(p,'readFile',async()=> {
    if(denied) throw Object.assign(new Error('PRIVATE'),{code:'EACCES'});
    return 'electron';
  });
  try {
    const {assertNoExistingSuite}=require('../dist/processes');
    await assert.rejects(assertNoExistingSuite(),code('OWNERSHIP'));
    denied=true;
    await assert.rejects(assertNoExistingSuite(),code('OWNERSHIP'));
  } finally { dirs.mock.restore(); read.mock.restore(); }
});
test('read-only doctor rejects missing dependencies without changing target fixture',async t=> {
  const {base}=await fixture(t);
  const target=path.join(base,'fake-target');await fs.mkdir(target);
  await fs.mkdir(path.join(target,'apps/desktop'),{recursive:true});
  const files={
    'package.json':JSON.stringify({engines:{node:'22.12.0'},packageManager:'pnpm@10.31.0',devDependencies:{electron:'41.10.6'}}),
    'apps/desktop/package.json':JSON.stringify({main:'main.js'}),
    'apps/desktop/main.js':'throw new Error("TARGET MUST NOT EXECUTE");'
  };
  for(const [name,content] of Object.entries(files)) await fs.writeFile(path.join(target,name),content);
  const config=clone();config.targetRoot=target;
  await assert.rejects(require('../dist/doctor').doctor(config),code('CONFIG'));
  for(const [name,content] of Object.entries(files)) assert.equal(await fs.readFile(path.join(target,name),'utf8'),content);
  assert.deepEqual((await fs.readdir(target)).sort(),['apps','package.json']);
});
