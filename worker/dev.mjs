import {createServer} from "node:http";
import {pathToFileURL} from "node:url";
import worker from "../dist/server/index.js";

export function serve(env = process.env, port = Number(process.env.PORT || 4173), testUser = null) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const body = ["GET","HEAD"].includes(incoming.method) ? null : incoming;
      const headers = new Headers(incoming.headers);
      headers.delete("oai-authenticated-user-id");
      if (testUser) headers.set("oai-authenticated-user-id",testUser);
      const request = new Request("http://" + incoming.headers.host + incoming.url, {
        method:incoming.method, headers, body, duplex:body ? "half" : undefined
      });
      const result = await worker.fetch(request,env);
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
  return server.listen(port,"127.0.0.1",() => console.log("Launchpad Worker listening on " + server.address().port));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) serve();

