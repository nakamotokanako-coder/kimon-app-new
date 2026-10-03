// 設定「アイコン切替」（絵文字 / 線アイコン）。
// 選択は <html data-icon-style="emoji|line"> に反映され（App.jsx）、ここで絵文字を線の記号に置き換える。
// 線アイコンは色のつかない記号（モノクロ）で、テーマの文字色のまま表示される。

const LINE_ICONS = {
  '📍': '◎',
  '🔍': '⌕',
  '⭐': '☆',
  '🏠': '⌂',
  '🗺': '▦',
  '📷': '◫',
  '🔒': '▣',
  '🚶': '➤',
  '🍣': '◆',
  '🍵': '◆',
  '🎨': '◆',
  '💎': '◆',
  '🧑': '◆',
  '🐾': '◆',
  '🍀': '◆',
};

export function getIconStyle() {
  if (typeof document === 'undefined') return 'emoji';
  return document.documentElement.dataset.iconStyle === 'line' ? 'line' : 'emoji';
}

/** 絵文字を、現在の設定に合わせた表示（絵文字のまま or 線の記号）にして返す */
export function ic(emoji) {
  return getIconStyle() === 'line' ? (LINE_ICONS[emoji] ?? emoji) : emoji;
}
