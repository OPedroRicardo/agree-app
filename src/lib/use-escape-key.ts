import { useEffect, useRef } from 'react';

/**
 * Pilha de quem quer o Esc: só o último a montar (a modal/popover mais
 * recente) responde, então um Esc com o picker de emoji aberto dentro da
 * modal fecha o picker e não a modal. Um listener global só, em fase de
 * captura, para rodar antes do `onKeyDown` do composer e antes dos atalhos
 * globais de {@link useKeyboardShortcuts}.
 */
const stack: Array<() => void> = [];

function handleKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  stack[stack.length - 1]();
}

/** Chama `onEscape` quando Esc é pressionado e este é o overlay mais recente aberto. */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  const callbackRef = useRef(onEscape);

  useEffect(() => {
    callbackRef.current = onEscape;
  });

  useEffect(() => {
    if (!enabled) return;
    const entry = () => callbackRef.current();
    stack.push(entry);
    if (stack.length === 1) window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled]);
}
