import type { AgreeConversation } from './types';

/** Display label for a dm/group conversation, from `selfId`'s point of view. */
export function conversationLabel(conversation: AgreeConversation, selfId: string): string {
  const others = conversation.participants.filter((p) => p.id !== selfId);
  if (others.length === 0) return 'Você';
  return others.map((p) => p.username ?? 'Usuário removido').join(', ');
}
