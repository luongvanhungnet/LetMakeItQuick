"use strict";

function aiPresets(type) {
  return type === "game3d" ? game3DTemplates : gameTemplates;
}
function demoProposal(type, prompt, editing) {
  const idea = prompt.trim().replace(/\s+/g," ");
  const colors = {purple:"#643bed",blue:"#2154a4",green:"#23664e",pink:"#a73768",orange:"#a94928",black:"#24212b",red:"#9d303f",teal:"#17675f"};
  const color = Object.entries(colors).find(([name]) => new RegExp("\\b"+name+"\\b","i").test(idea))?.[1];
  const explicitName = idea.match(/(?:name(?: it)?|call(?: it)?|rename(?: it)? to)\s*[:=]?\s*["“]([^"”]+)["”]/i)?.[1];
  const topic = idea.replace(/^(?:create|build|make)\s+(?:me\s+)?(?:an?\s+)?/i,"");
  const name = (explicitName || topic).slice(0,70);
  const fields = {};
  if (!editing || explicitName) fields.name = name;
  if (isGameType(type)) {
    const presets = aiPresets(type);
    const scenic = /forest|woodland|moss/i.test(idea), space = /space|orbit|moon/i.test(idea), ocean = /reef|ocean|underwater/i.test(idea);
    const preset = presets.find((item) => item.layout === (scenic ? "woodland" : "orbit") || item.id === (ocean ? "reef" : scenic ? "woodland" : "orbit")) || presets[0];
    const seconds = idea.match(/\b(\d{1,3})[\s-]*(?:seconds?|secs?|s)\b/i);
    const game = {};
    if (!editing || /replace|reset|new level/i.test(idea)) game.preset = ocean && type === "game" ? "reef" : preset.id;
    if (scenic || space || ocean) game.background = ocean ? "deep-reef" : scenic ? "woodland-dawn" : "moonlit-ridge";
    if (seconds) game.time = Math.min(600,Number(seconds[1]));
    else if (/untimed|no (?:time limit|timer)/i.test(idea)) game.time = 0;
    if (type === "game3d" && /tall walls|high walls/i.test(idea)) game.wallHeight = 3;
    if (editing && !Object.keys(game).length && !Object.keys(fields).length) game.tiles = [{index:22,asset:"amber-crystal"}];
    return {summary:editing ? "Proposed changes to the current level." : "Start from a playable level and customize its scene.",fields,game};
  }
  if (color) fields.color = color;
  const newTitle = idea.match(/(?:headline|title)\s*(?:to|:|=)?\s*["“]([^"”]+)["”]/i)?.[1];
  if (newTitle) fields.title = newTitle.slice(0,100);
  if (!editing) {
    fields.title = (newTitle || name).slice(0,100);
    fields.intro = (type === "app" ? "Stay organized with " : "Explore ") + name + ".";
    fields.button = type === "app" ? "Open checklist" : "Learn more";
    fields.section = type === "app" ? "Your checklist" : "What to expect";
    fields.details = type === "app" ? "Choose your first task\nSet a goal\nCheck your progress" : "Add your key details, opening hours, or services here.";
  }
  const blocks = [];
  if (/checklist|tasks/i.test(idea) && type === "web") blocks.push({type:"checklist",a:"Get started",b:"Review the details\nChoose your next step"});
  if (/faq|accordion/i.test(idea)) blocks.push({type:"faq",a:"How do I get started?",b:"Add your answer here."});
  if (/image|photo/i.test(idea)) blocks.push({type:"image",a:"Forest canopy",b:"media/forest.jpg"});
  if (editing && !blocks.length && !Object.keys(fields).length) blocks.push({type:"callout",a:"Project update",b:idea.slice(0,maxBlockText)});
  return {summary:editing ? "Proposed copy and block changes." : "Create a starter draft you can customize in the editor.",fields,blocks};
}

function projectFromProposal(type, plan, original) {
  if (!plan || typeof plan !== "object") throw Error("There’s no proposal to apply.");
  const draft = original ? structuredClone(original) : {...blank(type),template:"blank",id:crypto.randomUUID()};
  const changes = [];
  for (const [field,label,max] of fields) {
    const value = plan.fields?.[field];
    if (typeof value !== "string" || !value.trim() || value.length > max || value === draft[field]) continue;
    if (field === "color" && !/^#[0-9a-f]{6}$/i.test(value)) continue;
    if ((isGameType(type) || type === "video") && field !== "name") continue;
    draft[field] = value;
    changes.push(label+" · "+value.split("\n").join(" / ").slice(0,125));
  }
  if (isGameType(type)) {
    const proposal = plan.game || {};
    const preset = aiPresets(type).find((entry) => entry.id === proposal.preset);
    if (preset || !draft.game) {
      draft.game = setupGame(preset || blank(type));
      changes.push(preset ? "Level preset · "+preset.name : "Blank level");
    }
    const game = draft.game;
    if (assetById.get(proposal.background)?.role === "background" && proposal.background !== game.background) {
      game.background = proposal.background;
      changes.push("Background · "+assetById.get(game.background).name);
    }
    if (Number.isInteger(proposal.time) && proposal.time >= 0 && proposal.time <= 600 && proposal.time !== game.time) {
      game.time = proposal.time;
      changes.push(game.time ? "Timer · "+game.time+" seconds" : "Timer removed");
    }
    if (type === "game3d" && [1,2,3].includes(proposal.wallHeight) && proposal.wallHeight !== game.wallHeight) {
      game.wallHeight = proposal.wallHeight;
      changes.push("Wall height · "+["Low","Medium","Tall"][game.wallHeight-1]);
    }
    if (Array.isArray(proposal.tiles)) {
      const updated = {...game.cells};
      for (const tile of proposal.tiles.slice(0,64)) {
        if (!Number.isInteger(tile?.index) || tile.index < 0 || tile.index >= gameWidth*gameHeight) continue;
        if (tile.asset === "") { delete updated[tile.index]; continue; }
        const asset = assetById.get(tile.asset);
        if (!asset || asset.role === "background") continue;
        if (asset.role === "player") {
          for (const [slot,id] of Object.entries(updated)) if (assetById.get(id).role === "player") delete updated[slot];
        }
        updated[tile.index] = tile.asset;
      }
      const roles = Object.values(updated).map((id) => assetById.get(id).role);
      if (roles.includes("player") && roles.includes("exit") && JSON.stringify(updated) !== JSON.stringify(game.cells)) {
        game.cells = updated;
        changes.push("Level tiles updated");
      }
    }
  } else if (type === "video") {
    editVideoProposal(draft,plan.video,changes);
  } else {
    if (Array.isArray(plan.blockEdits)) {
      const targets = (draft.blocks || []).slice();
      for (const edit of plan.blockEdits.slice(0,8)) {
        const block = Number.isInteger(edit?.index) ? targets[edit.index] : null;
        const index = block ? draft.blocks.indexOf(block) : -1;
        if (index < 0) continue;
        const label = blockTypes[block.type][0];
        if (edit.action === "remove") {
          draft.blocks.splice(index,1);
          changes.push("Removed "+label.toLowerCase());
        } else if (edit.action === "move" && Number.isInteger(edit.to) && edit.to >= 0 && edit.to < draft.blocks.length) {
          if (moveBlock(draft.blocks,index,edit.to+(edit.to>index?1:0))) changes.push("Moved "+label.toLowerCase()+" to position "+(edit.to+1));
        } else if (edit.action === "update") {
          const a = typeof edit.a === "string" ? edit.a.slice(0,maxBlockText) : block.a;
          const b = typeof edit.b === "string" ? edit.b.slice(0,maxBlockText) : block.b;
          if (a === block.a && b === block.b) continue;
          if (["image","video","audio","button"].includes(block.type) && !blockURL(b,block.type === "image")) continue;
          Object.assign(block,{a,b});
          changes.push("Updated "+label.toLowerCase()+(a ? " · "+a.slice(0,95) : ""));
        }
      }
    }
    if (Array.isArray(plan.blocks)) {
      draft.blocks ??= [];
      for (const block of plan.blocks.slice(0,8)) {
        if (!block || !Object.hasOwn(blockTypes,block.type) || draft.blocks.length >= maxBlocks) continue;
        const item = newBlock(block.type);
        if (typeof block.a === "string") item.a = block.a.slice(0,maxBlockText);
        if (typeof block.b === "string") item.b = block.b.slice(0,maxBlockText);
        if (["image","video","audio","button"].includes(item.type) && !blockURL(item.b,item.type === "image")) continue;
        draft.blocks.push(item);
        changes.push("Added "+blockTypes[item.type][0].toLowerCase());
      }
    }
  }
  return {draft,changes};
}

function openAI(original) {
  openDialog(original ? "Edit with AI" : "Create with AI", '<form id="ai-form">'+
    (original ? '<p class="subtext">Editing '+esc(original.name)+'. Review the proposal before applying it.</p>' : '<label class="field">Project type<select name="type">'+["web","app","game","game3d"].map((type) => '<option value="'+type+'">'+typeLabel(type)+'</option>').join("")+'</select></label>')+
    '<label class="field">Mode<select name="mode"><option value="demo">Demo · no API key</option><option value="gpt" disabled>GPT · checking connection…</option></select></label><p class="subtext" id="ai-connection"></p>'+
    '<label class="field">Describe what you want<textarea name="prompt" required maxlength="1700" placeholder="'+(original ? 'Use a green accent and add an FAQ' : 'A website for my pottery studio with an FAQ')+'"></textarea></label>'+
    '<div class="dialog-actions"><button class="primary" type="submit">Generate proposal</button></div></form><p class="subtext" id="ai-status" role="status"></p><div id="ai-result"></div>');
  const form = $("#ai-form"), status = $("#ai-status"), result = $("#ai-result");
  const mode = form.elements.mode, option = mode.options[1], connection = $("#ai-connection");
  fetch("/api/ai",{cache:"no-store"}).then((response) => {
    if (!response.ok) throw Error();
    return response.json();
  }).then((state) => {
    option.disabled = !state.gptAvailable;
    option.textContent = state.gptAvailable ? "GPT · "+state.model : "GPT · API key required";
    connection.textContent = state.gptAvailable ? "GPT sends your prompt and project content to OpenAI." : "Demo uses built-in rules. GPT needs a server-side OpenAI API key.";
  }).catch(() => { option.textContent = "GPT · connection unavailable"; connection.textContent = "Demo is available without a connection."; });
  let pending = false;
  form.addEventListener("submit",async (event) => {
    event.preventDefault();
    if (pending) return;
    const type = original?.type || form.elements.type.value;
    const prompt = form.elements.prompt.value.trim();
    if (!prompt) { status.textContent = "Enter a prompt first."; return; }
    result.replaceChildren();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    pending = true;
    status.textContent = "Generating proposal…";
    try {
      let plan;
      if (mode.value === "demo") plan = demoProposal(type,prompt,!!original);
      else {
        const project = original ? {
          fields:Object.fromEntries(fields.map(([field]) => [field,original[field]])),
          blocks:original.blocks?.map(({type,a,b}) => ({type,a:a.slice(0,250),b:b.slice(0,250)})),
          game:original.game
        } : null;
        const response = await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          type,prompt,project,assets:mediaLibrary.map(({id,role,path}) => ({id,role,path})),
          presets:isGameType(type) ? aiPresets(type).map(({id,name}) => ({id,name})) : [],
          blockTypes:Object.keys(blockTypes)
        })});
        const payload = await response.json();
        if (!response.ok) throw Error(payload.error || "GPT is unavailable.");
        plan = payload.plan;
      }
      if (!modal.open || !form.isConnected) return;
      const {draft,changes} = projectFromProposal(type,plan,original);
      status.textContent = changes.length ? "" : "No supported changes were proposed. Try a more specific request.";
      if (!changes.length) return;
      const summary = typeof plan.summary === "string" ? plan.summary.slice(0,300) : "Proposed project changes";
      result.innerHTML = '<section class="ai-result"><h3>Review proposal</h3><p>'+esc(summary)+'</p><ul>'+changes.map((change) => '<li>'+esc(change)+'</li>').join("")+'</ul><button class="primary" id="ai-apply">'+(original ? "Apply changes" : "Create draft")+'</button></section>';
      $("#ai-apply").addEventListener("click",() => {
        if (original) projects = projects.map((project) => project.id === original.id ? draft : project);
        else projects.unshift(draft);
        current = draft;
        save();
        phone = type === "app";
        editorMode = "blocks";
        selectedBlock = null;
        gameTool = "lilac-explorer";
        modal.close();
        go("editor");
      },{once:true});
    } catch (error) { status.textContent = error.message || "The proposal couldn’t be generated."; }
    finally { pending = false; button.disabled = false; }
  });
}

function editVideoProposal(draft, proposal, changes) {
  if (!proposal || !draft.video) return;
  const video = draft.video;
  if (Object.hasOwn(videoFormats,proposal.format) && proposal.format !== video.format) {
    video.format = proposal.format;
    changes.push("Video format · "+proposal.format);
  }
  const targets = video.scenes.slice();
  if (!Array.isArray(proposal.scenes)) return;
  for (const edit of proposal.scenes.slice(0,12)) {
    const scene = Number.isInteger(edit?.index) ? targets[edit.index] : null;
    const index = scene ? video.scenes.indexOf(scene) : -1;
    const adding = edit?.action === "add" && video.scenes.length < sceneLimit;
    if (!adding && index < 0) continue;
    if (edit.action === "remove" && video.scenes.length > 1) {
      video.scenes.splice(index,1);
      changes.push("Removed scene "+(index+1));
    } else if (edit.action === "move" && Number.isInteger(edit.to) && edit.to >= 0 && edit.to < video.scenes.length) {
      if (moveBlock(video.scenes,index,edit.to+(edit.to>index?1:0))) changes.push("Moved scene "+(index+1)+" to position "+(edit.to+1));
    } else if (edit.action === "update" || adding) {
      const patch = adding ? videoScene() : {...scene};
      for (const key of ["title","caption","asset","duration","trim","layout","transition","color"]) {
        if (Object.hasOwn(edit,key)) patch[key] = edit[key];
      }
      if (!validVideo({format:video.format,scenes:[patch]})) continue;
      if (adding) { video.scenes.push(patch); changes.push("Added scene · "+(patch.title || "Untitled")); }
      else if (JSON.stringify(scene) !== JSON.stringify(patch)) {
        Object.assign(scene,patch);
        changes.push("Updated scene "+(index+1)+" · "+(patch.title || "Untitled"));
      }
    }
  }
}

function editDemoProposal(project,prompt,history) {
  let request = prompt.trim();
  const earlierPrompt = history.filter((item) => item.role === "user").at(-1)?.text || "";
  if (/^(it|that|same)\b/i.test(request) || /^(make|change|set) (it|that)\b/i.test(request)) {
    const earlierTarget = earlierPrompt.match(/(?:scene|block)\s+\d+|headline|caption|section title|button label/i)?.[0];
    if (earlierTarget) request = request.replace(/\b(?:it|that|same)\b/i,earlierTarget);
  }
  const quote = request.match(/["“]([^"”]+)["”]/)?.[1] || request.match(/‘([^’]+)’/)?.[1];
  if (project.type === "video") {
    const index = Number(request.match(/scene\s+(\d+)/i)?.[1])-1;
    const time = Number(request.match(/\b(\d+)[\s-]*(?:seconds?|secs?)\b/i)?.[1]);
    const format = /portrait|vertical|9:16/i.test(request) ? "vertical" : /square|1:1/i.test(request) ? "square" : /landscape|horizontal|16:9/i.test(request) ? "wide" : undefined;
    const scenes = [];
    if (/add (?:a |new )?scene/i.test(request)) scenes.push({action:"add",title:quote || "New scene"});
    else if (Number.isInteger(index)) {
      if (/remove|delete/i.test(request)) scenes.push({action:"remove",index});
      else if (/move/i.test(request)) scenes.push({action:"move",index,to:Number(request.match(/(?:position|to)\s+(\d+)/i)?.[1])-1});
      else if (quote) scenes.push({action:"update",index,[/caption/i.test(request)?"caption":"title"]:quote});
      else if (Number.isInteger(time)) scenes.push({action:"update",index,duration:time});
    }
    return {summary:"Proposed timeline changes.",video:{format,scenes}};
  }
  const plan = demoProposal(project.type,request.replace(/‘([^’]+)’/g,'“$1”'),true);
  if (isGameType(project.type)) {
    if (plan.game?.tiles && !/add|place|collectible|crystal/i.test(request)) delete plan.game.tiles;
    return plan;
  }
  const target = Number(request.match(/block\s+(\d+)/i)?.[1])-1;
  if (Number.isInteger(target)) {
    plan.blocks = [];
    if (/remove|delete/i.test(request)) plan.blockEdits = [{action:"remove",index:target}];
    else if (/move/i.test(request)) plan.blockEdits = [{action:"move",index:target,to:Number(request.match(/(?:position|to)\s+(\d+)/i)?.[1])-1}];
    else if (quote) plan.blockEdits = [{action:"update",index:target,[/body|answer|caption|destination/i.test(request)?"b":"a"]:quote}];
  } else if (quote && /section title|button label|introduction/i.test(request)) {
    plan.fields[/section title/i.test(request)?"section":/button label/i.test(request)?"button":"intro"] = quote;
    plan.blocks = [];
  } else if (!/\b(add|insert|faq|checklist|image|photo)\b/i.test(request) && plan.blocks.every((block)=>block.type === "callout")) {
    plan.blocks = [];
  }
  return plan;
}

function renderAIEditor() {
  const projectId = current.id;
  const host = $("#editor-body");
  host.innerHTML = '<section class="panel ai-chat"><div class="stage-head"><div><h2>AI chat</h2><p class="subtext">Ask for changes to this project, then review the proposal.</p></div><button type="button" class="filter" data-action="editor-mode" data-id="blocks">Manual editor</button></div><div class="ai-transcript" id="ai-transcript" aria-label="Project conversation" role="log"></div><div id="chat-proposal"></div><form id="chat-form"><label class="field">Mode<select name="mode"><option value="demo">Demo · no API key</option><option value="gpt" disabled>GPT · checking connection…</option></select></label><p class="subtext" id="chat-sharing" hidden>GPT sends your message, recent conversation, and project content to OpenAI.</p><label class="field">Message<textarea name="prompt" required maxlength="1700" placeholder="Describe a change or ask a follow-up"></textarea></label><div class="dialog-actions"><button type="submit" class="primary">Send</button></div></form><p class="subtext" id="chat-status" role="status"></p></section>';
  const form = $("#chat-form"), transcript = $("#ai-transcript"), status = $("#chat-status"), result = $("#chat-proposal");
  const mode = form.elements.mode;
  mode.addEventListener("change",() => { $("#chat-sharing").hidden = mode.value !== "gpt"; });
  let pending = false;
  function append(role,text) {
    current.aiHistory = [...(current.aiHistory || []),{role,text:text.slice(0,1700)}].slice(-24);
    save();
    renderHistory();
  }
  function renderHistory() {
    const history = current.aiHistory || [];
    transcript.innerHTML = history.length ? history.map((item) => '<div class="chat-message '+(item.role === "user"?"chat-user":"chat-assistant")+'"><strong>'+(item.role === "user"?"You":"Assistant")+'</strong><p>'+esc(item.text)+'</p></div>').join("") : '<p class="subtext">Try '+(current.type === "video"?'“Make the video vertical” or “Change scene 1’s title to ‘Coming soon’.”':isGameType(current.type)?'“Set a 30-second timer” or “Use a moonlit background.”':'“Change the headline to ‘Spring collection’” or “Remove block 2.”')+'</p>';
    transcript.scrollTop = transcript.scrollHeight;
  }
  renderHistory();
  fetch("/api/ai",{cache:"no-store"}).then((response) => response.ok ? response.json() : null).then((state) => {
    mode.options[1].disabled = !state?.gptAvailable;
    mode.options[1].textContent = state?.gptAvailable ? "GPT · "+state.model : "GPT · API key required";
  }).catch(() => { mode.options[1].textContent = "GPT · connection unavailable"; });
  form.addEventListener("submit",async (event) => {
    event.preventDefault();
    if (pending) return;
    const prompt = form.elements.prompt.value.trim();
    if (!prompt) return;
    const history = (current.aiHistory || []).slice(-8);
    const original = current;
    const type = original.type;
    const send = form.querySelector('button[type="submit"]');
    result.replaceChildren();
    form.elements.prompt.value = "";
    append("user",prompt);
    pending = true;
    send.disabled = true;
    status.textContent = "Preparing a reply…";
    try {
      let plan;
      if (mode.value === "demo") plan = editDemoProposal(original,prompt,history);
      else {
        const response = await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          mode:"edit",type,prompt,history:history.map(({role,text})=>({role,text:text.slice(0,650)})),
          project:{
            fields:Object.fromEntries(fields.map(([key])=>[key,original[key]])),
            blocks:original.blocks?.map(({type,a,b},index)=>({index,type,a:a.slice(0,200),b:b.slice(0,200)})),
            game:original.game,video:original.video
          },
          assets:[...mediaLibrary,...(type === "video" ? videoClips : [])].map(({id,role,path})=>({id,role,path})),
          presets:isGameType(type) ? aiPresets(type).map(({id,name})=>({id,name})) : [],
          blockTypes:Object.keys(blockTypes)
        })});
        const payload = await response.json();
        if (!response.ok) throw Error(payload.error || "GPT is unavailable.");
        plan = payload.plan;
      }
      if (!form.isConnected || current.id !== projectId) return;
      const {draft,changes} = projectFromProposal(type,plan,original);
      const reply = typeof plan.reply === "string" ? plan.reply : changes.length ? (typeof plan.summary === "string" ? plan.summary : "I proposed the changes below.") : "I couldn’t identify a supported edit. Try naming the field, block, or scene you want to change.";
      append("assistant",reply);
      status.textContent = "";
      if (!changes.length) return;
      result.innerHTML = '<section class="ai-result"><h3>Review changes</h3><ul>'+changes.map(change=>'<li>'+esc(change)+'</li>').join("")+'</ul><div class="dialog-actions"><button type="button" class="primary" data-apply>Apply changes</button><button type="button" class="secondary" data-dismiss>Dismiss</button></div></section>';
      result.querySelector("[data-apply]").addEventListener("click",() => {
        const projectIndex = projects.findIndex(project=>project.id === projectId);
        if (projectIndex < 0) return;
        draft.aiHistory = current.aiHistory;
        current = projects[projectIndex] = draft;
        $(".project-heading h1").textContent = current.name || "Untitled project";
        selectedScene = 0;
        result.replaceChildren();
        append("assistant","Applied to the project.");
        refreshPreview();
      },{once:true});
      result.querySelector("[data-dismiss]").addEventListener("click",() => { result.replaceChildren(); append("assistant","Proposal dismissed."); },{once:true});
    } catch (error) {
      if (form.isConnected && current.id === projectId) { append("assistant",error.message || "Could not prepare an edit."); status.textContent = ""; }
    } finally { pending = false; send.disabled = false; }
  });
}
