import { useEffect, useRef } from 'react';
import { matchShortcut, SHORTCUTS, type ShortcutId } from './shortcuts';

/** `id` do `<input>` do composer — o alvo do "digitar foca a caixa de mensagem". */
export const COMPOSER_INPUT_ID = 'agree-composer';

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Um único `keydown` na janela para todos os atalhos de {@link SHORTCUTS},
 * mais o "type-to-focus": uma tecla imprimível sem modificador, com o foco
 * fora de qualquer campo, leva o foco pro composer (a tecla ainda chega lá,
 * porque o foco muda antes do `keypress`). Os handlers ficam num ref para o
 * listener não ser re-registrado a cada render.
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  /** Desliga o type-to-focus enquanto uma modal está aberta — senão digitar com a modal de Configurações na frente focaria o composer atrás dela. */
  { typeToFocus = true }: { typeToFocus?: boolean } = {},
) {
  const handlersRef = useRef(handlers);
  const typeToFocusRef = useRef(typeToFocus);

  useEffect(() => {
    handlersRef.current = handlers;
    typeToFocusRef.current = typeToFocus;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;

      const editable = isEditable(e.target);
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

      for (const shortcut of SHORTCUTS) {
        if (!matchShortcut(e, shortcut.keys)) continue;
        const handler = handlersRef.current[shortcut.id];
        if (!handler) return;
        e.preventDefault();
        handler();
        return;
      }

      // Type-to-focus: só tecla "de texto" (1 caractere), sem Ctrl/Alt, e sem
      // já estar digitando em algum lugar.
      if (!typeToFocusRef.current || editable || hasModifier || e.key.length !== 1) return;
      const composer = document.getElementById(COMPOSER_INPUT_ID);
      if (composer instanceof HTMLInputElement && !composer.disabled) composer.focus();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
