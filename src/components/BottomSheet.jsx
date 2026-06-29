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

const axisClassName = (key) => ({
  kenko: 'kenkou',
  benkyo: 'benkyou',
}[key] || key);

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

const MON_DESC = {
  '休門': '休息と回復の門。人間関係の調和を促し、穏やかな出会いや癒しの機会をもたらす。焦らず待つことで道が開ける。',
  '生門': '万物を生み出す門。新しい事業の立ち上げ、財運の向上、不動産取引に強い。積極的に動いて吉。',
  '開門': '物事を切り拓く門。仕事運・昇進・新規プロジェクトの発展に最も強い。リーダーシップを発揮する時。',
  '景門': '光と知恵の門。学問・試験・資格取得・芸術表現に吉。華やかな場での交流も良い。ただし商売には不向き。',
  '傷門': '衝突と競争の門。争いごとや口論が起きやすい。勝負事には使えるが、人間関係の修復には向かない。',
  '杜門': '閉じる門。物事が停滞し、前に進みにくい。隠れて準備するには良いが、積極的な行動は空回りする。',
  '死門': '変化が止まる門。新しいことを始めるのは避ける時期。静かに現状を守り、内省に充てるのが吉。',
  '驚門': '予想外の出来事が起きやすい門。驚きや不安を伴う変化がある。心の準備をして臨機応変に対応すること。',
};

const SEI_DESC = {
  '天蓬': '水の星。本来は凶星だが、生門と乙・丙が同宮すれば万事昌栄に転じる。争訟には使える。',
  '天芮': '病の星。健康面に注意が必要。ただし友人との交流や師匠に学ぶ場面では吉に働く。',
  '天衝': '行動と決断の星。勝負事や決着をつけたい場面に強い。ただし婚姻や引越しには不向き。',
  '天輔': '学問と成長の上吉星。遠方への旅行、教育、婚姻すべてに吉。子孫繁栄の暗示もある。',
  '天禽': '中央の上吉星。四季を通じてあらゆる事に吉。祭祀・商売・貴人への面会に特に強い。',
  '天心': '治癒と回復の上吉星。医療・健康回復・商売の旅に吉。金運面でも安定をもたらす。',
  '天柱': '守りの星。じっと耐えて守りに徹する時。遠出は災いを招きやすい。現状維持が最善。',
  '天任': '育みの吉星。財運と人縁を結ぶ力がある。金銭の請求、官位の申請、婚姻に吉。',
  '天英': '火の星。宴会や交流の場では吉。ただし商売や財を求める動きには空しい結果になりやすい。',
  '天冲': '行動と決断の星。勝負事や決着をつけたい場面に強い。ただし婚姻や引越しには不向き。',
};

const SHIN_DESC = {
  '直符': '最高位の神。急ぎの用事はこの方位が最適。天の加護があり、万事に通じる。',
  '九天': '攻めと拡大の神。発信・プレゼン・新規開拓に強い。積極的に外へ打って出る時。',
  '九地': '守りと蓄積の神。貯蓄・不動産・長期投資に強い。静かに基盤を固める時期。',
  '太陰': '隠の神。静かな準備や根回しに最適。急な災難からの避難先としても吉。',
  '六合': '縁結びの神。人との和合・パートナーシップに強い。商談や婚姻の成立を助ける。',
  '螣蛇': '惑わしの神。迷いや虚偽の情報に惑わされやすい。冷静な判断が求められる時。',
  '勾陳': '停滞の神。身動きが取りにくく、物事が膠着する。忍耐して時期を待つのが得策。',
  '朱雀': '口舌の神。言葉のトラブルや文書の問題が起きやすい。発言・契約は慎重に。',
};

const BAN_LEVEL_NAMES = [
  ['kan_fukugin', '干伏吟'],
  ['sei_fukugin', '星伏吟'],
  ['mon_fukugin', '門伏吟'],
  ['sei_hangin', '星反吟'],
  ['mon_hangin', '門反吟'],
  ['gofuguuji', '五不遇時'],
];

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
  ban_level_minus: '盤レベル',
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
    .map(([key, label]) => ({
      key,
      label: resolveLabel(label, data, score),
      score: breakdown[key],
    }))
    .filter((item) => typeof item.score === 'number' && item.score !== 0);
}

function findJukkanEntry(name) {
  if (!name) return null;
  const indexes = shouiDict.jukan_index_by_name?.[name] || [];
  return shouiDict.jukan_kokuou?.find((item) => indexes.includes(item.no) || item.name === name) || null;
}

function findKakkyokuEntry(name) {
  if (!name) return null;
  const index = shouiDict.kakkyoku_index_by_name?.[name];
  return shouiDict.kakkyoku?.find((item) => item.no === index || item.name === name) || null;
}

function shouiText(entry) {
  return [entry?.modern, entry?.practical].filter(Boolean).join('\n') || '象意を確認';
}

function banLevelText(banLevel) {
  const names = banLevel?.detected?.length
    ? banLevel.detected
    : BAN_LEVEL_NAMES.map(([key, name]) => (banLevel?.[key] ? name : null)).filter(Boolean);
  return names.length ? names.join('・') : '盤全体に重い配置';
}

function elementText(key, score, data, palace) {
  if (key === 'tenban_kan') return data?.tenban ? `天盤${data.tenban}の働き` : '天盤干の働き';
  if (key === 'hachimon') return MON_DESC[data?.hachimon] || '門の象意';
  if (key === 'kyusei') return SEI_DESC[data?.kyusei] || '星の象意';
  if (key === 'hasshin') return SHIN_DESC[data?.hasshin] || '神の象意';
  if (key === 'jukkan_kokuou') {
    const names = score?.detected_jukkan?.map((item) => item.name).filter(Boolean) || [];
    return names.map((name) => shouiText(findJukkanEntry(name))).filter(Boolean).join(' / ') || '十干剋応の象意';
  }
  if (key === 'kakkyoku') {
    const names = score?.detected_kakkyoku?.map((item) => item.name).filter(Boolean) || [];
    return names.map((name) => shouiText(findKakkyokuEntry(name))).filter(Boolean).join(' / ') || '格局の象意';
  }
  if (key === 'monpaku') return shouiText(findKakkyokuEntry('門迫'));
  if (key === 'kuubou') return shouiText(findKakkyokuEntry('空亡'));
  if (key === 'ban_level_minus') return banLevelText(palace?.banLevel);
  if (key === 'junri_bonus') return '流れに乗る吉方位';
  return '配置の象意';
}

function toneClass(value) {
  if (value > 0) return 'kichi';
  if (value < 0) return 'kyo';
  return 'neutral';
}

function normalizeKakkyoku(kakkyoku) {
  if (!kakkyoku) return null;
  const entry = findKakkyokuEntry(kakkyoku.name);
  return {
    name: kakkyoku.name,
    tone: kakkyoku.kichi_kyo === 'kichi' || kakkyoku.score > 0 ? 'kichi' : 'kyo',
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
            <div className={`kakkyoku-card ${kakkyoku.tone}`}>
              <div className="kk-art">墨絵</div>
              <div className="kk-info">
                <div className="kk-name">{kakkyoku.name}</div>
                <div className="kk-desc">
                  {kakkyoku.meaning || 'この格局の説明は登録されていません。'}
                </div>
              </div>
            </div>
          )}

          <div className="axis-compare axis-compare-card">
            <div className="axis-compare-title">5軸ざっくり比較</div>
            {axisScores.map((axis) => (
              <div className="axis-row axis-item" key={axis.key}>
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
                className={`axis-btn ${activeAxis === index ? `active ${axisClassName(axis.key)}` : ''}`}
                onClick={() => setActiveAxis(index)}
              >
                {axis.label}
              </button>
            ))}
          </div>

          <div className={`reading text-card ${activeAxisItem ? axisClassName(activeAxisItem.key) : ''}`}>
            <div className="reading-title">{activeAxisItem?.label}</div>
            <p className={`reading-state ${readingState.kind}`}>{readingState.text}</p>
          </div>

          <div className="why-card">
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
                    <div className="why-item why-row" key={item.label}>
                      <span className="factor">{item.label}</span>
                      <span className={`why-desc ${toneClass(item.score)}`}>
                        {elementText(item.key, palace.score, palace.data, palace)}
                      </span>
                    </div>
                  ))}
                  {typeof score === 'number' && (
                    <div className="why-item why-row total">
                      <span className="factor">総合評価</span>
                      <span className={`pts ${score >= 0 ? 'plus' : 'minus'}`}>{scoreText(score)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="why-empty">評価内訳はありません</div>
              )}
            </div>
          </div>

          <div className="sh-actions">
            <button type="button" className="sh-action action-btn-primary" onClick={() => {}}>
              この方位で行き先を探す →
            </button>
            {kakkyoku && (
              <button type="button" className="sh-action action-btn-secondary" onClick={() => {}}>
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
