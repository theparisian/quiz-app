import { describe, expect, it } from 'vitest';
import {
  burgerWidth,
  fromRows,
  moveItem,
  previewRows,
  sameOrder,
  targetRow,
  toRows,
} from './layout';

describe('burger builder layout', () => {
  it('rows are the order upside down, both ways', () => {
    expect(toRows(['bottom', 'mid', 'top'])).toEqual(['top', 'mid', 'bottom']);
    expect(fromRows(toRows(['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);
  });

  it('moveItem moves one element and shifts the others', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });

  it('targetRow follows the finger by whole rows and stays in bounds', () => {
    expect(targetRow(3, 0, 60, 8)).toBe(3);
    expect(targetRow(3, 29, 60, 8)).toBe(3);
    expect(targetRow(3, 31, 60, 8)).toBe(4);
    expect(targetRow(3, -125, 60, 8)).toBe(1);
    expect(targetRow(1, -500, 60, 8)).toBe(0);
    expect(targetRow(6, 500, 60, 8)).toBe(7);
    expect(targetRow(2, 100, 0, 8)).toBe(2);
  });

  it('previewRows makes room for the dragged layer', () => {
    const rows = ['a', 'b', 'c', 'd'];
    expect(previewRows(rows, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(previewRows(rows, null, 2)).toEqual(rows);
    expect(previewRows(rows, 'z', 2)).toEqual(rows);
  });

  it('sameOrder and burgerWidth', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(burgerWidth(375, 60)).toBeCloseTo(186);
    expect(burgerWidth(1000, 200)).toBe(380);
    expect(burgerWidth(100, 10)).toBe(120);
  });
});
