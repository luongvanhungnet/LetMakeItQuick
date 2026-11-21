import {createServer} from "node:http";
import {pathToFileURL} from "node:url";
import worker from "../dist/server/index.js";
import {localData} from "./dev-data.mjs";

export function serve(env = process.env, port = Number(process.env.PORT || 4173), testUser = null) {
  const ownsData = !env.LAUNCHPAD_DATA;
  const bindings = {...env, LAUNCHPAD_DATA:env.LAUNCHPAD_DATA || localData(env.LAUNCHPAD_LOCAL_DB || ":memory:")};
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = new URL("http://"+incoming.headers.host);
      if (!["127.0.0.1","localhost"].includes(origin.hostname) || origin.username || origin.password) {
        outgoing.writeHead(400).end();
        return;
      }
      const body = ["GET","HEAD"].includes(incoming.method) ? null : incoming;
      const headers = new Headers(incoming.headers);
      for (const name of [...headers.keys()]) if (name.startsWith("oai-authenticated-user-")) headers.delete(name);
      if (testUser) headers.set("oai-authenticated-user-id",testUser);
      const request = new Request(origin.origin + incoming.url, {
        method:incoming.method, headers, body, duplex:body ? "half" : undefined
      });
      const result = await worker.fetch(request,bindings);
      outgoing.writeHead(result.status,Object.fromEntries(result.headers));
      for await (const chunk of result.body || []) {
        outgoing.write(chunk);
      }
      outgoing.end();
    } catch (error) {
      console.error(error);
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
  if (ownsData) server.once("close",()=>bindings.LAUNCHPAD_DATA.close());
  return server.listen(port,"127.0.0.1",() => console.log("Launchpad Worker listening on " + server.address().port));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const user = process.env.LAUNCHPAD_DEV_USER || null;
  serve({...process.env,LAUNCHPAD_LOCAL_DB:process.env.LAUNCHPAD_LOCAL_DB || ".launchpad-local.sqlite"},undefined,user);
}

