"use strict";

const game3DTemplates = [
  {...gameTemplates[1],id:"orbit-3d",layout:"orbit",type:"game3d",name:"Orbital Vault",title:"Orbital Vault",desc:"Explore a first-person vault and recover lunar tokens.",category:"3D arcade"},
  {...gameTemplates[0],id:"woodland-3d",layout:"woodland",type:"game3d",name:"Canopy Keep",title:"Canopy Keep",desc:"Walk through a 3D maze with walls, crystals, and patrolling creatures.",category:"3D maze"}
];
const isGameType = (type) => type === "game" || type === "game3d";

function createWorld3D(config) {
  const world = {width:config.width,height:config.height,tiles:new Map(),enemies:[],remaining:0,total:0,result:"",x:1.5,z:1.5};
  let spawn = false, gate = false;
  for (const [index,id] of Object.entries(config.cells)) {
    const i = Number(index), role = config.roles[id];
    const entity = {id,role,x:i%config.width+.5,z:Math.floor(i/config.width)+.5};
    if (role === "player") { world.x = entity.x; world.z = entity.z; spawn = true; }
    else if (role === "enemy") world.enemies.push({...entity,direction:1});
    else {
      world.tiles.set(i,entity);
      if (role === "gem") world.remaining++;
      if (role === "exit") gate = true;
    }
  }
  world.total = world.remaining;
  if (!spawn || !gate) world.result = "Place a player and a gate to play.";
  return world;
}

function stepWorld3D(world,dx,dz,dt) {
  if (world.result || ![dx,dz,dt].every(Number.isFinite)) return;
  const steps = Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz),Math.abs(dt)*.8)/.1));
  function walkable(x,z,radius) {
    if (x-radius < 0 || z-radius < 0 || x+radius >= world.width || z+radius >= world.height) return false;
    for (const ox of [-radius,radius]) for (const oz of [-radius,radius]) {
      if (world.tiles.get(Math.floor(x+ox)+Math.floor(z+oz)*world.width)?.role === "wall") return false;
    }
    return true;
  }
  for (let i=0;i<steps && !world.result;i++) move(dx/steps,dz/steps,dt/steps);
  function move(dx,dz,dt) {
    if (walkable(world.x+dx,world.z,.22)) world.x += dx;
    if (walkable(world.x,world.z+dz,.22)) world.z += dz;
    const index = Math.floor(world.x)+Math.floor(world.z)*world.width;
    const tile = world.tiles.get(index);
    if (tile && Math.hypot(world.x-tile.x,world.z-tile.z) < .43) {
      if (tile.role === "gem") { world.tiles.delete(index); world.remaining--; }
      if (tile.role === "hazard") { world.result = "You hit a trap."; return; }
      if (tile.role === "exit" && world.remaining === 0) { world.result = "Level complete!"; return; }
    }
    for (const enemy of world.enemies) {
      const next = enemy.x + enemy.direction*dt*.8;
      if (walkable(next,enemy.z,.27)) enemy.x = next;
      else enemy.direction *= -1;
      if (Math.hypot(world.x-enemy.x,world.z-enemy.z) < .44) world.result = "A creature caught you.";
    }
  }
}

function playWorld3D(root,config,createWorld,stepWorld) {
  const canvas = root.querySelector("canvas");
  const status = root.querySelector("#play-status"), score = root.querySelector("#play-score");
  let gl;
  try { gl = canvas.getContext("webgl",{alpha:false,antialias:false,depth:true,desynchronized:true}); } catch {}
  const idle = () => {};
  if (!gl) { status.textContent = "This game needs WebGL. Enable hardware acceleration or try a WebGL-capable browser."; return idle; }
  function shader(kind,source) {
    const compiled = gl.createShader(kind);
    gl.shaderSource(compiled,source);
    gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled,gl.COMPILE_STATUS)) { gl.deleteShader(compiled); return null; }
    return compiled;
  }
  const vertex = shader(gl.VERTEX_SHADER,`
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform vec3 uEye;
    uniform vec2 uYaw;
    uniform vec2 uPitch;
    uniform float uAspect;
    varying mediump vec3 vColor;
    varying mediump float vDepth;
    void main() {
      vec3 delta = aPosition - uEye;
      float x = delta.x*uYaw.x - delta.z*uYaw.y;
      float flatZ = delta.x*uYaw.y + delta.z*uYaw.x;
      float y = delta.y*uPitch.x - flatZ*uPitch.y;
      float depth = delta.y*uPitch.y + flatZ*uPitch.x;
      gl_Position = vec4(x*1.44/uAspect,y*1.44,depth*1.003-.12,depth);
      vColor = aColor;
      vDepth = depth;
    }`);
  const fragment = shader(gl.FRAGMENT_SHADER,`
    precision mediump float;
    varying mediump vec3 vColor;
    varying mediump float vDepth;
    uniform vec3 uFog;
    void main() {
      float haze = smoothstep(4.0, 24.0, vDepth);
      gl_FragColor = vec4(mix(vColor,uFog,haze*.76),1.0);
    }`);
  const program = gl.createProgram();
  if (vertex && fragment) {
    gl.attachShader(program,vertex);
    gl.attachShader(program,fragment);
    gl.linkProgram(program);
  }
  if (vertex) gl.deleteShader(vertex);
  if (fragment) gl.deleteShader(fragment);
  if (!vertex || !fragment || !gl.getProgramParameter(program,gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    status.textContent = "The 3D renderer could not start on this device.";
    return idle;
  }
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  const position = gl.getAttribLocation(program,"aPosition");
  const color = gl.getAttribLocation(program,"aColor");
  gl.enableVertexAttribArray(position);
  gl.enableVertexAttribArray(color);
  const uniforms = Object.fromEntries(["Eye","Yaw","Pitch","Aspect","Fog"].map(name=>[name,gl.getUniformLocation(program,"u"+name)]));
  const staticBuffer = gl.createBuffer(), actorBuffer = gl.createBuffer();
  const controls = new AbortController();
  const signal = controls.signal;
  const keys = new Set();
  let world, yaw, pitch, deadline, started, frame, frameDelay, previous, nextFrameAt;
  let dragging = null, active = true, disposed = false;
  let staticCount = 0, viewWidth = 0, viewHeight = 0;
  let actorVertices = new Float32Array(0);
  let adaptiveScale = 1, measuredTime = 0, measuredFrames = 0, stableWindows = 0;
  const targetInterval = 1000/60;
  const actorMesh = [];
  const observer = new ResizeObserver(([entry]) => {
    viewWidth = entry.contentRect.width;
    viewHeight = entry.contentRect.height;
  });
  observer.observe(canvas);
  const colors = new Map();
  const fog = /woodland|moss/.test(config.background) ? [.16,.28,.23] : /reef|glacier/.test(config.background) ? [.12,.23,.38] : [.17,.13,.32];

  gl.clearColor(...fog,1);
  gl.uniform3f(uniforms.Fog,...fog);
  gl.uniform1f(uniforms.Aspect,canvas.width/canvas.height);

  function triangle(mesh,a,b,c,paint,light=1) {
    const [red,green,blue] = paint;
    const r = red*light, g = green*light, bl = blue*light;
    mesh.push(a[0],a[1],a[2],r,g,bl,b[0],b[1],b[2],r,g,bl,c[0],c[1],c[2],r,g,bl);
  }
  function quad(mesh,a,b,c,d,paint,light) {
    triangle(mesh,a,b,c,paint,light);
    triangle(mesh,a,c,d,paint,light);
  }
  function box(mesh,x,y,z,w,h,d,paint) {
    const a=[x,y,z], b=[x+w,y,z], c=[x+w,y,z+d], e=[x,y,z+d];
    const p=[x,y+h,z], q=[x+w,y+h,z], r=[x+w,y+h,z+d], s=[x,y+h,z+d];
    quad(mesh,a,b,q,p,paint,.74);
    quad(mesh,b,c,r,q,paint,.89);
    quad(mesh,c,e,s,r,paint,.64);
    quad(mesh,e,a,p,s,paint,.83);
    quad(mesh,p,q,r,s,paint,1);
  }
  function crystal(mesh,x,y,z,r,h,angle,paint) {
    const top=[x,y+h,z], base=[x,y-h*.75,z];
    const ring = Array.from({length:4},(_,i)=>[x+Math.cos(angle+i*Math.PI/2)*r,y,z+Math.sin(angle+i*Math.PI/2)*r]);
    for (let i=0;i<4;i++) {
      triangle(mesh,top,ring[i],ring[(i+1)%4],paint,.64+i*.12);
      triangle(mesh,base,ring[(i+1)%4],ring[i],paint,.52+i*.1);
    }
  }
  function material(id) {
    if (!colors.has(id)) {
      const value = Array.from(id).reduce((sum,char)=>((sum*31)+char.charCodeAt(0))>>>0,17);
      colors.set(id,[0,8,16].map(shift=>.38+((value>>>shift)&63)/145));
    }
    return colors.get(id);
  }
  function staticGeometry() {
    const mesh = [];
    for (let z=0;z<world.height;z++) for (let x=0;x<world.width;x++) {
      const floor = (x+z)%2 ? [.26,.24,.34] : [.31,.29,.42];
      quad(mesh,[x,0,z],[x+1,0,z],[x+1,0,z+1],[x,0,z+1],floor,1);
    }
    const edge = [.31,.31,.48];
    box(mesh,-.12,0,-.12,world.width+.24,.6,.12,edge);
    box(mesh,-.12,0,world.height,world.width+.24,.6,.12,edge);
    box(mesh,-.12,0,0,.12,.6,world.height,edge);
    box(mesh,world.width,0,0,.12,.6,world.height,edge);
    for (const item of world.tiles.values()) {
      const {x,z,role,id} = item;
      const paint = material(id);
      if (role === "wall") {
        const h = 1.65+.55*(config.wallHeight-1);
        box(mesh,x-.5,0,z-.5,1,h,1,paint);
        box(mesh,x-.498,h-.14,z-.498,.996,.16,.996,paint.map(v=>v*.77));
      } else if (role === "exit") {
        const portal = [.15,.86,.66];
        box(mesh,x-.4,0,z-.10,.12,2,.20,portal);
        box(mesh,x+.28,0,z-.10,.12,2,.20,portal);
        box(mesh,x-.4,1.86,z-.10,.8,.14,.20,portal);
      } else if (role === "hazard") {
        box(mesh,x-.35,0,z-.35,.7,.09,.7,[.62,.14,.12]);
        for (const dx of [-.22,0,.22]) crystal(mesh,x+dx,.22,z,.12,.21,0,[1,.37,.22]);
      } else if (role === "decor") {
        box(mesh,x-.08,0,z-.08,.16,.75,.16,[.44,.26,.16]);
        crystal(mesh,x,.94,z,.37,.58,0,paint);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
    staticCount = mesh.length/6;
  }
  function renderBuffer(buffer,count) {
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);
    gl.vertexAttribPointer(color,3,gl.FLOAT,false,24,12);
    gl.drawArrays(gl.TRIANGLES,0,count);
  }
  function render(now) {
    if (!viewWidth || !viewHeight) return;
    const density = adaptiveScale*Math.min(2,window.devicePixelRatio || 1,1600/viewWidth,1000/viewHeight);
    const width = Math.max(1,Math.round(viewWidth*density));
    const height = Math.max(1,Math.round(viewHeight*density));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0,0,width,height);
      gl.uniform1f(uniforms.Aspect,width/height);
    }
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform3f(uniforms.Eye,world.x,1.25,world.z);
    gl.uniform2f(uniforms.Yaw,Math.cos(yaw),Math.sin(yaw));
    gl.uniform2f(uniforms.Pitch,Math.cos(pitch),Math.sin(pitch));
    renderBuffer(staticBuffer,staticCount);
    const mesh = actorMesh;
    mesh.length = 0;
    for (const item of world.tiles.values()) if (item.role === "gem") {
      crystal(mesh,item.x,.59+Math.sin(now*.003+item.x)*.09,item.z,.22,.31,now*.002,material(item.id));
    }
    for (const enemy of world.enemies) {
      const tint = material(enemy.id);
      box(mesh,enemy.x-.29,0,enemy.z-.26,.58,.56,.52,tint);
      box(mesh,enemy.x-.22,.53,enemy.z-.20,.44,.22,.40,tint);
      for (const x of [-.13,.08]) box(mesh,enemy.x+x,.41,enemy.z-.27,.055,.06,.54,[1,.27,.36]);
    }
    if (mesh.length) {
      actorVertices.set(mesh);
      gl.bindBuffer(gl.ARRAY_BUFFER,actorBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,actorVertices.subarray(0,mesh.length));
      renderBuffer(actorBuffer,mesh.length/6);
    }
    const remaining = deadline === undefined ? config.time : Math.max(0,Math.ceil((deadline-now)/1000));
    const message = (world.total-world.remaining)+" / "+world.total+" collected"+(config.time?" · "+remaining+"s":"");
    if (score.textContent !== message) score.textContent = message;
    const feedback = world.result || (world.remaining === 0 ? "Find the gate." : "");
    if (status.textContent !== feedback) status.textContent = feedback;
  }
  function restart() {
    world = createWorld(config);
    yaw = 0;
    pitch = -.03;
    deadline = undefined;
    started = false;
    previous = undefined;
    keys.clear();
    staticGeometry();
    // Eight triangles per gem, forty per creature, six floats per vertex.
    actorVertices = new Float32Array((world.total*8+world.enemies.length*40)*18);
    gl.bindBuffer(gl.ARRAY_BUFFER,actorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,actorVertices.byteLength,gl.DYNAMIC_DRAW);
  }
  function queueFrame() {
    frameDelay = setTimeout(()=>loop(performance.now()), Math.max(0,nextFrameAt-performance.now()));
  }
  function loop(now) {
    if (!active) return;
    const elapsed = now-(previous ?? now);
    if (nextFrameAt !== undefined && now < nextFrameAt-6) { queueFrame(); return; }
    nextFrameAt = Math.max((nextFrameAt ?? now)+targetInterval,now+1);
    const dt = Math.min(.1,Math.max(0,elapsed/1000));
    if (previous !== undefined && elapsed <= 250 && viewWidth && viewHeight) {
      measuredTime += elapsed;
      measuredFrames++;
      if (measuredTime >= 800) {
        const mean = measuredTime/measuredFrames;
        if (mean > 18) {
          adaptiveScale = Math.max(.5,adaptiveScale*.8);
          stableWindows = 0;
        } else if (mean < 16.9) {
          if (++stableWindows >= 15) {
            adaptiveScale = Math.min(1,adaptiveScale+.05);
            stableWindows = 0;
          }
        } else stableWindows = 0;
        measuredTime = measuredFrames = 0;
      }
    }
    previous = now;
    if (!world.result) {
      const left = Number(keys.has("arrowleft")), right = Number(keys.has("arrowright"));
      yaw += (right-left)*dt*2.3;
      const forward = Number(keys.has("w") || keys.has("arrowup"))-Number(keys.has("s") || keys.has("arrowdown"));
      const side = Number(keys.has("d"))-Number(keys.has("a"));
      if ((forward || side) && !started) {
        started = true;
        if (config.time) deadline = now + config.time*1000;
      }
      if (deadline !== undefined && now >= deadline) world.result = "Time’s up.";
      if (started && !world.result) {
        const speed = 2.8*dt/(Math.hypot(forward,side) || 1);
        stepWorld(world,(Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed,(Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed,dt);
      }
    }
    render(now);
    if (active) queueFrame();
  }
  const allowed = new Set(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"]);
  root.addEventListener("keydown",event=>{
    const key=event.key.toLowerCase();
    if (!allowed.has(key) || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    keys.add(key);
  },{signal});
  root.ownerDocument.addEventListener("keyup",event=>keys.delete(event.key.toLowerCase()),{signal});
  root.addEventListener("focusout",event=>{ if (!root.contains(event.relatedTarget)) keys.clear(); },{signal});
  window.addEventListener("blur",()=>keys.clear(),{signal});
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown",event=>{
    if (event.button !== 0) return;
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);
    dragging = {id:event.pointerId,x:event.clientX,y:event.clientY};
  },{signal});
  canvas.addEventListener("pointermove",event=>{
    if (dragging?.id !== event.pointerId) return;
    yaw += (event.clientX-dragging.x)*.007;
    pitch = Math.max(-1.1,Math.min(1.1,pitch-(event.clientY-dragging.y)*.006));
    dragging.x = event.clientX;
    dragging.y = event.clientY;
  },{signal});
  canvas.addEventListener("lostpointercapture",()=>{ dragging = null; },{signal});
  root.querySelectorAll("[data-key]").forEach(button=>{
    const key = button.dataset.key.toLowerCase();
    button.addEventListener("pointerdown",event=>{ event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(key); },{signal});
    button.addEventListener("lostpointercapture",()=>keys.delete(key),{signal});
    button.addEventListener("keydown",event=>{ if (event.key === " " || event.key === "Enter") { event.preventDefault(); keys.add(key); } },{signal});
    button.addEventListener("keyup",event=>{ if (event.key === " " || event.key === "Enter") keys.delete(key); },{signal});
  });
  root.querySelector("#restart").addEventListener("click",restart,{signal});
  canvas.addEventListener("webglcontextlost",event=>{
    event.preventDefault();
    active = false;
    cancelAnimationFrame(frame);
    clearTimeout(frameDelay);
    status.textContent = "The GPU connection was interrupted. Reopen Playtest or reload the game.";
  },{signal});
  restart();
  frame = requestAnimationFrame(loop);
  return () => {
    if (disposed) return;
    disposed = true;
    active = false;
    controls.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(frameDelay);
    gl.deleteBuffer(staticBuffer);
    gl.deleteBuffer(actorBuffer);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
