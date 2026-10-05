import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useDialogA11y } from './useDialogA11y';

function Example({ onClose }: { onClose: () => void }) {
  const { dialogRef, titleId } = useDialogA11y(true, onClose);
  return (
    <>
      <button type="button">Снаружи</button>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>Журнал</h2>
        <button type="button">Первая</button>
        <button type="button">Последняя</button>
      </div>
    </>
  );
}

describe('useDialogA11y', () => {
  it('names the dialog, traps tab, and returns focus after close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const outside = document.createElement('button');
    outside.textContent = 'Открыть';
    document.body.appendChild(outside);
    outside.focus();

    const view = render(<Example onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Журнал' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Первая' })).toHaveFocus());

    await user.tab();
    expect(screen.getByRole('button', { name: 'Последняя' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Первая' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();

    view.unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('keeps the cursor in the field when the close handler changes', async () => {
    const user = userEvent.setup();

    function FieldDialog({ onClose }: { onClose: () => void }) {
      const { dialogRef, titleId } = useDialogA11y(true, onClose);
      return (
        <div ref={dialogRef} role="dialog" aria-labelledby={titleId} tabIndex={-1}>
          <h2 id={titleId}>Журнал</h2>
          <input aria-label="Описание" />
        </div>
      );
    }

    const view = render(<FieldDialog onClose={() => {}} />);
    const field = screen.getByRole('textbox', { name: 'Описание' });
    await user.click(field);
    await user.type(field, 'а');
    expect(field).toHaveFocus();

    view.rerender(<FieldDialog onClose={() => {}} />);
    expect(field).toHaveFocus();
    expect(field).toHaveValue('а');
  });
});
