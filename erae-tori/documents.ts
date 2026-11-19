import { unzipSync, strFromU8 } from 'fflate';
import { maxImageBytes, maxPages } from '../portal/client/utils/erae-model';

const maxDocument = 25_000_000;
const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  return element;
}

async function jpeg(element: HTMLCanvasElement) {
  for (const quality of [0.88, 0.72, 0.55, 0.35]) {
    const blob = await new Promise<Blob | null>((resolve) => element.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= maxImageBytes) return blob;
  }
  throw new Error('یکی از تصاویر بیش از حد بزرگ است. اندازهٔ تصویر را کاهش دهید.');
}

async function pdfSlides(data: Uint8Array, progress: (text: string) => void) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  GlobalWorkerOptions.workerSrc = worker;
  const assets = import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : '/erae-tori/pdf/';
  const loading = getDocument({ data, stopAtErrors: true, maxImageSize: 32_000_000,
    cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`,
    iccUrl: `${assets}iccs/`, wasmUrl: `${assets}wasm/` });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages < 1 || pdf.numPages > maxPages) throw new Error(`PDF باید بین ۱ تا ${maxPages} صفحه داشته باشد.`);
    const pages = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      progress(`آماده‌سازی صفحهٔ ${index} از ${pdf.numPages}…`);
      const page = await pdf.getPage(index);
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 1700 / Math.max(original.width, original.height) });
      const element = canvas(viewport.width, viewport.height);
      await page.render({ canvas: element, canvasContext: element.getContext('2d')!, viewport, background: '#ffffff' }).promise;
      pages.push(await jpeg(element));
      page.cleanup();
      element.width = element.height = 1;
    }
    return pages;
  } finally { await loading.destroy(); }
}

function wordText(data: Uint8Array) {
  const files = unzipSync(data, { filter: (file) => file.name === 'word/document.xml' && file.originalSize <= 4_000_000 });
  if (!files['word/document.xml']) throw new Error('فایل Word معتبر نیست یا حجم محتوای آن بیش از حد است.');
  const xml = new DOMParser().parseFromString(strFromU8(files['word/document.xml']), 'application/xml');
  const body = xml.getElementsByTagNameNS(wordNamespace, 'body')[0];
  if (!body) throw new Error('محتوای Word خوانده نشد.');
  const lines: (string | null)[] = [];
  for (const paragraph of body.getElementsByTagNameNS(wordNamespace, 'p')) {
    let line = '';
    const newPage = () => { if (line) lines.push(line); line = ''; if (lines.at(-1) !== null) lines.push(null); };
    if (paragraph.getElementsByTagNameNS(wordNamespace, 'pageBreakBefore').length) newPage();
    for (const item of paragraph.getElementsByTagNameNS(wordNamespace, '*')) {
      if (item.localName === 't') line += item.textContent;
      if (item.localName === 'tab') line += '    ';
      if (item.localName === 'br') {
        if (item.getAttributeNS(wordNamespace, 'type') === 'page') newPage();
        else { lines.push(line); line = ''; }
      }
      if (item.localName === 'lastRenderedPageBreak') newPage();
    }
    lines.push(line);
  }
  return lines;
}

async function wordSlides(data: Uint8Array) {
  const lines = wordText(data);
  if (!lines.some((line) => line?.trim())) throw new Error('متنی برای ساخت اسلاید پیدا نشد. برای Word تصویری، خروجی PDF را بارگذاری کنید.');
  await document.fonts.load('32px Vazirmatn').catch(() => {});
  const pages: Blob[] = [];
  const element = canvas(1440, 900);
  const context = element.getContext('2d')!;
  let y = 90;
  const clear = () => { context.fillStyle = '#fff'; context.fillRect(0, 0, element.width, element.height); y = 90; };
  async function finishPage() {
    if (y === 90) return;
    if (pages.length >= maxPages) throw new Error(`فایل بیش از ${maxPages} صفحه دارد.`);
    pages.push(await jpeg(element));
    clear();
  }
  function draw(line: string, rtl: boolean) {
    context.font = '32px Vazirmatn, Tahoma, sans-serif';
    context.direction = rtl ? 'rtl' : 'ltr';
    context.textAlign = 'start';
    context.fillStyle = '#111d2f';
    context.fillText(line, rtl ? 1360 : 80, y, 1280);
    y += 45;
  }
  clear();
  for (const line of lines) {
    if (line === null) { await finishPage(); continue; }
    const rtl = /\p{Script=Arabic}/u.test(line);
    context.font = '32px Vazirmatn, Tahoma, sans-serif';
    let current = '';
    for (const word of line.trim().split(/\s+/)) {
      const combined = current ? `${current} ${word}` : word;
      if (current && context.measureText(combined).width > 1280) {
        if (y > 820) await finishPage();
        draw(current, rtl);
        current = word;
      } else current = combined;
    }
    if (y > 820) await finishPage();
    draw(current, rtl);
  }
  await finishPage();
  return pages;
}

export async function prepareSlides(file: File, progress: (text: string) => void) {
  if (!file.size || file.size > maxDocument) throw new Error('حجم فایل ارائه باید کمتر از ۲۵ مگابایت باشد.');
  const data = new Uint8Array(await file.arrayBuffer());
  if (/\.pdf$/i.test(file.name)) return pdfSlides(data, progress);
  if (/\.docx$/i.test(file.name)) return wordSlides(data);
  if (/\.pptx$/i.test(file.name)) {
    const { loadPowerPoint } = await import('./pptx');
    const deck = loadPowerPoint(data);
    await document.fonts.load('32px Vazirmatn').catch(() => {});
    const element = canvas(deck.width, deck.height);
    const context = element.getContext('2d')!;
    const slides = [];
    for (let index = 0; index < deck.count; index++) {
      progress(`آماده‌سازی اسلاید ${index + 1} از ${deck.count}…`);
      await deck.render(index, context);
      slides.push(await jpeg(element));
    }
    return slides;
  }
  throw new Error('فایل PDF، پاورپوینت PPTX یا Word با پسوند DOCX انتخاب کنید.');
}

export async function prepareCover(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8_000_000) throw new Error('جلد باید JPG، PNG یا WebP و کمتر از ۸ مگابایت باشد.');
  const source = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1500 / Math.max(source.width, source.height));
    const element = canvas(scale * source.width, scale * source.height);
    const context = element.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, element.width, element.height);
    context.drawImage(source, 0, 0, element.width, element.height);
    return await jpeg(element);
  } finally { source.close(); }
}
