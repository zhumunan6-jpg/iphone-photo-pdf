/* All photo bytes and generated PDFs stay in memory on this device. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const photos = [];
  let busy = false;
  let generated = null;
  let nextId = 0;
  const icons = {
    earlier: '<path d="m15 18-6-6 6-6"/>',
    later: '<path d="m9 18 6-6-6-6"/>',
    rotate: '<path d="M20 8V3l-3 3a8 8 0 1 0 3 9M20 3h-5"/>',
    remove: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>'
  };
  const today = new Date();
  $('filename').value = `照片_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  function message(text, error = false) {
    $('status').textContent = text;
    $('status').classList.toggle('error', error);
  }
  function setBusy(value, label = '') {
    busy = value;
    document.body.classList.toggle('busy', value);
    for (const id of ['choose', 'add-more', 'clear', 'photo-input', 'filename', 'page-size', 'save']) $(id).disabled = value;
    $('progress-wrap').hidden = !value;
    $('generate-label').textContent = value ? label : (generated ? '重新生成 PDF' : '生成 PDF');
    $('generate').disabled = value || !photos.length;
    $('generate').setAttribute('aria-busy', String(value));
  }
  function invalidate() {
    if (generated) URL.revokeObjectURL(generated.url);
    generated = null;
    $('result').hidden = true;
    $('preview').removeAttribute('href');
    $('download').removeAttribute('href');
    $('generate-label').textContent = '生成 PDF';
  }
  function render() {
    const list = $('photo-list');
    list.replaceChildren();
    photos.forEach((photo, index) => {
      const card = document.createElement('li');
      card.className = 'photo-card';
      card.dataset.id = String(photo.id);
      const number = document.createElement('span');
      number.className = 'page-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const preview = document.createElement('div');
      preview.className = 'photo-preview';
      const img = document.createElement('img');
      img.src = photo.thumbnail;
      img.alt = `第 ${index + 1} 页：${photo.name}`;
      // Fit the rotated thumbnail inside its frame, including 90-degree turns.
      const turn = photo.rotation % 180 !== 0;
      img.style.transform = `rotate(${photo.rotation}deg)${turn ? ' scale(.72)' : ''}`;
      preview.append(img);
      const name = document.createElement('p');
      name.className = 'photo-name';
      name.textContent = photo.name;
      name.title = photo.name;
      const actions = document.createElement('div');
      actions.className = 'photo-actions';
      for (const [action, label] of [['earlier', '向前移动'], ['later', '向后移动'], ['rotate', '顺时针旋转'], ['remove', '删除']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = action;
        button.setAttribute('aria-label', `第 ${index + 1} 页${label}`);
        button.title = label;
        button.disabled = busy || (action === 'earlier' && index === 0) || (action === 'later' && index === photos.length - 1);
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[action]}</svg>`;
        actions.append(button);
      }
      card.append(number, preview, name, actions);
      list.append(card);
    });
    $('photos-section').hidden = !photos.length;
    $('choose').hidden = !!photos.length;
    $('count').textContent = String(photos.length);
    $('bottom-summary').textContent = photos.length ? `${photos.length} 张照片 · ${photos.length} 页 PDF` : '先选照片，再生成 PDF';
    $('generate').disabled = busy || !photos.length;
  }
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取照片')); };
      img.src = url;
    });
  }
  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('照片转换失败')), 'image/jpeg', quality));
  }
  async function preparePhoto(file) {
    const img = await loadImage(file);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('照片尺寸无效');
    const scale = Math.min(1, 2800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理照片');
    // HTMLImageElement honors EXIF orientation on supported iPhone Safari.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = await canvasBlob(canvas, .92);
    const width = canvas.width, height = canvas.height;
    const thumb = document.createElement('canvas');
    const ratio = Math.min(1, 360 / Math.max(width, height));
    thumb.width = Math.max(1, Math.round(width * ratio));
    thumb.height = Math.max(1, Math.round(height * ratio));
    thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const thumbnail = URL.createObjectURL(await canvasBlob(thumb, .75));
    canvas.width = canvas.height = thumb.width = thumb.height = 1;
    img.src = '';
    return { id: nextId++, name: file.name, bytes: new Uint8Array(await jpeg.arrayBuffer()), width, height, rotation: 0, thumbnail };
  }
  async function addFiles(files) {
    if (busy || !files.length) return;
    invalidate();
    setBusy(true, '正在读取照片…');
    const failed = [];
    let added = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        message(`正在读取第 ${i + 1} / ${files.length} 张照片…`);
        $('progress').value = Math.round(i / files.length * 100);
        await tick();
        const file = files[i];
        if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.name)) { failed.push(file.name); continue; }
        try { photos.push(await preparePhoto(file)); added++; }
        catch { failed.push(file.name); }
      }
    } finally {
      setBusy(false);
      render();
      $('photo-input').value = '';
    }
    if (failed.length) message(`已添加 ${added} 张。以下 ${failed.length} 个文件无法读取，未加入 PDF：${failed.join('、')}。HEIC 照片请用 iOS 17 或更新版本的 Safari，或先转成 JPEG。`, true);
    else message(`已添加 ${added} 张照片，可以调整顺序后生成 PDF。`);
  }
  async function imageForPdf(photo) {
    if (!photo.rotation) return { bytes: photo.bytes, width: photo.width, height: photo.height };
    const img = await loadImage(new Blob([photo.bytes], { type: 'image/jpeg' }));
    const canvas = document.createElement('canvas');
    const sideways = photo.rotation % 180 !== 0;
    canvas.width = sideways ? photo.height : photo.width;
    canvas.height = sideways ? photo.width : photo.height;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(photo.rotation * Math.PI / 180);
    ctx.drawImage(img, -photo.width / 2, -photo.height / 2);
    const bytes = new Uint8Array(await (await canvasBlob(canvas, .92)).arrayBuffer());
    const width = canvas.width, height = canvas.height;
    canvas.width = canvas.height = 1;
    img.src = '';
    return { bytes, width, height };
  }
  function filename() {
    const clean = $('filename').value.replace(/\.pdf$/i, '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 80);
    return `${clean || '照片成册'}.pdf`;
  }
  function formatBytes(size) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`; }
  async function generate() {
    if (busy || !photos.length) return;
    if (!window.PDFLib) { message('PDF 组件未加载，请联网刷新后重试。', true); return; }
    invalidate();
    setBusy(true, '正在生成 PDF…');
    try {
      const pdf = await PDFLib.PDFDocument.create();
      pdf.setTitle(filename().replace(/\.pdf$/i, ''));
      pdf.setCreator('照片成册');
      pdf.setProducer('pdf-lib');
      for (let i = 0; i < photos.length; i++) {
        message(`正在合成第 ${i + 1} / ${photos.length} 页…`);
        $('progress').value = Math.round(i / photos.length * 100);
        await tick();
        const photo = await imageForPdf(photos[i]);
        const image = await pdf.embedJpg(photo.bytes);
        let pageWidth, pageHeight;
        if ($('page-size').value === 'photo') {
          const ratio = 842 / Math.max(photo.width, photo.height);
          pageWidth = photo.width * ratio; pageHeight = photo.height * ratio;
        } else {
          [pageWidth, pageHeight] = photo.width > photo.height ? [841.89, 595.28] : [595.28, 841.89];
        }
        const fit = Math.min(pageWidth / photo.width, pageHeight / photo.height);
        const width = photo.width * fit, height = photo.height * fit;
        pdf.addPage([pageWidth, pageHeight]).drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
      }
      const bytes = await pdf.save();
      const file = new File([bytes], filename(), { type: 'application/pdf' });
      const url = URL.createObjectURL(file);
      generated = { file, url };
      $('result-name').textContent = file.name;
      $('result-meta').textContent = `${photos.length} 页 · ${formatBytes(file.size)}`;
      $('preview').href = $('download').href = url;
      $('download').download = file.name;
      const canShare = supportsFileShare(file);
      $('save').textContent = canShare ? '保存到文件 / 分享' : '下载 PDF';
      $('save-hint').textContent = canShare ? '在弹出的菜单中选择“存储到‘文件’”。' : '也可打开 PDF，通过浏览器的分享菜单保存到“文件”。';
      $('result').hidden = false;
      message('PDF 已生成。请点“保存到文件 / 分享”或下载按钮完成保存。');
      $('progress').value = 100;
    } catch (error) {
      console.error('PDF generation failed:', error);
      message('生成失败。请减少一次选择的照片数量后重试，或刷新页面重新选择。', true);
    } finally { setBusy(false); }
    if (generated) $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }
  function supportsFileShare(file) {
    try { return !!navigator.share && !!navigator.canShare && navigator.canShare({ files: [file] }); }
    catch { return false; }
  }
  async function save() {
    if (busy || !generated) return;
    if (!supportsFileShare(generated.file)) { $('download').click(); return; }
    $('save').disabled = true;
    try {
      // Called directly on a fresh tap, after generation, to preserve iOS user activation.
      await navigator.share({ files: [generated.file] });
      message('已完成分享操作。如选择了“存储到‘文件’”，可在“文件”App 中查看。');
    } catch (error) {
      if (error.name === 'AbortError') message('已取消分享，PDF 仍在这里，可再次保存。');
      else message('未能打开分享菜单。请点“打开 PDF”，再通过浏览器分享菜单保存到“文件”，或点“下载 PDF”。', true);
    } finally { $('save').disabled = false; }
  }
  for (const id of ['choose', 'add-more']) $(id).addEventListener('click', () => { if (!busy) $('photo-input').click(); });
  $('photo-input').addEventListener('change', (event) => addFiles(Array.from(event.target.files || [])));
  $('photo-list').addEventListener('click', (event) => {
    if (busy) return;
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const id = Number(button.closest('.photo-card').dataset.id);
    const index = photos.findIndex((p) => p.id === id);
    if (index < 0) return;
    const action = button.dataset.action;
    invalidate();
    if (action === 'remove') { URL.revokeObjectURL(photos[index].thumbnail); photos.splice(index, 1); }
    if (action === 'rotate') photos[index].rotation = (photos[index].rotation + 90) % 360;
    if (action === 'earlier' && index > 0) [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]];
    if (action === 'later' && index < photos.length - 1) [photos[index + 1], photos[index]] = [photos[index], photos[index + 1]];
    render(); message('照片已更新，请生成 PDF。');
    const card = $('photo-list').querySelector(`[data-id="${id}"]`);
    const focusButton = card?.querySelector(`[data-action="${action}"]:not(:disabled)`) || card?.querySelector('button:not(:disabled)');
    focusButton?.focus({ preventScroll: true });
  });
  $('clear').addEventListener('click', () => {
    if (busy) return;
    photos.forEach((p) => URL.revokeObjectURL(p.thumbnail));
    photos.length = 0; invalidate(); render(); message('已清空，可重新选择照片。');
  });
  for (const id of ['filename', 'page-size']) $(id).addEventListener('input', () => { if (generated) { invalidate(); message('设置已更新，请重新生成 PDF。'); } });
  $('generate').addEventListener('click', generate);
  $('save').addEventListener('click', save);
  $('choose').addEventListener('dragover', (event) => { event.preventDefault(); if (!busy) $('choose').classList.add('drag-over'); });
  $('choose').addEventListener('dragleave', () => $('choose').classList.remove('drag-over'));
  $('choose').addEventListener('drop', (event) => { event.preventDefault(); $('choose').classList.remove('drag-over'); addFiles(Array.from(event.dataTransfer.files)); });
  render();
  // Optional page-scoped agent API; no uploads, filesystem writes, or automatic sharing.
  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const schema = { type: 'object', properties: {}, additionalProperties: false };
    const readState = () => ({ photos: photos.length, busy, pdfReady: !!generated, pdfName: generated?.file.name || null });
    const validate = (input) => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object');
    };
    for (const tool of [
      { name: 'get_photo_pdf_state', title: '查看照片成册状态', description: 'Read the number of selected photos and whether a PDF has been generated. Does not expose photo content.', annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) { validate(input); return readState(); } },
      { name: 'generate_photo_pdf', title: '生成照片 PDF', description: 'Generate a PDF from the photos already selected by the user, using the visible filename and page settings. Does not save or share the PDF.', annotations: { readOnlyHint: false, untrustedContentHint: true }, async execute(input) { validate(input); if (busy || !photos.length) throw new Error('Select photos first and wait until processing finishes'); await generate(); if (!generated) throw new Error('PDF generation failed'); return readState(); } }
    ]) {
      try { Promise.resolve(document.modelContext.registerTool({ ...tool, inputSchema: schema }, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Browsers without this optional interface work normally. */ }
    }
    addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* Online conversion remains available. */ });
  }
})();
