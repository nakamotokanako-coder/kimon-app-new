import React from 'react';

// 奇門遁甲らしい補助のアイコン。操作のアイコンより、少しだけ飾りがある。

const RAYS_8 = [0, 45, 90, 135, 180, 225, 270, 315];

export const QIMEN_ICONS = {
  'qimen-yin-yang': {
    draw: (
      <>
        <circle cx="12" cy="12" r="8.500" />
        <path d="M12 3.500a4.250 4.250 0 0 1 0 8.500 4.250 4.250 0 0 0 0 8.500" />
        <circle cx="12" cy="7.750" r="0.700" />
        <circle cx="12" cy="16.250" r="0.700" />
      </>
    ),
  },
  'qimen-nine-grid': {
    draw: (
      <>
        <rect x="4" y="4" width="16" height="16" />
        <path d="M9.300 4v16M14.700 4v16M4 9.300h16M4 14.700h16" />
      </>
    ),
  },
  // 八方位: 小さな円と、八つの目盛り
  'qimen-direction': {
    draw: (
      <>
        <circle cx="12" cy="12" r="4.200" />
        {RAYS_8.map((angle) => (
          <path key={angle} d={angle % 90 === 0 ? 'M12 2.500v3' : 'M12 4v1.800'} transform={`rotate(${angle} 12 12)`} />
        ))}
      </>
    ),
  },
  'qimen-sun': {
    draw: (
      <>
        <circle cx="12" cy="12" r="3.800" />
        {RAYS_8.map((angle) => (
          <path key={angle} d="M12 3v2.300" transform={`rotate(${angle} 12 12)`} />
        ))}
      </>
    ),
  },
  'qimen-moon': { draw: <path d="M19.800 14.200A8.300 8.300 0 1 1 9.800 4.200a6.600 6.600 0 0 0 10 10z" /> },
  // 雲文をごく簡単にしたもの
  'qimen-cloud': {
    draw: (
      <>
        <path d="M3.500 17.500h13.800a3.700 3.700 0 1 0-3.500-4.900" />
        <path d="M6.500 17.500a4.300 4.300 0 1 1 6.800-4.700 2.100 2.100 0 1 1-2.300 2.300" />
      </>
    ),
  },
};
