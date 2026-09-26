import { describe, expect, it } from 'vitest';
import { authorshipForSave } from './analysisAuthorship';

describe('authorshipForSave', () => {
  it('keeps original authors when another person edits the record', () => {
    const fields = authorshipForSave({
      mode: 'edit',
      currentUser: 'editor@plant.local',
      changeAuthors: false,
    });

    expect(fields.sampledBy).toBeUndefined();
    expect(fields.analyzedBy).toBeUndefined();
    expect(fields.responsiblePerson).toBeUndefined();
    expect(fields.updatedBy).toBe('editor@plant.local');
  });

  it('writes the current user as author only on create or an explicit change', () => {
    const created = authorshipForSave({
      mode: 'create',
      currentUser: 'lab@plant.local',
      changeAuthors: false,
    });
    expect(created.sampledBy).toBe('lab@plant.local');

    const explicit = authorshipForSave({
      mode: 'edit',
      currentUser: 'lead@plant.local',
      changeAuthors: true,
    });
    expect(explicit.responsiblePerson).toBe('lead@plant.local');
  });
});
