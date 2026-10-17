const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isolatedEnvironment,verifyIsolatedEnvironment}=require('../dist/isolation-environment');
const {sandboxArgs}=require('../dist/isolation');
const {publicError}=require('../dist/errors');
const verify=environment=>verifyIsolatedEnvironment(environment,'/scratch');
test('Bubblewrap-generated private PWD passes while reproducing the old false rejection',()=>{
 const environment={...isolatedEnvironment};
 const oldAllowlist=['PATH','HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','TMPDIR'];
 assert.equal(environment.PWD,'/scratch');
 assert.ok(Object.keys(environment).some(key=>!oldAllowlist.includes(key)));
 assert.doesNotThrow(()=>verify(environment));
});
for(const [key,reason] of [
 ['HOME','ENV_HOME_MISMATCH'],['PATH','ENV_PATH_MISMATCH'],
 ['XDG_CONFIG_HOME','ENV_XDG_CONFIG_MISMATCH'],['XDG_CACHE_HOME','ENV_XDG_CACHE_MISMATCH'],
 ['XDG_DATA_HOME','ENV_XDG_DATA_MISMATCH'],['TMPDIR','ENV_TMPDIR_MISMATCH'],['PWD','ENV_PWD_MISMATCH']
]) for(const mode of ['missing','unsafe']) test(`reject ${mode} ${key} without disclosing its value`,()=>{
 const environment={...isolatedEnvironment};
 if(mode==='missing') delete environment[key];else environment[key]='/home/PRIVATE_SECRET/normal-profile';
 assert.throws(()=>verify(environment),error=>{
   const result=publicError(error);
   assert.equal(result.isolation.stage,'FILESYSTEM_CONTAINMENT');
   assert.equal(result.isolation.reasonCode,reason);
   assert.equal(JSON.stringify(result).includes('PRIVATE_SECRET'),false);return true;
 });
});
for(const cwd of ['/','/scratch/home','/scratch/../home','/home/PRIVATE_SECRET']) test('reject noncanonical or nonprivate actual working directory: '+cwd.replace('PRIVATE_SECRET','redacted'),()=>{
 assert.throws(()=>verifyIsolatedEnvironment({...isolatedEnvironment},cwd),e=>e.diagnostic.reasonCode==='ENV_WORKING_DIRECTORY_MISMATCH');
});
for(const key of ['PRIVATE_SECRET','NODE_OPTIONS','AWS_ACCESS_KEY_ID','XAUTHORITY','DISPLAY','OLDPWD']) test(`reject unexpected environment key ${key}`,()=>{
 assert.throws(()=>verify({...isolatedEnvironment,[key]:'SENSITIVE_TEST_VALUE'}),error=>{
   assert.equal(error.diagnostic.reasonCode,'ENV_UNEXPECTED_VARIABLE');
   assert.equal(JSON.stringify(publicError(error)).includes('SENSITIVE_TEST_VALUE'),false);return true;
 });
});
test('PWD value is exact; another private path or relative spelling is not accepted',()=>{
 for(const PWD of ['/scratch/home','scratch','/scratch/','/scratch/../scratch',''])
   assert.throws(()=>verify({...isolatedEnvironment,PWD}),e=>e.diagnostic.reasonCode==='ENV_PWD_MISMATCH');
});
test('launcher environment contract retains clearenv and exact private redirects with no host passthrough',()=>{
 const args=sandboxArgs('/owned/run','/runner/dist','/node');
 const settings={};
 for(let i=0;i<args.length;i++) if(args[i]==='--setenv') settings[args[i+1]]=args[i+2];
 const expected={...isolatedEnvironment};delete expected.PWD;
 assert.deepEqual(settings,expected);
 assert.equal(args[args.indexOf('--chdir')+1],'/scratch');
 assert.ok(args.indexOf('--clearenv') < args.indexOf('--setenv'));
 assert.ok(args.includes('--unshare-all'));assert.ok(args.includes('--remount-ro'));
 assert.equal(args.includes('--share-net'),false);
 assert.equal(args.includes('--no-sandbox'),false);
 assert.equal(args.includes('--unsetenv'),false);
});
