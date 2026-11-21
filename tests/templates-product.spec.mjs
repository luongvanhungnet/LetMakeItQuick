import {test,expect} from "@playwright/test";

test("catalog filters and searches customer goals and explains a template with an interactive demo",async ({page})=>{
  await page.goto("/");
  await page.locator("#catalog-goal").selectOption("download");
  await expect(page.locator("#catalog-result")).toHaveText("1 template");
  const guide = page.locator('[data-action=pick][data-id="field-guide"]');
  await expect(guide).toBeVisible();
  await page.getByRole("searchbox",{name:"Search templates"}).fill("sample details");
  await expect(guide).toBeVisible();
  await page.getByRole("searchbox",{name:"Search templates"}).fill("wrong keyword");
  await expect(page.getByText("No templates match these filters.")).toBeVisible();
  await page.getByRole("button",{name:"Clear filters"}).click();
  await page.locator("#catalog-goal").selectOption("download");
  await guide.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("dd").first()).toHaveText("Home, Preview, Product details");
  await expect(dialog).toContainText("Publish targets");
  await expect(dialog).toContainText("Show a sample of a digital product");
  const demo = page.frameLocator("#catalog-live-demo iframe");
  await demo.getByRole("link",{name:"Preview the guide"}).click();
  await expect(demo.getByRole("heading",{name:"A sample from the guide"})).toBeVisible();
  await demo.getByRole("link",{name:"See product details"}).click();
  await expect(demo.getByRole("heading",{name:"The weekend trail bundle"})).toBeVisible();
  await page.locator("#catalog-preview-size").selectOption("mobile");
  await expect(page.locator("#catalog-live-demo")).toHaveClass("catalog-mobile-demo");
});

test("sample is explorable without creating a draft and creates an editable named copy on request",async ({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Explore a sample project"}).click();
  await expect(page.getByRole("dialog")).toContainText("without signing in");
  await expect(page.getByRole("dialog")).toContainText("import the draft");
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("launchpad-projects-v1") || "[]"))).toEqual([]);
  const demo = page.frameLocator("#catalog-live-demo iframe");
  await demo.getByRole("link",{name:"Explore features"}).click();
  await expect(demo.getByRole("heading",{name:"A clear view of the work"})).toBeVisible();
  await demo.getByRole("link",{name:"Get in touch"}).click();
  await demo.getByLabel("Name",{exact:true}).fill("Sample visitor");
  await demo.getByLabel("Email",{exact:true}).fill("visitor@example.test");
  await demo.getByLabel("Message",{exact:true}).fill("I would like to learn more.");
  await demo.getByRole("button",{name:"Send response"}).click();
  await expect(demo.getByRole("status")).toContainText("Test response accepted.");
  await page.locator("#new-project input").fill("My product");
  await page.getByRole("button",{name:"Create project",exact:true}).click();
  await expect(page.locator(".project-heading h1")).toHaveText("My product");
  await expect(page.locator("[name=title]")).toHaveValue("Plan your next project with Atlas.");
  await expect(page.locator("#page-select option")).toHaveCount(3);
  await page.locator("[name=title]").fill("A new project for small teams");
  await expect(page.frameLocator("#preview").getByRole("heading",{name:"A new project for small teams"})).toBeVisible();
});

test("a creator submits a licensed template and a reviewer approves reusable versions",async ({browser})=>{
  test.setTimeout(90000);
  const [{serve},{localData}] = await Promise.all([import("../worker/dev.mjs"),import("../worker/dev-data.mjs")]);
  const data = localData(":memory:");
  const root = {LAUNCHPAD_DATA:data,LAUNCHPAD_CATALOG_REVIEWER_ID:"catalog-reviewer"};
  const servers = [serve(root,0,"catalog-creator"),serve(root,0,"catalog-reviewer"),serve(root,0)];
  const contexts = await Promise.all(servers.map(()=>browser.newContext()));
  try {
    const addresses = await Promise.all(servers.map(server=>new Promise((resolve,reject)=>{
      if (server.listening) resolve("http://127.0.0.1:"+server.address().port);
      else {
        server.once("listening",()=>resolve("http://127.0.0.1:"+server.address().port));
        server.once("error",reject);
      }
    })));
    const [creator,reviewer,visitor] = await Promise.all(contexts.map(context=>context.newPage()));
    await Promise.all([
      creator.goto(addresses[0],{waitUntil:"domcontentloaded"}),
      reviewer.goto(addresses[1],{waitUntil:"domcontentloaded"}),
      visitor.goto(addresses[2],{waitUntil:"domcontentloaded"})
    ]);
    await creator.locator('[data-action=pick][data-id=atlas-launch]').click();
    await creator.locator("#new-project input").fill("Planner source project");
    await creator.getByRole("button",{name:"Create project",exact:true}).click();
    await creator.locator('[data-action=templates]').click();
    await creator.getByRole("button",{name:"Community templates"}).click();
    await creator.getByRole("button",{name:"Submit a project"}).click();
    const submission = creator.locator("#community-form");
    await submission.locator("[name=title]").fill("Planner Starter");
    await submission.locator("[name=description]").fill("A three-page planner introduction.");
    await submission.locator("[name=attribution]").fill("Example Creator");
    await submission.locator("[name=license]").selectOption("CC-BY-4.0");
    await submission.locator("[name=attest]").check();
    await submission.getByRole("button",{name:"Send for review"}).click();
    await expect(creator.locator("#community-submissions")).toContainText("Version 1 · pending");
    await visitor.getByRole("button",{name:"Community templates"}).click();
    await expect(visitor.getByRole("dialog")).toContainText("There are no approved community templates yet.");

    async function review(version) {
      if (version > 1) await reviewer.getByRole("button",{name:"Close dialog"}).click();
      await reviewer.getByRole("button",{name:"Community templates"}).click();
      await reviewer.getByRole("button",{name:"Preview submission"}).click();
      await expect(reviewer.frameLocator("#catalog-live-demo iframe").getByRole("heading",{name:"Plan your next project with Atlas."})).toBeVisible();
      await reviewer.getByRole("button",{name:"Close dialog"}).click();
      await reviewer.getByRole("button",{name:"Community templates"}).click();
      await reviewer.getByRole("button",{name:"Review",exact:true}).click();
      await expect(reviewer.getByRole("heading",{name:"Review template version "+version})).toBeVisible();
      await reviewer.getByRole("button",{name:"Save decision"}).click();
      await expect(reviewer.locator("#community-submissions")).toContainText("Version "+version+" · approved");
    }
    await review(1);
    await creator.getByRole("button",{name:"Close dialog"}).click();
    await creator.getByRole("button",{name:"Community templates"}).click();
    await creator.getByRole("button",{name:"Submit revision"}).click();
    await submission.locator("[name=title]").fill("Planner Starter Revised");
    await submission.locator("[name=attest]").check();
    await submission.getByRole("button",{name:"Send for review"}).click();
    await expect(creator.locator("#community-submissions")).toContainText("Version 2 · pending");
    await review(2);

    await visitor.getByRole("button",{name:"Close dialog"}).click();
    await visitor.getByRole("button",{name:"Community templates"}).click();
    await visitor.getByLabel("Version",{exact:true}).selectOption("1");
    await visitor.getByRole("button",{name:"Preview",exact:true}).click();
    await expect(visitor.getByRole("heading",{name:"Planner Starter",exact:true})).toBeVisible();
    await expect(visitor.getByRole("dialog")).toContainText("Example Creator · CC-BY-4.0 · v1");
    await visitor.locator("#new-project input").fill("Planner copy");
    await visitor.getByRole("button",{name:"Create project",exact:true}).click();
    await expect(visitor.locator(".project-heading h1")).toHaveText("Planner copy");
    const credit = await visitor.evaluate(()=>JSON.parse(localStorage.getItem("launchpad-projects-v1"))[0].templateCredit[0]);
    expect(credit).toMatchObject({title:"Planner Starter",attribution:"Example Creator",license:"CC-BY-4.0",version:1});
    await expect(visitor.frameLocator("#preview").getByText("Planner Starter v1 by Example Creator", {exact:false})).toBeVisible();
  } finally {
    await Promise.all(contexts.map(context=>context.close()));
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
    data.close();
  }
});
