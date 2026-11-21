import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";
import {localData} from "../worker/dev-data.mjs";

const origin = "https://studio.example";
const name = "Trail club";
const project = {type:"web",template:"summit",name,title:"Plan a weekend",intro:"Walk outdoors",button:"Plan",section:"Details",details:"Join a walk",color:"#643bed"};
const projectId = "project-1";
const fixtureMeta = {slug:"trail-club",title:"Trail & Club",description:"Find a walk",visibility:"public",index:true,socialImage:"media/forest.jpg"};

function session(t,vars = {}) {
  const db = localData();
  t.after(()=>db.close());
  const env = {LAUNCHPAD_DATA:db,...vars};
  function call(path,{method="GET",owner="owner",body,headers}={}) {
    const all = new Headers(headers || {});
    if (owner) all.set("oai-authenticated-user-id",owner);
    if (body !== undefined) {
      if (!all.has("origin")) all.set("Origin",origin);
      all.set("Content-Type","application/json");
    }
    return worker.fetch(new Request(new URL(path,origin),{method,headers:all,body:body === undefined ? undefined : JSON.stringify(body)}),env);
  }
  const code = value=>Buffer.from(JSON.stringify(value)).toString("base64url");
  const stage = (value=project,metadata=fixtureMeta,owner="owner",id=projectId) =>
    call("/api/releases/stage",{method:"POST",owner,body:{projectId:id,snapshot:code(value),metadata}});
  const publish = (stageId,owner="owner",id=projectId) =>
    call("/api/releases/publish",{method:"POST",owner,body:{projectId:id,stageId}});
  return {call,stage,publish};
}
test("release staging, deployment, public metadata and rollback honor the frozen version",async t=>{
  const {call,stage,publish} = session(t);
  const firstResult = await stage();
  assert.equal(firstResult.status,201);
  const first = (await firstResult.json()).stage;
  assert.equal(first.smoke.passed,true);
  assert.equal((await call("/staging/"+projectId,{owner:"other"})).status,404);
  const preview = await call("/staging/"+projectId);
  assert.equal(preview.headers.get("X-Robots-Tag"),"noindex, nofollow");
  assert.match(await preview.text(),/<title>Staging · Trail &amp; Club<\/title>/);
  assert.equal((await call("/launch/trail-club",{owner:null})).status,404);

  const deployed = await publish(first.id);
  assert.equal(deployed.status,201);
  const live = (await deployed.json()).history.versions[0];
  assert.equal(live.number,1);
  assert.equal(live.deployment.checks[0].status,"passed");
  assert.equal((await (await publish(first.id)).json()).alreadyDeployed,true);
  const publicResult = await call("/launch/trail-club",{owner:null});
  assert.equal(publicResult.status,200);
  assert.equal(publicResult.headers.get("X-Robots-Tag"),"index, follow");
  const html = await publicResult.text();
  assert.match(html,/<base href="\/">/);
  assert.match(html,/og:image" content="https:\/\/studio\.example\/media\/forest\.jpg"/);
  assert.match(html,/og:title" content="Trail &amp; Club"/);

  const second = (await (await stage({...project,title:"A different headline"},{...fixtureMeta,visibility:"private"})).json()).stage;
  assert.equal((await publish(first.id)).status,409);
  assert.equal((await publish(second.id)).status,201);
  assert.equal((await call("/api/releases/view/trail-club",{owner:null})).status,404);
  const restored = await call("/api/releases/rollback",{method:"POST",body:{slug:"trail-club",versionId:live.id}});
  assert.equal(restored.status,200);
  const snapshot = (await (await call("/api/releases/view/trail-club",{owner:null})).json()).release.snapshot;
  assert.equal(JSON.parse(Buffer.from(snapshot,"base64url")).title,project.title);
});
test("preflight blocks invalid destinations, unconfigured journeys and possible credentials",async t=>{
  const {call,stage,publish} = session(t);
  const block = (type,a,b)=>({id:crypto.randomUUID(),type,a,b});
  const failed = (await (await stage({...project,details:"ghp_"+"A".repeat(30),blocks:[
    block("image","","media/missing.jpg"),block("button","Read more","mailto:somewhere@example.com")
  ]},{...fixtureMeta,journey:"signup"})).json()).stage;
  assert.equal(failed.smoke.passed,false);
  assert.deepEqual(new Set(failed.checks.filter(item=>item.severity==="block").map(item=>item.code)),
    new Set(["missing-media","external-link","possible-secret","signup"]));
  assert.equal((await publish(failed.id)).status,422);
  assert.equal((await call("/api/releases?slug=trail-club",{owner:null})).status,401);
  assert.equal((await call("/api/releases/stage",{method:"POST",body:{},headers:{Origin:"https://other.example"}})).status,403);
  assert.equal((await call("/launch/trail-club",{owner:null})).status,404);
});
test("slug ownership cannot be raced or rolled back by another account",async t=>{
  const {call,stage,publish} = session(t);
  const a = (await (await stage()).json()).stage;
  const b = (await (await stage(project,fixtureMeta,"other","project-2")).json()).stage;
  const responses = await Promise.all([publish(a.id),publish(b.id,"other","project-2")]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[201,409]);
  const winner = responses[0].status === 201 ? "owner" : "other";
  const loser = winner === "owner" ? "other" : "owner";
  const info = await (await call("/api/releases?slug=trail-club",{owner:winner})).json();
  assert.equal((await call("/api/releases/rollback",{method:"POST",owner:loser,body:{slug:"trail-club",versionId:info.history.live}})).status,404);
});

test("release snapshots reject private draft fields and invalid nested project data",async t=>{
  const {stage} = session(t);
  const block = {id:crypto.randomUUID(),type:"button",a:"Go",b:"https://example.test"};
  for (const invalid of [
    {...project,aiHistory:[{reply:"A private draft conversation"}]},
    {...project,blocks:[{...block,type:"unknown"}]},
    {...project,blocks:[block,block]},
    {...project,blocks:[{...block,private:true}]},
    {...project,type:"game",game:{background:"violet-twilight",time:0,cells:{160:"lilac-explorer"}}}
  ]) {
    assert.equal((await stage(invalid)).status,400);
  }
});

test("staging offers test checkout only for its owner and active listing",async t=>{
  const {call,stage} = session(t);
  const metadata = {...fixtureMeta,journey:"checkout"};
  const id = "checkout-project";
  assert.equal((await stage(project,metadata,"owner",id)).status,201);
  assert.equal((await (await call("/api/releases/staging/"+id)).json()).checkout,null);
  const offer = await call("/api/commerce/offers/"+id,{method:"PUT",body:{
    name:"Trail checkout",summary:"Sample paid trail access",price:500,currency:"usd",kind:"access",active:true,
    snapshot:Buffer.from(JSON.stringify(project)).toString("base64url")
  }});
  assert.equal(offer.status,200);
  assert.equal((await call("/api/releases/staging/"+id,{owner:"other"})).status,404);
  assert.deepEqual((await (await call("/api/releases/staging/"+id)).json()).checkout,{id,version:"1"});
});


test("custom host aliases serve only the intended public release with an alias canonical URL",async t=>{
  const {call,stage,publish} = session(t,{LAUNCHPAD_RELEASE_DOMAINS:JSON.stringify({
    "trails.example.com":"trail-club",
    "other.example.com":"missing-release",
    "https://not-a-host.example":"trail-club"
  })});
  const alias = "https://trails.example.com/";
  assert.equal((await call(alias,{owner:null})).status,404);
  const first = (await (await stage()).json()).stage;
  const published = await publish(first.id);
  assert.equal(published.status,201);
  assert.deepEqual((await published.json()).history.domains,["trails.example.com"]);
  const result = await call(alias,{owner:null});
  assert.equal(result.status,200);
  const html = await result.text();
  assert.match(html,/<meta name="launchpad-release" content="trail-club">/);
  assert.match(html,/<link rel="canonical" href="https:\/\/trails.example.com\/">/);
  assert.match(html,/<meta property="og:image" content="https:\/\/trails.example.com\/media\/forest.jpg">/);
  assert.equal((await call("https://other.example.com/",{owner:null})).status,404);
  assert.doesNotMatch(await (await call("/")).text(),/<meta name="launchpad-release"/);
  const privateStage = (await (await stage(project,{...fixtureMeta,visibility:"private"})).json()).stage;
  const privateRelease = await publish(privateStage.id);
  assert.equal(privateRelease.status,201);
  assert.equal((await call(alias)).status,404);
  assert.equal((await call("/launch/trail-club")).status,200);
});
