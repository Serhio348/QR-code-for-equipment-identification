/**
 * mediaPermissions.ts
 *
 * Запрос камеры/микрофона в том же user gesture (клик).
 * На iOS Safari/PWA getUserMedia из useEffect часто даёт not-allowed.
 */

export async function primeCameraPermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Камера не поддерживается в этом браузере');
  }

  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
  ];

  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Не удалось получить доступ к камере');
}

export function getCameraPermissionErrorMessage(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: string }).name)
      : '';
  const message = err instanceof Error ? err.message : String(err);
  const blob = `${name} ${message}`;

  if (/notallowed|permission|denied/i.test(blob)) {
    return 'Нет доступа к камере. Разрешите камеру для сайта и попробуйте снова.';
  }
  if (/notfound|devicesnotfound/i.test(blob)) {
    return 'Камера не найдена на устройстве.';
  }
  return message || 'Не удалось открыть камеру';
}
