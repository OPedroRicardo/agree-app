/**
 * Aplicação e persistência do tema do usuário: overrides das variáveis CSS
 * `--agree-*` (definidas em `src/index.css`) e um bloco de CSS customizado
 * injetado no `<head>`. Tudo fica em `localStorage` para sobreviver a reload.
 */

const THEME_OVERRIDES_KEY = 'agree:theme-overrides';
const CUSTOM_CSS_KEY = 'agree:custom-css';
const CUSTOM_CSS_STYLE_ID = 'agree-custom-css';

/** Nomes das variáveis de cor editáveis pela modal de Configurações. */
export const THEME_COLOR_VARS = [
  '--agree-bg',
  '--agree-chat-bg',
  '--agree-surface',
  '--agree-text',
  '--agree-accent',
  '--agree-accent-600',
  '--agree-accent-700',
  '--agree-neutral-400',
  '--agree-neutral-500',
  '--agree-neutral-600',
  '--agree-danger',
  '--agree-online',
  '--agree-idle',
] as const;

export type ThemeColorVarName = (typeof THEME_COLOR_VARS)[number];

/** Rótulos em PT-BR exibidos ao lado de cada variável de cor na modal de Tema. */
export const THEME_VAR_LABELS: Record<ThemeColorVarName, string> = {
  '--agree-bg': 'Fundo',
  '--agree-chat-bg': 'Fundo do chat',
  '--agree-surface': 'Superfície',
  '--agree-text': 'Texto',
  '--agree-accent': 'Destaque (accent)',
  '--agree-accent-600': 'Destaque escuro',
  '--agree-accent-700': 'Destaque mais escuro',
  '--agree-neutral-400': 'Neutro claro',
  '--agree-neutral-500': 'Neutro médio',
  '--agree-neutral-600': 'Neutro escuro',
  '--agree-danger': 'Perigo/erro',
  '--agree-online': 'Online',
  '--agree-idle': 'Ausente',
};

/**
 * Variáveis numéricas (não-cor) editáveis por um slider. Cada uma é lida com
 * um fallback próprio no local onde é usada (ver `index.css` e os componentes
 * que desenham painéis de vidro) — por isso fica sem valor nenhum aqui até o
 * usuário mexer: sem override, o app renderiza exatamente como antes dessa
 * feature existir. `defaultValue` só serve pra posicionar o slider a primeira
 * vez, nunca é escrito como CSS.
 */
export const THEME_RANGE_VARS = [
  {
    name: '--agree-glass-opacity',
    label: 'Opacidade dos painéis',
    unit: '%',
    min: 10,
    max: 100,
    step: 5,
    defaultValue: 55,
  },
  {
    name: '--agree-blur',
    label: 'Desfoque (blur)',
    unit: 'px',
    min: 0,
    max: 40,
    step: 2,
    defaultValue: 20,
  },
  {
    name: '--agree-radius',
    label: 'Arredondamento dos cantos',
    unit: 'px',
    min: 0,
    max: 28,
    step: 2,
    defaultValue: 14,
  },
  {
    name: '--agree-border-opacity',
    label: 'Opacidade da borda',
    unit: '%',
    min: 0,
    max: 100,
    step: 5,
    defaultValue: 16,
  },
] as const satisfies readonly {
  name: string;
  label: string;
  unit: '%' | 'px';
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}[];

export type ThemeRangeVarName = (typeof THEME_RANGE_VARS)[number]['name'];

export type ThemeVarName = ThemeColorVarName | ThemeRangeVarName;

const ALL_THEME_VAR_NAMES: ThemeVarName[] = [
  ...THEME_COLOR_VARS,
  ...THEME_RANGE_VARS.map((v) => v.name),
];

type ThemeOverrides = Partial<Record<ThemeVarName, string>>;

function readOverrides(): ThemeOverrides {
  try {
    const raw = localStorage.getItem(THEME_OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ThemeOverrides;
  } catch {
    return {};
  }
}

function writeOverrides(overrides: ThemeOverrides) {
  localStorage.setItem(THEME_OVERRIDES_KEY, JSON.stringify(overrides));
}

/** Lê o valor atualmente computado (herdado do `index.css` ou de um override anterior) de uma variável de tema. Vazio se a variável não tiver valor nenhum ainda (caso dos numéricos, antes do primeiro override). */
export function getCurrentThemeVarValue(name: ThemeVarName): string {
  const inline = document.documentElement.style.getPropertyValue(name).trim();
  if (inline) return inline;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Aplica e persiste um override de valor (cor, ou número+unidade como `"20px"`/`"55%"`) para a variável `name`. */
export function setThemeVar(name: ThemeVarName, value: string) {
  document.documentElement.style.setProperty(name, value);
  const overrides = readOverrides();
  overrides[name] = value;
  writeOverrides(overrides);
}

/** Remove o override de `name`, voltando ao valor padrão definido em `index.css`/nos componentes. */
export function resetThemeVar(name: ThemeVarName) {
  document.documentElement.style.removeProperty(name);
  const overrides = readOverrides();
  delete overrides[name];
  writeOverrides(overrides);
}

/** Remove todos os overrides (cores e numéricos), voltando o tema inteiro ao padrão. */
export function resetAllThemeVars() {
  for (const name of ALL_THEME_VAR_NAMES) {
    document.documentElement.style.removeProperty(name);
  }
  writeOverrides({});
}

function getOrCreateCustomCssStyleEl(): HTMLStyleElement {
  let el = document.getElementById(CUSTOM_CSS_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = CUSTOM_CSS_STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

/** Aplica e persiste um bloco de CSS customizado, injetado em `<style id="agree-custom-css">`. */
export function setCustomCss(css: string) {
  getOrCreateCustomCssStyleEl().textContent = css;
  localStorage.setItem(CUSTOM_CSS_KEY, css);
}

/** Remove o CSS customizado aplicado e persistido. */
export function clearCustomCss() {
  getOrCreateCustomCssStyleEl().textContent = '';
  localStorage.removeItem(CUSTOM_CSS_KEY);
}

/** Lê o CSS customizado persistido (string vazia se não houver nenhum). */
export function getStoredCustomCss(): string {
  return localStorage.getItem(CUSTOM_CSS_KEY) ?? '';
}

/**
 * Aplica tudo que estiver salvo em `localStorage` (overrides de cor/numéricos
 * + CSS customizado). Deve ser chamada uma vez no bootstrap do app, antes do
 * render, para não haver flash do tema padrão.
 */
export function applyStoredTheme() {
  const overrides = readOverrides();
  for (const [name, value] of Object.entries(overrides)) {
    if (value) document.documentElement.style.setProperty(name, value);
  }

  const css = getStoredCustomCss();
  if (css) getOrCreateCustomCssStyleEl().textContent = css;
}
