/**
 * Fonte única dos atalhos de teclado: o mapa abaixo alimenta tanto o hook que
 * os escuta ({@link useKeyboardShortcuts}) quanto a aba "Atalhos" das
 * Configurações. Mudou um atalho, muda nos dois lugares de uma vez.
 */
export type ShortcutId =
  | 'commandPalette'
  | 'prevChannel'
  | 'nextChannel'
  | 'prevServer'
  | 'nextServer'
  | 'openSettings'
  | 'toggleMute'
  | 'toggleDeafen'
  | 'showShortcuts';

export type Shortcut = {
  id: ShortcutId;
  label: string;
  /** `Ctrl`/`Alt`/`Shift` + `KeyboardEvent.key`, separados por `+` (ex.: `Ctrl+K`, `Alt+ArrowUp`). No Mac, `Ctrl` casa com ⌘ também. */
  keys: string;
  group: 'Navegação' | 'Voz' | 'App';
};

export const SHORTCUTS: Shortcut[] = [
  { id: 'commandPalette', label: 'Buscar servidor, canal ou conversa', keys: 'Ctrl+K', group: 'Navegação' },
  { id: 'prevChannel', label: 'Canal / conversa anterior', keys: 'Alt+ArrowUp', group: 'Navegação' },
  { id: 'nextChannel', label: 'Próximo canal / conversa', keys: 'Alt+ArrowDown', group: 'Navegação' },
  { id: 'prevServer', label: 'Servidor anterior', keys: 'Ctrl+Alt+ArrowUp', group: 'Navegação' },
  { id: 'nextServer', label: 'Próximo servidor', keys: 'Ctrl+Alt+ArrowDown', group: 'Navegação' },
  { id: 'toggleMute', label: 'Silenciar / ativar microfone', keys: 'Ctrl+Shift+M', group: 'Voz' },
  { id: 'toggleDeafen', label: 'Ensurdecer / desensurdecer', keys: 'Ctrl+Shift+D', group: 'Voz' },
  { id: 'openSettings', label: 'Abrir configurações', keys: 'Ctrl+,', group: 'App' },
  { id: 'showShortcuts', label: 'Ver esta lista de atalhos', keys: 'Ctrl+/', group: 'App' },
];

/** Atalhos "implícitos", só para a lista de ajuda — não passam pelo mapa acima. */
export const IMPLICIT_SHORTCUTS: { label: string; keys: string; group: Shortcut['group'] }[] = [
  { label: 'Fechar modal, popover ou paleta', keys: 'Esc', group: 'App' },
  { label: 'Começar a digitar foca a caixa de mensagem', keys: 'Qualquer letra', group: 'App' },
  { label: 'Autocompletar emoji na mensagem', keys: ':nome', group: 'App' },
];

const MODIFIERS = new Set(['ctrl', 'alt', 'shift']);

/** Compara um `KeyboardEvent` com uma combinação no formato de {@link Shortcut.keys}. */
export function matchShortcut(e: KeyboardEvent, keys: string): boolean {
  const parts = keys.split('+');
  const key = parts.filter((p) => !MODIFIERS.has(p.toLowerCase())).join('+');
  const mods = new Set(parts.filter((p) => MODIFIERS.has(p.toLowerCase())).map((p) => p.toLowerCase()));

  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl !== mods.has('ctrl')) return false;
  if (e.altKey !== mods.has('alt')) return false;
  if (e.shiftKey !== mods.has('shift')) return false;

  return e.key.toLowerCase() === key.toLowerCase();
}

/** Rótulos legíveis das teclas para a tela de ajuda (`ArrowUp` → `↑`). */
export function keyLabels(keys: string): string[] {
  const names: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Ctrl: navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl',
  };
  return keys.split('+').map((k) => names[k] ?? k);
}
