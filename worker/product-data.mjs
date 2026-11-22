const productScope = (owner,id) => "product-environments:"+owner+":"+id;
const productCustomerCode = /^[0-9a-f]{64}$/;
const productConnectorName = /^[a-z][a-z0-9_-]{0,39}$/;

async function productCustomer(owner,id,visitor) {
  if (!visitor) return "";
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([owner,id,visitor])));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
}
function productRows(input) {
  if (!Array.isArray(input) || input.length > 100) throw workspaceError("Use up to 100 records per list.",400);
  return input.map(row=>{
    if (!row || typeof row.name !== "string" || !row.name.trim() || row.name.length > 100 ||
        typeof row.details !== "string" || row.details.length > 400 ||
        (row.customer && !productCustomerCode.test(row.customer))) throw workspaceError("Each row needs a name and details. Customer codes must match the code shown after sign-in.",400);
    return {name:row.name.trim(),details:row.details,customer:row.customer || ""};
  });
}
function productConnectors(env,owner,projectId,environment) {
  let config;
  try { config = JSON.parse(env.LAUNCHPAD_RECORD_CONNECTORS || "[]"); } catch { return []; }
  return Array.isArray(config) ? config.filter(item=>item && item.owner === owner && item.projectId === projectId &&
    item.environment === environment && productConnectorName.test(item.name) && releaseHTTPS(item.url)) : [];
}
async function fetchProductRecords(connector,env) {
  const headers = {Accept:"application/json"};
  if (connector.secret) {
    if (!/^LAUNCHPAD_FEED_[A-Z0-9_]{1,60}$/.test(connector.secret) || !env[connector.secret])
      throw workspaceError("The operator must configure this feed’s server-side credential.",503);
    headers.Authorization = "Bearer "+env[connector.secret];
  }
  let response;
  try { response = await fetch(connector.url,{headers,redirect:"error",signal:AbortSignal.timeout(6500)}); }
  catch { throw workspaceError("The records feed timed out or could not be reached. Check the configured endpoint.",502); }
  if (!response.ok) throw workspaceError("The records feed returned HTTP "+response.status+". Check its credentials and availability.",502);
  const reader = response.body?.getReader(), decoder = new TextDecoder();
  if (!reader) throw workspaceError("The records feed returned an empty response.",502);
  let size=0, body="";
  for (;;) {
    const {done,value}=await reader.read();
    if (done) break;
    if ((size+=value.length)>70000) { void reader.cancel(); throw workspaceError("The feed exceeds the 70 KB limit.",413); }
    body+=decoder.decode(value,{stream:true});
  }
  let rows;
  try { rows=JSON.parse(body+decoder.decode()); } catch { throw workspaceError("The feed must return a JSON array of records.",422); }
  return productRows(rows);
}
async function manageProductData(request,env,owner,id,environment) {
  if (!await readData(env,workspaceDraftScope(owner),id)) return api({error:"Upload this draft to your cloud workspace to manage its product data."},404);
  const scope=productScope(owner,id), current=await readData(env,scope,environment);
  const connectors=productConnectors(env,owner,id,environment);
  const view = config=>({lists:config?.lists || {},revision:config?.revision || null,connectors:connectors.map(item=>item.name)});
  if (request.method === "GET") return api(view(current));
  if (request.method !== "PUT") return api({error:"Method unavailable."},405);
  const input=await workspaceInput(request,80000);
  if (input.revision !== (current?.revision || null)) throw workspaceError("This environment changed. Reopen Product data before saving.",409);
  if (!workspaceId.test(input.blockId)) throw workspaceError("Choose a records block.",400);
  const lists={...current?.lists};
  if (!Object.hasOwn(lists,input.blockId) && Object.keys(lists).length>=40) throw workspaceError("Environment list limit reached.",409);
  if (input.useSample === true) delete lists[input.blockId];
  else {
    const connector=input.connector || "";
    if (connector && !connectors.some(item=>item.name === connector)) throw workspaceError("Choose a feed configured for this project and environment.",400);
    if (input.refresh && !connector) throw workspaceError("Select a feed to refresh.",400);
    const rows=input.refresh ? await fetchProductRecords(connectors.find(item=>item.name === connector),env) : productRows(input.rows);
    lists[input.blockId]={rows,connector};
  }
  const next={revision:crypto.randomUUID(),lists};
  if (new TextEncoder().encode(JSON.stringify(next)).length>380000) throw workspaceError("Environment data exceeds 380 KB.",413);
  if (!await dataCompareAndSwap(env,scope,environment,current,next)) throw workspaceError("This environment changed. Reopen Product data before saving.",409);
  return api(view(next));
}
async function productViewData(env,owner,id,visitor,environment,snapshot) {
  const project=workspaceReleaseProject(snapshot);
  const published=new Set([project,...(project?.pages || [])].flatMap(page=>(page?.blocks || []).filter(block=>block.type==="records").map(block=>block.id)));
  const [config,customer]=await Promise.all([readData(env,productScope(owner,id),environment),productCustomer(owner,id,visitor)]);
  const records={};
  for (const [block,list] of Object.entries(config?.lists || {})) {
    if (!published.has(block)) continue;
    records[block]=list.rows.filter(row=>!row.customer || row.customer===customer).map(({name,details})=>({name,details}));
  }
  return {records,customer};
}
