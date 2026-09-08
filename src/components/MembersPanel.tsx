import { Users } from 'lucide-react';

/** Right-side drawer, animated by `open` (always mounted so the close transition plays). Placeholder — no backend presence data. */
export function MembersPanel({ open }: { open: boolean }) {
  return (
    <div
      aria-hidden={!open}
      className={`flex flex-none overflow-hidden transition-[width,opacity,transform] duration-300 ease-out ${
        open ? 'w-55 translate-x-0 opacity-100' : 'w-0 translate-x-3 opacity-0'
      }`}
      style={{
        background: 'color-mix(in srgb, var(--agree-surface) 45%, transparent)',
        backdropFilter: 'blur(22px) saturate(150%)',
      }}
    >
      <div className="flex w-55 flex-none flex-col items-center gap-3 overflow-y-auto p-4 text-center">
        <Users size={22} className="mt-6 text-neutral-500" />
        <div className="text-[11px] leading-relaxed text-neutral-500">
          Lista de membros e status online/offline em breve — o backend do
          Agree não expõe presença nem participantes por servidor hoje.
        </div>
      </div>
    </div>
  );
}
