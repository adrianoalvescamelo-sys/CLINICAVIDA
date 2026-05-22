import { RefObject, useEffect } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Acessibilidade básica para modais:
 * - ESC fecha o modal (chama onClose).
 * - Foco trap: Tab cycla entre elementos focáveis dentro do dialog.
 * - Auto-focus: primeiro focável recebe foco ao abrir.
 * - Restore: ao fechar, foco volta para o elemento que tinha foco antes.
 *
 * Uso:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useModalA11y(open, onClose, ref);
 *   return <div ref={ref}>…</div>
 */
export function useModalA11y(
  open: boolean,
  onClose: () => void,
  dialogRef: RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const list = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      list?.[0]?.focus();
    };
    // setTimeout pra rodar depois do render do conteúdo
    const tid = setTimeout(focusFirst, 0);

    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const list = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handle);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('keydown', handle);
      // Restore focus, se o elemento anterior ainda existir
      if (prevFocus && typeof prevFocus.focus === 'function') {
        prevFocus.focus();
      }
    };
  }, [open, onClose, dialogRef]);
}
