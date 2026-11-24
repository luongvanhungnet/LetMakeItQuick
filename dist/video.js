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
  return !!video && validVideoUploads(video) && validVideoAudio(video.audio) && Object.hasOwn(videoFormats,video.format) && Array.isArray(video.scenes) &&
    video.scenes.length >= 1 && video.scenes.length <= sceneLimit && video.scenes.every(scene => {
      const asset = videoAssets.get(scene?.asset) || (scene && Object.hasOwn(video.uploads || {},scene.asset) ? video.uploads[scene.asset] : null);
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
function drawVideoFrame(canvas,scene,source,elapsed,overlays) {
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
  function drawText(paint) {
    const unit = Math.min(width,height), lower = scene.layout === "lower", x = lower ? width*.1 : width/2;
    paint.textAlign = lower ? "left" : "center";
    paint.textBaseline = "middle";
    paint.fillStyle = "#fff";
    paint.shadowColor = "#10091aaa";
    paint.shadowBlur = 8;
    function lines(text,size,weight,top) {
      if (!text.trim()) return 0;
      paint.font = weight+" "+size+"px system-ui, sans-serif";
      const maxWidth = width*.8;
      let line = "", count = 0;
      for (const word of text.trim().split(/\s+/)) {
        const next = line ? line+" "+word : word;
        if (line && paint.measureText(next).width > maxWidth) {
          paint.fillText(line,x,top+count*size*1.15,maxWidth);
          count++;
          line = word;
        } else line = next;
      }
      if (line) paint.fillText(line,x,top+count*size*1.15,maxWidth);
      return count+1;
    }
    const y = lower ? height*.64 : height*.42;
    const used = lines(scene.title,unit*.065,700,y);
    lines(scene.caption,unit*.035,500,y+Math.max(1,used)*unit*.083);
    paint.shadowBlur = 0;
  }
  if (overlays) {
    if (!overlays.has(scene)) {
      const overlay = document.createElement("canvas");
      overlay.width = width;
      overlay.height = height;
      drawText(overlay.getContext("2d"));
      overlays.set(scene,overlay);
    }
    context.drawImage(overlays.get(scene),0,0);
  } else drawText(context);
  if (scene.transition === "fade") {
    const edge = Math.min(.35,scene.duration/3);
    context.globalAlpha = 1-Math.max(0,Math.min(1,elapsed/edge,(scene.duration-elapsed)/edge));
    context.fillStyle = "#0c0814";
    context.fillRect(0,0,width,height);
    context.globalAlpha = 1;
  }
}
function waitForMedia(source,event,signal,ready) {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ready()) return Promise.resolve();
  return new Promise((resolve,reject) => {
    const listeners = new AbortController();
    const options = {once:true,signal:listeners.signal};
    const finish = error => {
      clearTimeout(timer);
      listeners.abort();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(Error("A scene asset took too long to load.")),10000);
    signal.addEventListener("abort",() => finish(signal.reason),options);
    source.addEventListener(event,() => finish(),options);
    source.addEventListener("error",() => finish(Error("A scene asset could not load.")),options);
    if (source.error || (source.tagName === "IMG" && source.complete && !source.naturalWidth)) {
      finish(Error("A scene asset could not load."));
    }
  });
}
function videoRenderer(canvas,onMedia,assets,overlays) {
  const sources = new Map();
  let active = null, disposed = false;
  function sourceFor(scene,index) {
    const key = index+":"+scene.asset, asset = assets.get(scene.asset);
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
  function release(key,source) {
    if (source.tagName === "VIDEO") {
      source.pause();
      source.removeAttribute("src");
      source.load();
    }
    sources.delete(key);
  }
  return {
    draw(video,time,playing,transitions=playing) {
      if (disposed) return;
      const {index,elapsed} = videoPosition(video,time);
      const scene = video.scenes[index];
      const source = sourceFor(scene,index);
      const clip = source?.tagName === "VIDEO" ? source : null;
      if (active !== clip) pause();
      active = clip;
      if (clip && clip.readyState >= 2 && !clip.seeking) {
        const target = Math.max(0,Math.min(clip.duration-.04,scene.trim+elapsed));
        if (Math.abs(clip.currentTime-target) > (playing ? .30 : .045)) clip.currentTime = target;
        if (playing && clip.paused && elapsed < scene.duration) clip.play().catch(() => {});
      }
      drawVideoFrame(canvas,scene,source,transitions ? elapsed : Math.max(.36,Math.min(elapsed,scene.duration-.36)),overlays);
    },
    async drawExportFrame(video,time,signal) {
      const {index,elapsed} = videoPosition(video,time), scene = video.scenes[index];
      const source = sourceFor(scene,index);
      if (source?.tagName === "VIDEO") {
        source.pause();
        const target = Math.max(0,Math.min(source.duration-.04,scene.trim+elapsed));
        if (Math.abs(source.currentTime-target) > .012) source.currentTime = target;
        await waitForMedia(source,"seeked",signal,()=>!source.seeking);
      }
      drawVideoFrame(canvas,scene,source,elapsed,overlays);
    },
    retain(video) {
      const keys = new Set(video.scenes.map((scene,index)=>index+":"+scene.asset));
      for (const [key,source] of sources) if (!keys.has(key)) release(key,source);
    },
    preload(video,signal,position=0) {
      const start = videoPosition(video,position);
      return Promise.all(video.scenes.map(async (scene,index) => {
        const source = sourceFor(scene,index);
        if (!source) return;
        if (source.tagName !== "VIDEO") {
          await waitForMedia(source,"load",signal,()=>source.complete && source.naturalWidth);
          return;
        }
        await waitForMedia(source,"loadeddata",signal,()=>source.readyState >= 2);
        let target = scene.trim + (index === start.index ? start.elapsed : 0);
        target = Math.max(0,Math.min(source.duration-.04,target));
        if (Math.abs(source.currentTime-target) > .01) source.currentTime = target;
        await waitForMedia(source,"seeked",signal,()=>!source.seeking);
      }));
    },
    pause,
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      for (const [key,source] of sources) release(key,source);
    }
  };
}
async function prepareVideoAudio(audio,forRecording=false,decodeOnly=false) {
  if (!audio || !Object.keys(audio).length) return null;
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) throw Error("This browser does not support video audio.");
  const context = new AudioEngine();
  const destination = forRecording ? context.createMediaStreamDestination() : context.destination;
  const tracks = forRecording ? destination.stream.getAudioTracks() : [];
  let sources = [], closed = false;
  const stop = () => {
    for (const source of sources) {
      try { source.stop(); } catch {}
      source.disconnect();
    }
    sources = [];
  };
  const close = () => {
    if (closed) return;
    closed = true;
    stop();
    for (const track of tracks) track.stop();
    void context.close().catch(() => {});
  };
  try {
    const wake = decodeOnly ? Promise.resolve() : context.resume();
    const buffers = await Promise.all(Object.entries(audio).map(async ([kind,asset])=>{
      const response = await fetch(asset.path);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!buffer.duration || buffer.duration > 180) throw Error("Audio tracks must be between 0 and 180 seconds long.");
      return {kind,buffer,volume:asset.volume};
    }));
    await wake;
    return {
      tracks,
      play(offset,length) {
        stop();
        for (const {kind,buffer,volume} of buffers) {
          const loop = kind === "music", position = loop ? offset%buffer.duration : offset;
          if (!loop && position >= buffer.duration) continue;
          const source = context.createBufferSource(), gain = context.createGain();
          source.buffer = buffer;
          source.loop = loop;
          gain.gain.value = volume;
          source.connect(gain).connect(destination);
          source.start(0,position);
          source.stop(context.currentTime+length);
          sources.push(source);
        }
      },
      stop,close
    };
  } catch (error) {
    close();
    throw Error(error.name === "EncodingError" ? "This browser couldn’t decode one of the audio tracks." : error.message);
  }
}
function mountVideo(root,initial,assets=videoAssetMap(initial)) {
  root.innerHTML = '<div class="video-player"><canvas aria-label="Video preview"></canvas><div class="video-transport"><button type="button" class="secondary">Play</button><input type="range" min="0" value="0" step="0.01" aria-label="Playback position"><output></output></div><p class="video-media-status" role="status"></p></div>';
  const canvas = root.querySelector("canvas"), play = root.querySelector("button"), scrub = root.querySelector("input"), clock = root.querySelector("output");
  const status = root.querySelector(".video-media-status");
  let video = initial, position = 0, playing = false, frame, last, preparing, audioSession;
  const renderer = videoRenderer(canvas,() => { if (!playing && !preparing) render(); },assets);
  function render() {
    renderer.draw(video,position,playing);
    scrub.value = position;
    clock.textContent = videoClock(position)+" / "+videoClock(videoDuration(video));
  }
  function pause() {
    preparing?.abort();
    preparing = null;
    playing = false;
    cancelAnimationFrame(frame);
    renderer.pause();
    audioSession?.close();
    audioSession = null;
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
  play.addEventListener("click",async () => {
    if (playing || preparing) { pause(); status.textContent = ""; render(); return; }
    if (position >= videoDuration(video)) position = 0;
    const controller = preparing = new AbortController();
    play.textContent = "Cancel";
    status.textContent = "Loading scenes…";
    try {
      await Promise.all([
        renderer.preload(video,controller.signal,position),
        prepareVideoAudio(video.audio).then(session=>{
          if (controller.signal.aborted) session?.close();
          else audioSession = session;
        })
      ]);
      if (controller.signal.aborted) return;
      preparing = null;
      audioSession?.play(position,videoDuration(video)-position);
      status.textContent = "";
      last = performance.now();
      playing = true;
      play.textContent = "Pause";
      render();
      frame = requestAnimationFrame(tick);
    } catch (error) {
      if (controller.signal.aborted) return;
      pause();
      status.textContent = error.message;
    }
  });
  scrub.addEventListener("input",() => { pause(); status.textContent = ""; position = Number(scrub.value); render(); });
  function update(next,index) {
    pause();
    video = next;
    status.textContent = "";
    renderer.retain(video);
    const [width,height] = videoFormats[video.format];
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    scrub.max = videoDuration(video);
    position = index === undefined ? Math.min(position,videoDuration(video)) : video.scenes.slice(0,index).reduce((sum,scene) => sum+scene.duration,0);
    render();
  }
  update(initial,0);
  return {update,pause,dispose() { pause(); renderer.dispose(); }};
}

function videoHTML(project,embedded,css) {
  const assets = new Map(), available = videoAssetMap(project.video);
  for (const {asset:id} of project.video.scenes) {
    const asset = available.get(id);
    if (asset) assets.set(id,{path:embedded[asset.path] || asset.path,poster:!!asset.poster});
  }
  const {format,scenes} = project.video;
  const video = {format,scenes:scenes.map(({asset,title,caption,duration,trim,layout,transition,color}) =>
    ({asset,title,caption,duration,trim,layout,transition,color})),
    ...(project.video.audio ? {audio:project.video.audio} : {})};
  const json = data => JSON.stringify(data).replaceAll("<","\\u003c");
  const helpers = [videoDuration,videoPosition,videoClock,drawVideoFrame,waitForMedia,videoRenderer,prepareVideoAudio,mountVideo];
  const script = helpers.map(helper=>helper.toString()).join("\n")+
    '\nconst videoFormats='+json(videoFormats)+';mountVideo(document.querySelector("#player"),'+json(video)+
    ',new Map('+json([...assets])+'));';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(project.name)+'</title><style>body{margin:0;background:#faf9fc;color:#201b29;font-family:system-ui,sans-serif}'+
    '.video-transport button{font:inherit;padding:6px 12px;background:white;border:1px solid #dfd6ed;border-radius:7px}'+css+
    '</style></head><body><main class="published-video"><h1>'+esc(project.name)+'</h1><div id="player"></div></main>'+
    '<script>'+script+'</script></body></html>';
}

let selectedScene = 0;
function videoEditor() {
  const video = current.video;
  selectedScene = Math.min(selectedScene,video.scenes.length-1);
  const assets = videoAssetMap(video);
  const scene = video.scenes[selectedScene], asset = assets.get(scene.asset);
  const options = (values,value) => Object.entries(values).map(([key,label]) => '<option value="'+key+'" '+(key === value?"selected":"")+'>'+label+'</option>').join("");
  $("#editor-body").innerHTML = '<section class="panel video-editor"><div class="stage-head"><h2>Timeline</h2><button type="button" class="secondary" data-scene-action="add" '+(video.scenes.length>=sceneLimit?"disabled":"")+'>Add scene</button></div>'+
    '<label class="field">Project name<input id="video-name" maxlength="70" value="'+esc(current.name)+'"></label>'+
    '<label class="field">Aspect ratio<select id="video-format">'+options({wide:"16:9 Landscape",square:"1:1 Square",vertical:"9:16 Portrait"},video.format)+'</select></label>'+
    '<div class="video-scenes">'+video.scenes.map((item,index) => '<button type="button" draggable="true" class="scene-card" data-scene="'+index+'" aria-pressed="'+(index===selectedScene)+'"><span class="scene-swatch" style="background-color:'+item.color+'">'+(assets.has(item.asset)?'<img src="'+(assets.get(item.asset).poster || assets.get(item.asset).path)+'" alt="" draggable="false">':'')+'</span><span><strong>'+esc(item.title || "Scene "+(index+1))+'</strong><small>'+item.duration+' s</small></span></button>').join("")+'</div>'+
    '<div class="scene-inspector"><div class="stage-head"><h3>Scene '+(selectedScene+1)+'</h3><div class="block-actions"><button type="button" class="filter" data-scene-action="up" '+(!selectedScene?"disabled":"")+'>Move up</button><button type="button" class="filter" data-scene-action="down" '+(selectedScene===video.scenes.length-1?"disabled":"")+'>Move down</button><button type="button" class="filter" data-scene-action="duplicate" '+(video.scenes.length>=sceneLimit?"disabled":"")+'>Duplicate</button><button type="button" class="filter" data-scene-action="remove" '+(video.scenes.length===1?"disabled":"")+'>Remove</button></div></div>'+
    '<div class="dialog-actions"><button type="button" class="secondary" data-scene-action="asset">Choose asset</button>'+(asset?'<button type="button" class="filter" data-scene-action="clear">Clear asset</button>':'')+'</div><p class="subtext">'+esc(asset?.name || "Solid color")+'</p>'+
    videoScreenshotPicker(video,scene)+'<label class="field">Title<input data-prop="title" maxlength="100" value="'+esc(scene.title)+'"></label><label class="field">Caption<input data-prop="caption" maxlength="160" value="'+esc(scene.caption)+'"></label>'+
    '<div class="video-fields"><label class="field">Duration (seconds)<input data-prop="duration" type="number" min="1" max="'+(asset?.poster?6-scene.trim:15)+'" value="'+scene.duration+'"></label>'+
    (asset?.poster?'<label class="field">Clip start (seconds)<input data-prop="trim" type="number" min="0" max="'+(6-scene.duration)+'" value="'+scene.trim+'"></label>':'')+
    '<label class="field">Text layout<select data-prop="layout">'+options(videoLayouts,scene.layout)+'</select></label><label class="field">Transition<select data-prop="transition">'+options(videoTransitions,scene.transition)+'</select></label><label class="field">Background color<input data-prop="color" type="color" value="'+scene.color+'"></label></div></div>'+launchAdDetails(current)+videoAudioDetails(video)+'</section>';
  const root = $(".video-editor"), timeline = root.querySelector(".video-scenes");
  function rebuild() { saveEditor(); videoEditor(); }
  videoExtrasEvents(root,current,rebuild);
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

function recordVideo(canvas,video,renderer,candidates,onProgress,signal,audio) {
  const frameRate = 24;
  renderer.draw(video,0,false,true);
  const generated = window.MediaStreamTrackGenerator && window.VideoFrame
    ? new MediaStreamTrackGenerator({kind:"video"}) : null;
  const writer = generated?.writable.getWriter();
  const stream = generated ? new MediaStream([generated]) : canvas.captureStream(frameRate);
  const [track] = stream.getVideoTracks();
  for (const input of audio?.tracks || []) stream.addTrack(input);
  function releaseTrack() {
    track.stop();
    audio?.stop();
    if (writer) void writer.abort().catch(() => {});
  }
  let recorder;
  for (const mimeType of candidates) {
    try {
      const candidate = new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3200000});
      candidate.start();
      recorder = candidate;
      break;
    } catch {}
  }
  if (!recorder) {
    releaseTrack();
    throw Error("Recording could not start in this browser.");
  }
  return new Promise((resolve,reject) => {
    const duration = videoDuration(video), chunks = [];
    let frame, drain, first, lastFrame = -1, failure;
    const listeners = new AbortController();
    const options = {signal:listeners.signal};
    function finish(error) {
      failure ||= error;
      cancelAnimationFrame(frame);
      clearTimeout(drain);
      if (recorder.state !== "inactive") recorder.stop();
    }
    async function draw(time,playing,timestamp = time) {
      renderer.draw(video,time,playing,true);
      if (writer) {
        const frame = new VideoFrame(canvas,{alpha:"discard",timestamp:Math.round((first+timestamp*1000)*1000),duration:Math.round(1000000/frameRate)});
        try { await writer.write(frame); }
        finally { frame.close(); }
      }
    }
    async function tick() {
      try {
        const now = performance.now();
        if (first === undefined) { first = now; audio?.play(0,duration); }
        const time = Math.min(duration,(now-first)/1000);
        const index = Math.floor(time*frameRate);
        if (index !== lastFrame || time === duration) {
          lastFrame = index;
          await draw(time,time < duration);
          if (recorder.state === "inactive") return;
          onProgress(time/duration);
        }
        if (time < duration) frame = requestAnimationFrame(tick);
        else {
          renderer.pause();
          // Feed the final frame while the encoder catches up before closing the container.
          const tail = performance.now();
          async function drainEncoder() {
            try {
              if (recorder.state === "inactive") return;
              const elapsed = performance.now()-tail;
              if (elapsed >= 150) { finish(); return; }
              await draw(duration,false,duration+elapsed/1000);
              if (recorder.state !== "inactive") drain = setTimeout(drainEncoder,50);
            } catch { finish(Error("The last video frame could not be recorded.")); }
          }
          drain = setTimeout(drainEncoder,50);
        }
      } catch { finish(Error("A video frame could not be rendered.")); }
    }
    recorder.addEventListener("dataavailable",event=>{ if (event.data.size) chunks.push(event.data); },options);
    recorder.addEventListener("error",()=>finish(Error("Recording failed in this browser.")),options);
    recorder.addEventListener("stop",()=>{
      finish();
      listeners.abort();
      releaseTrack();
      if (failure || !chunks.length) reject(failure || Error("Recording produced an empty video."));
      else resolve(new Blob(chunks,{type:chunks[0].type || recorder.mimeType}));
    },{...options,once:true});
    signal.addEventListener("abort",()=>finish(Error("Export canceled.")),options);
    function verifyVisibility() {
      if (document.hidden) finish(Error("Keep this tab visible while exporting. Start a new export to try again."));
    }
    document.addEventListener("visibilitychange",verifyVisibility,options);
    if (signal.aborted) finish(Error("Export canceled."));
    else if (document.hidden) verifyVisibility();
    else if (!generated) {
      // Some canvas tracks need a frame before the encoder is ready. Hold the first
      // scene until the recorder reports startup, with a bounded fallback.
      const waitingSince = performance.now();
      let started = false;
      function startTimeline() {
        if (started || recorder.state === "inactive") return;
        started = true;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(tick);
      }
      function warmEncoder() {
        if (performance.now()-waitingSince > 1000) { startTimeline(); return; }
        try {
          renderer.draw(video,0,false,true);
          frame = requestAnimationFrame(warmEncoder);
        } catch { finish(Error("A video frame could not be rendered.")); }
      }
      recorder.addEventListener("start",startTimeline,{...options,once:true});
      frame = requestAnimationFrame(warmEncoder);
    } else frame = requestAnimationFrame(tick);
  });
}
async function checkRecording(url,duration,signal) {
  const probe = document.createElement("video");
  probe.preload = "auto";
  probe.muted = true;
  probe.src = url;
  try {
    await waitForMedia(probe,"loadedmetadata",signal,()=>probe.readyState >= 1);
    if (!probe.videoWidth || !Number.isFinite(probe.duration)) throw Error("The browser could not play the recording.");
    if (probe.duration < duration-.24 || probe.duration > duration+.45) {
      throw Error("The browser recorded "+probe.duration.toFixed(2)+" seconds of a "+duration+"-second timeline. Try exporting again.");
    }
  } finally {
    probe.removeAttribute("src");
    probe.load();
  }
}
async function exportVideo() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    toast("This browser cannot export video. Open the editor in a current desktop browser.");
    return;
  }
  liveVideo?.pause();
  const project = structuredClone(current), video = project.video;
  openDialog("Export video",'<p class="subtext">Keep this tab visible while the video renders. Export takes about as long as the video.</p><progress id="video-export-progress" max="1" value="0"></progress><p class="subtext" id="video-export-status" role="status">Preparing assets…</p><div class="dialog-actions"><button class="secondary" data-action="close">Cancel</button></div>');
  const status = $("#video-export-status"), progress = $("#video-export-progress");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  modal.addEventListener("close",cancel,{once:true});
  const canvas = document.createElement("canvas");
  [canvas.width,canvas.height] = videoFormats[video.format];
  canvas.getContext("2d",{alpha:false,willReadFrequently:true});
  const renderer = videoRenderer(canvas,() => {},videoAssetMap(video),new WeakMap());
  let downloadURL,audio;
  try {
    audio = await prepareVideoAudio(video.audio,true);
    const supports = type => MediaRecorder.isTypeSupported?.(type);
    const mp4 = (audio ? ["video/mp4;codecs=avc1.42001f,mp4a.40.2","video/mp4"] : ["video/mp4;codecs=avc1.42001f","video/mp4;codecs=vp09.00.31.08","video/mp4"]).filter(supports);
    const webm = (audio ? ["video/webm;codecs=vp8,opus","video/webm"] : ["video/webm;codecs=vp8","video/webm"]).filter(supports);
    const formats = [mp4,webm].filter(format=>format.length);
    if (!formats.length) formats.push([undefined]);
    if (!audio && window.VideoEncoder && window.VideoFrame) formats.push(null);
    let blob;
    for (const [index,format] of formats.entries()) {
      await renderer.preload(video,controller.signal);
      if (controller.signal.aborted) return;
      status.textContent = index ? "Rendering WebM fallback…" : "Rendering video…";
      progress.value = 0;
      try {
        const updateProgress = ratio => { progress.value = ratio; };
        blob = format ? await recordVideo(canvas,video,renderer,format,updateProgress,controller.signal,audio)
          : await encodeSilentWebM(canvas,video,renderer,updateProgress,controller.signal);
        blob = blob.type.includes("mp4") ? await normalizeRecordingTimescales(blob) : await opaqueCanvasWebM(blob);
        if (controller.signal.aborted) return;
        status.textContent = "Checking recorded video…";
        downloadURL = URL.createObjectURL(blob);
        await checkRecording(downloadURL,videoDuration(video),controller.signal);
        break;
      } catch (error) {
        if (controller.signal.aborted || document.hidden || index === formats.length-1) throw error;
        if (downloadURL) URL.revokeObjectURL(downloadURL);
        downloadURL = null;
        renderer.pause();
      }
    }
    if (controller.signal.aborted) return;
    const link = document.createElement("a");
    link.href = downloadURL;
    link.download = (project.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "video") + (blob.type.includes("mp4") ? ".mp4" : ".webm");
    link.click();
    const exportedURL = downloadURL;
    setTimeout(() => URL.revokeObjectURL(exportedURL),30000);
    downloadURL = null;
    modal.close();
    toast("Video exported.");
  } catch (error) {
    if (!controller.signal.aborted) status.textContent = error.message;
  } finally {
    modal.removeEventListener("close",cancel);
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    controller.abort();
    audio?.close();
    renderer.dispose();
  }
}

// Chromium MediaRecorder can write a fragmented MP4 track duration in movie
// ticks even when the track declares a different timescale.
async function normalizeRecordingTimescales(blob) {
  if (!blob.type.includes("mp4")) return blob;
  const bytes=new Uint8Array(await blob.slice(0,262144).arrayBuffer()), view=new DataView(bytes.buffer);
  function boxes(start,end,type) {
    const found=[];
    for (let pos=start;pos+8<=end;) {
      const size=view.getUint32(pos);
      if (size<8 || pos+size>end) break;
      if (String.fromCharCode(...bytes.subarray(pos+4,pos+8))===type) found.push({start:pos+8,end:pos+size});
      pos+=size;
    }
    return found;
  }
  const child=(box,type)=>box && boxes(box.start,box.end,type)[0];
  function timing(box,isTrackHeader=false) {
    if (!box) return null;
    const version=bytes[box.start];
    if (version>1) return null;
    const scaleAt=box.start+(version?20:12), durationAt=scaleAt+(isTrackHeader?8:4);
    if (durationAt+(version?8:4)>box.end) return null;
    return {scale:view.getUint32(scaleAt),duration:version?Number(view.getBigUint64(durationAt)):view.getUint32(durationAt),durationAt,version};
  }
  const movie=boxes(0,bytes.length,"moov")[0], header=timing(child(movie,"mvhd"));
  if (!header?.scale || !child(movie,"mvex")) return blob;
  let changed=false;
  for (const track of boxes(movie.start,movie.end,"trak")) {
    const trackTime=timing(child(track,"tkhd"),true), media=timing(child(child(track,"mdia"),"mdhd"));
    if (!media?.scale || !trackTime?.duration || media.scale===header.scale || media.duration!==trackTime.duration) continue;
    const ticks=Math.round(trackTime.duration*media.scale/header.scale);
    if (!Number.isSafeInteger(ticks) || (!media.version && ticks>0xffffffff)) continue;
    if (media.version) view.setBigUint64(media.durationAt,BigInt(ticks));
    else view.setUint32(media.durationAt,ticks);
    changed=true;
  }
  return changed ? new Blob([bytes,blob.slice(bytes.length)],{type:blob.type}) : blob;
}
