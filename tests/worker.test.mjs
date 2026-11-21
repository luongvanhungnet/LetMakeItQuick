import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

const base = "http://localhost";
const clip = "/media/clips/forest.mp4";
const request = (path, options, env = {}) => worker.fetch(new Request(base+path,options),env);
const post = (input, env = {}, headers = {}) => request("/api/ai",{
  method:"POST", headers:{Origin:base,"oai-authenticated-user-id":"test","Content-Type":"application/json",...headers},
  body:typeof input === "string" ? input : JSON.stringify(input)
},env);

test("Worker serves the generated app, rejects missing assets and supports HEAD",async () => {
  assert.match(await (await request("/")).text(), /Launchpad Studio/);
  assert.equal((await request("/app.js")).status,200);
  assert.equal((await request("/missing")).status,404);
  const head = await request(clip,{method:"HEAD"});
  assert.equal(head.status,200);
  assert.equal(head.body,null);
  assert.equal(head.headers.get("Accept-Ranges"),"bytes");
  assert.ok(Number(head.headers.get("Content-Length"))>100);
});

test("single, open and suffix byte ranges return exactly the advertised bytes",async () => {
  const full = new Uint8Array(await (await request(clip)).arrayBuffer());
  for (const [range,start,end] of [["bytes=3-9",3,9],["bytes=0-",0,full.length-1],
    ["bytes=-20",full.length-20,full.length-1],["Bytes=1-9999999999",1,full.length-1]]) {
    const response = await request(clip,{headers:{Range:range}});
    assert.equal(response.status,206,range);
    assert.equal(response.headers.get("Content-Range"),"bytes "+start+"-"+end+"/"+full.length);
    assert.equal(Number(response.headers.get("Content-Length")),end-start+1);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),full.slice(start,end+1));
  }
  for (const range of ["bytes=-","bytes=9-3","bytes=-0","bytes="+full.length+"-"]) {
    const response = await request(clip,{headers:{Range:range}});
    assert.equal(response.status,416);
    assert.equal(response.headers.get("Content-Range"),"bytes */"+full.length);
  }
  for (const headers of [{Range:"bytes=1-2","If-Range":'"old"'},{Range:"bytes=1-2,5-6"},{Range:"frames=1-2"}]) {
    const response = await request(clip,{headers});
    assert.equal(response.status,200);
    assert.equal(Number(response.headers.get("Content-Length")),full.length);
  }
});

test("API enforces origin, auth, JSON media type and bounded valid history",async () => {
  const env = {OPENAI_API_KEY:"fixture"};
  const input = {type:"web",prompt:"Change the headline"};
  assert.equal((await request("/api/ai")).status,200);
  assert.equal((await post(input,env,{Origin:"https://elsewhere.test"})).status,403);
  assert.equal((await post(input,env,{"oai-authenticated-user-id":""})).status,403);
  assert.equal((await post(input)).status,503);
  assert.equal((await post(input,env,{"Content-Type":"application/json-other"})).status,415);
  assert.equal((await post("{",env)).status,400);
  assert.equal((await post(" ".repeat(84001),env)).status,413);
  assert.equal((await post({...input,history:Array(9).fill({role:"user",text:"old"})},env)).status,400);
  assert.equal((await post({...input,history:[{role:"system",text:"old"}]},env)).status,400);
});

test("API maps upstream failures and accepts a structured proposal",async t => {
  const env = {OPENAI_API_KEY:"fixture"};
  const input = {type:"web",prompt:"Change the headline",history:[{role:"user",text:"earlier"}]};
  let upstream;
  t.mock.method(globalThis,"fetch",async (url,options) => {
    assert.equal(url,"https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.store,false);
    assert.deepEqual(JSON.parse(body.input).history,input.history);
    assert.ok(options.signal instanceof AbortSignal);
    return upstream();
  });
  for (const [response,status] of [
    [() => new Response(null,{status:401}),502],
    [() => new Response(null,{status:403}),502],
    [() => new Response(null,{status:429}),429],
    [() => new Response(null,{status:500}),502],
    [() => { throw new DOMException("expired","TimeoutError"); },504],
    [() => Response.json({output:null}),502],
    [() => Response.json({output:[{content:[{type:"output_text",text:"null"}]}]}),502],
    [() => Response.json({status:"incomplete",output:[]}),502],
    [() => Response.json({output:[{content:[{type:"output_text",text:'{"fields":{"title":"New"}}'}]}]}),200]
  ]) {
    upstream = response;
    const result = await post(input,env);
    assert.equal(result.status,status);
    assert.equal(result.headers.get("Cache-Control"),"no-store");
    if (status === 200) assert.deepEqual(await result.json(),{plan:{fields:{title:"New"}}});
  }
});


test("3D movement sweeps large deltas and slides past corners only after clearing the wall",async () => {
  const {readFile} = await import("node:fs/promises");
  const {runInNewContext} = await import("node:vm");
  const source = await readFile(new URL("../dist/game-3d.js",import.meta.url),"utf8");
  const {createWorld3D,stepWorld3D} = runInNewContext(source+"\n;({createWorld3D,stepWorld3D})",{gameTemplates:[{},{}]});
  const world = createWorld3D({width:6,height:6,cells:{7:"hero",13:"rock",35:"gate"},roles:{hero:"player",rock:"wall",gate:"exit"}});
  stepWorld3D(world,0,3,.9);
  assert.ok(world.z > 1.5 && world.z < 1.78,world.z);
  stepWorld3D(world,.4,.4,.2);
  assert.ok(world.x > 1.8 && world.x < 2 && world.z < 1.78);
  stepWorld3D(world,1,.5,.4);
  assert.ok(world.x > 2.2 && world.z > 1.78);
});
