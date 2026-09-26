/**
 * analysisAuthorship.ts
 *
 * При редактировании автор отбора и ответственный не подменяются текущим пользователем.
 * Редактор пишется отдельно.
 */

export interface AuthorshipFields {
  sampledBy?: string;
  analyzedBy?: string;
  responsiblePerson?: string;
  updatedBy: string;
}

export function authorshipForSave(input: {
  mode: 'create' | 'edit';
  currentUser: string;
  changeAuthors: boolean;
}): AuthorshipFields {
  const updatedBy = input.currentUser;
  if (input.mode === 'create' || input.changeAuthors) {
    return {
      sampledBy: input.currentUser,
      analyzedBy: input.currentUser,
      responsiblePerson: input.currentUser,
      updatedBy,
    };
  }
  return { updatedBy };
}
