import type { AgreeConversation } from './types';

/** Display label for a dm/group conversation, from `selfId`'s point of view. */
export function conversationLabel(conversation: AgreeConversation, selfId: string): string {
  const others = conversation.participants.filter((p) => p.id !== selfId);
  if (others.length === 0) return 'Você';
  return others.map((p) => p.username ?? 'Usuário removido').join(', ');
}

/** Picture for a dm/group conversation, from `selfId`'s point of view: the other participant's in a 1:1 (your own in a self-DM), none for a group — rendered as initials. */
export function conversationAvatarUrl(conversation: AgreeConversation, selfId: string): string | null {
  if (conversation.type !== 'dm') return null;
  const peer = conversation.participants.find((p) => p.id !== selfId) ?? conversation.participants[0];
  return peer?.profileImageUrl ?? null;
}
