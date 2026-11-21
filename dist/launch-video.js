"use strict";

const launchAdFormats = {wide:"Landscape · 16:9",square:"Square · 1:1",vertical:"Portrait · 9:16"};
const launchImageLimit = 150000;
const launchAdStyles = {
  reveal:{name:"Product reveal",timings:[4,4,3],layout:"center"},
  walkthrough:{name:"Feature walkthrough",timings:[3,5,4],layout:"lower"}
};
const audioLimit = 300000;
function validMediaData(path, kind, limit) {
  if (typeof path !== "string" || path.length > limit) return false;
  const match = /^data:(image\/(?:png|jpeg|webp)|audio\/(?:mpeg|mp3|wav|wave|ogg|mp4|aac|x-m4a|webm));base64,([A-Za-z0-9+/]+={0,2})$/.exec(path);
  return !!match && match[1].startsWith(kind+"/") && match[2].length % 4 === 0;
}
function validVideoUploads(video) {
  const uploads = video.uploads;
  if (uploads === undefined) return true;
  if (!uploads || Array.isArray(uploads) || typeof uploads !== "object") return false;
  const items = Object.entries(uploads);
  return items.length <= 3 && items.every(([id,item]) =>
    /^screenshot-[0-9a-f-]{36}$/.test(id) && typeof item?.name === "string" &&
    item.name.trim() && item.name.length <= 100 && validMediaData(item.path,"image",launchImageLimit)
  );
}
function validVideoAudio(audio) {
  if (audio === undefined) return true;
  return !!audio && typeof audio === "object" && !Array.isArray(audio) &&
    Object.entries(audio).every(([kind,asset]) =>
      ["voice","music"].includes(kind) && typeof asset?.name === "string" &&
      asset.name.trim() && asset.name.length <= 100 && asset.rights === true &&
      Number.isFinite(asset.volume) && asset.volume >= 0 && asset.volume <= 1 &&
      validMediaData(asset.path,"audio",audioLimit)
    );
}
function videoAssetMap(video) {
  return new Map([...videoAssets,...Object.entries(video?.uploads || {}).map(([id,{name,path}]) => [id,{id,name,path}])]);
}
function videoSnapshotExtras(video) {
  const extra = {};
  if (video.uploads && validVideoUploads(video)) {
    extra.uploads = Object.fromEntries(Object.entries(video.uploads).map(([id,{name,path}])=>[id,{name,path}]));
  }
  if (video.audio && validVideoAudio(video.audio)) {
    extra.audio = Object.fromEntries(Object.entries(video.audio).map(([kind,{name,path,rights,volume}])=>[kind,{name,path,rights,volume}]));
  }
  return extra;
}
function videoEmbeddedPaths(video) {
  const assets = videoAssetMap(video);
  return [...new Set(video.scenes.map(({asset}) => assets.get(asset)?.path).filter(path => path && !path.startsWith("data:")))];
}
function launchURL(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.href.length > 200000) return null;
    if (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1","localhost","[::1]"].includes(url.hostname))) return url;
  } catch {}
  return null;
}
function cleanLaunchAdProvenance(value) {
  const keyPattern = /^[a-z0-9_-]{1,85}$/i;
  if (!value || typeof value.projectId !== "string" || !keyPattern.test(value.projectId) || typeof value.sourceUrl !== "string") return null;
  const sourceURL = launchURL(value.sourceUrl);
  if (!sourceURL) return null;
  const text = (key,limit) => typeof value[key] === "string" ? value[key].slice(0,limit) : "";
  const createdAt = Date.parse(text("createdAt",40));
  const releaseId = text("releaseId",85);
  return {
    projectId:value.projectId,productName:text("productName",70),version:text("version",80),
    releaseId:keyPattern.test(releaseId) ? releaseId : null,sourceUrl:sourceURL.href,
    source:campaignSlug(text("source",72),"social"),campaign:campaignSlug(text("campaign",72),"launch"),
    message:text("message",500),cta:text("cta",80),createdAt:Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : ""
  };
}
function campaignLink(value, source, campaign, format) {
  const url = launchURL(value);
  if (!url) return "";
  url.searchParams.set("utm_source",source);
  url.searchParams.set("utm_medium","video");
  url.searchParams.set("utm_campaign",campaign);
  url.searchParams.set("utm_content",format);
  return url.href;
}
function campaignSlug(value, fallback) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,72) || fallback;
}
function launchAdDraft(product, options, screenshots = {}, release) {
  const defaults = blank("video");
  const uploadedIds = Object.keys(screenshots);
  const assets = uploadedIds.length ? uploadedIds : options.asset ? [options.asset] : [];
  const color = /^#[0-9a-f]{6}$/i.test(product.color) ? product.color : "#35245f";
  const preset = launchAdStyles[options.style] || launchAdStyles.reveal;
  const title = product.title && product.title !== "Welcome" ? product.title : product.name;
  const features = options.features.split(/\n/).map(line => line.trim()).filter(Boolean).slice(0,4);
  const copy = options.copy || [product.intro,...features].filter(Boolean).join(" · ");
  const scenes = [
    videoScene(assets[0] || "",title.slice(0,100),copy.slice(0,160),preset.timings[0]),
    ...features.map((feature,index) => videoScene(assets[(index+1)%assets.length] || "",feature.slice(0,100),"",preset.timings[1])),
    videoScene(assets.at(-1) || "",options.cta.slice(0,100),product.name.slice(0,160),preset.timings[2])
  ].map(scene => ({...scene,color,layout:preset.layout}));
  return {
    ...defaults,id:crypto.randomUUID(),template:"blank",name:(product.name+" launch ad").slice(0,70),
    video:{format:options.format,scenes,...(uploadedIds.length ? {uploads:screenshots} : {})},
    launchAd:{
      projectId:product.id,productName:product.name,version:String(release?.version || "Unpublished draft").slice(0,80),
      releaseId:release?.id || null,sourceUrl:options.url,source:options.source,campaign:options.campaign,
      message:copy.slice(0,500),cta:options.cta,createdAt:new Date().toISOString()
    }
  };
}
async function compactScreenshot(file) {
  if (!file || !["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 10000000) {
    throw Error("Choose PNG, JPEG, or WebP screenshots up to 10 MB each.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1,960/Math.max(bitmap.width,bitmap.height));
    canvas.width = Math.max(1,Math.round(bitmap.width*scale));
    canvas.height = Math.max(1,Math.round(bitmap.height*scale));
    const paint = canvas.getContext("2d");
    paint.fillStyle = "#161028";
    paint.fillRect(0,0,canvas.width,canvas.height);
    paint.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for (const quality of [.8,.65,.48,.32]) {
      const path = canvas.toDataURL("image/jpeg",quality);
      if (validMediaData(path,"image",launchImageLimit)) return {name:file.name.slice(0,100),path};
    }
    throw Error("A screenshot is too detailed to store. Crop or resize it and retry.");
  } finally { bitmap.close(); }
}
function openLaunchAd(product, release) {
  let sourceRelease = release;
  const sourceURL = release?.url || product.link || "";
  const picture = templateFor(product)?.image;
  const templateAsset = picture && assetByPath.get("media/"+picture)?.id;
  openDialog("Create a launch ad",'<form id="launch-ad-form">'+
    '<p class="subtext">Build an editable promo timeline for '+esc(product.name)+'.</p>'+
    '<label class="field">Ad template<select name="style">'+Object.entries(launchAdStyles).map(([key,preset])=>'<option value="'+key+'">'+preset.name+'</option>').join("")+'</select></label>'+
    '<label class="field">Format<select name="format">'+Object.entries(launchAdFormats).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join("")+'</select></label>'+
    '<p class="subtext" id="launch-ad-version">Source release: '+esc(release?.version || 'Unpublished draft')+'</p>'+
    '<label class="field">Product link<input name="url" type="url" value="'+esc(sourceURL)+'" required></label>'+
    '<div class="launch-ad-fields"><label class="field">Campaign<input name="campaign" maxlength="72" value="'+esc(campaignSlug(product.name,"launch"))+'" required></label>'+
    '<label class="field">Channel<input name="source" maxlength="72" value="social" required></label></div>'+
    '<label class="field">Key features, one per line<textarea name="features" maxlength="400">'+esc(product.details?.split(/\n/).slice(0,3).join("\n").slice(0,400) || "")+'</textarea></label>'+
    '<label class="field">Call to action<input name="cta" maxlength="80" value="'+esc(product.button || "Explore the product")+'" required></label>'+
    '<label class="field">Library backdrop<select name="asset"><option value="">Solid brand color</option>'+mediaLibrary.filter(asset=>asset.role === "background").map(asset=>'<option value="'+esc(asset.id)+'" '+(asset.id === templateAsset ? "selected" : "")+'>'+esc(asset.name)+'</option>').join("")+'</select></label>'+
    '<label class="field">Product screenshots (optional)<input name="screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>'+
    '<label class="launch-ad-rights"><input type="checkbox" name="rights"> I have permission to use the uploaded screenshots.</label>'+
    '<p class="subtext" id="launch-ad-status" role="status"></p><div class="dialog-actions"><button class="primary" type="submit">Create editable ad</button></div></form>');
  const form = $("#launch-ad-form");
  if (!release && typeof getLatestHostedRelease === "function") {
    const linkField = form.elements.url;
    getLatestHostedRelease(product).then(latest => {
      if (!latest || !form.isConnected || !modal.open) return;
      sourceRelease = latest;
      if (linkField.value === sourceURL) linkField.value = latest.url;
      form.querySelector("#launch-ad-version").textContent = "Source release: "+latest.version;
    }).catch(() => {});
  }
  form.addEventListener("submit",async event => {
    event.preventDefault();
    const fields = form.elements;
    const data = new FormData(form);
    const files = [...fields.screenshots.files];
    const status = form.querySelector("[role=status]");
    const url = launchURL(String(data.get("url")).trim());
    if (!url) { status.textContent = "Enter a valid HTTPS product link."; return; }
    if (files.length > 3 || (files.length && !fields.rights.checked)) {
      status.textContent = "Choose up to three screenshots and confirm permission to use them.";
      return;
    }
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    status.textContent = files.length ? "Preparing screenshots…" : "Building your timeline…";
    try {
      const screenshots = Object.fromEntries(await Promise.all(files.map(async file => ["screenshot-"+crypto.randomUUID(),await compactScreenshot(file)])));
      if (!form.isConnected || !modal.open) return;
      const ad = launchAdDraft(product,{
        style:data.get("style"),format:data.get("format"),url:url.href,
        source:campaignSlug(String(data.get("source")),"social"),campaign:campaignSlug(String(data.get("campaign")),"launch"),
        features:String(data.get("features")),cta:String(data.get("cta")).trim() || "Explore the product",asset:String(data.get("asset"))
      },screenshots,sourceRelease);
      const previous = current;
      projects.unshift(ad);
      current = ad;
      if (save() === false) {
        projects.shift();
        current = previous;
        status.textContent = "This draft exceeds browser storage. Remove some screenshots and retry.";
        return;
      }
      editorMode = "blocks";
      selectedScene = 0;
      modal.close();
      go("editor");
    } catch (error) { status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
}
function launchAdDetails(project) {
  const ad = project.launchAd;
  if (!ad || typeof ad.productName !== "string") return "";
  const assets = videoAssetMap(project.video);
  const names = [...new Set(project.video.scenes.map(scene=>assets.get(scene.asset)?.name).filter(Boolean))];
  const url = campaignLink(ad.sourceUrl,ad.source,ad.campaign,project.video.format);
  return '<section class="launch-ad-card"><h3>Campaign assets</h3><p class="subtext">'+esc(ad.productName)+' · '+esc(ad.version)+'</p>'+
    '<p class="subtext">Visuals: '+esc(names.join(", ") || "Brand colors and titles")+'</p>'+
    '<label class="field">Campaign link<input id="ad-campaign-link" readonly value="'+esc(url)+'"></label>'+
    '<div class="launch-ad-actions"><button type="button" class="secondary" data-video-extra="thumbnail">Download thumbnail</button>'+
    '<button type="button" class="secondary" data-video-extra="copy">Download ad copy</button>'+
    '<button type="button" class="secondary" data-video-extra="update-release">Use latest release</button></div><p class="subtext" id="ad-release-state" role="status"></p></section>';
}
function videoAudioDetails(video) {
  return '<section class="launch-ad-card"><h3>Audio and captions</h3>'+
    '<p class="subtext">Voiceover starts with the first scene. Music loops underneath it. Add only audio you have permission to use.</p>'+
    '<label class="launch-ad-rights"><input type="checkbox" id="video-audio-rights"> I have permission to use the audio I add.</label>'+
    [["voice","Voiceover"],["music","Background music"]].map(([kind,label])=>{
      const asset = video.audio?.[kind];
      return '<label class="field">'+label+'<input type="file" data-video-audio="'+kind+'" accept="audio/mpeg,audio/wav,audio/wave,audio/ogg,audio/mp4,audio/aac,audio/x-m4a,audio/webm"></label>'+
        (asset?'<p class="subtext">'+esc(asset.name)+'</p><div class="launch-ad-actions"><label class="field">'+label+' volume<input type="range" min="0" max="1" step=".05" data-video-volume="'+kind+'" value="'+asset.volume+'"></label><button type="button" class="filter" data-video-extra="remove-'+kind+'">Remove '+label.toLowerCase()+'</button></div>':"");
    }).join("")+'<p class="subtext" id="video-audio-status" role="status"></p>'+
    '<button type="button" class="secondary" data-video-extra="captions">Download captions (.vtt)</button></section>';
}
function videoExtrasFilename(name,suffix) {
  return (name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "video")+suffix;
}
function downloadVideoAsset(blob,name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function launchAdCopy(project) {
  const ad = project.launchAd;
  return [ad.productName,ad.message,ad.cta,campaignLink(ad.sourceUrl,ad.source,ad.campaign,project.video.format)]
    .filter(Boolean).join("\n\n")+"\n";
}
function videoCaptions(video) {
  let elapsed = 0;
  function stamp(seconds) {
    const base = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(value=>String(value).padStart(2,"0"));
    return base.join(":")+".000";
  }
  const cues = ["WEBVTT",""];
  for (const scene of video.scenes) {
    const caption = [scene.title,scene.caption].map(text=>text.trim().replace(/\s+/g," "))
      .filter(Boolean).join("\n").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    if (caption) cues.push(stamp(elapsed)+" --> "+stamp(elapsed+scene.duration),caption,"");
    elapsed += scene.duration;
  }
  return cues.join("\n");
}
async function makeVideoThumbnail(project) {
  const video = project.video;
  const canvas = document.createElement("canvas");
  [canvas.width,canvas.height] = videoFormats[video.format];
  const onlyImage = {...video,scenes:video.scenes.slice(0,1)};
  const renderer = videoRenderer(canvas,()=>{},videoAssetMap(video));
  try {
    await renderer.preload(onlyImage,AbortSignal.timeout(12000));
    renderer.draw(onlyImage,.5,false,false);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("Couldn’t render the thumbnail.")),"image/png"));
  } finally { renderer.dispose(); }
}
function videoScreenshotPicker(video,scene) {
  const uploads = Object.entries(video.uploads || {});
  if (!uploads.length) return "";
  return '<label class="field">Project screenshots<select data-video-screenshot><option value="">Choose a screenshot</option>'+
    uploads.map(([id,asset])=>'<option value="'+esc(id)+'" '+(id === scene.asset ? "selected" : "")+'>'+esc(asset.name)+'</option>').join("")+
    '</select></label>';
}
function videoExtrasEvents(root,project,rebuild) {
  root.addEventListener("change",async event=>{
    if (event.target.hasAttribute("data-video-screenshot")) {
      if (event.target.value && Object.hasOwn(project.video.uploads,event.target.value)) {
        const scene = project.video.scenes[selectedScene];
        scene.asset = event.target.value;
        scene.trim = 0;
        rebuild();
      }
      return;
    }
    const key = event.target.dataset.videoAudio;
    const changedVolume = event.target.dataset.videoVolume;
    if (changedVolume) {
      project.video.audio[changedVolume].volume = Number(event.target.value);
      saveEditor();
      return;
    }
    if (!key) return;
    const file = event.target.files[0];
    const status = root.querySelector("#video-audio-status");
    if (!file) return;
    if (!root.querySelector("#video-audio-rights").checked) {
      event.target.value = "";
      status.textContent = "Confirm you have permission before selecting audio.";
      return;
    }
    try {
      if (file.size > 220000 || !/^audio\/(mpeg|mp3|wav|wave|ogg|mp4|aac|x-m4a|webm)$/.test(file.type)) {
        throw Error("Choose a supported audio file up to 220 KB.");
      }
      const path = await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = ()=>resolve(reader.result);
        reader.onerror = ()=>reject(Error("The audio file couldn’t be read."));
        reader.readAsDataURL(file);
      });
      if (!root.isConnected) return;
      const audio = {...project.video.audio,[key]:{name:file.name.slice(0,100),path,volume:key === "voice" ? 1 : .25,rights:true}};
      if (!validVideoAudio(audio)) throw Error("The audio file couldn’t be read.");
      const session = await prepareVideoAudio(audio,false,true);
      session.close();
      if (!root.isConnected) return;
      const previous = project.video.audio;
      project.video.audio = audio;
      if (save() === false) { project.video.audio = previous; throw Error("The audio exceeds browser storage."); }
      rebuild();
    } catch (error) { event.target.value = ""; status.textContent = error.message; }
  });
  root.addEventListener("click",async event=>{
    const action = event.target.closest("[data-video-extra]")?.dataset.videoExtra;
    if (!action) return;
    const ad = project.launchAd;
    try {
      if (action === "captions") return downloadVideoAsset(new Blob([videoCaptions(project.video)],{type:"text/vtt"}),videoExtrasFilename(project.name,".vtt"));
      if (action.startsWith("remove-")) { delete project.video.audio[action.slice(7)]; rebuild(); return; }
      if (!ad) return;
      if (action === "copy") return downloadVideoAsset(new Blob([launchAdCopy(project)],{type:"text/plain;charset=utf-8"}),videoExtrasFilename(project.name,"-copy.txt"));
      if (action === "thumbnail") return downloadVideoAsset(await makeVideoThumbnail(project),videoExtrasFilename(project.name,"-thumbnail.png"));
      const status = root.querySelector("#ad-release-state");
      const source = projects.find(item=>item.id === ad.projectId);
      if (!source || typeof getLatestHostedRelease !== "function") {
        status.textContent = "Open this ad with its original product to look up the latest release.";
        return;
      }
      status.textContent = "Checking releases…";
      const release = await getLatestHostedRelease(source);
      if (!release) { status.textContent = "The source product has no hosted release yet."; return; }
      if (release.id === ad.releaseId) { status.textContent = "The link already uses the latest release."; return; }
      Object.assign(ad,{releaseId:release.id,sourceUrl:release.url,version:String(release.version)});
      rebuild();
      $("#ad-release-state").textContent = "Updated the campaign link. Review the copy and scenes for any product changes.";
    } catch (error) { toast(error.message || "Couldn’t prepare this export."); }
  });
}
