import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Button, props, 'إصدار الفاتورة'));

describe('Button', () => {
  it('is disabled while loading even if the caller passes disabled={false} (no double submit)', () => {
    expect(html({ loading: true, disabled: false })).toMatch(/<button[^>]* disabled=""/);
    expect(html({ loading: true })).toMatch(/aria-busy="true"/);
  });
  it('respects disabled and is enabled otherwise', () => {
    expect(html({ disabled: true })).toMatch(/ disabled=""/);
    expect(html({ disabled: false })).not.toMatch(/ disabled=""/);
    expect(html({})).not.toMatch(/ disabled=""/);
  });
  it('keeps other props (type, onClick target attributes)', () => {
    expect(html({ type: 'submit', 'aria-label': 'x' })).toMatch(/type="submit"/);
  });
});
