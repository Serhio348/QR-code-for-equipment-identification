/**
 * OperationIdempotency.gs
 *
 * Повтор мутации с тем же operationId возвращает уже сохранённый ответ
 * и не создаёт вторую запись. Кэш живёт 6 часов.
 */

var pendingGasOperationId_ = '';

function gasOperationCacheKey_(operationId) {
  return 'gas-op:' + operationId;
}

function beginGasOperation(operationId) {
  pendingGasOperationId_ = operationId ? String(operationId).trim() : '';
  if (!pendingGasOperationId_) return null;
  try {
    var cached = CacheService.getScriptCache().get(gasOperationCacheKey_(pendingGasOperationId_));
    if (!cached) return null;
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('beginGasOperation cache read failed: ' + error);
    return null;
  }
}

function rememberGasOperationSuccess(data) {
  if (!pendingGasOperationId_) return;
  try {
    var body = JSON.stringify({ success: true, data: data });
    if (body.length > 90000) return;
    CacheService.getScriptCache().put(gasOperationCacheKey_(pendingGasOperationId_), body, 21600);
  } catch (error) {
    Logger.log('rememberGasOperationSuccess failed: ' + error);
  }
}

function readGasOperationResult(operationId) {
  if (!operationId) return createErrorResponse('operationId не указан');
  try {
    var cached = CacheService.getScriptCache().get(gasOperationCacheKey_(String(operationId)));
    if (!cached) return createErrorResponse('Операция не найдена');
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return createErrorResponse('Операция не найдена');
  }
}
