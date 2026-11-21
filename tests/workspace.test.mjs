import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const moduleSource = await readFile(new URL("../worker/workspace.mjs",import.meta.url),"utf8");
const dataFunctions = `
const table = new Map();
function values(scope) {
  if (!table.has(scope)) table.set(scope,new Map());
  return table.get(scope);
}
function api(data,status = 200) { return Response.json(data,{status}); }
async function readData(env,scope,key) { return structuredClone(values(scope).get(key) ?? null); }
async function writeData(env,scope,key,value) { values(scope).set(key,structuredClone(value)); }
async function dataCompareAndSwap(env,scope,key,expected,next) {
  if (JSON.stringify(values(scope).get(key) ?? null) !== JSON.stringify(expected)) return false;
  await writeData(env,scope,key,next);
  return true;
}
async function listData(env,scope) { return [...values(scope)].map(([key,value])=>({key,value:structuredClone(value)})); }
async function deleteData(env,scope,key) { values(scope).delete(key); }
async function updateData(env,scope,key,update) {
  const current=await readData(env,scope,key);
  const next=update(current);
  await writeData(env,scope,key,next);
  return next;
}
async function lookupLiveRelease(env,slug) { return env.testReleases?.[slug] || null; }
async function deleteOwnedTeams(env,owner) { await writeData(env,"deletion-audit",owner,true); }
`;
const {handleWorkspace,writeData,readData} = await import("data:text/javascript;base64,"+Buffer.from(dataFunctions+moduleSource+"\nexport {handleWorkspace,writeData,readData};").toString("base64"));
const env = {LAUNCHPAD_DATA:true};
function request(path,{method="GET",user="person-a",body,origin="http://studio.test",bindings=env}={}) {
  const headers = {Origin:origin};
  if (user) headers["oai-authenticated-user-id"] = user;
  if (body) headers["Content-Type"] = "application/json";
  return handleWorkspace(new Request("http://studio.test/api/workspace"+path,{method,headers,body:body?JSON.stringify(body):undefined}),bindings);
}

test("cloud drafts require opt-in, retain editable versions, and isolate creators",async()=>{
  const id = crypto.randomUUID();
  const draft = {id,name:"Morning",type:"web",details:"Before"};
  assert.equal((await request("/drafts",{user:null})).status,401);
  assert.equal((await request("/drafts/"+id,{method:"PUT",body:{draft,expected:null},origin:"https://another.test"})).status,403);
  let result = await request("/drafts/"+id,{method:"PUT",body:{draft,expected:null}});
  assert.equal(result.status,200);
  const first = (await result.json()).meta.revision;
  result = await request("/drafts/"+id,{method:"PUT",body:{draft:{...draft,details:"After"},expected:first}});
  const second = (await result.json()).meta.revision;
  assert.notEqual(second,first);
  assert.equal((await request("/drafts/"+id,{method:"PUT",body:{draft,expected:first}})).status,409);
  assert.equal((await request("/drafts/"+id,{user:"person-b"})).status,404);
  assert.deepEqual((await (await request("/drafts",{user:"person-b"})).json()).drafts,[]);
  const previous = (await (await request("/drafts/"+id+"/"+first)).json()).draft;
  assert.equal(previous.details,"Before");
  const restored = await request("/drafts/"+id,{method:"PUT",body:{draft:previous,expected:second}});
  assert.equal(restored.status,200);
  assert.equal((await restored.json()).meta.versions.length,3);
  assert.equal((await (await request("/drafts/"+id)).json()).draft.details,"Before");
});

test("live forms validate the released schema, reject private submissions, and isolate the inbox",async()=>{
  const id = crypto.randomUUID(), formId = crypto.randomUUID();
  const snapshot = Buffer.from(JSON.stringify({blocks:[{id:formId,type:"form",b:"Name\nEmail"}]})).toString("base64url");
  const bindings = {...env,testReleases:{product:{owner:"person-a",projectId:id,release:{id:crypto.randomUUID(),snapshot,metadata:{visibility:"public"}}}}};
  const submit = "/forms/product/"+formId;
  assert.equal((await request(submit,{method:"POST",user:null,body:{values:["Kai","invalid"]},bindings})).status,400);
  assert.equal((await request(submit,{method:"POST",user:null,body:{values:["Kai","kai@example.com"]},bindings})).status,201);
  const owner = await request("/drafts/"+id+"/forms",{bindings});
  assert.deepEqual((await owner.json()).responses[0].fields,[{label:"Name",value:"Kai"},{label:"Email",value:"kai@example.com"}]);
  const other = await request("/drafts/"+id+"/forms",{user:"person-b",bindings});
  assert.deepEqual((await other.json()).responses,[]);
  bindings.testReleases.product.release.metadata.visibility = "private";
  assert.equal((await request(submit,{method:"POST",user:null,body:{values:["Kai","kai@example.com"]},bindings})).status,404);
});


test("cloud export and confirmed deletion affect only the owning user's cloud data",async()=>{
  const owner = "privacy-owner", other = "privacy-other", id = crypto.randomUUID(), release = crypto.randomUUID();
  const draft = {id,name:"Privacy test",type:"web"};
  assert.equal((await request("/drafts/"+id,{method:"PUT",user:owner,body:{draft,expected:null}})).status,200);
  assert.equal((await request("/drafts/"+id,{method:"PUT",user:other,body:{draft,expected:null}})).status,200);
  await writeData(env,"release-staging:"+owner,id,{id:release});
  await writeData(env,"release-slugs","privacy-product",{owner,projectId:id});
  await writeData(env,"workspace:forms:"+owner+":"+id,"contact",[{message:"Private response"}]);
  assert.equal((await request("/export",{user:null})).status,401);
  const exported = await request("/export",{user:owner});
  assert.match(exported.headers.get("content-disposition"),/attachment/);
  const exportedData = await exported.json();
  assert.equal(exportedData.drafts[0].project.id,id);
  assert.equal(exportedData.staging[0].id,release);
  assert.equal(exportedData.formResponses[0].responses[0].message,"Private response");
  assert.equal((await request("/delete",{method:"POST",user:owner,body:{confirmation:"yes"}})).status,400);
  assert.equal((await request("/delete",{method:"POST",user:owner,body:{confirmation:"DELETE"},origin:"https://other.test"})).status,403);
  assert.equal((await request("/delete",{method:"POST",user:owner,body:{confirmation:"DELETE"}})).status,200);
  assert.equal((await request("/drafts/"+id,{user:owner})).status,404);
  assert.equal((await request("/drafts/"+id,{user:other})).status,200);
  assert.equal(await readData(env,"release-staging:"+owner,id),null);
  assert.equal(await readData(env,"workspace:forms:"+owner+":"+id,"contact"),null);
  assert.ok(await readData(env,"release-slugs","privacy-product"));
  assert.equal(await readData(env,"deletion-audit",owner),true);
});
