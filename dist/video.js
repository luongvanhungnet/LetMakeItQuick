"use strict";

const videoClips = [
  {id:"forest-motion",name:"Forest Drift",category:"Video clips",path:"media/clips/forest.mp4",poster:"media/forest.jpg"},
  {id:"studio-motion",name:"Studio Pan",category:"Video clips",path:"media/clips/interior.mp4",poster:"media/interior.jpg"},
  {id:"coffee-motion",name:"Coffee Close-Up",category:"Video clips",path:"media/clips/coffee.mp4",poster:"media/coffee.jpg"}
];
const videoAssets = new Map([...mediaLibrary,...videoClips].map(asset => [asset.id,asset]));
const videoFormats = {wide:[960,540],vertical:[540,960],square:[720,720]};
const videoLayouts = {center:"Centered",lower:"Lower third"};
const videoTransitions = {cut:"Cut",fade:"Fade through black"};
const sceneLimit = 12;
function videoScene(asset="",title="",caption="",duration=3) {
  return {asset,title,caption,duration,trim:0,layout:"center",transition:"fade",color:"#35245f"};
}
const videoTemplates = [
  {id:"studio-promo",type:"video",name:"Studio Promo",desc:"Introduce a business with a short clip and a closing title.",category:"Business",poster:"media/interior.jpg",format:"wide",scenes:[videoScene("studio-motion","Meet the studio","Thoughtful design for real life",4),videoScene("interior-photo","Made for your space","Explore our work"),videoScene("","Let’s work together","Get in touch")]},
  {id:"trail-reel",type:"video",name:"Trail Reel",desc:"A vertical video for weekend highlights.",category:"Vertical",poster:"media/forest.jpg",format:"vertical",scenes:[videoScene("forest-motion","A little closer to nature","Weekend trail notes",4),videoScene("woodland-dawn","Take the scenic route"),videoScene("forest-photo","See you out there")]},
  {id:"cafe-menu",type:"video",name:"Café Menu",desc:"A square video for a special offer or shop announcement.",category:"Square",poster:"media/coffee.jpg",format:"square",scenes:[videoScene("coffee-motion","Good mornings start here","Specialty coffee, fresh daily",4),videoScene("coffee-photo","This week’s special","Ask about the house roast")]}
];
function setupVideo(template) {
  return {format:template.format || "wide",scenes:structuredClone(template.scenes || [videoScene("","Your title")])};
}
function validVideo(video) {
  return !!video && Object.hasOwn(videoFormats,video.format) && Array.isArray(video.scenes) &&
    video.scenes.length >= 1 && video.scenes.length <= sceneLimit && video.scenes.every(scene => {
      const asset = videoAssets.get(scene?.asset);
      return !!scene && (scene.asset === "" || !!asset) &&
        typeof scene.title === "string" && scene.title.length <= 100 &&
        typeof scene.caption === "string" && scene.caption.length <= 160 &&
        Number.isInteger(scene.duration) && scene.duration >= 1 && scene.duration <= 15 &&
        Number.isInteger(scene.trim) && scene.trim >= 0 && scene.trim <= 5 &&
        (!asset?.poster || scene.trim+scene.duration <= 6) &&
        Object.hasOwn(videoLayouts,scene.layout) && Object.hasOwn(videoTransitions,scene.transition) &&
        typeof scene.color === "string" && /^#[0-9a-f]{6}$/i.test(scene.color);
    });
}
function videoDuration(video) { return video.scenes.reduce((total,scene) => total+scene.duration,0); }
function videoPosition(video,time) {
  let elapsed = Math.max(0,time);
  for (const [index,scene] of video.scenes.entries()) {
    if (elapsed < scene.duration || index === video.scenes.length-1) return {index,elapsed:Math.min(elapsed,scene.duration)};
    elapsed -= scene.duration;
  }
}
function videoClock(seconds) {
  const whole = Math.floor(seconds);
  return Math.floor(whole/60)+":"+String(whole%60).padStart(2,"0");
}
function drawVideoFrame(canvas,scene,source,elapsed) {
  const context = canvas.getContext("2d");
  const {width,height} = canvas;
  context.fillStyle = scene.color;
  context.fillRect(0,0,width,height);
  const sw = source?.videoWidth || source?.naturalWidth, sh = source?.videoHeight || source?.naturalHeight;
  if (sw && sh && (!source.videoWidth || source.readyState >= 2)) {
    const scale = Math.max(width/sw,height/sh);
    context.drawImage(source,(width-sw*scale)/2,(height-sh*scale)/2,sw*scale,sh*scale);
    const shade = context.createLinearGradient(0,0,0,height);
    shade.addColorStop(0,"#100b251e");
    shade.addColorStop(1,"#110b2dcc");
    context.fillStyle = shade;
    context.fillRect(0,0,width,height);
  }
  const unit = Math.min(width,height), lower = scene.layout === "lower", x = lower ? width*.1 : width/2;
  context.textAlign = lower ? "left" : "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff";
  context.shadowColor = "#10091aaa";
  context.shadowBlur = 8;
  function lines(text,size,weight,top) {
    if (!text.trim()) return 0;
    context.font = weight+" "+size+"px system-ui, sans-serif";
    const maxWidth = width*.8;
    let line = "", count = 0;
    for (const word of text.trim().split(/\s+/)) {
      const next = line ? line+" "+word : word;
      if (line && context.measureText(next).width > maxWidth) {
        context.fillText(line,x,top+count*size*1.15,maxWidth);
        count++;
        line = word;
      } else line = next;
    }
    if (line) context.fillText(line,x,top+count*size*1.15,maxWidth);
    return count+1;
  }
  const y = lower ? height*.64 : height*.42;
  const used = lines(scene.title,unit*.065,700,y);
  lines(scene.caption,unit*.035,500,y+Math.max(1,used)*unit*.083);
  context.shadowBlur = 0;
  if (scene.transition === "fade") {
    const edge = Math.min(.35,scene.duration/3);
    context.globalAlpha = 1-Math.max(0,Math.min(1,elapsed/edge,(scene.duration-elapsed)/edge));
    context.fillStyle = "#0c0814";
    context.fillRect(0,0,width,height);
    context.globalAlpha = 1;
  }
}
function videoRenderer(canvas,onMedia) {
  const sources = new Map();
  let active = null, disposed = false;
  function sourceFor(scene,index) {
    const key = index+":"+scene.asset, asset = videoAssets.get(scene.asset);
    if (!asset) return null;
    if (sources.has(key)) return sources.get(key);
    const source = asset.poster ? document.createElement("video") : new Image();
    sources.set(key,source);
    if (asset.poster) {
      source.muted = true;
      source.playsInline = true;
      source.preload = "auto";
      source.addEventListener("loadeddata",onMedia);
      source.addEventListener("seeked",onMedia);
    } else source.addEventListener("load",onMedia);
    source.src = asset.path;
    return source;
  }
  function pause() { active?.pause(); }
  return {
    draw(video,time,playing) {
      if (disposed) return;
      const {index,elapsed} = videoPosition(video,time);
      const scene = video.scenes[index];
      const source = sourceFor(scene,index);
      const clip = source?.tagName === "VIDEO" ? source : null;
      if (active !== clip) pause();
      active = clip;
      if (clip && clip.readyState >= 2 && !clip.seeking) {
        const target = Math.min(clip.duration-.04,scene.trim+elapsed);
        if (Math.abs(clip.currentTime-target) > (playing ? .22 : .045)) clip.currentTime = target;
        if (playing && clip.paused && elapsed < scene.duration) clip.play().catch(() => {});
      }
      drawVideoFrame(canvas,scene,source,playing ? elapsed : Math.max(.36,Math.min(elapsed,scene.duration-.36)));
    },
    preload(video) {
      return Promise.all(video.scenes.map((scene,index) => {
        const source = sourceFor(scene,index);
        if (!source || (source.tagName === "VIDEO" ? source.readyState >= 2 : source.complete && source.naturalWidth)) return;
        return new Promise((resolve,reject) => {
          const timer = setTimeout(() => reject(Error("A scene asset did not load.")),10000);
          source.addEventListener(source.tagName === "VIDEO" ? "loadeddata" : "load",() => { clearTimeout(timer); resolve(); },{once:true});
          source.addEventListener("error",() => { clearTimeout(timer); reject(Error("A scene asset could not load.")); },{once:true});
        });
      }));
    },
    pause,
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      for (const source of sources.values()) if (source.tagName === "VIDEO") { source.removeAttribute("src"); source.load(); }
      sources.clear();
    }
  };
}
function mountVideo(root,initial) {
  root.innerHTML = '<div class="video-player"><canvas aria-label="Video preview"></canvas><div class="video-transport"><button type="button" class="secondary">Play</button><input type="range" min="0" value="0" step="0.01" aria-label="Playback position"><output></output></div></div>';
  const canvas = root.querySelector("canvas"), play = root.querySelector("button"), scrub = root.querySelector("input"), clock = root.querySelector("output");
  let video = initial, position = 0, playing = false, frame, last;
  const renderer = videoRenderer(canvas,() => { if (!playing) render(); });
  function render() {
    renderer.draw(video,position,playing);
    scrub.value = position;
    clock.textContent = videoClock(position)+" / "+videoClock(videoDuration(video));
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(frame);
    renderer.pause();
    play.textContent = "Play";
  }
  function tick(now) {
    if (!playing) return;
    position = Math.min(videoDuration(video),position+(now-last)/1000);
    last = now;
    render();
    if (position >= videoDuration(video)) pause();
    else frame = requestAnimationFrame(tick);
  }
  play.addEventListener("click",() => {
    if (playing) { pause(); render(); return; }
    if (position >= videoDuration(video)) position = 0;
    last = performance.now();
    playing = true;
    play.textContent = "Pause";
    render();
    frame = requestAnimationFrame(tick);
  });
  scrub.addEventListener("input",() => { pause(); position = Number(scrub.value); render(); });
  function update(next,index) {
    pause();
    video = next;
    const [width,height] = videoFormats[video.format];
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    scrub.max = videoDuration(video);
    position = index === undefined ? Math.min(position,videoDuration(video)) : video.scenes.slice(0,index).reduce((sum,scene) => sum+scene.duration,0);
    render();
  }
  update(initial,0);
  return {update,dispose() { pause(); renderer.dispose(); }};
}

let selectedScene = 0;
function videoEditor() {
  const video = current.video;
  selectedScene = Math.min(selectedScene,video.scenes.length-1);
  const scene = video.scenes[selectedScene], asset = videoAssets.get(scene.asset);
  const options = (values,value) => Object.entries(values).map(([key,label]) => '<option value="'+key+'" '+(key === value?"selected":"")+'>'+label+'</option>').join("");
  $("#editor-body").innerHTML = '<section class="panel video-editor"><div class="stage-head"><h2>Timeline</h2><button type="button" class="secondary" data-scene-action="add" '+(video.scenes.length>=sceneLimit?"disabled":"")+'>Add scene</button></div>'+
    '<label class="field">Project name<input id="video-name" maxlength="70" value="'+esc(current.name)+'"></label>'+
    '<label class="field">Aspect ratio<select id="video-format">'+options({wide:"16:9 Landscape",square:"1:1 Square",vertical:"9:16 Portrait"},video.format)+'</select></label>'+
    '<div class="video-scenes">'+video.scenes.map((item,index) => '<button type="button" draggable="true" class="scene-card" data-scene="'+index+'" aria-pressed="'+(index===selectedScene)+'"><span class="scene-swatch" style="background-color:'+item.color+'">'+(videoAssets.has(item.asset)?'<img src="'+(videoAssets.get(item.asset).poster || videoAssets.get(item.asset).path)+'" alt="" draggable="false">':'')+'</span><span><strong>'+esc(item.title || "Scene "+(index+1))+'</strong><small>'+item.duration+' s</small></span></button>').join("")+'</div>'+
    '<div class="scene-inspector"><div class="stage-head"><h3>Scene '+(selectedScene+1)+'</h3><div class="block-actions"><button type="button" class="filter" data-scene-action="up" '+(!selectedScene?"disabled":"")+'>Move up</button><button type="button" class="filter" data-scene-action="down" '+(selectedScene===video.scenes.length-1?"disabled":"")+'>Move down</button><button type="button" class="filter" data-scene-action="duplicate" '+(video.scenes.length>=sceneLimit?"disabled":"")+'>Duplicate</button><button type="button" class="filter" data-scene-action="remove" '+(video.scenes.length===1?"disabled":"")+'>Remove</button></div></div>'+
    '<div class="dialog-actions"><button type="button" class="secondary" data-scene-action="asset">Choose asset</button>'+(asset?'<button type="button" class="filter" data-scene-action="clear">Clear asset</button>':'')+'</div><p class="subtext">'+(asset?asset.name:"Solid color")+'</p>'+
    '<label class="field">Title<input data-prop="title" maxlength="100" value="'+esc(scene.title)+'"></label><label class="field">Caption<input data-prop="caption" maxlength="160" value="'+esc(scene.caption)+'"></label>'+
    '<div class="video-fields"><label class="field">Duration (seconds)<input data-prop="duration" type="number" min="1" max="'+(asset?.poster?6-scene.trim:15)+'" value="'+scene.duration+'"></label>'+
    (asset?.poster?'<label class="field">Clip start (seconds)<input data-prop="trim" type="number" min="0" max="'+(6-scene.duration)+'" value="'+scene.trim+'"></label>':'')+
    '<label class="field">Text layout<select data-prop="layout">'+options(videoLayouts,scene.layout)+'</select></label><label class="field">Transition<select data-prop="transition">'+options(videoTransitions,scene.transition)+'</select></label><label class="field">Background color<input data-prop="color" type="color" value="'+scene.color+'"></label></div></div></section>';
  const root = $(".video-editor"), timeline = root.querySelector(".video-scenes");
  function rebuild() { saveEditor(); videoEditor(); }
  root.querySelector("#video-name").addEventListener("input",(event) => {
    current.name = event.target.value;
    $(".project-heading h1").textContent = current.name || "Untitled project";
    saveEditor();
  });
  root.querySelector("#video-format").addEventListener("change",(event) => { video.format = event.target.value; saveEditor(); });
  root.addEventListener("input",(event) => {
    const {prop} = event.target.dataset;
    if (!prop) return;
    const {value} = event.target;
    if (prop === "duration" || prop === "trim") {
      if (value === "") return;
      scene[prop] = blockNumber(value,Number(event.target.min),Number(event.target.max));
      const other = root.querySelector('[data-prop="'+(prop === "trim" ? "duration" : "trim")+'"]');
      if (other) other.max = 6-scene[prop];
    } else scene[prop] = value;
    const card = timeline.children[selectedScene];
    card.querySelector("strong").textContent = scene.title || "Scene "+(selectedScene+1);
    card.querySelector("small").textContent = scene.duration+" s";
    card.querySelector(".scene-swatch").style.backgroundColor = scene.color;
    saveEditor();
  });
  root.addEventListener("change",(event) => {
    if (event.target.type === "number") event.target.value = scene[event.target.dataset.prop];
  });
  root.addEventListener("click",(event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.scene !== undefined) {
      selectedScene = Number(button.dataset.scene);
      videoEditor();
      refreshPreview();
      $(".video-scenes").children[selectedScene].focus();
      return;
    }
    switch (button.dataset.sceneAction) {
      case "asset": assetPicker((item) => {
        scene.asset = item.id;
        scene.trim = 0;
        if (item.poster) scene.duration = Math.min(6,scene.duration);
        rebuild();
      },true); return;
      case "clear": scene.asset = ""; scene.trim = 0; break;
      case "add": selectedScene = video.scenes.push(videoScene("","New scene"))-1; break;
      case "duplicate": video.scenes.splice(++selectedScene,0,{...scene}); break;
      case "remove": video.scenes.splice(selectedScene,1); selectedScene = Math.min(selectedScene,video.scenes.length-1); break;
      case "up": moveBlock(video.scenes,selectedScene,selectedScene-1); selectedScene--; break;
      case "down": moveBlock(video.scenes,selectedScene,selectedScene+2); selectedScene++; break;
      default: return;
    }
    rebuild();
  });
  let dragged = null;
  timeline.addEventListener("dragstart",(event) => {
    const card = event.target.closest("[data-scene]");
    if (!card) return;
    dragged = Number(card.dataset.scene);
    event.dataTransfer.setData("text/plain",String(dragged));
    event.dataTransfer.effectAllowed = "move";
  });
  timeline.addEventListener("dragend",() => { dragged = null; });
  timeline.addEventListener("dragover",(event) => {
    if (dragged !== null && event.target.closest("[data-scene]")) event.preventDefault();
  });
  timeline.addEventListener("drop",(event) => {
    const card = event.target.closest("[data-scene]");
    if (!card || dragged === null) return;
    event.preventDefault();
    const target = Number(card.dataset.scene);
    if (moveBlock(video.scenes,dragged,target+(target>dragged?1:0))) { selectedScene = target; rebuild(); }
    dragged = null;
  });
}

function recordVideo(canvas,video,renderer,mime,onProgress,signal) {
  const stream = canvas.captureStream(30);
  let recorder;
  try { recorder = mime ? new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3200000}) : new MediaRecorder(stream); }
  catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  return new Promise((resolve,reject) => {
    let frame, failure, first, started = false;
    const chunks = [], duration = videoDuration(video);
    const abort = () => finish(Error("Export canceled."));
    function cleanup() {
      cancelAnimationFrame(frame);
      renderer.dispose();
      stream.getTracks().forEach(track => track.stop());
      signal.removeEventListener("abort",abort);
    }
    function finish(error) {
      failure ||= error;
      cancelAnimationFrame(frame);
      if (recorder.state !== "inactive") recorder.stop();
      else if (!started) { cleanup(); reject(failure || Error("Recording could not start.")); }
    }
    recorder.addEventListener("dataavailable",(event) => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener("error",() => finish(Error("Recording failed in this browser.")));
    recorder.addEventListener("stop",() => {
      cleanup();
      if (failure || !chunks.length) reject(failure || Error("Recording produced an empty video."));
      else resolve(new Blob(chunks,{type:recorder.mimeType || mime || "video/webm"}));
    },{once:true});
    signal.addEventListener("abort",abort,{once:true});
    function tick(now) {
      const time = Math.min(duration,(now-first)/1000);
      try {
        renderer.draw(video,time,true);
        onProgress(time/duration);
        if (time >= duration) finish();
        else frame = requestAnimationFrame(tick);
      } catch { finish(Error("A video frame could not be rendered.")); }
    }
    try {
      if (signal.aborted) { abort(); return; }
      renderer.draw(video,0,true);
      recorder.start();
      started = true;
      first = performance.now();
      frame = requestAnimationFrame(tick);
    } catch { finish(Error("Recording could not start in this browser.")); }
  });
}
async function exportVideo() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    toast("This browser cannot export video. Open the editor in a current desktop browser.");
    return;
  }
  const project = structuredClone(current), video = project.video;
  openDialog("Export video",'<p class="subtext">Keep this tab visible while the video renders. Export takes about as long as the video.</p><progress id="video-export-progress" max="1" value="0"></progress><p class="subtext" id="video-export-status" role="status">Preparing assets…</p><div class="dialog-actions"><button class="secondary" data-action="close">Cancel</button></div>');
  const status = $("#video-export-status"), progress = $("#video-export-progress");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  modal.addEventListener("close",cancel,{once:true});
  const canvas = document.createElement("canvas");
  [canvas.width,canvas.height] = videoFormats[video.format];
  const renderer = videoRenderer(canvas,() => {});
  try {
    await renderer.preload(video);
    if (controller.signal.aborted) return;
    const mime = ["video/mp4","video/webm;codecs=vp8","video/webm"].find((type) => MediaRecorder.isTypeSupported?.(type));
    status.textContent = "Rendering video…";
    const blob = await recordVideo(canvas,video,renderer,mime,(ratio) => { progress.value = ratio; },controller.signal);
    if (controller.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (project.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "video") + (blob.type.includes("mp4") ? ".mp4" : ".webm");
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),30000);
    modal.close();
    toast("Video exported.");
  } catch (error) {
    if (!controller.signal.aborted) status.textContent = error.message;
  } finally {
    modal.removeEventListener("close",cancel);
    renderer.dispose();
  }
}
