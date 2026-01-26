/**
 * Тесты для утилит маршрутов
 */

import { describe, it, expect } from 'vitest';
import {
  ROUTES,
  getEquipmentViewUrl,
  getEquipmentEditUrl,
  extractEquipmentId,
  isEquipmentRoute,
} from '../routes';

describe('routes utilities', () => {
  describe('ROUTES constants', () => {
    it('should have correct route paths', () => {
      expect(ROUTES.HOME).toBe('/');
      expect(ROUTES.LOGIN).toBe('/login');
      expect(ROUTES.REGISTER).toBe('/register');
      expect(ROUTES.RESET_PASSWORD).toBe('/reset-password');
      expect(ROUTES.EQUIPMENT).toBe('/equipment');
      expect(ROUTES.EQUIPMENT_NEW).toBe('/equipment/new');
      expect(ROUTES.WATER).toBe('/water');
      expect(ROUTES.ACCESS_SETTINGS).toBe('/admin/access-settings');
    });

    it('should generate dynamic routes correctly', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      expect(ROUTES.EQUIPMENT_VIEW(id)).toBe(`/equipment/${id}`);
      expect(ROUTES.EQUIPMENT_EDIT(id)).toBe(`/equipment/${id}/edit`);
    });
  });

  describe('getEquipmentViewUrl', () => {
    it('should generate correct view URL', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const url = getEquipmentViewUrl(id);
      expect(url).toBe(`/equipment/${id}`);
    });

    it('should handle different ID formats', () => {
      const id = 'test-id-123';
      const url = getEquipmentViewUrl(id);
      expect(url).toBe(`/equipment/${id}`);
    });
  });

  describe('getEquipmentEditUrl', () => {
    it('should generate correct edit URL', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const url = getEquipmentEditUrl(id);
      expect(url).toBe(`/equipment/${id}/edit`);
    });
  });

  describe('extractEquipmentId', () => {
    it('should extract ID from view URL', () => {
      const pathname = '/equipment/550e8400-e29b-41d4-a716-446655440000';
      const id = extractEquipmentId(pathname);
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should extract ID from edit URL', () => {
      const pathname = '/equipment/550e8400-e29b-41d4-a716-446655440000/edit';
      const id = extractEquipmentId(pathname);
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return null for invalid paths', () => {
      expect(extractEquipmentId('/equipment')).toBeNull();
      expect(extractEquipmentId('/other/123')).toBeNull();
      expect(extractEquipmentId('/')).toBeNull();
    });

    it('should handle paths with additional segments', () => {
      const pathname = '/equipment/550e8400-e29b-41d4-a716-446655440000/something';
      const id = extractEquipmentId(pathname);
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('isEquipmentRoute', () => {
    it('should return true for equipment routes', () => {
      expect(isEquipmentRoute('/equipment')).toBe(true);
      expect(isEquipmentRoute('/equipment/123')).toBe(true);
      expect(isEquipmentRoute('/equipment/123/edit')).toBe(true);
      expect(isEquipmentRoute('/equipment/new')).toBe(true);
    });

    it('should return false for non-equipment routes', () => {
      expect(isEquipmentRoute('/')).toBe(false);
      expect(isEquipmentRoute('/login')).toBe(false);
      expect(isEquipmentRoute('/water')).toBe(false);
      expect(isEquipmentRoute('/admin/access-settings')).toBe(false);
    });
  });
});
