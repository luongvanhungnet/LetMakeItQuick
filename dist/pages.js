"use strict";

const pageLimit = 12;
const homePage = "home";
let selectedPage = homePage;

function supportsPages(type) { return type === "web" || type === "app"; }
function projectPages(project) {
  return [{id:homePage,name:"Home",content:project},...(project.pages || []).map(page=>({id:page.id,name:page.name,content:page}))];
}
function editingPage() {
  return (current.pages || []).find(page=>page.id === selectedPage) || current;
}
function pageOptions(project,selected,defaultLabel) {
  return '<option value="">'+esc(defaultLabel)+'</option>'+projectPages(project).map(page =>
    '<option value="'+esc(page.id)+'" '+(page.id === selected ? "selected" : "")+'>'+esc(page.name)+'</option>'
  ).join("");
}
function pageControls(project) {
  return '<div class="page-controls"><label>Editing page<select id="page-select">'+projectPages(project).map(page=>
    '<option value="'+esc(page.id)+'" '+(page.id === selectedPage ?"selected":"")+'>'+esc(page.name)+'</option>'
  ).join("")+'</select></label><button class="secondary" data-action="add-page" '+((project.pages?.length || 0)>=pageLimit-1?"disabled":"")+'>Add page</button>'+
    (selectedPage === homePage ? "" : '<button class="filter" data-action="rename-page">Rename</button><button class="filter remove-block" data-action="remove-page">Remove</button>')+'</div>';
}
function pageNameDialog(rename) {
  if (rename && selectedPage === homePage) return;
  if (!rename && (current.pages?.length || 0) >= pageLimit-1) return;
  const existing = rename ? editingPage() : null;
  openDialog(rename ? "Rename page" : "Add a page",'<form id="page-form"><label class="field">Page name<input name="name" maxlength="50" required value="'+esc(existing?.name || "")+'" placeholder="About"></label><p class="subtext" id="page-message" role="status"></p><div class="dialog-actions"><button class="primary" type="submit">'+(rename?"Save name":"Add page")+'</button></div></form>');
  $("#page-form").addEventListener("submit",event=>{
    event.preventDefault();
    const name = event.currentTarget.elements.name.value.trim();
    if (!name || projectPages(current).some(page=>page.id !== existing?.id && page.name.toLowerCase() === name.toLowerCase())) {
      $("#page-message").textContent = "Enter a unique page name.";
      return;
    }
    if (rename) existing.name = name;
    else {
      const {title,intro,button,section,details,color} = blank(current.type);
      const page = {id:crypto.randomUUID(),name,title:name || title,intro,button,section,details,color:current.color || color};
      (current.pages ??= []).push(page);
      selectedPage = page.id;
      selectedBlock = null;
      editorMode = "settings";
    }
    save();
    modal.close();
    editor();
  });
}
function removePageDialog() {
  if (selectedPage === homePage) return;
  const page = editingPage();
  openDialog("Remove page",'<p class="subtext">Remove '+esc(page.name)+' and its content? Buttons that point to it will lose their page destination.</p><div class="dialog-actions"><button class="secondary" data-action="close">Cancel</button><button class="primary" id="confirm-remove-page">Remove page</button></div>');
  $("#confirm-remove-page").addEventListener("click",()=>{
    current.pages = current.pages.filter(item=>item.id !== page.id);
    for (const {content} of projectPages(current)) {
      if (content.buttonTarget === page.id) delete content.buttonTarget;
      for (const block of content.blocks || []) if (block.pageTarget === page.id) delete block.pageTarget;
    }
    selectedPage = homePage;
    selectedBlock = null;
    save();
    modal.close();
    editor();
  },{once:true});
}
function validProjectPages(project) {
  if (project.pages !== undefined && (!Array.isArray(project.pages) || project.pages.length>=pageLimit)) return false;
  const ids = new Set([homePage]);
  for (const page of project.pages || []) {
    if (!page || typeof page.id !== "string" || !/^[\da-f-]{36}$/i.test(page.id) || ids.has(page.id) ||
      typeof page.name !== "string" || !page.name.trim() || page.name.length>50 ||
      fields.some(([key,,max])=>key !== "name" && (typeof page[key] !== "string" || page[key].length>max)) ||
      (page.blocks !== undefined && !validBlocks(page.blocks))) return false;
    ids.add(page.id);
  }
  return projectPages(project).every(({content})=>
    (!content.buttonTarget || ids.has(content.buttonTarget)) &&
    (content.blocks || []).every(block=>!block.pageTarget || (block.type === "button" && ids.has(block.pageTarget))));
}
function pageAnchor(id,label,classes) {
  return '<a '+(classes?'class="'+classes+'" ':"")+'href="#page-'+esc(id)+'" data-page-link="'+esc(id)+'">'+esc(label)+'</a>';
}
function runPageNavigation() {
  const pages = [...document.querySelectorAll("[data-project-page]")];
  const standalone = window.parent === window;
  const initial = (pages.find(item=>!item.hidden) || pages[0]).dataset.projectPage;
  function show(id,focus) {
    const page = pages.find(item=>item.dataset.projectPage === id) || pages[0];
    for (const item of pages) item.hidden = item !== page;
    document.querySelectorAll("nav [data-page-link]").forEach(link=>{
      if (link.dataset.pageLink === page.dataset.projectPage) link.setAttribute("aria-current","page");
      else link.removeAttribute("aria-current");
    });
    if (focus) {
      window.scrollTo(0,0);
      (page.querySelector("h1,h2") || page).focus({preventScroll:true});
    }
  }
  const route = focus => show(location.hash.startsWith("#page-") ? location.hash.slice(6) :
    initial,focus);
  document.addEventListener("click",event=>{
    const link = event.target.closest("[data-page-link],[data-scroll-content]");
    if (!link) return;
    event.preventDefault();
    if (link.hasAttribute("data-scroll-content")) {
      link.closest("[data-project-page]").querySelector("[data-page-content]")?.scrollIntoView({behavior:"smooth"});
      return;
    }
    const id = link.dataset.pageLink;
    if (standalone && location.hash !== "#page-"+id) location.hash = "page-"+id;
    else show(id,true);
  });
  if (standalone) window.addEventListener("hashchange",()=>route(true));
  route(false);
}
function projectChecklistStore() {
  if (window.parent === window) {
    function keyFor(key) {
      if (key.startsWith("block:")) return "launchpad-block:"+location.pathname+":"+key.slice(6);
      const page = key.slice(5);
      return "launchpad-checks:"+document.title+location.pathname+(page === "home" ? "" : ":"+page);
    }
    return {
      getItem: key => localStorage.getItem(keyFor(key)),
      setItem: (key,value) => localStorage.setItem(keyFor(key),value)
    };
  }
  const initial = document.body.dataset.checklistState;
  if (!initial) return;
  const values = JSON.parse(initial);
  return {
    getItem: key => Object.hasOwn(values,key) ? values[key] : null,
    setItem: (key,value) => window.parent.postMessage({kind:"launchpad-checklist",key,value},"*")
  };
}
function runPageChecklists(storage) {
  for (const content of document.querySelectorAll("[data-base-checklist]")) {
    const id = content.closest("[data-project-page]").dataset.projectPage;
    const key = "page:"+id;
    const tasks = [...content.querySelectorAll("input[type=checkbox]")];
    try {
      const values = JSON.parse(storage?.getItem(key) || "[]");
      tasks.forEach((task,index)=>{task.checked = values[index] === true;});
    } catch {}
    function update() {
      const checked = tasks.map(task=>task.checked);
      content.querySelector("[data-count]").textContent = checked.filter(Boolean).length+" of "+tasks.length+" completed";
      try { storage?.setItem(key,JSON.stringify(checked)); } catch {}
    }
    tasks.forEach(task=>task.addEventListener("change",update));
    content.querySelector("[data-reset]").addEventListener("click",()=>{ tasks.forEach(task=>{task.checked=false;}); update(); });
    content.querySelector("[data-count]").textContent = tasks.filter(task=>task.checked).length+" of "+tasks.length+" completed";
  }
}
