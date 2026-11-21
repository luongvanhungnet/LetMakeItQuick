class StorageUnavailableError extends Error {}

function launchpadDatabase(env) {
  if (!env.LAUNCHPAD_DATA?.prepare) throw new StorageUnavailableError("Workspace storage is unavailable. Configure the LAUNCHPAD_DATA binding.");
  return env.LAUNCHPAD_DATA;
}
function documentJSON(value) {
  const json = JSON.stringify(value);
  if (typeof json !== "string" || json === "null") throw new TypeError("Expected a non-null JSON value");
  if (new TextEncoder().encode(json).length > 1900000) throw new RangeError("Workspace record is too large");
  return json;
}
async function readData(env,scope,key) {
  const row = await launchpadDatabase(env).prepare("SELECT payload FROM launchpad_documents WHERE scope = ? AND id = ?").bind(scope,key).first();
  return row ? JSON.parse(row.payload) : null;
}
async function writeData(env,scope,key,value) {
  await launchpadDatabase(env).prepare("INSERT INTO launchpad_documents(scope,id,payload) VALUES(?,?,?) ON CONFLICT(scope,id) DO UPDATE SET payload = excluded.payload").bind(scope,key,documentJSON(value)).run();
}
async function deleteData(env,scope,key) {
  await launchpadDatabase(env).prepare("DELETE FROM launchpad_documents WHERE scope = ? AND id = ?").bind(scope,key).run();
}
async function listData(env,scope) {
  const result = await launchpadDatabase(env).prepare("SELECT id,payload FROM launchpad_documents WHERE scope = ? ORDER BY id").bind(scope).all();
  return result.results.map(row => ({key:row.id,value:JSON.parse(row.payload)}));
}
async function dataCompareAndSwap(env,scope,key,expectedValue,nextValue) {
  if (expectedValue === null && nextValue === null) return (await readData(env,scope,key)) === null;
  const db = launchpadDatabase(env);
  let statement;
  if (expectedValue === null) {
    statement = db.prepare("INSERT INTO launchpad_documents(scope,id,payload) VALUES(?,?,?) ON CONFLICT(scope,id) DO NOTHING").bind(scope,key,documentJSON(nextValue));
  } else if (nextValue === null) {
    statement = db.prepare("DELETE FROM launchpad_documents WHERE scope = ? AND id = ? AND payload = ?").bind(scope,key,documentJSON(expectedValue));
  } else {
    statement = db.prepare("UPDATE launchpad_documents SET payload = ? WHERE scope = ? AND id = ? AND payload = ?").bind(documentJSON(nextValue),scope,key,documentJSON(expectedValue));
  }
  return (await statement.run()).meta.changes === 1;
}
async function updateData(env,scope,key,updater) {
  for (let attempt=0;attempt<8;attempt++) {
    const before = await readData(env,scope,key);
    const after = await updater(structuredClone(before));
    if (await dataCompareAndSwap(env,scope,key,before,after)) return after;
  }
  throw new Error("Record changed during update. Please retry.");
}
