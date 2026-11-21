const teamIdPattern = /^[0-9a-f-]{36}$/i;
const teamTokenPattern = /^[0-9a-f]{48}$/i;
const teamScope = "team-projects";
const teamNow = () => new Date().toISOString();
const teamWriter = request => request.headers.get("oai-authenticated-user-id");
const teamIssue = (error,status) => api({error},status);

async function teamTokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("");
}
function teamGenerateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)),value=>value.toString(16).padStart(2,"0")).join("");
}
function teamFindRole(team,user) {
  return team.owner === user ? "owner" : Object.hasOwn(team.members,user) ? team.members[user].role : undefined;
}
async function teamLookup(env,owner,projectId) {
  if (!env.LAUNCHPAD_DATA) return null;
  const id = await readData(env,"team-by-owner:"+owner,projectId);
  return id ? readData(env,teamScope,id) : null;
}
async function teamReleaseBlock(env,owner,projectId,stageId) {
  const team = await teamLookup(env,owner,projectId);
  return team?.requireApproval && !team.approvals.some(item=>item.stageId === stageId && team.members[item.user]?.role === "reviewer");
}
async function deleteOwnedTeams(env,owner) {
  for (const {key,value:id} of await listData(env,"team-by-owner:"+owner)) {
    const team = await readData(env,teamScope,id);
    if (team?.owner === owner) await deleteData(env,teamScope,id);
    await deleteData(env,"team-by-owner:"+owner,key);
  }
  for (const {key,value:team} of await listData(env,teamScope)) {
    if (Object.hasOwn(team.members,owner)) {
      await updateData(env,teamScope,key,current=>{
        if (!current) return null;
        delete current.members[owner];
        current.comments = current.comments.filter(comment=>comment.user !== owner);
        current.approvals = current.approvals.filter(approval=>approval.user !== owner);
        return current;
      });
    }
  }
}
function teamSummary(team,user) {
  return {id:team.id,projectId:team.projectId,name:team.name,role:teamFindRole(team,user),requireApproval:team.requireApproval,
    memberCount:Object.keys(team.members).length};
}
async function handleTeam(request,env) {
  const user = teamWriter(request), path = new URL(request.url).pathname;
  if (!user) return teamIssue("Sign in to use project collaboration.",401);
  if (!env.LAUNCHPAD_DATA) return teamIssue("Workspace storage is required.",503);
  if (path === "/api/team" && request.method === "GET") {
    return api({teams:(await listData(env,teamScope)).map(row=>row.value).filter(team=>teamFindRole(team,user)).map(team=>teamSummary(team,user))});
  }
  const match = /^\/api\/team\/([0-9a-f-]{36})(?:\/(invite|settings|accept|comment|approve|revoke))?$/i.exec(path);
  if (request.method === "GET" && match && !match[2]) {
    const team = await readData(env,teamScope,match[1]), role = team && teamFindRole(team,user);
    if (!role) return teamIssue("Team unavailable.",404);
    const stage = await loadReleaseStage(env,team.owner,team.projectId);
    return api({team:teamSummary(team,user),stage:stage ? {id:stage.id,metadata:stage.metadata,snapshot:stage.snapshot} : null,
      members:role === "owner" ? Object.entries(team.members).map(([id,member])=>({id,...member})) : [],
      comments:team.comments.map(item=>({text:item.text,role:item.role,createdAt:item.createdAt})),
      approved:!!stage && team.approvals.some(item=>item.stageId === stage.id && team.members[item.user]?.role === "reviewer")});
  }
  if (request.method !== "POST") return teamIssue("Method unavailable.",405);
  let body;
  try { body = await workspaceInput(request,12000); }
  catch (error) { return teamIssue(error.message,error.status || 400); }
  if (path === "/api/team") {
    if (!teamIdPattern.test(body.projectId || "") ||
        !await readData(env,"workspace:drafts:"+user,body.projectId)) return teamIssue("Save this project to your cloud workspace before creating a team.",400);
    const existing = await teamLookup(env,user,body.projectId);
    if (existing) return api({team:teamSummary(existing,user)});
    const id = crypto.randomUUID();
    const team = {id,projectId:body.projectId,owner:user,name:String(body.name || "Project").slice(0,70),members:{},invites:[],comments:[],approvals:[],requireApproval:false};
    await writeData(env,teamScope,id,team);
    if (!await dataCompareAndSwap(env,"team-by-owner:"+user,body.projectId,null,id)) {
      await deleteData(env,teamScope,id);
      return api({team:teamSummary(await teamLookup(env,user,body.projectId),user)});
    }
    return api({team:teamSummary(team,user)},201);
  }
  if (!match || !match[2]) return teamIssue("Team route unavailable.",404);
  const [,id,action] = match;
  const tokenHash = action === "accept" && teamTokenPattern.test(body.token || "") ? await teamTokenHash(body.token) : null;
  const inviteToken = action === "invite" ? teamGenerateToken() : null;
  const inviteHash = inviteToken ? await teamTokenHash(inviteToken) : null;
  const team = await readData(env,teamScope,id);
  if (!team) return teamIssue("Team unavailable.",404);
  const stage = action === "approve" ? await loadReleaseStage(env,team.owner,team.projectId) : null;
  const roles = ["viewer","reviewer"];
  function reject(message,status) { throw Object.assign(Error(message),{teamStatus:status}); }
  try {
    const changed = await updateData(env,teamScope,id,current=>{
      if (!current) reject("Team unavailable.",404);
      const role = teamFindRole(current,user);
      if (action === "accept") {
        const invite = current.invites.find(item=>item.hash === tokenHash && item.expires > Date.now());
        if (!invite || role || Object.keys(current.members).length >= 20 || ["__proto__","constructor","prototype"].includes(user)) reject("Invite is invalid, expired, or already used.",409);
        current.invites = current.invites.filter(item=>item.hash !== tokenHash);
        current.members[user] = {role:invite.role,joinedAt:teamNow()};
      } else if (action === "comment") {
        if (role !== "reviewer" && role !== "owner") reject("Review access is required to comment.",403);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text || text.length > 1200) reject("Write a comment of up to 1,200 characters.",400);
        current.comments = [...current.comments,{text,role,user,createdAt:teamNow()}].slice(-60);
      } else if (action === "approve") {
        if (role !== "reviewer") reject("A reviewer must approve the staged version.",403);
        if (!stage || stage.id !== body.stageId) reject("The staged version changed. Review the latest version.",409);
        current.approvals = [...current.approvals.filter(item=>item.user !== user),{user,stageId:stage.id}].slice(-20);
      } else {
        if (role !== "owner") reject("Owner access is required.",403);
        if (action === "invite") {
          if (!roles.includes(body.role)) reject("Select a role.",400);
          current.invites = [...current.invites.filter(item=>item.expires>Date.now()),{hash:inviteHash,role:body.role,expires:Date.now()+7*86400000}].slice(-20);
        } else if (action === "settings") current.requireApproval = body.requireApproval === true;
        else if (action === "revoke") {
          if (typeof body.member !== "string" || !Object.hasOwn(current.members,body.member)) reject("Member unavailable.",404);
          delete current.members[body.member];
        }
      }
      return current;
    });
    return api({team:teamSummary(changed,user),...(inviteToken?{invite:id+"."+inviteToken}:{})});
  } catch (error) {
    if (error.teamStatus) return teamIssue(error.message,error.teamStatus);
    throw error;
  }
}
