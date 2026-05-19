/**
 * useModalA11y — ESC fecha, focus trap, auto-focus, restore
 */

import { describe, it, expect, vi } from 'vitest';
import { useRef } from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { useModalA11y } from './useModalA11y';

function TestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, ref);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog">
      <button>btn1</button>
      <input placeholder="campo" />
      <button>btn2</button>
    </div>
  );
}

describe('useModalA11y', () => {
  it('ESC chama onClose', () => {
    const onClose = vi.fn();
    render(<TestModal open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('não atua quando open=false', () => {
    const onClose = vi.fn();
    render(<TestModal open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('auto-focus no primeiro focável ao abrir', async () => {
    render(<TestModal open onClose={() => {}} />);
    await act(async () => {
      // setTimeout 0 dentro do hook
      await new Promise((r) => setTimeout(r, 10));
    });
    const btn1 = screen.getByRole('button', { name: 'btn1' });
    expect(document.activeElement).toBe(btn1);
  });

  // Focus trap (Tab/Shift+Tab) depende de offsetParent que jsdom não calcula.
  // Validação manual em browser real cobre esses casos.

  it('keydown handler é removido ao desmontar', () => {
    const onClose = vi.fn();
    const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<TestModal open onClose={onClose} />);
    unmount();
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
    );
  });
});
