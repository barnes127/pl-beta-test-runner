const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {RunnerError}=require('../dist/errors');
const {copyInputs,assertDisposableProject}=require('../dist/runtime-files');
const {initializeScratchRoot,createScratch,cleanupScratch}=require('../dist/scratch');
const {sandboxArgs}=require('../dist/isolation');
const {verifyMounts}=require('../dist/isolation-proof');
const {waitFor,stopOwned,spawnOwned}=require('../dist/processes');
async function fixture(t) {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'pl-acceptance-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const scratch=await createScratch(await initializeScratchRoot(base));
  return {base,scratch};
}
test('sandbox has no host-root/home/credential/display mount or security bypass',()=>{
  const args=sandboxArgs('/owned/run','/runner/dist','/node');
  assert.ok(args.includes('--unshare-all'));
  assert.ok(args.includes('--clearenv'));
  assert.ok(args.includes('--remount-ro'));
  assert.equal(args.includes('--share-net'),false);
  assert.equal(args.includes('--no-sandbox'),false);
  for(let i=0;i<args.length;i++) if(['--ro-bind','--bind'].includes(args[i])) {
    assert.notEqual(args[i+1],'/');
    assert.equal(/^\/home\//.test(args[i+1]),false);
    assert.equal(/X11|wayland|\.aws|\.plcs|PLProjects/.test(args[i+1]),false);
  }
});
test('mount proof rejects writable system/input roots and missing private scratch',()=>{
  const locations=['/','/usr','/bin','/lib','/lib64','/runner','/runtime/node','/target','/electron'];
  const table=locations.map((p,i)=>`${i+1} 0 0:1 / ${p} ro - tmpfs none ro`).join('\n')+'\n99 0 0:1 / /scratch rw - tmpfs none rw';
  verifyMounts(table);
  assert.throws(()=>verifyMounts(table.replace('/usr ro','/usr rw')));
  assert.throws(()=>verifyMounts(table.replace('/target ro','/target rw')));
  assert.throws(()=>verifyMounts(table.replace('/scratch rw','/scratch ro')));
});
test('input staging copies permitted assets but refuses symlinks and credential-like hidden files',async t=>{
  const {base}=await fixture(t);
  const source=path.join(base,'inputs');await fs.mkdir(source);
  await fs.writeFile(path.join(source,'main.js'),'module.exports=1');
  await copyInputs(source,path.join(base,'copied'),new Set(['.js']));
  assert.equal(await fs.readFile(path.join(base,'copied/main.js'),'utf8'),'module.exports=1');
  await fs.writeFile(path.join(source,'.env'),'FAKE_TEST_SECRET');
  await assert.rejects(copyInputs(source,path.join(base,'refuse-hidden'),new Set(['.js'])),e=>e.code==='UNSAFE_PATH');
  await fs.unlink(path.join(source,'.env'));
  await fs.symlink('/etc/passwd',path.join(source,'escape.js'));
  await assert.rejects(copyInputs(source,path.join(base,'refuse-link'),new Set(['.js'])),e=>e.code==='UNSAFE_PATH');
});
test('input root with a symlink parent is refused',async t=>{
  const {base}=await fixture(t);
  await fs.mkdir(path.join(base,'actual'));await fs.mkdir(path.join(base,'actual/sub'));
  await fs.symlink(path.join(base,'actual'),path.join(base,'alias'));
  await assert.rejects(copyInputs(path.join(base,'alias/sub'),path.join(base,'out'),new Set(['.js'])),e=>e.code==='UNSAFE_PATH');
});
test('normal, sibling and symlink project paths are forbidden; only scratch projects accepted',async t=>{
  const {base,scratch}=await fixture(t);
  const projects=path.join(scratch.directory,'home/PLProjects');await fs.mkdir(projects,{recursive:true});
  const owned=path.join(projects,'fixture');await fs.mkdir(owned);
  assert.equal(await assertDisposableProject(scratch,owned),owned);
  const normal=path.join(base,'normal-business-data');await fs.mkdir(normal);
  await assert.rejects(assertDisposableProject(scratch,normal),e=>e.code==='UNSAFE_PATH');
  const link=path.join(projects,'escape');await fs.symlink(normal,link);
  await assert.rejects(assertDisposableProject(scratch,link),e=>e.code==='UNSAFE_PATH');
  await assert.rejects(assertDisposableProject(scratch,projects),e=>e.code==='UNSAFE_PATH');
  await cleanupScratch(scratch);assert.ok((await fs.stat(normal)).isDirectory());
});
test('shutdown failure is reported instead of claiming success',async()=>{
  const fields=Array(22).fill('0');fields[0]='S';fields[2]='123';fields[3]='123';fields[19]='42';
  const read=mock.method(fs,'readFile',async()=>`123 (fixture) ${fields.join(' ')}`);
  const dirs=mock.method(fs,'readdir',async()=>['123']);
  const kill=mock.method(process,'kill',()=>{throw Object.assign(new Error('failure'),{code:'EPERM'});});
  try {await assert.rejects(stopOwned({pid:123,start:'42',child:{exitCode:null,signalCode:null}},1));}
  finally {read.mock.restore();dirs.mock.restore();kill.mock.restore();}
});
test('stalled readiness times out and the real owned child is stopped',async()=>{
  const child=await spawnOwned(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:process.cwd(),env:{}});
  try {await assert.rejects(waitFor(async()=>false,60),e=>e instanceof RunnerError && e.code==='TIMEOUT');}
  finally {await stopOwned(child);}
  assert.ok(child.child.signalCode || child.child.exitCode!==null);
});
test('launch revalidates configuration before any process or filesystem setup',async()=>{
  const config=structuredClone(require('../config/example.target.json'));config.allowGuiMutations=true;
  await assert.rejects(require('../dist/launch').launch(config,process.cwd()),e=>e.code==='CONFIG');
});
test('persistent lease from a previous runner process prevents automatic deletion',async t=>{
  const {scratch}=await fixture(t);
  await fs.writeFile(path.join(scratch.directory,'.active-process.json'),JSON.stringify({nonce:scratch.nonce,owner:999999}));
  await assert.rejects(cleanupScratch(scratch),e=>e.code==='OWNERSHIP');
  assert.ok((await fs.stat(scratch.directory)).isDirectory());
});
test('dependency stores are excluded from source staging',async t=>{
  const {base}=await fixture(t);
  const source=path.join(base,'source');await fs.mkdir(path.join(source,'node_modules'),{recursive:true});
  await fs.writeFile(path.join(source,'main.js'),'module.exports=true');
  await fs.writeFile(path.join(source,'node_modules/.env'),'FAKE_CREDENTIAL');
  const output=path.join(base,'snapshot');await copyInputs(source,output,new Set(['.js']));
  assert.deepEqual(await fs.readdir(output),['main.js']);
});
test('failed containment stops launch before target process creation and cleans marked scratch',async t=>{
  const {base}=await fixture(t);
  const config=structuredClone(require('../config/example.target.json'));
  const doctor=mock.method(require('../dist/doctor'),'doctor',async()=>({electronExecutable:'/unused/electron'}));
  const proof=mock.method(require('../dist/isolation'),'isolationPreflight',async()=>{throw new RunnerError('ISOLATION_BLOCKED','Fixture denied');});
  const spawn=mock.method(require('../dist/processes'),'spawnOwned',async()=>{throw new Error('Must never launch');});
  const before=await fs.readdir(path.join(base,'.scratch'));
  try {
    await assert.rejects(require('../dist/launch').launch(config,base),e=>e.code==='ISOLATION_BLOCKED');
    assert.equal(spawn.mock.callCount(),0);
    assert.deepEqual(await fs.readdir(path.join(base,'.scratch')),before);
  } finally {doctor.mock.restore();proof.mock.restore();spawn.mock.restore();}
});
