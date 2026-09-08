import { useEffect, useState } from 'react';
import { ChevronDown, Headphones, HeadphoneOff, Mic, MicOff, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useVoiceCall } from '@/lib/voice-context';
import { getVoiceSettings, setVoiceSettings, subscribeVoiceSettings } from '@/lib/voice-settings';
import { Avatar } from './Avatar';
import { DeviceMenu } from './DeviceMenu';

/** Signed-in user footer, spans the full width below the server rail + channel sidebar. */
export function UserBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state } = useAuth();
  const username = state.status === 'signed-in' ? state.user.username : '';
  const profileImageUrl = state.status === 'signed-in' ? state.user.profileImageUrl : null;
  const { muted, deafened, toggleMuted, toggleDeafened } = useVoiceCall();

  const [openMenu, setOpenMenu] = useState<'audioinput' | 'audiooutput' | null>(null);
  const [inputDeviceId, setInputDeviceId] = useState(getVoiceSettings().inputDeviceId);
  const [outputDeviceId, setOutputDeviceId] = useState(getVoiceSettings().outputDeviceId);

  useEffect(() => subscribeVoiceSettings((s) => {
    setInputDeviceId(s.inputDeviceId);
    setOutputDeviceId(s.outputDeviceId);
  }), []);

  return (
    <div
      className="relative flex h-18 w-full flex-none items-center gap-2 px-3.5 py-5"
      style={{ background: 'color-mix(in srgb, var(--agree-bg) var(--agree-glass-opacity, 50%), transparent)' }}
    >
      <Avatar seed={username || '?'} avatarUrl={profileImageUrl ?? undefined} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{username}</div>
        <div className="text-[11px] text-neutral-400">Online</div>
      </div>

      <div className="relative flex items-center">
        <button
          type="button"
          title={muted ? 'Ativar microfone' : 'Silenciar microfone'}
          onClick={toggleMuted}
          className={`h-7 w-7 transition-all duration-200 hover:scale-110 active:scale-90 ${
            muted ? 'text-danger' : 'text-neutral-500 hover:text-accent'
          }`}
        >
          {muted ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
        <button
          type="button"
          title="Escolher microfone"
          onClick={() => setOpenMenu((m) => (m === 'audioinput' ? null : 'audioinput'))}
          className="-ml-1 h-7 w-4 text-neutral-500 transition-all duration-200 hover:text-accent active:scale-90"
        >
          <ChevronDown size={12} />
        </button>
        {openMenu === 'audioinput' && (
          <DeviceMenu
            kind="audioinput"
            selectedDeviceId={inputDeviceId}
            onSelect={(deviceId) => setVoiceSettings({ inputDeviceId: deviceId })}
            onClose={() => setOpenMenu(null)}
          />
        )}
      </div>

      <div className="relative flex items-center">
        <button
          type="button"
          title={deafened ? 'Reativar áudio' : 'Ensurdecer (muta mic e saída)'}
          onClick={toggleDeafened}
          className={`h-7 w-7 transition-all duration-200 hover:scale-110 active:scale-90 ${
            deafened ? 'text-danger' : 'text-neutral-500 hover:text-accent'
          }`}
        >
          {deafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
        </button>
        <button
          type="button"
          title="Escolher saída de áudio"
          onClick={() => setOpenMenu((m) => (m === 'audiooutput' ? null : 'audiooutput'))}
          className="-ml-1 h-7 w-4 text-neutral-500 transition-all duration-200 hover:text-accent active:scale-90"
        >
          <ChevronDown size={12} />
        </button>
        {openMenu === 'audiooutput' && (
          <DeviceMenu
            kind="audiooutput"
            selectedDeviceId={outputDeviceId}
            onSelect={(deviceId) => setVoiceSettings({ outputDeviceId: deviceId })}
            onClose={() => setOpenMenu(null)}
          />
        )}
      </div>

      <button
        type="button"
        title="Configurações"
        onClick={onOpenSettings}
        className="h-7 w-7 text-neutral-500 transition-all duration-200 hover:scale-110 hover:text-accent active:scale-90"
      >
        <Settings size={15} />
      </button>
    </div>
  );
}
