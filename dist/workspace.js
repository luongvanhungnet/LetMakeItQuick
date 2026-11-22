"use strict";

const workspaceBackupFormat = "launchpad-draft";
const workspaceBackupLimit = 512000;
const workspaceSync = new Map();
const workspaceTransfers = new Map();
const workspaceTimers = new Map();
let workspaceAccount = null;

async function workspaceRequest(path,options = {}) {
  const response = await fetch("/api/workspace"+path,{cache:"no-store",...options});
  let body;
  try { body = await response.json(); } catch { throw Error("Cloud workspace is unavailable."); }
  if (!response.ok) throw Object.assign(Error(body.error || "Cloud workspace request failed."),{status:response.status});
  return body;
}

function workspaceDownload(value,name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = (name.toLowerCase().replace(/[^a-z\d]+/g,"-").replace(/^-|-$/g,"") || "launchpad")+".json";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function workspaceCleanDraft(value,{cloud = false} = {}) {
  if (!value || typeof value !== "object") throw Error("The backup must contain an editable project.");
  const source = structuredClone(value);
  validateProject(source);
  const draft = validateProject(snapshotProject(source));
  const history = Array.isArray(source.aiHistory) ? source.aiHistory.filter(item=>["user","assistant"].includes(item?.role) &&
    typeof item.text === "string").slice(-24).map(({role,text})=>({role,text:text.slice(0,1700)})) : [];
  if (history.length) draft.aiHistory = history;
  if (source.workspaceData) draft.workspaceData = workspaceDataSettings(source.workspaceData);
  const launchAd = source.type === "video" && typeof cleanLaunchAdProvenance === "function" ? cleanLaunchAdProvenance(source.launchAd) : null;
  if (launchAd) draft.launchAd = launchAd;
  if (cloud) {
    if (typeof source.hostedSlug === "string" && releaseSlugPattern.test(source.hostedSlug) && source.hostedSlug.length <= 60) {
      draft.hostedSlug = source.hostedSlug;
    }
    if (source.releaseSettings) draft.releaseSettings = releaseMeta(source.releaseSettings);
  }
  return draft;
}
function importWorkspaceBackup(raw) {
  const file = JSON.parse(raw);
  if (file?.format !== workspaceBackupFormat || file.version !== 1) throw Error("Select a Launchpad editable project backup.");
  const draft = workspaceCleanDraft(file.project);
  draft.id = crypto.randomUUID();
  projects.unshift(draft);
  save();
  modal.close();
  actions.open(draft.id);
}

function cloudDraftRequest(draft,revision) {
  const body = JSON.stringify({draft,expected:revision});
  if (new TextEncoder().encode(body).length > workspaceBackupLimit) throw Error("This draft exceeds the 500 KB cloud limit. Download an editable backup.");
  return workspaceRequest("/drafts/"+encodeURIComponent(draft.id),{method:"PUT",headers:{"Content-Type":"application/json"},body});
}
function cloudNote(draft,text) {
  const note = $("#save-note");
  if (current?.id === draft.id && note) note.textContent = text;
}
function persistWorkspaceSync() {
  if (!workspaceAccount) return;
  try { localStorage.setItem("launchpad-cloud:"+workspaceAccount,JSON.stringify(Object.fromEntries(workspaceSync))); } catch {}
}
function setWorkspaceSync(id,revision) {
  workspaceSync.set(id,revision);
  persistWorkspaceSync();
}
async function initializeWorkspace() {
  try {
    const state = await workspaceRequest("");
    const account = state.storageReady ? state.account || null : null;
    if (account === workspaceAccount) return state;
    workspaceAccount = account;
    workspaceSync.clear();
    if (workspaceAccount) {
      const saved = JSON.parse(localStorage.getItem("launchpad-cloud:"+workspaceAccount) || "{}");
      for (const [id,revision] of Object.entries(saved)) if (typeof revision === "string") workspaceSync.set(id,revision);
    }
    return state;
  } catch {
    workspaceAccount = null;
    workspaceSync.clear();
    return {signedIn:false,storageReady:false};
  }
}
function scheduleCloudDraft(draft) {
  if (!draft?.id || !workspaceSync.has(draft.id)) return;
  const account = workspaceAccount;
  clearTimeout(workspaceTimers.get(draft.id));
  workspaceTimers.set(draft.id,setTimeout(()=>{
    workspaceTimers.delete(draft.id);
    const running = workspaceTransfers.get(draft.id) || Promise.resolve();
    const queued = running.catch(()=>{}).then(async ()=>{
      if (account !== workspaceAccount || !workspaceSync.has(draft.id)) return;
      const local = projects.find(project=>project.id === draft.id);
      if (!local) return;
      try {
        const {meta} = await cloudDraftRequest({id:local.id,...workspaceCleanDraft(local,{cloud:true})},workspaceSync.get(draft.id));
        if (account !== workspaceAccount || !workspaceSync.has(draft.id)) return;
        setWorkspaceSync(draft.id,meta.revision);
        cloudNote(draft,"Saved to cloud");
      } catch (error) {
        if (account !== workspaceAccount || !workspaceSync.has(draft.id)) return;
        if (error.status === 409) {
          workspaceSync.delete(draft.id);
          persistWorkspaceSync();
        }
        cloudNote(draft,error.status === 409 ? "Cloud conflict · device copy saved" : "Device copy saved · cloud unavailable");
      }
    });
    workspaceTransfers.set(draft.id,queued);
    void queued.finally(()=>{ if (workspaceTransfers.get(draft.id) === queued) workspaceTransfers.delete(draft.id); });
  },1000));
}

async function openWorkspace() {
  const draft = page === "editor" ? current : null;
  openDialog("Workspace",'<div id="cloud-state" class="subtext" role="status">Checking cloud storage…</div>'+
    '<section class="workspace-section"><h3>Editable backups</h3><p class="subtext">Backups include draft content and conversation history. Store them somewhere private.</p><div class="dialog-actions">'+
    (draft?'<button class="secondary" id="download-editable">Download editable backup</button>':'')+
    '<label class="secondary workspace-file">Import editable backup<input type="file" id="import-editable" accept=".json,application/json"></label></div></section>'+
    '<section id="workspace-cloud" class="workspace-section" hidden></section><details id="workspace-privacy" class="workspace-section" hidden><summary>Cloud data and privacy</summary>'+
    '<p class="subtext">Export the current versions of your cloud drafts, staged projects, and production form responses.</p>'+
    '<div class="dialog-actions"><a class="secondary" href="/api/workspace/export" download>Export cloud data</a></div>'+
    '<p class="subtext">Deleting cloud data removes draft history, staged versions, form responses, environment records, operations data, and your team data. Local drafts, published releases, checkout records, and your ChatGPT account are kept. To request deletion of the platform account, visit the <a href="https://privacy.openai.com/" target="_blank" rel="noopener">OpenAI Privacy Portal</a>.</p>'+
    '<form id="workspace-delete"><label class="field">Type DELETE to confirm<input name="confirmation" required autocomplete="off"></label>'+
    '<button class="secondary" type="submit">Delete cloud data</button><p class="subtext" id="workspace-delete-status" role="status"></p></form></details>');
  const pane = $("#workspace-cloud"), state = $("#cloud-state");
  $("#download-editable")?.addEventListener("click",()=>workspaceDownload({format:workspaceBackupFormat,version:1,project:workspaceCleanDraft(draft)},draft.name+"-draft"));
  $("#import-editable").addEventListener("change",async event=>{
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > workspaceBackupLimit*2) throw Error("This backup is too large.");
      importWorkspaceBackup(await file.text());
    } catch (error) { state.textContent = error.message; }
  });
  const account = await initializeWorkspace();
  if (!pane.isConnected) return;
  if (!account.signedIn) {
    state.innerHTML = 'Sign in to keep a private cloud copy. <a target="_top" href="/signin-with-chatgpt?return_to=%2F">Sign in with ChatGPT</a>';
    return;
  }
  if (!account.storageReady) {
    state.textContent = "Signed in. Cloud storage is unavailable on this deployment.";
    return;
  }
  pane.hidden = false;
  $("#workspace-privacy").hidden = false;
  $("#workspace-delete").addEventListener("submit",async event=>{
    event.preventDefault();
    const form = event.currentTarget, confirmation = form.elements.confirmation.value;
    const status = form.querySelector("#workspace-delete-status");
    if (confirmation !== "DELETE") { status.textContent = "Type DELETE to confirm removal."; return; }
    const button = form.querySelector("button");
    button.disabled = true;
    for (const timer of workspaceTimers.values()) clearTimeout(timer);
    workspaceTimers.clear();
    workspaceSync.clear();
    persistWorkspaceSync();
    try {
      await Promise.allSettled(workspaceTransfers.values());
      await workspaceRequest("/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmation})});
      form.reset();
      await renderCloud();
      status.textContent = "Cloud data removed.";
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  async function renderCloud() {
    const {drafts} = await workspaceRequest("/drafts");
    if (!pane.isConnected) return;
    state.textContent = "Signed in to your private workspace.";
    const remote = drafts.find(entry=>entry.id === draft?.id);
    pane.innerHTML = '<h3>Cloud drafts</h3><p class="subtext">Choose which browser drafts to upload. Once enabled, edits to that project autosave to the cloud.</p>'+
      (draft && !workspaceSync.has(draft.id) && !remote ? '<button class="primary" id="upload-current">Upload this device draft</button>' : '')+
      (!draft ? '<form id="migrate-drafts"><fieldset><legend>Choose device drafts to upload</legend>'+
        projects.filter(project=>!drafts.some(entry=>entry.id === project.id)).map(project=>'<label><input type="checkbox" value="'+esc(project.id)+'"> '+esc(project.name)+'</label>').join("")+
        '</fieldset><button class="primary" type="submit">Upload selected drafts</button></form>' : '')+
      (draft && workspaceSync.has(draft.id) ? '<button class="secondary" id="stop-cloud-sync">Stop cloud autosave</button>' : '')+
      (drafts.length ? '<ul class="workspace-draft-list">'+drafts.map(item=>'<li><strong>'+esc(item.name || "Untitled project")+'</strong><button type="button" class="filter" data-cloud-history="'+esc(item.id)+'">Version history</button></li>').join("")+'</ul>' : '<p class="subtext">No cloud drafts yet.</p>')+
      '<div id="workspace-history"></div>';
    async function upload(local) {
      const id = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(local.id) ? local.id : crypto.randomUUID();
      const {meta} = await cloudDraftRequest({id,...workspaceCleanDraft(local,{cloud:true})},null);
      local.id = id;
      setWorkspaceSync(id,meta.revision);
      save();
    }
    pane.querySelector("#upload-current")?.addEventListener("click",async event=>{
      event.target.disabled = true;
      try { await upload(draft); await renderCloud(); }
      catch (error) { state.textContent = error.message; event.target.disabled=false; }
    });
    pane.querySelector("#migrate-drafts")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const selected = Array.from(event.currentTarget.querySelectorAll("input:checked"),input=>input.value);
      if (!selected.length) { state.textContent = "Select at least one draft."; return; }
      event.currentTarget.querySelector("button").disabled = true;
      try {
        for (const id of selected) await upload(projects.find(project=>project.id === id));
        await renderCloud();
      } catch (error) { await renderCloud(); state.textContent = error.message; }
    });
    pane.querySelector("#stop-cloud-sync")?.addEventListener("click",()=>{
      clearTimeout(workspaceTimers.get(draft.id));
      workspaceTimers.delete(draft.id);
      workspaceSync.delete(draft.id);
      persistWorkspaceSync();
      renderCloud().catch(error=>{state.textContent=error.message;});
    });
    for (const button of pane.querySelectorAll("[data-cloud-history]")) button.addEventListener("click",()=>{
      const id = button.dataset.cloudHistory;
      const selected = drafts.find(item=>item.id === id);
      const history = $("#workspace-history");
      const hasDeviceDraft = projects.some(project=>project.id === id);
      history.innerHTML = '<h4>'+esc(selected.name)+' versions</h4><p class="subtext">Open a version as a separate copy, restore an older cloud version, or resume autosave from the current cloud version.</p><ul class="workspace-draft-list">'+
        selected.versions.map((item,index)=>'<li><time datetime="'+esc(item.updatedAt)+'">'+esc(new Date(item.updatedAt).toLocaleString())+'</time><button class="filter" data-revision="'+esc(item.revision)+'">'+(index === 0 && !hasDeviceDraft ? "Open current" : "Open copy")+'</button>'+
          (index > 0 ? '<button class="filter" data-restore="'+esc(item.revision)+'">Restore</button>' :
            hasDeviceDraft && !workspaceSync.has(id) ? '<button class="filter" data-resume="'+esc(item.revision)+'">Use cloud copy</button>' : "")+'</li>').join("")+'</ul>';
      for (const version of history.querySelectorAll("[data-revision],[data-restore],[data-resume]")) version.addEventListener("click",async ()=>{
        const revision = version.dataset.restore || version.dataset.resume || version.dataset.revision;
        if (version.dataset.restore && version.textContent !== "Confirm restore") { version.textContent = "Confirm restore"; return; }
        if (version.dataset.resume && version.textContent !== "Replace device copy and resume") {
          version.textContent = "Replace device copy and resume";
          return;
        }
        version.disabled = true;
        try {
          const result = await workspaceRequest("/drafts/"+encodeURIComponent(id)+"/"+encodeURIComponent(revision));
          const resume = version.dataset.resume || revision === selected.revision && !hasDeviceDraft;
          const copy = workspaceCleanDraft(result.draft,{cloud:!!(version.dataset.restore || resume)});
          if (version.dataset.restore) {
            const {meta} = await cloudDraftRequest({id,...copy},selected.revision);
            setWorkspaceSync(id,meta.revision);
          } else if (resume) {
            if (revision !== result.meta.revision) throw Error("The cloud copy changed. Reopen version history to continue.");
            setWorkspaceSync(id,result.meta.revision);
          }
          if (version.dataset.restore || resume) {
            copy.id = id;
            const previous = projects.findIndex(project=>project.id === id);
            if (previous >= 0) projects.splice(previous,1,copy);
            else projects.unshift(copy);
            current = copy;
          } else {
            copy.id = crypto.randomUUID();
            projects.unshift(copy);
          }
          save();
          modal.close();
          actions.open(copy.id);
        } catch (error) { state.textContent=error.message; version.disabled=false; }
      });
    });
  }
  try { await renderCloud(); } catch (error) { state.textContent=error.message; }
}

const workspaceImageTypes = new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
function usableWorkspaceImage(data) {
  return typeof data === "string" && data.length <= 100000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z\d+/=]+$/.test(data);
}
async function resizeWorkspaceImage(file) {
  if (!workspaceImageTypes.has(file.type) || file.size > 15000000) throw Error("Choose a JPEG, PNG, WebP, GIF, or AVIF under 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    let edge = Math.min(1200,Math.max(bitmap.width,bitmap.height));
    do {
      const scale = edge/Math.max(bitmap.width,bitmap.height);
      canvas.width = Math.max(1,Math.round(bitmap.width*scale));
      canvas.height = Math.max(1,Math.round(bitmap.height*scale));
      const context = canvas.getContext("2d",{alpha:false});
      context.fillStyle = "#fff";
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const data = canvas.toDataURL("image/jpeg",.76);
      if (usableWorkspaceImage(data)) return data;
      edge = Math.floor(edge*.75);
    } while (edge >= 240);
    throw Error("This image could not be resized under the draft limit.");
  } finally { bitmap.close(); }
}

function openWorkspaceMedia() {
  if (page !== "editor" || !supportsPages(current.type)) return;
  const target = editingPage();
  const replace = target.blocks?.find(block=>block.id === selectedBlock && block.type === "image");
  const images = projectPages(current).flatMap(({content})=>content.blocks || []).filter(block=>usableWorkspaceImage(block.imageData));
  openDialog(replace?"Replace project image":"Project media",'<p class="subtext">Images are resized to fit the project. Add a description for screen readers and keep a record of the source.</p>'+
    '<form id="upload-project-image"><label class="field">Image file<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" required></label>'+
    '<label class="field">Alt text<input name="alt" maxlength="160" value="'+esc(replace?.a || "")+'" required></label>'+
    '<label class="field">Attribution<input name="credit" maxlength="160" value="'+esc(replace?.credit || "")+'" placeholder="Creator or source"></label>'+
    '<label class="field">License<input name="license" maxlength="160" value="'+esc(replace?.license || "")+'" placeholder="Owned, licensed, or CC BY 4.0"></label>'+
    '<div class="dialog-actions"><button class="primary" type="submit">'+(replace?"Replace image":"Add image")+'</button></div></form>'+
    '<p class="subtext" id="project-media-status" role="status"></p>'+
    (images.length?'<h3>Uploaded images in this project</h3><div class="workspace-images">'+images.map((block,index)=>
      '<button class="secondary" type="button" data-use-image="'+index+'"><img src="'+esc(block.imageData)+'" alt=""><span>'+esc(block.a)+'</span></button>').join("")+'</div>':''));
  const form = $("#upload-project-image"), status = $("#project-media-status");
  function useImage(data,alt,credit,license) {
    if (!form.isConnected || !modal.open) return;
    if (!replace && (target.blocks?.length || 0) >= maxBlocks) { status.textContent = "This page already has "+maxBlocks+" blocks."; return; }
    const block = replace || newBlock("image");
    Object.assign(block,{a:alt,b:"",imageData:data,credit,license});
    if (!replace) (target.blocks ??= []).push(block);
    selectedBlock = block.id;
    saveEditor(true);
    modal.close();
    renderBlockStage();
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const submit = form.querySelector("button");
    submit.disabled = true;
    status.textContent = "Resizing image…";
    try {
      const {image,alt,credit,license} = form.elements;
      const imageData = await resizeWorkspaceImage(image.files[0]);
      useImage(imageData,alt.value.trim(),credit.value.trim(),license.value.trim());
      if (modal.open) submit.disabled = false;
    } catch (error) { status.textContent=error.message || "The image could not be opened."; submit.disabled=false; }
  });
  for (const button of modal.querySelectorAll("[data-use-image]")) button.addEventListener("click",()=>{
    const block = images[Number(button.dataset.useImage)];
    useImage(block.imageData,block.a,block.credit || "",block.license || "");
  });
}

function workspaceDataSettings(input) {
  const clean = (value,max) => typeof value === "string" ? value.slice(0,max) : "";
  const names = clean(input.secretNames,600).split(/[\n,]/).map(name=>name.trim()).filter(name=>/^[A-Z][A-Z_\d]{0,63}$/.test(name));
  return {
    sampleNotes:clean(input.sampleNotes,2500),
    stagingNotes:clean(input.stagingNotes,2500),
    productionNotes:clean(input.productionNotes,2500),
    integration: clean(input.integration,500),
    secretNames:[...new Set(names)].join("\n")
  };
}

async function openWorkspaceData() {
  const draft = current;
  const config = workspaceDataSettings(draft.workspaceData || {});
  openDialog("Product data",'<p class="subtext">Sample records are part of each page’s Records blocks. Preview form submissions are simulated. Hosted form responses are stored separately for the live release.</p>'+
    '<form id="workspace-data-form"><label class="field">Sample data notes<textarea name="sampleNotes" maxlength="2500">'+esc(config.sampleNotes)+'</textarea></label>'+
    '<label class="field">Staging data notes<textarea name="stagingNotes" maxlength="2500">'+esc(config.stagingNotes)+'</textarea></label>'+
    '<label class="field">Production data notes<textarea name="productionNotes" maxlength="2500">'+esc(config.productionNotes)+'</textarea></label>'+
    '<label class="field">Integration URL (HTTPS)<input name="integration" maxlength="500" value="'+esc(config.integration)+'"></label>'+
    '<label class="field">Runtime secret names (one per line)<textarea name="secretNames" maxlength="600">'+esc(config.secretNames)+'</textarea></label>'+
    '<p class="subtext">Set secret values in the deployment environment. This editor stores only variable names.</p><div class="dialog-actions"><button class="primary" type="submit">Save data settings</button></div></form>'+
    '<section class="workspace-section"><h3>Hosted records</h3><div id="environment-records"></div></section><section class="workspace-section"><h3>Production form inbox</h3><div id="workspace-form-inbox" class="subtext">Checking cloud connection…</div></section>');
  void manageEnvironmentRows(draft,$("#environment-records"));
  const form = $("#workspace-data-form"), inbox = $("#workspace-form-inbox");
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (values.integration && !blockURL(values.integration)) { toast("Use an HTTPS integration URL."); return; }
    draft.workspaceData = workspaceDataSettings(values);
    save();
    toast("Product data settings saved.");
  });
  try {
    const account = await workspaceRequest("");
    if (!account.storageReady || !account.signedIn) { inbox.textContent = "Sign in to a deployment with cloud storage to view responses."; return; }
    const {responses} = await workspaceRequest("/drafts/"+encodeURIComponent(draft.id)+"/forms");
    inbox.innerHTML = responses.length ? '<ul class="workspace-draft-list">'+responses.map(row=>'<li><details><summary>'+esc(new Date(row.createdAt).toLocaleString())+'</summary><dl>'+
      row.fields.map(({label,value})=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join("")+'</dl></details></li>').join("")+'</ul>' : 'No production responses.';
  } catch (error) { inbox.textContent = error.message; }
}

function runWorkspaceBlocks({mode = "sample",slug = "",returnPath = ""} = {}) {
  for (const link of document.querySelectorAll("[data-product-signin]")) {
    const destination = /^\/(?!\/)[^\\]*$/.test(returnPath) ? returnPath : /^[a-z\d-]{1,90}$/.test(slug) ? "/launch/"+slug : "/";
    if (window.parent === window && window.location.protocol === "file:") {
      const note = document.createElement("p");
      note.textContent = "Open the hosted product to sign in.";
      link.replaceWith(note);
    } else {
      const back=new URL(destination,"https://return.invalid");
      if (mode==="test" && back.pathname.startsWith("/staging/")) {
        back.searchParams.set("testVisitor","member");
        link.href=back.pathname+back.search;
        link.textContent="Sign in as test customer";
        continue;
      }
      if (mode==="live") back.searchParams.set("launchpad_signin","1");
      link.href = "/signin-with-chatgpt?return_to="+encodeURIComponent(back.pathname+back.search);
    }
  }
  const origin = window.location.origin;
  const framed = window.parent !== window;
  const forms = new Map();
  window.addEventListener("message",event=>{
    if (event.source !== window.parent || event.data?.kind !== "launchpad-form-result") return;
    const form = forms.get(event.data.token);
    if (!form) return;
    forms.delete(event.data.token);
    form.querySelector("button").disabled = false;
    form.querySelector("output").textContent = String(event.data.message || "").slice(0,200);
    if (event.data.ok) form.reset();
  });
  for (const form of document.querySelectorAll("[data-product-form]")) form.addEventListener("submit",event=>{
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (mode !== "live" || !framed) {
      form.querySelector("output").textContent = "Test response accepted. No production data was saved.";
      form.reset();
      return;
    }
    const token = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    const values = [...form.elements].filter(element=>element.name).map(element=>element.value);
    forms.set(token,form);
    form.querySelector("button").disabled = true;
    form.querySelector("output").textContent = "Sending…";
    window.parent.postMessage({kind:"launchpad-form",formId:form.dataset.productForm,values,token},origin === "null" ? "*" : origin);
    setTimeout(()=>{
      if (!forms.delete(token)) return;
      form.querySelector("button").disabled = false;
      form.querySelector("output").textContent = "The form connection timed out. Please try again.";
    },20000);
  });
  for (const input of document.querySelectorAll("[data-record-search]")) input.addEventListener("input",()=>{
    const search = input.value.trim().toLocaleLowerCase();
    const list = input.closest(".lp-product-records");
    const items = [...list.querySelectorAll("[data-product-record]")];
    for (const item of items) item.hidden = !item.textContent.toLocaleLowerCase().includes(search);
    list.querySelector("output").textContent = items.some(item=>!item.hidden) ? "" : "No matching records.";
  });
}
function bindWorkspaceForms(frame,context) {
  if (context?.mode !== "live" || !/^[a-z\d-]{1,90}$/.test(context.slug)) return ()=>{};
  const pending = new Set();
  async function receive(event) {
    if (event.source !== frame.contentWindow) return;
    const {kind,formId,values,token} = event.data || {};
    if (kind !== "launchpad-form" || !/^[\da-f-]{36}$/i.test(formId) || !Array.isArray(values) || values.length > 8 ||
        values.some(value=>typeof value !== "string" || value.length > 1000) || typeof token !== "string" || token.length > 60 ||
        pending.size >= 5 || pending.has(token)) return;
    pending.add(token);
    let message, ok = false;
    try {
      const campaign=new URLSearchParams();
      const search=new URLSearchParams(location.search);
      for (const key of ["utm_source","utm_campaign"]) if (search.has(key)) campaign.set(key,search.get(key).slice(0,80));
      const response = await workspaceRequest("/forms/"+context.slug+"/"+formId+"?"+campaign,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({values}),signal:AbortSignal.timeout(15000)});
      message = response.message;
      ok = true;
    } catch (error) { message = error.message || "The form could not be sent."; }
    finally { pending.delete(token); }
    if (frame.isConnected) frame.contentWindow?.postMessage({kind:"launchpad-form-result",token,ok,message},"*");
  }
  window.addEventListener("message",receive);
  return ()=>window.removeEventListener("message",receive);
}

const workspaceProductCSS = '.lp-product-form,.lp-product-records{display:grid;gap:8px;max-width:640px}.lp-product-form label{display:grid;gap:4px}.lp-product-form input,.lp-product-records input{width:100%;font:inherit;border:1px solid #d5cfdd;border-radius:7px;padding:8px}.lp-product-form button{justify-self:start;border:0;cursor:pointer;font:inherit}.lp-product-records ul{display:grid;gap:8px;list-style:none;padding:0}.lp-product-records li{padding:9px;background:#f3f0f8;border-radius:7px}.lp-media-credit{font-size:.875em;color:#5b5364;margin-top:5px}';

async function manageEnvironmentRows(draft,panel) {
  const lists=projectPages(draft).flatMap(({name,content})=>(content.blocks || []).filter(block=>block.type==="records").map(block=>({id:block.id,title:name+" · "+block.a})));
  if (!lists.length) { panel.textContent="Add a searchable records block to manage its data."; return; }
  panel.innerHTML='<label class="field">Environment<select name="environment"><option value="staging">Staging</option><option value="production">Production</option></select></label>'+
    '<label class="field">Records block<select name="list">'+lists.map(list=>'<option value="'+esc(list.id)+'">'+esc(list.title)+'</option>').join("")+'</select></label>'+
    '<div data-environment-body></div><p role="status" data-environment-status></p>';
  const environment=panel.querySelector('[name="environment"]'), list=panel.querySelector('[name="list"]');
  const body=panel.querySelector("[data-environment-body]"), status=panel.querySelector("[data-environment-status]");
  let version=0;
  async function load() {
    const serial=++version, path="/drafts/"+draft.id+"/environments/"+environment.value, id=list.value;
    body.replaceChildren(); status.textContent="Loading records…";
    try {
      const config=await workspaceRequest(path);
      if (serial!==version || !panel.isConnected) return;
      const data=config.lists[id];
      status.textContent=data ? "" : "This list currently uses the sample rows from the block.";
      body.innerHTML='<form><div data-rows></div><button class="secondary" type="button" data-add-row>Add record</button>'+
        '<label class="field">Records feed<select name="connector"><option value="">Manual entries</option>'+
        config.connectors.map(name=>'<option>'+esc(name)+'</option>').join("")+'</select></label><div class="dialog-actions">'+
        '<button class="primary" type="submit">Save records</button><button class="secondary" data-refresh type="button">Refresh from feed</button>'+
        '<button class="secondary" data-sample type="button">Use sample rows</button></div></form>';
      const form=body.querySelector("form"), rows=form.querySelector("[data-rows]");
      function add(row={}) {
        const field=document.createElement("fieldset");
        field.innerHTML='<label class="field">Record name<input name="recordName" required maxlength="100" value="'+esc(row.name || "")+'"></label>'+
          '<label class="field">Details<textarea name="details" maxlength="400">'+esc(row.details || "")+'</textarea></label>'+
          '<label class="field">Customer code (leave blank for everyone)<input name="customer" maxlength="64" pattern="[a-f0-9]{64}" value="'+esc(row.customer || "")+'"></label>'+
          '<button type="button" class="secondary">Remove record</button>';
        field.querySelector("button").onclick=()=>field.remove(); rows.append(field);
      }
      for (const row of data?.rows || []) add(row);
      form.elements.connector.value=data?.connector || "";
      form.querySelector("[data-add-row]").onclick=()=>add();
      async function saveRows(flags) {
        const entries=[...rows.children].map(field=>({name:field.querySelector('[name="recordName"]').value,details:field.querySelector('[name="details"]').value,customer:field.querySelector('[name="customer"]').value}));
        const payload={revision:config.revision,blockId:id,rows:entries,connector:form.elements.connector.value,...flags};
        for (const control of form.elements) control.disabled=true;
        try {
          await workspaceRequest(path,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
          if (serial===version) { await load(); status.textContent="Environment records saved."; }
        } catch (error) { if (serial===version) status.textContent=error.message; }
        finally { for (const control of form.elements) control.disabled=false; }
      }
      form.onsubmit=event=>{event.preventDefault(); void saveRows({});};
      form.querySelector("[data-refresh]").onclick=()=>void saveRows({refresh:true});
      form.querySelector("[data-sample]").onclick=()=>void saveRows({useSample:true});
    } catch (error) { if (serial===version) status.textContent=error.message; }
  }
  list.onchange=environment.onchange=load;
  await load();
}
