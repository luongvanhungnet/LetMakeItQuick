"use strict";

function releaseSlug(name) {
  return String(name).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"").slice(0,60).replace(/-$/,"");
}
function releaseCode(project) { return new URL(snapshotLink(project)).hash.slice(6); }
function releaseDefaults(project) {
  const fallback = releaseSlug(project.name);
  return releaseMeta({
    slug:project.hostedSlug || (fallback.length>=3 ? fallback : "project-"+project.id.slice(0,8)),
    title:project.name,description:project.intro,visibility:"private",journey:"browse"
  });
}
async function getLatestHostedRelease(project) {
  if (!project?.hostedSlug) return null;
  const query = new URLSearchParams({projectId:project.id,slug:project.hostedSlug});
  try {
    const {history} = await apiJSON("/api/releases?"+query);
    const live = history?.versions.find(entry=>entry.id === history.live);
    return live ? {...live,slug:history.slug,version:live.number,url:new URL("/launch/"+history.slug,location.origin).href} : null;
  } catch { return null; }
}
function releaseCheckList(issues) {
  if (!issues.length) return '<p class="subtext">No items found in preflight.</p>';
  return '<ul class="release-checklist">'+issues.map(issue=>'<li><strong class="'+(issue.severity==="block"?"release-block":"release-warn")+'">'+
    (issue.severity==="block"?"Blocker":"Review")+'</strong><span>'+esc(issue.location)+' · '+esc(issue.message)+'</span></li>').join("")+'</ul>';
}
function releaseSmokeList(report) {
  if (!report) return "";
  return '<h3>Smoke test</h3><ul class="release-checklist">'+report.checks.map(check=>
    '<li><strong>'+({passed:"Passed",failed:"Failed",manual:"Manual"}[check.status] || "Check")+'</strong><span>'+esc(check.label)+'</span></li>').join("")+'</ul>';
}
function releaseDeploymentList(deployment) {
  return deployment?.checks ? '<h4>Post-deploy checks</h4><ul class="release-checklist">'+deployment.checks.map(check=>
    '<li><strong>'+({passed:"Passed",failed:"Failed",manual:"Manual"}[check.status] || "Check")+'</strong><span>'+esc(check.label)+'</span></li>').join("")+'</ul>' : "";
}
function releaseStudio() {
  const project = current;
  openDialog("Hosted release",
    '<p class="subtext">Stage and test a frozen copy before putting it live. Public links also require public access on the hosting Site.</p>'+
    '<form id="release-settings">'+
    '<label class="field">Stable URL slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minlength="3" maxlength="60"></label>'+
    '<label class="field">Release title<input name="title" required maxlength="100"></label>'+
    '<label class="field">Description<textarea name="description" maxlength="180"></textarea></label>'+
    '<label class="field">Social image<input name="socialImage" maxlength="700" placeholder="HTTPS URL or bundled media path"></label>'+
    '<label class="field">Favicon<input name="favicon" maxlength="700" placeholder="HTTPS URL or bundled media path"></label>'+
    '<div class="release-fields"><label class="field">Visibility<select name="visibility"><option value="private">Private (creator only)</option><option value="public">Public on an open host</option></select></label>'+
    '<label class="field">Smoke test journey<select name="journey"><option value="browse">Browse product</option><option value="signup">Sign up</option><option value="checkout">Test checkout</option><option value="download">Download</option></select></label></div>'+
    '<label class="template-switch"><input type="checkbox" name="index"> Allow search indexing of public release</label>'+
    '<div class="dialog-actions"><button class="secondary" data-release-action="preflight" type="button">Run preflight</button><button class="primary" type="submit">Save to staging</button></div></form>'+
    '<p class="subtext" id="release-status" role="status"></p><section id="release-checks"></section><section id="release-stage"></section><section id="release-history"></section>');
  const form = $("#release-settings"), status = $("#release-status");
  const stageArea = $("#release-stage"), historyArea = $("#release-history"), checksArea = $("#release-checks");
  const snapshot = releaseCode(project);
  let stage = null, history = null, busy = false, edited = false;
  function fill(metadata) {
    for (const key of ["slug","title","description","socialImage","favicon","visibility","journey"]) form.elements[key].value = metadata[key] || "";
    form.elements.index.checked = metadata.index;
    form.elements.slug.readOnly = !!project.hostedSlug;
    form.elements.index.disabled = metadata.visibility !== "public";
  }
  function metadata() {
    const values = Object.fromEntries(new FormData(form));
    values.index = form.elements.index.checked;
    return releaseMeta(values);
  }
  function needsBrowserChecks() {
    return stage?.browserCheckPending || stage?.smoke.checks.some(check=>check.label.includes("browser journey") && check.status === "failed");
  }
  function render() {
    const match = stage && stage.snapshot === snapshot && JSON.stringify(stage.metadata) === JSON.stringify(metadata());
    stageArea.innerHTML = stage ? '<h3>Staging</h3><p class="subtext">'+(match
      ? 'Your staged copy matches the draft and release settings.'
      : 'The staged copy differs from the draft or release settings. Stage again before publishing the latest changes.')+'</p><div class="dialog-actions">'+
      '<a class="secondary" href="/staging/'+encodeURIComponent(project.id)+'" target="_blank" rel="noopener">Open staging preview</a>'+
      (match && needsBrowserChecks() ? '<button class="secondary" type="button" data-release-action="retry-stage-checks">Retry browser checks</button>' : "")+
      '<button class="primary" type="button" data-release-action="publish" '+(!match || stage.browserCheckPending || !stage.smoke.passed?"disabled":"")+'>Publish staged version</button></div>' : "";
    const live = history?.versions.find(item=>item.id === history.live);
    historyArea.innerHTML = live ? '<h3>Release history</h3><p><strong>Live version '+live.number+'</strong> · '+esc(live.metadata.visibility)+'</p>'+releaseDeploymentList(live.deployment)+'<div class="dialog-actions">'+
      '<a class="secondary" href="/launch/'+esc(history.slug)+'" target="_blank" rel="noopener">Open release</a>'+
      (history.domains || []).map(domain=>' <a class="secondary" href="https://'+esc(domain)+'" target="_blank" rel="noopener">'+esc(domain)+'</a>').join("")+'</div><ul class="release-versions">'+history.versions.map(version=>
        '<li><span>Version '+version.number+' · '+esc(new Date(version.createdAt).toLocaleString())+' · '+(version.smoke.passed?"Preflight passed":"Needs review")+'</span>'+
        (version.id === history.live ? '<strong>Live</strong>' :
          '<button class="secondary" type="button" data-release-action="rollback" data-version="'+esc(version.id)+'">Restore version '+version.number+'</button>')+
        '<details><summary>Checks for version '+version.number+'</summary>'+releaseCheckList(version.checks || [])+
          releaseSmokeList(version.smoke)+releaseDeploymentList(version.deployment)+'</details></li>').join("")+'</ul>' : "";
  }
  async function browserChecks(history) {
    const live=history.versions.find(item=>item.id===history.live);
    if (!supportsPages(project.type) || live.metadata.journey==="checkout") return history;
    status.textContent="Checking the live URL in desktop and mobile views…";
    const checks=await checkReleaseInBrowser("/launch/"+history.slug,history.live);
    const saved=await apiJSON("/api/releases/browser-check",jsonOptions({slug:history.slug,versionId:history.live,checks}));
    return saved.history;
  }
  function showChecks(issues,smoke) { checksArea.innerHTML = '<h3>Preflight</h3>'+releaseCheckList(issues)+releaseSmokeList(smoke); }
  function showStageResult() {
    showChecks(stage.checks,stage.smoke);
    status.textContent = stage.browserCheckPending ? "Staged version saved. Run browser checks before publishing."
      : stage.smoke.passed ? "Staged version is ready to preview." : "Staged with blockers. Review preflight before publishing.";
  }
  const localAsset = path => ({exists:assetByPath.has(path) || videoClips.some(clip=>clip.path === path) ||
    path.startsWith("api/workspace/media/")});
  const jsonOptions = body=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  async function checkStagedVersion() {
    status.textContent = "Checking the staged version in desktop and mobile views…";
    try {
      const checks = await checkReleaseInBrowser("/staging/"+project.id,stage.id);
      const saved = await apiJSON("/api/releases/stage-check",jsonOptions({projectId:project.id,stageId:stage.id,checks}));
      stage = saved.stage;
      showStageResult();
    } catch (error) {
      if (error.status === 409) throw error;
      status.textContent = "The staged version was saved. Retry browser checks to continue.";
    }
  }
  async function run(message,operation) {
    if (busy) return;
    busy = true;
    status.textContent = message;
    const controls = [...modal.querySelectorAll("button,select,input,textarea")].filter(control=>control.dataset.action !== "close");
    const previous = controls.map(control=>control.disabled);
    controls.forEach(control=>control.disabled = true);
    try { await operation(); }
    catch (error) { if (form.isConnected) status.textContent = error.message; }
    finally {
      busy = false;
      controls.forEach((control,index)=>control.disabled = previous[index]);
      if (form.isConnected) render();
    }
  }
  fill(project.releaseSettings ? releaseMeta(project.releaseSettings) : releaseDefaults(project));
  form.addEventListener("input",()=>{ edited = true; form.elements.index.disabled = form.elements.visibility.value !== "public"; render(); });
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const options = metadata();
    void run("Running preflight and saving to staging…",async ()=>{
      const data = await apiJSON("/api/releases/stage",jsonOptions({projectId:project.id,snapshot,metadata:options,browserCheck:supportsPages(project.type)}));
      if (!form.isConnected) return;
      stage = data.stage;
      project.releaseSettings = stage.metadata;
      save();
      showStageResult();
      if (stage.browserCheckPending) await checkStagedVersion();
    });
  });
  function action(event) {
    const button = event.target.closest("[data-release-action]");
    if (!button || !form.isConnected) return;
    if (button.dataset.releaseAction === "preflight") {
      try {
        const settings = metadata();
        const parsed = releaseProjectFromSnapshot(snapshot);
        const issues = releasePreflight(parsed,settings,localAsset);
        showChecks(issues,releaseSmoke(parsed,settings,issues));
        status.textContent = issues.some(issue=>issue.severity === "block")?"Preflight found blockers.":"Local preflight passed.";
      } catch (error) { status.textContent = error.message; }
    } else if (button.dataset.releaseAction === "retry-stage-checks" && needsBrowserChecks()) {
      void run("Checking the staged version…",checkStagedVersion);
    } else if (button.dataset.releaseAction === "publish" && stage) {
      const expected = stage.id;
      void run("Publishing the staged version…",async ()=>{
        const result = await apiJSON("/api/releases/publish",jsonOptions({projectId:project.id,stageId:expected}));
        project.hostedSlug = result.history.slug;
        save();
        if (!form.isConnected) return;
        history = result.history;
        form.elements.slug.readOnly = true;
        try { history = await browserChecks(history); }
        catch { status.textContent = "The version is live. The browser check result could not be saved."; return; }
        status.textContent = result.alreadyDeployed ? "This staged version is already in the history." : "Version "+result.version+" is live. Open the release to verify it in your browser.";
      });
    } else if (button.dataset.releaseAction === "rollback" && history) {
      void run("Restoring the selected version…",async ()=>{
        const result = await apiJSON("/api/releases/rollback",jsonOptions({slug:history.slug,versionId:button.dataset.version}));
        if (!form.isConnected) return;
        history = result.history;
        try { history = await browserChecks(history); }
        catch { status.textContent = "The version was restored. The browser check result could not be saved."; return; }
        status.textContent = "The selected version is now live at the same URL.";
      });
    }
  }
  form.addEventListener("click",action);
  stageArea.addEventListener("click",action);
  historyArea.addEventListener("click",action);
  const settings = form.elements.slug.value;
  const query = new URLSearchParams({slug:project.hostedSlug || settings,projectId:project.id});
  void apiJSON("/api/releases?"+query).then(result=>{
    if (!form.isConnected || busy) return;
    history = result.history;
    stage = result.stage;
    if (stage && !edited) fill(stage.metadata);
    if (stage) showStageResult();
    render();
  }).catch(error=>{ if (form.isConnected) status.textContent = error.message+" Local preflight remains available."; });
}

function releaseLocation() {
  const match = /^\/(launch|staging)\/([\w-]+)\/?$/.exec(location.pathname);
  if (match) return {staging:match[1] === "staging",reference:match[2]};
  const slug = document.querySelector('meta[name="launchpad-release"]')?.content;
  return slug && slug.length>=3 && slug.length<=60 && releaseSlugPattern.test(slug) ? {staging:false,reference:slug} : null;
}
async function mountHostedRelease() {
  const locationInfo = releaseLocation();
  if (!locationInfo) return false;
  const {staging,reference} = locationInfo;
  const studio = $("#studio"), target = $("#published");
  studio.hidden = true;
  target.hidden = false;
  target.textContent = "Loading release…";
  let activeVersion;
  try {
    const testVisitor=new URLSearchParams(location.search).get("testVisitor")==="member" ? "member" : "guest";
    const result = await apiJSON("/api/releases/"+(staging?"staging/":"view/")+encodeURIComponent(reference)+(staging?"?testVisitor="+testVisitor:""));
    activeVersion = staging ? result.stage : result.release;
    const project = readSnapshot("#view="+activeVersion.snapshot);
    const browserCheck=window.parent!==window ? new URLSearchParams(location.search).get("studio_check") : "";
    const slug = staging ? activeVersion.metadata.slug : reference;
    document.title = staging ? "Staging · "+activeVersion.metadata.title : activeVersion.metadata.title;
    const checkout = staging && activeVersion.metadata.journey === "checkout"
      ? result.checkout
        ? '<a class="secondary" href="/?store='+encodeURIComponent(result.checkout.id)+'" target="_blank" rel="noopener">Test Store checkout</a><span class="subtext">Listing v'+esc(result.checkout.version)+'</span>'
        : '<span class="subtext">Save an active test listing in Package &amp; sell to try checkout.</span>'
      : "";
    target.innerHTML = (staging ? '<header class="release-preview-bar"><strong>Staging preview</strong><label>Test visitor <select data-test-visitor><option value="guest">Signed out</option><option value="member">Signed-in test account</option></select></label><button class="secondary" data-release-size="desktop" aria-pressed="true">Desktop</button><button class="secondary" data-release-size="mobile" aria-pressed="false">Mobile</button>'+checkout+'</header>' : "")+
      '<div class="release-preview-body"></div>';
    const content = target.querySelector(".release-preview-body");
    if (project.type === "video") { const player = mountVideo(content,project.video); stopPublishedGame = ()=>player.dispose(); }
    else if (isGameType(project.type)) stopPublishedGame = mountGame(content,project,true);
    else stopPublishedGame = mountPublishedPages(content,project,{slug,mode:staging || browserCheck?"test":"live",browserCheck,journey:activeVersion.metadata.journey,releaseId:activeVersion.id,productData:result.productData,returnPath:location.pathname+location.search});
    if (staging) {
      const visitor=target.querySelector("[data-test-visitor]");
      visitor.value=testVisitor;
      visitor.onchange=()=>{const url=new URL(location.href);url.searchParams.set("testVisitor",visitor.value);location.assign(url);};
      target.querySelectorAll("[data-release-size]").forEach(button=>button.addEventListener("click",()=>{
        content.classList.toggle("release-mobile",button.dataset.releaseSize === "mobile");
        target.querySelectorAll("[data-release-size]").forEach(control=>control.setAttribute("aria-pressed",String(control === button)));
      }));
    } else if (releaseHTTPS(result.supportUrl)) {
      const link = document.createElement("a");
      link.className = "release-support";
      link.href = result.supportUrl;
      link.rel = "noopener noreferrer";
      link.textContent = "Product support";
      target.append(link);
    }
  } catch (error) {
    target.innerHTML = '<p class="empty">'+esc(error.message || "Release could not load.")+'</p>';
    if (!staging && activeVersion?.id) {
      void apiJSON("/api/operations/report",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slug:reference,releaseId:activeVersion.id,code:"project-render-failed"})}).catch(()=>{});
    }
  }
  return true;
}
