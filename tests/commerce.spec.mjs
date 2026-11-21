import {expect,test} from "@playwright/test";
import {readFile} from "node:fs/promises";

import {zipItems} from "./zip-fixture.mjs";

test("creator packages HTML, receives a test order, and revokes its delivery after refund",async ({page,context},testInfo)=>{
  await page.goto("/");
  await page.locator('button[data-action="pick"][data-id="studio"]').click();
  await page.locator("#new-project input").fill("Commerce test studio");
  await page.getByRole("button",{name:"Create project",exact:true}).click();
  await page.getByRole("button",{name:"Package & sell"}).click();
  await page.getByRole("button",{name:"Release ZIP and listing kit"}).click();
  await page.getByLabel("Version",{exact:true}).fill("2.1");
  await page.getByLabel("Changelog").fill("Updated descriptions.");
  const packageDownload = page.waitForEvent("download");
  await page.getByRole("button",{name:"Download ZIP"}).click();
  const release = await packageDownload;
  const releasePath = testInfo.outputPath("release.zip");
  await release.saveAs(releasePath);
  const archive = zipItems(await readFile(releasePath));
  expect([...archive.keys()]).toEqual(expect.arrayContaining([
    "product/index.html","VERSION.txt","INSTALL.md","CHANGELOG.md","ASSET-LICENSES.md",
    "listing/icon.svg","listing/cover.png","listing/description.txt","listing/itch-io-checklist.md"
  ]));
  expect(archive.get("product/index.html").toString()).toContain("Commerce test studio");
  expect(archive.get("product/index.html").toString()).toContain("data:image/");
  expect(archive.get("VERSION.txt").toString()).toBe("2.1\n");
  expect(archive.get("CHANGELOG.md").toString()).toContain("Updated descriptions.");
  expect(archive.get("listing/cover.png").subarray(1,4).toString()).toBe("PNG");
  const browserDownload = page.waitForEvent("download");
  await page.getByRole("button",{name:"itch.io browser ZIP"}).click();
  const browserUpload = await browserDownload;
  expect(browserUpload.suggestedFilename()).toMatch(/-itch\.zip$/);
  const browserPath = testInfo.outputPath("itch.zip");
  await browserUpload.saveAs(browserPath);
  expect([...zipItems(await readFile(browserPath)).keys()]).toEqual(["index.html"]);

  await page.getByRole("button",{name:"Close dialog"}).click();
  await page.getByRole("button",{name:"Package & sell"}).click();
  await page.getByLabel("Show listing to test customers").check();
  await page.getByRole("button",{name:"Save test listing"}).click();
  const listing = await page.getByRole("link",{name:"Open store preview"}).getAttribute("href");
  const buyer = await context.newPage();
  await buyer.goto(listing+"&utm_source=video&utm_campaign=launch");
  await buyer.getByRole("button",{name:"Simulate decline"}).click();
  await expect(buyer.getByText("Failed",{exact:true})).toBeVisible();
  await buyer.getByRole("button",{name:"Start test checkout"}).click();
  await expect(buyer.getByText("Paid",{exact:true})).toBeVisible();
  const purchasedDownload = buyer.waitForEvent("download");
  await buyer.getByRole("button",{name:"Download release"}).click();
  expect((await purchasedDownload).suggestedFilename()).toMatch(/\.zip$/);
  const receiptDownload = buyer.waitForEvent("download");
  await buyer.getByRole("button",{name:"Receipt",exact:true}).click();
  const receipt = await receiptDownload;
  const receiptFile = testInfo.outputPath("receipt.txt");
  await receipt.saveAs(receiptFile);
  expect(await readFile(receiptFile,"utf8")).toContain("Status: Paid");

  await page.getByRole("button",{name:"Close dialog"}).click();
  await page.getByRole("button",{name:"Package & sell"}).click();
  await page.getByRole("button",{name:"Refund",exact:true}).click();
  await page.getByRole("button",{name:"Confirm refund",exact:true}).click();
  await expect(page.getByRole("cell",{name:"Refunded",exact:true})).toBeVisible();
  await buyer.reload();
  await expect(buyer.getByText("Refunded",{exact:true})).toBeVisible();
  await expect(buyer.getByRole("button",{name:"Download release"})).toHaveCount(0);
});
