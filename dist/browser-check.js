"use strict";

const releaseBrowserWidths = [1280,390];

// Runs inside the generated, sandboxed product document. Keep this function self-contained.
function verifyRenderedProduct(journey,widths) {
  function report(width) {
    if (innerWidth !== width) {
      window.addEventListener("resize",()=>report(width),{once:true});
      return;
    }
    parent.postMessage({kind:"launchpad-render-check",width,issues:inspect()},"*");
  }
  function inspect() {
    const pages = [...document.querySelectorAll("[data-project-page]")];
    const initial = pages.find(page=>!page.hidden);
    const links = new Map([...document.querySelectorAll("header nav [data-page-link]")].map(link=>[link.dataset.pageLink,link]));
    const controls = [...document.querySelectorAll("input:not([type=hidden]),button,a[href]")];
    const named = control=>control.textContent.trim() || control.getAttribute("aria-label") || control.labels?.length || control.querySelector("img[alt]");
    const issues = [];
    if (!initial) issues.push("No visible product page");
    if (controls.some(control=>!named(control))) issues.push("A control has no accessible name");

    function open(page) {
      if (page?.hidden) links.get(page.dataset.projectPage)?.click();
    }
    function overflows(section) {
      return section.getBoundingClientRect().right > innerWidth+2 || section.scrollWidth > section.clientWidth+2;
    }
    for (const page of pages) {
      const name = links.get(page.dataset.projectPage)?.textContent.trim() || "Home";
      open(page);
      if (page.hidden) issues.push(name+" could not open");
      else if (document.documentElement.scrollWidth > innerWidth+2) {
        const block = [...page.querySelectorAll("[data-check-block]")].find(overflows);
        const header = document.querySelector("main > header");
        const location = block ? name+" / "+block.dataset.checkBlock : header && overflows(header) ? "Page header" : name;
        const message = location+" overflows at "+innerWidth+" px";
        if (!issues.includes(message)) issues.push(message);
      }
    }
    if (journey === "signup") {
      const form = document.querySelector("[data-product-form]");
      const signin = document.querySelector("[data-product-signin]");
      if (form) {
        open(form.closest("[data-project-page]"));
        for (const input of form.querySelectorAll("input")) input.value = input.type === "email" ? "qa@example.invalid" : "Browser check";
        form.requestSubmit();
        if (!form.querySelector("output").textContent.includes("Test response accepted")) issues.push("Test form failed");
      } else if (!(/^\/(?:signin-with-chatgpt\?return_to=|staging\/)/.test(signin?.getAttribute("href") || "") || document.querySelector("[data-customer-code]"))) {
        issues.push("Sign-in entry missing");
      }
    } else if (journey === "download" && !document.querySelector("a[download]")?.getAttribute("href")) {
      issues.push("Download unavailable");
    }
    open(initial);
    return issues;
  }
  function next(event) {
    if (event.source !== parent || event.data?.kind !== "launchpad-render-check-next") return;
    window.removeEventListener("message",next);
    report(widths[1]);
  }
  window.addEventListener("message",next);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",()=>report(widths[0]),{once:true});
  else report(widths[0]);
}

// Opens the stable route through the creator's browser at both sizes.
async function checkReleaseInBrowser(path,expectedId) {
  const token=crypto.randomUUID(), frame=document.createElement("iframe");
  frame.setAttribute("aria-hidden","true");
  frame.style.cssText="position:fixed;left:-10000px;top:0;border:0;height:780px;width:"+releaseBrowserWidths[0]+"px";
  const url=new URL(path,location.origin);
  url.searchParams.set("studio_check",token);
  return new Promise(resolve=>{
    const checked = new Map();
    function finish(fallback) {
      clearTimeout(timer);
      window.removeEventListener("message",receive);
      frame.remove();
      resolve(releaseBrowserWidths.map((width,index)=>{
        const issues = checked.get(width) || [fallback];
        const label = (index ? "Mobile" : "Desktop")+" browser journey";
        return {label:issues.length ? (label+" · "+issues.join(", ")).slice(0,299) : label,status:issues.length ? "failed" : "passed"};
      }));
    }
    function receive(event) {
      if (event.origin!==location.origin || event.source!==frame.contentWindow || event.data?.token!==token) return;
      const {id,width,issues} = event.data;
      if (id!==expectedId || !releaseBrowserWidths.includes(width) || !Array.isArray(issues)) return finish("Unexpected release version");
      checked.set(width,issues);
      if (checked.size === releaseBrowserWidths.length) finish();
    }
    const timer=setTimeout(()=>finish("Timed out loading the product"),10000);
    window.addEventListener("message",receive);
    frame.src=url.href;
    document.body.append(frame);
  });
}
