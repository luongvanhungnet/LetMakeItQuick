"use strict";

const releaseSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const releaseProjectPattern = /^[\w-]{1,85}$/;
const releaseTypes = ["web","app","game","game3d","video"];
const releaseBlockTypes = new Set(["heading","text","quote","list","stats","callout","image","video","audio",
  "button","faq","checklist","counter","progress","form","signin","records","downloads","integration","columns","divider","spacer"]);
const releaseObject = value => value && typeof value === "object" && !Array.isArray(value);
const releaseKeys = (value,keys) => releaseObject(value) && Object.keys(value).every(key=>keys.includes(key));

function releaseMeta(input = {}) {
  if (!input || typeof input !== "object") input = {};
  const text = (value,limit) => typeof value === "string" ? value.trim().slice(0,limit) : "";
  return {
    slug:text(input.slug,60).toLowerCase(),
    title:text(input.title,100),
    description:text(input.description,180),
    socialImage:text(input.socialImage,700),
    favicon:text(input.favicon,700),
    visibility:input.visibility === "public" ? "public" : "private",
    index:input.visibility === "public" && input.index === true,
    journey:["browse","signup","checkout","download"].includes(input.journey) ? input.journey : "browse"
  };
}

function releaseHTTPS(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}
function releaseLocalAsset(value) {
  return typeof value === "string" &&
    /^(?:\/?media\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:png|jpg|jpeg|webp|gif|avif|mp4|webm|mp3|ogg)|\/api\/workspace\/media\/[\w-]{1,100})$/i.test(value);
}
function releaseAssetURL(value) { return releaseLocalAsset(value) || releaseHTTPS(value); }

function releaseProjectFromSnapshot(code) {
  if (typeof code !== "string" || code.length > 190000 || !/^[\w-]+$/.test(code)) throw Error("Release exceeds the hosted snapshot size limit.");
  const bytes = Uint8Array.from(atob(code.replaceAll("-","+").replaceAll("_","/")),char=>char.charCodeAt(0));
  const project = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  if (!project || typeof project !== "object" || !releaseTypes.includes(project.type)) throw Error("Unsupported release project.");
  const fieldLimits = {name:70,title:100,intro:350,button:50,section:85,details:900,color:7};
  const fields = Object.keys(fieldLimits);
  const content = [...fields,"blocks","buttonTarget","hideTemplate"];
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  const validString = (value,limit) => typeof value === "string" && value.length<=limit;
  const validFields = (value,root) => Object.entries(fieldLimits).every(([key,max])=>
    (root && value[key] === undefined) || validString(value[key],key === "name" && !root ? 50 : max));
  const validContent = (value,root) => validFields(value,root) &&
    (value.hideTemplate === undefined || typeof value.hideTemplate === "boolean") &&
    (value.buttonTarget === undefined || validString(value.buttonTarget,36));
  const validBlocks = items => {
    if (items === undefined) return true;
    if (!Array.isArray(items) || items.length>30) return false;
    const seen = new Set();
    return items.every(item=>{
      if (!releaseKeys(item,["id","type","a","b","pageTarget","imageData","credit","license","fileData","fileName"]) ||
        typeof item.id !== "string" || !uuid.test(item.id) || seen.has(item.id) || !releaseBlockTypes.has(item.type) ||
        !validString(item.a,700) || !validString(item.b,700) ||
        (item.pageTarget !== undefined && (item.type !== "button" || !validString(item.pageTarget,36))) ||
        ((item.fileData !== undefined || item.fileName !== undefined) && (item.type !== "downloads" || !validString(item.fileName,100) || !item.fileName || /[\/\\\x00-\x1f]/.test(item.fileName) ||
          !validString(item.fileData,87384) || !item.fileData || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.fileData))) ||
        (item.imageData !== undefined && (item.type !== "image" || !validString(item.imageData,101024))) ||
        [item.credit,item.license].some(value=>value !== undefined && !validString(value,160))) return false;
      seen.add(item.id);
      return true;
    });
  };
  const type = project.type;
  const rootKeys = [...fields,"type","template","templateCredit",...(["web","app"].includes(type)
    ? ["pages","blocks","buttonTarget","hideTemplate"] : [type === "video" ? "video" : "game"])];
  const seen = new Set(["home"]);
  const validPage = page=>{
    if (!releaseKeys(page,["id",...content]) || typeof page.id !== "string" || !uuid.test(page.id) ||
      seen.has(page.id) || !validContent(page,false) || !page.name.trim() || !validBlocks(page.blocks)) return false;
    seen.add(page.id);
    return true;
  };
  const credit = project.templateCredit;
  if (!releaseKeys(project,rootKeys) || !validContent(project,true) || !validBlocks(project.blocks) ||
      (project.template !== undefined && !validString(project.template,140)) ||
      (project.pages !== undefined && (!Array.isArray(project.pages) || project.pages.length>11 || !project.pages.every(validPage))) ||
      (credit !== undefined && (!Array.isArray(credit) || credit.length>8 || !credit.every(item=>
        releaseKeys(item,["id","version","title","attribution","license"]) && typeof item.id === "string" && uuid.test(item.id) &&
        Number.isSafeInteger(item.version) && item.version>0 && ["CC0-1.0","CC-BY-4.0","MIT"].includes(item.license) &&
        validString(item.title,70) && validString(item.attribution,80))))) {
    throw Error("The release snapshot is malformed.");
  }
  if (type === "video") {
    const video = project.video;
    const sceneKeys = ["asset","title","caption","duration","trim","layout","transition","color"];
    const uploaded = (value,kind,limit) => validString(value,limit) &&
      /^(?:data:(image\/(?:png|jpeg|webp)|audio\/(?:mpeg|mp3|wav|wave|ogg|mp4|aac|x-m4a|webm));base64,)([a-z0-9+/]+={0,2})$/i
        .test(value) && value.startsWith("data:"+kind+"/");
    if (!releaseKeys(video,["format","scenes","uploads","audio"]) || !["wide","vertical","square"].includes(video.format) ||
      !Array.isArray(video.scenes) || !video.scenes.length || video.scenes.length>12 ||
      !video.scenes.every(scene=>releaseKeys(scene,sceneKeys) && validString(scene.asset,90) &&
        validString(scene.title,100) && validString(scene.caption,160) && typeof scene.color === "string" &&
        /^#[a-f0-9]{6}$/i.test(scene.color) && ["center","lower"].includes(scene.layout) && ["cut","fade"].includes(scene.transition) &&
        Number.isInteger(scene.duration) && scene.duration>=1 && scene.duration<=15 &&
        Number.isInteger(scene.trim) && scene.trim>=0 && scene.trim<=5 &&
        (!["forest-motion","studio-motion","coffee-motion"].includes(scene.asset) || scene.trim+scene.duration<=6)) ||
      (video.uploads !== undefined && (!releaseObject(video.uploads) || Object.keys(video.uploads).length>3 ||
        !Object.entries(video.uploads).every(([id,item])=>id.startsWith("screenshot-") && uuid.test(id.slice(11)) &&
          releaseKeys(item,["name","path"]) && validString(item.name,100) && uploaded(item.path,"image",150000)))) ||
      (video.audio !== undefined && (!releaseKeys(video.audio,["voice","music"]) ||
        !Object.values(video.audio).every(item=>releaseKeys(item,["name","path","rights","volume"]) && item.rights === true &&
          validString(item.name,100) && uploaded(item.path,"audio",300000) &&
          Number.isFinite(item.volume) && item.volume>=0 && item.volume<=1)))) throw Error("The video timeline is invalid.");
  }
  if (type === "game" || type === "game3d") {
    const game = project.game;
    if (!releaseKeys(game,["background","time","cells","wallHeight"]) || !validString(game.background,90) ||
      !Number.isInteger(game.time) || game.time<0 || game.time>600 ||
      (game.wallHeight !== undefined && ![1,2,3].includes(game.wallHeight)) ||
      !releaseObject(game.cells) || !Object.entries(game.cells).every(([index,id])=>
        /^(0|[1-9]\d{0,2})$/.test(index) && Number(index)<160 && validString(id,90))) throw Error("The game level is invalid.");
  }
  return project;
}

function releasePreflight(project,metadata,assetInfo) {
  const issues = [];
  const add = (severity,code,message,location) => issues.push({severity,code,message,location});
  const pages = [{...project,id:"home",name:"Home"},...(Array.isArray(project.pages) ? project.pages : [])];
  const pageIds = new Set(pages.map(page=>page.id));
  let external = false;
  function media(value,kind,location) {
    if (!releaseAssetURL(value)) { add("block","invalid-media","Choose a valid "+kind+" asset.",location); return; }
    if (!releaseLocalAsset(value)) external = true;
    else if (assetInfo) {
      const asset = assetInfo(value.replace(/^\//,""));
      if (!asset?.exists) add("block","missing-media","The "+kind+" asset is unavailable.",location);
      else if (asset.bytes > 512000) add("warn","large-media","This "+kind+" exceeds 500 KB. Check load time on mobile.",location);
    }
  }
  function publicText(value,location) {
    if (typeof value === "string" &&
        /\b(?:sk-(?:proj-|live_|test_)?[\w-]{22,}|gh[pousr]_[\w]{25,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)/.test(value)) {
      add("block","possible-secret","Remove the credential-looking value before staging a release.",location);
    }
  }

  if (!project.name?.trim?.()) add("block","name","Enter a project name.","Project");
  if (!releaseSlugPattern.test(metadata.slug) || metadata.slug.length < 3) add("block","slug","Choose a URL slug of at least three lowercase letters or digits, with single hyphens between words.","Release settings");
  if (!metadata.title) add("block","title","Enter a release title.","Release settings");
  if (!metadata.description) add("warn","description","Add a description for link previews and searches.","Release settings");
  for (const [key,label] of [["socialImage","social image"],["favicon","favicon"]]) {
    if (metadata[key]) media(metadata[key],label,"Release settings");
    else if (key === "socialImage") add("warn","social-image","Add a social preview image.","Release settings");
  }
  for (const key of ["title","description","socialImage","favicon"]) publicText(metadata[key],"Release settings");
  for (const page of pages) {
    const location = page.id === "home" ? "Home" : page.name || "Page";
    if (["web","app"].includes(project.type) && !page.hideTemplate && !page.title?.trim?.()) add("block","heading","Enter a headline or hide template content.",location);
    if (page.buttonTarget && !pageIds.has(page.buttonTarget)) add("block","page-link","The main button links to a missing page.",location);
    for (const key of ["name","title","intro","section","details","button"]) publicText(page[key],location);
    if (typeof page.color === "string" && /^#[a-f\d]{6}$/i.test(page.color) &&
        (!page.hideTemplate && page.button || page.blocks?.some?.(block=>block?.type === "button"))) {
      const rgb = [1,3,5].map(index=>parseInt(page.color.slice(index,index+2),16)/255)
        .map(part=>part <= .04045 ? part/12.92 : ((part+.055)/1.055)**2.4);
      const ratio = 1.05/(.05+rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722);
      if (ratio < 4.5) add("warn","contrast","White text on this button color may have insufficient contrast.",location);
    }
    for (const block of Array.isArray(page.blocks) ? page.blocks : []) {
      if (!block || typeof block !== "object") continue;
      publicText(block.a,location);
      publicText(block.b,location);
      publicText(block.credit,location);
      publicText(block.license,location);
      if (block.type === "button") {
        if (!block.a?.trim?.()) add("block","button-label","Give the button a visible label.",location);
        if (block.pageTarget) {
          if (!pageIds.has(block.pageTarget)) add("block","page-link","A button links to a missing page.",location);
        } else if (!releaseHTTPS(block.b)) add("block","external-link","A button needs a page destination or an HTTPS link.",location);
        else external = true;
      }
      if (["image","video","audio"].includes(block.type)) {
        if (block.type === "image" && block.imageData) {
          if (typeof block.imageData !== "string" || block.imageData.length > 101024 ||
              !/^data:image\/jpeg;base64,[a-zA-Z0-9+/]+={0,2}$/.test(block.imageData))
            add("block","invalid-image","Replace this uploaded image with a supported JPEG.",location);
        } else media(block.b,block.type,location);
        if (!block.a?.trim?.()) add("warn","media-label",block.type === "image" ? "Add alternative text when the image conveys meaning." : "Add an accessible media label.",location);
      }
      if (block.type === "form") {
        if (!block.a?.trim?.() || typeof block.b !== "string" || !block.b.trim()) add("block","form-fields","Give the form a heading and at least one labeled field.",location);
      }
      if (block.type === "downloads" && !block.fileData) media(block.b,"download",location);
      if (block.type === "integration" && !releaseHTTPS(block.b)) add("block","integration","An integration link must use HTTPS.",location);
    }
  }
  const baseImage = {"studio":"interior.jpg","summit":"forest.jpg","brew":"coffee.jpg","field-guide":"forest.jpg","atlas-launch":"interior.jpg"}[project.template];
  if (typeof baseImage === "string" && project.hideTemplate !== true) media("media/"+baseImage,"template image","Home");
  for (const item of project.templateCredit || []) { publicText(item.title,"Template credits"); publicText(item.attribution,"Template credits"); }
  if (Array.isArray(project.video?.scenes)) for (const scene of project.video.scenes) {
    publicText(scene?.title,"Video");
    publicText(scene?.caption,"Video");
    if (scene?.asset && !project.video.uploads?.[scene.asset]) {
      const clip = {"forest-motion":"forest","studio-motion":"interior","coffee-motion":"coffee"}[scene.asset];
      media(clip ? "media/clips/"+clip+".mp4" : scene.asset.endsWith("-photo")
        ? "media/"+scene.asset.slice(0,-6)+".jpg" : "media/library/"+scene.asset+".png","scene","Video");
    }
  }
  if (project.game?.cells && ["game","game3d"].includes(project.type)) {
    const tiles = Object.entries(project.game.cells);
    const spawns = tiles.filter(([,id])=>/-(explorer|robot|diver|pilot|ranger)$/.test(id));
    const gates = tiles.filter(([,id])=>id.endsWith("-gate"));
    if (spawns.length !== 1 || !gates.length) add("block","game-goal","Place one player spawn and at least one exit gate.","Game");
    for (const id of new Set(tiles.map(([,id])=>id))) media("media/library/"+id+".png","tile","Game");
    const bg = project.game.background;
    if (typeof bg === "string") media(bg.endsWith("-photo") ? "media/"+bg.slice(0,-6)+".jpg" : "media/library/"+bg+".png","background","Game");
    else add("block","background","Choose a background.","Game");
    if (spawns.length === 1 && gates.length) {
      const queue = [Number(spawns[0][0])], reached = new Set(queue);
      for (const id of queue) {
        const x = id%16, y = Math.floor(id/16);
        for (const [a,b] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
          const index = b*16+a;
          if (a<0 || a>=16 || b<0 || b>=10 || reached.has(index) || /-(wall|trap)$/.test(project.game.cells[index] || "")) continue;
          reached.add(index);
          queue.push(index);
        }
      }
      if (!gates.some(([index])=>reached.has(Number(index))) ||
          tiles.some(([index,id])=>/-(crystal|token)$/.test(id) && !reached.has(Number(index)))) {
        add("block","unreachable","A collectible or exit is unreachable from the spawn.","Game");
      }
    }
  }
  if (external) add("warn","remote-content","Staging checks approved external origins. Review destinations that require sign-in or use redirects.","External content");
  for (const [severity,code,message] of releaseJourneyChecks(project,metadata.journey)) add(severity,code,message,"Customer journey");
  return issues;
}

function releaseJourneyChecks(project,journey) {
  const blocks = [project,...(Array.isArray(project.pages)?project.pages:[])].flatMap(page=>Array.isArray(page.blocks)?page.blocks:[]);
  const checks = [];
  if (journey === "signup" && !blocks.some(block=>["form","signin"].includes(block?.type))) checks.push(["block","signup","Add a sign-in or signup form to test this journey."]);
  if (journey === "download" && !blocks.some(block=>["downloads","download"].includes(block?.type))) checks.push(["block","download","Add a downloads component to test this journey."]);
  if (journey === "checkout") checks.push(["warn","checkout","Run a sandbox purchase from the commerce workspace and check access, receipt, and refund before inviting customers."]);
  return checks;
}

function releaseSmoke(project,metadata,issues) {
  const blockers = issues.filter(issue=>issue.severity === "block");
  return {
    testedAt:new Date().toISOString(),
    journey:metadata.journey,
    checks:[
      {label:"Release artifact decodes",status:"passed"},
      {label:"Required content and local destinations",status:blockers.length ? "failed" : "passed"},
      {label:"Customer journey component",status:releaseJourneyChecks(project,metadata.journey).some(([severity])=>severity==="block") ? "failed" :
        metadata.journey === "checkout" ? "manual" : "passed"},
      {label:"Browser interaction and third-party services",status:"manual"}
    ],
    passed:!blockers.length
  };
}
