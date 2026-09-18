import { EMOJI_BY_NAME } from './emoji-data';
import type { AgreeCustomEmoji } from './types';

/**
 * Onde as imagens dos emojis unicode moram: o CDN do Twemoji (fork mantido
 * `jdecked/twemoji`), um SVG por sequência de codepoints. Sem dependência
 * instalada — é só uma URL, e `MessageContent` cai no caractere de volta se
 * ela não carregar (offline, CDN fora).
 */
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg/';

/**
 * Um emoji "de verdade" no texto: um pictograma com variação/tom de pele
 * opcional, encadeado por ZWJ (famílias, bandeira arco-íris…), ou uma
 * bandeira (dois indicadores regionais), ou um keycap (`1️⃣`). Flag `u` para
 * as classes `\p{}`; `g` porque o tokenizer itera com `matchAll`.
 */
const EMOJI_PATTERN =
  '\\p{Regional_Indicator}{2}' +
  '|[#*0-9]\\uFE0F?\\u20E3' +
  '|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?' +
  '(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*';

/** `:nome:` — o mesmo padrão que o backend aceita para emoji custom (`EMOJI_NAME_PATTERN`). */
const SHORTCODE_PATTERN = ':([a-z0-9_]{2,32}):';

const TOKEN_REGEX = new RegExp(`(${SHORTCODE_PATTERN})|(${EMOJI_PATTERN})`, 'giu');

/**
 * `©`, `™`, `☀` e afins são pictogramas mas, sem o seletor `U+FE0F`, o Unicode
 * manda mostrar como texto — é o que evita "© 2024" virar uma imagem.
 */
const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u;

export type EmojiToken =
  | { type: 'text'; value: string }
  | { type: 'emoji'; char: string; url: string }
  | { type: 'custom'; name: string; url: string };

/** Codepoints em hex separados por `-`, como o Twemoji nomeia os arquivos. */
function toCodePoints(grapheme: string): string {
  return [...grapheme].map((c) => c.codePointAt(0)!.toString(16)).join('-');
}

/** URL da imagem no CDN para um emoji unicode. Regra do próprio Twemoji: o `U+FE0F` só fica no nome quando há ZWJ na sequência. */
export function twemojiUrl(grapheme: string): string {
  const normalized = grapheme.includes('\u200D') ? grapheme : grapheme.replace(/\uFE0F/g, '');
  return `${TWEMOJI_BASE}${toCodePoints(normalized)}.svg`;
}

function isRenderableEmoji(match: string): boolean {
  // Sequências (tom de pele, ZWJ, bandeira, keycap) são sempre emoji; um
  // codepoint sozinho só se o Unicode o define com apresentação de emoji.
  if ([...match].length > 1) return true;
  return EMOJI_PRESENTATION.test(match);
}

/**
 * Quebra o texto de uma mensagem em texto puro, emojis unicode e emojis
 * custom (`:nome:` resolvido contra `customEmojis`; se não houver custom com
 * esse nome mas houver um unicode na tabela, vira o unicode; senão fica texto).
 */
export function tokenize(text: string, customEmojis: AgreeCustomEmoji[]): EmojiToken[] {
  const tokens: EmojiToken[] = [];
  let last = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev?.type === 'text') prev.value += value;
    else tokens.push({ type: 'text', value });
  };

  for (const match of text.matchAll(TOKEN_REGEX)) {
    const [raw, , shortcodeName, emoji] = match;
    const index = match.index ?? 0;

    let token: EmojiToken | null = null;
    if (shortcodeName !== undefined) {
      const name = shortcodeName.toLowerCase();
      const custom = customEmojis.find((e) => e.name === name);
      if (custom) token = { type: 'custom', name: custom.name, url: custom.url };
      else {
        const unicode = EMOJI_BY_NAME.get(name);
        if (unicode) token = { type: 'emoji', char: unicode.char, url: twemojiUrl(unicode.char) };
      }
    } else if (emoji !== undefined && isRenderableEmoji(emoji)) {
      token = { type: 'emoji', char: emoji, url: twemojiUrl(emoji) };
    }

    pushText(text.slice(last, index));
    if (token) tokens.push(token);
    else pushText(raw);
    last = index + raw.length;
  }

  pushText(text.slice(last));
  return tokens;
}

/** Só emojis (e espaço) — até 6, como o "jumbo" do Discord — para renderizar maior. */
export function isEmojiOnly(tokens: EmojiToken[]): boolean {
  let count = 0;
  for (const token of tokens) {
    if (token.type === 'text') {
      if (token.value.trim()) return false;
    } else {
      count += 1;
    }
  }
  return count > 0 && count <= 6;
}

/**
 * Troca `:nome:` de emoji unicode pelo caractere antes de enviar, para a
 * mensagem guardar o emoji de fato e não o atalho. Nomes que existem como
 * custom no contexto atual ficam como estão — o custom tem prioridade e só
 * existe como `:nome:` no texto.
 */
export function replaceShortcodes(text: string, customEmojis: AgreeCustomEmoji[]): string {
  return text.replace(new RegExp(SHORTCODE_PATTERN, 'gi'), (raw, name: string) => {
    const lower = name.toLowerCase();
    if (customEmojis.some((e) => e.name === lower)) return raw;
    return EMOJI_BY_NAME.get(lower)?.char ?? raw;
  });
}

/** Casa um `:nome` sendo digitado no fim do texto (sem o `:` de fechamento). */
export const SHORTCODE_PREFIX_REGEX = /:([a-z0-9_]{1,32})$/i;

/** Emoji custom com `.gif` anima; serve para rotular a lista de gerenciamento. */
export function isAnimatedEmojiUrl(url: string): boolean {
  return /\.gif(\?|#|$)/i.test(url);
}
