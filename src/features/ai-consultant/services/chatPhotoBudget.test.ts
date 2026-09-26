import { describe, expect, it } from 'vitest';
import { CHAT_PHOTO_BUDGET_BYTES, encodedPhotoBytes, planPhotoSelection } from './chatPhotoBudget';

const MB = 1024 * 1024;

describe('planPhotoSelection', () => {
  it('accepts one 10 MB photo after base64 encoding', () => {
    const encoded = encodedPhotoBytes(10 * MB);
    expect(encoded).toBeLessThan(CHAT_PHOTO_BUDGET_BYTES);
    expect(planPhotoSelection(0, [{ name: 'large.jpg', size: 10 * MB, type: 'image/jpeg' }])).toEqual({
      accepted: [0],
      errors: [],
    });
  });

  it('accepts several small photos and rejects the one that no longer fits', () => {
    const plan = planPhotoSelection(0, [
      { name: 'a.jpg', size: 4 * MB, type: 'image/jpeg' },
      { name: 'b.png', size: 4 * MB, type: 'image/png' },
      { name: 'c.jpg', size: 8 * MB, type: 'image/jpeg' },
    ]);
    expect(plan.accepted).toEqual([0, 1]);
    expect(plan.errors).toEqual(['«c.jpg» не помещается: вместе фото больше лимита сообщения']);
  });

  it('explains a file that is too large or the wrong type', () => {
    const plan = planPhotoSelection(0, [
      { name: 'huge.jpg', size: 11 * MB, type: 'image/jpeg' },
      { name: 'note.pdf', size: 1000, type: 'application/pdf' },
    ]);
    expect(plan.accepted).toEqual([]);
    expect(plan.errors).toEqual([
      '«huge.jpg» больше 10 МБ',
      '«note.pdf» — нужен JPEG, PNG, GIF или WebP',
    ]);
  });
});
