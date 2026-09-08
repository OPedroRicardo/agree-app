import { Plus } from 'lucide-react';
import type { AgreeConversation } from '@/lib/types';
import { conversationLabel } from '@/lib/dm';
import { Avatar } from './Avatar';

/** Conversation list for the "Mensagens diretas" view — the DM counterpart of {@link ChannelSidebar}. */
export function DmSidebar({
  conversations,
  loading,
  selfId,
  activeConversationId,
  onSelectConversation,
  onOpenNewDm,
}: {
  conversations: AgreeConversation[];
  loading: boolean;
  selfId: string;
  activeConversationId: string | null;
  onSelectConversation: (conversation: AgreeConversation) => void;
  onOpenNewDm: () => void;
}) {
  return (
    <div
      className="flex w-60 flex-none flex-col overflow-hidden"
      style={{
        background: 'color-mix(in srgb, var(--agree-surface) 50%, transparent)',
        animation: 'agree-slide-right 0.35s ease both',
      }}
    >
      <div className="border-b border-divider p-4 text-[15px] font-semibold">
        Mensagens diretas
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
        {loading && (
          <div className="px-2.5 py-2 text-[12px] text-neutral-500">Carregando conversas…</div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="px-2.5 py-2 text-[12px] text-neutral-500">Nenhuma conversa ainda.</div>
        )}
        {conversations.map((conversation) => {
          const label = conversationLabel(conversation, selfId);
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelectConversation(conversation)}
              className={`flex h-11 items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] transition-all duration-150 active:scale-[0.98] ${
                conversation.id === activeConversationId
                  ? 'bg-accent/15 text-text'
                  : 'text-neutral-400 hover:bg-accent/10 hover:text-text'
              }`}
            >
              <Avatar seed={label} size={26} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenNewDm}
          className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-neutral-500 transition-all duration-150 hover:bg-accent/10 hover:text-text active:scale-[0.98]"
        >
          <Plus size={14} />
          Nova conversa
        </button>
      </div>
    </div>
  );
}
