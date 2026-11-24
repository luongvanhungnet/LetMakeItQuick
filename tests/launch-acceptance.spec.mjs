import {test,expect} from "@playwright/test";
import {once} from "node:events";
import {writeFile} from "node:fs/promises";
import {localData} from "../worker/dev-data.mjs";
import {serve} from "../worker/dev.mjs";

test("first-use rehearsal edits a template, launches a product and exports its release and campaign ad",async ({page,context},info)=>{
  test.setTimeout(150000);
  const db=localData(), env={LAUNCHPAD_DATA:db};
  const studio=serve(env,0,"acceptance-creator"), publicHost=serve(env,0);
  await Promise.all([once(studio,"listening"),once(publicHost,"listening")]);
  const origin="http://127.0.0.1:"+studio.address().port;
  const guestOrigin="http://127.0.0.1:"+publicHost.address().port;
  const close=()=>page.getByRole("button",{name:"Close dialog"}).click();
  async function deploy(version) {
    await page.getByRole("button",{name:"Hosted releases"}).click();
    const settings=page.locator("#release-settings");
    await settings.locator("[name=visibility]").selectOption("public");
    await settings.locator("[name=journey]").selectOption("signup");
    await page.getByRole("button",{name:"Save to staging",exact:true}).click();
    await page.getByRole("button",{name:"Publish staged version"}).click({timeout:20000});
    await expect(page.locator("#release-history")).toContainText("Live version "+version,{timeout:20000});
  }
  async function download(button,name) {
    const [file]=await Promise.all([page.waitForEvent("download"),button.click()]);
    await file.saveAs(info.outputPath(name || file.suggestedFilename()));
    return name || file.suggestedFilename();
  }
  try {
    const start=Date.now();
    await page.goto(origin);
    await page.getByRole("button",{name:"Explore a sample project"}).click();
    await page.locator("#new-project input").fill("Atlas acceptance");
    await page.getByRole("button",{name:"Create project",exact:true}).click();
    await page.locator('[name="title"]').fill("Meet Atlas");
    await page.locator('#view [data-action=workspace]').click();
    await page.locator("#upload-current").click();
    await expect(page.locator("#stop-cloud-sync")).toBeVisible();
    await close();
    await deploy(1);
    const firstDeployMs=Date.now()-start;
    await close();
    await page.getByRole("button",{name:"Package & sell"}).click();
    await page.getByRole("button",{name:"Release ZIP and listing kit"}).click();
    await download(page.getByRole("button",{name:"Download ZIP"}),"atlas-release.zip");
    await close();
    await page.locator("[data-action=launch-ad]").click();
    const form=page.locator("#launch-ad-form");
    await expect(form.locator("#launch-ad-version")).toHaveText("Source release: 1");
    await form.locator("[name=features]").fill("Preview the product");
    await form.getByRole("button",{name:"Create editable ad"}).click();
    await expect(page.locator(".project-heading h1")).toHaveText("Atlas acceptance launch ad");
    const campaign=new URL(await page.locator("#ad-campaign-link").inputValue());
    await download(page.getByRole("button",{name:"Download captions (.vtt)"}),"atlas-captions.vtt");
    const ad=await download(page.locator("[data-action=export-video]"));
    const guest=await context.newPage();
    await guest.goto(guestOrigin+campaign.pathname+campaign.search);
    const product=guest.frameLocator(".published-view");
    await product.getByRole("link",{name:"Contact",exact:true}).first().click();
    await product.getByLabel("Name",{exact:true}).fill("Test visitor");
    await product.getByLabel("Email",{exact:true}).fill("visitor@example.invalid");
    await product.getByLabel("Message",{exact:true}).fill("Launch acceptance verification");
    await product.getByRole("button",{name:"Send response"}).click();
    await expect(product.getByRole("status")).toHaveText("Your response was received.");
    const stats=await (await page.request.get(origin+"/api/operations")).json();
    expect(stats.report.campaigns).toContainEqual(expect.objectContaining({campaign:campaign.searchParams.get("utm_campaign"),visits:1,signups:1}));
    await page.locator(".top-actions [data-action=projects]").click();
    await page.locator(".project-card").filter({has:page.getByRole("heading",{name:"Atlas acceptance",exact:true})}).click();
    await page.locator('[data-action=editor-mode][data-id=settings]').click();
    await page.locator('[name="title"]').fill("Meet Atlas version two");
    await expect(page.locator("#save-note")).toHaveText("Saved to cloud");
    await deploy(2);
    await page.getByRole("button",{name:"Restore version 1"}).click();
    await expect(page.locator("#release-history")).toContainText("Live version 1",{timeout:15000});
    await guest.reload();
    await expect(product.getByRole("heading",{name:"Meet Atlas",exact:true})).toBeVisible();
    await close();
    await page.locator('#view [data-action=workspace]').click();
    await page.getByRole("button",{name:"Version history"}).click();
    await page.getByRole("button",{name:"Restore",exact:true}).last().click();
    await page.getByRole("button",{name:"Confirm restore",exact:true}).click();
    await expect(page.frameLocator("#preview").getByRole("heading",{name:"Meet Atlas",exact:true})).toBeVisible();
    await writeFile(info.outputPath("acceptance.json"),JSON.stringify({environment:"two loopback origins, SQLite",firstDeployMs,ad,
      release:"atlas-release.zip",attribution:stats.report.campaigns,restoredLiveVersion:1,restoredDraftTitle:"Meet Atlas"},null,2));
  } finally {
    for (const server of [studio,publicHost]) {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
    db.close();
  }
});
