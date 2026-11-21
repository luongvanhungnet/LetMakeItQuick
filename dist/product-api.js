"use strict";

async function apiJSON(url,options = {}) {
  const response = await fetch(url,{cache:"no-store",...options});
  const result = await response.json().catch(()=>null);
  if (!response.ok || !result) throw Object.assign(Error(result?.error || "The workspace request could not be completed."),{status:response.status});
  return result;
}
