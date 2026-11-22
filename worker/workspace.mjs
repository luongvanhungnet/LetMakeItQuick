const workspaceId = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const workspaceProjectTypes = new Set(["web","app","game","game3d","video"]);
const workspaceDraftLimit = 512_000;
const workspaceVersionLimit = 20;
const workspaceProjectLimit = 60;

function workspacePrincipal(request) {
  const identity = request.headers.get("oai-authenticated-user-id");
  return identity && identity.length <= 256 ? identity : null;
}

async function workspaceInput(request,limit) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) throw workspaceError("Invalid request origin.",403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) throw workspaceError("Expected JSON.",415);
  if (Number(request.headers.get("Content-Length")) > limit) throw workspaceError("Request is too large.",413);
  const reader = request.body?.getReader();
  if (!reader) throw workspaceError("Missing request body.",400);
  const decoder = new TextDecoder("utf-8",{fatal:true});
  let size = 0, body = "";
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      if ((size += value.byteLength) > limit) { void reader.cancel().catch(()=>{}); throw workspaceError("Request is too large.",413); }
      body += decoder.decode(value,{stream:true});
    }
    const data = JSON.parse(body+decoder.decode());
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw workspaceError("Invalid JSON.",400);
  }
}
function workspaceError(message,status) {
  return Object.assign(Error(message),{status});
}
function validWorkspaceDraft(draft,id) {
  return draft && typeof draft === "object" && draft.id === id && workspaceProjectTypes.has(draft.type) &&
    typeof draft.name === "string" && draft.name.length <= 70;
}
const workspaceDraftScope = owner => "workspace:drafts:"+owner;
const workspaceVersionScope = (owner,id) => "workspace:versions:"+owner+":"+id;
const workspaceFormScope = (owner,id) => "workspace:forms:"+owner+":"+id;

async function saveWorkspaceVersion(env,owner,id,draft,expected) {
  if (!validWorkspaceDraft(draft,id)) throw workspaceError("Invalid project draft.",400);
  const scope = workspaceDraftScope(owner);
  const saved = await readData(env,scope,id);
  if ((saved?.revision || null) !== expected) throw workspaceError("The cloud draft changed. Open Workspace and review its latest version.",409);
  if (!saved && (await listData(env,scope)).length >= workspaceProjectLimit) throw workspaceError("Cloud draft quota reached.",409);
  const versions = saved?.versions || [];
  const versionScope = workspaceVersionScope(owner,id);
  if (saved) {
    const existing = await readData(env,versionScope,saved.revision);
    if (existing && JSON.stringify(existing) === JSON.stringify(draft)) return saved;
  }
  const revision = crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  const next = {id, name:draft.name, type:draft.type, revision, updatedAt,
    versions:[{revision,updatedAt},...versions].slice(0,workspaceVersionLimit)};
  await writeData(env,versionScope,revision,draft);
  if (!await dataCompareAndSwap(env,scope,id,saved,next)) {
    await deleteData(env,versionScope,revision);
    throw workspaceError("The cloud draft changed. Open Workspace and review its latest version.",409);
  }
  if (versions.length >= workspaceVersionLimit) await deleteData(env,versionScope,versions.at(-1).revision);
  return next;
}

function workspaceReleaseProject(snapshot) {
  try {
    if (typeof snapshot !== "string" || snapshot.length > 200000) return null;
    const bytes = Uint8Array.from(atob(snapshot.replaceAll("-","+").replaceAll("_","/")),char=>char.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  } catch { return null; }
}
function workspaceFormLabels(value) {
  return typeof value === "string" ? value.split("\n").map(field=>field.trim()).filter(Boolean).slice(0,8).map(field=>field.slice(0,80)) : [];
}
async function workspaceFormSubmit(request,env,slug,formId) {
  if (request.method !== "POST") return api({error:"Method unavailable."},405);
  const record = await lookupLiveRelease(env,slug);
  if (!record) return api({error:"The product is unavailable."},404);
  const {owner,projectId,release} = record;
  if (release.metadata.visibility !== "public" && workspacePrincipal(request) !== owner) return api({error:"The product is unavailable."},404);
  const project = workspaceReleaseProject(release.snapshot);
  const form = [project,...(project?.pages || [])].flatMap(page=>page?.blocks || [])
    .find(block=>block.id === formId && block.type === "form");
  if (!form) return api({error:"This form is unavailable."},404);
  const {values} = await workspaceInput(request,15000);
  const labels = workspaceFormLabels(form.b);
  if (!Array.isArray(values) || values.length !== labels.length || !labels.length ||
      values.some((value,index)=>typeof value !== "string" || !value.trim() || value.length > 1000 ||
        (/e-mail|email/i.test(labels[index]) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))) {
    return api({error:"Fill in all form fields with valid values."},400);
  }
  const id = crypto.randomUUID();
  const received = {id,releaseId:release.id,formId,createdAt:new Date().toISOString(),
    fields:labels.map((label,index)=>({label,value:values[index]}))};
  await updateData(env,workspaceFormScope(owner,projectId),formId,previous=>{
    const entries = Array.isArray(previous) ? previous : [];
    if (entries.length >= 50) throw workspaceError("This form has reached its inbox limit.",429);
    return [received,...entries];
  });
  return api({message:"Your response was received."},201);
}

async function handleWorkspace(request,env) {
  const path = new URL(request.url).pathname;
  const owner = workspacePrincipal(request);
  const enabled = !!env.LAUNCHPAD_DATA;
  if (path === "/api/workspace" && request.method === "GET") {
    const bytes = owner ? new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(owner))) : [];
    const account = owner ? Array.from(bytes,value=>value.toString(16).padStart(2,"0")).join("") : null;
    return api({signedIn:!!owner,storageReady:enabled,account});
  }
  if (!enabled) return api({error:"Cloud storage is not configured."},503);
  try {
    const form = /^\/api\/workspace\/forms\/([a-z\d-]{1,90})\/([a-f\d-]{36})$/.exec(path);
    if (form) return await workspaceFormSubmit(request,env,form[1],form[2]);
    if (!owner) return api({error:"Sign in to access cloud drafts."},401);
    const environmentRoute = /^\/api\/workspace\/drafts\/([a-f0-9-]{36})\/environments\/(staging|production)$/.exec(path);
    if (environmentRoute) return await manageProductData(request,env,owner,environmentRoute[1],environmentRoute[2]);
    if (path === "/api/workspace/export" && request.method === "GET") return exportWorkspaceData(env,owner);
    if (path === "/api/workspace/delete" && request.method === "POST") {
      const {confirmation} = await workspaceInput(request,128);
      if (confirmation !== "DELETE") return api({error:"Type DELETE to confirm removal."},400);
      await deleteWorkspaceData(env,owner);
      return api({deleted:true});
    }
    if (path === "/api/workspace/drafts" && request.method === "GET") {
      const rows = await listData(env,workspaceDraftScope(owner));
      return api({drafts:rows.map(row=>row.value)});
    }
    const route = /^\/api\/workspace\/drafts\/([\da-f-]{36})(?:\/([\da-f-]{36}|forms))?$/i.exec(path);
    if (!route || !workspaceId.test(route[1])) return api({error:"Workspace resource unavailable."},404);
    const [,id,version] = route;
    if (version === "forms" && request.method === "GET") {
      const rows = await listData(env,workspaceFormScope(owner,id));
      return api({responses:rows.flatMap(row=>row.value).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,200)});
    }
    if (request.method === "GET") {
      const saved = await readData(env,workspaceDraftScope(owner),id);
      const revision = version || saved?.revision;
      if (!saved?.versions.some(item=>item.revision === revision)) return api({error:"Cloud draft version unavailable."},404);
      const draft = await readData(env,workspaceVersionScope(owner,id),revision);
      if (!draft) return api({error:"Cloud draft version unavailable."},404);
      return api({draft,meta:saved});
    }
    if (request.method === "PUT" && !version) {
      const {draft,expected} = await workspaceInput(request,workspaceDraftLimit);
      if (expected !== null && (typeof expected !== "string" || !workspaceId.test(expected))) return api({error:"Invalid expected version."},400);
      return api({meta:await saveWorkspaceVersion(env,owner,id,draft,expected)});
    }
    return api({error:"Method unavailable."},405);
  } catch (error) {
    const known = Number.isInteger(error.status);
    return api({error:known ? error.message : "Cloud workspace unavailable. Try again shortly."},known ? error.status : 503);
  }
}

async function workspaceOwnedRecords(env,owner) {
  const [drafts,stages,releases] = await Promise.all([
    listData(env,workspaceDraftScope(owner)),
    listData(env,"release-staging:"+owner),
    listData(env,"release-slugs")
  ]);
  const projectIds = new Set([...drafts.map(row=>row.key),...stages.map(row=>row.key),
    ...releases.filter(row=>row.value.owner === owner).map(row=>row.value.projectId)]);
  return {drafts,stages,projectIds};
}

async function* workspaceExportChunks(env,owner) {
  const {drafts,stages,projectIds} = await workspaceOwnedRecords(env,owner);
  yield '{"format":"launchpad-cloud-export","version":1,"drafts":[';
  let first = true;
  for (const {key,value} of drafts) {
    const draft = await readData(env,workspaceVersionScope(owner,key),value.revision);
    if (!draft) continue;
    yield (first ? "" : ",")+JSON.stringify({project:draft,updatedAt:value.updatedAt});
    first = false;
  }
  yield '],"staging":[';
  first = true;
  for (const {value} of stages) {
    yield (first ? "" : ",")+JSON.stringify(value);
    first = false;
  }
  yield '],"formResponses":[';
  first = true;
  for (const id of projectIds) {
    for (const {value} of await listData(env,workspaceFormScope(owner,id))) {
      yield (first ? "" : ",")+JSON.stringify({projectId:id,responses:value});
      first = false;
    }
  }
  yield '],"environments":[';
  first = true;
  for (const id of projectIds) {
    for (const {key,value} of await listData(env,"product-environments:"+owner+":"+id)) {
      yield (first ? "" : ",")+JSON.stringify({projectId:id,environment:key,lists:value.lists});
      first=false;
    }
  }
  yield ']}';
}

function exportWorkspaceData(env,owner) {
  const chunks = workspaceExportChunks(env,owner), encoder = new TextEncoder();
  const stream = new ReadableStream({
    async pull(controller) {
      const {done,value} = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    async cancel() { await chunks.return(); }
  });
  return new Response(stream,{headers:{"Content-Type":"application/json; charset=utf-8",
    "Content-Disposition":'attachment; filename="launchpad-cloud-export.json"',"Cache-Control":"no-store"}});
}

async function deleteWorkspaceData(env,owner) {
  const {drafts,stages,projectIds} = await workspaceOwnedRecords(env,owner);
  for (const {key} of drafts) {
    const scope = workspaceVersionScope(owner,key);
    for (const {key:revision} of await listData(env,scope)) await deleteData(env,scope,revision);
    await deleteData(env,workspaceDraftScope(owner),key);
  }
  for (const {key} of stages) await deleteData(env,"release-staging:"+owner,key);
  for (const id of projectIds) {
    for (const environment of ["staging","production"]) await deleteData(env,"product-environments:"+owner+":"+id,environment);
    const scope = workspaceFormScope(owner,id);
    for (const {key} of await listData(env,scope)) await deleteData(env,scope,key);
  }
  if (typeof deleteOperationsData === "function") await deleteOperationsData(env,owner);
  if (typeof deleteOwnedTeams === "function") await deleteOwnedTeams(env,owner);
}
