"use strict";

// Runs inside the generated, sandboxed product document. Keep this function self-contained.
function verifyRenderedProduct(journey) {
  const form=document.querySelector("[data-product-form]");
  const signin=document.querySelector("[data-product-signin]");
  const controls=[...document.querySelectorAll("input:not([type=hidden]),button,a[href]")];
  const named=control=>control.textContent.trim() || control.getAttribute("aria-label") || control.labels?.length || control.querySelector("img[alt]");
  const issues=[];
  if (!document.querySelector("[data-project-page]:not([hidden])")) issues.push("No visible product page");
  if (controls.some(control=>!named(control))) issues.push("A control has no accessible name");
  if (document.documentElement.scrollWidth>innerWidth+2) issues.push("Page overflows the viewport");
  if (journey==="signup") {
    if (form) {
      for (const input of form.querySelectorAll("input")) input.value=input.type==="email" ? "qa@example.invalid" : "Browser check";
      form.requestSubmit();
      if (!form.querySelector("output").textContent.includes("Test response accepted")) issues.push("Test form failed");
    } else if (!(/^\/(?:signin-with-chatgpt\?return_to=|staging\/)/.test(signin?.getAttribute("href") || "") || document.querySelector("[data-customer-code]"))) issues.push("Sign-in entry missing");
  } else if (journey==="download") {
    const link=document.querySelector("a[download]");
    if (!link?.getAttribute("href")) issues.push("Download unavailable");
  } else {
    const links=document.querySelectorAll("header nav a");
    if (links.length>1) {
      links[1].click();
      if (links[1].getAttribute("aria-current")!=="page") issues.push("Second page could not open");
    }
  }
  parent.postMessage({kind:"launchpad-render-check",issues},"*");
}

// Opens the stable route through the creator's browser at both sizes.
async function checkReleaseInBrowser(path,expectedId) {
  const results=[];
  for (const width of [1280,390]) {
    const token=crypto.randomUUID(), frame=document.createElement("iframe");
    frame.setAttribute("aria-hidden","true");
    frame.style.cssText="position:fixed;left:-10000px;top:0;border:0;height:780px;width:"+width+"px";
    const url=new URL(path,location.origin);
    url.searchParams.set("studio_check",token);
    const checked=await new Promise(resolve=>{
      const finish=issues=>{clearTimeout(timer);window.removeEventListener("message",receive);frame.remove();resolve(issues);};
      function receive(event) {
        if (event.origin!==location.origin || event.source!==frame.contentWindow || event.data?.token!==token) return;
        finish(event.data.id===expectedId && Array.isArray(event.data.issues) ? event.data.issues : ["Unexpected release version"]);
      }
      const timer=setTimeout(()=>finish(["Timed out loading the product"]),10000);
      window.addEventListener("message",receive);
      frame.src=url.href;
      document.body.append(frame);
    });
    results.push({label:(width===390?"Mobile":"Desktop")+" browser journey"+(checked.length ? " · "+checked.join(", ") : ""),status:checked.length?"failed":"passed"});
  }
  return results;
}
