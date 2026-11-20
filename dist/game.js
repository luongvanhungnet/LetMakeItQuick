"use strict";

const gameWidth = 16, gameHeight = 10;
const gameTemplates = [
  {id:"woodland", type:"game",name:"Woodland Relic",title:"Woodland Relic",desc:"Collect crystals and find the gate in a forest maze.",category:"Maze",color:"#426e57",background:"woodland-dawn",hero:"moss-ranger",gem:"emerald-crystal",wall:"woodland-wall",exit:"woodland-gate",enemy:"fern-gremlin",trap:"bramble-trap",decor:"pine-tree",time:0},
  {id:"orbit",type:"game",name:"Orbit Salvage",title:"Orbit Salvage",desc:"Dodge patrolling creatures and recover lunar tokens.",category:"Arcade",color:"#6b53da",background:"moonlit-ridge",hero:"orbit-robot",gem:"silver-token",wall:"night-wall",exit:"night-gate",enemy:"plum-gremlin",trap:"static-trap",decor:"twilight-tree",time:75},
  {id:"reef",type:"game",name:"Reef Run",title:"Reef Run",desc:"Gather pearls and reach the coral gate before time runs out.",category:"Timed",color:"#1888a0",background:"deep-reef",hero:"reef-diver",gem:"pearl-crystal",wall:"coral-wall",exit:"coral-gate",enemy:"lagoon-gremlin",trap:"icicles-trap",decor:"blossom-tree",time:50}
];
function setupGame(t) {
  const cells = {};
  const put = (asset,x,y) => { if (asset) cells[x+y*gameWidth] = asset; };
  put(t.hero || "lilac-explorer",1,1);
  put(t.exit || "basalt-gate",14,8);
  if (t.id !== "blank") {
    for (let x=3;x<13;x++) {
      if (x !== (t.id === "reef" ? 5 : 9) && t.id !== "orbit") put(t.wall,x,3);
      if (x !== (t.id === "reef" ? 11 : 6)) put(t.wall,x,6);
    }
    if (t.id === "orbit") {
      for (const x of [4,11]) {
        for (const y of [2,3,4]) put(t.wall,x,y);
      }
    }
    [[4,2],[13,2],[2,7],[10,8]].forEach(([x,y]) => put(t.gem,x,y));
    put(t.enemy,7,5); put(t.trap,10,4); put(t.trap,11,4);
    put(t.decor,1,8); put(t.decor,14,1);
  }
  return {background:t.background || "violet-twilight",time:t.time || 0,cells};
}
function validGame(game) {
  return !!game && assetById.get(game.background)?.role === "background" &&
    Number.isInteger(game.time) && game.time >= 0 && game.time <= 600 &&
    !!game.cells && typeof game.cells === "object" && !Array.isArray(game.cells) &&
    Object.entries(game.cells).every(([index,id]) => /^(0|[1-9]\d{0,2})$/.test(index) &&
      Number(index) < gameWidth*gameHeight && assetById.has(id) && assetById.get(id).role !== "background");
}

let gameTool = "lilac-explorer";
function gameEditor() {
  const game = current.game;
  const background = assetById.get(game.background);
  const palette = mediaLibrary.filter((asset) => asset.role !== "background");
  $("#editor-body").innerHTML = '<div class="game-builder"><section class="panel game-palette"><h2>Scene assets</h2><p class="subtext">Drag an asset onto the grid or select it and pick a tile.</p><div class="game-options"><label class="field">Background<select id="game-background">'+mediaLibrary.filter((asset) => asset.role === "background").map((asset) => '<option value="'+asset.id+'" '+(asset.id === background.id ? "selected" : "")+'>'+asset.name+'</option>').join("")+'</select></label><button class="filter" id="game-erase" aria-pressed="false">Eraser</button></div><label class="search">'+icon("search")+'<input id="sprite-search" placeholder="Search scene assets…" type="search" aria-label="Search scene assets"></label><div class="sprite-library" id="sprite-library"></div></section><section class="panel game-stage"><div class="stage-head"><div><h2>Level layout</h2><p class="subtext" id="game-status"></p></div><button class="secondary" data-action="editor-mode" data-id="preview">Playtest</button></div><div class="game-grid" id="game-grid" aria-label="Level grid"></div><p class="subtext">Players collect every item, avoid traps and creatures, then reach a gate.</p><label class="field time-field">Time limit in seconds (0 for no limit)<input id="game-time" type="number" min="0" max="600" value="'+game.time+'"></label></section></div>';
  const grid = $("#game-grid");
  grid.style.backgroundImage = 'url("'+background.path+'")';
  const erase = $("#game-erase");
  const list = $("#sprite-library");
  const search = $("#sprite-search");
  function renderPalette() {
    const query = search.value.trim().toLowerCase();
    list.innerHTML = palette.filter((asset) => (asset.name+" "+asset.category).toLowerCase().includes(query)).map((asset) => '<button type="button" draggable="true" class="sprite-tool" data-sprite="'+asset.id+'" aria-pressed="'+(asset.id === gameTool)+'" title="'+asset.category+'"><img src="'+asset.path+'" alt="" loading="lazy"><span>'+asset.name+'</span></button>').join("") || '<p class="subtext">No matching assets.</p>';
    erase.setAttribute("aria-pressed",String(gameTool === "erase"));
  }
  function paint(index) {
    if (gameTool === "erase") delete game.cells[index];
    else {
      if (assetById.get(gameTool).role === "player") {
        for (const [slot,id] of Object.entries(game.cells)) {
          if (assetById.get(id).role === "player") delete game.cells[slot];
        }
      }
      game.cells[index] = gameTool;
    }
    saveEditor();
    renderGrid();
  }
  function renderGrid() {
    const tiles = [];
    for (let index=0;index<gameWidth*gameHeight;index++) {
      const asset = assetById.get(game.cells[index]);
      tiles.push('<button type="button" class="game-cell" data-cell="'+index+'" tabindex="'+(index === focusedCell ? 0 : -1)+'" aria-label="Row '+(Math.floor(index/gameWidth)+1)+', column '+(index%gameWidth+1)+', '+(asset?.name || 'empty')+'">'+(asset ? '<img src="'+asset.path+'" alt="" draggable="false">' : '')+'</button>');
    }
    grid.innerHTML = tiles.join("");
    const roles = Object.values(game.cells).map((id) => assetById.get(id).role);
    $("#game-status").textContent = roles.includes("player") && roles.includes("exit")
      ? roles.filter((role) => role === "gem").length+" collectibles"
      : "Place a player and a gate to play.";
  }
  let focusedCell = 0;
  renderGrid();
  renderPalette();
  list.addEventListener("dragstart",(event) => {
    const tool = event.target.closest("[data-sprite]");
    if (!tool) return;
    event.dataTransfer.setData("application/x-launchpad-sprite",tool.dataset.sprite);
    event.dataTransfer.effectAllowed = "copy";
  });
  list.addEventListener("click",(event) => {
    const button = event.target.closest("[data-sprite]");
    if (button) {
      gameTool = button.dataset.sprite;
      list.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed","false");
      button.setAttribute("aria-pressed","true");
      erase.setAttribute("aria-pressed","false");
    }
  });
  erase.addEventListener("click",() => { gameTool = "erase"; list.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed","false"); erase.setAttribute("aria-pressed","true"); });
  search.addEventListener("input",renderPalette);
  grid.addEventListener("click",(event) => {
    const cell = event.target.closest("[data-cell]");
    if (!cell) return;
    focusedCell = Number(cell.dataset.cell);
    paint(focusedCell);
    grid.children[focusedCell].focus();
  });
  grid.addEventListener("keydown",(event) => {
    if (!Object.hasOwn(gameDirections,event.key)) return;
    event.preventDefault();
    const [dx,dy] = gameDirections[event.key];
    const x = focusedCell%gameWidth, y = Math.floor(focusedCell/gameWidth);
    const nextX = Math.max(0,Math.min(gameWidth-1,x+dx)), nextY = Math.max(0,Math.min(gameHeight-1,y+dy));
    grid.children[focusedCell].tabIndex = -1;
    focusedCell = nextX+nextY*gameWidth;
    grid.children[focusedCell].tabIndex = 0;
    grid.children[focusedCell].focus();
  });
  grid.addEventListener("dragover",(event) => {
    if (Array.from(event.dataTransfer.types).includes("application/x-launchpad-sprite") && event.target.closest("[data-cell]")) event.preventDefault();
  });
  grid.addEventListener("drop",(event) => {
    const cell = event.target.closest("[data-cell]");
    const id = event.dataTransfer.getData("application/x-launchpad-sprite");
    if (!cell || !assetById.has(id) || assetById.get(id).role === "background") return;
    event.preventDefault();
    gameTool = id;
    paint(Number(cell.dataset.cell));
    renderPalette();
  });
  $("#game-background").addEventListener("change",(event) => {
    game.background = event.target.value;
    grid.style.backgroundImage = 'url("'+assetById.get(game.background).path+'")';
    saveEditor();
  });
  $("#game-time").addEventListener("change",(event) => {
    game.time = blockNumber(event.target.value,0,600);
    event.target.value = game.time;
    saveEditor();
  });
}

const gameDirections = {ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]};
function gameStep(state, dx, dy) {
  if (state.result) return;
  const x = state.player.index % state.width + dx, y = Math.floor(state.player.index / state.width) + dy;
  if (x < 0 || x >= state.width || y < 0 || y >= state.height) return;
  const target = x + y * state.width;
  if (state.tiles[target]?.role === "wall") return;
  state.player.index = target;
  const tile = state.tiles[target];
  if (tile?.role === "gem") { delete state.tiles[target]; state.remaining--; }
  if (tile?.role === "hazard" || state.enemies.some((enemy) => enemy.index === target)) { state.result = "You hit an obstacle."; return; }
  if (tile?.role === "exit" && state.remaining === 0) { state.result = "Level complete!"; return; }
  for (const enemy of state.enemies) {
    const column = enemy.index % state.width + enemy.direction;
    const next = enemy.index + enemy.direction;
    if (column < 0 || column >= state.width || ["wall","hazard","exit"].includes(state.tiles[next]?.role)) enemy.direction *= -1;
    else enemy.index = next;
    if (enemy.index === target) state.result = "A creature caught you.";
  }
}
function playGame(config, step, directions) {
  const context = document.querySelector("canvas").getContext("2d");
  context.imageSmoothingEnabled = false;
  const cell = 40, images = {};
  for (const [id,url] of Object.entries(config.images)) {
    const image = new Image();
    image.onload = () => draw();
    image.src = url;
    images[id] = image;
  }
  const status = document.querySelector("#play-status");
  const score = document.querySelector("#play-score");
  let state, timer, deadline;
  function draw() {
    context.clearRect(0,0,640,400);
    const background = images[config.background];
    if (background?.complete && background.naturalWidth) context.drawImage(background,0,0,640,400);
    context.fillStyle = "rgba(19,11,39,.28)";
    context.fillRect(0,0,640,400);
    function sprite(actor) {
      const image = images[actor.id];
      const x = actor.index%config.width*cell, y = Math.floor(actor.index/config.width)*cell;
      if (image?.complete && image.naturalWidth) context.drawImage(image,x,y,cell,cell);
    }
    Object.values(state.tiles).forEach(sprite);
    state.enemies.forEach(sprite);
    if (state.player) sprite(state.player);
    score.textContent = (state.total-state.remaining)+" / "+state.total+" collected"+(config.time ? " · "+Math.max(0,Math.ceil((deadline-performance.now())/1000))+"s" : "");
    status.textContent = state.result || "";
  }
  function restart() {
    clearInterval(timer);
    state = {width:config.width,height:config.height,tiles:{},enemies:[],player:null,remaining:0,total:0,result:""};
    for (const [index,id] of Object.entries(config.cells)) {
      const actor = {index:Number(index),id,role:config.roles[id]};
      if (actor.role === "player") state.player = actor;
      else if (actor.role === "enemy") state.enemies.push({...actor,direction:1});
      else { state.tiles[index] = actor; if (actor.role === "gem") state.remaining++; }
    }
    state.total = state.remaining;
    deadline = performance.now()+config.time*1000;
    if (!state.player || !Object.values(state.tiles).some((actor) => actor.role === "exit")) state.result = "This level needs a player and a gate.";
    if (config.time && !state.result) timer = setInterval(() => {
      if (performance.now() >= deadline) { state.result = "Time’s up."; clearInterval(timer); }
      draw();
    },200);
    draw();
  }
  function move(key) {
    if (!state.player || !Object.hasOwn(directions,key)) return;
    step(state,...directions[key]);
    if (state.result) clearInterval(timer);
    draw();
  }
  document.addEventListener("keydown",(event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!Object.hasOwn(directions,key)) return;
    event.preventDefault();
    move(key);
  });
  document.querySelectorAll("[data-key]").forEach((button) => button.addEventListener("click",() => move(button.dataset.key)));
  document.querySelector("#restart").addEventListener("click",restart);
  restart();
}
function gameHTML(project, embedded = {}) {
  const {background,cells,time} = project.game;
  const images = Object.create(null), roles = Object.create(null);
  for (const id of new Set([background,...Object.values(cells)])) {
    const asset = assetById.get(id);
    images[id] = embedded[asset.path] || new URL(asset.path,location.href).href;
    roles[id] = asset.role;
  }
  const config = JSON.stringify({background,cells,time,images,roles,width:gameWidth,height:gameHeight}).replaceAll("<","\\u003c");
  const title = esc(project.name);
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>'+
    'body{margin:0;background:#161025;color:#f4ecff;font:15px system-ui,sans-serif}main{max-width:900px;margin:auto;padding:14px}header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}h1{font-size:clamp(20px,4vw,34px);margin:0;overflow-wrap:anywhere}canvas{display:block;width:100%;height:auto;border:1px solid #6c528c;border-radius:10px;background:#281b45;image-rendering:pixelated;box-sizing:border-box}.hud{min-height:25px;padding:6px 0;color:#e3cef8}.controls{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}button{min-height:40px;border:1px solid #785cad;border-radius:7px;background:#33234f;color:#fff;padding:7px 12px;font:inherit;cursor:pointer}button:hover{background:#503475}</style>'+
    '<main><header><h1>'+title+'</h1><strong id="play-score"></strong></header><canvas width="640" height="400" tabindex="0" aria-label="Game board"></canvas><div class="hud" id="play-status" role="status"></div><div class="controls" aria-label="Game controls"><button data-key="ArrowLeft">Left</button><button data-key="ArrowUp">Up</button><button data-key="ArrowDown">Down</button><button data-key="ArrowRight">Right</button><button id="restart">Restart</button></div><p>Move with the arrow keys, WASD, or the on-screen controls.</p></main><script>('+playGame.toString()+')('+config+',('+gameStep.toString()+'),'+JSON.stringify(gameDirections)+');</script></html>';
}
