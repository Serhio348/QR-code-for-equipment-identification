/**
 * toolAccessPolicy.test.ts
 *
 * SEC-05: фильтр AI tools по правам equipment / water.
 */

import { describe, expect, it } from 'vitest';
import {
  filterToolsByAccess,
  getToolRequiredApp,
  isToolAllowedForAccess,
  buildAppAccessPrompt,
} from './toolAccessPolicy.js';

describe('toolAccessPolicy', () => {
  it('maps domain tools to required app', () => {
    expect(getToolRequiredApp('get_all_equipment')).toBe('equipment');
    expect(getToolRequiredApp('get_water_readings')).toBe('water');
    expect(getToolRequiredApp('get_memory')).toBeNull();
  });

  it('admin can use any tool', () => {
    const admin = { equipment: true, water: true, isAdmin: true };
    expect(isToolAllowedForAccess('get_water_readings', admin)).toBe(true);
    expect(isToolAllowedForAccess('get_all_equipment', admin)).toBe(true);
  });

  it('denies domain tools when access missing', () => {
    expect(isToolAllowedForAccess('get_water_readings', undefined)).toBe(false);
    expect(
      isToolAllowedForAccess('get_all_equipment', {
        equipment: false,
        water: false,
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it('filters tools by water-only access', () => {
    const tools = [
      { name: 'get_all_equipment' },
      { name: 'get_water_readings' },
      { name: 'get_memory' },
      { name: 'portal_list_invoices' },
    ];
    const filtered = filterToolsByAccess(tools, {
      equipment: false,
      water: true,
      isAdmin: false,
    });
    expect(filtered.map((t) => t.name)).toEqual([
      'get_water_readings',
      'get_memory',
      'portal_list_invoices',
    ]);
  });

  it('filters tools by equipment-only access', () => {
    const tools = [
      { name: 'get_all_equipment' },
      { name: 'get_water_readings' },
      { name: 'read_file_content' },
      { name: 'save_memory' },
    ];
    const filtered = filterToolsByAccess(tools, {
      equipment: true,
      water: false,
      isAdmin: false,
    });
    expect(filtered.map((t) => t.name)).toEqual([
      'get_all_equipment',
      'read_file_content',
      'save_memory',
    ]);
  });

  it('buildAppAccessPrompt marks missing sections and instructs denial reply', () => {
    const prompt = buildAppAccessPrompt({
      equipment: true,
      water: false,
      isAdmin: false,
    });
    expect(prompt).toContain('Оборудование: есть');
    expect(prompt).toContain('Вода: НЕТ');
    expect(prompt).toMatch(/администратору/i);
    expect(prompt).toMatch(/не выдумывай/i);
  });
});
