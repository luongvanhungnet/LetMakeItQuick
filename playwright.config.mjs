import {defineConfig} from "@playwright/test";

const port = Number(process.env.LAUNCHPAD_TEST_PORT || 4173);
const testUrl = "http://127.0.0.1:"+port;

export default defineConfig({
  testDir:"tests",
  testMatch:"*.spec.mjs",
  timeout:60000,
  workers:1,
  projects:[
    {name:"browser",grepInvert:/60-second representative/},
    {name:"performance",grep:/60-second representative/}
  ],
  use:{
    channel:"chromium", baseURL:testUrl, viewport:{width:1440,height:1000},
    launchOptions:{args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]},
    trace:"retain-on-failure", screenshot:"only-on-failure"
  },
  webServer:{command:"node tests/browser-server.mjs",url:testUrl}
});
