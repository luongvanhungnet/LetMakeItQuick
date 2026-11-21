"use strict";

const templateGoals = [
  ["product","Product landing page"],["business","Small business site"],["download","Paid digital download"],
  ["portal","Client portal"],["demo","Playable demo"],["portfolio","Portfolio"],
  ["routine","Daily-use app"],["promotion","Video promotion"]
];

const productTemplates = [
  {
    id:"field-guide",type:"web",name:"Field Guide Store",category:"Digital download",
    desc:"Show a sample of a digital product and explain what comes with the full download.",image:"forest.jpg",color:"#215444",
    title:"A field guide to quiet trails.",intro:"A concise route planner for anyone who wants a slower weekend outside.",
    section:"What’s inside",details:"A packing list, route planning notes, and a printable trail journal.",button:"Preview the guide",
    starterPages:[
      {name:"Preview",title:"A sample from the guide",intro:"Try the first step before you set out.",section:"Plan one simple route",details:"Pick a loop with a clear trailhead, note a turnaround time, and share the route with a friend.",starterBlocks:[["downloads","Download the trail preview image","media/forest.jpg"]],button:"See product details",target:"Product details"},
      {name:"Product details",title:"The weekend trail bundle",intro:"Use this page to introduce your downloadable guide.",section:"Included files",details:"Trail plan, trip checklist, and printable journal. Replace this example with your own files and pricing.",button:"Back to the guide",target:"Home"}
    ],
    starterTarget:"Preview",goal:"download",
    features:["Product preview","Sample download","Details and file listing"],
    sample:"Illustrative guide content. Add your own files and configure sales before taking orders."
  },
  {
    id:"harbor-portal",type:"app",name:"Harbor Client Portal",category:"Client resources",
    desc:"Give clients a place to find milestones, resources, and next steps.",color:"#225c64",
    title:"Your project, in one place.",intro:"A landing space for project updates, resources, and next steps.",
    section:"Getting started",details:"Review the proposal\nShare brand files\nConfirm the kickoff date",button:"Open resources",
    starterPages:[
      {name:"Resources",title:"Project resources",intro:"Give clients one place to find the documents they need.",section:"Before the kickoff",details:"Open the project brief\nCollect reference links\nSend account access through your approved channel",starterBlocks:[["records","Sample project milestones","Milestone | Status\nKickoff call | Confirmed\nFirst draft | Scheduled\nReview | Pending"]],button:"View next steps",target:"Next steps"},
      {name:"Next steps",title:"Next steps",intro:"Keep this checklist up to date as the project moves forward.",section:"This week",details:"Review the first draft\nAdd feedback\nConfirm the next milestone",button:"Back to the portal",target:"Home"}
    ],
    starterTarget:"Resources",goal:"portal",
    features:["Client resources page","Sample milestone records","Onboarding checklist"],
    sample:"Fictional client onboarding steps. Configure sign-in before adding private client information."
  },
  {
    id:"atlas-launch",type:"web",name:"Atlas Product Launch",category:"Product launch",
    desc:"Introduce a product, show its features, and collect inquiries.",image:"interior.jpg",color:"#4c3385",
    title:"Plan your next project with Atlas.",intro:"Bring milestones, decisions, and next steps into one place.",
    section:"Designed for small teams",details:"Give customers a clear account of what your product does and who it helps.",button:"Explore features",
    starterPages:[
      {name:"Features",title:"A clear view of the work",intro:"Show how your product helps customers get something done.",section:"What you can do",details:"Build a milestone plan, keep decisions together, and share progress.",button:"Get in touch",target:"Contact"},
      {name:"Contact",title:"Talk to the team",intro:"Tell visitors where to reach you and when to expect a reply.",section:"Get in touch",details:"Replace this sample text with your business contact information.",starterBlocks:[["form","Contact the Atlas team","Name\nEmail\nMessage"]],button:"Back to Atlas",target:"Home"}
    ],
    starterTarget:"Features",goal:"product",
    features:["Product introduction","Features page","Contact form"],
    sample:"A fictional planning product with editable launch copy."
  }
];
const catalogDetails = {
  studio:{goal:"portfolio",features:["Project showcase","Portfolio intro"],sample:"Fictional interior design studio and selected work."},
  summit:{goal:"product",features:["Outdoor product introduction","Trip overview"],sample:"Illustrative hiking trips and guide services."},
  brew:{goal:"business",features:["Business homepage","Menu and opening hours"],sample:"Fictional café, sample drinks and opening hours."},
  pulse:{goal:"routine",features:["Workout checklist","Progress tracker"],sample:"Three sample steps for a workout."},
  daily:{goal:"routine",features:["Habit checklist","Progress tracker"],sample:"Three daily habits ready to replace."},
  pocket:{goal:"routine",features:["Travel checklist","Progress tracker"],sample:"Four sample packing-list items."}
};
const catalogLicenseDocs = {
  "CC0-1.0":"https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0":"https://creativecommons.org/licenses/by/4.0/",
  "MIT":"https://opensource.org/license/mit"
};
let catalogGoal = "";

function catalogTemplates() {
  return [...templates,...productTemplates,...gameTemplates,...game3DTemplates,...videoTemplates];
}

function catalogCredit(value) {
  if (!Array.isArray(value)) return null;
  const hashes = new Set();
  const result = [];
  for (const item of value.slice(-8)) {
    if (!item || typeof item.id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(item.id) ||
        !Number.isSafeInteger(item.version) || item.version < 1 ||
        !["CC0-1.0","CC-BY-4.0","MIT"].includes(item.license) ||
        typeof item.title !== "string" || !item.title.trim() || item.title.length > 70 ||
        typeof item.attribution !== "string" || !item.attribution.trim() || item.attribution.length > 80) continue;
    const key = item.id+":"+item.version;
    if (hashes.has(key)) continue;
    hashes.add(key);
    const {id,version,title,attribution,license} = item;
    result.push({id,version,title,attribution,license});
  }
  return result.length ? result : null;
}

function renderTemplateCredit(project) {
  const credit = catalogCredit(project.templateCredit);
  if (!credit) return "";
  return '<footer class="template-credit"><small>Template credits</small><ul>'+credit.map(item=>
    '<li>'+esc(item.title)+' v'+item.version+' by '+esc(item.attribution)+' · <a href="'+catalogLicenseDocs[item.license]+'" target="_blank" rel="noopener noreferrer">'+esc(item.license)+'</a></li>'
  ).join("")+'</ul></footer>';
}

function catalogMetadata(template) {
  if (template.community) return {pages:template.community.pages,output:"Hosted release or standalone HTML",features:["Community template"],sample:"Creator-submitted starter content."};
  const output = template.type === "video" ? "Video file or standalone HTML"
    : isGameType(template.type) ? "Playable hosted release or standalone HTML"
    : "Hosted release or standalone HTML";
  const content = isGameType(template.type)
    ? {goal:"demo",features:["Playable level","Keyboard and touch controls"],sample:"A starter board with obstacles, collectibles, and a gate."}
    : template.type === "video"
      ? {goal:"promotion",features:["Editable timeline","Titles and captions"],sample:template.scenes.length+" sample scenes with text and reusable media."}
      : catalogDetails[template.id] || {};
  return {
    ...content,
    ...(template.goal ? {goal:template.goal,features:template.features,sample:template.sample} : {}),
    pages:supportsPages(template.type) ? ["Home",...(template.starterPages || []).map(page=>page.name)] : [],
    output
  };
}

function makeCatalogProject(template, name) {
  if (template.community) {
    const source = readSnapshot("#view="+template.community.snapshot);
    const templateCredit = catalogCredit([...(catalogCredit(source.templateCredit) || []),template.community]);
    return {...source,id:crypto.randomUUID(),name:name || template.name,templateCredit};
  }
  const defaults = {...blank(template.type),...template};
  const draft = {id:crypto.randomUUID(),template:template.id,type:template.type};
  for (const [key] of fields) draft[key] = defaults[key];
  draft.name = name || template.name;
  if (template.type === "video") draft.video = setupVideo(template);
  if (isGameType(template.type)) draft.game = setupGame(template);
  if (template.starterPages) {
    const ids = new Map([["Home",homePage],...template.starterPages.map(page=>[page.name,crypto.randomUUID()])]);
    draft.pages = template.starterPages.map(({target,starterBlocks,...content})=>({
      color:draft.color,...content,id:ids.get(content.name),
      ...(starterBlocks ? {blocks:starterBlocks.filter(([type])=>Object.hasOwn(blockTypes,type)).map(([type,a,b])=>({...newBlock(type),a,b}))} : {}),
      ...(target ? {buttonTarget:ids.get(target)} : {})
    }));
    if (template.starterTarget) draft.buttonTarget = ids.get(template.starterTarget);
  }
  return draft;
}

function renderTemplateCards() {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const list = catalogTemplates().filter(template=>{
    const meta = catalogMetadata(template);
    const goalName = templateGoals.find(([id])=>id === meta.goal)?.[1];
    return (filter === "all" || filter === template.type) && (!catalogGoal || meta.goal === catalogGoal) &&
      terms.every(term=>[template.name,template.desc,template.category,typeLabel(template.type),goalName,meta.sample,meta.output,...(meta.features || []),...meta.pages].join(" ").toLowerCase().includes(term));
  });
  $("#template-grid").innerHTML = list.length ? list.map(template=>{
    const meta = catalogMetadata(template);
    const goalName = templateGoals.find(([id])=>id === meta.goal)?.[1] || template.category;
    return '<button class="card" data-action="pick" data-id="'+template.id+'">'+thumbnail(template)+
      '<div class="card-info"><div class="card-title">'+esc(template.name)+'<span class="tag '+template.type+'">'+typeLabel(template.type)+'</span></div>'+
      '<p>'+esc(template.desc)+'</p><p class="catalog-card-goal">'+esc(goalName)+'</p></div></button>';
  }).join("") : '<p class="empty">No templates match these filters.</p>';
  $("#catalog-result").textContent = list.length+" "+(list.length === 1 ? "template" : "templates");
}

function renderTemplateGallery() {
  view.innerHTML = '<section class="hero"><div class="hero-copy">'+
    '<h1>Start with a template. <span>Make it yours.</span></h1>'+
    '<p>Build a website, mobile app, game, or video from a starting point that fits your goal.</p>'+
    '<div class="dialog-actions"><button class="secondary" id="catalog-sample">Explore a sample project</button><button class="secondary" id="community-catalog">Community templates</button></div></div>'+
    '<div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="mock-browser"><div class="mock-top"><i></i><i></i><i></i></div><div class="mock-content"><div><i></i><i></i><i></i></div><div class="mock-picture"></div></div></div><div class="mock-phone"><i></i><i></i><i></i><i></i></div><span class="art-star star-one">✦</span><span class="art-star star-two">✧</span></div></section>'+
    '<section aria-labelledby="browse"><div class="section-head"><div><h2 id="browse">Explore templates</h2></div></div>'+
    '<div class="catalog-controls"><label class="search">'+icon("search")+'<input id="search" type="search" aria-label="Search templates" placeholder="Search templates…" value="'+esc(query)+'"></label>'+
      '<label class="field">Goal<select id="catalog-goal"><option value="">All goals</option>'+templateGoals.map(([id,name])=>'<option value="'+id+'"'+(id===catalogGoal?' selected':'')+'>'+name+'</option>').join("")+'</select></label>'+
      '<button class="filter" id="catalog-reset">Clear filters</button></div>'+
    '<div class="filters" aria-label="Template type">'+[["all","grid","All types"],["web","web","Websites"],["app","app","Mobile apps"],["game","grid","2D games"],["game3d","layers","3D games"],["video","web","Videos"]].map(([key,glyph,label]) => '<button class="filter '+(filter === key ? "active" : "")+'" aria-pressed="'+(filter === key)+'" data-action="filter" data-id="'+key+'">'+icon(glyph)+label+'</button>').join("")+'</div>'+
    '<p id="catalog-result" class="subtext" aria-live="polite"></p><div class="grid" id="template-grid"></div></section>';
  $("#search").addEventListener("input",event=>{query = event.target.value; renderTemplateCards();});
  $("#catalog-goal").addEventListener("change",event=>{catalogGoal = event.target.value; renderTemplateCards();});
  $("#catalog-reset").addEventListener("click",()=>{
    filter = "all";
    query = "";
    catalogGoal = "";
    renderTemplateGallery();
    $("#search").focus();
  });
  $("#catalog-sample").addEventListener("click",()=>showTemplateSetup(productTemplates.find(template=>template.id === "atlas-launch"),true));
  $("#community-catalog").addEventListener("click",openCommunityCatalog);
  renderTemplateCards();
}

function showTemplateSetup(template,sample = false,previewOnly = false) {
  if (!template) return;
  const meta = catalogMetadata(template);
  openDialog(sample ? "Sample project" : template.name,
    '<div class="catalog-dialog"><div><p class="subtext">'+typeLabel(template.type)+' · '+esc(template.desc)+'</p>'+
    '<dl class="catalog-facts">'+(meta.pages.length ? '<div><dt>Pages</dt><dd>'+esc(meta.pages.join(", "))+'</dd></div>' : '')+
    '<div><dt>Features</dt><dd>'+esc((meta.features || []).join(", "))+'</dd></div>'+
    (template.community ? '<div><dt>Attribution and license</dt><dd>'+esc(template.community.attribution)+' · '+esc(template.community.license)+' · v'+template.community.version+'</dd></div>' : '')+
    '<div><dt>Sample content</dt><dd>'+esc(meta.sample || "")+'</dd></div><div><dt>Publish targets</dt><dd>'+esc(meta.output)+'</dd></div></dl>'+
    (sample ? '<p class="subtext">Explore the live project without signing in. To edit it, save a draft on this device. Open <strong>Workspace</strong> after signing in to import the draft.</p>' : '')+
    (previewOnly ? '<p class="subtext">Submission preview · '+esc(template.community.state)+'</p>' : '<form id="new-project"><label class="field">Project name<input name="name" value="'+esc(template.name)+'" maxlength="70" required></label>'+
    '<p class="subtext">'+(supportsPages(template.type) ? "After creating the project, change the first page in Page content." : isGameType(template.type) ? "After creating the project, customize the level and playtest it." : "After creating the project, choose a scene to edit.")+'</p>'+
    '<div class="dialog-actions"><button class="primary" type="submit">Create project</button></div></form>')+'</div>'+
    '<div class="catalog-preview"><div class="catalog-demo-heading"><h3>Live demo</h3>'+
    (supportsPages(template.type) ? '<label>View <select id="catalog-preview-size"><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>' : '')+
    '</div><div id="catalog-live-demo"></div></div></div>');
  modal.classList.add("catalog-wide");
  const host = $("#catalog-live-demo");
  const draft = makeCatalogProject(template,template.name);
  let dispose = ()=>{};
  if (isGameType(template.type)) dispose = mountGame(host,draft);
  else if (template.type === "video") {
    const preview = mountVideo(host,draft.video);
    dispose = ()=>preview.dispose();
  } else {
    const iframe = document.createElement("iframe");
    iframe.title = template.name+" live demo";
    iframe.sandbox = "allow-scripts allow-forms allow-downloads";
    iframe.style.visibility = "hidden";
    host.setAttribute("aria-busy","true");
    iframe.addEventListener("load",()=>{
      iframe.style.visibility = "";
      host.removeAttribute("aria-busy");
    },{once:true});
    iframe.srcdoc = projectHTML(draft);
    host.append(iframe);
    const resize = $("#catalog-preview-size");
    resize.value = template.type === "app" ? "mobile" : "desktop";
    const apply = ()=>host.classList.toggle("catalog-mobile-demo",resize.value === "mobile");
    resize.addEventListener("change",apply);
    apply();
  }
  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    dispose();
    observer.disconnect();
    modal.removeEventListener("close",handleClose);
    if (!modal.querySelector(".catalog-dialog")) modal.classList.remove("catalog-wide");
  }
  const handleClose = ()=>{
    if (modal.open && host.isConnected) return;
    if (!modal.open) modal.classList.remove("catalog-wide");
    stop();
  };
  const observer = new MutationObserver(()=>{if (!host.isConnected) stop();});
  observer.observe(modal,{childList:true});
  modal.addEventListener("close",handleClose);
  $("#new-project")?.addEventListener("submit",event=>{
    event.preventDefault();
    const input = event.currentTarget.elements.name;
    const name = input.value.trim();
    if (!name) { input.setCustomValidity("Enter a project name."); input.reportValidity(); return; }
    stop();
    modal.classList.remove("catalog-wide");
    create(template,name);
  });
  $("#new-project input")?.addEventListener("input",event=>event.target.setCustomValidity(""));
}

async function communityRequest(path,body) {
  const response = await fetch("/api/catalog"+path,{
    ...(body ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)} : {})
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "The template catalog is unavailable.");
  return result;
}
async function viewCommunityTemplate(id,pending = false,version = "") {
  try {
    const query = new URLSearchParams(pending ? {preview:"pending"} : version ? {version} : {});
    const {template} = await communityRequest("/"+encodeURIComponent(id)+(query.size ? "?"+query : ""));
    const draft = readSnapshot("#view="+template.snapshot);
    showTemplateSetup({name:template.title,desc:template.description,type:draft.type,community:template,starterPages:draft.pages || []},false,pending);
  } catch (error) { toast(error.message); }
}

async function openCommunityCatalog() {
  openDialog("Community templates",'<div id="community-body"><p role="status" class="subtext">Loading templates…</p></div>');
  modal.classList.add("catalog-wide");
  const body = $("#community-body");
  const renderList = (items,render,empty) => items.length ? '<ul class="community-list">'+items.map(render).join("")+'</ul>' : '<p class="subtext">'+empty+'</p>';
  try {
    const catalog = await communityRequest("");
    const {storageReady,signedIn,reviewer,templates} = catalog;
    if (!body.isConnected || !modal.open) return;
    body.innerHTML = '<h3>Approved templates</h3>'+renderList(templates,item=>'<li><div><strong>'+esc(item.title)+'</strong><p>'+esc(item.description)+'</p><small>'+esc(item.attribution)+' · '+esc(item.license)+' · v'+esc(item.version)+'</small></div>'+
      '<div class="community-actions">'+(item.versions?.length>1 ? '<label class="field community-version">Version<select aria-label="Version">'+item.versions.map(version=>'<option value="'+esc(version)+'">'+esc(version)+'</option>').join("")+'</select></label>' : "")+
      '<button class="secondary" data-community-view="'+esc(item.id)+'">Preview</button></div></li>',"There are no approved community templates yet.")+
      (storageReady ? (signedIn ? '<div class="dialog-actions"><button class="primary" id="community-submit">Submit a project</button></div><div id="community-submissions"></div>' : '<p class="subtext">Sign in to submit a project for review.</p><div class="dialog-actions"><button class="primary" data-action="workspace">Open Workspace</button></div>') : '<p class="subtext">Submissions become available when workspace storage is connected.</p>');
    body.addEventListener("click",event=>{
      const button = event.target.closest("button");
      if (button?.dataset.communityView) viewCommunityTemplate(button.dataset.communityView,button.dataset.pending === "true",button.parentElement.querySelector("select")?.value);
    });
    if (!signedIn || !storageReady) return;
    $("#community-submit").addEventListener("click",()=>openCommunitySubmission());
    const {submissions} = await communityRequest("/submissions");
    if (!body.isConnected || !modal.open) return;
    $("#community-submissions").innerHTML = '<h3>'+ (reviewer ? "Review queue and submissions" : "My submissions") +'</h3>'+renderList(submissions,({id,candidate,mine,approved,previous})=>{
      const pending = candidate.state === "pending";
      return '<li><div><strong>'+esc(candidate.title)+'</strong><p>Version '+esc(candidate.version)+' · '+esc(candidate.state)+'</p>'+
        (candidate.note ? '<small>Review note: '+esc(candidate.note)+'</small>' : '')+
        (approved ? '<small> · Published v'+esc(approved.version)+'</small>' : '')+
        (previous?.length ? '<small> · Prior versions: '+previous.map(version=>esc(version.version)).join(", ")+'</small>' : '')+
        '</div><div class="community-actions"><button class="secondary" data-community-view="'+esc(id)+'" data-pending="true">Preview submission</button>'+
        (pending && reviewer ? '<button class="primary" data-community-review="'+id+'" data-version="'+candidate.version+'">Review</button>' : '')+
        (!pending && mine ? '<button class="secondary" data-community-update="'+esc(id)+'">Submit revision</button>' : '')+'</div></li>';
    },"No submissions yet.");
    $("#community-submissions").addEventListener("click",event=>{
      const button = event.target.closest("button");
      if (button?.dataset.communityUpdate) openCommunitySubmission(submissions.find(entry=>entry.id === button.dataset.communityUpdate));
      if (button?.dataset.communityReview) openCommunityReview(button.dataset.communityReview,Number(button.dataset.version));
    });
  } catch (error) {
    if (body.isConnected) body.textContent = error.message;
  }
}
function openCommunitySubmission(entry) {
  const choices = projects.filter(project=>supportsPages(project.type));
  const details = entry?.candidate;
  openDialog(entry ? "Submit revised template" : "Submit a template",
    !choices.length ? '<p class="subtext">Create a website or web app draft, then return to submit it.</p>'
      : '<p class="subtext">Reviewers can see this draft’s publishable content. Use sample data, check links, and remove private information before submitting.</p>'+
      '<form id="community-form"><label class="field">Project<select name="project">'+choices.map(project=>'<option value="'+esc(project.id)+'">'+esc(project.name)+'</option>').join("")+'</select></label>'+
      '<label class="field">Template title<input name="title" required maxlength="70" value="'+esc(details?.title || "")+'"></label>'+
      '<label class="field">Description<textarea name="description" required maxlength="220">'+esc(details?.description || "")+'</textarea></label>'+
      '<label class="field">Creator credit<input name="attribution" required maxlength="80" value="'+esc(details?.attribution || "")+'"></label>'+
      '<label class="field">License for your content<select name="license">'+["CC0-1.0","CC-BY-4.0","MIT"].map(license=>'<option'+(license === details?.license ? " selected" : "")+'>'+license+'</option>').join("")+'</select></label>'+
      '<label class="community-attest"><input type="checkbox" name="attest" required> I have permission to share this template. Bundled assets keep their existing terms.</label>'+
      '<p class="subtext" role="status" id="community-status"></p><div class="dialog-actions"><button type="submit" class="primary">Send for review</button></div></form>');
  $("#community-form")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const project = choices.find(item=>item.id === fields.get("project"));
    const submit = form.querySelector("button");
    submit.disabled = true;
    try {
      const snapshot = new URL(snapshotLink(project)).hash.slice(6);
      await communityRequest("",{id:entry?.id,snapshot,title:fields.get("title"),description:fields.get("description"),attribution:fields.get("attribution"),license:fields.get("license"),attest:fields.has("attest")});
      toast("Template submitted for review.");
      openCommunityCatalog();
    } catch (error) {
      form.querySelector("#community-status").textContent = error.message;
      submit.disabled = false;
    }
  });
}
function openCommunityReview(id,version) {
  openDialog("Review template version "+version,
    '<p class="subtext">Preview the submission before approving its public listing.</p><form id="community-review-form"><label class="field">Decision<select name="decision"><option value="approve">Approve</option><option value="reject">Reject</option></select></label>'+
    '<label class="field">Review note (required when rejecting)<textarea name="note" maxlength="500"></textarea></label><p class="subtext" role="status" id="community-status"></p><div class="dialog-actions"><button type="submit" class="primary">Save decision</button></div></form>');
  $("#community-review-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const submit = form.querySelector("button");
    submit.disabled = true;
    try {
      await communityRequest("/"+encodeURIComponent(id)+"/review",{version,decision:fields.get("decision"),note:fields.get("note")});
      toast("Review saved.");
      openCommunityCatalog();
    } catch (error) {
      form.querySelector("#community-status").textContent = error.message;
      submit.disabled = false;
    }
  });
}
