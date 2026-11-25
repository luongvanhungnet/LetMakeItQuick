import {test, expect} from "@playwright/test";
import {readFileSync} from "node:fs";

test("compile the AI spec example and navigate its generated website", async ({page})=>{
  const spec = readFileSync(new URL("../dist/site-dsl.md",import.meta.url),"utf8");
  const source = spec.split("\n").filter(line=>line.startsWith("    ")).join("\n");
  await page.goto("/");
  await page.getByRole("button",{name:"Build from text"}).click();
  const input = page.getByLabel("Website source");
  await input.fill(source+"\nbutton Missing to Unknown");
  await page.getByRole("button",{name:"Compile website"}).click();
  await expect(page.getByRole("alert")).toContainText("Unknown destination page Unknown");
  await input.fill(source);
  await page.getByRole("button",{name:"Compile website"}).click();
  const preview = page.frameLocator("#preview");
  await expect(preview.getByText("Explore the pine forest",{exact:true})).toBeVisible();
  await preview.getByText("Choose a walk",{exact:true}).click();
  await expect(preview.getByText("Forest loop",{exact:true})).toBeVisible();
  await preview.getByText("Back home",{exact:true}).click();
  await expect(preview.getByText("Explore the pine forest",{exact:true})).toBeVisible();
});
