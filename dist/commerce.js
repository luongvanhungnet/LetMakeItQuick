"use strict";

const commerceCategory = type => ["web","app","game","game3d"].includes(type);
const commerceMoney = (value,currency) => Number.isFinite(value) ? new Intl.NumberFormat(undefined,{
  style:"currency",currency:currency.toUpperCase()
}).format(value/100) : "Pending";
const commerceSafeName = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50) || "project";
const commerceStoreURL = id => new URL("/?store="+encodeURIComponent(id),location.origin).href;
const commerceOrderLabels = {pending:"Pending",paid:"Paid",failed:"Failed",refunded:"Refunded"};

async function commerceFetch(path,method="GET",body) {
  const response = await fetch("/api/commerce"+path,{method,headers:body === undefined ? undefined : {"Content-Type":"application/json"},
    body:body === undefined ? undefined : JSON.stringify(body)});
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Commerce is unavailable on this host."); }
  if (!response.ok) throw new Error(data.error || "Commerce request failed.");
  return data;
}
function commerceDownload(blob,filename) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(href),30000);
}
async function commerceArtifact(project) {
  const image = project.hideTemplate ? null : templateFor(project)?.image;
  const paths = new Set(image ? ["media/"+image] : []);
  const addAsset = path => { if (path && assetByPath.has(path)) paths.add(path); };
  for (const {content} of projectPages(project)) for (const block of content.blocks || []) {
    if (["image","downloads"].includes(block.type)) addAsset(block.b);
  }
  if (isGameType(project.type)) {
    for (const id of [project.game.background,...Object.values(project.game.cells)]) addAsset(assetById.get(id)?.path);
  }
  const assets = {};
  await Promise.all([...paths].map(async path=>{
    const response = await fetch(new URL(path,location.origin+"/"));
    if (!response.ok) throw Error("The package could not load "+path+".");
    const blob = await response.blob();
    assets[path] = await new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>reject(Error("The package could not embed "+path+"."));
      reader.readAsDataURL(blob);
    });
  }));
  let html;
  if (isGameType(project.type)) {
    const style = await fetch("/game-play.css");
    if (!style.ok) throw Error("The game stylesheet is unavailable.");
    html = gameHTML(project,assets,await style.text());
  } else html = projectHTML(project,assets["media/"+image],assets);
  return {html,paths:[...paths],assets};
}
function commerceIcon(project) {
  const letter = Array.from(project.name.trim())[0] || "L";
  const color = /^#[0-9a-f]{6}$/i.test(project.color || "") ? project.color : "#321c75";
  return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="95" fill="'+color+'"/><text x="256" y="350" text-anchor="middle" font-family="system-ui,sans-serif" font-size="270" font-weight="700" fill="#fff">'+esc(letter.toUpperCase())+'</text></svg>';
}
async function commercePreviewCover(project,assets) {
  const canvas = document.createElement("canvas");
  canvas.width=1200;canvas.height=630;
  const ctx = canvas.getContext("2d");
  const color = /^#[0-9a-f]{6}$/i.test(project.color || "") ? project.color : "#321c75";
  ctx.fillStyle = color;
  ctx.fillRect(0,0,1200,630);
  const picture = Object.entries(assets).find(([path])=>/\.(?:jpg|png)$/i.test(path))?.[1];
  if (picture) {
    const image = new Image();
    image.src = picture;
    try {
      await image.decode();
      const ratio = Math.max(550/image.width,630/image.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(650,0,550,630);
      ctx.clip();
      ctx.drawImage(image,650+(550-image.width*ratio)/2,(630-image.height*ratio)/2,image.width*ratio,image.height*ratio);
      ctx.restore();
    } catch {}
  }
  ctx.fillStyle = "rgba(9,7,25,0.45)";
  ctx.fillRect(0,0,picture ? 650 : 1200,630);
  ctx.fillStyle = "white";
  ctx.font = "700 24px system-ui";
  ctx.fillText(typeLabel(project.type).toUpperCase(),62,125,520);
  ctx.font = "700 72px system-ui";
  ctx.fillText(project.name,62,310,picture ? 535 : 1070);
  ctx.font = "500 28px system-ui";
  ctx.fillText(project.title || project.name,62,390,picture ? 535 : 1070);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(Error("The product cover could not be created.")),"image/png"));
}
function commerceLicenses(paths,project) {
  const lines = paths.map(path=>{
    if (["media/forest.jpg","media/coffee.jpg","media/interior.jpg"].includes(path)) return "- "+path+" — bundled photo. Original source, author, and redistribution license are unverified. Replace or confirm the rights before distribution.";
    return "- "+path+" — bundled Launchpad asset. Redistribution terms have not been verified.";
  });
  for (const {content} of projectPages(project)) for (const block of content.blocks || []) {
    if (block.type === "image" && block.imageData) {
      lines.push("- "+(block.a || "Uploaded image")+" — "+(block.credit || "Attribution missing")+"; "+(block.license || "License missing"));
    } else if (["image","video","audio","downloads"].includes(block.type) && /^https:\/\//.test(block.b || "")) {
      lines.push("- "+block.b+" — external asset. Verify attribution and usage terms.");
    }
  }
  return "# Asset rights\n\n"+(lines.join("\n") || "No bundled assets were identified.")+"\n\nConfirm rights for all supplied screenshots, video, external media and content before storefront submission.\n";
}
const commercePilot = "https://itch.io/docs/creators/html5";
async function makeCommerceReleasePackage(project,listing={},files={}) {
  const artifact = await commerceArtifact(project);
  const version = String(listing.version || 1).slice(0,40);
  const cover = await commercePreviewCover(project,artifact.assets);
  return createReleaseZip({
    "product/index.html":artifact.html,
    "VERSION.txt":version+"\n",
    "INSTALL.md":"# Install\n\nExtract the package and open product/index.html in a current browser. A 3D game requires WebGL. External links and hosted services may need an internet connection.\n\nThis package contains browser HTML. Choose the installable web app export or a separately built native package when a storefront requires one.\n",
    "CHANGELOG.md":"# Changelog\n\n## Version "+version+"\n\n"+(listing.changes || "Initial packaged release.")+"\n",
    "ASSET-LICENSES.md":commerceLicenses(artifact.paths,project),
    "listing/description.txt":project.name+"\n\n"+(listing.summary || project.intro || "Explore "+project.name)+
      (listing.link ? "\n\nProduct link: "+listing.link : "")+"\n",
    "listing/icon.svg":commerceIcon(project),
    "listing/cover.png":cover,
    "listing/README.md":"# Store listing\n\nThe cover is generated from the project name, theme, and available media. Supply actual product screenshots and promo video in the listing kit when available.\n",
    "listing/itch-io-checklist.md":"# itch.io HTML5 pilot checklist\n\n- [ ] Review the [HTML5 upload guide]("+commercePilot+").\n- [ ] Use the itch.io browser ZIP from Launchpad or ZIP the contents of product/ separately. Confirm index.html is at the archive root.\n- [ ] Choose HTML as the project type and enable browser playback for the upload.\n- [ ] Test responsive behavior, controls, audio, and performance on the itch.io draft page.\n- [ ] Add an icon, a description, real screenshots, a promo video, pricing, and license information.\n- [ ] Test the customer download before publishing.\n",
    ...files
  });
}
function commercePackageForm(project,offer) {
  openDialog("Release ZIP and listing kit",'<form id="commerce-package"><label class="field">Version<input name="version" value="'+esc(offer?.version || "1")+'" required maxlength="40"></label>'+
    (project.hostedSlug ? '<label class="commerce-checkbox"><input type="checkbox" name="hosted" checked> Package the live release version</label>' : "")+
    '<label class="field">Changelog<textarea name="changes" rows="3" maxlength="3000" placeholder="What changed in this release?"></textarea></label>'+
    '<label class="field">Product screenshots (optional)<input name="screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>'+
    '<label class="field">Promo video (optional)<input name="promo" type="file" accept="video/mp4,video/webm"></label>'+
    '<p class="subtext">Includes the browser product, install guide, asset rights, a cover, and an itch.io submission checklist.</p>'+
    '<div class="dialog-actions"><button type="submit" class="primary">Download ZIP</button><button type="submit" class="secondary" value="itch">itch.io browser ZIP</button><a class="secondary" href="'+commercePilot+'" target="_blank" rel="noopener">itch.io requirements</a></div><p id="commerce-package-status" class="subtext" role="status"></p></form>');
  const form = $("#commerce-package"), status = $("#commerce-package-status");
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const buttons = [...form.querySelectorAll("button[type=submit]")];
    if (buttons.some(button=>button.disabled)) return;
    for (const button of buttons) button.disabled = true;
    status.textContent = "Preparing release files…";
    try {
      const data = new FormData(form);
      let version = data.get("version"), source = project;
      const files = {};
      if (data.has("hosted")) {
        const response = await fetch("/api/releases/view/"+encodeURIComponent(project.hostedSlug));
        if (!response.ok) throw Error("The live release could not be loaded. Clear this option to package your current draft.");
        const {release} = await response.json();
        source = readSnapshot("#view="+release.snapshot);
        version = release.number;
      }
      if (event.submitter?.value === "itch") {
        const {html} = await commerceArtifact(source);
        const upload = await createReleaseZip({"index.html":html});
        commerceDownload(upload,commerceSafeName(source.name)+"-"+commerceSafeName(version)+"-itch.zip");
        status.textContent = "itch.io browser ZIP downloaded.";
        return;
      }
      const screenshots = [...form.elements.screenshots.files], promo = form.elements.promo.files[0];
      if (screenshots.length > 8 || screenshots.some(file=>!/^image\/(?:png|jpeg|webp)$/.test(file.type) || file.size > 10000000)) {
        throw Error("Choose up to eight PNG, JPEG or WebP screenshots of 10 MB each.");
      }
      screenshots.forEach((file,index)=>{ files["listing/screenshot-"+(index+1)+"."+file.type.split("/")[1]] = file; });
      if (promo) {
        if (!/^video\/(?:mp4|webm)$/.test(promo.type) || promo.size>100000000) throw Error("Choose an MP4 or WebM promo video of 100 MB or less.");
        files["listing/promo."+promo.type.split("/")[1]] = promo;
      }
      const blob = await makeCommerceReleasePackage(source,{...offer,version,changes:data.get("changes")},files);
      commerceDownload(blob,commerceSafeName(source.name)+"-"+commerceSafeName(version)+".zip");
      status.textContent = "Release ZIP downloaded.";
    } catch (error) { status.textContent = error.message; }
    finally { for (const button of buttons) button.disabled = false; }
  });
}

function commerceOwnerOrders(orders) {
  if (!orders.length) return '<p class="subtext">Orders will appear here after a test checkout.</p>';
  return '<div class="commerce-table"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Amount</th><th scope="col">Fee</th><th scope="col">Action</th></tr></thead><tbody>'+orders.map(order=>
    '<tr><td>'+esc(order.id.slice(0,8))+'</td><td>'+esc(order.email || "Test account")+'</td><td>'+esc(commerceOrderLabels[order.status])+'</td>'+
    '<td>'+esc(commerceMoney(order.price,order.currency))+'</td><td>'+esc(commerceMoney(order.fee,order.currency))+'</td><td>'+
    (order.status==="paid" ? '<button type="button" class="secondary" data-commerce-refund="'+esc(order.id)+'">Refund</button>' : "")+
    (order.checkoutProvider==="stripe" && (order.status==="pending" || (["paid","refunded"].includes(order.status) && order.fee===null))
      ? '<button type="button" class="secondary" data-commerce-reconcile="'+esc(order.id)+'">Reconcile</button>' : "")+'</td></tr>').join("")+'</tbody></table></div>';
}
function commerceTotals(orders) {
  const results = new Map();
  for (const order of orders) {
    if (!["paid","refunded"].includes(order.status)) continue;
    if (!results.has(order.currency)) results.set(order.currency,{gross:0,fees:0,refunds:0,pending:false});
    const amount = results.get(order.currency);
    amount.gross += order.price;
    amount.fees += order.fee || 0;
    amount.pending ||= order.fee === null;
    if (order.status === "refunded") amount.refunds += order.refundAmount || order.price;
  }
  return [...results].map(([currency,{gross,fees,refunds,pending}]) => {
    const money = value => esc(commerceMoney(value,currency));
    return '<dl class="commerce-money"><div><dt>Gross</dt><dd>'+money(gross)+'</dd></div><div><dt>Fees</dt><dd>'+money(fees)+(pending?" + pending":"")+'</dd></div><div><dt>Refunds</dt><dd>'+money(refunds)+'</dd></div><div><dt>Net</dt><dd>'+money(gross-fees-refunds)+(pending?" before pending fees":"")+'</dd></div></dl>';
  }).join("");
}
async function openCommerce(project) {
  if (!project || !commerceCategory(project.type)) return toast("Sales packages support websites, web apps and games.");
  openDialog("Sell and package",'<p class="subtext">Prepare a release package and test your checkout.</p><div id="commerce-owner"><p role="status">Loading commerce…</p></div>');
  const owner = $("#commerce-owner");
  let data, issue;
  try { data = await commerceFetch(""); } catch (error) { issue = error.message; }
  if (!owner.isConnected) return;
  const offer = data?.offers.find(item=>item.projectId===project.id);
  const orders = data?.orders.filter(item=>item.projectId===project.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)) || [];
  owner.innerHTML = '<div class="dialog-actions"><button type="button" class="secondary" id="commerce-package-open">Release ZIP and listing kit</button>'+
    (offer?.active ? '<a class="secondary" href="'+esc(commerceStoreURL(offer.id))+'" target="_blank" rel="noopener">Open store preview</a>' : "")+'</div>'+
    '<p class="subtext">Browser HTML, an installable web app, and a native store submission are separate package types.</p>'+
    (issue ? '<p role="status" class="subtext">'+esc(issue)+'</p>' :
      '<form id="commerce-listing"><h3>Test listing</h3><p class="subtext">'+(data.provider==="stripe"?"Using Stripe Checkout test mode.":"Using the sandbox simulator. It records test orders without charging customers.")+'</p>'+
      '<div class="commerce-grid"><label class="field">Listing name<input name="name" maxlength="70" required value="'+esc(offer?.name || project.name)+'"></label>'+
      '<label class="field">Delivery<select name="kind"><option value="download" '+(offer?.kind==="download"?"selected":"")+'>Digital download</option><option value="access" '+(offer?.kind==="access"?"selected":"")+'>Hosted access</option></select></label></div>'+
      '<label class="field">Description<textarea name="summary" maxlength="450" required>'+esc(offer?.summary || project.intro || "Explore "+project.name)+'</textarea></label>'+
      '<div class="commerce-grid"><label class="field">Price<input type="number" name="price" min="1" max="100000" step=".01" required value="'+esc(offer ? (offer.price/100).toFixed(2) : "9.00")+'"></label>'+
      '<label class="field">Currency<select name="currency">'+["usd","eur","gbp"].map(code=>'<option value="'+code+'" '+(code===offer?.currency?"selected":"")+'>'+code.toUpperCase()+'</option>').join("")+'</select></label></div>'+
      '<label class="field">Free demo link (optional)<input type="url" name="demo" maxlength="400" placeholder="https://example.com/demo" value="'+esc(offer?.demo || "")+'"></label>'+
      '<label class="commerce-checkbox"><input type="checkbox" name="active" '+(offer?.active?"checked":"")+'> Show listing to test customers</label>'+
      (project.hostedSlug ? '<label class="commerce-checkbox"><input type="checkbox" name="release" checked> Attach the latest hosted release</label>' : "")+
      '<div class="dialog-actions"><button class="primary" type="submit">Save test listing</button></div><p class="subtext" id="commerce-listing-status" role="status"></p></form>'+
      '<section class="commerce-orders"><h3>Test orders</h3>'+commerceTotals(orders)+commerceOwnerOrders(orders)+'<p id="commerce-order-status" role="status"></p></section>'+
      '<details class="commerce-setup"><summary>Payment and payout setup</summary><ol><li>Create or open a Stripe test account and enable card payments.</li><li>Add its test key as the server-side <code>STRIPE_TEST_SECRET_KEY</code>. If the host accepts Stripe callbacks, use <code>/api/commerce/stripe-webhook</code> with <code>STRIPE_TEST_WEBHOOK_SECRET</code>.</li><li>Run successful and declined checkouts in the test account. Refresh a pending order from the buyer listing to check its state.</li><li>Review fees and refunds in Stripe. Real payouts require a live account and are outside this test workspace.</li></ol></details>');
  owner.querySelector("#commerce-package-open").addEventListener("click",()=>commercePackageForm(structuredClone(project),offer));
  if (issue) return;
  const listing = owner.querySelector("#commerce-listing"), status = owner.querySelector("#commerce-listing-status");
  listing.addEventListener("submit",async event=>{
    event.preventDefault();
    const fields = new FormData(listing), button = listing.querySelector("button[type=submit]");
    const snapshot = new URL(snapshotLink(project)).hash.slice(6);
    button.disabled = true;
    status.textContent = "Saving listing…";
    try {
      await commerceFetch("/offers/"+encodeURIComponent(project.id),"PUT",{
        name:fields.get("name"),summary:fields.get("summary"),price:Math.round(Number(fields.get("price"))*100),
        currency:fields.get("currency"),kind:fields.get("kind"),demo:fields.get("demo"),active:fields.has("active"),
        releaseSlug:fields.has("release") ? project.hostedSlug : undefined,snapshot
      });
      toast("Test listing saved.");
      if (owner.isConnected) void openCommerce(project);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  for (const button of owner.querySelectorAll("[data-commerce-refund]")) button.addEventListener("click",async ()=>{
    const alert = owner.querySelector("#commerce-order-status");
    if (button.dataset.confirm !== "yes") { button.dataset.confirm = "yes"; button.textContent = "Confirm refund"; return; }
    button.disabled = true;
    try {
      await commerceFetch("/offers/"+encodeURIComponent(project.id)+"/"+encodeURIComponent(button.dataset.commerceRefund)+"/refund","POST",{});
      toast("Test refund recorded and customer access removed.");
      if (owner.isConnected) void openCommerce(project);
    } catch (error) { alert.textContent = error.message; }
    finally { button.disabled = false; }
  });
  for (const button of owner.querySelectorAll("[data-commerce-reconcile]")) button.addEventListener("click",async ()=>{
    const status = owner.querySelector("#commerce-order-status");
    button.disabled = true;
    try {
      const {order} = await commerceFetch("/offers/"+encodeURIComponent(project.id)+"/"+encodeURIComponent(button.dataset.commerceReconcile)+"/reconcile","POST",{});
      toast(order.fee === null && ["paid","refunded"].includes(order.status) ? "Stripe has not posted the fee yet." : "Stripe test order reconciled.");
      if (owner.isConnected) void openCommerce(project);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
function commerceReceipt(offer,order) {
  const receipt = "Launchpad Studio test receipt\n\nProduct: "+(order.productName || offer.name)+"\nOrder: "+order.id+"\nStatus: "+commerceOrderLabels[order.status]+
    "\nAmount: "+commerceMoney(order.price,order.currency)+"\nPayment date: "+(order.paidAt || order.createdAt)+"\nRelease: "+order.version+
    (order.refundedAt ? "\nRefunded: "+order.refundedAt : "")+"\n";
  commerceDownload(new Blob([receipt],{type:"text/plain;charset=utf-8"}),"test-receipt-"+order.id.slice(0,8)+".txt");
}
async function renderCommerceStore(id) {
  const root = $("#published");
  $("#studio").hidden = true;
  root.hidden = false;
  root.innerHTML = '<section class="commerce-store panel"><p role="status">Loading product…</p></section>';
  try {
    const {offer,orders,provider,signedIn} = await commerceFetch("/store/"+encodeURIComponent(id));
    document.title = offer.name+" | Launchpad Store";
    const query = new URLSearchParams(location.search), resultId = query.get("checkout");
    const pending = orders.find(order=>order.id===resultId && order.status==="pending");
    if (pending && provider==="stripe") {
      const response = await commerceFetch("/store/"+encodeURIComponent(id)+"/refresh/"+encodeURIComponent(pending.id),"POST",{});
      Object.assign(pending,response.order);
    }
    const eligible = orders.some(order=>order.status==="paid" && order.releaseId===offer.releaseId);
    const signIn = "/signin-with-chatgpt?return_to="+encodeURIComponent(location.pathname+location.search);
    root.innerHTML = '<div class="commerce-store"><section class="panel commerce-product"><span class="tag">Test storefront</span><h1>'+esc(offer.name)+'</h1><p>'+esc(offer.summary)+'</p>'+
      '<dl class="commerce-product-facts"><div><dt>Price</dt><dd>'+esc(commerceMoney(offer.price,offer.currency))+'</dd></div><div><dt>Delivery</dt><dd>'+(offer.kind==="download"?"Digital download":"Hosted access")+'</dd></div><div><dt>Release</dt><dd>'+esc(offer.version)+'</dd></div></dl>'+
      '<div class="dialog-actions">'+(offer.demo?'<a class="secondary" href="'+esc(offer.demo)+'" target="_blank" rel="noopener noreferrer">Open free demo</a>':"")+
      (signedIn && offer.active && !eligible ? '<button type="button" class="primary" data-checkout="success">Start test checkout</button>'+
      (provider==="simulated"?'<button type="button" class="secondary" data-checkout="failure">Simulate decline</button>':"") : "")+
      (!signedIn && offer.active?'<a class="secondary" href="'+esc(signIn)+'" target="_top">Sign in to test checkout</a>':"")+
      '</div><p class="subtext" id="test-checkout-status" role="status">'+(query.has("cancel")?"Checkout canceled.":eligible?"This test account has the current release.":"")+'</p></section>'+
      (orders.length?'<section class="panel"><h2>My test orders</h2>'+orders.map(order=>'<div class="commerce-store-order"><div><strong>'+
      esc(commerceOrderLabels[order.status])+'</strong><p class="subtext">'+esc(commerceMoney(order.price,order.currency))+' · Release '+esc(order.version)+' · '+esc(order.id.slice(0,8))+'</p></div><div class="dialog-actions">'+
      (order.status==="paid" ? '<button class="primary" data-delivery="'+esc(order.id)+'">'+(order.kind==="download"?"Download release":"Open product")+'</button>' : "")+
      (["paid","refunded"].includes(order.status)?'<button class="secondary" data-receipt="'+esc(order.id)+'">Receipt</button>':"")+
      (order.status==="pending" && order.checkoutProvider==="stripe"?'<button class="secondary" data-refresh="'+esc(order.id)+'">Refresh payment</button>':"")+
      '</div></div>').join("")+'</section>':"")+'<div id="commerce-delivery"></div><a href="/">Launchpad Studio</a></div>';
    const status = root.querySelector("#test-checkout-status");
    let inFlight = false;
    const checkoutKeys = new Map();
    root.querySelectorAll("[data-checkout]").forEach(button=>button.addEventListener("click",async ()=>{
      if (inFlight) return;
      inFlight = true;
      const outcome = button.dataset.checkout;
      if (!checkoutKeys.has(outcome)) checkoutKeys.set(outcome,crypto.randomUUID());
      button.disabled = true;
      status.textContent = "Opening test checkout…";
      try {
        const data = await commerceFetch("/store/"+encodeURIComponent(id)+"/checkout","POST",{
          outcome,idempotency:checkoutKeys.get(outcome),source:query.get("utm_source"),campaign:query.get("utm_campaign")
        });
        if (data.checkout) { location.assign(data.checkout); return; }
        await renderCommerceStore(id);
      } catch (error) { status.textContent = error.message; }
      finally { inFlight=false; button.disabled=false; }
    }));
    root.querySelectorAll("[data-receipt]").forEach(button=>button.addEventListener("click",()=>{
      const order = orders.find(item=>item.id===button.dataset.receipt);
      commerceReceipt(offer,order);
    }));
    root.querySelectorAll("[data-refresh]").forEach(button=>button.addEventListener("click",async ()=>{
      button.disabled=true;
      try {
        await commerceFetch("/store/"+encodeURIComponent(id)+"/refresh/"+encodeURIComponent(button.dataset.refresh),"POST",{});
        await renderCommerceStore(id);
      } catch (error) { status.textContent=error.message; }
      finally { button.disabled=false; }
    }));
    root.querySelectorAll("[data-delivery]").forEach(button=>button.addEventListener("click",async ()=>{
      button.disabled=true;
      status.textContent="Preparing your test purchase…";
      try {
        const {snapshot,order} = await commerceFetch("/store/"+encodeURIComponent(id)+"/delivery/"+encodeURIComponent(button.dataset.delivery));
        const project = readSnapshot("#view="+snapshot);
        if (order.kind === "download") {
          const blob = await makeCommerceReleasePackage(project,{...offer,version:order.version});
          commerceDownload(blob,commerceSafeName(project.name)+"-"+commerceSafeName(order.version)+".zip");
          status.textContent="Release downloaded.";
        } else {
          const outlet = root.querySelector("#commerce-delivery");
          stopPublishedGame();
          stopPublishedGame = isGameType(project.type) ? mountGame(outlet,project,true) : mountPublishedPages(outlet,project);
          outlet.scrollIntoView({block:"start"});
          status.textContent="Product ready.";
        }
      } catch (error) { status.textContent=error.message; }
      finally { button.disabled=false; }
    }));
  } catch (error) {
    root.innerHTML = '<section class="commerce-store panel"><h1>Product unavailable</h1><p role="status">'+esc(error.message)+'</p><a href="/">Launchpad Studio</a></section>';
  }
}
function maybeOpenCommerceListing() {
  const id = new URLSearchParams(location.search).get("store");
  if (!id) return false;
  void renderCommerceStore(id);
  return true;
}
