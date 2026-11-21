"use strict";

const blockGroups = {
  Content: {
    heading: ["Heading","T","A new section"],
    text: ["Paragraph","¶","Write something here."],
    quote: ["Quote","❝","Make room for the things that matter.","Author"],
    list: ["Bullet list","☷","First item\nSecond item\nThird item"],
    stats: ["Stats","▥","At a glance","12 | Projects\n3 | Locations\n8 | Years"],
    callout: ["Callout","◇","A little more detail","Highlight something your visitors should know."]
  },
  Media: {
    image: ["Image","▧","A forest canopy","media/forest.jpg"],
    video: ["Video","▷","Video",""],
    audio: ["Audio","♫","Audio",""]
  },
  Interactive: {
    button: ["Link button","↗","Visit website","https://example.com"],
    faq: ["Accordion","☰","What should I know?","Put the answer here."],
    checklist: ["Checklist","☑","Things to do","First task\nSecond task"],
    counter: ["Counter","#","Count","0"],
    progress: ["Progress bar","◒","Progress","65"]
  },
  Product: {
    form: ["Form","▤","Send a message","Name\nEmail\nMessage"],
    signin: ["Sign-in","◉","Sign in with ChatGPT","Open your account to continue."],
    records: ["Searchable records","▦","Browse records","Sample record | Example details"],
    downloads: ["File download","↓","Download sample image","media/forest.jpg"],
    integration: ["Integration link","↗","Open integration","https://example.com"]
  },
  Layout: {
    columns: ["Two columns","◫","First column","Second column"],
    divider: ["Divider","━",""],
    spacer: ["Spacer","↕","24"]
  }
};

const blockTypes = Object.assign(Object.create(null), ...Object.values(blockGroups));
const blockFields = {
  heading: ["Heading text"], text: ["Paragraph"], quote: ["Quote", "Attribution"],
  list: ["Items (one per line)"], stats: ["Heading", "Rows (value | label)"],
  callout: ["Heading", "Message"], image: ["Alt text", "Image URL (HTTPS)"],
  video: ["Title", "Direct video file URL (HTTPS)"], audio: ["Title", "Direct audio file URL (HTTPS)"],
  button: ["Button label", "External URL (HTTPS, if no page is selected)"], faq: ["Question", "Answer"],
  checklist: ["Heading", "Tasks (one per line)"], counter: ["Label", "Starting number"],
  progress: ["Label", "Percent complete"], columns: ["Left column", "Right column"],
  form: ["Heading","Field labels, one per line (up to 8)"], signin: ["Button label","Help text"],
  records: ["Heading","Rows (name | details), one per line"], downloads: ["Button label","Library file path"],
  integration: ["Button label","Integration URL (HTTPS)"],
  divider: [], spacer: ["Height in pixels (8–120)"]
};
const maxBlocks = 30;
const maxBlockText = 700;

function validBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length > maxBlocks) return false;
  const ids = new Set();
  return blocks.every((block) => {
    if (!block || !Object.hasOwn(blockTypes, block.type) || typeof block.id !== "string" || !/^[\da-f-]{36}$/i.test(block.id) ||
        ids.has(block.id) || ![block.a,block.b].every((value) => typeof value === "string" && value.length <= maxBlockText)) return false;
    if (block.imageData !== undefined && (block.type !== "image" || !usableWorkspaceImage(block.imageData))) return false;
    if ([block.credit,block.license].some(value=>value !== undefined && (typeof value !== "string" || value.length > 160))) return false;
    ids.add(block.id);
    return true;
  });
}
function newBlock(type) {
  const [, , a, b = ""] = blockTypes[type];
  return {id:crypto.randomUUID(),type,a,b};
}
function moveBlock(blocks, from, slot) {
  if (!Number.isInteger(from) || from < 0 || from >= blocks.length || !Number.isInteger(slot) || slot < 0 || slot > blocks.length) return false;
  const index = from < slot ? slot - 1 : slot;
  if (index === from) return false;
  blocks.splice(index,0,blocks.splice(from,1)[0]);
  return true;
}
function blockURL(value, asset = false) {
  if (asset && assetByPath.has(value)) return new URL("/"+value,location.origin).href;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
function blockNumber(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value)) || 0));
}
function renderBlock(block, assets = {}, pageIds = new Set()) {
  const a = esc(block.a), b = esc(block.b), rows = block.a.split("\n").filter((row) => row.trim());
  const url = esc(blockURL(block.b,block.type === "image"));
  switch (block.type) {
    case "heading": return '<h2>'+a+'</h2>';
    case "text": return '<p>'+a+'</p>';
    case "quote": return '<blockquote><p>'+a+'</p>'+(b ? '<footer>'+b+'</footer>' : '')+'</blockquote>';
    case "list": return '<ul>'+rows.map((row) => '<li>'+esc(row)+'</li>').join("")+'</ul>';
    case "stats": return '<h2>'+a+'</h2><dl class="lp-stats">'+block.b.split("\n").filter((row) => row.trim()).map((row) => {
      const [value,...label] = row.split("|");
      return '<div><dt>'+esc(label.join("|").trim())+'</dt><dd>'+esc(value.trim())+'</dd></div>';
    }).join("")+'</dl>';
    case "callout": return '<aside class="lp-callout"><h2>'+a+'</h2><p>'+b+'</p></aside>';
    case "image": {
      const source = usableWorkspaceImage(block.imageData) ? esc(block.imageData) : assets[block.b] ? esc(assets[block.b]) : url;
      const credit = [block.credit,block.license].filter(Boolean).map(esc).join(" · ");
      return source ? '<img class="lp-media" src="'+source+'" alt="'+a+'" loading="lazy">'+(credit ? '<p class="lp-media-credit">'+credit+'</p>' : "") : "";
    }
    case "form": {
      const labels = block.b.split("\n").map(field=>field.trim()).filter(Boolean).slice(0,8).map(field=>field.slice(0,80));
      return '<h2>'+a+'</h2><form class="lp-product-form" data-product-form="'+esc(block.id)+'">'+labels.map((field,index)=>
        '<label>'+esc(field)+'<input type="'+(/e-mail|email/i.test(field)?"email":"text")+'" name="field'+index+'" maxlength="1000" required></label>'
      ).join("")+'<button class="lp-button" type="submit">Send response</button><output role="status"></output></form>';
    }
    case "signin": return (b ? '<p>'+b+'</p>' : "")+'<a class="lp-button" data-product-signin href="/signin-with-chatgpt?return_to=%2F" target="_blank" rel="noopener">'+a+'</a>';
    case "records": return '<h2>'+a+'</h2><div class="lp-product-records"><label>Search records <input type="search" data-record-search></label><ul>'+block.b.split("\n").filter(Boolean).map(row=>
      '<li data-product-record>'+esc(row.replaceAll("|"," · "))+'</li>').join("")+'</ul><output role="status"></output></div>';
    case "downloads": return assetByPath.has(block.b) ? '<a class="lp-button" href="'+esc(assets[block.b] || blockURL(block.b,true))+'" download="'+esc(block.b.split("/").at(-1))+'" target="_blank" rel="noopener">'+a+'</a>' : "";
    case "integration": return url ? '<a class="lp-button" href="'+url+'" target="_blank" rel="noopener noreferrer">'+a+'</a>' : "";
    case "video": case "audio": return url ? '<'+block.type+' class="lp-media" controls preload="none" aria-label="'+a+'" src="'+url+'"></'+block.type+'>' : '';
    case "button": return pageIds.has(block.pageTarget) ? pageAnchor(block.pageTarget,block.a,"lp-button") : url ? '<a class="lp-button" href="'+url+'" target="_blank" rel="noopener noreferrer">'+a+'</a>' : '';
    case "faq": return '<details><summary>'+a+'</summary><p>'+b+'</p></details>';
    case "checklist": return '<h2>'+a+'</h2><div class="tasks" data-checklist="'+esc(block.id)+'">'+block.b.split("\n").filter((row) => row.trim()).map((row) => '<label><input type="checkbox"><span>'+esc(row)+'</span></label>').join("")+'</div>';
    case "counter": return '<div class="lp-counter" data-counter><strong>'+a+'</strong><button type="button" data-delta="-1" aria-label="Decrease '+a+'">−</button><output aria-live="polite">'+blockNumber(block.b,-9999,9999)+'</output><button type="button" data-delta="1" aria-label="Increase '+a+'">+</button></div>';
    case "progress": return '<label class="lp-progress">'+a+' <progress value="'+blockNumber(block.b,0,100)+'" max="100"></progress></label>';
    case "columns": return '<div class="lp-columns"><p>'+a+'</p><p>'+b+'</p></div>';
    case "divider": return '<hr>';
    case "spacer": return '<div aria-hidden="true" style="height:'+blockNumber(block.a,8,120)+'px"></div>';
    default: return "";
  }
}

function blockInteraction(storage) {
  document.querySelectorAll("[data-checklist]").forEach((list) => {
    const inputs = [...list.querySelectorAll("input")];
    const key = "block:"+list.dataset.checklist;
    try {
      const checked = JSON.parse(storage?.getItem(key) || "[]");
      inputs.forEach((input,index) => { input.checked = checked[index] === true; });
    } catch {}
    list.addEventListener("change", () => {
      try { storage?.setItem(key,JSON.stringify(inputs.map((input) => input.checked))); } catch {}
    });
  });
  document.querySelectorAll("[data-counter]").forEach((counter) => {
    const output = counter.querySelector("output");
    counter.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      output.value = Number(output.value) + Number(button.dataset.delta);
    }));
  });
}

const blockProjectCSS = '.lp-block{padding-top:11px;padding-bottom:11px}.lp-block:last-child{padding-bottom:30px}.lp-block h2:last-child{margin:0}.lp-block blockquote{margin:0;border-left:4px solid var(--accent);padding:8px 16px}.lp-block footer{margin-top:6px;color:#5b5364}.lp-block details,.lp-callout,.lp-columns p,.lp-stats div{background:color-mix(in srgb,var(--accent) 9%,white);border-radius:10px;padding:14px}.lp-block summary{cursor:pointer;font-weight:700}.lp-block details p{margin-top:9px}.lp-media{display:block;max-width:100%;border-radius:10px}.lp-block img.lp-media{width:100%;max-height:460px;object-fit:cover}.lp-button{display:inline-block;padding:10px 15px;background:var(--accent);color:white;text-shadow:0 1px 3px #0008;border-radius:7px;text-decoration:none;font-weight:700}.lp-columns,.lp-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.lp-stats{grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr))}.lp-stats dt{color:#5b5364}.lp-stats dd{margin:0;font-weight:800;font-size:24px}.lp-counter{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.lp-counter button{font:inherit;padding:5px 12px;border:1px solid #dcd5e4;border-radius:6px;background:white;cursor:pointer}.lp-progress{display:grid;gap:5px}.lp-progress progress{width:100%;accent-color:var(--accent)}.lp-block hr{border:0;border-top:1px solid #dcd5e4}@media(max-width:470px){.lp-columns{grid-template-columns:1fr}}';

function builder() {
  const shelf = Object.entries(blockGroups).map(([group, types]) => '<div class="tool-group"><h3>'+group+'</h3><div class="tool-grid">'+Object.entries(types).map(([key,[label,glyph]]) => '<button type="button" class="build-tool" draggable="true" data-tool="'+key+'"><span aria-hidden="true">'+glyph+'</span>'+label+'</button>').join("")+'</div></div>').join("");
  return '<div class="builder"><aside class="panel block-shelf"><h2>Blocks</h2><p class="subtext">Drag a block or select it to add.</p><button class="secondary block-assets" data-action="project-assets">Browse asset library</button> <button class="secondary block-assets" data-action="workspace-media">Upload image</button>'+shelf+'</aside><section class="panel build-stage"><div class="stage-head"><div><h2>Page layout</h2><p class="subtext">Drag blocks to reorder them.</p></div><span class="tag" id="block-count"></span></div><label class="template-switch"><input id="show-template" type="checkbox" '+(!editingPage().hideTemplate ? 'checked' : '')+'> Show template content</label><div id="block-stage"></div><div id="block-inspector"></div></section></div>';
}
let selectedBlock = null;
let draggedBlock = null;

function saveEditor(immediate = false) {
  $("#save-note").textContent = save() ? "Saved on this device" : "Draft could not be saved";
  if (immediate) refreshPreview();
  else schedulePreview();
}
function renderBlockStage() {
  const blocks = editingPage().blocks || [];
  const zone = (index) => '<div class="drop-slot" data-slot="'+index+'" aria-hidden="true"></div>';
  $("#block-count").textContent = blocks.length+" / "+maxBlocks+" blocks";
  $("#block-stage").innerHTML = blocks.length ? zone(0)+blocks.map((block,index) => {
    const [label,glyph] = blockTypes[block.type];
    const title = block.type === "spacer" ? block.a+" px" : block.a.split("\n")[0];
    return '<div class="build-row '+(block.id === selectedBlock ? "selected" : "")+'" data-row="'+block.id+'"><button class="drag-grip" type="button" aria-label="Select '+label+'" draggable="true" data-select="'+block.id+'" data-move="'+index+'">⠿</button><button type="button" class="row-title" data-select="'+block.id+'" aria-pressed="'+(block.id === selectedBlock)+'"><span class="block-glyph" aria-hidden="true">'+glyph+'</span><span><strong>'+label+'</strong>'+(title ? '<small>'+esc(title)+'</small>' : '')+'</span></button></div>'+zone(index+1);
  }).join("") : '<div class="empty block-empty" data-slot="0">Drop your first block here.</div>';
  renderBlockInspector();
}
function renderBlockInspector() {
  const blocks = editingPage().blocks || [];
  const index = blocks.findIndex((block) => block.id === selectedBlock);
  if (index < 0) { $("#block-inspector").innerHTML = ""; return; }
  const block = blocks[index];
  const label = blockTypes[block.type][0];
  $("#block-inspector").innerHTML = '<div class="inspector"><div class="stage-head"><h3>Edit '+label.toLowerCase()+'</h3><div class="block-actions"><button class="filter" data-block-action="up" '+(index === 0 ? "disabled" : "")+'>Move up</button><button class="filter" data-block-action="down" '+(index === blocks.length-1 ? "disabled" : "")+'>Move down</button><button class="filter" data-block-action="duplicate">Duplicate</button><button class="filter remove-block" data-block-action="remove">Remove</button></div></div>'+blockFields[block.type].map((name,i) => {
    const key = i === 0 ? "a" : "b";
    const multi = ["list","stats","callout","quote","text","faq","checklist","columns","form","records"].includes(block.type) && (i === 1 || !["form","records"].includes(block.type));
    return '<label class="field">'+name+(multi ? '<textarea maxlength="'+maxBlockText+'" data-property="'+key+'">'+esc(block[key])+'</textarea>' : '<input maxlength="'+maxBlockText+'" data-property="'+key+'" value="'+esc(block[key])+'">')+'</label>';
  }).join("")+(block.type === "image" ? '<button type="button" class="secondary" data-action="workspace-media">Replace image</button>' : "")+(block.type === "button" ? '<label class="field">Open page<select data-property="pageTarget">'+pageOptions(current,block.pageTarget,"Use destination URL")+'</select></label>' : "")+'</div>';
}
function handleBuilder() {
  const root = $(".builder");
  renderBlockStage();
  $("#show-template").addEventListener("change", (event) => { editingPage().hideTemplate = !event.target.checked; saveEditor(true); });
  function add(type, slot, copy) {
    editingPage().blocks ??= [];
    if (editingPage().blocks.length >= maxBlocks) { toast("This project already has "+maxBlocks+" blocks."); return; }
    const block = newBlock(type);
    if (copy) Object.assign(block,copy,{id:block.id});
    editingPage().blocks.splice(slot,0,block);
    selectedBlock = block.id;
    saveEditor(true);
    renderBlockStage();
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.tool) { add(button.dataset.tool,editingPage().blocks?.length || 0); return; }
    if (button.dataset.select) { selectedBlock = button.dataset.select; renderBlockStage(); root.querySelector('.row-title[aria-pressed="true"]')?.focus(); return; }
    const action = button.dataset.blockAction;
    if (!action) return;
    const index = editingPage().blocks.findIndex((block) => block.id === selectedBlock);
    if (index < 0) return;
    if (action === "duplicate") { add(editingPage().blocks[index].type,index+1,editingPage().blocks[index]); return; }
    if (action === "remove") {
      editingPage().blocks.splice(index,1);
      selectedBlock = editingPage().blocks[Math.min(index,editingPage().blocks.length-1)]?.id || null;
    } else moveBlock(editingPage().blocks,index,action === "up" ? index-1 : index+2);
    saveEditor(true);
    renderBlockStage();
    root.querySelector('.row-title[aria-pressed="true"]')?.focus();
  });
  root.addEventListener("input", (event) => {
    const key = event.target.dataset.property;
    if (!key) return;
    const block = editingPage().blocks.find((item) => item.id === selectedBlock);
    if (!block) return;
    block[key] = event.target.value;
    if (block.type === "image" && key === "b") {
      delete block.imageData;
      delete block.credit;
      delete block.license;
    }
    saveEditor(event.target.tagName === "SELECT");
    const row = root.querySelector(".build-row.selected .row-title > span:last-child");
    row.querySelector("small")?.remove();
    const title = block.type === "spacer" ? block.a+" px" : block.a.split("\n")[0];
    if (title) { const summary = document.createElement("small"); summary.textContent = title; row.append(summary); }
  });
  function clearDrop() {
    root.querySelector(".drop-active")?.classList.remove("drop-active");
  }
  root.addEventListener("dragstart", (event) => {
    const tool = event.target.closest("[data-tool],[data-move]");
    if (!tool) return;
    draggedBlock = {...tool.dataset};
    event.dataTransfer.setData("text/plain",tool.textContent.trim());
    event.dataTransfer.effectAllowed = tool.dataset.tool ? "copy" : "move";
    root.classList.add("dragging-block");
  });
  root.addEventListener("dragend", () => { draggedBlock = null; clearDrop(); root.classList.remove("dragging-block"); });
  function dropTarget(event) {
    const explicit = event.target.closest("[data-slot]");
    if (explicit) return explicit;
    const row = event.target.closest("[data-row]");
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return event.clientY < rect.top+rect.height/2 ? row.previousElementSibling : row.nextElementSibling;
  }
  $("#block-stage").addEventListener("dragover", (event) => {
    if (!draggedBlock) return;
    const target = dropTarget(event);
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = draggedBlock.tool ? "copy" : "move";
    clearDrop();
    target.classList.add("drop-active");
  });
  $("#block-stage").addEventListener("dragleave", (event) => { if (!event.currentTarget.contains(event.relatedTarget)) clearDrop(); });
  $("#block-stage").addEventListener("drop", (event) => {
    if (!draggedBlock) return;
    const target = dropTarget(event);
    if (!target) return;
    event.preventDefault();
    const slot = Number(target.dataset.slot);
    const {tool,move} = draggedBlock;
    draggedBlock = null;
    clearDrop();
    root.classList.remove("dragging-block");
    if (tool) add(tool,slot);
    else if (moveBlock(editingPage().blocks,Number(move),slot)) {
      selectedBlock = editingPage().blocks[Number(move) < slot ? slot-1 : slot].id;
      saveEditor(true);
      renderBlockStage();
    }
  });
}
