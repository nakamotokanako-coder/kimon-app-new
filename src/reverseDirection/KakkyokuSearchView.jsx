import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KAKKYOKU_GUIDE,
  KAKKYOKU_USES,
  SPECIAL_KAKKYOKU_GROUPS,
  SPECIAL_KAKKYOKU_NAMES,
  groupRowsByBoard,
  groupRowsByDay,
  scanSpecialKakkyoku,
} from './kakkyokuSearch.js';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import { Icon } from '../components/icons/index.js';
import { EXAMPLES_SHOWN } from './kakkyokuGuide.js';
import { buildDayReverseBoard, buildReverseBoard, DAY_BOARD_TYPE, TIME_BOARD_TYPE } from './reverseDirection.js';

// どんな移動か（＝調べる盤）。時盤は1日に12盤あるので期間は短め、日盤は1日1盤なので長い期間を選べる。
const BOARD_TYPES = [
  { key: TIME_BOARD_TYPE, title: '近場', tech: '時盤', sub: '散歩・買い物・日帰り' },
  { key: DAY_BOARD_TYPE, title: '遠くへ', tech: '日盤', sub: '旅行・遠出・出張' },
];

const PERIODS_BY_BOARD = {
  [TIME_BOARD_TYPE]: [
    { key: 'week', label: '7日', days: 7 },
    { key: 'half', label: '14日', days: 14 },
    { key: 'month', label: '30日', days: 30 },
  ],
  [DAY_BOARD_TYPE]: [
    { key: 'month', label: '1ヶ月', days: 31 },
    { key: 'q', label: '3ヶ月', days: 92 },
    { key: 'half', label: '半年', days: 183 },
    { key: 'year', label: '1年', days: 365 },
  ],
};

/** 格局の絵（絵が無い格局には、何も出さない） */
function KakkyokuArt({ name, size = 56 }) {
  const guide = KAKKYOKU_GUIDE[name];
  if (!guide?.image) return null;
  return <img className="kakkyoku-art" src={`/divination/${guide.image}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

/** 格局の案内（開いたときに読む）: 説明・こんな日に・向かない例 */
function KakkyokuDetail({ name, onSearch }) {
  const guide = KAKKYOKU_GUIDE[name];
  const [showAll, setShowAll] = useState(false);
  if (!guide) return null;
  const examples = showAll ? guide.examples : guide.examples.slice(0, EXAMPLES_SHOWN);
  const rest = guide.examples.length - EXAMPLES_SHOWN;
  return (
    <div className="kakkyoku-detail">
      {guide.hero && <img className="kakkyoku-detail-hero" src={`/divination/${guide.hero}.webp`} alt="" loading="lazy" decoding="async" />}
      <p className="kakkyoku-detail-day">{guide.day}</p>
      <p className="kakkyoku-detail-desc">{guide.desc}</p>
      <p className="kakkyoku-detail-title">こんな日に</p>
      <ul className="kakkyoku-detail-list">
        {examples.map((text) => (
          <li key={text}><Icon name="check-circle" size={16} />{text}</li>
        ))}
      </ul>
      {rest > 0 && (
        <button type="button" className="kakkyoku-detail-more" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
          {showAll ? '少なくする' : `ほかの例も見る（あと${rest}）`} <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={14} />
        </button>
      )}
      {guide.avoid && <p className="kakkyoku-detail-avoid">{`向かない例：${guide.avoid.join('、')}`}</p>}
      <button type="button" className="kakkyoku-detail-cta" onClick={() => onSearch(name)}>
        <Icon name="calendar" size={18} />この格局が出る日時を探す <Icon name="arrow-right" size={18} />
      </button>
    </div>
  );
}

function weekdayClass(weekday) {
  if (weekday === '土') return 'is-sat';
  if (weekday === '日') return 'is-sun';
  return '';
}

function KakkyokuResultCard({ item, isFeatured, isOpen, onToggle, onOpenBoard }) {
  const isDay = item.boardType === DAY_BOARD_TYPE;
  let rankings = [];
  if (isOpen) {
    rankings = isDay
      ? buildDayReverseBoard({ date: item.date }).rankings
      : buildReverseBoard({ date: item.date, hour: item.hour }).rankings;
  }
  return (
    <div className="kakkyoku-result-wrap">
      <button
        type="button"
        className={`kakkyoku-result-card${isFeatured ? ' is-featured' : ''}`}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="kakkyoku-result-dir">
          <strong>{item.label}</strong>
          <small>{item.short}</small>
        </span>
        <span className="kakkyoku-result-main">
          <span className="kakkyoku-result-date">
            {item.text}<small className={weekdayClass(item.weekday)}>({item.weekday})</small>
            <b>{item.timeLabel}</b>
          </span>
          <span className="kakkyoku-badges">
            {item.matches.map((name) => (
              <em key={name}>{name}</em>
            ))}
            {item.hachimon && <i>{item.hachimon}</i>}
          </span>
          {item.practicals.length > 0 && (
            <span className="kakkyoku-practical">
              {item.practicals.map((entry) => `${entry.name}: ${entry.text}`).join(' / ')}
            </span>
          )}
        </span>
        <span className={`kakkyoku-result-score ${item.score < 0 ? 'is-bad' : ''}`}>
          {item.scoreText}
          <small>点</small>
        </span>
      </button>
      {isOpen && (
        <div className="reverse-list-panel">
          <MiniBoardGrid rankings={rankings} />
          <button
            type="button"
            className="reverse-full-board-button"
            onClick={() => onOpenBoard(isDay
              ? { date: item.date, boardType: DAY_BOARD_TYPE }
              : { date: item.date, hour: item.hour, boardType: TIME_BOARD_TYPE })}
          >
            フル盤を見る
          </button>
        </div>
      )}
    </div>
  );
}

export default function KakkyokuSearchView({
  location,
  startDate,
  correctionLabel,
  onOpenBoard,
}) {
  const [selectedNames, setSelectedNames] = useState(['青龍返首', '飛鳥跌穴']);
  const [boardType, setBoardType] = useState(TIME_BOARD_TYPE);
  const [periodKey, setPeriodKey] = useState('month');
  const [sortMode, setSortMode] = useState('date');
  // 探し方: 'any' … 選んだ格局のどれか1つでも出る日時 ／ 'all' … 選んだ格局が、同じ1つの盤に全部そろう日時
  const [matchMode, setMatchMode] = useState('any');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchParams, setSearchParams] = useState(null);
  const [openResultKey, setOpenResultKey] = useState(null);
  // やりたいことから選んだとき、その用事（KAKKYOKU_USES の key）。格局を自分で選び直したら外す。
  const [useKey, setUseKey] = useState(null);
  const activeUse = KAKKYOKU_USES.find((item) => item.key === useKey) || null;
  // 案内を開いている格局（1つだけ）
  const [detailName, setDetailName] = useState(null);
  // やりたいことを押したら、結果のところまで画面を送る（間に格局の一覧と検索ボタンがあって、結果が見えないため）。
  const resultRef = useRef(null);
  const namesRef = useRef(null); // 格局の名前の一覧（「各格局の説明を見る」の行き先）
  const [scrollToResult, setScrollToResult] = useState(0);
  useEffect(() => {
    if (scrollToResult > 0) resultRef.current?.scrollIntoView?.({ block: 'start' });
  }, [scrollToResult]);

  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames]);
  const periods = PERIODS_BY_BOARD[boardType];
  const period = periods.find((item) => item.key === periodKey) || periods[0];
  const changeBoardType = (next) => {
    if (next === boardType) return;
    setBoardType(next);
    setPeriodKey('month');
    // 盤を替えたら、前の盤の結果は消す（時盤の結果を日盤の結果と見間違えないように）。
    setHasSearched(false);
    setSearchParams(null);
    setOpenResultKey(null);
  };
  // やりたいことを押すと、向く格局を選んで、そのまま検索する。
  const pickUse = (use) => {
    setUseKey(use.key);
    setSelectedNames(use.names);
    setOpenResultKey(null);
    setHasSearched(true);
    setSearchParams({ days: period.days, selectedNames: use.names, boardType });
    setScrollToResult((count) => count + 1);
  };
  const selectedCount = selectedNames.length;

  const result = useMemo(() => {
    if (!searchParams) return { rows: [], errors: [] };
    return scanSpecialKakkyoku({
      startDate,
      days: searchParams.days,
      selectedNames: searchParams.selectedNames,
      sortMode,
      boardType: searchParams.boardType,
    });
  }, [searchParams, sortMode, startDate]);
  // 全部そろう: 結果を盤ごと（時盤は時間帯、日盤は日）にまとめる。全部そろう盤が無ければ、いちばん多くそろう盤を3つまで出す。
  const searchedNames = searchParams?.selectedNames || [];
  const wantAll = matchMode === 'all' && searchedNames.length >= 2;
  const days = useMemo(() => (wantAll ? groupRowsByBoard(result.rows, searchedNames) : []), [wantAll, result.rows, searchedNames]);
  const isDaySearch = (searchParams?.boardType || boardType) === DAY_BOARD_TYPE;
  const unit = isDaySearch ? '日' : '時間帯'; // そろうのを数える単位（1つの盤）
  const completeDays = days.filter((day) => day.complete);
  // 時盤で、同じ時間帯にそろう盤が無いとき: 同じ日のうちに（別々の時間帯で）全部出る日を、次の手がかりとして出す。
  const sameDayDays = useMemo(() => (
    wantAll && !isDaySearch && completeDays.length === 0
      ? groupRowsByDay(result.rows, searchedNames).filter((day) => day.complete)
      : []
  ), [wantAll, isDaySearch, completeDays.length, result.rows, searchedNames]);
  const usingSameDay = sameDayDays.length > 0;
  const shownDays = completeDays.length > 0 ? completeDays : (usingSameDay ? sameDayDays : days.slice(0, 3));
  const maxResultScore = useMemo(() => (
    result.rows.length > 0 ? Math.max(...result.rows.map((item) => item.score)) : null
  ), [result.rows]);

  // 案内の「この格局が出る日時を探す」: その格局だけを選んで、すぐ検索する。
  const searchOne = (name) => {
    setUseKey(null);
    setSelectedNames([name]);
    setOpenResultKey(null);
    setHasSearched(true);
    setSearchParams({ days: period.days, selectedNames: [name], boardType });
    setScrollToResult((count) => count + 1);
  };

  const toggleName = (name) => {
    setUseKey(null);
    setSelectedNames((current) => (
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    ));
  };

  const selectAll = () => { setUseKey(null); setSelectedNames(SPECIAL_KAKKYOKU_NAMES); };
  const clearAll = () => { setUseKey(null); setSelectedNames([]); };

  const search = () => {
    if (selectedCount === 0) return;
    setHasSearched(true);
    setSearchParams({ days: period.days, selectedNames, boardType });
    setScrollToResult((count) => count + 1); // 結果のところまで画面を送る
  };

  return (
    <div className="kakkyoku-search-view">
      <section className="kakkyoku-step" aria-label="どんな移動？">
        <h3 className="kakkyoku-step-title">どんな移動？</h3>
        <div className="theme-kinds" role="group" aria-label="どんな移動？">
          {BOARD_TYPES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`theme-kind${boardType === item.key ? ' is-active' : ''}`}
              aria-pressed={boardType === item.key}
              onClick={() => changeBoardType(item.key)}
            >
              <strong>{item.title}<small>（{item.tech}）</small></strong>
              <span>{item.sub}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="kakkyoku-step" aria-label="いつまで探す？">
        <h3 className="kakkyoku-step-title">いつまで探す？</h3>
        <div className="kakkyoku-step-chips" role="group" aria-label="いつまで探す？">
          {periods.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${periodKey === item.key ? 'is-active ' : ''}lat`}
              aria-pressed={periodKey === item.key}
              onClick={() => setPeriodKey(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="kakkyoku-ornament" aria-hidden="true"><img src="/divination/cloud-ornament.webp" alt="" loading="lazy" decoding="async" /></div>

      <div className="kakkyoku-picker kakkyoku-uses">
        <div className="kakkyoku-picker-head">
          <div>
            <h3>何をしたい？</h3>
          </div>
          <button type="button" className="kakkyoku-jump" onClick={() => namesRef.current?.scrollIntoView?.({ block: 'start' })}>
            各格局の説明を見る <Icon name="chevron-down" size={14} />
          </button>
        </div>
        <div className="kakkyoku-group">
          <div>
            {KAKKYOKU_USES.map((use) => (
              <button
                key={use.key}
                type="button"
                className={useKey === use.key ? 'is-active' : ''}
                aria-pressed={useKey === use.key}
                onClick={() => pickUse(use)}
              >
                <Icon name={use.icon} size={22} />
                {use.label}
              </button>
            ))}
          </div>
        </div>
        <p className="kakkyoku-use-note">
          {activeUse
            ? `「${activeUse.label}」の格局：${activeUse.names.join('・')}`
            : '押すと、その用途の格局が出る日時と方位を、すぐに探します。'}
        </p>
      </div>

      <div className="kakkyoku-picker" ref={namesRef}>
        <div className="kakkyoku-picker-head">
          <div>
            <h3>格局の名前から選ぶ</h3>
            <span>{selectedCount}件選択中</span>
          </div>
          <div>
            <button type="button" onClick={selectAll}>すべて選択</button>
            <button type="button" onClick={clearAll}>クリア</button>
          </div>
        </div>

        {SPECIAL_KAKKYOKU_GROUPS.map((group) => (
          <div key={group.group} className="kakkyoku-group kakkyoku-names">
            <p>{group.group}</p>
            <div>
              {group.items.map((name) => {
                const guide = KAKKYOKU_GUIDE[name] || {};
                const isOpen = detailName === name;
                return (
                  <div key={name} className={`kakkyoku-item${selectedSet.has(name) ? ' is-active' : ''}`}>
                    <button
                      type="button"
                      className={`kakkyoku-name${selectedSet.has(name) ? ' is-active' : ''}`}
                      aria-pressed={selectedSet.has(name)}
                      onClick={() => toggleName(name)}
                    >
                      <KakkyokuArt name={name} />
                      <strong>{name}</strong>
                      <span>{guide.line || ''}</span>
                      <small>
                        {(guide.tags || []).map((tag) => <i key={tag}>{tag}</i>)}
                        {(guide.classic || []).map((tag) => <i key={tag} className="is-classic">古典：{tag}</i>)}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="kakkyoku-item-more"
                      aria-expanded={isOpen}
                      onClick={() => setDetailName(isOpen ? null : name)}
                    >
                      {isOpen ? '閉じる' : 'くわしく'} <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
                    </button>
                    {isOpen && <KakkyokuDetail name={name} onSearch={searchOne} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedCount >= 2 && (
        <div className="kakkyoku-period kakkyoku-match">
          <p>探し方</p>
          <div role="group" aria-label="探し方">
            <button type="button" className={matchMode === 'any' ? 'is-active' : ''} aria-pressed={matchMode === 'any'} onClick={() => setMatchMode('any')}>
              どれか1つでも出る日時
            </button>
            <button type="button" className={matchMode === 'all' ? 'is-active' : ''} aria-pressed={matchMode === 'all'} onClick={() => setMatchMode('all')}>
              {boardType === DAY_BOARD_TYPE ? '全部がそろう日' : '全部がそろう時間帯'}
            </button>
          </div>
          <small className="kakkyoku-board-note">
            {matchMode === 'all'
              ? (boardType === DAY_BOARD_TYPE
                ? '選んだ格局が、同じ日の日盤に全部出る日だけを出します（方位は違っていても数えます）。'
                : '選んだ格局が、同じ時間帯の盤に全部出る日時だけを出します（方位は違っていても数えます）。')
              : '選んだ格局のどれかが出る日時を、すべて並べます。'}
          </small>
        </div>
      )}

      <button
        type="button"
        className="kakkyoku-search-button"
        disabled={selectedCount === 0}
        onClick={search}
      >
        {selectedCount === 0
          ? '格局を選んでください'
          : (matchMode === 'all' && selectedCount >= 2
            ? `この${selectedCount}件が全部そろう${boardType === DAY_BOARD_TYPE ? '日' : '時間帯'}を検索`
            : `この${selectedCount}件が出る日時を検索`)}
      </button>

      {hasSearched && (
        <>
          <div className="kakkyoku-result-head" ref={resultRef}>
            <div>
              <h3>{wantAll ? `${searchedNames.length}件が全部そろう${unit}` : (activeUse ? `「${activeUse.label}」の格局が出る日時` : '検索結果')}</h3>
              <span>{wantAll ? `${completeDays.length}${isDaySearch ? '日' : '回'}` : `${result.rows.length}件`}</span>
            </div>
            {!wantAll && (
            <div className="kakkyoku-sort-toggle" role="group" aria-label="検索結果の並び順">
              <button
                type="button"
                className={sortMode === 'date' ? 'is-active' : ''}
                onClick={() => setSortMode('date')}
              >
                日付が早い順
              </button>
              <button
                type="button"
                className={sortMode === 'score' ? 'is-active' : ''}
                onClick={() => setSortMode('score')}
              >
                スコアが高い順
              </button>
            </div>
            )}
          </div>

          {result.errors.length > 0 && result.rows.length === 0 && (
            <div className="reverse-card reverse-placeholder">
              <h3>この期間は検索できません</h3>
              <p>{result.errors[0].message}</p>
            </div>
          )}

          {result.rows.length === 0 && result.errors.length === 0 && (
            <div className="reverse-card reverse-placeholder">
              <h3>該当なし</h3>
              <p>選んだ格局は、この期間内に使える方位として出現しませんでした。期間や格局を変えてみてください。</p>
            </div>
          )}

          {wantAll && result.rows.length > 0 && completeDays.length === 0 && (
            <div className="reverse-card reverse-placeholder">
              <h3>{`全部がそろう${unit}は、この期間にありません`}</h3>
              <p>
                {usingSameDay
                  ? `代わりに、同じ日のうちに全部出る日を${shownDays.length}日ぶん出します（時間帯は別々です）。`
                  : `いちばん多くそろう${unit}を、${shownDays.length}つ出します。期間を長くするか、格局を減らすと見つかりやすくなります。`}
              </p>
            </div>
          )}

          {wantAll ? (
            <div className="kakkyoku-result-list">
              {shownDays.map((day) => (
                <section key={`${day.date}-${day.hour}`} className={`kakkyoku-day${day.complete && !usingSameDay ? ' is-complete' : ''}`} aria-label={`${day.text}（${day.weekday}）${day.timeLabel || ''}`}>
                  <header className="kakkyoku-day-head">
                    <strong>{day.text}<small className={weekdayClass(day.weekday)}>({day.weekday})</small>{day.timeLabel && !isDaySearch && <b>{day.timeLabel}</b>}</strong>
                    <span>{usingSameDay ? '同じ日のうちに出る' : (day.complete ? `${searchedNames.length}件そろう` : `${searchedNames.length}件中${day.matched.length}件`)}</span>
                  </header>
                  {!day.complete && <p className="kakkyoku-day-missing">{`出ない格局：${day.missing.join('・')}`}</p>}
                  {day.rows.map((item) => {
                    const key = `${item.date}-${item.hour}-${item.palace}-${item.matches.join('-')}`;
                    return (
                    <KakkyokuResultCard
                      key={key}
                      item={item}
                      isFeatured={false}
                      isOpen={openResultKey === key}
                      onToggle={() => setOpenResultKey((current) => (current === key ? null : key))}
                      onOpenBoard={onOpenBoard}
                    />
                    );
                  })}
                </section>
              ))}
            </div>
          ) : (
          <div className="kakkyoku-result-list">
            {result.rows.map((item) => {
              const key = `${item.date}-${item.hour}-${item.palace}-${item.matches.join('-')}`;
              return (
              <KakkyokuResultCard
                key={key}
                item={item}
                isFeatured={maxResultScore !== null && item.score === maxResultScore}
                isOpen={openResultKey === key}
                onToggle={() => setOpenResultKey((current) => (current === key ? null : key))}
                onOpenBoard={onOpenBoard}
              />
              );
            })}
          </div>
          )}
        </>
      )}
    </div>
  );
}
