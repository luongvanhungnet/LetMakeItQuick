"use strict";

function makeAppIcon(name,color,size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.fillRect(0,0,size,size);
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 "+Math.round(size*.38)+"px system-ui";
  context.fillText(Array.from(name.trim())[0]?.toUpperCase() || "L",size/2,size/2,size*.65);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(Error("The app icon could not be generated.")),"image/png"));
}
async function exportInstallableApp(project) {
  if (!supportsPages(project.type)) return;
  const draft = structuredClone(project);
  toast("Preparing installable web app…");
  try {
    const name = draft.name || "Launchpad App";
    const color = /^#[a-f0-9]{6}$/i.test(draft.color) ? draft.color : "#643bed";
    const html = await buildStandaloneHTML(draft);
    const branded = html.replace("</head>",'<link rel="manifest" href="./manifest.webmanifest"><meta name="theme-color" content="'+color+'"><link rel="apple-touch-icon" href="./icon-192.png"></head>')
      .replace("</body>",'<script src="./register.js"></script></body>');
    const icons = await Promise.all([192,512].map(size=>makeAppIcon(name,color,size)));
    const manifest = {
      id:"./",name,short_name:Array.from(name).slice(0,22).join(""),start_url:"./",scope:"./",
      display:"standalone",theme_color:color,background_color:"#ffffff",
      icons:[192,512].map(size=>({src:"./icon-"+size+".png",sizes:size+"x"+size,type:"image/png",purpose:"any maskable"}))
    };
    const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(branded));
    const version = [...new Uint8Array(digest)].slice(0,8).map(byte=>byte.toString(16).padStart(2,"0")).join("");
    const serviceWorker = `
const prefix = "launchpad-pwa-" + self.registration.scope + "-";
const cacheName = prefix + "${version}";
const paths = ["./","./index.html","./manifest.webmanifest","./register.js","./icon-192.png","./icon-512.png"];
const assets = new Set(paths.map(path => new URL(path,self.registration.scope).href));
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(paths)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(prefix)&&key!==cacheName).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  if (event.request.method !== "GET" || !assets.has(event.request.url)) return;
  event.respondWith(caches.open(cacheName).then(async cache=>await cache.match(event.request) || fetch(event.request)));
});
`;
    const zip = await createReleaseZip({
      "index.html":branded,
      "manifest.webmanifest":JSON.stringify(manifest,null,2),
      "icon-192.png":icons[0],"icon-512.png":icons[1],"sw.js":serviceWorker,
      "register.js":"if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);",
      "INSTALL.md":"# Install "+name+"\n\nExtract this ZIP to an HTTPS static host or serve it on localhost. Open the hosted URL and use your browser’s install option. Open the app online once to cache the bundled pages. Features that use external URLs need a connection.\n\nThis is an installable web app package. Native store signing and submission are separate steps. Test installation, offline navigation, and update behavior in your target browsers before distribution.\n"
    });
    downloadBlob(zip,(name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "app")+"-pwa.zip");
  } catch (error) { toast(error.message || "The installable package could not be generated."); }
}
