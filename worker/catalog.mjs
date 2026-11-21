const catalogScope = "catalog:templates";
const catalogLicenses = new Set(["CC0-1.0","CC-BY-4.0","MIT"]);
const catalogRetainedPublicationLimit = 8;
const catalogArchiveScope = id => "catalog:archive:"+id;
const catalogAllowedFields = ["name","title","intro","section","details","button","color","buttonTarget","hideTemplate"];
const catalogBlocks = new Set([
  "heading","text","quote","list","stats","callout","image","video","audio","button","faq","checklist",
  "counter","progress","columns","divider","spacer","form","records","downloads","signin","integration"
]);
const catalogBundledTemplates = new Set(["blank","studio","summit","brew","pulse","daily","pocket","field-guide","harbor-portal","atlas-launch"]);

function catalogString(value,length,required = true) {
  if (typeof value !== "string" || value.length > length || (required && !value.trim())) {
    throw workspaceError("Enter valid template details.",400);
  }
  const result = value.trim();
  if (/\b(?:sk-(?:proj-|live_|test_)?[\w-]{22,}|gh[pousr]_[\w]{25,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)/.test(result)) {
    throw workspaceError("Remove credential-looking content before submitting a template.",400);
  }
  return result;
}

function catalogSnapshots(code) {
  const project = releaseProjectFromSnapshot(code);
  if (!["web","app"].includes(project.type)) throw workspaceError("Submit a website or web app template.",400);
  const pages = project.pages || [];
  const ids = new Set(pages.map(page=>page.id));
  if (ids.has("home") || ids.size !== pages.length || pages.some(page=>!workspaceId.test(page.id) || !page.name || page.name.length>50)) {
    throw workspaceError("Review the template’s page names and destinations.",400);
  }
  ids.add("home");
  const blockIds = new Set();
  function scrub(page) {
    const clean = {};
    for (const field of catalogAllowedFields) if (typeof page[field] === "string" && field !== "hideTemplate") {
      clean[field] = catalogString(page[field],900,false);
    }
    if (page.color && !/^#[\da-f]{6}$/i.test(page.color)) throw workspaceError("Use a valid template accent color.",400);
    if (page.hideTemplate === true) clean.hideTemplate = true;
    if (clean.buttonTarget && !ids.has(clean.buttonTarget)) throw workspaceError("A template button points to a missing page.",400);
    if (page.blocks) clean.blocks = page.blocks.map(block=>{
      if (!catalogBlocks.has(block.type) || !workspaceId.test(block.id) || blockIds.has(block.id)) {
        throw workspaceError("Review the template’s blocks before submitting.",400);
      }
      blockIds.add(block.id);
      if (block.imageData || (["image","video","audio","downloads"].includes(block.type) &&
          (!releaseLocalAsset(block.b) || !Object.hasOwn(siteAssets,"/"+block.b.replace(/^\//,""))))) {
        throw workspaceError("Community templates can include files from the built-in library. Remove private uploads and external media.",400);
      }
      const a = catalogString(block.a,700,false), b = catalogString(block.b,700,false);
      const item = {id:block.id,type:block.type,a,b};
      if (block.type === "image") {
        for (const field of ["credit","license"]) {
          if (typeof block[field] === "string" && block[field].trim()) item[field] = catalogString(block[field],160);
        }
      }
      if (block.pageTarget) {
        if (block.type !== "button" || !ids.has(block.pageTarget)) throw workspaceError("A page link points to a missing page.",400);
        item.pageTarget = block.pageTarget;
      }
      if (block.type === "integration" || (block.type === "button" && !item.pageTarget)) {
        if (!releaseHTTPS(b)) throw workspaceError("External buttons require an HTTPS link.",400);
      }
      return item;
    });
    return clean;
  }
  const clean = {
    ...scrub(project),template:catalogBundledTemplates.has(project.template) ? project.template : "blank",type:project.type,
    pages:pages.map(page=>({...scrub(page),id:page.id}))
  };
  if (Array.isArray(project.templateCredit)) clean.templateCredit = project.templateCredit.slice(-8).filter(item=>
    item && typeof item.id === "string" && workspaceId.test(item.id) && Number.isSafeInteger(item.version) && item.version > 0 &&
    catalogLicenses.has(item.license)).map(item=>({
      id:item.id,version:item.version,license:item.license,
      title:catalogString(item.title,70),attribution:catalogString(item.attribution,80)
    }));
  if (!clean.name?.trim()) throw workspaceError("Name the project before submitting.",400);
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  let binary = "";
  for (let index=0;index<bytes.length;index+=4096) binary += String.fromCharCode(...bytes.subarray(index,index+4096));
  return {snapshot:btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,""),
    type:clean.type,pages:["Home",...clean.pages.map(page=>page.name)]};
}

function catalogVersionView(version,includeNote = true) {
  if (!version) return null;
  const {snapshot,note,...details} = version;
  return includeNote ? {...details,note} : details;
}

async function handleCatalog(request,env) {
  const path = new URL(request.url).pathname;
  const owner = workspacePrincipal(request);
  const reviewer = !!owner && owner === env.LAUNCHPAD_CATALOG_REVIEWER_ID;
  const storageReady = !!env.LAUNCHPAD_DATA?.prepare;
  try {
    if (path === "/api/catalog" && request.method === "GET") {
      const rows = storageReady ? await listData(env,catalogScope) : [];
      return api({storageReady,signedIn:!!owner,reviewer,templates:rows.filter(row=>row.value.approved).map(({key,value})=>({
        id:key,...catalogVersionView(value.approved,false),
        versions:[value.approved.version,...value.previous.map(item=>item.version)]
      })).sort((a,b)=>b.reviewedAt.localeCompare(a.reviewedAt))});
    }
    if (!storageReady) return api({error:"Template submissions are unavailable until workspace storage is configured."},503);
    if (path === "/api/catalog/submissions" && request.method === "GET") {
      if (!owner) return api({error:"Sign in to view your submissions."},401);
      return api({submissions:(await listData(env,catalogScope)).filter(({value})=>reviewer || value.owner === owner).map(({key,value})=>({
        id:key,mine:value.owner === owner,approved:catalogVersionView(value.approved),candidate:catalogVersionView(value.candidate),
        previous:value.previous.map(version=>catalogVersionView(version))
      }))});
    }
    if (path === "/api/catalog" && request.method === "POST") {
      if (!owner) return api({error:"Sign in to submit a template."},401);
      const body = await workspaceInput(request,205000);
      if (!catalogLicenses.has(body.license) || body.attest !== true) throw workspaceError("Choose a license and confirm you have permission to share this content.",400);
      const title = catalogString(body.title,70), description = catalogString(body.description,220), attribution = catalogString(body.attribution,80);
      let content;
      try { content = catalogSnapshots(body.snapshot); }
      catch (error) { throw error.status ? error : workspaceError(error.message || "Invalid template project.",400); }
      const id = body.id || crypto.randomUUID();
      if (typeof id !== "string" || !workspaceId.test(id)) return api({error:"Invalid template."},400);
      const current = await readData(env,catalogScope,id);
      if (body.id && current?.owner !== owner) return api({error:"Template unavailable."},404);
      if (current?.candidate?.state === "pending") return api({error:"Wait for review before submitting another version."},409);
      if (!current) {
        const rows = await listData(env,catalogScope);
        if (rows.length >= 100 || rows.filter(({value})=>value.owner === owner).length >= 10) return api({error:"The template catalog has reached its submission limit."},409);
      }
      const version = 1+Math.max(current?.candidate?.version || 0,current?.approved?.version || 0);
      const candidate = {title,description,attribution,license:body.license,version,state:"pending",createdAt:new Date().toISOString(),...content};
      const next = {...(current || {owner,approved:null,previous:[]}),candidate};
      if (!await dataCompareAndSwap(env,catalogScope,id,current,next)) return api({error:"This template changed. Reload it and try again."},409);
      return api({id,version},201);
    }
    const entry = /^\/api\/catalog\/([\da-f-]{36})(?:\/(review))?$/i.exec(path);
    if (!entry || !workspaceId.test(entry[1])) return api({error:"Template unavailable."},404);
    const [,id,route] = entry;
    const current = await readData(env,catalogScope,id);
    if (route === "review" && request.method === "POST") {
      if (!reviewer) return api({error:"Only the configured catalog reviewer can decide submissions."},403);
      const body = await workspaceInput(request,3000);
      if (!["approve","reject"].includes(body.decision)) throw workspaceError("Choose a review decision.",400);
      const note = catalogString(body.note,500,body.decision === "reject");
      const candidate = current?.candidate;
      if (!candidate || candidate.state !== "pending" || body.version !== candidate.version) return api({error:"This submitted version is no longer pending."},409);
      const result = {...candidate,state:body.decision === "approve" ? "approved" : "rejected",reviewedAt:new Date().toISOString(),note};
      const next = {...current,candidate:result};
      let expired = [];
      if (result.state === "approved") {
        next.approved = result;
        if (current.approved) {
          await writeData(env,catalogArchiveScope(id),String(current.approved.version),current.approved);
          const history = [catalogVersionView(current.approved),...current.previous];
          next.previous = history.slice(0,catalogRetainedPublicationLimit-1);
          expired = history.slice(catalogRetainedPublicationLimit-1);
        }
      }
      if (!await dataCompareAndSwap(env,catalogScope,id,current,next)) return api({error:"The submission was already updated."},409);
      await Promise.allSettled(expired.map(item=>deleteData(env,catalogArchiveScope(id),String(item.version))));
      return api({id,state:result.state,version:result.version});
    }
    if (!route && request.method === "GET") {
      const query = new URL(request.url).searchParams;
      const pending = query.get("preview") === "pending", number = query.get("version");
      let version = current?.approved;
      if (pending) version = current && (reviewer || current.owner === owner) ? current.candidate : null;
      else if (number !== null && String(current?.approved?.version) !== number) {
        const historical = current?.previous.find(item=>String(item.version) === number);
        version = historical ? await readData(env,catalogArchiveScope(id),number) : null;
      }
      if (!version?.snapshot) return api({error:"Template unavailable."},404);
      const {note,...safe} = version;
      return api({template:{id,...safe,...(pending ? {note} : {})}});
    }
    return api({error:"Method unavailable."},405);
  } catch (error) {
    if (error.status) return api({error:error.message},error.status);
    return api({error:"The template catalog could not complete this action."},500);
  }
}
