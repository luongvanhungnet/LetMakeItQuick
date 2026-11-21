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
