import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";
import {localData} from "../worker/dev-data.mjs";

function fixture(t) {
  const db = localData();
  t.after(()=>db.close());
  const env = {LAUNCHPAD_DATA:db};
  const origin = "https://studio.example";
  const project = {
    type:"web",template:"summit",name:"Trail guide",title:"A guide to weekend trails",
    intro:"Plan a walk",button:"Explore",section:"Details",details:"Browse the sample route",color:"#215044"
  };
  const id = crypto.randomUUID(), slug = "trail-guide";
  const snapshot = project => Buffer.from(JSON.stringify(project)).toString("base64url");
  const call = (path,{method="GET",user="creator",body}={}) =>
    worker.fetch(new Request(origin+path,{
      method,headers:{Origin:origin,"Content-Type":"application/json",...(user?{"oai-authenticated-user-id":user}:{})},
      body:body === undefined ? undefined : JSON.stringify(body)
    }),env);
  const write = (path,body,user,method="POST") => call(path,{method,user,body});
  const stage = async (changes={}) => {
    const result = await write("/api/releases/stage",{
      projectId:id,snapshot:snapshot({...project,...changes}),
      metadata:{slug,title:project.name,description:project.intro,visibility:"public",journey:"browse"}
    });
    assert.equal(result.status,201);
    const {stage} = await result.json();
    assert(stage.smoke.passed);
    return stage;
  };
  const publish = stage => write("/api/releases/publish",{projectId:id,stageId:stage.id});
  return {call,write,stage,publish,id,project,slug,snapshot};
}

test("launch journey keeps drafts, stable releases, attributed test orders, refunds, rollback, and operational reports consistent",async t=>{
  const {call,write,stage,publish,id,project,slug,snapshot} = fixture(t);
  const draft = await write("/api/workspace/drafts/"+id,{draft:{...project,id},expected:null},"creator","PUT");
  assert.equal(draft.status,200);
  assert.equal((await call("/api/workspace/drafts/"+id,{user:"customer"})).status,404);

  const first = await stage();
  const created = await publish(first);
  assert.equal(created.status,201);
  const release = (await created.json()).history.live;
  assert.equal((await call("/launch/"+slug+"?utm_source=video&utm_campaign=spring",{user:"customer"})).status,200);
  const offerPath = "/api/commerce/offers/"+id, store = "/api/commerce/store/"+id;
  const listing = await write(offerPath,{name:project.name,summary:"A trail guide as an HTML download",price:1200,
    currency:"usd",kind:"download",active:true,snapshot:snapshot(project)},"creator","PUT");
  assert.equal(listing.status,200);
  const orderId = crypto.randomUUID();
  const purchase = {idempotency:orderId,outcome:"success",source:"video",campaign:"spring"};
  const checkout = await write(store+"/checkout",purchase,"customer");
  assert.equal(checkout.status,200);
  assert.equal((await checkout.json()).order.status,"paid");
  assert.equal((await write(store+"/checkout",purchase,"customer")).status,200);
  assert.equal((await call(store+"/delivery/"+orderId,{user:"customer"})).status,200);
  assert.equal((await call(store+"/delivery/"+orderId,{user:"other"})).status,404);
  const paid = (await (await call("/api/operations?mode=test")).json()).report.current;
  assert.equal(paid.purchases,1);
  assert.equal(paid.money.USD.gross,1200);
  const live = (await (await call("/api/operations?mode=live")).json()).report;
  assert.equal(live.campaigns.find(item=>item.campaign==="spring").visits,1);
  assert.equal((await write(offerPath+"/"+orderId+"/refund",{})).status,200);
  assert.equal((await call(store+"/delivery/"+orderId,{user:"customer"})).status,403);
  const refunded = (await (await call("/api/operations?mode=test")).json()).report.current;
  assert.equal(refunded.refunds,1);
  assert.equal(refunded.money.USD.refunded,1200);

  assert.equal((await publish(await stage({title:"New trail routes"}))).status,201);
  assert.equal((await write("/api/releases/rollback",{slug,versionId:release})).status,200);
  const restored = (await (await call("/api/releases/view/"+slug,{user:"customer"})).json()).release;
  assert.equal(restored.id,release);
});

test("team invitation grants scoped review and publishing requires approval of the exact staged version",async t=>{
  const {call,write,stage,publish,id,project} = fixture(t);
  assert.equal((await write("/api/team",{projectId:id,name:project.name})).status,400);
  assert.equal((await write("/api/workspace/drafts/"+id,{draft:{...project,id},expected:null},"creator","PUT")).status,200);
  const add = await write("/api/team",{projectId:id,name:project.name});
  assert.equal(add.status,201);
  const {team} = await add.json();
  const teamPath = "/api/team/"+team.id;
  assert.equal((await call(teamPath,{user:"reviewer"})).status,404);
  const invite = await write(teamPath+"/invite",{role:"reviewer"});
  const {invite:code} = await invite.json();
  const token = code.split(".")[1];
  assert.equal((await write(teamPath+"/accept",{token},"reviewer")).status,200);
  assert.equal((await write(teamPath+"/accept",{token},"other")).status,409);
  assert.equal((await write(teamPath+"/settings",{requireApproval:true})).status,200);
  const first = await stage();
  assert.equal((await publish(first)).status,409);
  const review = (await (await call(teamPath,{user:"reviewer"})).json());
  assert.equal(review.stage.id,first.id);
  assert.equal((await write(teamPath+"/comment",{text:"Reviewed the route and page copy."},"reviewer")).status,200);
  assert.equal((await write(teamPath+"/approve",{stageId:first.id},"reviewer")).status,200);
  assert.equal((await publish(first)).status,201);
  const second = await stage({title:"A new headline"});
  assert.equal((await publish(second)).status,409);
  assert.equal((await write(teamPath+"/approve",{stageId:first.id},"reviewer")).status,409);
  assert.equal((await write(teamPath+"/revoke",{member:"reviewer"})).status,200);
  assert.equal((await call(teamPath,{user:"reviewer"})).status,404);
});

test("scheduled uptime checks reach the configured public host and report a failed release",async t=>{
  const db = localData();
  t.after(()=>db.close());
  const origin = "https://public.example";
  const env = {LAUNCHPAD_DATA:db,LAUNCHPAD_PUBLIC_ORIGIN:origin};
  const id = crypto.randomUUID();
  const snapshot = Buffer.from(JSON.stringify({
    type:"web",template:"summit",name:"Public launch",title:"Public launch",intro:"A public demo",
    button:"Explore",section:"Details",details:"Demo content",color:"#6453a1"
  })).toString("base64url");
  function call(path,body) {
    return worker.fetch(new Request(origin+path,{method:body?"POST":"GET",body:body?JSON.stringify(body):undefined,
      headers:{Origin:origin,"Content-Type":"application/json","oai-authenticated-user-id":"creator"}}),env);
  }
  const stage = (await (await call("/api/releases/stage",{projectId:id,snapshot,metadata:{
    slug:"public-launch",title:"Public launch",description:"Public demo",visibility:"public"
  }})).json()).stage;
  assert.equal((await call("/api/releases/publish",{projectId:id,stageId:stage.id})).status,201);
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    assert.equal(url.href,origin+"/launch/public-launch");
    assert.equal(options.method,"HEAD");
    assert.equal(options.redirect,"manual");
    return new Response(null,{status:503});
  });
  await worker.scheduled({},env);
  const operations = await (await call("/api/operations")).json();
  assert.equal(operations.checks[0].status,503);
  assert.equal(operations.report.alerts[0].code,"release-view-failed");
});

test("the operator monitor restores synthetic drafts, forms and release pointers and deduplicates runs",async t=>{
  const db=localData();
  t.after(()=>db.close());
  const env={LAUNCHPAD_DATA:db,LAUNCHPAD_MONITOR_KEY:"test-only",LAUNCHPAD_RECOVERY_DRILL:"enabled"};
  const run=token=>worker.fetch(new Request("https://studio.example/api/uptime/run",{method:"POST",headers:{Authorization:"Bearer "+token}}),env);
  assert.equal((await run("invalid")).status,403);
  const {run:receipt}=await (await run("test-only")).json();
  assert.ok(receipt.recovery.draft && receipt.recovery.forms && receipt.recovery.releasePointer);
  assert.deepEqual((await (await run("test-only")).json()).run,receipt);
  const release=await worker.fetch(new Request("https://studio.example/api/releases/view/"+receipt.recovery.slug),env);
  assert.equal((await release.json()).release.id,receipt.recovery.releaseId);
});
