"use strict";

function compileSiteDsl(source) {
  let project, page;
  const pages = new Map([["Home", "home"]]);
  const links = [];
  const fail = (line, message) => { throw new Error("Line " + line + ": " + message); };
  const check = (value, max, line) => {
    if (!value || value.length > max) fail(line, "Expected 1–" + max + " characters.");
    return value;
  };
  const pair = (value, separator, line) => {
    const index = value.indexOf(separator);
    if (index < 1) fail(line, "Expected two values separated by " + separator.trim());
    return [value.slice(0,index).trim(), value.slice(index + separator.length).trim()];
  };
  const commands = new Map([["title","title"],["intro","intro"],["section","section"],["details","details"]]);
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = index + 1;
    const text = raw.trim();
    if (!text || text.startsWith("//")) continue;
    const [,command,value = ""] = /^(\S+)(?:\s+(.*))?$/.exec(text);
    if (!project) {
      if (command !== "site") fail(line,"Start with site NAME using TEMPLATE.");
      const [name,key] = pair(value," using ",line);
      if (!["studio","summit","brew","blank"].includes(key)) fail(line,"Unknown template " + key);
      project = makeCatalogProject(key === "blank" ? blank("web") : templates.find(t=>t.id === key),check(name,70,line));
      page = project;
    } else if (command === "page") {
      check(value,50,line);
      if (pages.has(value)) {
        page = value === "Home" ? project : project.pages.find(p=>p.id === pages.get(value));
      } else {
        if (pages.size >= pageLimit) fail(line,"Too many pages.");
        if ([...pages.keys()].some(name=>name.toLowerCase() === value.toLowerCase())) fail(line,"Use the original page capitalization.");
        page = {...blank("web"),id:crypto.randomUUID(),name:value,title:value,color:project.color};
        (project.pages ??= []).push(page);
        pages.set(value,page.id);
      }
    } else if (commands.has(command)) {
      page[command] = check(value,fields.find(([key])=>key === command)[2],line);
    } else if (command === "color") {
      if (!/^#[0-9a-f]{6}$/i.test(value)) fail(line,"Use a six-digit hex color.");
      page.color = value;
    } else if (command === "button") {
      const [label,target] = pair(value," to ",line);
      page.button = check(label,50,line);
      links.push({page,target,line});
    } else {
      const single = ["heading","text","list"];
      const double = ["faq","quote","columns","form","checklist","callout"];
      if (![...single,...double].includes(command)) fail(line,"Unknown command " + command);
      const [a,b] = double.includes(command) ? pair(value," | ",line).map(v=>check(v,maxBlockText,line)) : [check(value,maxBlockText,line),""];
      const rows = v=>v.split(" / ").map(item=>check(item.trim(),maxBlockText,line)).join("\n");
      const block = {...newBlock(command),a:command === "list" ? rows(a) : a,b:["form","checklist"].includes(command) ? rows(b) : b};
      if (command === "form" && block.b.split("\n").length > 8) fail(line,"Forms support eight fields.");
      const blocks = page.blocks ??= [];
      if (blocks.length >= maxBlocks) fail(line,"Too many blocks on this page.");
      blocks.push(block);
    }
  }
  if (!project) fail(1,"Start with site NAME using TEMPLATE.");
  for (const {page,target,line} of links) {
    if (!pages.has(target)) fail(line,"Unknown destination page " + target);
    page.buttonTarget = pages.get(target);
  }
  return project;
}

function siteDslDialog() {
  openDialog("Build a website from text", '<p>Give the <a href="site-dsl.md" target="_blank" rel="noopener">language specification</a> and your website request to an AI. Paste its answer below.</p><form id="dsl-form"><label class="field">Website source<textarea name="source" rows="12" required></textarea></label><p role="alert" id="dsl-error"></p><button class="primary">Compile website</button></form>');
  const form = $("#dsl-form");
  form.elements.source.value = "site Pine Walks using summit\ntitle Guided walks in the pines\nbutton See trips to Trips\npage Trips\nlist Forest loop / Ridge trail";
  form.onsubmit = event=>{
    event.preventDefault();
    let draft;
    try { draft = compileSiteDsl(form.elements.source.value); }
    catch (error) { $("#dsl-error").textContent = error.message; return; }
    current = draft;
    projects.unshift(draft);
    save();
    modal.close();
    actions.open(draft.id);
  };
}
