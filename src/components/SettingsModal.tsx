import { TransitionEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  clearCustomCss,
  getCurrentThemeVarValue,
  getStoredCustomCss,
  resetAllThemeVars,
  setCustomCss,
  setThemeVar,
  THEME_COLOR_VARS,
  THEME_RANGE_VARS,
  THEME_VAR_LABELS,
  type ThemeColorVarName,
  type ThemeRangeVarName,
} from '@/lib/theme';
import { Avatar } from './Avatar';

type SettingsTab = 'perfil' | 'tema';

/** Modal de Configurações com abas "Perfil" (somente leitura) e "Tema". Segue o mesmo padrão de fade/scale do {@link CreateServerModal}. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('perfil');

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /** Só desmonta quando a transição de saída do backdrop realmente termina — sem timeout fixo. */
  function handleBackdropTransitionEnd(e: TransitionEvent) {
    if (e.target === e.currentTarget && !visible) onClose();
  }

  return (
    <div
      className={`fixed inset-0 z-20 flex items-center justify-center p-4 transition-opacity duration-150 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ background: 'color-mix(in srgb, #06070f 65%, transparent)' }}
      onClick={() => setVisible(false)}
      onTransitionEnd={handleBackdropTransitionEnd}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex h-[85vh] w-full max-w-[900px] overflow-hidden rounded-lg shadow-xl transition-all duration-200 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) var(--agree-glass-opacity, 70%), transparent)',
          backdropFilter: 'blur(var(--agree-blur, 20px)) saturate(160%)',
        }}
      >
        <div
          className="flex w-56 flex-none flex-col gap-1 p-4"
          style={{
            background: 'color-mix(in srgb, var(--agree-bg) var(--agree-glass-opacity, 45%), transparent)',
            backdropFilter: 'blur(var(--agree-blur, 16px))',
          }}
        >
          <div className="mb-3 px-2 text-[16px] font-semibold">Configurações</div>
          <TabButton label="Perfil" active={activeTab === 'perfil'} onClick={() => setActiveTab('perfil')} />
          <TabButton label="Tema" active={activeTab === 'tema'} onClick={() => setActiveTab('tema')} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="text-neutral-500 transition-all duration-150 hover:rotate-90 hover:text-text"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {activeTab === 'perfil' ? <ProfileTab /> : <ThemeTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botão de aba da coluna lateral, realçado quando ativo. */
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors duration-150 ${
        active ? 'bg-accent/15 text-accent' : 'text-neutral-500 hover:bg-bg/40 hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

/** Aba "Perfil": visualização somente leitura do usuário logado — o backend ainda não suporta edição de perfil. */
function ProfileTab() {
  const { state } = useAuth();
  const user = state.status === 'signed-in' ? state.user : null;

  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="flex items-center gap-3">
        <Avatar seed={user?.username ?? '?'} size={56} />
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold">{user?.username ?? '—'}</div>
          <div className="text-[12px] text-neutral-500">Perfil somente leitura por enquanto</div>
        </div>
      </div>

      <ReadOnlyField label="Nome de usuário" value={user?.username ?? '—'} />
      <ReadOnlyField label="ID (sub)" value={user?.sub ?? '—'} />
    </div>
  );
}

/** Campo de exibição não editável, no mesmo estilo dos inputs do projeto. */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-neutral-400">{label}</label>
      <div className="min-h-9 truncate rounded-md border border-divider bg-bg/60 px-2.5 py-1.5 text-[13px] text-neutral-400">
        {value}
      </div>
    </div>
  );
}

/** Aba "Tema": editor de cores + aparência (opacidade/blur/borda/raio) das variáveis `--agree-*`, mais um editor de CSS customizado — tudo persistido via `src/lib/theme.ts`. */
function ThemeTab() {
  const [colorValues, setColorValues] = useState<Record<ThemeColorVarName, string>>(() => {
    const initial = {} as Record<ThemeColorVarName, string>;
    for (const name of THEME_COLOR_VARS) initial[name] = getCurrentThemeVarValue(name);
    return initial;
  });
  const [rangeValues, setRangeValues] = useState<Record<ThemeRangeVarName, number>>(() => {
    const initial = {} as Record<ThemeRangeVarName, number>;
    for (const v of THEME_RANGE_VARS) {
      const stored = parseFloat(getCurrentThemeVarValue(v.name));
      initial[v.name] = Number.isFinite(stored) ? stored : v.defaultValue;
    }
    return initial;
  });
  const [customCss, setCustomCssInput] = useState(() => getStoredCustomCss());

  function handleColorChange(name: ThemeColorVarName, value: string) {
    setColorValues((prev) => ({ ...prev, [name]: value }));
    setThemeVar(name, value);
  }

  function handleRangeChange(name: ThemeRangeVarName, value: number, unit: '%' | 'px') {
    setRangeValues((prev) => ({ ...prev, [name]: value }));
    setThemeVar(name, `${value}${unit}`);
  }

  function handleRestoreDefaults() {
    resetAllThemeVars();
    const restoredColors = {} as Record<ThemeColorVarName, string>;
    for (const name of THEME_COLOR_VARS) restoredColors[name] = getCurrentThemeVarValue(name);
    setColorValues(restoredColors);

    const restoredRanges = {} as Record<ThemeRangeVarName, number>;
    for (const v of THEME_RANGE_VARS) restoredRanges[v.name] = v.defaultValue;
    setRangeValues(restoredRanges);
  }

  function handleApplyCustomCss() {
    setCustomCss(customCss);
  }

  function handleClearCustomCss() {
    clearCustomCss();
    setCustomCssInput('');
  }

  return (
    <div className="flex flex-col gap-6 py-1">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold text-neutral-400">Cores do tema</div>
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="rounded-md border border-divider px-2.5 py-1 text-[12px] text-neutral-400 transition-all duration-150 hover:border-neutral-500 hover:text-text active:scale-[0.98]"
          >
            Restaurar padrão
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {THEME_COLOR_VARS.map((name) => (
            <ColorField
              key={name}
              label={THEME_VAR_LABELS[name]}
              value={colorValues[name]}
              onChange={(value) => handleColorChange(name, value)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="text-[13px] font-semibold text-neutral-400">Aparência dos painéis</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEME_RANGE_VARS.map((v) => (
            <RangeField
              key={v.name}
              label={v.label}
              unit={v.unit}
              min={v.min}
              max={v.max}
              step={v.step}
              value={rangeValues[v.name]}
              onChange={(value) => handleRangeChange(v.name, value, v.unit)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-[13px] font-semibold text-neutral-400">CSS customizado</div>
        <textarea
          value={customCss}
          onChange={(e) => setCustomCssInput(e.target.value)}
          placeholder=".agree-exemplo { color: red; }"
          spellCheck={false}
          className="min-h-32 resize-y rounded-md border border-divider bg-bg/60 p-2.5 text-[12px] outline-none transition-colors focus-visible:border-accent"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApplyCustomCss}
            className="rounded-md border border-accent px-4 py-1.5 text-[13px] font-medium text-accent transition-all duration-150 hover:bg-accent/10 active:scale-[0.98]"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={handleClearCustomCss}
            className="rounded-md border border-divider px-4 py-1.5 text-[13px] text-neutral-400 transition-all duration-150 hover:border-neutral-500 hover:text-text active:scale-[0.98]"
          >
            Limpar
          </button>
        </div>
      </section>
    </div>
  );
}

/** Campo de cor com `<input type="color">` sincronizado a um input de texto com o hex. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-neutral-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 flex-none cursor-pointer rounded-md border border-divider bg-transparent p-0.5"
          aria-label={label}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-9 w-full min-w-0 rounded-md border border-divider bg-bg/60 px-2.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:border-accent"
        />
      </div>
    </div>
  );
}

/** Campo numérico com `<input type="range">` sincronizado a um valor exibido com a unidade (`%`/`px`). */
function RangeField({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit: '%' | 'px';
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] text-neutral-400">{label}</label>
        <span className="text-[12px] font-medium text-text">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-full cursor-pointer accent-accent"
        aria-label={label}
      />
    </div>
  );
}
