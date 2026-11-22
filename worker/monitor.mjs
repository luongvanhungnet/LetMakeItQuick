async function handleMonitor(request,env) {
  const key=env.LAUNCHPAD_MONITOR_KEY;
  if (request.method!=="POST" || !key || request.headers.get("Authorization")!=="Bearer "+key) return api({error:"Monitor unavailable."},403);
  const slot=Math.floor(Date.now()/900000), scope="operations-system";
  const before=await readData(env,scope,"monitor-run");
  if (before?.slot===slot && (before.finished || Date.now()-before.started<90000)) return api({run:before},before.finished?200:202);
  const lease={slot,started:Date.now(),id:crypto.randomUUID()};
  if (!await dataCompareAndSwap(env,scope,"monitor-run",before,lease)) return api({status:"busy"},202);
  const recovery=await rehearseLaunchRecovery(env);
  await runScheduledOperations(env);
  const run={...lease,finished:Date.now(),recovery};
  await dataCompareAndSwap(env,scope,"monitor-run",lease,run);
  return api({run});
}
