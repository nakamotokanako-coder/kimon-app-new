import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import shouiDict from '../../data/shoui_dict.json';
import './BottomSheet.css';

const AXES = [
  { key: 'goen', label: 'ご縁' },
  { key: 'shigoto', label: '仕事' },
  { key: 'kinun', label: '金運' },
  { key: 'kenko', label: '健康' },
  { key: 'benkyo', label: '勉強' },
];

const FULL_TEXT_CACHE = new Map();

const PURPOSE_TO_AXES = {
  '恋愛・結婚・健康': ['goen', 'kenko'],
  仕事運: ['shigoto'],
  金運: ['kinun'],
  学力: ['benkyo'],
};

const AXIS_RULES = {
  goen: {
    gates: ['休門'],
    stars: ['天任', '天心'],
    gods: ['六合', '太陰'],
    goodKakkyoku: ['人遁', '青龍返首', '飛鳥跌穴'],
    badKakkyoku: ['青龍逃走', '白虎猖狂'],
  },
  shigoto: {
    gates: ['開門'],
    stars: ['天心', '天輔', '天任'],
    gods: ['九天', '六合'],
    goodKakkyoku: ['天遁', '龍遁', '青龍返首'],
    badKakkyoku: ['伏吟', '五不遇時'],
  },
  kinun: {
    gates: ['生門'],
    stars: ['天任', '天禽', '天心'],
    gods: ['六合', '太陰'],
    goodKakkyoku: ['地遁', '人遁', '飛鳥跌穴'],
    badKakkyoku: ['大格', '小格', '青龍逃走'],
  },
  kenko: {
    gates: ['休門', '生門'],
    stars: ['天心', '天任'],
    gods: ['六合', '九地'],
    goodKakkyoku: ['人遁', '地遁'],
    badKakkyoku: ['天羅', '地網', '飛宮格', '戦格'],
  },
  benkyo: {
    gates: ['景門'],
    stars: ['天輔', '天心'],
    gods: ['朱雀', '九天'],
    goodKakkyoku: ['天遁', '奇儀相佐', '星奇朱雀'],
    badKakkyoku: ['朱雀投江', '螣蛇妖矯'],
  },
};

const BREAKDOWN_LABELS = {
  tenban_kan: (data) => `天盤干（${data?.tenban || '—'}）`,
  hachimon: (data) => `八門（${data?.hachimon || '—'}）`,
  kyusei: (data) => `九星（${data?.kyusei || '—'}）`,
  hasshin: (data) => `八神（${data?.hasshin || '—'}）`,
  jukkan_kokuou: (data, score) => {
    const names = score?.detected_jukkan?.map((item) => item.name).filter(Boolean).join('・');
    return `十干剋応${names ? `（${names}）` : ''}`;
  },
  kakkyoku: (data, score) => {
    const names = score?.detected_kakkyoku?.map((item) => item.name).filter(Boolean).join('・');
    return `格局${names ? `（${names}）` : ''}`;
  },
  monpaku: '門迫',
  kuubou: '空亡',
  ban_level_minus: '盤全体の減点',
  junri_bonus: '順利ボーナス',
};

function getBadge(score = 0) {
  if (score >= 60) return { label: '大吉', className: 'kichi' };
  if (score >= 20) return { label: '吉', className: 'kichi' };
  if (score >= -10) return { label: '中立', className: 'chu' };
  return { label: '凶', className: 'kyo' };
}

function scoreText(score) {
  if (typeof score !== 'number') return '—';
  return `${score > 0 ? '+' : ''}${score}`;
}

function resolveLabel(label, data, score) {
  return typeof label === 'function' ? label(data, score) : label;
}

function buildBreakdown(score, data) {
  const breakdown = score?.breakdown || {};
  return Object.entries(BREAKDOWN_LABELS)
    .map(([key, label]) => ({ label: resolveLabel(label, data, score), score: breakdown[key] }))
    .filter((item) => typeof item.score === 'number' && item.score !== 0);
}

function findKakkyokuEntry(name) {
  if (!name) return null;
  const index = shouiDict.kakkyoku_index_by_name?.[name];
  return shouiDict.kakkyoku?.find((item) => item.no === index || item.name === name) || null;
}

function normalizeKakkyoku(kakkyoku) {
  if (!kakkyoku) return null;
  const entry = findKakkyokuEntry(kakkyoku.name);
  return {
    name: kakkyoku.name,
    meaning: entry?.display_text || entry?.modern || entry?.practical ||
      kakkyoku.meaning || kakkyoku.keyword || kakkyoku.reading || '',
  };
}

function includesAny(values, candidates) {
  return candidates.some((candidate) => values.includes(candidate));
}

function purposeBoost(score, axisKey) {
  const purposes = score?.purposes || score?.purpose_tags || [];
  return purposes.reduce((boost, tag) => {
    const axes = PURPOSE_TO_AXES[tag.purpose] || [];
    if (!axes.includes(axisKey)) return boost;
    if (tag.strength === 'strong') return boost + 24;
    if (tag.strength === 'conditional') return boost + 12;
    return boost + 18;
  }, 0);
}

function symbolFromAxisScore(score) {
  if (score >= 80) return '◎';
  if (score >= 45) return '○';
  if (score >= 10) return '△';
  return '×';
}

function symbolClass(symbol) {
  if (symbol === '◎' || symbol === '○') return 'good';
  if (symbol === '△') return 'neutral';
  return 'bad';
}

function computeAxisScores(palace) {
  const baseScore = palace?.score?.score ?? 0;
  const data = palace?.data || {};
  const kakkyokuNames = palace?.score?.detected_kakkyoku?.map((item) => item.name).filter(Boolean) || [];

  return AXES.map((axis) => {
    const rules = AXIS_RULES[axis.key];
    let axisScore = baseScore;
    axisScore += purposeBoost(palace?.score, axis.key);
    if (includesAny([data.hachimon], rules.gates)) axisScore += 12;
    if (includesAny([data.kyusei], rules.stars)) axisScore += 8;
    if (includesAny([data.hasshin], rules.gods)) axisScore += 8;
    if (includesAny(kakkyokuNames, rules.goodKakkyoku)) axisScore += 12;
    if (includesAny(kakkyokuNames, rules.badKakkyoku)) axisScore -= 24;

    const symbol = symbolFromAxisScore(axisScore);
    return { ...axis, score: axisScore, symbol, className: symbolClass(symbol) };
  });
}

function getReadingState(fullState, palaceKey, axisKey) {
  if (fullState.status === 'loading') return { kind: 'loading', text: '解説を読み込んでいます。' };
  if (fullState.status === 'forbidden') {
    return { kind: 'locked', text: '月額プランで、願いごとの詳しい読み解きが開きます。' };
  }
  if (fullState.status === 'error') {
    return { kind: 'error', text: '解説を取得できませんでした。時間をおいてもう一度お試しください。' };
  }
  if (fullState.status === 'missing-key') {
    return { kind: 'empty', text: 'この盤の解説キーを取得できませんでした。' };
  }
  const text = fullState.palaces?.[palaceKey]?.[axisKey]?.full;
  if (text) return { kind: 'ready', text };
  return { kind: 'empty', text: 'この願いごとの詳しい解説はまだありません。' };
}

export default function BottomSheet({ palace, kaisetsuKey, onClose, onOverlayTap }) {
  const [activeAxis, setActiveAxis] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);
  const [fullState, setFullState] = useState({ status: 'idle', palaces: null });

  useEffect(() => {
    setActiveAxis(0);
    setWhyOpen(false);
  }, [palace?.key]);

  useEffect(() => {
    if (!palace) {
      setFullState({ status: 'idle', palaces: null });
      return undefined;
    }
    if (!kaisetsuKey) {
      setFullState({ status: 'missing-key', palaces: null });
      return undefined;
    }
    if (FULL_TEXT_CACHE.has(kaisetsuKey)) {
      setFullState({ status: 'ready', palaces: FULL_TEXT_CACHE.get(kaisetsuKey) });
      return undefined;
    }

    let alive = true;
    setFullState({ status: 'loading', palaces: null });
    fetch(`/api/kaisetsu-full?key=${encodeURIComponent(kaisetsuKey)}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 403) return { status: 'forbidden', palaces: null };
        if (!response.ok) throw new Error('kaisetsu_full_failed');
        const json = await response.json();
        const palaces = json?.palaces || {};
        FULL_TEXT_CACHE.set(kaisetsuKey, palaces);
        return { status: 'ready', palaces };
      })
      .then((state) => {
        if (alive) setFullState(state);
      })
      .catch(() => {
        if (alive) setFullState({ status: 'error', palaces: null });
      });
    return () => { alive = false; };
  }, [kaisetsuKey, palace]);

  useEffect(() => {
    if (!palace) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, palace]);

  const score = palace?.score?.score;
  const badge = getBadge(score);
  const kakkyoku = normalizeKakkyoku(palace?.score?.detected_kakkyoku?.[0]);
  const axisScores = useMemo(() => computeAxisScores(palace), [palace]);
  const activeAxisItem = axisScores[activeAxis] || axisScores[0];
  const readingState = getReadingState(fullState, palace?.key, activeAxisItem?.key);
  const breakdown = useMemo(() => buildBreakdown(palace?.score, palace?.data), [palace?.score, palace?.data]);

  if (!palace) return null;

  return createPortal(
    <>
      <div
        className="sheet-overlay open"
        aria-hidden="true"
        onClick={onOverlayTap || onClose}
      />
      <section
        className="sheet open"
        role="dialog"
        aria-modal="true"
        aria-label={`${palace.label}の詳細`}
      >
        <button
          type="button"
          className="sheet-handle"
          aria-label="閉じる"
          onClick={onClose}
        />

        <div className="sheet-content">
          <div className="sh-header">
            <div className="sh-dir">
              <span className="sh-dir-name">{palace.label}（{palace.direction}）</span>
              <span className={`sh-score ${score >= 0 ? 'plus' : 'minus'}`}>
                {scoreText(score)}
              </span>
              <span className={`sh-badge ${badge.className}`}>{badge.label}</span>
            </div>
            <div className="sh-meta">
              {[palace.data?.hachimon, palace.data?.hasshin, palace.data?.kyusei].filter(Boolean).join('・') || '—'}
            </div>
            <div className="sh-kanpair">
              天盤{palace.data?.tenban || '—'} / 地盤{palace.data?.chiban || '—'}
            </div>
          </div>

          {kakkyoku && (
            <div className="kakkyoku-card">
              <div className="kk-art">墨絵</div>
              <div className="kk-info">
                <div className="kk-name">{kakkyoku.name}</div>
                <div className="kk-desc">
                  {kakkyoku.meaning || 'この格局の説明は登録されていません。'}
                </div>
              </div>
            </div>
          )}

          <div className="axis-compare">
            <div className="axis-compare-title">5軸ざっくり比較</div>
            {axisScores.map((axis) => (
              <div className="axis-row" key={axis.key}>
                <span className="axis-label">{axis.label}</span>
                <span className={`axis-val axis-symbol ${axis.className}`}>{axis.symbol}</span>
              </div>
            ))}
          </div>

          <div className="axis-seg" role="tablist" aria-label="願いごと">
            {AXES.map((axis, index) => (
              <button
                key={axis.key}
                type="button"
                role="tab"
                aria-selected={activeAxis === index}
                className={`axis-btn ${activeAxis === index ? 'active' : ''}`}
                onClick={() => setActiveAxis(index)}
              >
                {axis.label}
              </button>
            ))}
          </div>

          <div className="reading">
            <div className="reading-title">{activeAxisItem?.label}</div>
            <p className={`reading-state ${readingState.kind}`}>{readingState.text}</p>
          </div>

          <button
            type="button"
            className={`why-toggle ${whyOpen ? 'open' : ''}`}
            aria-expanded={whyOpen}
            onClick={() => setWhyOpen((current) => !current)}
          >
            なぜこの評価？
          </button>
          <div className={`why-detail ${whyOpen ? 'open' : ''}`}>
            {breakdown.length > 0 ? (
              <>
                {breakdown.map((item) => (
                  <div className="why-item" key={item.label}>
                    <span className="factor">{item.label}</span>
                    <span className={`pts ${item.score >= 0 ? 'plus' : 'minus'}`}>
                      {scoreText(item.score)}
                    </span>
                  </div>
                ))}
                {typeof score === 'number' && (
                  <div className="why-item total">
                    <span className="factor">総合評価</span>
                    <span className={`pts ${score >= 0 ? 'plus' : 'minus'}`}>{score}点</span>
                  </div>
                )}
              </>
            ) : (
              <div className="why-empty">評価内訳はありません</div>
            )}
          </div>

          <div className="sh-actions">
            <button type="button" className="sh-action" onClick={() => {}}>
              この方位で行き先を探す →
            </button>
            {kakkyoku && (
              <button type="button" className="sh-action" onClick={() => {}}>
                この格局が出る日を探す →
              </button>
            )}
          </div>
        </div>
      </section>
    </>,
    document.body
  );
}
