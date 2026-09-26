/**
 * accessLoadState.ts
 *
 * Отличает сбой загрузки прав от запрета.
 *
 * 1. menuAccessView — меню: ошибка, нет профиля, запрет или список приложений
 * 2. guardDecision — guard не пускает внутрь ни при запрете, ни при ошибке
 * 3. profileQueryOutcome — нет строки и сбой сети это разные ответы PostgREST
 */

export type MenuAccessView = 'loading' | 'error' | 'profile-missing' | 'denied' | 'apps';

export function menuAccessView(input: {
  loading: boolean;
  accessError: string | null;
  profileMissing: boolean;
  appCount: number;
}): MenuAccessView {
  if (input.loading) return 'loading';
  if (input.accessError) return 'error';
  if (input.profileMissing) return 'profile-missing';
  if (input.appCount === 0) return 'denied';
  return 'apps';
}

export type GuardDecision = 'loading' | 'error' | 'denied' | 'allowed';

export function guardDecision(input: {
  checking: boolean;
  failed: boolean;
  hasAccess: boolean;
}): GuardDecision {
  if (input.checking) return 'loading';
  if (input.failed) return 'error';
  if (input.hasAccess) return 'allowed';
  return 'denied';
}

export function profileQueryOutcome(error: { code?: string } | null | undefined): 'ok' | 'missing' | 'failed' {
  if (!error) return 'ok';
  if (error.code === 'PGRST116') return 'missing';
  return 'failed';
}
