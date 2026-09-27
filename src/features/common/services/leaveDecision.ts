/**
 * leaveDecision.ts
 *
 * Можно ли закрыть форму: сразу, после подтверждения или нельзя, пока идёт запись.
 */

export type LeaveDecision = 'allow' | 'confirm' | 'block';

export function leaveDecision(input: { dirty: boolean; saving: boolean }): LeaveDecision {
    if (input.saving) return 'block';
    if (input.dirty) return 'confirm';
    return 'allow';
}

export function maintenanceDraftIsDirty(input: {
    type: string;
    description: string;
    performedBy: string;
    fileCount: number;
    editing: boolean;
}): boolean {
    return input.editing
        || input.fileCount > 0
        || input.type.trim().length > 0
        || input.description.trim().length > 0
        || input.performedBy.trim().length > 0;
}
