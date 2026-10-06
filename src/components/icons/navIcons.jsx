import React from 'react';

// 下のメニューのアイコン。

export const NAV_ICONS = {
  'nav-home': {
    draw: <path d="M4 11.200 12 4l8 7.200v8.300a1 1 0 0 1-1 1h-4.500v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  },
  // 盤: 九宮格。まん中の宮に点を置いて、暦や表のアイコンと見分ける
  'nav-board': {
    draw: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="1.500" />
        <path d="M9.300 4v16M14.700 4v16M4 9.300h16M4 14.700h16" />
        <circle cx="12" cy="12" r="0.600" />
      </>
    ),
  },
  'nav-map': {
    draw: (
      <>
        <path d="M3.500 6.500 9 4.500l6 2 5.500-2v13L15 19.500l-6-2-5.500 2z" />
        <path d="M9 4.500v13M15 6.500v13" />
      </>
    ),
  },
  'nav-search': {
    draw: (
      <>
        <circle cx="10.800" cy="10.800" r="6.300" />
        <path d="M15.500 15.500 20.300 20.300" />
      </>
    ),
  },
  // その他: 三つの小さな点（歯車にしない）
  'nav-more': {
    draw: (
      <>
        <circle cx="5.500" cy="12" r="1.200" />
        <circle cx="12" cy="12" r="1.200" />
        <circle cx="18.500" cy="12" r="1.200" />
      </>
    ),
  },
};
