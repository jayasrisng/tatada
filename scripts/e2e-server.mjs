// Serve isolated production artifacts, avoiding dev optimizer reloads during input.
import {spawn,spawnSync} from 'node:child_process'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
const port=process.argv[2]
if(!/^[0-9]{4,5}$/.test(port??''))throw Error('Expected a test port')
const folder=mkdtempSync(join(tmpdir(),'tatada-e2e-')),vite=resolve('node_modules/vite/bin/vite.js')
const build=spawnSync(process.execPath,[vite,'build','--outDir',folder,'--emptyOutDir'],{stdio:'inherit',env:process.env})
if(build.status!==0){rmSync(folder,{recursive:true,force:true});process.exit(build.status??1)}
const server=spawn(process.execPath,[vite,'preview','--host','127.0.0.1','--port',port,'--strictPort','--outDir',folder],{stdio:'inherit',env:process.env})
const stop=()=>server.kill('SIGTERM')
process.on('SIGTERM',stop);process.on('SIGINT',stop)
server.on('error',()=>{rmSync(folder,{recursive:true,force:true});process.exitCode=1})
server.on('exit',code=>{rmSync(folder,{recursive:true,force:true});process.exitCode=code??0})
