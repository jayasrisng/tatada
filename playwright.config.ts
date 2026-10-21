import {defineConfig} from '@playwright/test'
const remote = process.env.TATADA_E2E_URL
export default defineConfig({
 testDir:'./e2e',fullyParallel:false,forbidOnly:!!process.env.CI,retries:0,workers:1,
 timeout:45000,expect:{timeout:10000},
 reporter:[['list'],['junit',{outputFile:process.env.TATADA_E2E_JUNIT??'test-results/results.junit.xml'}]],
 outputDir:process.env.TATADA_E2E_ARTIFACTS??'test-results',
 use:{baseURL:remote??'http://127.0.0.1:5198/',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop-chromium',use:{browserName:'chromium',viewport:{width:1440,height:900}}},{name:'mobile-chromium',use:{browserName:'chromium',viewport:{width:390,height:844}}}],
 webServer:remote?undefined:[{command:'node scripts/e2e-server.mjs 5198',url:'http://127.0.0.1:5198/',reuseExistingServer:false,env:{VITE_ENABLE_BACKEND:'false',VITE_API_URL:'',VITE_BASE_PATH:'/'}},{command:'node scripts/e2e-server.mjs 5200',url:'http://127.0.0.1:5200/',reuseExistingServer:false,env:{VITE_ENABLE_BACKEND:'true',VITE_API_URL:'',VITE_BASE_PATH:'/'}}],
})
