import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

const key = "launchpad-projects-v1";
function wavSample() {
  const sampleRate = 8000, samples = 2400, data = Buffer.alloc(44+2*samples);
  data.write("RIFF"); data.writeUInt32LE(data.length-8,4); data.write("WAVEfmt ",8);
  data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22);
  data.writeUInt32LE(sampleRate,24); data.writeUInt32LE(2*sampleRate,28);
  data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write("data",36);
  data.writeUInt32LE(2*samples,40);
  for (let i=0;i<samples;i++) data.writeInt16LE(Math.floor(4500*Math.sin(2*Math.PI*440*i/sampleRate)),44+2*i);
  return {name:"test-tone.wav",mimeType:"audio/wav",buffer:data};
}

test("launch ad generates editable scenes, campaign copy, a thumbnail and captions",async ({page})=>{
  await page.goto("/");
  await page.evaluate(key=>{
    const project = {...blank("web"),id:crypto.randomUUID(),template:"blank",name:"Northstar",
      title:"Track progress",details:"Live status\nSimple reports",link:"https://example.test/product?ref=shop#demo"};
    localStorage.setItem(key,JSON.stringify([project]));
  },key);
  await page.reload();
  await page.locator(".top-actions [data-action=projects]").click();
  await page.getByRole("button",{name:/Northstar/}).click();
  await page.locator("[data-action=launch-ad]").click();
  const form = page.locator("#launch-ad-form");
  await form.getByLabel("Format").selectOption("vertical");
  await form.getByLabel("Channel").fill("Social Networks");
  await form.getByLabel("Product screenshots").setInputFiles("dist/media/interior.jpg");
  await form.getByRole("button",{name:"Create editable ad"}).click();
  await expect(form.locator("[role=status]")).toContainText("permission");
  await form.getByRole("checkbox").check();
  await form.getByRole("button",{name:"Create editable ad"}).click();
  await expect(page.locator(".project-heading h1")).toHaveText("Northstar launch ad");
  await expect(page.locator(".scene-card")).toHaveCount(4);
  await expect(page.locator("#live-video canvas")).toHaveAttribute("width","540");
  const link = new URL(await page.locator("#ad-campaign-link").inputValue());
  expect(Object.fromEntries(link.searchParams)).toEqual({
    ref:"shop",utm_source:"social-networks",utm_medium:"video",utm_campaign:"northstar",utm_content:"vertical"
  });
  expect(link.hash).toBe("#demo");
  const download = async (name,handler)=>{
    const [asset] = await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name}).click()]);
    await handler(await readFile(await asset.path()),asset.suggestedFilename());
  };
  await download("Download ad copy",(bytes,name)=>{
    expect(name).toContain("-copy.txt");
    expect(bytes.toString()).toContain(link.href);
  });
  await download("Download thumbnail",(bytes,name)=>{
    expect(name).toContain("-thumbnail.png");
    expect(bytes.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
  });
  await download("Download captions (.vtt)",(bytes,name)=>{
    expect(name).toMatch(/\.vtt$/);
    expect(bytes.toString()).toContain("00:00:00.000 --> 00:00:04.000\nTrack progress");
  });
  const recordingRights = page.locator("#video-audio-rights");
  const music = page.locator("[data-video-audio=music]");
  await music.setInputFiles(wavSample());
  await expect(page.locator("#video-audio-status")).toContainText("permission");
  await recordingRights.check();
  await music.setInputFiles(wavSample());
  await expect(page.getByText("test-tone.wav")).toBeVisible();
  await page.locator("#live-video").getByRole("button",{name:"Play",exact:true}).click();
  await expect(page.locator("#live-video output")).toContainText("0:01 /");
  await page.locator("#live-video").getByRole("button",{name:"Pause",exact:true}).click();
  const saved = await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0],key);
  expect(saved.launchAd.productName).toBe("Northstar");
  expect(saved.video.audio.music.rights).toBe(true);
  expect(Object.keys(saved.video.uploads)).toHaveLength(1);
});

test("video export mixes the approved audio into the downloadable file",async ({page})=>{
  await page.addInitScript(()=>{
    const supports = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = value=>!value.startsWith("video/mp4") && supports(value);
  });
  await page.goto("/");
  await page.evaluate(key=>{
    const project = {...blank("video"),id:crypto.randomUUID(),template:"blank",name:"Sound test",
      video:{format:"wide",scenes:[{...videoScene("","Sound test","",1),transition:"cut"}]}};
    localStorage.setItem(key,JSON.stringify([project]));
  },key);
  await page.reload();
  await page.locator(".top-actions [data-action=projects]").click();
  await page.getByRole("button",{name:/Sound test/}).click();
  await page.locator("#video-audio-rights").check();
  await page.locator("[data-video-audio=music]").setInputFiles(wavSample());
  await expect(page.getByText("test-tone.wav")).toBeVisible();
  const recording = page.waitForEvent("download");
  await page.locator("[data-action=export-video]").click();
  const asset = await recording;
  expect(asset.suggestedFilename()).toBe("sound-test.webm");
  const bytes = await readFile(await asset.path());
  const recorded = await page.evaluate(async encoded=>{
    const data = Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
    const audio = new AudioContext();
    try {
      const track = await audio.decodeAudioData(data.buffer);
      const pcm = track.getChannelData(0);
      let sum = 0;
      for (const sample of pcm) sum += sample*sample;
      return {duration:track.duration,amplitude:Math.sqrt(sum/pcm.length)};
    } finally { await audio.close(); }
  },bytes.toString("base64"));
  expect(recorded.duration).toBeGreaterThan(.75);
  expect(recorded.amplitude).toBeGreaterThan(.005);
});
