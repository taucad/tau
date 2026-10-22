/** Build the shipping preload and exercise its bridges in a real sandboxed renderer. */
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { resolveConfig } from 'electron-vite';
import { build as buildPreload } from 'vite';

/** Return an isolated fixture app; production bundle bytes are unchanged except for the test observation. */
export const writeSandboxedPreloadFixture = async (root: string): Promise<string> => {
  const source = join(root, 'source');
  await mkdir(source);
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'tau-sandbox-fixture',
      version: '1.0.1',
      main: 'main.cjs',
      tauDesktop: { channel: 'staging', sourceCommit: 'a'.repeat(40), environmentOverrides: false },
    }),
  );
  const desktopRoot = resolvePath('apps/desktop');
  const resolved = await resolveConfig(
    {
      root: desktopRoot,
      configFile: join(desktopRoot, 'electron.vite.config.ts'),
      logLevel: 'warn',
    },
    'build',
    'production',
  );
  assert.ok(resolved.config?.preload, 'Actual desktop preload configuration must resolve');
  await buildPreload({
    ...resolved.config.preload,
    configFile: false,
    root: desktopRoot,
    build: { ...resolved.config.preload.build, outDir: join(root, 'preload'), emptyOutDir: true },
  });
  await cp(join(root, 'preload/preload.cjs'), join(source, 'preload.cjs'));
  await appendFile(
    join(source, 'preload.cjs'),
    "\nrequire('electron').ipcRenderer.send('fixture-ready', {sandboxed:process.sandboxed, isolated:process.contextIsolated});\n",
  );
  await writeFile(
    join(source, 'main.cjs'),
    `
const {app, BrowserWindow, ipcMain, MessageChannelMain} = require('electron');
const {join} = require('node:path');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  const window = new BrowserWindow({show:false, webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false, preload:join(__dirname,'preload.cjs'),additionalArguments:['--tau-bootstrap='+JSON.stringify({env:{FIXTURE:'sandbox'},homeRoot:'/fixture-home',runtimeKernelIds:['fixture']})]}});
  let checked = 0;
  ipcMain.handle('tau:updates:check', () => { checked++; });
  window.webContents.on('preload-error', (_event, _path, error) => {console.error(error);app.exit(1);});
  ipcMain.once('fixture-ready', (event, result) => {
    assert.equal(event.sender, window.webContents);
    assert.equal(result.sandboxed, true);
    assert.equal(result.isolated, true);
    globalThis.fixtureSandbox = result;
  });
  await window.loadURL('data:text/html,<title>Tau sandbox fixture</title>');
  const bridge = await window.webContents.executeJavaScript("(async()=>{await window.tau.updates.check();return {env:window.ENV.FIXTURE,home:window.tau.nodeFs.homeRoot,kernels:window.tau.runtimeKernelIds,request:typeof window.taucad.requestRuntimePort,quit:typeof window.tau.quit.reportQuiesced,node:typeof require};})()");
  assert.equal(checked,1);
  assert.equal(bridge.env,'sandbox');
  assert.equal(bridge.home,'/fixture-home');
  assert.deepEqual(bridge.kernels,['fixture']);
  await window.webContents.executeJavaScript("window.tau.quit.onAsk(id=>window.tau.quit.reportQuiesced(id,false));true");
  const saved = new Promise(resolve => ipcMain.once('tau:quit:quiesced', (event,id,forced) => {
    assert.equal(event.sender,window.webContents); assert.equal(id,'fixture-save'); assert.equal(forced,false); resolve();
  }));
  window.webContents.send('tau:quit:ask','fixture-save');
  await saved;
  ipcMain.once('taucad:connect-runtime',(event,request)=>{
    assert.equal(event.sender,window.webContents); assert.equal(request.requestId,'fixture-port');
    const {port1,port2}=new MessageChannelMain();
    port1.on('message',event=>{ assert.equal(event.data,'ping'); port1.postMessage('pong'); port1.close(); });
    port1.start();
    window.webContents.postMessage('taucad:connect-runtime:port',{requestId:'fixture-port'},[port2]);
  });
  const relayed = await window.webContents.executeJavaScript("new Promise(resolve=>{window.addEventListener('message',event=>{if(event.data.taucadRelay!==window.taucad.relayTag.runtime)return;const port=event.ports[0];port.onmessage=event=>{resolve(event.data);port.close();};port.postMessage('ping');},{once:true});window.taucad.requestRuntimePort('fixture-port');})");
  assert.equal(relayed,'pong');
  assert.equal(bridge.request,'function');
  assert.equal(bridge.quit,'function');
  assert.equal(bridge.node,'undefined');
  assert.ok(globalThis.fixtureSandbox);
  console.log('TAU_SANDBOX_PROOF:'+JSON.stringify({...globalThis.fixtureSandbox,bridge:'desktop',pid:window.webContents.getOSProcessId(),browserPid:process.pid,executable:process.execPath}));
  if (process.argv.includes('--fixture-exit')) app.quit();
}).catch(error => {console.error(error); app.exit(1);});
setTimeout(() => app.exit(1), 45000);
`,
  );
  return source;
};
