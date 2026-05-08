import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { AppError } from '../errors/app-error.js';

export function sanitizeSvg(buffer: Buffer): Buffer {
  const dirty = buffer.toString('utf8');
  const { window: w } = new JSDOM(dirty, { contentType: 'image/svg+xml' });
  const DOMPurify = createDOMPurify(w as never);
  const clean = DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject'],
  });
  if (!/<svg[\s>/]/i.test(clean)) {
    throw new AppError('Invalid SVG document', 400, 'INVALID_SVG');
  }
  return Buffer.from(clean, 'utf8');
}
