import {serve} from "../worker/dev.mjs";

const fetchLocal = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (url !== "https://api.openai.com/v1/responses") return fetchLocal(url,options);
  const input = JSON.parse(JSON.parse(options.body).input);
  const value = input.prompt.match(/"([^"]+)"/)?.[1];
  const followUp = /headline/.test(input.history?.findLast(message => message.role === "user")?.text || "");
  return Promise.resolve(Response.json({output:[{content:[{type:"output_text",text:JSON.stringify({
    reply:"I prepared a headline change.",
    fields:value && (followUp || /headline/.test(input.prompt)) ? {title:value} : {}
  })}]}]}));
};
serve({OPENAI_API_KEY:"local-fixture"},4173,"browser-test");
