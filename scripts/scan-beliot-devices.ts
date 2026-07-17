/**
 * Ежедневное серверное сканирование каталога устройств Beliot.
 *
 * Использует те же service-role и Beliot credentials, что почасовой сборщик.
 */

import { scanBeliotDevices } from '../ai-consultant-api/src/services/water/beliot/beliotRegistryService.js';

try {
  const result = await scanBeliotDevices(null, null);
  console.log('Beliot scan completed:', result);
} catch (error) {
  console.error('Beliot scan failed:', error);
  process.exitCode = 1;
}
