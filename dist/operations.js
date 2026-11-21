"use strict";

const opsMetrics = {
  visits:"Visits",signups:"Signups",purchases:"Purchases",conversion:"Purchase conversion",net:"Net revenue",refunds:"Refunds"
};
const opsNumber = new Intl.NumberFormat();
const opsPercent = new Intl.NumberFormat(undefined,{style:"percent",maximumFractionDigits:1});
function opsMetric(key,value) {
  if (key === "conversion") return value === null ? "—" : opsPercent.format(value);
  if (key === "net") {
    return opsCurrencyList(value, "net");
  }
  return opsNumber.format(value || 0);
}
function opsCurrencyList(value,field) {
  return Object.entries(value || {}).map(([currency,amounts])=>new Intl.NumberFormat(undefined,{
    style:"currency",currency
  }).format(amounts[field]/100)).join(" · ") || "—";
}
function opsMetricValue(key,totals) { return key === "net" ? totals.money : totals[key]; }
function opsReleaseLink(slug) { return "/launch/"+encodeURIComponent(slug); }
function opsHumanDate(at) { return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(at)); }
async function opsRequest(path,body,options = {}) {
  const response = await fetch(path,body === undefined ? options : {...options,method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Operations could not load.");
  return data;
}
function opsTable(headers,rows,empty) {
  if (!rows.length) return '<p class="subtext">'+esc(empty)+'</p>';
  return '<div class="ops-table"><table><thead><tr>'+headers.map(heading=>'<th scope="col">'+esc(heading)+'</th>').join("")+
    '</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';
}
function opsChart(report) {
  const metrics = ["visits","signups","purchases","refunds","conversion"].map(key=>
    [opsMetrics[key],report.series.map(entry=>entry[key]),value=>opsMetric(key,value)]);
  for (const currency of Object.keys(report.current.money)) {
    const money = new Intl.NumberFormat(undefined,{style:"currency",currency});
    metrics.push(["Net revenue · "+currency,report.series.map(entry=>entry.money[currency]?.net || 0),amount=>money.format(amount/100)]);
  }
  const charts = metrics.map(([label,values,format])=>{
    const max = Math.max(0,...values), min = Math.min(0,...values);
    const height = max-min || 1, baseline = -min/height*100;
    const bars = report.series.map((entry,index)=>{
      const value = values[index] || 0;
      return '<span title="'+esc(entry.date+" · "+format(values[index]))+'" style="--amount:'+Math.round(Math.abs(value)/height*100)+'%;--offset:'+(value < 0 ? (value-min)/height*100 : baseline)+'%"></span>';
    }).join("");
    return '<figure><figcaption>'+esc(label)+'</figcaption><div class="ops-bars" aria-hidden="true">'+bars+'</div>'+
      '<p class="subtext">'+esc(format(values[0]))+' on '+esc(report.start)+' · '+esc(format(values.at(-1)))+' on '+esc(report.end)+'</p></figure>';
  });
  const daily = report.series.map(entry=>'<tr>'+[entry.date,entry.visits,entry.signups,entry.purchases,entry.refunds,
    opsMetric("conversion",entry.conversion),opsCurrencyList(entry.money,"net")].map(value=>'<td>'+esc(value)+'</td>').join("")+'</tr>');
  return '<div class="ops-charts">'+charts.join("")+'</div><details class="ops-section"><summary>Daily metrics</summary>'+
    opsTable(["Date","Visits","Signups","Purchases","Refunds","Conversion","Net revenue"],daily,"No activity.")+'</details>';
}
function opsCsv(data) {
  function field(value) {
    let string = String(value ?? "");
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(string)) string = "'"+string;
    return '"'+string.replaceAll('"','""')+'"';
  }
  const rows = [["group","label","mode","visits","signups","purchases","refunds","failed payments","application errors","conversion","currency","gross minor units","fees minor units","refunded minor units","net minor units"]];
  function add(group,label,entry) {
    const money = Object.entries(entry.money || {});
    for (const [currency,amounts] of money.length ? money : [["",{}]]) {
      rows.push([group,label,data.mode,entry.visits,entry.signups,entry.purchases,entry.refunds,entry.failedPayments,entry.applicationErrors,entry.conversion,
        currency,amounts.gross,amounts.fees,amounts.refunded,amounts.net]);
    }
  }
  data.series.forEach(entry=>add("day",entry.date,entry));
  data.campaigns.forEach(entry=>add("campaign",entry.source+" / "+(entry.campaign || "none"),entry));
  data.releases.forEach(entry=>add("release",entry.releaseId,entry));
  return rows.map(row=>row.map(field).join(",")).join("\r\n");
}
function opsDownload(content,name,type) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function opsOption(label,value,chosen) {
  return '<option value="'+esc(value)+'" '+(value === chosen?"selected":"")+'>'+esc(label)+'</option>';
}
function opsDigest(data,filters) {
  const {report,releases,settings,checks,reconciliation,cohorts} = data;
  const byId = new Map(releases.map(release=>[release.id,release]));
  const active = releases.filter(release=>release.live);
  const projectOptions = Array.from(new Map(releases.map(release=>[release.projectId,release.title])));
  const matching = releases.filter(release=>!filters.project || release.projectId === filters.project);
  const selectedRelease = active.some(release=>release.slug === filters.slug) ? filters.slug : active[0]?.slug || "";
  const filterMarkup = '<div class="ops-filters"><label class="field">Activity<select data-ops-filter="mode">'+opsOption("Customer","live",filters.mode)+opsOption("Test","test",filters.mode)+'</select></label>'+
    '<label class="field">Date range<select data-ops-filter="days">'+[7,30,90].map(days=>opsOption("Last "+days+" days",String(days),filters.days)).join("")+'</select></label>'+
    '<label class="field">Project<select data-ops-filter="project">'+opsOption("All projects","",filters.project)+projectOptions.map(([id,name])=>opsOption(name,id,filters.project)).join("")+'</select></label>'+
    '<label class="field">Release<select data-ops-filter="release">'+opsOption("All versions","",filters.release)+matching.map(release=>opsOption(release.title+" · v"+release.number,release.id,filters.release)).join("")+'</select></label></div>';
  const cards = Object.entries(opsMetrics).map(([key,label])=>'<div class="ops-card"><span>'+label+'</span><strong>'+esc(opsMetric(key,opsMetricValue(key,report.current)))+'</strong><small>Prior period '+esc(opsMetric(key,opsMetricValue(key,report.previous)))+'</small></div>').join("");
  const campaignRows = report.campaigns.map(entry=>'<tr>'+[entry.source,entry.campaign || "—",entry.visits,entry.signups,entry.purchases,opsMetric("conversion",entry.conversion)].map(value=>'<td>'+esc(value)+'</td>').join("")+'</tr>');
  const releaseRows = report.releases.map(entry=>{
    const release = byId.get(entry.releaseId);
    return '<tr>'+[release?.title || "Unassigned",release ? "v"+release.number : "—",entry.visits,entry.signups,entry.purchases,opsMetric("conversion",entry.conversion)].map(value=>'<td>'+esc(value)+'</td>').join("")+'</tr>';
  });
  const alerts = report.alerts.length ? '<ul class="ops-alerts">'+report.alerts.map(alert=>{
    const affected = byId.get(alert.releaseId);
    const description = alert.type === "payment_failed" ? "Payment failed" : {
      "release-view-failed":"Release could not load","project-render-failed":"Product could not render","media-load-failed":"Product media failed to load"
    }[alert.code] || "Application error";
    return '<li><div><strong>'+description+'</strong><p class="subtext">'+esc(opsHumanDate(alert.at))+
      (alert.count > 1 ? ' · '+alert.count+' reports' : '')+
      (alert.ref ? ' · Order '+esc(alert.ref) : '')+
      (affected ? ' · <a href="'+opsReleaseLink(affected.slug)+'" target="_blank" rel="noopener">View release</a>' : '')+
      '</p></div><button class="filter" type="button" data-ops-dismiss="'+esc(alert.id)+'">Dismiss</button></li>';
  }).join("")+'</ul>' : '<p class="subtext">No active alerts in this period.</p>';
  const checkRows = checks.filter(check=>(!filters.project || check.projectId === filters.project) && (!filters.release || check.releaseId === filters.release)).slice(0,15).map(check=>
    '<tr><td>'+esc(opsHumanDate(check.checkedAt))+'</td><td><a href="'+opsReleaseLink(check.slug)+'" target="_blank" rel="noopener">'+esc(check.slug)+'</a></td>'+
    '<td>'+esc(check.ok?"Reachable":check.restricted?"Access restricted":check.status?"HTTP "+check.status:"Unreachable")+'</td><td>'+esc(check.latencyMs)+' ms</td></tr>');
  const selected = active.length ? '<label class="field">Hosted release<select id="ops-slug">'+active.map(release=>opsOption(release.title+" · v"+release.number,release.slug,selectedRelease)).join("")+'</select></label>' :
    '<p class="subtext">Publish a hosted release to create campaign links or run an availability check.</p>';
  return '<div class="ops-toolbar">'+filterMarkup+'<button class="secondary" type="button" data-ops-action="csv">Download CSV</button></div>'+
    '<p class="subtext">'+esc(report.start)+' to '+esc(report.end)+' UTC · '+(report.mode === "test"?"Staging and sandbox activity":"Customer activity")+'</p><div class="ops-cards">'+cards+'</div>'+
    opsChart(report)+
    '<section class="ops-section"><h3>Campaigns</h3>'+opsTable(["Source","Campaign","Visits","Signups","Purchases","Conversion"],campaignRows,"No campaign activity in this period.")+'</section>'+
    '<section class="ops-section"><h3>Release funnel</h3>'+opsTable(["Project","Version","Visits","Signups","Purchases","Conversion"],releaseRows,"No release activity in this period.")+'</section>'+
    (Array.isArray(cohorts) ? '<section class="ops-section"><h3>Signed-in visitor retention</h3>'+
      '<p class="subtext">Cohorts group signed-in visitors by the UTC week of their first tracked visit. A return means a visit in a later week.</p>'+
      opsTable(["First week","Visitors","Week 1","Week 2","Week 3","Week 4"],cohorts.map(cohort=>'<tr>'+
        [cohort.week,cohort.visitors,...cohort.returning.map(count=>count ?? "—")].map(value=>'<td>'+esc(value)+'</td>').join("")+
        '</tr>'),"No signed-in visitors in this period.")+'</section>' : "")+
    '<section class="ops-section"><h3>Revenue reconciliation</h3><div class="ops-revenue"><div><span>Gross sales</span><strong>'+esc(opsCurrencyList(report.current.money,"gross"))+'</strong></div>'+
    '<div><span>Fees</span><strong>'+esc(opsCurrencyList(report.current.money,"fees"))+'</strong></div><div><span>Refunded</span><strong>'+esc(opsCurrencyList(report.current.money,"refunded"))+'</strong></div></div>'+
    '<p class="subtext">Totals are calculated from the commerce order ledger. '+reconciliation.pending+' pending orders in this activity mode. '+
    (reconciliation.sandboxReady?"Stripe sandbox orders are included after verification.":"No verified Stripe sandbox orders have been recorded.")+'</p></section>'+
    '<section class="ops-section"><h3>Availability and alerts</h3>'+selected+
    (active.length?'<div class="dialog-actions"><button class="secondary" type="button" data-ops-action="check">Run availability check</button><button class="secondary" type="button" data-ops-action="simulate">Simulate a test error</button></div>':'')+
    opsTable(["Checked","Release","Result","Latency"],checkRows,"No availability checks yet.")+alerts+'</section>'+
    (active.length?'<section class="ops-section"><h3>Campaign link</h3><form id="ops-campaign-form"><div class="ops-filters"><label class="field">Source<input name="source" maxlength="48" pattern="[A-Za-z0-9][A-Za-z0-9_.-]*" required placeholder="newsletter"></label><label class="field">Campaign<input name="campaign" maxlength="48" pattern="[A-Za-z0-9][A-Za-z0-9_.-]*" placeholder="spring-launch"></label></div><button class="secondary" type="submit">Create link</button><label class="field" id="ops-campaign-result" hidden>Share URL<input readonly></label></form></section>':'')+
    '<section class="ops-section"><h3>Support and data</h3><form id="ops-support-form"><label class="field">Customer support URL<input name="supportUrl" type="url" maxlength="400" placeholder="https://example.com/help" value="'+esc(settings.supportUrl)+'"></label><div class="dialog-actions"><button class="secondary" type="submit">Save support link</button><button class="secondary" type="button" data-ops-action="export">Export operations data</button></div></form></section>'+
    '<details class="ops-section"><summary>Metric definitions</summary><p class="subtext">Visits count hosted page loads, including repeat visits. Signups count successful customer account registrations reported by connected flows. Purchases and refunds count settled orders and their refund events in the selected period. Conversion is purchases divided by visits. Net revenue is gross sales minus refunds and fees. Currencies are reported separately. Test activity is excluded from customer totals.</p></details>';
}
function openOperations() {
  openDialog("Operations",'<div class="operations-board"><p class="subtext" id="ops-status" role="status">Loading workspace activity…</p><div id="ops-content" aria-busy="true"></div></div>');
  const board = $(".operations-board"), status = $("#ops-status"), content = $("#ops-content");
  const filters = {mode:"live",days:"30",project:"",release:"",slug:""};
  let data, busy = false, loadId = 0;
  async function refresh() {
    const id = ++loadId;
    content.setAttribute("aria-busy","true");
    try {
      const query = new URLSearchParams({mode:filters.mode,days:filters.days,project:filters.project,release:filters.release});
      const next = await opsRequest("/api/operations?"+query);
      if (id !== loadId || !board.isConnected) return;
      data = next;
      content.innerHTML = opsDigest(data,filters);
    } catch (error) {
      if (id === loadId && board.isConnected) content.innerHTML = '<p class="subtext">'+esc(error.message)+'</p>';
    } finally {
      if (id === loadId && board.isConnected) content.setAttribute("aria-busy","false");
    }
  }
  board.addEventListener("change",event=>{
    if (event.target.id === "ops-slug") { filters.slug = event.target.value; return; }
    const key = event.target.dataset.opsFilter;
    if (!key) return;
    filters[key] = event.target.value;
    if (key === "project") filters.release = "";
    void refresh();
  });
  async function mutate(path,payload,message,after) {
    if (busy) return;
    busy = true;
    status.textContent = "Working…";
    try {
      const result = await opsRequest(path,payload);
      if (!board.isConnected) return;
      if (after) after();
      status.textContent = typeof message === "function" ? message(result) : message;
      await refresh();
    } catch (error) {
      if (board.isConnected) status.textContent = error.message;
    } finally { busy = false; }
  }
  board.addEventListener("submit",event=>{
    event.preventDefault();
    const form = event.target;
    if (form.id === "ops-support-form") {
      void mutate("/api/operations/settings",{supportUrl:form.elements.supportUrl.value.trim()},"Support link saved.");
    } else if (form.id === "ops-campaign-form") {
      const slug = board.querySelector("#ops-slug")?.value;
      if (!slug) return;
      const url = new URL(opsReleaseLink(slug),location.origin);
      url.searchParams.set("utm_source",form.elements.source.value.trim().toLowerCase());
      if (form.elements.campaign.value.trim()) url.searchParams.set("utm_campaign",form.elements.campaign.value.trim().toLowerCase());
      const result = form.querySelector("#ops-campaign-result");
      result.hidden = false;
      const field = result.querySelector("input");
      field.value = url.href;
      field.select();
    }
  });
  board.addEventListener("click",event=>{
    const button = event.target.closest("button");
    if (!button || !data) return;
    const {opsAction:action,opsDismiss:dismiss} = button.dataset;
    const slug = board.querySelector("#ops-slug")?.value || "";
    if (dismiss) { void mutate("/api/operations/dismiss",{id:dismiss},"Alert dismissed."); return; }
    if (action === "csv") opsDownload(opsCsv(data.report),"launchpad-operations-"+data.report.mode+".csv","text/csv;charset=utf-8");
    if (action === "export") opsDownload(JSON.stringify(data,null,2),"launchpad-operations.json","application/json");
    if (action === "check") void mutate("/api/operations/check",{slug},({check})=>check.ok?"Availability check passed.":check.restricted?"Availability check reached an access restriction.":"Availability check failed. See the result below.");
    if (action === "simulate") void mutate("/api/operations/simulate",{slug},"Test error recorded.",()=>{ filters.mode = "test"; });
  });
  void refresh().then(()=>{ if (status.textContent === "Loading workspace activity…") status.textContent = ""; });
}
