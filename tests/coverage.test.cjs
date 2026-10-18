const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {smokeIds}=require('../dist/smoke-contract');
const {inspectCapabilityRegistry,makeCoverage,validateCoverage}=require('../dist/coverage');
const digest='a'.repeat(64);
const entries=[
 {id:'PL-CODE-FILE-001',status:'complete'},
 {id:'PL-CODE-FILE-002',status:'complete'},
 {id:'PL-CODE-FILE-003',status:'complete'},
 {id:'PL-CORE-SHELL-001',status:'complete'},
 {id:'PL-CORE-PROJECT-001',status:'partial'},
 {id:'PL-CODE-EDITOR-002',status:'missing'}
];
const inventory={digest,capabilities:entries.map(x=>({id:x.id,registryStatus:x.status})).sort((a,b)=>a.id.localeCompare(b.id))};
const scenarios=smokeIds.map(id=>({id,result:'PASS'}));
test('coverage links only exact registry behaviors and leaves the whole-product denominator unverified',()=>{
 const c=makeCoverage(inventory,scenarios);
 assert.equal(c.implementedCapabilities,5);
 assert.equal(c.applicableBehaviorDenominator,null);
 assert.equal(c.denominatorReason,'BEHAVIOR_APPLICABILITY_NOT_IN_REGISTRY');
 assert.equal(c.scenarios[2].mapping,'UNMAPPED');
 assert.equal(c.scenarios[4].mapping,'UNMAPPED');
 assert.deepEqual(c.scenarios[3].capabilityIds,['PL-CODE-FILE-001','PL-CODE-FILE-002','PL-CODE-FILE-003']);
 assert.equal(c.capabilities.find(x=>x.id==='PL-CORE-PROJECT-001').coverage,'NOT_COVERED');
 assert.equal(c.capabilities.find(x=>x.id==='PL-CODE-EDITOR-002').coverage,'UNSUPPORTED');
 assert.equal(c.manualCoverage,'NOT_ASSESSED');
 assert.deepEqual(c.registryCounts,{complete:4,partial:1,missing:1,blocked:0,deferred:0});
 assert.deepEqual(c.coverageCounts,{withValidatedBehavior:4,withFailedBehavior:0,blocked:0,notCovered:1,unsupported:1,deferred:0});
 assert.deepEqual(validateCoverage(c,scenarios),c);
});
test('failure, fail-fast skip and infrastructure block are distinct and cannot inflate coverage',()=>{
 const failed=scenarios.map((s,i)=>({...s,result:i<2?'PASS':i===2?'FAIL':'NOT_RUN'}));
 const c=makeCoverage(inventory,failed);
 assert.deepEqual(c.scenarioCounts,{implemented:5,executed:3,passed:2,failed:1,blocked:0,skipped:2});
 assert.equal(c.capabilities.find(x=>x.id==='PL-CODE-FILE-001').coverage,'NOT_COVERED');
 const blocked=makeCoverage(undefined,scenarios.map(s=>({...s,result:'NOT_RUN'})));
 assert.equal(blocked.registry,'NOT_VERIFIED');assert.equal(blocked.scenarioCounts.blocked,5);
 assert.equal(blocked.registryCounts.complete,null);assert.equal(blocked.coverageCounts.unsupported,null);
 assert.ok(blocked.scenarios.every(s=>s.mapping==='NOT_VERIFIED'));
 for(const mutate of [v=>v.capabilities[0].token='SECRET',v=>v.capabilities[0].coverage='PASS',v=>v.scenarios[2].mapping='VERIFIED',v=>v.implementedCapabilities=329,v=>v.applicableBehaviorDenominator=94]){
  const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateCoverage(bad,failed));
 }
});
test('registry inventory is bounded, canonical, unique and refuses linked files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pl-coverage-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=path.join(root,'docs/capabilities/registry');await fs.mkdir(directory,{recursive:true});
 const file=path.join(directory,'core.json');await fs.writeFile(file,JSON.stringify({capabilities:entries}));
 const found=await inspectCapabilityRegistry(root);
 assert.equal(found.capabilities.length,6);assert.match(found.digest,/^[a-f0-9]{64}$/);
 await fs.writeFile(file,JSON.stringify({capabilities:[...entries,entries[0]]}));
 await assert.rejects(inspectCapabilityRegistry(root));
 await fs.writeFile(file,JSON.stringify({capabilities:entries}));
 await fs.symlink(file,path.join(directory,'alias.json'));
 await assert.rejects(inspectCapabilityRegistry(root));
});
