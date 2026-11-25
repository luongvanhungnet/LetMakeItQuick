import {test,expect} from "@playwright/test";

async function newWebsite(page) {
  await page.goto("/");
  await page.locator('.sidebar [data-action="new"]').click();
  await page.locator('dialog [data-id="web"]').click();
  await page.locator("#new-project [name=name]").fill("Trail Studio");
  await page.getByRole("button",{name:"Create project",exact:true}).click();
  await page.locator('[data-tool="form"]').click();
}
async function openReleases(page) {
  await page.getByRole("button",{name:"Hosted releases",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Hosted release",exact:true})).toBeVisible();
}
async function saveStage(page) {
  await page.getByRole("button",{name:"Save to staging",exact:true}).click();
  await expect(page.locator("#release-status")).toHaveText("Staged version is ready to preview.");
  await expect(page.getByRole("button",{name:"Publish staged version",exact:true})).toBeEnabled();
}
async function fillAndSend(frame,text) {
  await frame.getByLabel("Name",{exact:true}).fill("Trail customer");
  await frame.getByLabel("Email",{exact:true}).fill("trails@example.com");
  await frame.getByLabel("Message",{exact:true}).fill(text);
  await frame.getByRole("button",{name:"Send response",exact:true}).click();
}

test("a mobile app publishes a secondary page with long record details",async ({page,context})=>{
  await page.goto("/");
  await page.locator('.sidebar [data-action="new"]').click();
  await page.locator('dialog [data-id="app"]').click();
  await page.locator("#new-project [name=name]").fill("Pocket records");
  await page.getByRole("button",{name:"Create project",exact:true}).click();
  await page.getByRole("button",{name:"Add page",exact:true}).click();
  await page.locator("#page-form [name=name]").fill("Records");
  await page.getByRole("button",{name:"Add page",exact:true}).last().click();
  await page.locator('[data-action="editor-mode"][data-id="blocks"]').click();
  await page.locator('[data-tool="records"]').click();
  const details = "Reference".repeat(28);
  await page.locator('[data-property="b"]').fill("Atlas | "+details);
  await openReleases(page);
  await page.locator('#release-settings [name="visibility"]').selectOption("public");
  await saveStage(page);
  await page.getByRole("button",{name:"Publish staged version",exact:true}).click();
  const release = page.getByRole("link",{name:"Open release",exact:true});
  await expect(release).toBeVisible();
  const phone = await context.newPage();
  await phone.setViewportSize({width:390,height:780});
  await phone.goto(await release.getAttribute("href"));
  const product = phone.frameLocator(".published-view");
  await product.getByRole("link",{name:"Records",exact:true}).click();
  const record = product.getByText(details,{exact:false});
  await expect(record).toBeVisible();
  expect(await record.evaluate(el=>el.ownerDocument.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("release browser checks load the staged and live snapshots once each",async ({page})=>{
  await newWebsite(page);
  await openReleases(page);
  const reads = {staging:0,view:0,workspace:0};
  page.on("request",request=>{
    const path = new URL(request.url()).pathname;
    const match = path.match(/^\/api\/releases\/(staging|view)\//);
    if (match) reads[match[1]]++;
    if (path === "/api/workspace") reads.workspace++;
  });

  await saveStage(page);
  await expect(page.locator("#release-checks")).toContainText("Desktop browser journey");
  await expect(page.locator("#release-checks")).toContainText("Mobile browser journey");
  await page.getByRole("button",{name:"Publish staged version",exact:true}).click();
  await expect(page.locator("#release-history")).toContainText("Mobile browser journey");
  expect(reads).toEqual({staging:1,view:1,workspace:0});
});

test("mobile preflight identifies a failing block on a secondary page",async ({page})=>{
  await newWebsite(page);
  await page.getByRole("button",{name:"Add page",exact:true}).click();
  await page.locator("#page-form [name=name]").fill("Records");
  await page.locator("#page-form button").click();
  await page.locator('[data-action="editor-mode"][data-id="blocks"]').click();
  await page.locator('[data-tool="list"]').click();
  await page.locator('[data-property="a"]').fill("Reference".repeat(9));
  await openReleases(page);
  await page.getByRole("button",{name:"Save to staging",exact:true}).click();
  await expect(page.locator("#release-checks")).toContainText("Records / Bullet list overflows at 390 px");
  await expect(page.getByRole("button",{name:"Publish staged version",exact:true})).toBeDisabled();
});

test("interrupted browser checks can be retried on the same staged version",async ({page,baseURL})=>{
  await newWebsite(page);
  await openReleases(page);
  await page.route("**/api/releases/stage-check",route=>route.abort(),{times:1});
  const staged = page.waitForResponse(response=>new URL(response.url()).pathname === "/api/releases/stage");
  await page.getByRole("button",{name:"Save to staging",exact:true}).click();
  const {stage} = await (await staged).json();
  const retry = page.getByRole("button",{name:"Retry browser checks",exact:true});
  await expect(retry).toBeEnabled();
  const publish = page.getByRole("button",{name:"Publish staged version",exact:true});
  await expect(publish).toBeDisabled();
  const rejected = await page.request.post("/api/releases/publish",{
    headers:{Origin:baseURL},data:{projectId:stage.projectId,stageId:stage.id}
  });
  expect(rejected.status()).toBe(422);
  const retried = page.waitForResponse(response=>new URL(response.url()).pathname === "/api/releases/stage-check");
  await retry.click();
  expect((await (await retried).json()).stage.id).toBe(stage.id);
  await expect(publish).toBeEnabled();
});

test("stage, test the form, publish a live release and roll back to the previous version",async ({page,context})=>{
  await newWebsite(page);
  await openReleases(page);
  const settings = page.locator("#release-settings");
  await settings.locator("[name=slug]").fill("trail-browser-test");
  await settings.locator("[name=title]").fill("Trail Studio Web");
  await settings.locator("[name=description]").fill("A launch page for weekend hikes.");
  await settings.locator("[name=socialImage]").fill("media/forest.jpg");
  await settings.locator("[name=visibility]").selectOption("public");
  await settings.locator("[name=index]").check();
  await settings.locator("[name=journey]").selectOption("signup");
  await page.getByRole("button",{name:"Run preflight",exact:true}).click();
  await expect(page.locator("#release-status")).toHaveText("Local preflight passed.");
  await saveStage(page);

  const stagingLink = await page.getByRole("link",{name:"Open staging preview",exact:true}).getAttribute("href");
  const staging = await context.newPage();
  const staged = await staging.goto(stagingLink);
  expect(staged.status()).toBe(200);
  expect(staged.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(staging).toHaveTitle("Staging · Trail Studio Web");
  const stagingFrame = staging.frameLocator("iframe");
  await staging.getByRole("button",{name:"Mobile",exact:true}).click();
  await expect(staging.locator(".release-preview-body")).toHaveClass(/release-mobile/);
  await fillAndSend(stagingFrame,"Staging form test.");
  await expect(stagingFrame.getByRole("status")).toHaveText("Test response accepted. No production data was saved.");

  await page.getByRole("button",{name:"Publish staged version",exact:true}).click();
  await expect(page.locator("#release-history")).toContainText("Live version 1");
  const liveLink = await page.getByRole("link",{name:"Open release",exact:true}).getAttribute("href");
  const live = await context.newPage();
  const published = await live.goto(liveLink);
  expect(published.status()).toBe(200);
  expect(published.headers()["x-robots-tag"]).toBe("index, follow");
  await expect(live).toHaveTitle("Trail Studio Web");
  await expect(live.locator('meta[property="og:image"]')).toHaveAttribute("content",/\/media\/forest\.jpg$/);
  const liveFrame = live.frameLocator("iframe");
  await expect(liveFrame.getByRole("heading",{name:"Welcome",level:1})).toBeVisible();
  await fillAndSend(liveFrame,"I would like to join a hike.");
  await expect(liveFrame.getByRole("status")).toHaveText("Your response was received.");

  await page.getByRole("button",{name:"Close dialog",exact:true}).click();
  await page.getByRole("button",{name:"Product data",exact:true}).click();
  await expect(page.locator("#workspace-form-inbox")).toContainText("I would like to join a hike.");
  await expect(page.locator("#workspace-form-inbox")).not.toContainText("Staging form test.");
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();
  await page.locator('[data-action="editor-mode"][data-id="settings"]').click();
  await page.locator("#fields [name=title]").fill("Trail Studio version two");
  await openReleases(page);
  await saveStage(page);
  await page.getByRole("button",{name:"Publish staged version",exact:true}).click();
  await expect(page.locator("#release-history")).toContainText("Live version 2");
  await live.reload();
  await expect(liveFrame.getByRole("heading",{name:"Trail Studio version two",level:1})).toBeVisible();
  await page.getByRole("button",{name:"Restore version 1",exact:true}).click();
  await expect(page.locator("#release-history")).toContainText("Live version 1");
  await live.reload();
  await expect(liveFrame.getByRole("heading",{name:"Welcome",level:1})).toBeVisible();
});
