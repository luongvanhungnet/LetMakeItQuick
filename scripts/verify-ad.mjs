import {readFile} from "node:fs/promises";
import {chromium,firefox,webkit} from "playwright";

const [videoFile,captionsFile,...flags] = process.argv.slice(2);
if (!/\.(mp4|webm)$/i.test(videoFile || "") || !/\.vtt$/i.test(captionsFile || "")) {
  throw Error("Usage: node scripts/verify-ad.mjs video.mp4 captions.vtt [--audio]");
}
const media = (await readFile(videoFile)).toString("base64");
const captions = await readFile(captionsFile,"utf8");
const mime = /\.mp4$/i.test(videoFile) ? "video/mp4" : "video/webm";
for (const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  let browser;
  try {
    const executablePath = process.env["LAUNCHPAD_"+name.toUpperCase()+"_BROWSER"];
    browser = await engine.launch({executablePath});
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route("https://playback.test/",route=>route.fulfill({contentType:"text/html",
      body:'<html lang="en"><title>Playback verification</title><video playsinline></video><button>Play</button></html>'}));
    await page.goto("https://playback.test/");
    await page.evaluate(({media,captions,mime,audio})=>{
      const video = document.querySelector("video");
      const bytes = Uint8Array.from(atob(media),c=>c.charCodeAt(0));
      video.src = URL.createObjectURL(new Blob([bytes],{type:mime}));
      const track = document.createElement("track");
      track.kind = "captions";
      track.srclang = "en";
      track.default = true;
      track.src = URL.createObjectURL(new Blob([captions],{type:"text/vtt"}));
      video.append(track);
      track.track.mode = "showing";
      window.needAudio = audio;
      window.observed = {played:false,caption:false,peak:0};
      video.addEventListener("playing",()=>{ observed.played=true; });
      document.querySelector("button").onclick = async ()=>{
        try {
          let analyzer;
          if (audio) {
            const ctx = new AudioContext();
            await ctx.resume();
            analyzer = ctx.createAnalyser();
            ctx.createMediaElementSource(video).connect(analyzer);
            analyzer.connect(ctx.destination);
          }
          await video.play();
          const samples = new Float32Array(512);
          function sample() {
            if (track.track.activeCues?.length) observed.caption=true;
            if (analyzer) {
              analyzer.getFloatTimeDomainData(samples);
              for (const value of samples) observed.peak=Math.max(observed.peak,Math.abs(value));
            }
            if (!video.ended) requestAnimationFrame(sample);
          }
          sample();
        } catch (error) { observed.error=error.message; }
      };
    },{media,captions,mime,audio:flags.includes("--audio")});
    await page.waitForFunction(()=>document.querySelector("video").readyState>=1 || document.querySelector("video").error);
    const metadata = await page.evaluate(()=>{
      const video=document.querySelector("video");
      return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,error:video.error?.message || null};
    });
    if (metadata.error || !Number.isFinite(metadata.duration) || !metadata.width) throw Error("Invalid video metadata: "+JSON.stringify(metadata));
    await page.locator("button").click();
    await page.waitForFunction(()=>observed.error || (observed.played && observed.caption && (!window.needAudio || observed.peak>.001)));
    await page.waitForFunction(()=>document.querySelector("video").currentTime>.25);
    const moment=metadata.duration*.65;
    await page.evaluate(moment=>{
      const video=document.querySelector("video");
      video.pause();
      window.observed.sought=false;
      video.addEventListener("seeked",()=>{observed.sought=true},{once:true});
      video.currentTime=moment;
    },moment);
    await page.waitForFunction(()=>observed.sought);
    const result=await page.evaluate(()=>({...observed,seekTime:document.querySelector("video").currentTime,
      cues:document.querySelector("track").track.cues.length}));
    if (result.error || Math.abs(result.seekTime-moment)>.15 || !result.cues || (flags.includes("--audio") && result.peak<=.001)) {
      throw Error("Playback evidence failed: "+JSON.stringify(result));
    }
    console.log(JSON.stringify({engine:name,version:browser.version(),file:videoFile,...metadata,...result}));
  } catch (error) {
    process.exitCode=1;
    console.error(name+": "+error.message);
  } finally { await browser?.close(); }
}
