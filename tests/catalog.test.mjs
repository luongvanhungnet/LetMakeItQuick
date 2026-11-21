import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";
import {localData} from "../worker/dev-data.mjs";

test("community catalog gates submissions, approves sanitized versions, and retains the last approved listing",async ()=>{
  const store = localData(":memory:");
  const env = {LAUNCHPAD_DATA:store,LAUNCHPAD_CATALOG_REVIEWER_ID:"reviewer"};
  const url = "https://studio.test";
  async function call(path,owner,body) {
    const response = await worker.fetch(new Request(url+"/api/catalog"+path,{
      method:body ? "POST" : "GET",
      ...(body ? {body:JSON.stringify(body)} : {}),
      headers:{...(owner ? {"oai-authenticated-user-id":owner} : {}),...(body ? {origin:url,"content-type":"application/json"} : {})}
    }),env);
    return {status:response.status,data:await response.json()};
  }
  const snapshot = (overrides={}) => Buffer.from(JSON.stringify({
    type:"web",template:"studio",name:"Template project",title:"Template headline",color:"#6644cc",...overrides
  })).toString("base64url");
  const payload = {title:"Starter",description:"An editable launch template.",attribution:"Example Creator",license:"CC-BY-4.0",attest:true,snapshot:snapshot()};
  try {
    assert.equal((await call("",null,payload)).status,401);
    assert.equal((await call("","creator",{...payload,attest:false})).status,400);
    assert.equal((await call("","creator",{...payload,snapshot:snapshot({blocks:[{
      id:crypto.randomUUID(),type:"image",a:"External pixel",b:"https://tracker.example/pixel.png"
    }]})})).status,400);
    assert.equal((await call("","creator",{...payload,snapshot:snapshot({details:"sk-proj-AB12345678901234567890123456789"})})).status,400);
    assert.equal((await call("","creator",{...payload,snapshot:snapshot({
      aiHistory:[{role:"user",text:"PRIVATE-CONVERSATION"}],workspaceData:{apiKey:"PRIVATE-INTEGRATION"}
    })})).status,400);
    const created = await call("","creator",payload);
    assert.equal(created.status,201,created.data.error);
    const {id,version} = created.data;
    assert.equal(version,1);
    assert.deepEqual((await call("",null)).data.templates,[]);
    assert.equal((await call("/"+id,null)).status,404);
    assert.equal((await call("/"+id+"?preview=pending","other")).status,404);
    assert.equal((await call("/"+id+"?preview=pending","reviewer")).status,200);
    assert.equal((await call("/"+id+"/review","creator",{version,decision:"approve",note:""})).status,403);
    assert.equal((await call("/"+id+"/review","reviewer",{version,decision:"approve",note:"Reviewer-only context"})).status,200);
    let listing = await call("",null);
    assert.equal(listing.data.templates[0].version,1);
    assert.equal(listing.data.templates[0].attribution,"Example Creator");
    assert.equal(listing.data.templates[0].note,undefined);
    const published = (await call("/"+id,null)).data.template;
    const decoded = Buffer.from(published.snapshot,"base64url").toString();
    assert.equal(published.note,undefined);
    assert.match(decoded,/Template headline/);
    assert.doesNotMatch(decoded,/PRIVATE-|aiHistory|workspaceData/);
    assert.equal((await call("","other",{...payload,id})).status,404);
    const revised = await call("","creator",{...payload,id,title:"Revised starter"});
    assert.equal(revised.data.version,2);
    assert.equal((await call("/"+id+"/review","reviewer",{version:1,decision:"approve",note:""})).status,409);
    assert.equal((await call("/"+id+"/review","reviewer",{version:2,decision:"reject",note:"Add a clear example."})).status,200);
    assert.equal((await call("",null)).data.templates[0].version,1);
    const third = await call("","creator",{...payload,id,title:"Updated starter"});
    assert.equal(third.data.version,3);
    assert.equal((await call("/"+id+"/review","reviewer",{version:3,decision:"approve",note:""})).status,200);
    listing = await call("",null);
    assert.equal(listing.data.templates[0].version,3);
    assert.deepEqual(listing.data.templates[0].versions,[3,1]);
    const historical = (await call("/"+id+"?version=1",null)).data.template;
    assert.equal(historical.title,"Starter");
    assert.equal(historical.snapshot,published.snapshot);
    assert.equal((await call("/"+id+"?version=2",null)).status,404);
    const internal = (await call("/submissions","creator")).data.submissions[0];
    assert.deepEqual(internal.previous.map(entry=>entry.version),[1]);
    assert.equal(internal.previous[0].snapshot,undefined);
  } finally { store.close(); }
});
