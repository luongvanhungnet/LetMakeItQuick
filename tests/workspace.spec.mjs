import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";

async function blankWebsite(page,name) {
  await page.goto("/");
  await page.locator(".sidebar [data-action=new]").click();
  await page.locator('dialog [data-id=web]').click();
  await page.locator("#new-project input").fill(name);
  await page.getByRole("button",{name:"Create project",exact:true}).click();
}

test("workspace preserves consent, autosaves cloud revisions, restores history, and imports an editable backup",async ({page},info) => {
  await blankWebsite(page,"Cloud field notes");
  await page.locator('#view [data-action=workspace]').click();
  await expect(page.locator("#cloud-state")).toHaveText("Signed in to your private workspace.");
  await expect(page.locator("#workspace-cloud")).toContainText("No cloud drafts yet.");
  await page.locator("#upload-current").click();
  await expect(page.locator("#stop-cloud-sync")).toBeVisible();
  await page.getByRole("button",{name:"Close dialog"}).click();

  await page.locator('[data-action=editor-mode][data-id=settings]').click();
  await page.locator('[name=title]').fill("Published revision");
  await expect(page.locator("#save-note")).toHaveText("Saved to cloud");

  await page.locator('#view [data-action=workspace]').click();
  await page.getByRole("button",{name:"Version history"}).click();
  await expect(page.locator("#workspace-history [data-revision]")).toHaveCount(2);
  await page.getByRole("button",{name:"Restore",exact:true}).click();
  await page.getByRole("button",{name:"Confirm restore",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.frameLocator("#preview").getByRole("heading",{name:"Welcome",exact:true})).toBeVisible();

  await page.locator('#view [data-action=workspace]').click();
  await page.locator("#stop-cloud-sync").click();
  await expect(page.locator("#stop-cloud-sync")).toBeHidden();
  await page.getByRole("button",{name:"Close dialog"}).click();
  await page.locator('[data-action=editor-mode][data-id=settings]').click();
  await page.locator('[name=title]').fill("Device-only edit");
  await page.locator('#view [data-action=workspace]').click();
  await page.getByRole("button",{name:"Version history"}).click();
  await page.getByRole("button",{name:"Use cloud copy"}).click();
  await page.getByRole("button",{name:"Replace device copy and resume"}).click();
  await expect(page.frameLocator("#preview").getByRole("heading",{name:"Welcome",exact:true})).toBeVisible();

  await page.locator('#view [data-action=workspace]').click();
  const [backup] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button",{name:"Download editable backup"}).click()
  ]);
  const path = info.outputPath("editable-workspace.json");
  await backup.saveAs(path);
  const document = JSON.parse(await readFile(path,"utf8"));
  expect(document.format).toBe("launchpad-draft");
  expect(document.project.title).toBe("Welcome");
  document.project.name = "Imported field notes";
  await page.locator("#import-editable").setInputFiles({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(document))});
  await expect(page.locator(".project-heading h1")).toHaveText("Imported field notes");
  await page.locator('#view [data-action=workspace]').click();
  await expect(page.locator("#upload-current")).toBeVisible();
});

test("product media, searchable records, live form inbox, and reviewed AI undo work together",async ({page,context}) => {
  await blankWebsite(page,"Workspace showcase");
  const preview = page.frameLocator("#preview");
  await page.locator('[data-tool=form]').click();
  await page.locator('[data-property=b]').fill("Name\nEmail");
  await page.locator('[data-tool=records]').click();
  await page.locator('[data-property=b]').fill("Atlas | Ready\nMercury | Pending");
  await preview.getByRole("searchbox",{name:"Search records"}).fill("mercury");
  await expect(preview.getByText("Mercury · Pending")).toBeVisible();
  await expect(preview.getByText("Atlas · Ready")).toBeHidden();

  await page.locator('[data-action=workspace-media]').click();
  await page.locator('input[name=image]').setInputFiles("dist/media/forest.jpg");
  await page.getByLabel("Alt text",{exact:true}).fill("Green forest");
  await page.getByLabel("Attribution",{exact:true}).fill("Trail photo");
  await page.getByLabel("License",{exact:true}).fill("Licensed");
  await page.getByRole("button",{name:"Add image",exact:true}).click();
  await expect(preview.getByRole("img",{name:"Green forest"})).toHaveAttribute("src",/^data:image\/jpeg;base64,/);
  await expect(preview.getByText("Trail photo · Licensed")).toBeVisible();

  await page.locator('[data-action=editor-mode][data-id=chat]').click();
  await page.getByRole("textbox",{name:"Message"}).fill('Change the headline to "Reviewed change"');
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.locator("#chat-proposal")).toContainText("Welcome");
  await expect(page.locator("#chat-proposal")).toContainText("Reviewed change");
  await expect(preview.getByRole("heading",{name:"Welcome",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Apply changes"}).click();
  await expect(preview.getByRole("heading",{name:"Reviewed change",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Undo last AI edit"}).click();
  await expect(preview.getByRole("heading",{name:"Welcome",exact:true})).toBeVisible();

  await preview.getByRole("textbox",{name:"Name",exact:true}).fill("Sample user");
  await preview.getByRole("textbox",{name:"Email",exact:true}).fill("sample@example.test");
  await preview.getByRole("button",{name:"Send response"}).click();
  await expect(preview.getByText("Test response accepted. No production data was saved.")).toBeVisible();

  await page.locator('[data-action=release-studio]').click();
  const slug = "workspace-"+randomUUID().slice(0,8);
  await page.getByLabel("Stable URL slug").fill(slug);
  await page.getByRole("button",{name:"Save to staging"}).click();
  await page.getByRole("button",{name:"Publish staged version"}).click();
  await expect(page.locator("#release-history")).toContainText("Live version 1");
  await page.getByRole("button",{name:"Close dialog"}).click();

  const live = await context.newPage();
  await live.goto("/launch/"+slug);
  const product = live.frameLocator(".published-view");
  await product.getByRole("textbox",{name:"Name",exact:true}).fill("Live user");
  await product.getByRole("textbox",{name:"Email",exact:true}).fill("live@example.test");
  await product.getByRole("button",{name:"Send response"}).click();
  await expect(product.getByText("Your response was received.")).toBeVisible();
  await live.close();

  await page.locator('[data-action=workspace-data]').click();
  await expect(page.locator("#workspace-form-inbox summary")).toHaveCount(1);
  await page.locator("#workspace-form-inbox summary").click();
  await expect(page.locator("#workspace-form-inbox")).toContainText("live@example.test");
  await expect(page.locator("#workspace-form-inbox")).not.toContainText("sample@example.test");
});

test("uploaded free files and separately managed records appear in the corresponding release",async ({page,context})=>{
  await blankWebsite(page,"Records and files");
  await page.locator('[data-tool="records"]').click();
  await page.locator('[data-tool="signin"]').click();
  await page.locator('[data-tool="downloads"]').click();
  await page.locator("[data-upload-download]").setInputFiles({name:"guide.txt",mimeType:"text/plain",buffer:Buffer.from("Example guide")});
  await expect(page.locator("#block-inspector")).toContainText("guide.txt");
  await page.locator('#view [data-action=workspace]').click();
  await page.locator("#upload-current").click();
  await expect(page.locator("#stop-cloud-sync")).toBeVisible();
  await page.getByRole("button",{name:"Close dialog"}).click();
  await page.getByRole("button",{name:"Product data",exact:true}).click();
  const panel=page.locator("#environment-records");
  for (const environment of ["staging","production"]) {
    await panel.locator('[name="environment"]').selectOption(environment);
    await panel.getByRole("button",{name:"Add record"}).click();
    await panel.getByLabel("Record name").fill(environment+" product");
    await panel.getByLabel("Details",{exact:true}).fill("Stored in D1");
    await panel.getByRole("button",{name:"Save records"}).click();
    await expect(panel.getByRole("status")).toHaveText("Environment records saved.");
  }
  await page.getByRole("button",{name:"Close dialog"}).click();
  await page.getByRole("button",{name:"Hosted releases"}).click();
  await page.locator('[name="visibility"]').selectOption("public");
  await page.getByRole("button",{name:"Save to staging",exact:true}).click();
  await expect(page.getByRole("button",{name:"Publish staged version"})).toBeEnabled({timeout:15000});
  const preview=await context.newPage();
  await preview.goto(await page.getByRole("link",{name:"Open staging preview"}).getAttribute("href"));
  const staged=preview.frameLocator(".published-view");
  await expect(staged.getByText("staging product",{exact:false})).toBeVisible();
  await staged.getByRole("link",{name:"Sign in as test customer"}).click();
  await staged.getByText("Your customer code",{exact:true}).click();
  await expect(staged.locator("[data-customer-code]")).toBeVisible();
  await page.getByRole("button",{name:"Publish staged version"}).click();
  await expect(page.getByRole("link",{name:"Open release",exact:true})).toBeVisible({timeout:15000});
  const live=await context.newPage();
  await live.goto(await page.getByRole("link",{name:"Open release",exact:true}).getAttribute("href"));
  const product=live.frameLocator(".published-view");
  await expect(product.getByText("production product",{exact:false})).toBeVisible();
  await expect(product.getByText("staging product",{exact:false})).toHaveCount(0);
  const file=live.waitForEvent("download");
  await product.locator("a[download]").click();
  const download=await file;
  expect(download.suggestedFilename()).toBe("guide.txt");
  expect((await readFile(await download.path(),"utf8"))).toBe("Example guide");
});
