import {test as base, expect, chromium} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

function monitor(context,diagnostics) {
  context.on("page",page => {
    page.on("pageerror",error => diagnostics.push(error.message));
    page.on("console",message => {
      if (["error","warning"].includes(message.type())) diagnostics.push(message.text());
    });
  });
  context.on("requestfailed",request => {
    const error = request.failure().errorText;
    if (request.url().startsWith("blob:") && error === "net::ERR_ABORTED") return;
    diagnostics.push(request.url() + " " + error);
  });
}
const test = base.extend({
  diagnostics:[async ({context},use) => {
    const diagnostics = [];
    monitor(context,diagnostics);
    await use(diagnostics);
    expect(diagnostics).toEqual([]);
  },{auto:true}]
});
const draftKey = "launchpad-projects-v1";
const action = (page,name) => page.locator('#view [data-action="'+name+'"]');
const preview = page => page.frameLocator("#preview");
const sharedView = page => page.frameLocator(".published-view");
const draft = page => page.evaluate(key => JSON.parse(localStorage.getItem(key))[0],draftKey);

async function create(page,type,name,template) {
  await page.goto("/");
  if (template) await page.locator('[data-action="pick"][data-id="'+template+'"]').click();
  else {
    await page.locator(".sidebar [data-action=new]").click();
    await page.locator('dialog [data-id="'+type+'"]').click();
  }
  await page.locator("#new-project input").fill(name);
  await page.getByRole("button",{name:"Create project",exact:true}).click();
  await expect(page.locator(".project-heading")).toContainText(name);
}
async function reopen(page,name) {
  await page.reload();
  await page.locator(".top-actions [data-action=projects]").click();
  await page.getByRole("button",{name:new RegExp(name)}).click();
  await expect(page.locator(".project-heading h1")).toHaveText(name);
}
async function publish(page) {
  await action(page,"publish").click();
  const link = await page.locator("#share-link").inputValue();
  await page.getByRole("button",{name:"Close dialog"}).click();
  return link;
}
async function download(page,actionName,path) {
  const [file] = await Promise.all([page.waitForEvent("download"),action(page,actionName).click()]);
  await file.saveAs(path(file.suggestedFilename()));
  return file.suggestedFilename();
}
async function openFile(context,url) {
  const page = await context.newPage();
  const external = [];
  page.on("request",request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.goto(pathToFileURL(url).href);
  return {page,external};
}
async function addPage(page,name) {
  await action(page,"add-page").click();
  await page.locator("#page-form input").fill(name);
  await page.locator("#page-form button").click();
  return page.locator("#page-select").inputValue();
}
function mode(page,name) {
  return page.locator('#view [data-action=editor-mode][data-id="'+name+'"]');
}

test("website page navigation, cleanup, responsive preview, draft, snapshot and offline HTML",async ({page,context},info) => {
  await create(page,"web","Pages · 星","studio");
  const about = await addPage(page,"About");
  await action(page,"rename-page").click();
  await page.locator("#page-form input").fill("About us");
  await page.locator("#page-form button").click();
  await expect(preview(page).getByRole("heading",{name:"About",exact:true,level:1})).toBeVisible();
  const last = await addPage(page,"Contact");
  for (let index=3;index<=11;index++) await addPage(page,"Page "+index);
  await expect(action(page,"add-page")).toBeDisabled();
  await expect(page.locator("#page-select option")).toHaveCount(12);
  await page.locator("#page-select").selectOption("home");
  await page.locator("[name=buttonTarget]").selectOption(about);
  await mode(page,"blocks").click();
  await page.locator("[data-tool=button]").click();
  await page.locator("[data-property=a]").fill("Contact button");
  await page.locator("[data-property=b]").fill("https://example.com/contact");
  await page.locator("[data-property=pageTarget]").selectOption(last);
  await expect(preview(page).getByRole("link",{name:"Contact button"})).toHaveAttribute("href","#page-"+last);
  await page.locator("#page-select").selectOption(last);
  await action(page,"remove-page").click();
  await page.locator("#confirm-remove-page").click();
  await expect(preview(page).getByRole("link",{name:"Contact button"})).toHaveAttribute("href","https://example.com/contact");
  await page.locator("#page-select").selectOption(about);
  await action(page,"remove-page").click();
  await page.locator("#confirm-remove-page").click();
  await mode(page,"settings").click();
  await expect(page.locator("[name=buttonTarget]")).toHaveValue("");
  const services = await addPage(page,"Services");
  await page.locator("#page-select").selectOption("home");
  await page.locator("[name=buttonTarget]").selectOption(services);
  const mainButton = preview(page).getByRole("link",{name:"Explore our work"});
  await expect(mainButton).toHaveAttribute("href","#page-"+services);
  await mainButton.click();
  await expect(preview(page).getByRole("heading",{name:"Services"})).toBeVisible();
  await action(page,"mobile").click();
  const mobile = await page.locator("#preview").boundingBox();
  expect(mobile.width).toBeLessThanOrEqual(360);
  await action(page,"desktop").click();
  const desktop = await page.locator("#preview").boundingBox();
  const editor = await page.locator("#editor-body").boundingBox();
  expect(desktop.width).toBeGreaterThan(mobile.width);
  expect(desktop.x).toBeGreaterThan(editor.x+editor.width);
  await page.setViewportSize({width:390,height:844});
  const editorMobile = await page.locator("#editor-body").boundingBox();
  expect((await page.locator("#preview").boundingBox()).y).toBeGreaterThan(editorMobile.y+editorMobile.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({width:1440,height:1000});
  await reopen(page,"Pages · 星");
  const p = await draft(page);
  expect(p.buttonTarget).toBe(services);
  expect(p.blocks[0]).not.toHaveProperty("pageTarget");
  const link = await publish(page);
  await download(page,"download",name => info.outputPath(name));
  const shared = await context.newPage();
  await shared.goto(link);
  await sharedView(shared).getByRole("link",{name:"Explore our work"}).click();
  await expect(sharedView(shared).getByRole("heading",{name:"Services"})).toBeVisible();
  const {page:offline,external} = await openFile(context,info.outputPath("pages.html"));
  await offline.getByRole("link",{name:"Explore our work"}).click();
  await expect(offline.getByRole("heading",{name:"Services"})).toBeVisible();
  await offline.getByRole("link",{name:"Home",exact:true}).click();
  await expect(offline.getByRole("link",{name:"Contact button"})).toHaveAttribute("href","https://example.com/contact");
  expect(external).toEqual([]);
});


test("mobile app interactive blocks keep independent state in preview, published view and offline HTML",async ({page,context},info) => {
  await create(page,"app","Field notes");
  await addPage(page,"Second screen");
  await page.locator("#page-select").selectOption("home");
  await mode(page,"blocks").click();
  for (const type of ["checklist","checklist","counter","counter","faq","faq"]) {
    await page.locator('[data-tool="'+type+'"]').click();
  }
  async function interact(surface) {
    const lists = surface.locator("[data-checklist]");
    const counters = surface.locator("[data-counter]");
    const details = surface.locator(".lp-block details");
    await expect(details).toHaveCount(2);
    await lists.nth(0).getByRole("checkbox").first().check();
    await expect(lists.nth(1).getByRole("checkbox").first()).not.toBeChecked();
    await counters.nth(0).getByRole("button",{name:"Increase Count"}).click();
    await expect(counters.nth(0).locator("output")).toHaveText("1");
    await expect(counters.nth(1).locator("output")).toHaveText("0");
    await details.nth(0).locator("summary").click();
    await expect(details.nth(0)).toHaveAttribute("open","");
    await expect(details.nth(1)).not.toHaveAttribute("open","");
    await surface.getByRole("link",{name:"Second screen",exact:true}).click();
    await expect(surface.getByRole("heading",{name:"Second screen",level:1})).toBeVisible();
    await surface.getByRole("link",{name:"Home",exact:true}).click();
    await expect(lists.nth(0).getByRole("checkbox").first()).toBeChecked();
    await expect(counters.nth(0).locator("output")).toHaveText("1");
    await expect(details.nth(0)).toHaveAttribute("open","");
  }
  await interact(preview(page));
  await reopen(page,"Field notes");
  await expect(page.locator("#block-count")).toHaveText("6 / 30 blocks");
  const link = await publish(page);
  const name = await download(page,"download",file => info.outputPath(file));
  const shared = await context.newPage();
  await shared.goto(link);
  await interact(sharedView(shared));
  await shared.reload();
  await expect(sharedView(shared).locator("[data-checklist]").first().getByRole("checkbox").first()).toBeChecked();
  const {page:offline,external} = await openFile(context,info.outputPath(name));
  await interact(offline);
  expect(external).toEqual([]);
});

test("legacy single-page drafts and snapshots open with Unicode, preview and resave",async ({page,context}) => {
  const legacy = {type:"web",template:"studio",id:"legacy",name:"Legacy 🌱",title:"Older headline",intro:"Hello",button:"Visit",section:"Details",details:"Description",color:"#615543"};
  await page.goto("/");
  await page.evaluate(({key,legacy})=>localStorage.setItem(key,JSON.stringify([null,legacy])),{key:draftKey,legacy});
  await reopen(page,"Legacy 🌱");
  await expect(preview(page).getByRole("heading",{name:"Older headline"})).toBeVisible();
  await expect(page.locator("#page-select option")).toHaveCount(1);
  const {id,...data} = legacy;
  const shared = await context.newPage();
  await shared.goto("/#view="+Buffer.from(JSON.stringify(data)).toString("base64url"));
  await expect(sharedView(shared).getByRole("heading",{name:"Older headline"})).toBeVisible();
  await mode(page,"settings").click();
  await page.locator("[name=title]").fill("Updated title");
  await reopen(page,"Legacy 🌱");
  await expect(preview(page).getByRole("heading",{name:"Updated title"})).toBeVisible();
});


async function place(page,asset,cells) {
  await page.locator("#sprite-search").clear();
  const tool = page.locator('[data-sprite="'+asset+'"]');
  const name = await tool.locator("span").textContent();
  await page.locator("#sprite-search").fill(name);
  await tool.click();
  for (const cell of cells) await page.locator('[data-cell="'+cell+'"]').click();
}

test.describe("Touch-enabled editor",() => {
  test.use({hasTouch:true});
  test("2D level placement, collision, timer, hazards, keyboard and touch across all surfaces",async ({page,browser,diagnostics},info) => {
    await create(page,"game","Board run");
    await page.locator("#game-erase").click();
    await page.locator("[data-cell='142']").click();
    await place(page,"basalt-gate",[20]);
    await place(page,"basalt-wall",[18]);
    await place(page,"amber-crystal",[35]);
    await place(page,"bramble-trap",[16]);
    await place(page,"fern-gremlin",[72]);
    await expect(page.locator("[data-cell='72']")).toHaveAccessibleName(/Fern Gremlin/i);
    await page.locator("#game-time").fill("1");
    const game = page.locator("#live-game");
    const board = game.locator("canvas");
    await board.press("ArrowRight");
    await expect(game.locator("#play-status")).toHaveText("Time’s up.");
    await game.getByRole("button",{name:"Restart"}).click();
    await board.press("ArrowLeft");
    await expect(game.locator("#play-status")).toHaveText("You hit an obstacle.");
    await page.locator("#game-time").fill("0");
    async function solve(surface, touch) {
      const canvas = surface.locator("canvas");
      const directions = ["Right","Down","Right","Right","Right","Up"];
      for (const direction of directions) {
        if (touch) await surface.getByRole("button",{name:direction,exact:true}).tap();
        else await canvas.press("Arrow"+direction);
        if (direction === "Down") await expect(surface.locator("#play-score")).toHaveText("0 / 1 collected");
      }
      await expect(surface.locator("#play-score")).toHaveText("1 / 1 collected");
      await expect(surface.locator("#play-status")).toHaveText("Level complete!");
    }
    await solve(game,false);
    await game.getByRole("button",{name:"Restart"}).click();
    await solve(game,true);
    await game.screenshot({path:info.outputPath("2d-win.png")});
    await reopen(page,"Board run");
    await expect(page.locator("#game-time")).toHaveValue("0");
    expect((await draft(page)).game.cells).toMatchObject({17:"lilac-explorer",18:"basalt-wall",20:"basalt-gate",35:"amber-crystal",72:"fern-gremlin"});
    const link = await publish(page);
    const filename = await download(page,"download",name => info.outputPath(name));
    const touch = await browser.newContext({hasTouch:true,viewport:{width:390,height:844},recordVideo:{dir:info.outputPath("capture")}});
    monitor(touch,diagnostics);
    const shared = await touch.newPage();
    try {
      await shared.goto(link);
      const publishedGame = shared.locator("#published");
      await solve(publishedGame,true);
      await publishedGame.getByRole("button",{name:"Restart"}).click();
      await solve(publishedGame,false);
    } finally { await touch.close(); }
    await shared.video().saveAs(info.outputPath("2d-playthrough.webm"));
    const {page:offline,external} = await openFile(page.context(),info.outputPath(filename));
    const offlineGame = offline.locator(".game-play");
    await solve(offlineGame,false);
    await offlineGame.getByRole("button",{name:"Restart"}).click();
    await solve(offlineGame,true);
    expect(external).toEqual([]);
  });
});

function installWebGLProbe() {
  const proto = WebGLRenderingContext.prototype;
  for (const name of ["getUniformLocation","uniform3f","uniform2f","bufferData"]) {
    const original = proto[name];
    proto[name] = function(...args) {
      const result = original.apply(this,args);
      const state = this.canvas.probe ??= {};
      if (name === "getUniformLocation" && args[1] === "uEye") state.eyeLocation = result;
      if (name === "getUniformLocation" && args[1] === "uYaw") state.yawLocation = result;
      if (name === "uniform3f" && args[0] === state.eyeLocation) {
        state.eye = args.slice(1);
        if (state.stopStrafe && state.eye[0] >= state.stopStrafe) {
          document.dispatchEvent(new KeyboardEvent("keyup",{key:"d"}));
          state.stopStrafe = null;
        }
      }
      if (name === "uniform2f" && args[0] === state.yawLocation) state.yaw = args.slice(1);
      if (name === "bufferData" && args[2] === this.STATIC_DRAW) {
        const vertices = args[1];
        state.height = Math.max(...vertices.filter((_,index)=>index%6===1 &&
          vertices[index-1] >= 1 && vertices[index-1] <= 2 && vertices[index+1] >= 2 && vertices[index+1] <= 3));
      }
      return result;
    };
  }
}

test("3D real WebGL depth, wall height, continuous collision and completion in editor, snapshot and offline",async ({page,context,browser,diagnostics},info) => {
  await context.addInitScript(installWebGLProbe);
  await create(page,"game3d","Vault run");
  await page.locator("#game-erase").click();
  await page.locator("[data-cell='142']").click();
  await place(page,"basalt-gate",[50]);
  await place(page,"basalt-wall",[33]);
  await place(page,"amber-crystal",[34]);
  const canvas = page.locator("#live-game canvas");
  const maxHeight = () => canvas.evaluate(node => node.probe?.height);
  await expect.poll(maxHeight).toBeCloseTo(1.67);
  await page.locator("#wall-height").selectOption("3");
  await expect.poll(maxHeight).toBeCloseTo(2.77);
  async function solve(surface,{mouse}) {
    const game = surface.locator(".game-play"), board = game.locator("canvas");
    const owner = surface.page();
    const eye = () => board.evaluate(node => node.probe?.eye);
    const yaw = () => board.evaluate(node => node.probe?.yaw);
    const gpu = await board.evaluate(node => {
      const gl = node.getContext("webgl");
      return {
        depth:gl.isEnabled(gl.DEPTH_TEST),bits:gl.getParameter(gl.DEPTH_BITS),
        linked:gl.getProgramParameter(gl.getParameter(gl.CURRENT_PROGRAM),gl.LINK_STATUS),
        information:gl.getProgramInfoLog(gl.getParameter(gl.CURRENT_PROGRAM)),error:gl.getError()
      };
    });
    expect(gpu).toMatchObject({depth:true,linked:true,information:"",error:0});
    expect(gpu.bits).toBeGreaterThanOrEqual(16);
    await expect.poll(eye).toEqual([1.5,1.25,1.5]);
    if (mouse) {
      const box = await board.boundingBox(), x = box.x+box.width/2,y = box.y+box.height/2;
      await owner.mouse.move(x,y);
      await owner.mouse.down();
      await owner.mouse.move(x+75,y+22,{steps:4});
      await owner.mouse.up();
      await expect.poll(async()=> (await yaw())[1]).toBeGreaterThan(.4);
      await game.getByRole("button",{name:"Restart"}).click();
    }
    await board.focus();
    await owner.keyboard.down("w");
    await expect.poll(async()=> (await eye())[2]).toBeGreaterThan(1.66);
    await owner.waitForTimeout(300);
    expect((await eye())[2]).toBeLessThan(1.781);
    await owner.keyboard.up("w");
    await board.evaluate(node => { node.probe.stopStrafe = 2.47; });
    await owner.keyboard.down("d");
    await expect.poll(async()=> (await eye())[0]).toBeGreaterThan(2.46);
    expect((await eye())[0]).toBeLessThan(2.78);
    await owner.keyboard.up("d");
    await owner.keyboard.down("w");
    await expect(game.locator("#play-score")).toHaveText("1 / 1 collected");
    await expect(game.locator("#play-status")).toHaveText("Level complete!");
    await owner.keyboard.up("w");
  }
  await solve(page.locator("#live-game"),{mouse:true});
  await canvas.screenshot({path:info.outputPath("3d-win.png")});
  await reopen(page,"Vault run");
  await expect(page.locator("#wall-height")).toHaveValue("3");
  const link = await publish(page);
  const name = await download(page,"download",file => info.outputPath(file));
  const recorded = await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:info.outputPath("capture")}});
  monitor(recorded,diagnostics);
  await recorded.addInitScript(installWebGLProbe);
  const shared = await recorded.newPage();
  try {
    await shared.goto(link);
    await solve(shared.locator("#published"),{mouse:false});
  } finally { await recorded.close(); }
  await shared.video().saveAs(info.outputPath("3d-playthrough.webm"));
  const {page:offline,external} = await openFile(context,info.outputPath(name));
  await solve(offline.locator("body"),{mouse:false});
  expect(external).toEqual([]);
});

test("3D shows an actionable fallback when WebGL cannot start",async ({page}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type,...options) {
      return type === "webgl" ? null : getContext.call(this,type,...options);
    };
  });
  await create(page,"game3d","Fallback");
  await expect(page.locator("#play-status")).toContainText("This game needs WebGL");
});


async function inspectRecording(page,path,expected,width,height) {
  await page.goto(pathToFileURL(path).href);
  const result = await page.locator("video").evaluate(async video => {
    if (video.readyState < 2) await new Promise((resolve,reject)=>{
      video.addEventListener("loadeddata",resolve,{once:true});
      video.addEventListener("error",()=>reject(Error("Recording could not decode.")),{once:true});
    });
    await video.play();
    await new Promise(resolve=>video.requestVideoFrameCallback(resolve));
    video.pause();
    video.currentTime = 1.25;
    await new Promise(resolve=>video.addEventListener("seeked",resolve,{once:true}));
    return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,time:video.currentTime,
      decoded:video.getVideoPlaybackQuality().totalVideoFrames};
  });
  expect(result).toMatchObject({width,height,time:1.25});
  expect(result.duration).toBeGreaterThan(expected-.5);
  expect(result.duration).toBeLessThan(expected+.5);
  expect(result.decoded).toBeGreaterThan(0);
  return result;
}

test("video timeline trims and seeks, previews each aspect ratio, records playable MP4 and exports offline HTML",async ({page,context},info) => {
  await page.addInitScript(() => {
    const Generator = window.MediaStreamTrackGenerator;
    window.exportedTracks = [];
    if (Generator) window.MediaStreamTrackGenerator = class extends Generator {
      constructor(options) { super(options); exportedTracks.push(this); }
    };
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source,...args) {
      if (source instanceof HTMLVideoElement && !source.seeking) {
        this.canvas.clipTime = source.currentTime;
        this.canvas.clipDuration = source.duration;
      }
      return original.call(this,source,...args);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text,...args) {
      (this.canvas.renderedText ??= new Set()).add(text);
      return fillText.call(this,text,...args);
    };
  });
  await create(page,"video","Trimmed reel","studio-promo");
  await page.locator("[data-scene='2']").click();
  await page.locator("[data-scene-action=remove]").click();
  await page.locator("[data-scene='0']").click();
  await page.locator("[data-prop=title]").fill("Trimmed motion");
  await page.locator("[data-prop=caption]").fill("Caption on a clip");
  await page.locator("[data-prop=duration]").fill("2");
  await page.locator("[data-prop=trim]").fill("99");
  await page.locator("[data-prop=trim]").blur();
  await expect(page.locator("[data-prop=trim]")).toHaveValue("4");
  await expect(page.locator("[data-prop=duration]")).toHaveAttribute("max","2");
  await page.locator("[data-prop=trim]").fill("2");
  await page.locator("[data-prop=transition]").selectOption("fade");
  const clipCanvas = page.locator("#live-video canvas");
  await expect.poll(()=>clipCanvas.evaluate(canvas=>canvas.clipTime)).toBeCloseTo(2,1);
  expect(await clipCanvas.evaluate(canvas=>canvas.clipDuration)).toBeCloseTo(6,1);
  expect(await clipCanvas.evaluate(canvas=>[...canvas.renderedText])).toEqual(expect.arrayContaining(["Trimmed motion","Caption on a clip"]));
  await page.locator("[data-scene='1']").click();
  await page.locator("[data-prop=title]").fill("Image scene");
  await page.locator("[data-prop=caption]").fill("Lower third caption");
  await page.locator("[data-prop=layout]").selectOption("lower");
  await page.locator("[data-prop=duration]").fill("1");
  await page.locator("[data-prop=transition]").selectOption("cut");
  await page.locator("[data-scene-action=up]").click();
  await expect(page.locator("[data-scene] strong")).toHaveText(["Image scene","Trimmed motion"]);
  const canvas = page.locator("#live-video canvas");
  for (const [format,width,height] of [["square","720","720"],["vertical","540","960"],["wide","960","540"],["square","720","720"]]) {
    await page.locator("#video-format").selectOption(format);
    await expect(canvas).toHaveAttribute("width",width);
    await expect(canvas).toHaveAttribute("height",height);
  }
  await page.locator("#live-video button").click();
  await expect(page.locator("#live-video output")).toHaveText("0:03 / 0:03");
  await reopen(page,"Trimmed reel");
  expect((await draft(page)).video.scenes).toMatchObject([
    {asset:"interior-photo",title:"Image scene",duration:1,transition:"cut"},
    {asset:"studio-motion",title:"Trimmed motion",trim:2,duration:2,transition:"fade"}
  ]);
  await page.locator("#live-video canvas").screenshot({path:info.outputPath("video-preview.png")});
  const link = await publish(page);
  const shared = await context.newPage();
  const clipResponses = [];
  shared.on("response",response => {
    if (response.url().includes("/media/clips/")) clipResponses.push(response);
  });
  await shared.goto(link);
  await expect(shared.locator(".published-video canvas")).toHaveAttribute("width","720");
  await shared.getByRole("button",{name:"Play",exact:true}).click();
  await expect(shared.locator(".published-video output")).toHaveText("0:03 / 0:03");
  expect(clipResponses.some(response=>response.status() === 206 && /^bytes /.test(response.headers()["content-range"]))).toBeTruthy();
  await shared.close();
  await page.bringToFront();

  const recording = page.waitForEvent("download");
  await action(page,"export-video").click();
  await expect(page.locator("#video-export-status")).toHaveText("Rendering video…");
  await expect.poll(async()=>Number(await page.locator("#video-export-progress").getAttribute("value"))).toBeGreaterThan(.05);
  const file = await recording;
  const extension = file.suggestedFilename().split(".").at(-1);
  expect(extension).toBe("mp4");
  expect(await page.evaluate(()=>exportedTracks.map(track=>track.readyState))).toEqual(["ended"]);
  const path = info.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(5000);
  expect(bytes.subarray(4,8).toString()).toBe("ftyp");
  const playback = await context.newPage();
  const media = await inspectRecording(playback,path,3,720,720);
  await playback.goto("/");
  const frames = await playback.evaluate(async encoded => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded),char=>char.charCodeAt(0))],{type:"video/mp4"}));
    await new Promise((resolve,reject) => {
      video.addEventListener("loadeddata",resolve,{once:true});
      video.addEventListener("error",reject,{once:true});
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const ctx = canvas.getContext("2d",{willReadFrequently:true});
    const samples = [];
    for (const time of [.5,.99,1.04,1.09,1.14,1.19,1.8,video.duration-.18,video.duration-.12,video.duration-.06]) {
      const seek = new Promise(resolve=>video.addEventListener("seeked",resolve,{once:true}));
      video.currentTime = time;
      await seek;
      ctx.drawImage(video,0,0,24,24);
      const pixels = ctx.getImageData(0,0,24,24).data;
      samples.push(pixels.reduce((sum,value,index)=>index%4===3 ? sum : sum+value,0)/(24*24*3));
    }
    URL.revokeObjectURL(video.src);
    return samples;
  },bytes.toString("base64"));
  expect(frames[0]).toBeGreaterThan(30);
  expect(Math.min(...frames.slice(1,6))).toBeLessThan(frames[6]*.7);
  expect(Math.min(...frames.slice(7))).toBeLessThan(frames[6]*.86);
  await info.attach("mp4-verification",{body:JSON.stringify({...media,size:bytes.length}),contentType:"application/json"});

  const name = await download(page,"download",file => info.outputPath(file));
  const {page:offline,external} = await openFile(context,info.outputPath(name));
  await offline.getByRole("button",{name:"Play",exact:true}).click();
  await expect(offline.locator(".video-player output")).toHaveText("0:03 / 0:03");
  expect(external).toEqual([]);
});

test("video WebM fallback has a finite duration and cancellation stops all capture tracks",async ({page,context},info) => {
  await page.addInitScript(() => {
    const supports = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = type => !type.startsWith("video/mp4") && supports(type);
    const capture = HTMLCanvasElement.prototype.captureStream;
    window.captureTracks = [];
    window.MediaStreamTrackGenerator = undefined;
    HTMLCanvasElement.prototype.captureStream = function(...args) {
      const stream = capture.apply(this,args);
      captureTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await create(page,"video","WebM fallback");
  await page.locator("[data-prop=transition]").selectOption("cut");
  await action(page,"export-video").click();
  await expect.poll(()=>page.evaluate(()=>captureTracks.length)).toBe(1);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>captureTracks.every(track=>track.readyState === "ended"))).toBeTruthy();
  const name = await download(page,"export-video",file => info.outputPath(file));
  expect(name).toBe("webm-fallback.webm");
  const path = info.outputPath(name);
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(0,4).toString("hex")).toBe("1a45dfa3");
  const media = await inspectRecording(await context.newPage(),path,3,960,540);
  expect(await page.evaluate(()=>captureTracks.every(track=>track.readyState === "ended"))).toBeTruthy();
  await info.attach("webm-verification",{body:JSON.stringify({...media,size:bytes.length}),contentType:"application/json"});
});

for (const aiMode of ["demo","gpt"]) test(aiMode+" AI follow-ups, dismiss, apply, reload and publication privacy",async ({page,context},info) => {
  await create(page,"web","Proposal lab");
  await page.locator("[data-tool=heading]").click();
  const otherPage = await addPage(page,"About");
  const marker = "private-chat-marker";
  await page.evaluate(({key,marker,otherPage})=>{
    const data = JSON.parse(localStorage.getItem(key));
    data[0].blocks[0].aiHistory = [{role:"user",text:marker}];
    const nestedPage = data[0].pages.find(page=>page.id === otherPage);
    nestedPage.aiHistory = [{role:"user",text:marker}];
    nestedPage.hideTemplate = {aiHistory:[{role:"user",text:marker}]};
    data[0].template = {aiHistory:[{role:"user",text:marker}]};
    localStorage.setItem(key,JSON.stringify(data));
  },{key:draftKey,marker,otherPage});
  await reopen(page,"Proposal lab");
  await mode(page,"chat").click();
  await page.locator("#chat-form select").selectOption(aiMode);
  async function send(message) {
    await page.locator("#chat-form textarea").fill(message);
    await page.getByRole("button",{name:"Send",exact:true}).click();
    await expect(page.getByRole("button",{name:"Apply changes",exact:true})).toBeVisible();
  }
  await send('Change the headline to "'+marker+'"');
  expect((await draft(page)).title).toBe("Welcome");
  await expect(preview(page).getByRole("heading",{name:"Welcome"})).toBeVisible();
  await page.getByRole("button",{name:"Dismiss",exact:true}).click();
  await expect(page.getByRole("button",{name:"Apply changes",exact:true})).toHaveCount(0);
  await send('Make it "New headline"');
  expect((await draft(page)).title).toBe("Welcome");
  await page.getByRole("button",{name:"Apply changes",exact:true}).click();
  await expect(preview(page).getByRole("heading",{name:"New headline"})).toBeVisible();
  expect((await draft(page)).title).toBe("New headline");
  await reopen(page,"Proposal lab");
  await mode(page,"chat").click();
  await expect(page.locator("#ai-transcript")).toContainText(marker);
  await expect(page.locator("#ai-transcript")).toContainText("Proposal dismissed.");
  await expect(page.locator("#ai-transcript")).toContainText("Applied to the project.");
  const link = await publish(page);
  const raw = Buffer.from(new URL(link).hash.slice(6),"base64url").toString();
  expect(raw).not.toContain("aiHistory");
  expect(raw).not.toContain(marker);
  expect(JSON.parse(raw).title).toBe("New headline");
  const name = await download(page,"download",file => info.outputPath(file));
  const html = await readFile(info.outputPath(name),"utf8");
  expect(html).not.toContain(marker);
  const shared = await context.newPage();
  await shared.goto(link);
  await expect(sharedView(shared).getByRole("heading",{name:"New headline"})).toBeVisible();
});


test("3D touch drag changes the camera and holding a touch control moves continuously",async ({browser,diagnostics,baseURL}) => {
  const context = await browser.newContext({hasTouch:true,viewport:{width:390,height:844}});
  monitor(context,diagnostics);
  await context.addInitScript(installWebGLProbe);
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.locator('[data-action=pick][data-id=orbit-3d]').click();
    await page.getByRole("button",{name:"Create project",exact:true}).click();
    const game = page.locator("#live-game"), canvas = game.locator("canvas");
    const cdp = await context.newCDPSession(page);
    async function gesture(type,points=[]) {
      await cdp.send("Input.dispatchTouchEvent",{type,touchPoints:points});
    }
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox(), x=box.x+box.width/2,y=box.y+box.height/2;
    await gesture("touchStart",[{x,y}]);
    await gesture("touchMove",[{x:x+60,y:y+12}]);
    await gesture("touchEnd");
    await expect.poll(()=>canvas.evaluate(node=>node.probe?.yaw?.[1])).toBeGreaterThan(.33);
    const start = await canvas.evaluate(node=>node.probe.eye);
    const forward = game.getByRole("button",{name:"Forward",exact:true});
    await forward.scrollIntoViewIfNeeded();
    const button = await forward.boundingBox();
    await gesture("touchStart",[{x:button.x+button.width/2,y:button.y+button.height/2}]);
    await expect.poll(async()=>{
      const next = await canvas.evaluate(node=>node.probe.eye);
      return Math.hypot(next[0]-start[0],next[2]-start[2]);
    }).toBeGreaterThan(.3);
    await gesture("touchEnd");
    await page.waitForTimeout(100);
    const released = await canvas.evaluate(node=>node.probe.eye);
    await page.waitForTimeout(150);
    expect(await canvas.evaluate(node=>node.probe.eye)).toEqual(released);
  } finally { await context.close(); }
});

base("3D renders a full 60-second representative SwiftShader play session",async ({baseURL},info) => {
  base.setTimeout(95000);
  const diagnostics = [];
  const browser = await chromium.launch({
    channel:"chromium",args:[...info.project.use.launchOptions.args,"--disable-frame-rate-limit","--disable-gpu-vsync"]
  });
  try {
    const context = await browser.newContext({baseURL,viewport:info.project.use.viewport});
    monitor(context,diagnostics);
    const page = await context.newPage();
    await create(page,"game3d","Performance run","orbit-3d");
    await page.locator("#game-time").fill("0");
    await page.locator("[data-action=focus-game]").first().click();
    const canvas = page.locator("#live-game canvas");
    await expect(canvas).toBeFocused();
    const metrics = await canvas.evaluate(canvas => new Promise(resolve => {
      const gl = canvas.getContext("webgl"), clear = gl.clear;
      const keys = ["w","ArrowRight","d","ArrowLeft","s","a"], times = [];
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      let previous, start, lastKey, finalKeyAt=0;
      gl.clear = function(...args) {
        const now = performance.now();
        start ??= now;
        if (previous !== undefined) times.push(now-previous);
        previous = now;
        const elapsed = now-start;
        if (elapsed-finalKeyAt > 850 || lastKey === undefined) {
          if (lastKey) document.dispatchEvent(new KeyboardEvent("keyup",{key:lastKey}));
          if (/caught|trap|complete|up\./i.test(document.querySelector("#live-game #play-status").textContent)) {
            document.querySelector("#live-game #restart").click();
            canvas.focus();
          }
          lastKey = keys[Math.floor(elapsed/850)%keys.length];
          canvas.dispatchEvent(new KeyboardEvent("keydown",{key:lastKey,bubbles:true}));
          finalKeyAt = elapsed;
        }
        const result = clear.apply(this,args);
        if (elapsed>=60000) {
          document.dispatchEvent(new KeyboardEvent("keyup",{key:lastKey}));
          gl.clear = clear;
          const sorted = times.slice().sort((a,b)=>a-b);
          resolve({
            renderer,browser:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],
            drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
            runtimeMs:Math.round(elapsed),frames:times.length,averageFPS:times.length*1000/elapsed,
            p95FrameMs:sorted[Math.ceil(sorted.length*.95)-1],
            maximumFrameMs:sorted.at(-1),stallsOver50ms:times.filter(ms=>ms>50).length
          });
        }
        return result;
      };
    }));
    await info.attach("swiftshader-performance",{body:JSON.stringify(metrics,null,2),contentType:"application/json"});
    await canvas.screenshot({path:info.outputPath("3d-orbit-reference.png")});
    expect(metrics.renderer).toContain("SwiftShader");
    expect(metrics.runtimeMs).toBeGreaterThanOrEqual(60000);
    expect(metrics.averageFPS).toBeGreaterThanOrEqual(55);
    expect(metrics.p95FrameMs).toBeLessThanOrEqual(22);
  } finally { await browser.close(); }
  expect(diagnostics).toEqual([]);
});


test("Demo AI updates the game HUD only after applying a timer proposal",async ({page}) => {
  await create(page,"game","Timer proposal");
  await mode(page,"chat").click();
  const score = page.locator("#live-game #play-score");
  await page.locator("#chat-form textarea").fill("Set a 30-second timer");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByRole("button",{name:"Apply changes",exact:true})).toBeVisible();
  await expect(score).toHaveText("0 / 0 collected");
  expect((await draft(page)).game.time).toBe(0);
  await page.getByRole("button",{name:"Apply changes",exact:true}).click();
  await expect(score).toHaveText("0 / 0 collected · 30s");
  expect((await draft(page)).game.time).toBe(30);
});

