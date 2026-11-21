const commerceKey = /^[a-zA-Z0-9_-]{8,80}$/;
const commerceCurrencies = new Set(["usd","eur","gbp"]);
const commerceScope = "commerce-offers";
const commerceTestSecret = env => /^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(env.STRIPE_TEST_SECRET_KEY || "");
const commerceResponse = (payload,status=200) => Response.json(payload,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const commerceFail = (message,status=400) => { throw Object.assign(new Error(message),{commerceStatus:status}); };
function commerceSummary(offer) {
  const {id,projectId,name,summary,price,currency,kind,active,releaseId,version,updatedAt,demo} = offer;
  return {id,projectId,name,summary,price,currency,kind,active,releaseId,version,updatedAt,demo};
}
function commerceOrderView(order) {
  const {id,status,kind,price,fee,currency,mode,checkoutProvider,productName,releaseId,version,createdAt,updatedAt,paidAt,failedAt,refundedAt,refundAmount,email,source,campaign} = order;
  return {id,status,kind,price,fee,currency,mode,checkoutProvider,productName,releaseId,version,createdAt,updatedAt,paidAt,failedAt,refundedAt,refundAmount,email,source,campaign};
}
async function commerceJSON(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") || "")) commerceFail("Send a JSON request.",415);
  const reader = request.body?.getReader();
  if (!reader) commerceFail("Send a request body.");
  const chunks = [];
  let size = 0;
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.length;
    if (size > 256000) { void reader.cancel(); commerceFail("The listing is too large.",413); }
    chunks.push(item.value);
  }
  try {
    const value = JSON.parse(await new Blob(chunks).text());
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    return value;
  } catch { commerceFail("The JSON request is invalid."); }
}
async function commerceUpdate(env,id,mutator) {
  for (let attempt=0;attempt<10;attempt++) {
    const before = await readData(env,commerceScope,id);
    const next = mutator(before && structuredClone(before));
    if (next === undefined) return before;
    if (new TextEncoder().encode(JSON.stringify(next)).length > 1850000) commerceFail("The listing exceeded its saved order and version limit.",413);
    if (await dataCompareAndSwap(env,commerceScope,id,before,next)) return next;
  }
  commerceFail("The listing is busy. Retry the same operation.",409);
}
function commerceCustomer(request,required=true) {
  const id = request.headers.get("oai-authenticated-user-id");
  if (!id && required) commerceFail("Sign in with a creator or test customer account.",401);
  return id;
}
function commerceOwner(offer,user) {
  if (!offer || offer.owner !== user) commerceFail("Listing not found.",404);
}
function commerceSnapshot(code) {
  if (typeof code !== "string" || !/^[\w-]+$/.test(code) || code.length > 200000) commerceFail("Choose a valid release snapshot.");
  try {
    const bytes = Uint8Array.from(atob(code.replaceAll("-","+").replaceAll("_","/")),letter=>letter.charCodeAt(0));
    const project = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if (typeof releaseProjectFromSnapshot === "function") {
      const validated = releaseProjectFromSnapshot(code);
      if (releasePreflight(validated,{slug:"test-product",title:project.name}).some(issue=>issue.code==="possible-secret")) throw Error();
    }
    if (!["web","app","game","game3d"].includes(project.type) || typeof project.name !== "string" || project.name.length > 70) throw Error();
    return code;
  } catch { commerceFail("Choose a website, web app, or game snapshot."); }
}
function commerceText(value,max) {
  return typeof value === "string" ? value.trim().slice(0,max) : "";
}
async function commerceSaveOffer(request,env,id,user) {
  const input = await commerceJSON(request);
  const name = commerceText(input.name,70), summary = commerceText(input.summary,450);
  let demo = "";
  if (input.demo) {
    try {
      const url = new URL(input.demo);
      if (url.protocol !== "https:" || url.username || url.password || url.href.length > 400) throw Error();
      demo = url.href;
    } catch { commerceFail("Enter an HTTPS link for the optional customer demo."); }
  }
  if (!name || !summary || !Number.isInteger(input.price) || input.price < 100 || input.price > 10000000 ||
      !commerceCurrencies.has(input.currency) || !["access","download"].includes(input.kind)) commerceFail("Give the listing a name, description, price of at least 1.00, and delivery method.");
  let snapshot = commerceSnapshot(input.snapshot), releaseId, version;
  if (input.releaseSlug) {
    const doc = await readData(env,"release-slugs",input.releaseSlug);
    if (!doc || doc.owner !== user || doc.projectId !== id) commerceFail("The linked release is unavailable.",404);
    const live = doc.versions?.find(item => item.id === doc.live);
    if (!live) commerceFail("Publish a release before attaching it.");
    if (live.metadata?.visibility === "public") commerceFail("Attach a private release for paid delivery, or save a frozen draft for this test listing.");
    snapshot = commerceSnapshot(live.snapshot);
    releaseId = live.id;
    version = String(live.number);
  }
  const draftId = releaseId || crypto.randomUUID();
  const next = await commerceUpdate(env,id,previous=>{
    if (previous && previous.owner !== user) commerceFail("Listing not found.",404);
    const oldVersion = previous?.releases?.[previous.releaseId];
    const same = oldVersion?.snapshot === snapshot;
    const frozen = releaseId || (same ? previous.releaseId : draftId);
    const number = version || (same ? previous.version : String(Number(previous?.version || 0)+1));
    const releases = previous?.releases || {};
    const orders = previous?.orders || {};
    releases[frozen] = {snapshot,version:number};
    const retained = new Set([frozen,...Object.values(orders).map(order=>order.releaseId)]);
    for (const key of Object.keys(releases)) if (!retained.has(key)) delete releases[key];
    if (Object.keys(releases).length > 20) commerceFail("The listing has reached its archived version limit.",409);
    return {id,projectId:id,owner:user,name,summary,price:input.price,currency:input.currency,kind:input.kind,
      demo,active:input.active === true,releaseId:frozen,version:number,releases,orders,updatedAt:new Date().toISOString()};
  });
  return commerceResponse({offer:commerceSummary(next)});
}
async function commerceStripe(env,path,parameters,idempotency) {
  if (!commerceTestSecret(env)) commerceFail("Stripe test mode is unavailable.",503);
  const headers = {Authorization:"Bearer "+env.STRIPE_TEST_SECRET_KEY};
  if (idempotency) headers["Idempotency-Key"] = idempotency;
  if (parameters) headers["Content-Type"] = "application/x-www-form-urlencoded";
  let result;
  try {
    result = await fetch("https://api.stripe.com/v1"+path,{
      method:parameters?"POST":"GET", headers,
      body:parameters ? new URLSearchParams(parameters) : undefined,
      signal:AbortSignal.timeout(12000)
    });
  } catch { commerceFail("Stripe test mode is temporarily unavailable. Retry the same operation.",502); }
  if (!result.ok) commerceFail("Stripe test mode rejected the request. Check the test account and retry.",502);
  const object = await result.json();
  if (object.livemode === true) commerceFail("Only Stripe test transactions are supported.",409);
  return object;
}
function commerceWithStatus(order,status,fields={}) {
  const now = new Date().toISOString();
  const date = status === "paid" ? "paidAt" : status === "refunded" ? "refundedAt" : "failedAt";
  return {...order,...fields,status,updatedAt:now,[date]:order[date] || now};
}
function commerceEligible(offer,buyer) {
  return Object.values(offer.orders || {}).filter(order=>order.buyer===buyer);
}
async function commerceCheckout(request,env,offerId,user) {
  const input = await commerceJSON(request);
  if (!commerceKey.test(input.idempotency || "")) commerceFail("The checkout request is missing an idempotency key.");
  const provider = commerceTestSecret(env) ? "stripe" : "simulated";
  const id = input.idempotency;
  const failed = provider === "simulated" && input.outcome === "failure";
  const now = new Date().toISOString();
  const stored = await commerceUpdate(env,offerId,offer=>{
    if (!offer?.active) commerceFail("This product is not currently listed.",404);
    const existing = offer.orders[id];
    if (existing) {
      if (existing.buyer !== user) commerceFail("The checkout request already exists.",409);
      return undefined;
    }
    if (commerceEligible(offer,user).some(order=>order.status === "paid" && order.releaseId === offer.releaseId)) {
      commerceFail("This test account already has access to the release.",409);
    }
    if (Object.keys(offer.orders).length>=300) commerceFail("The listing has reached its test order limit.",409);
    const order = {id,buyer:user,kind:offer.kind,price:offer.price,fee:null,currency:offer.currency,productName:offer.name,
      releaseId:offer.releaseId,version:offer.version,mode:"test",checkoutProvider:provider,createdAt:now,updatedAt:now,status:"pending",
      source:commerceText(input.source,80),campaign:commerceText(input.campaign,80),email:commerceText(request.headers.get("oai-authenticated-user-email"),160)};
    offer.orders[id] = provider === "simulated"
      ? commerceWithStatus(order,failed?"failed":"paid",{fee:failed ? 0 : Math.min(order.price,Math.round(order.price*.029)+30)}) : order;
    return offer;
  });
  let order = stored.orders[id];
  if (order.checkoutProvider !== "stripe" || order.status !== "pending") return commerceResponse({order:commerceOrderView(order)});
  const base = new URL(request.url).origin+"/?store="+encodeURIComponent(offerId);
  const stripe = order.sessionId ? await commerceStripe(env,"/checkout/sessions/"+encodeURIComponent(order.sessionId)) :
    await commerceStripe(env,"/checkout/sessions",{
      mode:"payment","payment_method_types[0]":"card",
      "line_items[0][quantity]":"1","line_items[0][price_data][currency]":order.currency,
      "line_items[0][price_data][unit_amount]":String(order.price),"line_items[0][price_data][product_data][name]":order.productName,
      success_url:base+"&checkout="+encodeURIComponent(id),cancel_url:base+"&cancel="+encodeURIComponent(id),
      client_reference_id:id,"metadata[listing]":offerId,"metadata[order]":id,
      "payment_intent_data[metadata][listing]":offerId,"payment_intent_data[metadata][order]":id,
      ...(order.email ? {customer_email:order.email} : {})
    },"launchpad-checkout-"+offerId+"-"+id);
  if (!order.sessionId) {
    const next = await commerceUpdate(env,offerId,offer=>{
      if (offer.orders[id]?.sessionId) return undefined;
      offer.orders[id].sessionId = stripe.id;
      return offer;
    });
    order = next.orders[id];
  }
  if (stripe.payment_status === "paid" || stripe.status === "expired") {
    order = await commerceSyncStripe(env,offerId,order,stripe);
  }
  const checkout = typeof stripe.url === "string" && stripe.url.startsWith("https://checkout.stripe.com/") ? stripe.url : null;
  return commerceResponse({order:commerceOrderView(order),checkout:order.status === "pending" ? checkout : null});
}
async function commerceSyncStripe(env,offerId,order,session) {
  if (session.id !== order.sessionId || session.livemode !== false || session.metadata?.order !== order.id ||
      session.metadata?.listing !== offerId || session.currency !== order.currency || session.amount_total !== order.price) {
    commerceFail("Stripe test checkout could not be matched to the order.",409);
  }
  const status = session.payment_status === "paid" ? "paid" : session.status === "expired" ? "failed" : null;
  const finalNeedsFee = ["paid","refunded"].includes(order.status) && order.fee === null && status === "paid";
  if (!status || (order.status !== "pending" && !finalNeedsFee)) return order;
  let fee = order.fee;
  if (status === "paid" && typeof session.payment_intent === "string") {
    try {
      const intent = await commerceStripe(env,"/payment_intents/"+encodeURIComponent(session.payment_intent)+"?expand%5B%5D=latest_charge.balance_transaction");
      const amount = intent.latest_charge?.balance_transaction?.fee;
      if (intent.id === session.payment_intent && intent.metadata?.listing === offerId &&
          intent.metadata?.order === order.id && Number.isInteger(amount) && amount >= 0) fee = amount;
    } catch { /* Fee information can settle after checkout. */ }
  }
  const next = await commerceUpdate(env,offerId,offer=>{
    const existing = offer?.orders[order.id];
    if (!existing) return undefined;
    if (existing.status === "pending") {
      offer.orders[order.id] = commerceWithStatus(existing,status,{fee,paymentIntent:session.payment_intent});
    } else if (["paid","refunded"].includes(existing.status) && existing.fee === null &&
        fee !== null && existing.paymentIntent === session.payment_intent) {
      offer.orders[order.id] = {...existing,fee,updatedAt:new Date().toISOString()};
    } else return undefined;
    return offer;
  });
  return next.orders[order.id];
}
async function commerceRefreshStripe(env,offerId,order) {
  if (order.checkoutProvider === "stripe" && order.sessionId &&
      (order.status === "pending" || (["paid","refunded"].includes(order.status) && order.fee === null))) {
    return commerceSyncStripe(env,offerId,order,await commerceStripe(env,"/checkout/sessions/"+encodeURIComponent(order.sessionId)));
  }
  return order;
}
async function commerceRefund(env,offerId,orderId,user) {
  const offer = await readData(env,commerceScope,offerId);
  commerceOwner(offer,user);
  const order = offer.orders[orderId];
  if (!order || !["paid","refunded"].includes(order.status)) commerceFail("Only paid test orders can be refunded.",409);
  if (order.status === "paid" && order.checkoutProvider === "stripe") {
    if (!order.paymentIntent) commerceFail("Refresh and reconcile the Stripe order before refunding it.",409);
    const refund = await commerceStripe(env,"/refunds",{payment_intent:order.paymentIntent},"launchpad-refund-"+offerId+"-"+orderId);
    if (refund.status !== "succeeded") commerceFail("Stripe has not completed the test refund. Retry later.",409);
  }
  const next = await commerceUpdate(env,offerId,value=>{
    const existing = value.orders[orderId];
    if (existing.status === "refunded") return undefined;
    value.orders[orderId] = commerceWithStatus(existing,"refunded",{refundAmount:existing.price});
    return value;
  });
  return commerceResponse({order:commerceOrderView(next.orders[orderId])});
}
async function commerceWebhook(request,env) {
  const secret = env.STRIPE_TEST_WEBHOOK_SECRET;
  if (!commerceTestSecret(env) || typeof secret !== "string" || !secret.startsWith("whsec_")) {
    commerceFail("Configure a Stripe test webhook signing secret.",503);
  }
  const fields = (request.headers.get("Stripe-Signature") || "").split(",").map(field=>field.trim());
  const stamp = fields.find(field=>field.startsWith("t="))?.slice(2);
  const signatures = fields.filter(field=>/^v1=[a-f0-9]{64}$/.test(field)).slice(0,8).map(field=>field.slice(3));
  if (!/^\d{7,14}$/.test(stamp || "") || Math.abs(Date.now()/1000 - Number(stamp)) > 300 || !signatures.length) {
    commerceFail("Stripe signature is invalid.",401);
  }
  const reader = request.body?.getReader();
  if (!reader) commerceFail("Stripe event body is empty.");
  const chunks = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.length;
    if (length>256000) { void reader.cancel(); commerceFail("Stripe event is too large.",413); }
    chunks.push(chunk.value);
  }
  const payload = await new Blob(chunks).text();
  const encode = new TextEncoder();
  const key = await crypto.subtle.importKey("raw",encode.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC",key,encode.encode(stamp+"."+payload)));
  const expected = Array.from(digest,byte=>byte.toString(16).padStart(2,"0")).join("");
  const matched = signatures.some(signature=>{
    let difference = 0;
    for (let i=0;i<64;i++) difference |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    return difference === 0;
  });
  if (!matched) commerceFail("Stripe signature is invalid.",401);
  let event;
  try { event = JSON.parse(payload); } catch { commerceFail("Stripe event could not be read."); }
  if (event?.livemode !== false) commerceFail("Only Stripe test transactions are supported.",409);
  if (!["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.expired","refund.created","refund.updated"].includes(event.type)) return commerceResponse({received:true});
  const data = event.data?.object;
  if (!data || data.livemode !== false) commerceFail("Only Stripe test transactions are supported.",409);
  if (event.type.startsWith("checkout.")) {
    const {listing,order:orderId} = data.metadata || {};
    if (!commerceKey.test(listing || "") || !commerceKey.test(orderId || "")) return commerceResponse({received:true});
    const offer = await readData(env,commerceScope,listing);
    const order = offer?.orders[orderId];
    if (order?.checkoutProvider === "stripe") await commerceSyncStripe(env,listing,order,data);
  } else if (data.status === "succeeded" && typeof data.payment_intent === "string") {
    const intent = await commerceStripe(env,"/payment_intents/"+encodeURIComponent(data.payment_intent));
    const listing = intent.metadata?.listing, id = intent.metadata?.order;
    if (commerceKey.test(listing || "") && commerceKey.test(id || "")) await commerceUpdate(env,listing,offer=>{
      const order = offer?.orders[id];
      if (order?.checkoutProvider !== "stripe" || order.status !== "paid" || order.paymentIntent !== data.payment_intent ||
          data.amount !== order.price || data.currency !== order.currency) return undefined;
      offer.orders[id] = commerceWithStatus(order,"refunded",{refundAmount:order.price});
      return offer;
    });
  }
  return commerceResponse({received:true});
}
async function handleCommerce(request,env) {
  const url = new URL(request.url), path = url.pathname.slice("/api/commerce".length).split("/").filter(Boolean);
  const method = request.method;
  try {
    const webhook = path.length === 1 && path[0] === "stripe-webhook" && method === "POST";
    if (!webhook && method !== "GET" && request.headers.get("Origin") !== url.origin) commerceFail("Use a same-origin commerce request.",403);
    if (!env.LAUNCHPAD_DATA) commerceFail("Commerce storage is unavailable. Configure the workspace database.",503);
    if (webhook) return await commerceWebhook(request,env);
    if (path.some(part=>part.length > 100)) commerceFail("Listing not found.",404);
    if (!path.length && method === "GET") {
      const user = commerceCustomer(request);
      const records = (await listData(env,commerceScope)).map(item=>item.value).filter(offer=>offer.owner===user);
      return commerceResponse({
        provider:commerceTestSecret(env) ? "stripe" : "simulated",
        offers:records.map(commerceSummary),
        orders:records.flatMap(offer=>Object.values(offer.orders).map(order=>({...commerceOrderView(order),offerId:offer.id,projectId:offer.projectId,productName:order.productName})))
      });
    }
    if (path[0] === "offers" && path.length === 2 && method === "PUT" && commerceKey.test(path[1])) {
      return await commerceSaveOffer(request,env,path[1],commerceCustomer(request));
    }
    if (path[0] === "offers" && path.length === 4 && path[3] === "refund" && method === "POST" && commerceKey.test(path[1]) && commerceKey.test(path[2])) {
      return await commerceRefund(env,path[1],path[2],commerceCustomer(request));
    }
    if (path[0] === "offers" && path.length === 4 && path[3] === "reconcile" && method === "POST" && commerceKey.test(path[1]) && commerceKey.test(path[2])) {
      const offer = await readData(env,commerceScope,path[1]);
      commerceOwner(offer,commerceCustomer(request));
      if (!Object.hasOwn(offer.orders,path[2])) commerceFail("Order not found.",404);
      return commerceResponse({order:commerceOrderView(await commerceRefreshStripe(env,path[1],offer.orders[path[2]]))});
    }
    if (path[0] !== "store" || !commerceKey.test(path[1] || "")) commerceFail("Listing not found.",404);
    const id = path[1], offer = await readData(env,commerceScope,id);
    const user = commerceCustomer(request,false);
    const orders = offer && user ? commerceEligible(offer,user) : [];
    if (!offer || (!offer.active && offer.owner!==user && !orders.length)) commerceFail("Listing not found.",404);
    if (path.length === 2 && method === "GET") {
      return commerceResponse({offer:commerceSummary(offer),orders:orders.map(commerceOrderView),signedIn:!!user,provider:commerceTestSecret(env)?"stripe":"simulated"});
    }
    if (path.length === 3 && path[2] === "checkout" && method === "POST") {
      return await commerceCheckout(request,env,id,commerceCustomer(request));
    }
    if (path.length === 4 && ["delivery","refresh"].includes(path[2]) && commerceKey.test(path[3])) {
      commerceCustomer(request);
      const order = orders.find(item=>item.id===path[3]);
      if (!order) commerceFail("Order not found.",404);
      if (path[2] === "refresh" && method === "POST") {
        return commerceResponse({order:commerceOrderView(await commerceRefreshStripe(env,id,order))});
      }
      if (path[2] === "delivery" && method === "GET") {
        if (order.status !== "paid") commerceFail("This test order no longer has product access.",403);
        return commerceResponse({snapshot:offer.releases[order.releaseId].snapshot,order:commerceOrderView(order)});
      }
    }
    commerceFail("Commerce route not found.",404);
  } catch (error) {
    return commerceResponse({error:error.commerceStatus ? error.message : "Commerce data could not be loaded. Retry in a moment."},error.commerceStatus || 503);
  }
}
