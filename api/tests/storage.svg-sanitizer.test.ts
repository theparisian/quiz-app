import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors/app-error.js';
import { sanitizeSvg } from '../src/shared/upload/svg-sanitizer.js';

describe('sanitizeSvg', () => {
  it('strips script and on* handlers', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="evil()" width="1"/></svg>`;
    const clean = sanitizeSvg(Buffer.from(dirty, 'utf8')).toString('utf8');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
  });

  it('rejects non-svg', () => {
    expect(() => sanitizeSvg(Buffer.from('<html></html>', 'utf8'))).toThrow(AppError);
  });
});
