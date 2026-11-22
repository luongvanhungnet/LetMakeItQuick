import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {zipItems} from "./zip-fixture.mjs";
import {createServer as httpServer} from "node:http";
import {createServer as httpsServer} from "node:https";

test("installable app ZIP contains standalone pages and serves them offline",async ({page,context},info) => {
  await page.goto("/");
  await page.locator(".sidebar [data-action=new]").click();
  await page.locator('dialog [data-id=app]').click();
  await page.locator("#new-project input").fill("Pocket Project");
  await page.getByRole("button",{name:"Create project",exact:true}).click();
  async function exportPackage(name) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button",{name:"Installable web app ZIP",exact:true}).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("pocket-project-pwa.zip");
    const file = info.outputPath(name+".zip");
    await download.saveAs(file);
    return zipItems(await readFile(file));
  }
  let files = await exportPackage("version-one");
  let missingIcon = false;
  const tls = process.env.LAUNCHPAD_TEST_HTTPS_CERT && process.env.LAUNCHPAD_TEST_HTTPS_KEY;
  let server;
  try {
    const manifest = JSON.parse(files.get("manifest.webmanifest").toString("utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map(icon=>icon.sizes)).toEqual(["192x192","512x512"]);
    const serve = (request,response)=>{
      const path = new URL(request.url,"http://127.0.0.1").pathname.slice(1) || "index.html";
      if (!files.has(path) || (missingIcon && path === "icon-192.png")) { response.writeHead(404).end(); return; }
      const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".html") ? "text/html" :
        path.endsWith(".png") ? "image/png" : "application/manifest+json";
      response.writeHead(200,{"Content-Type":type,"Cache-Control":path === "sw.js" ? "no-cache" : "public, max-age=3600"});
      response.end(files.get(path));
    };
    server = tls ? httpsServer({cert:await readFile(process.env.LAUNCHPAD_TEST_HTTPS_CERT),key:await readFile(process.env.LAUNCHPAD_TEST_HTTPS_KEY)},serve) : httpServer(serve);
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    const app = await context.newPage();
    await app.goto((tls ? "https" : "http")+"://127.0.0.1:"+server.address().port+"/");
    await app.evaluate(()=>navigator.serviceWorker.ready);
    await expect.poll(()=>app.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    const firstCache = await app.evaluate(()=>caches.keys());
    expect(firstCache).toHaveLength(1);
    await context.setOffline(true);
    await app.reload();
    await expect(app.getByRole("heading",{name:"Welcome"})).toBeVisible();
    await context.setOffline(false);
    await page.locator('[data-action="editor-mode"][data-id="settings"]').click();
    await page.locator('input[name="title"]').fill("Pocket version two");
    files = await exportPackage("version-two");
    async function update() {
      return app.evaluate(async ()=>{
        const registration = await navigator.serviceWorker.ready;
        const changed = new Promise(resolve=>registration.addEventListener("updatefound",()=>{
          const installing = registration.installing;
          installing.addEventListener("statechange",()=>{
            if (installing.state === "activated" || installing.state === "redundant") resolve(installing.state);
          });
        },{once:true}));
        await registration.update();
        return changed;
      });
    }
    missingIcon = true;
    expect(await update()).toBe("redundant");
    await context.setOffline(true);
    await app.reload();
    await expect(app.getByRole("heading",{name:"Welcome"})).toBeVisible();
    await context.setOffline(false);
    missingIcon = false;
    expect(await update()).toBe("activated");
    await expect.poll(()=>app.evaluate(()=>caches.keys())).not.toContain(firstCache[0]);
    expect(await app.evaluate(()=>caches.keys())).toHaveLength(1);
    await context.setOffline(true);
    await app.reload();
    await expect(app.getByRole("heading",{name:"Pocket version two"})).toBeVisible();
  } finally {
    await context.setOffline(false);
    if (server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
  }
});
