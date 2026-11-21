import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {localData} from "../worker/dev-data.mjs";

const source = ["data.mjs","operations.mjs"].map(name=>readFileSync(new URL("../worker/"+name,import.meta.url),"utf8")).join("\n")+
  "\nexport {handleOperations,writeData,recordReleaseVisit,recordOperation,readSupportSettings,opsBuildReport,opsOrderEvents,deleteOperationsData,recordCohortVisit,summarizeCohorts,listData};";
const {handleOperations,writeData,recordReleaseVisit,recordOperation,readSupportSettings,opsBuildReport,opsOrderEvents,deleteOperationsData,recordCohortVisit,summarizeCohorts,listData} =
  await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const base = "https://studio.example.test";
const projectId = "product-1", releaseId = "release-1";
const owner = "person-a";
const release = {id:releaseId,number:1,projectId,metadata:{title:"Acme",visibility:"public"}};
const launch = {owner,projectId,live:releaseId,versions:[release]};
function op(env,path="",user=owner,body,origin=base) {
  return handleOperations(new Request(base+"/api/operations"+path,{method:body===undefined?"GET":"POST",
    headers:{...(user?{"oai-authenticated-user-id":user}:{}),Origin:origin,"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)}),env);
}
function inMemory(t) {
  const LAUNCHPAD_DATA = localData();
  t.after(()=>LAUNCHPAD_DATA.close());
  return {LAUNCHPAD_DATA};
}

test("customer, test and other workspaces are isolated, and revenue reflects the order ledger",async t=>{
  const env = inMemory(t);
  const createdAt = new Date().toISOString();
  await writeData(env,"release-slugs","acme",launch);
  await writeData(env,"commerce-offers","acme",{owner,projectId,orders:{
    order:{id:"order",mode:"test",status:"refunded",checkoutProvider:"stripe",price:2500,fee:130,currency:"usd",releaseId,
      paidAt:createdAt,refundedAt:createdAt,source:"video",campaign:"launch",buyer:"private-buyer",email:"private@test.invalid"},
    failure:{id:"failure",mode:"test",status:"failed",releaseId,failedAt:createdAt}
  }});
  await recordReleaseVisit(new Request(base+"/launch/acme?utm_source=video&utm_campaign=launch"),env,owner,release);
  await recordReleaseVisit(new Request(base+"/launch/acme?utm_source=studio",{headers:{"oai-authenticated-user-id":owner}}),env,owner,release);
  await recordReleaseVisit(new Request(base+"/launch/acme?utm_source=bot",{headers:{"Sec-Purpose":"prefetch"}}),env,owner,release);
  await recordReleaseVisit(new Request(base+"/launch/acme?utm_source=probe",{headers:{"X-Launchpad-Probe":"uptime"}}),env,owner,release);
  await recordOperation(env,owner,"signup",{projectId,releaseId,mode:"live",source:"video",campaign:"launch"});
  const {report,releases,reconciliation} = await (await op(env)).json();
  assert.equal(report.current.visits,1);
  assert.equal(report.current.signups,1);
  assert.equal(report.current.purchases,0);
  assert.equal(releases[0].id,releaseId);
  assert.equal(reconciliation.sandboxReady,true);
  assert.deepEqual(report.campaigns.map(c=>[c.source,c.campaign,c.visits,c.signups]),[["video","launch",1,1]]);
  const sandbox = await (await op(env,"?mode=test&days=7")).json();
  assert.equal(sandbox.report.current.visits,1);
  assert.equal(sandbox.report.current.purchases,1);
  assert.equal(sandbox.report.current.refunds,1);
  assert.equal(sandbox.report.current.failedPayments,1);
  assert.deepEqual(sandbox.report.current.money.USD,{gross:2500,fees:130,refunded:2500,net:-130});
  assert.equal(sandbox.report.alerts[0].ref,"failure");
  assert.doesNotMatch(JSON.stringify(sandbox),/private-buyer|private@test/);
  const other = await (await op(env,"?mode=test","person-b")).json();
  assert.equal(other.report.current.visits,0);
  assert.equal(other.report.current.purchases,0);
  assert.equal(other.releases.length,0);
});

test("date comparison keeps transactions in the period they occurred",()=>{
  const paidAt = "2026-04-03T12:00:00Z", refundedAt = "2026-04-05T12:00:00Z";
  const events = opsOrderEvents({projectId,orders:{id:{id:"id",mode:"live",status:"refunded",currency:"usd",
    price:1500,fee:90,refundFee:50,releaseId,paidAt,refundedAt}}});
  const report = opsBuildReport(events,{mode:"live",days:2,now:Date.parse("2026-04-05T13:00:00Z")});
  assert.equal(report.current.purchases,0);
  assert.equal(report.previous.purchases,1);
  assert.equal(report.current.refunds,1);
  assert.equal(report.current.money.USD.net,-1450);
  assert.equal(report.previous.money.USD.net,1410);
  assert.deepEqual(report.series.map(s=>s.refunds),[0,1]);
});

test("owner controls validate origins, resolve alerts, persist failed checks and delete telemetry only",async t=>{
  const env = inMemory(t);
  await writeData(env,"release-slugs","acme",launch);
  await writeData(env,"commerce-offers","acme",{owner,projectId,orders:{}});
  assert.equal((await op(env,"",null)).status,401);
  assert.equal((await op(env,"/settings",owner,{supportUrl:"javascript:alert(1)"})).status,400);
  assert.equal((await op(env,"/settings",owner,{supportUrl:"https://support.example.test"},"https://offsite.test")).status,403);
  assert.equal((await op(env,"/settings",owner,{supportUrl:"https://support.example.test/help"})).status,200);
  assert.equal((await readSupportSettings(env,owner)).supportUrl,"https://support.example.test/help");
  assert.equal((await op(env,"/simulate","person-b",{slug:"acme"})).status,404);
  assert.equal((await op(env,"/simulate",owner,{slug:"acme"})).status,200);
  const simulation = await (await op(env,"?mode=test")).json();
  const [{id,releaseId:affected}] = simulation.report.alerts;
  assert.equal(affected,releaseId);
  assert.equal((await op(env,"/dismiss",owner,{id})).status,200);
  assert.equal((await (await op(env,"?mode=test")).json()).report.alerts.length,0);
  assert.equal((await (await op(env)).json()).report.current.applicationErrors,0);
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    assert.equal(url.href,base+"/launch/acme");
    assert.equal(options.method,"HEAD");
    assert.equal(options.redirect,"manual");
    return new Response(null,{status:503});
  });
  assert.equal((await op(env,"/check",owner,{slug:"acme"})).status,200);
  assert.equal((await (await op(env)).json()).checks[0].ok,false);
  await deleteOperationsData(env,owner);
  const cleared = await (await op(env)).json();
  assert.deepEqual(cleared.settings,{supportUrl:""});
  assert.equal(cleared.checks.length,0);
  assert.equal(cleared.releases.length,1);
});

test("signed-in retention groups first visits and returns without exposing account identifiers",async t=>{
  const env = {...inMemory(t),LAUNCHPAD_RETENTION_ANALYTICS:"enabled"};
  const time = value=>Date.parse(value+"T12:00:00Z");
  await recordCohortVisit(env,owner,release,owner,time("2026-04-06"));
  await recordCohortVisit(env,owner,release,"signed-in-user-a",time("2026-04-06"));
  await recordCohortVisit(env,owner,release,"signed-in-user-a",time("2026-04-13"));
  await recordCohortVisit(env,owner,release,"signed-in-user-a",time("2026-04-15"));
  await recordCohortVisit(env,owner,release,"signed-in-user-b",time("2026-04-08"));
  const rows = await listData(env,"operation-cohorts:"+owner);
  assert.equal(rows.length,2);
  assert(!JSON.stringify(rows).includes("signed-in-user"));
  assert.deepEqual(summarizeCohorts(rows.map(row=>row.value),{now:time("2026-04-17"),releaseId}),[
    {week:"2026-04-06",visitors:2,returning:[1,null,null,null]}
  ]);
  await deleteOperationsData(env,owner);
  assert.deepEqual(await listData(env,"operation-cohorts:"+owner),[]);
});
