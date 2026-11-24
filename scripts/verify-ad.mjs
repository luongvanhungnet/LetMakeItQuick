import {readFile} from "node:fs/promises";
import {chromium,firefox,webkit} from "playwright";

const [videoFile,captionsFile,...flags] = process.argv.slice(2);
if (!/\.(mp4|webm)$/i.test(videoFile || "") || !/\.vtt$/i.test(captionsFile || "")) {
  throw Error("Usage: node scripts/verify-ad.mjs video.mp4 captions.vtt [--audio]");
}
const media = (await readFile(videoFile)).toString("base64");
const captions = await readFile(captionsFile,"utf8");
const expectedDuration=Number(flags.find(flag=>flag.startsWith("--seconds="))?.slice(10));
const mime = /\.mp4$/i.test(videoFile) ? "video/mp4" : "video/webm";
for (const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  let browser,page;
  try {
    const executablePath = process.env["LAUNCHPAD_"+name.toUpperCase()+"_BROWSER"];
    browser = await engine.launch({executablePath,...(name==="firefox" && process.env.LAUNCHPAD_FIREFOX_AUDIO_BACKEND ? {firefoxUserPrefs:{"media.cubeb.backend":process.env.LAUNCHPAD_FIREFOX_AUDIO_BACKEND}} : {})});
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route("https://playback.test/",route=>route.fulfill({contentType:"text/html",
      body:'<html lang="en"><title>Playback verification</title><video playsinline></video><button>Play</button></html>'}));
    await page.goto("https://playback.test/");
    await page.evaluate(({media,captions,mime,audio})=>{
      const video = document.querySelector("video");
      const bytes = Uint8Array.from(atob(media),c=>c.charCodeAt(0));
      video.preload="auto";
      video.src = URL.createObjectURL(new Blob([bytes],{type:mime}));
      const track = document.createElement("track");
      track.kind = "captions";
      track.srclang = "en";
      track.default = true;
      track.src = URL.createObjectURL(new Blob([captions],{type:"text/vtt"}));
      video.append(track);
      track.track.mode = "showing";
      track.track.oncuechange=()=>{ if (track.track.activeCues?.length) window.observed.caption=true; };
      window.needAudio = audio;
      window.observed = {played:false,caption:false,peak:0};
      video.addEventListener("playing",()=>{ observed.played=true; });
      document.querySelector("button").onclick = async ()=>{
        try {
          const playing=video.play();
          if (audio) {
            const ctx=new OfflineAudioContext(1,48000,48000);
            const decoded=await ctx.decodeAudioData(bytes.buffer.slice(0));
            for (const sample of decoded.getChannelData(0)) observed.peak=Math.max(observed.peak,Math.abs(sample));
          }
          await playing;
          function sample() {
            if (track.track.activeCues?.length) observed.caption=true;
            if (!video.ended) requestAnimationFrame(sample);
          }
          sample();
        } catch (error) { observed.error=error.message; }
      };
    },{media,captions,mime,audio:flags.includes("--audio")});
    await page.waitForFunction(()=>document.querySelector("video").videoWidth>0 || document.querySelector("video").error);
    const metadata = await page.evaluate(()=>{
      const video=document.querySelector("video");
      return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,error:video.error?.message || null};
    });
    if (metadata.error || !Number.isFinite(metadata.duration) || !metadata.width) throw Error("Invalid video metadata: "+JSON.stringify(metadata));
    if (expectedDuration>0 && Math.abs(expectedDuration-metadata.duration)>Math.max(.6,expectedDuration*.08)) throw Error("Export duration differs from the timeline: "+metadata.duration);
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
    const state=await page?.evaluate(()=>{
      const video=document.querySelector("video"), track=document.querySelector("track");
      return video ? {ready:video.readyState,duration:video.duration,width:video.videoWidth,time:video.currentTime,
        audioState:window.testAudio?.state,paused:video.paused,ended:video.ended,mediaError:video.error?.message,trackState:track?.readyState,cues:track?.track.cues?.length,observed:window.observed} : null;
    }).catch(()=>null);
    console.error(name+": "+error.message,JSON.stringify(state));
  } finally { await browser?.close(); }
}
