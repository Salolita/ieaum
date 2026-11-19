import { strFromU8, unzipSync } from 'fflate';
import { maxPages } from '../portal/client/utils/erae-model';

const namespaces = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
};
const imageType: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const find = (element: Document | Element | undefined, namespace: 'p' | 'a', name: string) => element?.getElementsByTagNameNS(namespaces[namespace], name)[0];
const number = (node: Element | undefined, property: string, fallback = 0) => Number(node?.getAttribute(property) ?? fallback);

export function loadPowerPoint(data: Uint8Array) {
  let inflated = 0;
  const files = unzipSync(data, { filter: (file) => {
    if (!/^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/(?:slide\d+\.xml|_rels\/slide\d+\.xml\.rels)|media\/[^/]+\.(?:png|jpe?g|webp|gif))$/i.test(file.name)) return false;
    const cap = file.name.startsWith('ppt/media/') ? 12_000_000 : 3_000_000;
    if (file.originalSize > cap || (inflated += file.originalSize) > 55_000_000) throw new Error('حجم محتوای داخلی پاورپوینت بیش از حد است. خروجی PDF را بارگذاری کنید.');
    return true;
  } });
  function xml(path: string) {
    const bytes = files[path];
    if (!bytes) return;
    const document = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('ساختار فایل پاورپوینت معتبر نیست.');
    return document;
  }
  function relationships(path: string) {
    const source = xml(path);
    const root = `https://pptx.invalid/ppt/${path.startsWith('ppt/slides/') ? 'slides/' : ''}`;
    const references = new Map<string, string>();
    for (const relationship of source?.getElementsByTagNameNS('*', 'Relationship') ?? []) {
      if (relationship.getAttribute('TargetMode') === 'External') continue;
      const target = new URL(relationship.getAttribute('Target') ?? '', root);
      if (target.origin === 'https://pptx.invalid') references.set(relationship.getAttribute('Id') ?? '', target.pathname.slice(1));
    }
    return references;
  }

  const presentation = xml('ppt/presentation.xml');
  const relations = relationships('ppt/_rels/presentation.xml.rels');
  const slideIds = Array.from(find(presentation, 'p', 'sldIdLst')?.getElementsByTagNameNS(namespaces.p, 'sldId') ?? []);
  const paths = slideIds.map((slide) => relations.get(slide.getAttributeNS(namespaces.r, 'id') ?? '') ?? '');
  if (!paths.length || paths.length > maxPages || paths.some((path) => !/^ppt\/slides\/slide\d+\.xml$/.test(path) || !files[path])) {
    throw new Error(`پاورپوینت باید معتبر و دارای ۱ تا ${maxPages} اسلاید باشد.`);
  }
  const size = find(presentation, 'p', 'sldSz');
  const cx = number(size, 'cx', 12_192_000);
  const cy = number(size, 'cy', 6_858_000);
  if (cx < 1 || cy < 1 || !Number.isFinite(cx + cy)) throw new Error('ابعاد اسلایدهای پاورپوینت معتبر نیست.');
  const scale = 1600 / Math.max(cx, cy);
  const color = (element: Element | undefined, fallback: string) => {
    const rgb = find(element, 'a', 'srgbClr')?.getAttribute('val') ?? '';
    return /^[\da-f]{6}$/i.test(rgb) ? '#' + rgb : fallback;
  };
  function drawText(context: CanvasRenderingContext2D, body: Element, x: number, y: number, width: number, height: number) {
    let lineTop = y + Math.min(10, height / 10);
    for (const paragraph of Array.from(body.children).filter((item) => item.localName === 'p')) {
      const content = Array.from(paragraph.getElementsByTagNameNS(namespaces.a, 't')).map((node) => node.textContent).join('');
      const properties = find(paragraph, 'a', 'rPr') ?? find(paragraph, 'a', 'defRPr');
      const points = Math.max(8, Math.min(120, number(properties, 'sz', 2600) / 100));
      const font = Math.max(9, points * 12_700 * scale);
      const rtl = find(paragraph, 'a', 'pPr')?.getAttribute('rtl') === '1' || /^\s*\p{Script=Arabic}/u.test(content);
      const align = find(paragraph, 'a', 'pPr')?.getAttribute('algn');
      context.font = `${properties?.getAttribute('b') === '1' ? '700 ' : ''}${font}px Vazirmatn, Tahoma, sans-serif`;
      context.direction = rtl ? 'rtl' : 'ltr';
      context.textAlign = align === 'ctr' ? 'center' : align === 'r' || rtl ? 'right' : 'left';
      context.textBaseline = 'top';
      context.fillStyle = color(find(properties, 'a', 'solidFill'), '#17131e');
      const left = x + (context.textAlign === 'center' ? width / 2 : context.textAlign === 'right' ? width - 6 : 6);
      let line = '';
      const render = () => {
        if (line && lineTop < y + height) context.fillText(line, left, lineTop, Math.max(1, width - 12));
        lineTop += font * 1.26;
      };
      for (const word of content.split(/\s+/u)) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > width - 12) { render(); line = word; }
        else line = next;
      }
      render();
    }
  }

  return { count: paths.length, width: cx * scale, height: cy * scale, async render(index: number, context: CanvasRenderingContext2D) {
    const path = paths[index];
    const slide = xml(path);
    const embed = relationships(`ppt/slides/_rels/${path.split('/').at(-1)}.rels`);
    context.fillStyle = color(find(find(slide, 'p', 'bg'), 'a', 'solidFill'), '#ffffff');
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    let placeholderY = context.canvas.height * 0.07;
    for (const shape of find(slide, 'p', 'spTree')?.children ?? []) {
      if (shape.localName !== 'sp' && shape.localName !== 'pic') continue;
      const attributes = find(shape, 'p', 'spPr');
      const transform = find(attributes, 'a', 'xfrm');
      const offset = find(transform, 'a', 'off');
      const bounds = find(transform, 'a', 'ext');
      const x = number(offset, 'x', cx * 0.05) * scale;
      const y = offset ? number(offset, 'y') * scale : placeholderY;
      const width = number(bounds, 'cx', cx * 0.90) * scale;
      const height = number(bounds, 'cy', cy * 0.22) * scale;
      if (shape.localName === 'pic') {
        const target = embed.get(find(shape, 'a', 'blip')?.getAttributeNS(namespaces.r, 'embed') ?? '') ?? '';
        const bytes = files[target];
        const type = imageType[target.split('.').at(-1)?.toLowerCase() ?? ''];
        if (bytes && type) {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type })).catch(() => undefined);
          if (bitmap) { try { context.drawImage(bitmap, x, y, width, height); } finally { bitmap.close(); } }
        }
      } else {
        const fill = color(find(attributes, 'a', 'solidFill'), '');
        if (fill) { context.fillStyle = fill; context.fillRect(x, y, width, height); }
        const body = find(shape, 'p', 'txBody');
        if (body) drawText(context, body, x, y, width, height);
        if (!offset && body) placeholderY += height;
      }
    }
  } };
}
