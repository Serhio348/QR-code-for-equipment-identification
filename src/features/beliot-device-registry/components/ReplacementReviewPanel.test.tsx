import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { MeterReplacementEvent } from '../types/beliotDeviceRegistry';
import { ReplacementReviewPanel } from './ReplacementReviewPanel';

const EVENT: MeterReplacementEvent = {
  id: '90d38309-f196-4e0f-9ad8-5be204ad2104',
  deviceId: '11363',
  deviceName: 'ХВО',
  status: 'pending_review',
  detectionSource: 'reading_drop',
  oldReadingValue: 52061.81,
  oldReadingAt: '2026-07-30T21:00:00.000Z',
  newReadingValue: 14382.1,
  newReadingAt: '2026-07-31T21:00:00.000Z',
  dropM3: 37679.71,
  dropRatio: 0.72,
  suggestedReplacementDay: '2026-07-31',
  oldSerialNumber: '13001986',
  providerSerialNumber: null,
  confirmedSerialNumber: null,
  firstDayVolumeM3: null,
  reason: null,
  detectedAt: '2026-08-01T00:00:00.000Z',
};

describe('ReplacementReviewPanel', () => {
  it('requires a new serial number before confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(true);

    render(
      <ReplacementReviewPanel
        events={[EVENT]}
        loading={false}
        busyEventId={null}
        error={null}
        onConfirm={onConfirm}
        onDismiss={vi.fn().mockResolvedValue(true)}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Подтвердить замену' });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText('Новый заводской номер'), '13001660');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith(EVENT.id, {
      replacementDay: '2026-07-31',
      newSerialNumber: '13001660',
      firstDayVolumeM3: null,
      reason: null,
    });
  });
});
