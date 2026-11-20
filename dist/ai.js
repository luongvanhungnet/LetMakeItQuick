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
    const seconds = idea.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i);
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
    if (isGameType(type) && field !== "name") continue;
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
  } else if (Array.isArray(plan.blocks)) {
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
