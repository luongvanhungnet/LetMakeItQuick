"use strict";
const $ = (selector) => document.querySelector(selector);
const paths = {
  spark:'<path d="M12 2 9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  web:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  app:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const templates = [
  {id:"studio",type:"web",name:"Studio North",desc:"A clean portfolio for creative work.",category:"Portfolio",title:"Spaces with feeling.",intro:"Studio North is an independent design studio creating thoughtful, lived-in spaces.",section:"Selected work",details:"From quiet city apartments to inviting family homes, every space starts with how you want to feel in it.",button:"Explore our work",color:"#615543",image:"interior.jpg"},
  {id:"summit",type:"web",name:"Summit",desc:"An immersive homepage for outdoor brands.",category:"Landing page",title:"Find your wild.",intro:"Unforgettable outdoor experiences, led by people who love being out there.",section:"Plan your next adventure",details:"Start with a forest day hike, a weekend by the lake, or a guided mountain walk.",button:"Explore trips",color:"#215444",image:"forest.jpg"},
  {id:"brew",type:"web",name:"Morning Brew",desc:"A warm, welcoming site for a local café.",category:"Business",title:"A better kind of morning.",intro:"Specialty coffee, fresh pastries, and a seat with your name on it.",section:"What’s brewing",details:"Try our house espresso, seasonal pour-over, or a cinnamon bun. Open daily from 8 to 4.",button:"See the menu",color:"#784321",image:"coffee.jpg"},
  {id:"pulse",type:"app",name:"Pulse Fitness",desc:"A mobile workout routine people can check off.",category:"Fitness",title:"Let’s move.",intro:"Build momentum one workout at a time.",section:"Today’s routine",details:"Warm up\nBodyweight circuit\nCool down",button:"Start workout",color:"#7040d9"},
  {id:"daily",type:"app",name:"Daily Ritual",desc:"A simple checklist for building better habits.",category:"Productivity",title:"Small steps, every day.",intro:"Make a little time for the habits that matter.",section:"Today’s habits",details:"Drink a glass of water\nTake a 10-minute walk\nWrite one thing you’re grateful for",button:"See habits",color:"#a84e29"},
  {id:"pocket",type:"app",name:"Pocket Guide",desc:"A pocket-sized checklist for your next trip.",category:"Travel",title:"Ready to go?",intro:"Keep your travel essentials in one place.",section:"Packing list",details:"Passport and tickets\nCharger and adapter\nWater bottle\nTravel first aid kit",button:"Open packing list",color:"#17675f"}
];
const typeLabel = (type) => type === "app" ? "Mobile app" : "Website";
const blank = (type) => ({id:"blank",type,name:"Untitled project",title:"Welcome",intro:"Introduce your project.",section:type === "app" ? "Checklist" : "About",details:type === "app" ? "First task\nSecond task" : "Tell visitors what they can find here.",button:type === "app" ? "Open checklist" : "Learn more",color:"#643bed"});
const templateFor = (item) => templates.find((template) => template.id === item.template && template.type === item.type);
const storageKey = "launchpad-projects-v1";
let projects = [];
try { projects = JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch {}
let page = "templates", filter = "all", query = "", current, phone = false, timer;
const view = $("#view"), modal = $("#modal");
function toast(message) {
  $("#toast").textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => { $("#toast").textContent = ""; }, 2700);
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(projects)); return true; }
  catch { toast("Draft storage is unavailable. Download a copy to keep your work."); return false; }
}
function thumbnail(t) {
  if (t.type === "app") return '<div class="thumb '+t.id+'"><div class="phone" aria-hidden="true"><strong>'+esc(t.title)+'</strong><i></i><i></i><i></i><i></i></div></div>';
  return '<div class="thumb '+t.id+'"><div class="canvas" aria-hidden="true"><nav><span>'+t.name+'</span><span>'+t.category+'</span></nav><img class="canvas-photo" src="media/'+t.image+'" alt=""><div class="canvas-copy"><strong>'+esc(t.title)+'</strong><small>'+esc(t.button)+'</small></div></div></div>';
}
function renderCards() {
  const list = templates.filter((t) => (filter === "all" || filter === t.type) && [t.name,t.desc,t.category,typeLabel(t.type)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  $("#template-grid").innerHTML = list.length ? list.map((t) => '<button class="card" data-action="pick" data-id="'+t.id+'">'+thumbnail(t)+'<div class="card-info"><div class="card-title">'+t.name+'<span class="tag '+t.type+'">'+typeLabel(t.type)+'</span></div><p>'+t.desc+'</p></div></button>').join("") : '<p class="empty">No templates match your search.</p>';
}
function gallery() {
  view.innerHTML = '<section class="hero"><div class="hero-copy"><div class="hero-kicker">'+icon("spark")+' TEMPLATE GALLERY</div><h1>Build something<br><span>worth sharing.</span></h1><p>Start with a template, make it yours, and share a website or mobile app with anyone.</p></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="mock-browser"><div class="mock-top"><i></i><i></i><i></i></div><div class="mock-content"><div><i></i><i></i><i></i></div><div class="mock-picture"></div></div></div><div class="mock-phone"><i></i><i></i><i></i><i></i></div><span class="art-star star-one">✦</span><span class="art-star star-two">✧</span></div></section><section aria-labelledby="browse"><div class="section-head"><div><h2 id="browse">Explore templates</h2><p>Pick a starting point for your next project.</p></div><label class="search">'+icon("search")+'<input id="search" type="search" aria-label="Search templates" placeholder="Search templates…" value="'+esc(query)+'"></label></div><div class="filters" aria-label="Template type">'+[["all","grid","All templates"],["web","web","Websites"],["app","app","Mobile apps"]].map(([key,glyph,label]) => '<button class="filter '+(filter === key ? "active" : "")+'" aria-pressed="'+(filter === key)+'" data-action="filter" data-id="'+key+'">'+icon(glyph)+label+'</button>').join("")+'</div><div class="grid" id="template-grid"></div></section>';
  $("#search").addEventListener("input", (event) => { query = event.target.value; renderCards(); });
  renderCards();
}
function projectList() {
  view.innerHTML = '<div class="editor-bar"><div><h1 class="page-title">My projects</h1></div><button class="primary" data-action="new">'+icon("plus")+' New project</button></div>' +
    (projects.length ? '<div class="grid">'+projects.map((p) => '<button class="card project-card" data-action="open" data-id="'+esc(p.id)+'"><h3>'+esc(p.name)+'</h3><p class="subtext">'+(p.link ? "Published snapshot" : "Draft")+'</p><span class="tag '+p.type+'">'+typeLabel(p.type)+'</span></button>').join("")+'</div>' : '<div class="empty"><p>Your projects will appear here.</p><button class="primary" data-action="templates">Browse templates</button></div>');
}
function go(next) {
  page = next;
  $("#crumb").textContent = next === "templates" ? "Templates" : next === "projects" ? "My projects" : "Project editor";
  document.querySelectorAll(".sidebar nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.action === next);
    if (button.dataset.action === next) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  ({templates:gallery,projects:projectList,editor})[next]();
  window.scrollTo(0,0);
}
function openDialog(title, content) {
  if (modal.open) modal.close();
  modal.innerHTML = '<div class="dialog-top"><h2>'+esc(title)+'</h2><button aria-label="Close dialog" data-action="close">'+icon("close")+'</button></div>'+content;
  modal.showModal();
}
function create(t, name) {
  current = {id:crypto.randomUUID(),template:t.id,type:t.type,name:name || t.name,title:t.title,intro:t.intro,section:t.section,details:t.details,button:t.button,color:t.color};
  projects.unshift(current);
  save();
  phone = t.type === "app";
  editorMode = "blocks";
  selectedBlock = null;
  modal.close();
  go("editor");
}
const fields = [["name","Project name",70],["title","Headline",100],["intro","Introduction",350],["button","Button label",50],["section","Section title",85],["details","Section content",900],["color","Accent color",7]];
let editorMode = "blocks";
function editor() {
  const tabs = [["blocks","Build"],["settings","Template content"],["preview","Preview"]].map(([key,label]) =>
    '<button class="filter '+(key === editorMode ? "active" : "")+'" aria-pressed="'+(key === editorMode)+'" data-action="editor-mode" data-id="'+key+'">'+label+'</button>').join("");
  view.innerHTML = '<div class="editor-bar"><div><button class="secondary" data-action="projects">My projects</button><span class="save-note" id="save-note">Saved on this device</span></div><div><button class="secondary" data-action="download">Download HTML</button><button class="primary" data-action="publish">Publish</button></div></div><div class="project-heading"><h1 class="page-title">'+esc(current.name || "Untitled project")+'</h1><span class="tag">'+typeLabel(current.type)+'</span></div><nav class="filters editor-tabs" aria-label="Editor views">'+tabs+'</nav><div id="editor-body"></div>';
  const body = $("#editor-body");
  if (editorMode === "blocks") {
    body.innerHTML = builder();
    handleBuilder();
  } else if (editorMode === "settings") {
    body.innerHTML = '<section class="panel template-settings"><h2>Template content</h2><form id="fields">'+fields.map(([key,label,max]) => '<label class="field">'+(key === "details" && current.type === "app" ? "Checklist items (one per line)" : label)+(key === "details" || key === "intro" ? '<textarea name="'+key+'" maxlength="'+max+'">'+esc(current[key])+'</textarea>' : '<input name="'+key+'" type="'+(key === "color" ? "color" : "text")+'" maxlength="'+max+'" value="'+esc(current[key])+'">')+'</label>').join("")+'</form></section>';
    $("#fields").addEventListener("submit", (event) => event.preventDefault());
    $("#fields").addEventListener("input", (event) => {
      current[event.target.name] = event.target.value;
      $(".project-heading h1").textContent = current.name || "Untitled project";
      saveEditor();
    });
  } else {
    body.innerHTML = '<div class="editor-bar"><h2>Preview</h2><div><button class="filter '+(!phone ? "active" : "")+'" aria-pressed="'+!phone+'" data-action="desktop">'+icon("web")+' Desktop</button><button class="filter '+(phone ? "active" : "")+'" aria-pressed="'+phone+'" data-action="mobile">'+icon("app")+' Mobile</button></div></div><div class="preview '+(phone ? "mobile" : "")+'"><iframe id="preview" title="Project preview" sandbox="allow-scripts"></iframe></div>';
    $("#preview").srcdoc = projectHTML(current);
  }
}
function projectHTML(p, imageOverride, assets) {
  const color = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#643bed";
  const image = templateFor(p)?.image;
  const picture = imageOverride || (image ? new URL("media/"+image,location.href).href : "");
  const isApp = p.type === "app";
  const content = isApp ? '<div class="progress"><strong id="count"></strong><button id="reset" type="button">Reset</button></div><div class="tasks">'+p.details.split("\n").filter((line) => line.trim()).map((line,index) => '<label><input type="checkbox" value="'+index+'"><span>'+esc(line)+'</span></label>').join("")+'</div>' : '<p class="details">'+esc(p.details)+'</p>';
  const appScript = '('+function () {
    const tasks = [...document.querySelectorAll("#content input[type=checkbox]")];
    let storage = null;
    let key = "";
    try {
      storage = window.parent === window ? localStorage : window.parent.localStorage;
      key = "launchpad-checks:"+ (window.parent === window ? document.title+location.pathname : window.parent.location.hash);
    } catch {}
    try {
      const values = JSON.parse(storage?.getItem(key) || "[]");
      tasks.forEach((task,index) => {task.checked = values[index] === true;});
    } catch {}
    function update() {
      const checked = tasks.map((task) => task.checked);
      document.querySelector("#count").textContent = checked.filter(Boolean).length+" of "+tasks.length+" completed";
      try { storage?.setItem(key,JSON.stringify(checked)); } catch {}
    }
    tasks.forEach((task) => task.addEventListener("change",update));
    document.querySelector("#reset").addEventListener("click", () => {tasks.forEach((task) => {task.checked = false;});update();});
    update();
  }.toString()+')();';
  const scrollScript = '('+function () {
    document.querySelector(".cta")?.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelector("#content").scrollIntoView({behavior:"smooth"});
    });
  }.toString()+')();';
  const extra = (p.blocks || []).map((block) => '<section class="lp-block">'+renderBlock(block,assets)+'</section>').join("");
  const script = scrollScript+(!p.hideTemplate && isApp ? appScript : "")+(extra ? '('+blockInteraction.toString()+')();' : "");
  const base = p.hideTemplate ? "" : '<div class="intro '+(picture?"with-photo":"")+'"><div><h1>'+esc(p.title)+'</h1><p>'+esc(p.intro)+'</p>'+(p.button ? '<a class="cta" href="#content">'+esc(p.button)+'</a>' : '')+'</div>'+(picture ? '<img src="'+esc(picture)+'" alt="">' : '')+'</div><section id="content"><h2>'+esc(p.section)+'</h2>'+content+'</section>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(p.name)+'</title><style>'+projectCSS(color)+blockProjectCSS+'</style></head><body class="'+(isApp?"app":"website")+'"><main><header><strong>'+esc(p.name)+'</strong></header>'+base+extra+'</main><script>'+script+'</script></body></html>';
}
function projectCSS(color) {
  return ':root{--accent:'+color+';font-family:system-ui,sans-serif;color:#201b29;background:#faf9fc}*{box-sizing:border-box}body{margin:0}main{max-width:1240px;margin:auto}header{padding:19px clamp(18px,5vw,56px);background:white;border-bottom:1px solid #eae5ef;font-size:17px}.intro{padding:clamp(30px,7vw,76px) clamp(18px,5vw,56px);display:grid;align-items:center;gap:20px;background:color-mix(in srgb,var(--accent) 10%,white)}.with-photo{grid-template-columns:1fr 1fr}.intro img{width:100%;height:clamp(170px,26vw,390px);object-fit:cover;border-radius:14px}h1{font-size:clamp(34px,6vw,78px);line-height:1.02;letter-spacing:-.055em;margin:0 0 16px}p{font-size:17px;line-height:1.55;margin:0;white-space:pre-wrap}h1,h2,p,strong,span{overflow-wrap:anywhere}.cta{display:inline-block;margin-top:20px;padding:11px 16px;border-radius:8px;background:var(--accent);color:white;text-decoration:none;font-weight:700;text-shadow:0 1px 3px #0008}section{padding:28px clamp(18px,5vw,56px)}h2{margin:0 0 15px;font-size:28px;letter-spacing:-.025em}.app main{max-width:650px;min-height:100vh;background:white}.app .intro{border-radius:15px;margin:14px;padding:23px}.app section{padding:14px 18px 30px}.tasks{display:grid;gap:8px}.tasks label{display:flex;align-items:center;gap:10px;border:1px solid #eae5ef;border-radius:9px;padding:11px;cursor:pointer}.tasks input{width:19px;height:19px;accent-color:var(--accent);flex:none}.tasks input:checked+span{text-decoration:line-through;color:#686270}.progress{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;font-size:14px}.progress button{font:inherit;background:none;border:1px solid #ddd5e8;border-radius:7px;padding:4px 10px;cursor:pointer}@media(max-width:520px){.with-photo{grid-template-columns:1fr}}';
}
function snapshotLink(p) {
  const snapshot = {template:p.template,type:p.type};
  for (const [key] of fields) snapshot[key] = p[key];
  if (p.blocks?.length) snapshot.blocks = p.blocks;
  if (p.hideTemplate) snapshot.hideTemplate = true;
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const code = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
  const url = new URL("./",location.href);
  url.hash = "view="+code;
  return url.href;
}
function readSnapshot(hash) {
  const code = hash.slice(6);
  if (code.length > 200000 || !/^[\w-]+$/.test(code)) throw Error("Invalid snapshot");
  const bytes = Uint8Array.from(atob(code.replaceAll("-","+").replaceAll("_","/")), (char) => char.charCodeAt(0));
  const p = JSON.parse(new TextDecoder().decode(bytes));
  if (!p || !["web","app"].includes(p.type) || fields.some(([key,,max]) => typeof p[key] !== "string" || p[key].length > max)) throw Error("Invalid snapshot");
  if (p.blocks !== undefined && !validBlocks(p.blocks)) throw Error("Invalid blocks");
  p.hideTemplate = p.hideTemplate === true;
  return p;
}
function route() {
  const publicPage = location.hash.startsWith("#view=");
  $("#studio").hidden = publicPage;
  const target = $("#published");
  target.hidden = !publicPage;
  if (!publicPage) { document.title = "Launchpad Studio"; return; }
  try {
    const p = readSnapshot(location.hash);
    document.title = p.name || "Published project";
    if (p.type === "app" || p.blocks?.some((block) => block.type === "checklist")) {
      const frame = document.createElement("iframe");
      frame.className = "published-view";
      frame.title = document.title;
      frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
      frame.srcdoc = projectHTML(p);
      target.replaceChildren(frame);
    } else {
      const frame = document.createElement("iframe");
      frame.className = "published-view";
      frame.title = document.title;
      frame.setAttribute("sandbox","allow-scripts allow-popups allow-popups-to-escape-sandbox");
      frame.srcdoc = projectHTML(p);
      target.replaceChildren(frame);
    }
  } catch { target.innerHTML = '<p class="empty">This project link is incomplete or invalid. <a href="./">Open Launchpad Studio</a></p>'; }
}
function publish() {
  if (!current.name.trim() || (!current.hideTemplate && !current.title.trim())) { toast("Enter a project name and headline first."); return; }
  current.link = snapshotLink(current);
  save();
  openDialog("Project published",'<p class="subtext">Share this snapshot with friends. Publish again to create a link with your latest edits.</p><label class="field">Share link<input id="share-link" readonly value="'+esc(current.link)+'"></label><div class="dialog-actions"><button class="primary" data-action="copy">Copy link</button><a class="secondary" href="'+esc(current.link)+'" target="_blank" rel="noopener">Open published project</a></div><p class="subtext" id="copy-status" aria-live="polite"></p>');
}
async function download() {
  const p = structuredClone(current);
  const image = p.hideTemplate ? null : templateFor(p)?.image;
  const paths = new Set(image ? ["media/"+image] : []);
  for (const block of p.blocks || []) {
    if (block.type === "image" && /^media\/(forest|interior|coffee)\.jpg$/.test(block.b)) paths.add(block.b);
  }
  const assets = {};
  try {
    await Promise.all([...paths].map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw Error("Image missing");
      const file = await response.blob();
      assets[path] = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }));
  } catch { toast("The image couldn’t be embedded. Try again when connected."); return; }
  const url = URL.createObjectURL(new Blob([projectHTML(p,assets["media/"+image],assets)], {type:"text/html"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = (p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "project")+".html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
const actions = {
  templates: () => go("templates"), projects: () => go("projects"), close: () => modal.close(),
  new: () => openDialog("New project",'<p class="subtext">Choose a template or start with a blank project.</p><div class="dialog-actions"><button class="primary" data-action="browse">Browse templates</button><button class="secondary" data-action="blank" data-id="web">Blank website</button><button class="secondary" data-action="blank" data-id="app">Blank mobile app</button></div>'),
  browse: () => { modal.close(); filter = "all"; query = ""; go("templates"); },
  blank: (id) => setup(blank(id)), pick: (id) => setup(templates.find((t) => t.id === id)),
  filter: (id) => {
    filter = id;
    document.querySelectorAll(".filter").forEach((button) => { const active = button.dataset.id === id; button.classList.toggle("active",active); button.setAttribute("aria-pressed",active); });
    renderCards();
  },
  open: (id) => { current = projects.find((p) => p.id === id); phone = current.type === "app"; editorMode = "blocks"; selectedBlock = null; go("editor"); },
  "editor-mode": (mode) => { editorMode = mode; editor(); },
  desktop: () => { phone = false; editor(); }, mobile: () => { phone = true; editor(); },
  publish, download,
  copy: async () => {
    const input = $("#share-link");
    input.select();
    try { await navigator.clipboard.writeText(input.value); $("#copy-status").textContent = "Share link copied."; }
    catch { $("#copy-status").textContent = "Select and copy the share link."; }
  },
  help: () => openDialog("Using Launchpad",'<p class="subtext">Choose a template, edit its content, and switch between desktop and mobile previews. Your drafts are saved in this browser. Publish creates a shareable snapshot. Download HTML saves a standalone file.</p>')
};
function setup(t) {
  openDialog(t.id === "blank" ? "Start from scratch" : t.name,'<p class="subtext">'+typeLabel(t.type)+(t.desc ? ' · '+esc(t.desc) : '')+'</p><form id="new-project"><label class="field">Project name<input name="name" value="'+esc(t.name)+'" maxlength="70" required></label><div class="dialog-actions"><button class="primary" type="submit">Create project</button></div></form>');
  $("#new-project").addEventListener("submit", (event) => { event.preventDefault(); create(t,new FormData(event.currentTarget).get("name").trim()); });
}
document.querySelectorAll("[data-icon]").forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) actions[button.dataset.action]?.(button.dataset.id);
});
window.addEventListener("hashchange",route);
go(page);
route();
