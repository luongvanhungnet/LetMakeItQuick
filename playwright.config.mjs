import {defineConfig} from "@playwright/test";

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
    channel:"chromium", baseURL:"http://127.0.0.1:4173", viewport:{width:1440,height:1000},
    launchOptions:{args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]},
    trace:"retain-on-failure", screenshot:"only-on-failure"
  },
  webServer:{command:"node tests/browser-server.mjs",url:"http://127.0.0.1:4173"}
});
