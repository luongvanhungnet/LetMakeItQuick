function releaseJSON(value,status = 200) {
  return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
function releaseReject(message,status) { return releaseJSON({error:message},status); }

function releaseBundledAsset(asset) {
  const entry = siteAssets["/"+asset];
  return {exists:!!entry,bytes:entry ? entry[1].length*(entry[2] ? .75 : 1) : 0};
}
function releaseHTMLText(value) {
  return String(value).replace(/[&"'<>]/g,char=>({"&":"&amp;",'"':"&quot;","'":"&#39;","<":"&lt;",">":"&gt;"})[char]);
}
function releaseAbsoluteAsset(request,value) {
  return value && releaseAssetURL(value) ? new URL(value.startsWith("media/") ? "/"+value : value,request.url).href : "";
}
function releaseDomainMap(env) {
  const raw = env.LAUNCHPAD_RELEASE_DOMAINS;
  if (typeof raw !== "string" || raw.length>16000) return [];
  try {
    const mapping = JSON.parse(raw);
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return [];
    return Object.entries(mapping).filter(([hostname,slug])=>
      hostname.length<=253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i.test(hostname) &&
      typeof slug === "string" && slug.length>=3 && slug.length<=60 && releaseSlugPattern.test(slug)
    ).map(([hostname,slug])=>[hostname.toLowerCase(),slug]);
  } catch { return []; }
}
function getReleaseDomainSlug(request,env) {
  const {hostname,pathname} = new URL(request.url);
  if (pathname !== "/" && pathname !== "/index.html") return "";
  return releaseDomainMap(env).find(([domain])=>domain === hostname)?.[1] || "";
}
function hostedReleaseShell(request,shell,metadata,stage,alias = false) {
  const title = stage ? "Staging · "+metadata.title : metadata.title;
  const descriptive = '<meta name="description" content="'+releaseHTMLText(metadata.description)+'">';
  const socialImage = releaseAbsoluteAsset(request,metadata.socialImage);
  const favicon = releaseAbsoluteAsset(request,metadata.favicon);
  const tag = (name,content) => '<meta property="'+name+'" content="'+releaseHTMLText(content)+'">';
  const canonical = new URL(alias ? "/" : "/launch/"+metadata.slug,request.url).href;
  const robots = !stage && metadata.visibility === "public" && metadata.index ? "index, follow" : "noindex, nofollow";
  // The shell is trusted build output. User content is only inserted after HTML encoding.
  const optimized = shell.replace(/<meta name="description"[^>]*>/i,()=>descriptive)
    .replace(/<title>[\s\S]*?<\/title>/i,()=>'<title>'+releaseHTMLText(title)+'</title>')
    .replace(/<link rel="icon"[^>]*>/i,()=>favicon?'<link rel="icon" href="'+releaseHTMLText(favicon)+'">':'<link rel="icon" href="data:,">')
    .replace("<head>",()=>'<head><base href="/"><meta name="robots" content="'+robots+'">'+
      (alias ? '<meta name="launchpad-release" content="'+releaseHTMLText(metadata.slug)+'">' : "")+
      tag("og:title",title)+tag("og:description",metadata.description)+(socialImage ? tag("og:image",socialImage) : "")+
      (stage ? "" : tag("og:type","website")+tag("og:url",canonical)+
      '<link rel="canonical" href="'+releaseHTMLText(canonical)+'">'));
  return new Response(request.method === "HEAD" ? null : optimized,{headers:{
    "Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":robots
  }});
}

async function lookupLiveRelease(env,slug) {
  if (typeof slug !== "string" || slug.length > 60 || !releaseSlugPattern.test(slug)) return null;
  const existing = await readData(env,"release-slugs",slug);
  const release = existing?.versions.find(version=>version.id === existing.live);
  return release ? {owner:existing.owner,slug,projectId:existing.projectId,release} : null;
}
async function loadReleaseStage(env,owner,projectId) {
  if (!owner || !releaseProjectPattern.test(projectId)) return null;
  return readData(env,"release-staging:"+owner,projectId);
}
function releaseHistory(doc,slug,env) {
  const live = doc.versions.find(version=>version.id === doc.live);
  const domains = live?.metadata.visibility === "public" ? releaseDomainMap(env).filter(([,mapped])=>mapped === slug).map(([domain])=>domain) : [];
  return {slug,domains,live:doc.live,updatedAt:doc.updatedAt,versions:doc.versions.map(({snapshot,...version})=>version)};
}

async function releaseBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) return null;
  const limit = 204000;
  if (!request.body || Number(request.headers.get("Content-Length")) > limit) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let size = 0;
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      if (size+value.length > limit) { void reader.cancel().catch(()=>{}); return null; }
      bytes.set(value,size);
      size += value.length;
    }
    const body = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(0,size)));
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

async function releaseDeploy(env,owner,staged) {
  const slug = staged.metadata.slug;
  const snapshot = staged.snapshot;
  const project = releaseProjectFromSnapshot(snapshot);
  const checks = releasePreflight(project,staged.metadata,releaseBundledAsset);
  const smoke = releaseSmoke(project,staged.metadata,checks);
  if (!smoke.passed) return releaseJSON({error:"Fix the blocking preflight items and stage again.",checks,smoke},422);

  for (let attempt=0;attempt<6;attempt++) {
    const current = await readData(env,"release-slugs",slug);
    if (current && (current.owner !== owner || current.projectId !== staged.projectId)) return releaseReject("That release URL is already in use. Choose another slug and stage again.",409);
    const existing = current?.versions.find(version=>version.stageId === staged.id);
    if (existing) return releaseJSON({history:releaseHistory(current,slug,env),version:existing.number,alreadyDeployed:true});
    const createdAt = new Date().toISOString();
    const version = {
      id:crypto.randomUUID(),stageId:staged.id,number:(current?.versions[0].number || 0)+1,
      snapshot,metadata:staged.metadata,checks,smoke,createdAt,
      deployment:{status:"live",checkedAt:createdAt,checks:[
        {label:"Version stored and marked live",status:"passed"},
        {label:"Live request and browser smoke test",status:"manual"}
      ]}
    };
    const next = {owner,projectId:staged.projectId,live:version.id,versions:[version,...(current?.versions || [])].slice(0,8),updatedAt:createdAt};
    if (await dataCompareAndSwap(env,"release-slugs",slug,current,next)) {
      return releaseJSON({history:releaseHistory(await recordPostDeploy(env,next,slug,version.id),slug,env),version:version.number},201);
    }
  }
  return releaseReject("Another deployment updated the release. Retry.",409);
}

async function recordPostDeploy(env,doc,slug,versionId) {
  try {
    const live = await lookupLiveRelease(env,slug);
    if (live?.release.id !== versionId) return await readData(env,"release-slugs",slug) || doc;
    const snapshot = releaseProjectFromSnapshot(live.release.snapshot);
    const issues = releasePreflight(snapshot,live.release.metadata,releaseBundledAsset);
    const passes = !issues.some(issue=>issue.severity === "block");
    const result = {status:passes?"live":"needs-review",checkedAt:new Date().toISOString(),checks:[
      {label:"Stable route resolves the intended version",status:"passed"},
      {label:"Live artifact preflight",status:passes?"passed":"failed"},
      {label:"Browser interactions",status:"manual"}
    ]};
    const next = {...doc,versions:doc.versions.map(version=>version.id === versionId ? {...version,deployment:result} : version)};
    if (await dataCompareAndSwap(env,"release-slugs",slug,doc,next)) return next;
    return await readData(env,"release-slugs",slug) || doc;
  } catch { return doc; }
}

async function handleReleases(request,env,shell) {
  const url = new URL(request.url), path = url.pathname;
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!env.LAUNCHPAD_DATA) return releaseReject("Hosted staging and releases require configured storage.",503);
  try {
    const liveRoute = /^\/(?:api\/releases\/view|launch)\/([a-z0-9-]{3,60})$/.exec(path);
    const alias = getReleaseDomainSlug(request,env);
    if ((liveRoute || alias) && ["GET","HEAD"].includes(request.method)) {
      const live = await lookupLiveRelease(env,alias || liveRoute[1]);
      if (!live || (live.release.metadata.visibility === "private" && (alias || live.owner !== owner))) {
        return releaseReject("Release unavailable.",404);
      }
      if (path.startsWith("/api/")) {
        let supportUrl = "";
        if (typeof readSupportSettings === "function") {
          try {
            const candidate = (await readSupportSettings(env,live.owner))?.supportUrl;
            if (releaseHTTPS(candidate)) supportUrl = candidate;
          } catch {}
        }
        const {id,number,snapshot,metadata,createdAt} = live.release;
        return releaseJSON({slug:live.slug,release:{id,number,snapshot,metadata,createdAt},supportUrl});
      }
      if (typeof recordReleaseVisit === "function" && request.method === "GET") {
        try { await recordReleaseVisit(request,env,live.owner,{...live.release,projectId:live.projectId,slug:live.slug},"live"); }
        catch {}
      }
      return hostedReleaseShell(request,shell,live.release.metadata,false,!!alias);
    }

    const stageRoute = /^\/(?:api\/releases\/staging|staging)\/([\w-]{1,85})$/.exec(path);
    if (stageRoute && ["GET","HEAD"].includes(request.method)) {
      const stage = await loadReleaseStage(env,owner,stageRoute[1]);
      if (!stage) return releaseReject("Staging preview unavailable.",404);
      if (path.startsWith("/api/")) {
        let checkout = null;
        if (stage.metadata.journey === "checkout") {
          const offer = await readData(env,"commerce-offers",stage.projectId);
          if (offer?.owner === owner && offer.active) checkout = {id:offer.id,version:offer.version};
        }
        return releaseJSON({stage,checkout});
      }
      if (typeof recordReleaseVisit === "function" && request.method === "GET") {
        try { await recordReleaseVisit(request,env,owner,{id:stage.id,projectId:stage.projectId,slug:stage.metadata.slug},"test"); }
        catch {}
      }
      return hostedReleaseShell(request,shell,stage.metadata,true);
    }

    if (!owner) return releaseReject("Sign in to manage hosted releases.",401);
    if (request.method === "GET" && path === "/api/releases") {
      const slug = url.searchParams.get("slug");
      const projectId = url.searchParams.get("projectId");
      const [doc,stage] = await Promise.all([
        slug && releaseSlugPattern.test(slug) && slug.length <= 60 ? readData(env,"release-slugs",slug) : null,
        projectId !== null ? loadReleaseStage(env,owner,projectId) : null
      ]);
      return releaseJSON({history:doc?.owner === owner && (!projectId || doc.projectId === projectId) ? releaseHistory(doc,slug,env) : null,stage});
    }
    if (request.method !== "POST") return releaseReject("Method unavailable.",405);
    if (request.headers.get("Origin") !== url.origin) return releaseReject("Use Studio to manage a release.",403);
    const body = await releaseBody(request);
    if (!body) return releaseReject("Enter a valid release request within the size limit.",400);

    if (path === "/api/releases/stage") {
      if (typeof body.projectId !== "string" || !releaseProjectPattern.test(body.projectId)) return releaseReject("Invalid project id.",400);
      let project;
      try { project = releaseProjectFromSnapshot(body.snapshot); }
      catch (error) { return releaseReject(error.message || "Invalid project snapshot.",400); }
      const metadata = releaseMeta(body.metadata);
      const checks = releasePreflight(project,metadata,releaseBundledAsset);
      const smoke = releaseSmoke(project,metadata,checks);
      const stage = {
        projectId:body.projectId,id:crypto.randomUUID(),snapshot:body.snapshot,metadata,checks,smoke,
        createdAt:new Date().toISOString()
      };
      await writeData(env,"release-staging:"+owner,body.projectId,stage);
      return releaseJSON({stage},201);
    }

    if (path === "/api/releases/publish") {
      if (typeof body.projectId !== "string" || typeof body.stageId !== "string") return releaseReject("Choose a staged release first.",400);
      const stage = await loadReleaseStage(env,owner,body.projectId);
      if (!stage || body.stageId !== stage.id) return releaseReject("The staged release has changed. Stage your draft again.",409);
      if (typeof teamReleaseBlock === "function" && await teamReleaseBlock(env,owner,body.projectId,stage.id)) {
        return releaseReject("A project reviewer must approve this staged version before publishing.",409);
      }
      return await releaseDeploy(env,owner,stage);
    }

    if (path === "/api/releases/rollback") {
      if (typeof body.slug !== "string" || body.slug.length > 60 || !releaseSlugPattern.test(body.slug) || typeof body.versionId !== "string") return releaseReject("Choose a release to restore.",400);
      for (let attempt=0;attempt<6;attempt++) {
        const doc = await readData(env,"release-slugs",body.slug);
        if (!doc || doc.owner !== owner) return releaseReject("Release unavailable.",404);
        if (!doc.versions.some(version=>version.id === body.versionId)) return releaseReject("Release version unavailable.",404);
        const next = {...doc,live:body.versionId,updatedAt:new Date().toISOString()};
        if (await dataCompareAndSwap(env,"release-slugs",body.slug,doc,next)) return releaseJSON({history:releaseHistory(await recordPostDeploy(env,next,body.slug,body.versionId),body.slug,env)});
      }
      return releaseReject("Another deployment is in progress. Retry.",409);
    }
    return releaseReject("Release route unavailable.",404);
  } catch {
    return releaseReject("Release storage could not complete the request. Try again.",503);
  }
}
