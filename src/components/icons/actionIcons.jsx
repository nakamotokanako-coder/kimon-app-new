import React from 'react';

// 操作のアイコン（探す・戻る・開く・閉じる など）。

export const ACTION_ICONS = {
  search: {
    draw: (
      <>
        <circle cx="10.800" cy="10.800" r="6.300" />
        <path d="M15.500 15.500 20.300 20.300" />
      </>
    ),
  },
  'arrow-left': {
    draw: (
      <>
        <path d="M19.500 12h-15" />
        <path d="M10 6.500 4.500 12l5.500 5.500" />
      </>
    ),
  },
  'arrow-right': {
    draw: (
      <>
        <path d="M4.500 12h15" />
        <path d="M14 6.500 19.500 12 14 17.500" />
      </>
    ),
  },
  'chevron-down': { draw: <path d="M6 9.500l6 6 6-6" /> },
  'chevron-up': { draw: <path d="M6 14.500l6-6 6 6" /> },
  bookmark: { draw: <path d="M7 4h10v16.500l-5-3.800-5 3.800z" /> },
  share: {
    draw: (
      <>
        <path d="M12 3.500v11" />
        <path d="M8.200 7.200 12 3.500l3.800 3.700" />
        <path d="M8.500 10.800H6v9.700h12v-9.700h-2.500" />
      </>
    ),
  },
  edit: {
    draw: (
      <>
        <path d="M4.500 19.500l.900-4.100L15.800 5a1.700 1.700 0 0 1 2.400 0l.8.8a1.700 1.700 0 0 1 0 2.400L8.600 18.600z" />
        <path d="M14.300 6.500l3.200 3.200" />
      </>
    ),
  },
  close: { draw: <path d="M6 6l12 12M18 6 6 18" /> },
  // 条件をはじめに戻す: 円を描く矢印
  reset: {
    draw: (
      <>
        <path d="M5.300 8.700A7.500 7.500 0 1 1 4.500 12" />
        <path d="M4.700 4.300v4.400h4.400" />
      </>
    ),
  },
  // 検索の条件: 三本のつまみ
  filter: {
    draw: (
      <>
        <path d="M4 7h8.500M17.500 7H20" />
        <circle cx="15" cy="7" r="2" />
        <path d="M4 12h2.500M11.500 12H20" />
        <circle cx="9" cy="12" r="2" />
        <path d="M4 17h9.500M18.500 17H20" />
        <circle cx="16" cy="17" r="2" />
      </>
    ),
  },
};
