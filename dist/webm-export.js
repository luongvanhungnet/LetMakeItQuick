"use strict";

function webmInteger(value) {
  const bytes = [];
  do {
    bytes.unshift(value % 256);
    value = Math.floor(value/256);
  } while (value);
  return Uint8Array.from(bytes);
}
function webmElement(id,...chunks) {
  const size = chunks.reduce((total,chunk)=>total+chunk.byteLength,0);
  let width = 1;
  while (size >= 2 ** (7*width)-1) width++;
  const length = new Uint8Array(width);
  const encoded = webmInteger(size);
  length.set(encoded,width-encoded.length);
  length[0] |= 1 << (8-width);
  const tag = webmInteger(id);
  const element = new Uint8Array(tag.length+length.length+size);
  element.set(tag);
  element.set(length,tag.length);
  let index = tag.length+length.length;
  for (const chunk of chunks) {
    element.set(chunk,index);
    index += chunk.length;
  }
  return element;
}
function muxWebM(frames,width,height,duration) {
  const number = (id,value)=>webmElement(id,webmInteger(value));
  const text = (id,value)=>webmElement(id,new TextEncoder().encode(value));
  const header = webmElement(0x1a45dfa3,number(0x4286,1),number(0x42f7,1),
    number(0x42f2,4),number(0x42f3,8),text(0x4282,"webm"),number(0x4287,2),number(0x4285,2));
  const durationBytes = new Uint8Array(8);
  new DataView(durationBytes.buffer).setFloat64(0,duration*1000);
  const info = webmElement(0x1549a966,number(0x2ad7b1,1000000),text(0x4d80,"Launchpad Studio"),
    text(0x5741,"Launchpad Studio"),webmElement(0x4489,durationBytes));
  const track = webmElement(0x1654ae6b,webmElement(0xae,number(0xd7,1),number(0x73c5,1),
    number(0x83,1),number(0x9c,0),text(0x86,"V_VP8"),webmElement(0xe0,number(0xb0,width),number(0xba,height))));
  const clusters = [], cues = [];
  let start = 0, blocks = [], position = info.length+track.length;
  function flush() {
    if (!blocks.length) return;
    const cluster = webmElement(0x1f43b675,number(0xe7,start),...blocks);
    cues.push(webmElement(0xbb,number(0xb3,start),webmElement(0xb7,number(0xf7,1),number(0xf1,position))));
    clusters.push(cluster);
    position += cluster.length;
    blocks = [];
  }
  for (const {key,time,data} of frames) {
    if (key) { flush(); start = time; }
    const timing = new Uint8Array([0x81,0,0,key ? 0x80 : 0]);
    new DataView(timing.buffer).setInt16(1,time-start);
    blocks.push(webmElement(0xa3,timing,data));
  }
  flush();
  return new Blob([header,webmElement(0x18538067,info,track,...clusters,webmElement(0x1c53bb6b,...cues))],{type:"video/webm"});
}
async function encodeSilentWebM(canvas,video,renderer,onProgress,signal) {
  const rate = 24, width = canvas.width, height = canvas.height;
  const config = {codec:"vp8",width,height,framerate:rate,bitrate:2200000,latencyMode:"realtime"};
  if (!globalThis.VideoEncoder || !globalThis.VideoFrame || !(await VideoEncoder.isConfigSupported(config)).supported) {
    throw Error("This browser has no alternate WebM encoder.");
  }
  const duration = videoDuration(video), count = Math.ceil(duration*rate), frames = [];
  let bytes = 0, failure;
  const encoder = new VideoEncoder({output(chunk) {
    if (failure) return;
    bytes += chunk.byteLength;
    if (bytes > 64000000) { failure = Error("The alternate export exceeded the file size limit."); return; }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    frames.push({key:chunk.type === "key",time:Math.round(chunk.timestamp/1000),data});
  },error(error) { failure = error; }});
  try {
    encoder.configure(config);
    for (let index=0;index<count;index++) {
      signal.throwIfAborted();
      if (failure) throw failure;
      const time = index/rate;
      await renderer.drawExportFrame(video,time,signal);
      const frame = new VideoFrame(canvas,{timestamp:Math.round(time*1000000),duration:Math.round(1000000/rate)});
      try { encoder.encode(frame,{keyFrame:index%rate===0}); }
      finally { frame.close(); }
      if (encoder.encodeQueueSize > 5) await encoder.flush();
      if (index%6===0) {
        onProgress(index/count);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    await encoder.flush();
    signal.throwIfAborted();
    if (failure) throw failure;
    if (!frames.length || !frames[0].key) throw Error("The alternate encoder did not deliver a playable video.");
    onProgress(1);
    return muxWebM(frames,width,height,duration);
  } finally { if (encoder.state !== "closed") encoder.close(); }
}

// Chromium can mark an opaque canvas track as alpha video despite emitting no
// alpha blocks. Some Matroska demuxers then wait for a second stream forever.
async function opaqueCanvasWebM(blob) {
  if (!blob.type.includes("webm")) return blob;
  const prefix=new Uint8Array(await blob.slice(0,65536).arrayBuffer());
  function vint(at,isId) {
    const first=prefix[at];
    if (!first) return null;
    let length=1, mask=128;
    while (!(mask & first)) { length++; mask>>=1; }
    if (at+length>prefix.length || (isId && length>4)) return null;
    let value=isId ? first : first & (mask-1);
    for (let index=1;index<length;index++) value=value*256+prefix[at+index];
    return {value,length};
  }
  let edited=false;
  function walk(start,end,parents) {
    for (let at=start;at<end;) {
      const tag=vint(at,true);
      if (!tag) return;
      const size=vint(at+tag.length,false);
      if (!size) return;
      const body=at+tag.length+size.length, next=body+size.value;
      if (tag.value===0x1f43b675) return;
      if (parents.length && tag.value===parents[0]) walk(body,Math.min(next,end),parents.slice(1));
      if (!parents.length && tag.value===0x53c0 && size.value===1 && prefix[body]===1) {
        prefix[body]=0;
        edited=true;
      }
      at=next;
    }
  }
  walk(0,prefix.length,[0x18538067,0x1654ae6b,0xae,0xe0]);
  return edited ? new Blob([prefix,blob.slice(prefix.length)],{type:blob.type}) : blob;
}
