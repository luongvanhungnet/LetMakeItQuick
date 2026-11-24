import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";


// Optional Sites service credential from stdin, exclusively for the platform origin.
const origin="https://launchpad-studio.luongvanhungnet.chatgpt.site";
let input="";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input+=chunk;
const token=input.trim();
const browser=await chromium.launch({channel:"chromium"});
const results=[], rehearse=process.argv.includes("--rehearse");
const phase=async action=>{
  if (!token) throw Error("Supply the Site service credential to run a recovery rehearsal.");
  const key=createHash("sha256").update("launchpad-uptime-v1:"+token).digest("hex");
  const result=await fetch(origin+"/api/uptime/rehearse?action="+action,{method:"POST",redirect:"error",headers:{
    "OAI-Sites-Authorization":"Bearer "+token,Authorization:"Bearer "+key}});
  if (!result.ok) throw Error("Rehearsal phase returned HTTP "+result.status);
  return result.json();
};
let candidate,restored,restoreNeeded=false;
try {
  if (rehearse) {restoreNeeded=true;candidate=await phase("candidate");}
  for (const [name,width] of [["desktop",1280],["mobile",390]]) {
    const context=await browser.newContext({viewport:{width,height:800},serviceWorkers:"block"});
    if (token) await context.route(origin+"/**",async route=>{
      try {
        const request=route.request(), headers={"OAI-Sites-Authorization":"Bearer "+token};
        for (const key of ["origin","content-type"]) if (request.headers()[key]) headers[key]=request.headers()[key];
        const response=await fetch(request.url(),{method:request.method(),body:request.postDataBuffer() || undefined,headers,redirect:"manual",signal:AbortSignal.timeout(12000)});
        const received=Object.fromEntries(response.headers);
        delete received["content-encoding"]; delete received["content-length"];
        await route.fulfill({status:response.status,headers:received,body:Buffer.from(await response.arrayBuffer())});
      } catch { await route.abort(); }

    });
    const page=await context.newPage(), started=Date.now();
    if (rehearse && name==="mobile") {restored=await phase("restore");restoreNeeded=false;}
    const testingCandidate=rehearse && name==="desktop";
    const url=new URL("/launch/launchpad-release-check",origin);
    url.searchParams.set("utm_source","hosted-verification");
    url.searchParams.set("utm_campaign","launch-check");
    const response=await page.goto(url.href,{waitUntil:"domcontentloaded"});
    if (response.status()!==200) throw Error("Release returned HTTP "+response.status());
    const product=page.frameLocator(".published-view");
    await product.getByRole("heading",{name:testingCandidate?"Launchpad signup check":"Launchpad release check",exact:true}).waitFor({timeout:15000});
    await product.getByRole("link",{name:"Explore"}).click();
    await product.getByRole("heading",{name:"About this release"}).waitFor();
    let downloadedBytes;
    if (testingCandidate) {
      const [file]=await Promise.all([page.waitForEvent("download"),product.getByRole("link",{name:"Download verification file"}).click()]);
      const bytes=await readFile(await file.path());
      if (bytes.length!==65536 || !bytes.every(byte=>byte===65)) throw Error("Hosted download did not match the saved content");
      downloadedBytes=bytes.length;
      await product.getByLabel("Test code").fill("hosted-browser-check");
      await product.getByRole("button",{name:"Send response"}).click();
      await product.getByText("Your response was received.").waitFor();
    }
    const checks=await page.evaluate(async()=>{
      const view=await fetch("/api/releases/view/launchpad-release-check");
      const {release}=await view.json();
      const workspace=await fetch("/api/workspace/drafts");
      const staging=await fetch("/api/releases/staging/eeb3ed33-d1e6-4983-9cb2-954ee8b08852");
      const restricted=await fetch("/api/releases/view/launchpad-private-check");
      return {id:release.id,version:release.number,drafts:workspace.status,staging:staging.status,privateRelease:restricted.status};
    });
    if (![401,403].includes(checks.drafts) || ![401,403,404].includes(checks.staging)) throw Error("Private access check failed");
    if (rehearse && (checks.id!==(testingCandidate?candidate.id:restored.id) || checks.privateRelease!==404)) throw Error("Unexpected fixture version or private visibility.");
    results.push({downloadedBytes,signupSubmitted:testingCandidate,device:name,width,elapsedMs:Date.now()-started,...checks});
    await context.close();
  }
  console.log(JSON.stringify({origin,checkedAt:new Date().toISOString(),platformServiceAccess:!!token,candidate,restored,results},null,2));
} finally { try { if (restoreNeeded) await phase("restore"); } finally { await browser.close(); } }
