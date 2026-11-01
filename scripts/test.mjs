import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.mjs';
import { scanFixture } from './scan-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const { PDFDocument } = require('../public/vendor/pdf-lib.min.js');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'test-results');
await mkdir(out, { recursive: true });
const fixtures = [
  { name:'01-portrait.png', width:1200, height:1600, background:'#e94f5b' },
  { name:'02-landscape.png', width:1800, height:1200, background:'#235ee8' },
  { name:'03-tall.png', width:1000, height:2000, background:'#228b68' }
];
for (const fixture of fixtures) await sharp({ create: { width:fixture.width, height:fixture.height, channels:3, background:fixture.background } }).png().toFile(path.join(out, fixture.name));
await writeFile(path.join(out, 'broken.jpg'), 'this is not a JPEG');
await sharp({ create: { width:800, height:1200, channels:4, background:{r:10,g:30,b:50,alpha:0} } }).png().toFile(path.join(out,'transparent.png'));
await sharp({ create: { width:1600, height:1000, channels:3, background:'#bf7a2c' } }).withMetadata({orientation:6}).jpeg().toFile(path.join(out,'exif.jpg'));
const pencil = scanFixture();
await sharp(Buffer.from(pencil.pixels), { raw:{width:pencil.width,height:pencil.height,channels:4} }).png().toFile(path.join(out,'pencil-paper.png'));
await sharp({create:{width:4200,height:3000,channels:3,background:'#f4f1ea'}}).composite([{input:Buffer.from('<svg width="4200" height="3000" xmlns="http://www.w3.org/2000/svg"><path d="M500 500H3700M500 1100L3700 1500" fill="none" stroke="#e9e6df" stroke-width="1"/></svg>')}]).png().toFile(path.join(out,'large-pencil.png'));
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({headless:true});
const failures = [];
const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true, acceptDownloads:true });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__tools = {};
  Object.defineProperty(document, 'modelContext', { configurable:true, value:{ registerTool(tool) { window.__tools[tool.name] = tool; } } });
});
page.on('pageerror', (error) => failures.push(error.message));
const externalRequests = [];
page.on('request', (request) => { if (request.url().startsWith('http') && !request.url().startsWith(base)) externalRequests.push(request.url()); });
async function added(count) { await page.waitForFunction((count) => document.querySelector('#count').textContent === String(count) && !document.querySelector('body').classList.contains('busy'), count); }
async function result() { await page.locator('#generate').click(); await page.locator('#result').waitFor({state:'visible'}); }
async function downloadPdf(name) { const event = page.waitForEvent('download'); await page.locator('#download').click(); const download = await event; await download.saveAs(path.join(out,name)); return {download, pdf:await PDFDocument.load(await readFile(path.join(out,name)))}; }
try {
  await page.goto(base);
  assert.equal(await page.locator('#generate').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.__tools).sort()),['generate_photo_pdf','get_photo_pdf_state']);
  assert.equal(await page.evaluate(()=>window.__tools.get_photo_pdf_state.execute({}).photos),0);
  assert.equal(await page.evaluate(async()=>{try{await window.__tools.generate_photo_pdf.execute({});return false;}catch{return true;}}),true);
  assert.equal(await page.evaluate(()=>{try{window.__tools.get_photo_pdf_state.execute({extra:true});return false;}catch{return true;}}),true);
  await page.screenshot({path:path.join(out,'mobile-empty.png'),fullPage:true});
  await page.locator('#photo-input').setInputFiles(fixtures.map((f)=>path.join(out,f.name)));
  await added(3);
  await page.getByRole('button',{name:'第 3 页向前移动',exact:true}).click();
  assert.deepEqual(await page.locator('.photo-name').allTextContents(),['01-portrait.png','03-tall.png','02-landscape.png']);
  await page.getByRole('button',{name:'第 1 页顺时针旋转',exact:true}).click();
  await page.locator('#filename').fill('作业/第一章.pdf');
  await result();
  const first = await downloadPdf('three-photos.pdf');
  assert.equal(first.download.suggestedFilename(),'作业_第一章.pdf');
  assert.equal(first.pdf.getPageCount(),3);
  assert.deepEqual(first.pdf.getPages().map((p)=>p.getSize()),[{width:841.89,height:595.28},{width:595.28,height:841.89},{width:841.89,height:595.28}]);
  await page.screenshot({path:path.join(out,'mobile-result.png'),fullPage:true});
  console.log('PASS: three photos, page order, 90° rotation, A4 orientation, filename, valid PDF download');

  await page.locator('#page-size').selectOption('photo');
  assert.equal(await page.locator('#result').isVisible(),false);
  const toolResult = await page.evaluate(()=>window.__tools.generate_photo_pdf.execute({}));
  assert.equal(toolResult.pdfReady,true);
  assert.equal(toolResult.photos,3);
  const second = await downloadPdf('photo-ratios.pdf');
  const sizes = second.pdf.getPages().map((p)=>p.getSize());
  assert.ok(Math.abs(sizes[0].width/sizes[0].height-4/3)<.001);
  assert.ok(Math.abs(sizes[1].width/sizes[1].height-.5)<.001);
  assert.ok(Math.abs(sizes[2].width/sizes[2].height-1.5)<.001);
  console.log('PASS: photo-proportion pages and output invalidation after settings change');

  // Native file sharing is stubbed: verifies fresh tap/user activation and cancellation.
  await page.evaluate(() => {
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:(data)=>{window.__share={name:data.files[0].name,type:data.files[0].type,size:data.files[0].size,active:navigator.userActivation.isActive};return Promise.reject(new DOMException('cancelled','AbortError'));}});
  });
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已取消分享'));
  const share = await page.evaluate(()=>window.__share);
  assert.equal(share.active,true);assert.equal(share.type,'application/pdf');assert.ok(share.size>1000);
  assert.equal(await page.locator('#result').isVisible(),true);
  assert.equal(await page.locator('#save').isDisabled(),false);
  console.log('PASS: PDF file sharing runs on fresh user activation; cancellation preserves output');
  await page.evaluate(() => Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new DOMException('blocked','NotAllowedError'))}));
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('未能打开分享菜单'));
  assert.ok(await page.locator('#download').getAttribute('href'));

  await page.getByRole('button',{name:'第 2 页删除',exact:true}).click();
  assert.equal(await page.locator('#result').isVisible(),false);
  assert.equal(await page.locator('#count').textContent(),'2');
  await page.locator('#clear').click();
  assert.equal(await page.locator('#generate').isDisabled(),true);
  await page.locator('#photo-input').setInputFiles([path.join(out,'broken.jpg'),path.join(out,'transparent.png'),path.join(out,'exif.jpg')]);
  await added(2);
  assert.ok((await page.locator('#status').textContent()).includes('broken.jpg'));
  assert.ok((await page.locator('#status').textContent()).includes('未加入'));
  await page.locator('#page-size').selectOption('a4');
  await page.locator('#filename').fill('');
  await result();
  const third = await downloadPdf('transparent-and-exif.pdf');
  assert.equal(third.download.suggestedFilename(),'照片成册.pdf');
  assert.equal(third.pdf.getPageCount(),2);
  assert.ok(third.pdf.getPages().every((p)=>p.getHeight()>p.getWidth()));
  console.log('PASS: delete/clear, invalid image reporting, transparent PNG, EXIF orientation, empty filename');

  await page.locator('#clear').click();
  await page.locator('#photo-input').setInputFiles(path.join(out,'pencil-paper.png'));
  await added(1);
  await page.locator('#scan-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#scan-toggle').getAttribute('aria-pressed')==='true'&&!document.body.classList.contains('busy'));
  assert.equal(await page.locator('.scan-badge').count(),1);
  await page.getByRole('button',{name:'第 1 页查看大图',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#detail-canvas').hidden&&document.querySelector('#detail-status').textContent.includes('白底扫描效果'));
  const scanPixels = await page.locator('#detail-canvas').evaluate((canvas) => {
    const ctx=canvas.getContext('2d');
    const sample=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
    return {paper:sample(600,180),pencil:sample(600,320),width:canvas.width,height:canvas.height};
  });
  assert.deepEqual(scanPixels.paper,[255,255,255,255]);
  assert.ok(scanPixels.pencil[0]<245&&scanPixels.pencil[0]>0);
  assert.equal(scanPixels.pencil[0],scanPixels.pencil[1]);
  assert.equal(scanPixels.width,1200);assert.equal(scanPixels.height,1600);
  await page.locator('#detail-zoom').click();
  assert.equal(await page.locator('#detail-zoom').getAttribute('aria-pressed'),'true');
  await page.locator('#detail-original').click();
  await page.waitForFunction(()=>document.querySelector('#detail-status').textContent.includes('原始照片'));
  const originalPixel=await page.locator('#detail-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(600,180,1,1).data));
  assert.notEqual(originalPixel[0],originalPixel[2]);
  await page.locator('#detail-scan').click();
  await page.waitForFunction(()=>document.querySelector('#detail-status').textContent.includes('白底扫描效果'));
  await page.screenshot({path:path.join(out,'mobile-scan-detail.png')});
  await page.locator('#detail-close').click();
  await page.locator('#filename').fill('白底扫描测试');
  await result();
  const scanPdf=await downloadPdf('white-paper-scan.pdf');
  assert.equal(scanPdf.pdf.getPageCount(),1);
  const pdfImage=scanPdf.pdf.getPage(0).node.Resources().lookup(scanPdf.pdf.getPage(0).node.Resources().keys().find(k=>k.toString()==='/XObject'));
  assert.ok(pdfImage,'Scanned page must contain an embedded image');
  const scanText=(await readFile(path.join(out,'white-paper-scan.pdf'))).toString('latin1');
  assert.ok(scanText.includes('/FlateDecode')&&!scanText.includes('/DCTDecode'),'Scanned pixels must be embedded without JPEG compression');
  await page.locator('#scan-strength').evaluate(el=>{el.value='90';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#result').isVisible(),false);
  assert.equal(await page.locator('#generate').isDisabled(),true);
  assert.equal(await page.evaluate(async()=>{try{await window.__tools.generate_photo_pdf.execute({});return false;}catch{return true;}}),true);
  await page.locator('#scan-apply').click();
  await page.waitForFunction(()=>!document.body.classList.contains('busy')&&document.querySelector('#scan-apply').hidden);
  assert.equal(await page.locator('#generate').isDisabled(),false);
  await page.locator('#scan-toggle').click();
  assert.equal(await page.locator('.scan-badge').count(),0);
  await result();
  const restored=await downloadPdf('restored-original.pdf');
  assert.ok((await readFile(path.join(out,'restored-original.pdf'))).toString('latin1').includes('/DCTDecode'));
  assert.equal(restored.pdf.getPageCount(),1);
  await page.locator('#scan-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#scan-toggle').getAttribute('aria-pressed')==='true'&&!document.body.classList.contains('busy'));
  await page.locator('#photo-input').setInputFiles(path.join(out,'pencil-paper.png'));
  await added(2);
  await page.waitForFunction(()=>!document.body.classList.contains('busy')&&document.querySelectorAll('.scan-badge').length===2);
  await page.getByRole('button',{name:'第 1 页顺时针旋转',exact:true}).click();
  await result();
  const scanRotated=await downloadPdf('scanned-rotated.pdf');
  assert.ok(scanRotated.pdf.getPage(0).getWidth()>scanRotated.pdf.getPage(0).getHeight());
  await page.screenshot({path:path.join(out,'mobile-scan-result.png'),fullPage:true});
  console.log('PASS: white paper, gray fine pencil, original/scan preview and zoom, lossless scanned PDF, strength invalidation, original restore, new-photo scanning and rotation');

  await page.locator('#clear').click();
  await page.locator('#photo-input').setInputFiles(path.join(out,'pencil-paper.png'));
  await added(1);
  await page.evaluate(()=>{window.__NativeWorker=window.Worker;window.Worker=class{constructor(){throw new Error('test worker failure');}};});
  await page.locator('#scan-toggle').click();
  await page.waitForFunction(()=>!document.body.classList.contains('busy')&&document.querySelector('#status').textContent.includes('扫描未完成'));
  assert.equal(await page.locator('#scan-toggle').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#count').textContent(),'1');
  assert.equal(await page.locator('.scan-badge').count(),0);
  assert.equal(await page.locator('#generate').isDisabled(),false);
  await page.evaluate(()=>{window.Worker=window.__NativeWorker;delete window.__NativeWorker;});
  await page.locator('#clear').click();
  await page.locator('#photo-input').setInputFiles(path.join(out,'large-pencil.png'));
  await added(1);
  await page.locator('#scan-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#scan-toggle').getAttribute('aria-pressed')==='true'&&!document.body.classList.contains('busy'),null,{timeout:60000});
  await page.getByRole('button',{name:'第 1 页查看大图',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#detail-canvas').hidden&&document.querySelector('#detail-status').textContent.includes('白底扫描效果'));
  const largeSize=await page.locator('#detail-canvas').evaluate(c=>({width:c.width,height:c.height}));
  assert.equal(largeSize.width,4096);
  assert.ok(largeSize.width*largeSize.height<=12000000);
  for (const width of [320,390,768]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`preview horizontal overflow at ${width}px`);
  }
  await page.locator('#detail-close').click();
  await result();
  await downloadPdf('large-scan.pdf');
  assert.ok((await readFile(path.join(out,'large-scan.pdf'))).toString('latin1').includes('/Width 4096'),'Scan must use the source file instead of the 2800px JPEG');
  console.log('PASS: worker failure preserves originals, 12.6 MP source scans at 4096px/under 12 MP, responsive preview, full-resolution PNG embedded in PDF');

  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'horizontal overflow with 200% text');
  await page.evaluate(()=>document.documentElement.style.fontSize='16px');

  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const cacheEntries = await page.evaluate(async()=>{const all=[];for(const key of await caches.keys()){const cache=await caches.open(key);all.push(...(await cache.keys()).map((r)=>r.url));}return all;});
  assert.equal(cacheEntries.length,12);
  assert.ok(cacheEntries.every((entry)=>entry.startsWith(base)&&!entry.includes('blob:')));
  if (process.env.TEST_BROWSER === 'webkit') {
    // Playwright #42775: its WebKit offline flag blocks even a literal SW response.
    // Stop the origin instead, so this still proves a real unavailable-network path.
    await new Promise((resolve)=>server.close(resolve));
  } else await context.setOffline(true);
  await page.reload();
  await page.locator('#choose').waitFor({state:'visible'});
  await page.locator('#photo-input').setInputFiles(fixtures.map((f)=>path.join(out,f.name)));
  await added(3);
  await result();
  const offline = await downloadPdf('offline.pdf');
  assert.equal(offline.pdf.getPageCount(),3);
  await page.locator('#clear').click();
  await page.locator('#photo-input').setInputFiles(path.join(out,'pencil-paper.png'));
  await added(1);
  await page.locator('#scan-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#scan-toggle').getAttribute('aria-pressed')==='true'&&!document.body.classList.contains('busy'));
  await result();
  const offlineScan=await downloadPdf('offline-scan.pdf');
  assert.equal(offlineScan.pdf.getPageCount(),1);
  console.log('PASS: 320–1280px layouts, 200% text, offline reload and PDF generation, no photo/PDF cache');
  assert.deepEqual(externalRequests,[]);
  assert.deepEqual(failures,[]);
  console.log(`PASS: ${process.env.TEST_BROWSER || 'chromium'} completed with zero page errors or external requests`);
} finally {
  await context.close();await browser.close();if(server.listening) await new Promise((resolve)=>server.close(resolve));
}
