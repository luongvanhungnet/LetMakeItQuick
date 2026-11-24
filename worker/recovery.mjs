// An operator-enabled rehearsal uses fixed synthetic IDs. It never reads a creator's project.
async function rehearseLaunchRecovery(env) {
  if (env.LAUNCHPAD_RECOVERY_DRILL!=="enabled") return null;
  const scope="launchpad-recovery-drill", owner="system:launchpad-recovery", slug="launchpad-release-check";
  const prior=await readData(env,scope,"verified");
  if (prior) return prior;
  const projectId="eeb3ed33-d1e6-4983-9cb2-954ee8b08852";
  const current=await readData(env,"release-slugs",slug);
  if (current && (current.owner!==owner || current.projectId!==projectId)) throw Error("Recovery fixture URL is already owned");
  const draft={id:projectId,type:"web",template:"summit",name:"Launchpad release check",title:"Launchpad release check",
    intro:"A sample release for hosted availability checks.",button:"Explore",section:"About this release",details:"This page verifies that published projects load.",color:"#3e4867"};
  const draftMeta=await readData(env,workspaceDraftScope(owner),projectId);
  const saved=await saveWorkspaceVersion(env,owner,projectId,draft,draftMeta?.revision || null);
  const {id,...content}=draft;
  const snapshot=btoa(JSON.stringify(content)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
  const metadata=releaseMeta({slug,title:draft.title,description:draft.intro,visibility:"public",index:false,journey:"browse"});
  const deployed=await releaseDeploy(env,owner,{id:"launchpad-recovery-sample-v1",projectId,snapshot,metadata});
  if (!deployed.ok) throw Error("Recovery fixture could not publish");
  const formId="1a0c2863-2154-467e-a49a-bdd801fbe1bc", forms=workspaceFormScope(owner,projectId);
  const fixture=[{id:"rehearsal",formId,fields:[{label:"Sample",value:"Rehearsal response"}]}];
  await writeData(env,forms,formId,fixture);
  const backup={
    draft:await readData(env,workspaceVersionScope(owner,projectId),saved.revision),
    form:await readData(env,forms,formId),
    release:await readData(env,"release-slugs",slug)
  };
  // Read the backup back from D1 before restoring into an isolated copy.
  await writeData(env,scope,"backup",backup);
  const restore=await readData(env,scope,"backup");
  const restoreOwner="system:launchpad-recovery-copy";
  const copyMeta=await readData(env,workspaceDraftScope(restoreOwner),projectId);
  const copy=await saveWorkspaceVersion(env,restoreOwner,projectId,restore.draft,copyMeta?.revision || null);
  await writeData(env,workspaceFormScope(restoreOwner,projectId),formId,restore.form);
  await writeData(env,scope,"restored-release",restore.release);
  const restoredRelease=await readData(env,scope,"restored-release");
  const restoredDraft=await readData(env,workspaceVersionScope(restoreOwner,projectId),copy.revision);
  const restoredForms=await readData(env,workspaceFormScope(restoreOwner,projectId),formId);
  if (JSON.stringify(restoredDraft)!==JSON.stringify(draft) || JSON.stringify(restoredForms)!==JSON.stringify(fixture) ||
      restoredRelease.live!==backup.release.live || restoredRelease.versions.find(v=>v.id===restoredRelease.live)?.snapshot!==snapshot)
    throw Error("Recovery rehearsal data did not match");
  const result={verifiedAt:new Date().toISOString(),slug,releaseId:restoredRelease.live,draft:true,forms:true,releasePointer:true};
  await writeData(env,scope,"verified",result);
  return result;
}

async function handleRecoveryProbe(request,env) {
  if (env.LAUNCHPAD_RECOVERY_DRILL!=="enabled" || !env.LAUNCHPAD_MONITOR_KEY ||
      request.headers.get("Authorization")!=="Bearer "+env.LAUNCHPAD_MONITOR_KEY || request.method!=="POST")
    return api({error:"Rehearsal unavailable."},403);
  const baseline=await readData(env,"launchpad-recovery-drill","verified");
  if (!baseline) return api({error:"Run the hosted recovery check first."},409);
  const slug=baseline.slug, doc=await readData(env,"release-slugs",slug);
  const owner="system:launchpad-recovery";
  if (!doc || doc.owner!==owner) return api({error:"Fixture unavailable."},409);
  const first=doc.versions.find(v=>v.id===baseline.releaseId);
  if (!first) return api({error:"Fixture baseline unavailable."},409);
  const action=new URL(request.url).searchParams.get("action");
  let desired=first;
  if (action==="candidate") {
    const project=workspaceReleaseProject(first.snapshot);
    project.title="Launchpad signup check";
    project.blocks=[{id:"bd137274-ab26-48ed-a0d4-5a1cdc7ab956",type:"form",a:"Browser verification",b:"Test code"},
      {id:"2a46de0f-d9eb-448e-ab17-4f523e2230ad",type:"downloads",a:"Download verification file",b:"",
        fileName:"sample.txt",fileData:btoa("A".repeat(65536))}];
    const snapshot=btoa(JSON.stringify(project)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
    const candidate={id:"launchpad-recovery-sample-download",projectId:doc.projectId,snapshot,metadata:{...first.metadata,journey:"signup"}};
    const response=await releaseDeploy(env,owner,candidate);
    if (!response.ok) return response;
    const privateRelease=await releaseDeploy(env,owner,{...candidate,id:"launchpad-recovery-private",metadata:{...first.metadata,slug:"launchpad-private-check",visibility:"private"}});
    if (!privateRelease.ok) return privateRelease;
    desired=(await readData(env,"release-slugs",slug)).versions.find(v=>v.stageId===candidate.id);
  } else if (action!=="restore") return api({error:"Unknown rehearsal phase."},400);
  const updated=await updateData(env,"release-slugs",slug,current=>{
    if (current?.owner!==owner || !current.versions.some(v=>v.id===desired.id)) throw Error("Fixture changed");
    return {...current,live:desired.id,updatedAt:new Date().toISOString()};
  });
  await recordPostDeploy(env,updated,slug,desired.id);
  return api({id:desired.id,version:desired.number});
}
