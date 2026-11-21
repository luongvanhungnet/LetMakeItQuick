const OPS_DAY = 86_400_000;
const OPS_RELEASE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const OPS_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const OPS_ISSUES = new Set(["release-view-failed","project-render-failed","media-load-failed"]);
const OPS_MODES = ["live","test"];

function opsAt(input) {
  if (typeof input === "number") return Number.isFinite(input) ? input : NaN;
  return typeof input === "string" ? Date.parse(input) : NaN;
}
function opsDate(timestamp) { return new Date(timestamp).toISOString().slice(0,10); }
function opsTag(value) {
  if (typeof value !== "string") return "";
  const tag = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,47}$/.test(tag) ? tag : "";
}
function opsOrigin(request) { return new URL(request.url).origin; }
function opsResponse(value,status = 200) {
  return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
function opsLiveRelease(record) { return record?.versions?.find(version=>version.id === record.live); }
function opsOwnerScope(owner) { return "operations:"+owner; }
function opsEventScope(owner) { return "operation-events:"+owner; }
function opsCohortScope(owner) { return "operation-cohorts:"+owner; }
const OPS_WEEK = 7*OPS_DAY;
function opsWeek(timestamp) { return Math.floor((timestamp-4*OPS_DAY)/OPS_WEEK)*OPS_WEEK+4*OPS_DAY; }

async function recordCohortVisit(env,owner,release,user,now = Date.now()) {
  if (env.LAUNCHPAD_RETENTION_ANALYTICS !== "enabled" || !user || user === owner ||
      !OPS_ID.test(release.projectId || "") || !OPS_ID.test(release.id || "")) return;
  const bytes = new TextEncoder().encode(JSON.stringify([owner,release.projectId,user]));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  const key = Array.from(hash,byte=>byte.toString(16).padStart(2,"0")).join("");
  const week = opsWeek(now);
  await updateData(env,opsCohortScope(owner),key,(before)=>{
    const cutoff = week-12*OPS_WEEK;
    const history = (before?.weeks || []).filter(item=>item.week >= cutoff);
    let entry = history.find(item=>item.week === week);
    if (!entry) { entry = {week,versions:[]}; history.push(entry); }
    if (!entry.versions.includes(release.id) && entry.versions.length < 12) entry.versions.push(release.id);
    return {projectId:release.projectId,first:before?.first ?? week,weeks:history};
  });
}
function summarizeCohorts(records,{now = Date.now(),days=30,projectId="",releaseId=""}={}) {
  const cutoff = opsWeek(now-days*OPS_DAY);
  const cohorts = new Map();
  for (const entry of records) {
    if (entry.first < cutoff || (projectId && entry.projectId !== projectId)) continue;
    const first = entry.weeks.find(week=>week.week === entry.first);
    if (!first || (releaseId && !first.versions.includes(releaseId))) continue;
    let cohort = cohorts.get(entry.first);
    if (!cohort) { cohort = {week:entry.first,visitors:0,returning:[0,0,0,0]}; cohorts.set(entry.first,cohort); }
    cohort.visitors++;
    for (const week of entry.weeks) {
      const index = (week.week-entry.first)/OPS_WEEK-1;
      if (index >= 0 && index < 4) cohort.returning[index]++;
    }
  }
  return [...cohorts.values()].sort((a,b)=>b.week-a.week)
    .map(cohort=>({...cohort,week:opsDate(cohort.week),
      returning:cohort.returning.map((count,index)=>cohort.week+(index+1)*OPS_WEEK>opsWeek(now)?null:count)}));
}

async function readSupportSettings(env,owner) {
  if (!env.LAUNCHPAD_DATA || !owner) return {supportUrl:""};
  const record = await readData(env,opsOwnerScope(owner),"settings");
  return {supportUrl:record?.supportUrl || ""};
}
function opsSupportUrl(value) {
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 400) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
async function deleteOperationsData(env,owner) {
  for (const scope of [opsOwnerScope(owner),opsEventScope(owner),opsCohortScope(owner)]) {
    for (const {key} of await listData(env,scope)) await deleteData(env,scope,key);
  }
}

function opsAttribution(request) {
  const {searchParams,origin} = new URL(request.url);
  const campaign = opsTag(searchParams.get("utm_campaign"));
  let source = opsTag(searchParams.get("utm_source"));
  if (!source && request.headers.has("Referer")) {
    try {
      const referrer = new URL(request.headers.get("Referer"));
      if (referrer.origin !== origin && ["https:","http:"].includes(referrer.protocol)) source = opsTag(referrer.hostname.replace(/^www\./,""));
    } catch { /* Referrer is optional. */ }
  }
  return {campaign,source:source || "direct"};
}

async function recordOperation(env,owner,type,details = {}) {
  if (!env.LAUNCHPAD_DATA || !owner || !["visit","signup","application_error"].includes(type)) return;
  const {projectId,releaseId,mode} = details;
  if (!OPS_ID.test(projectId ?? "") || !OPS_ID.test(releaseId ?? "") || !OPS_MODES.includes(mode)) return;
  const source = opsTag(details.source) || "direct", campaign = opsTag(details.campaign);
  const code = OPS_ISSUES.has(details.code) ? details.code : "";
  if (type === "application_error" && !code) return;
  const timestamp = Date.now(), day = opsDate(timestamp);
  const audience = {projectId,releaseId,mode,source,campaign,type,code};
  const eventKey = JSON.stringify(Object.values(audience));
  await updateData(env,opsEventScope(owner),day,(value)=>{
    const groups = value?.groups || {};
    const previous = groups[eventKey];
    if (!previous && Object.keys(groups).length >= 1200) return value;
    return {groups:{...groups,[eventKey]:{...audience,count:Math.min((previous?.count || 0)+1,1_000_000_000),lastAt:timestamp}}};
  });
}
async function recordReleaseVisit(request,env,owner,release,mode = "live") {
  const purpose = request.headers.get("Sec-Purpose") || request.headers.get("Purpose") || "";
  if (request.method !== "GET" || request.headers.has("X-Launchpad-Probe") || /prefetch|prerender/i.test(purpose)) return;
  try {
    const viewer = request.headers.get("oai-authenticated-user-id");
    const audience = viewer === owner || release.metadata?.visibility === "private" ? "test" : mode;
    await recordOperation(env,owner,"visit",{projectId:release.projectId,releaseId:release.id,mode:audience,...opsAttribution(request)});
    if (audience === "live") await recordCohortVisit(env,owner,release,viewer);
  } catch {
    // A metrics write should never prevent a product from loading.
  }
}
async function recordHostedApplicationError(env,owner,release,code,mode = "live") {
  try {
    await recordOperation(env,owner,"application_error",{projectId:release.projectId,releaseId:release.id,mode,code});
  } catch { /* A diagnostics write should never prevent error recovery. */ }
}
function opsEmptyTotals() {
  return {visits:0,signups:0,purchases:0,refunds:0,failedPayments:0,applicationErrors:0,money:{}};
}
function opsAccumulate(totals,event) {
  const key = {visit:"visits",signup:"signups",purchase:"purchases",refund:"refunds",payment_failed:"failedPayments",application_error:"applicationErrors"}[event.type];
  if (!key) return;
  totals[key] += event.count || 1;
  if (!event.currency || !["purchase","refund"].includes(event.type)) return;
  const money = totals.money[event.currency] ??= {gross:0,fees:0,refunded:0,net:0};
  if (event.type === "purchase") {
    money.gross += event.amount;
    money.fees += event.fee;
  } else {
    money.refunded += event.amount;
    money.fees -= event.fee;
  }
  money.net = money.gross-money.refunded-money.fees;
}
function opsFinalize(totals) {
  return {...totals,conversion:totals.visits ? totals.purchases/totals.visits : null};
}
function opsMoney(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function opsOrderEvents(offer) {
  const events = [];
  for (const order of Object.values(offer.orders || {})) {
    if (!order || !OPS_MODES.includes(order.mode)) continue;
    const currency = typeof order.currency === "string" && /^[a-z]{3}$/i.test(order.currency) ? order.currency.toUpperCase() : "";
    const info = {projectId:offer.projectId,releaseId:order.releaseId || "",mode:order.mode,source:opsTag(order.source) || "direct",campaign:opsTag(order.campaign),currency,ref:order.id};
    const legacyPaid = ["paid","refunded"].includes(order.status) ? (order.status === "refunded" ? order.createdAt : order.updatedAt) : undefined;
    const paid = opsAt(order.paidAt || legacyPaid);
    if (Number.isFinite(paid)) events.push({...info,type:"purchase",timestamp:paid,amount:opsMoney(order.price),fee:opsMoney(order.fee)});
    const refunded = opsAt(order.refundedAt || (order.status === "refunded" ? order.updatedAt : undefined));
    if (Number.isFinite(refunded)) events.push({...info,type:"refund",timestamp:refunded,amount:opsMoney(order.refundAmount ?? order.price),fee:opsMoney(order.refundFee)});
    const failed = opsAt(order.failedAt || (order.status === "failed" ? order.updatedAt : undefined));
    if (Number.isFinite(failed)) events.push({...info,type:"payment_failed",timestamp:failed});
  }
  return events;
}

function opsBuildReport(events,{days,mode,projectId,releaseId,now}) {
  const end = Date.parse(opsDate(now))+OPS_DAY;
  const start = end-days*OPS_DAY, previousStart = start-days*OPS_DAY;
  const current = opsEmptyTotals(), previous = opsEmptyTotals();
  const series = Array.from({length:days},(_,index)=>({date:opsDate(start+index*OPS_DAY),...opsEmptyTotals()}));
  const campaigns = new Map(), releases = new Map(), alerts = [];
  for (const event of events) {
    if (event.mode !== mode || (projectId && event.projectId !== projectId) || (releaseId && event.releaseId !== releaseId) ||
        !Number.isFinite(event.timestamp) || event.timestamp < previousStart || event.timestamp >= end) continue;
    if (event.timestamp < start) { opsAccumulate(previous,event); continue; }
    opsAccumulate(current,event);
    opsAccumulate(series[Math.floor((event.timestamp-start)/OPS_DAY)],event);
    const source = event.source || "direct", campaign = event.campaign || "";
    const key = JSON.stringify([source,campaign]);
    if (!campaigns.has(key)) campaigns.set(key,{source,campaign,...opsEmptyTotals()});
    opsAccumulate(campaigns.get(key),event);
    if (!releases.has(event.releaseId)) releases.set(event.releaseId,{releaseId:event.releaseId,projectId:event.projectId,...opsEmptyTotals()});
    opsAccumulate(releases.get(event.releaseId),event);
    if (["payment_failed","application_error"].includes(event.type)) {
      const anchor = event.type === "payment_failed" ? event.ref : event.releaseId+":"+event.code+":"+opsDate(event.timestamp);
      alerts.push({id:event.type+":"+anchor,type:event.type,at:event.lastAt || event.timestamp,projectId:event.projectId,
        releaseId:event.releaseId,ref:event.ref,count:event.count || 1,code:event.code});
    }
  }
  return {
    mode,days,start:opsDate(start),end:opsDate(end-OPS_DAY),current:opsFinalize(current),previous:opsFinalize(previous),
    series:series.map(opsFinalize),
    campaigns:[...campaigns.values()].map(opsFinalize).sort((a,b)=>b.visits+b.purchases-a.visits-a.purchases),
    releases:[...releases.values()].map(opsFinalize).sort((a,b)=>b.visits+b.purchases-a.visits-a.purchases),
    alerts:alerts.sort((a,b)=>b.at-a.at).slice(0,50)
  };
}

async function opsOwnedReleases(env,owner) {
  return (await listData(env,"release-slugs")).filter(({value})=>value?.owner === owner);
}
async function opsCheckRelease(request,env,owner,slug) {
  if (!OPS_RELEASE.test(slug ?? "")) return opsResponse({error:"Select a hosted release."},400);
  const record = await readData(env,"release-slugs",slug);
  const release = opsLiveRelease(record);
  if (record?.owner !== owner || !release) return opsResponse({error:"Release unavailable."},404);
  return opsResponse({check:await opsProbe(env,opsOrigin(request),owner,slug,record,release)});
}
async function opsProbe(env,origin,owner,slug,record,release) {
  const start = Date.now();
  const result = {slug,releaseId:release.id,projectId:record.projectId,checkedAt:start,status:0,ok:false,restricted:false};
  try {
    const response = await fetch(new URL("/launch/"+slug,origin),{method:"HEAD",redirect:"manual",
      headers:{"X-Launchpad-Probe":"uptime"},signal:AbortSignal.timeout(7000)});
    result.status = response.status;
    result.ok = response.ok;
    result.restricted = [301,302,303,307,308,401,403].includes(response.status);
  } catch { /* Report a failed availability connection. */ }
  result.latencyMs = Date.now()-start;
  await updateData(env,opsOwnerScope(owner),"checks",(checks)=>[result,...(checks || [])].slice(0,60));
  return result;
}
async function runScheduledOperations(env) {
  if (!env.LAUNCHPAD_DATA || !env.LAUNCHPAD_PUBLIC_ORIGIN) return;
  let origin;
  try { origin = new URL(env.LAUNCHPAD_PUBLIC_ORIGIN); } catch { return; }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.href !== origin.origin+"/") return;
  const rows = (await listData(env,"release-slugs")).filter(row=>OPS_RELEASE.test(row.key) &&
    opsLiveRelease(row.value)?.metadata?.visibility === "public");
  if (!rows.length) return;
  const cap = 20, scope = "operations-system";
  const next = await updateData(env,scope,"probe-offset",old=>((Number.isInteger(old)?old:0)+cap)%rows.length);
  const start = (next-cap%rows.length+rows.length)%rows.length;
  for (let i=0;i<Math.min(cap,rows.length);i+=4) {
    await Promise.all(Array.from({length:Math.min(4,Math.min(cap,rows.length)-i)},async(_,j)=>{
      const {key:slug,value:record} = rows[(start+i+j)%rows.length];
      const release = opsLiveRelease(record);
      const check = await opsProbe(env,origin.origin,record.owner,slug,record,release);
      if (!check.ok) {
        await recordHostedApplicationError(env,record.owner,{...release,projectId:record.projectId},"release-view-failed","live");
      }
    }));
  }
}

async function handleOperations(request,env) {
  const owner = request.headers.get("oai-authenticated-user-id");
  const url = new URL(request.url);
  if (!env.LAUNCHPAD_DATA) return opsResponse({error:"Connect workspace storage to open Operations."},503);
  if (url.pathname === "/api/operations/report") {
    if (request.method !== "POST") return opsResponse({error:"Method unavailable."},405);
    if (request.headers.get("Origin") !== url.origin) return opsResponse({error:"Origin unavailable."},403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) return opsResponse({error:"JSON is required."},415);
    const input = await opsReadInput(request);
    if (input instanceof Response) return input;
    if (!OPS_RELEASE.test(input.slug ?? "") || !OPS_ID.test(input.releaseId ?? "") || !OPS_ISSUES.has(input.code)) return opsResponse({error:"Unknown report."},400);
    const record = await readData(env,"release-slugs",input.slug);
    const release = opsLiveRelease(record);
    if (!release || release.id !== input.releaseId || (release.metadata?.visibility === "private" && owner !== record.owner)) {
      return opsResponse({error:"Release unavailable."},404);
    }
    const mode = owner === record.owner || release.metadata?.visibility === "private" ? "test" : "live";
    await recordHostedApplicationError(env,record.owner,{...release,projectId:record.projectId},input.code,mode);
    return opsResponse({reported:true});
  }
  if (!owner) return opsResponse({error:"Sign in to view workspace operations."},401);
  if (request.method === "GET" && url.pathname === "/api/operations") {
    const days = [7,30,90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
    const mode = url.searchParams.get("mode") === "test" ? "test" : "live";
    const projectId = url.searchParams.get("project") || "", releaseId = url.searchParams.get("release") || "";
    if ((projectId && !OPS_ID.test(projectId)) || (releaseId && !OPS_ID.test(releaseId))) return opsResponse({error:"Invalid report filter."},400);
    const cohortEnabled = mode === "live" && env.LAUNCHPAD_RETENTION_ANALYTICS === "enabled";
    const [track,offers,releaseData,settings,checks,dismissals,cohortData] = await Promise.all([
      listData(env,opsEventScope(owner)),listData(env,"commerce-offers"),opsOwnedReleases(env,owner),readSupportSettings(env,owner),
      readData(env,opsOwnerScope(owner),"checks"),readData(env,opsOwnerScope(owner),"dismissals"),
      cohortEnabled ? listData(env,opsCohortScope(owner)) : []
    ]);
    const events = track.flatMap(({key,value})=>Object.values(value?.groups || {}).map(event=>({...event,timestamp:Date.parse(key)})));
    const ownOffers = offers.map(({value})=>value).filter(offer=>offer?.owner === owner);
    for (const offer of ownOffers) events.push(...opsOrderEvents(offer));
    const report = opsBuildReport(events,{days,mode,projectId,releaseId,now:Date.now()});
    report.alerts = report.alerts.filter(alert=>!(dismissals || []).includes(alert.id));
    const releases = releaseData.flatMap(({key,value})=>(value.versions || []).map(version=>({
      slug:key,id:version.id,number:version.number,projectId:value.projectId,title:version.metadata?.title || key,
      live:value.live === version.id,visibility:version.metadata?.visibility
    })));
    const cohorts = cohortEnabled ? summarizeCohorts(cohortData.map(row=>row.value),{days,projectId,releaseId}) : null;
    return opsResponse({report,releases,settings,cohorts,checks:checks || [],reconciliation:{
      source:"commerce order ledger",
      sandboxReady:ownOffers.some(offer=>Object.values(offer.orders || {}).some(order=>order.checkoutProvider === "stripe" && ["paid","refunded"].includes(order.status))),
      pending:ownOffers.reduce((count,offer)=>count+Object.values(offer.orders || {}).filter(order=>order.mode === mode && order.status === "pending").length,0)
    }});
  }
  if (request.method !== "POST") return opsResponse({error:"Method unavailable."},405);
  if (request.headers.get("Origin") !== url.origin) return opsResponse({error:"Origin unavailable."},403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) return opsResponse({error:"JSON is required."},415);
  const input = await opsReadInput(request);
  if (input instanceof Response) return input;
  switch (url.pathname) {
    case "/api/operations/settings": {
      const supportUrl = opsSupportUrl(input.supportUrl);
      if (supportUrl === null) return opsResponse({error:"Enter an HTTPS support URL."},400);
      await writeData(env,opsOwnerScope(owner),"settings",{supportUrl});
      return opsResponse({supportUrl});
    }
    case "/api/operations/check":
      return opsCheckRelease(request,env,owner,input.slug);
    case "/api/operations/simulate": {
      if (!OPS_RELEASE.test(input.slug ?? "")) return opsResponse({error:"Select a release to simulate an error."},400);
      const record = await readData(env,"release-slugs",input.slug);
      const release = opsLiveRelease(record);
      if (record?.owner !== owner || !release) return opsResponse({error:"Release unavailable."},404);
      await recordOperation(env,owner,"application_error",{projectId:record.projectId,releaseId:release.id,mode:"test",source:"simulator",code:"project-render-failed"});
      return opsResponse({simulated:true});
    }
    case "/api/operations/dismiss":
      if (typeof input.id !== "string" || input.id.length > 180) return opsResponse({error:"Invalid alert."},400);
      await updateData(env,opsOwnerScope(owner),"dismissals",(ids)=>[input.id,...(ids || []).filter(id=>id !== input.id)].slice(0,200));
      return opsResponse({dismissed:true});
    default:
      return opsResponse({error:"Unknown operations endpoint."},404);
  }
}
async function opsReadInput(request) {
  const reader = request.body?.getReader();
  if (!reader) return opsResponse({error:"Enter a request body."},400);
  const decoder = new TextDecoder("utf-8",{fatal:true});
  let input = "", length = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 6000) { void reader.cancel().catch(()=>{}); return opsResponse({error:"Request too large."},413); }
      input += decoder.decode(value,{stream:true});
    }
    const data = JSON.parse(input+decoder.decode());
    return data && typeof data === "object" && !Array.isArray(data) ? data : opsResponse({error:"Invalid request."},400);
  } catch { return opsResponse({error:"Invalid request."},400); }
}
