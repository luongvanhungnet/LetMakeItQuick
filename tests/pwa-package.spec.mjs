import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {zipItems} from "./zip-fixture.mjs";
import {createServer} from "node:http";

test("installable app ZIP contains standalone pages and serves them offline",async ({page,context},info) => {
  await page.goto("/");
  await page.locator(".sidebar [data-action=new]").click();
  await page.locator('dialog [data-id=app]').click();
  await page.locator("#new-project input").fill("Pocket Project");
  await page.getByRole("button",{name:"Create project",exact:true}).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button",{name:"Installable web app ZIP",exact:true}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pocket-project-pwa.zip");
  const file = info.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const files = zipItems(await readFile(file));
  let server;
  try {
    const manifest = JSON.parse(files.get("manifest.webmanifest").toString("utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map(icon=>icon.sizes)).toEqual(["192x192","512x512"]);
    server = createServer((request,response)=>{
      const path = new URL(request.url,"http://127.0.0.1").pathname.slice(1) || "index.html";
      if (!files.has(path)) { response.writeHead(404).end(); return; }
      const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".html") ? "text/html" :
        path.endsWith(".png") ? "image/png" : "application/manifest+json";
      response.writeHead(200,{"Content-Type":type});
      response.end(files.get(path));
    });
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    const app = await context.newPage();
    await app.goto("http://127.0.0.1:"+server.address().port+"/");
    await app.evaluate(()=>navigator.serviceWorker.ready);
    await expect.poll(()=>app.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await app.reload();
    await expect(app.getByRole("heading",{name:"Welcome"})).toBeVisible();
    await context.setOffline(false);
  } finally {
    await context.setOffline(false);
    if (server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
  }
});
