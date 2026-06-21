"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Compact wire keys keep the 89k-row static search payload small.
type SearchEntry = {
  i: string;
  w: string;
  n: string;
  t: string;
  b: string;
  d: string;
  f: number;
};

type SearchFilter = "all" | "ipa" | "han" | "vi";

type Definition = {
  meaning: string;
  language: string;
  source: string;
  examples: string[];
  labels: string[];
};

type WordEntry = {
  id: string;
  word: string;
  headword_no_tone: string;
  syllable_count: number;
  pronunciation_ipa: string | null;
  part_of_speech: string[];
  origin: string | null;
  han_viet_ref?: string[];
  han_nom_forms?: string[];
  definitions: Definition[];
};

type HanEntry = {
  id: string;
  char: string;
  radical: string;
  strokes: number;
  readings: string[];
  meaning: string;
  file: string;
};

type Stats = {
  buildId: string;
  version: string;
  profile: string;
  counts: {
    words: number;
    definitions: number;
    withVietnameseDefinition: number;
    hanViet: number;
    nom: number;
    senseClusters: number;
    pronunciationFacts: number;
    reviewedPhase6Rows: number;
  };
  letterCounts: Record<string, number>;
};

type DictionaryAppProps = {
  initialId?: string;
};

const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
const glyphs = ["a", "ă", "â", "đ", "ê", "ô", "ơ", "ư", "語", "字", "學", "𡨸", "喃"];
const SEARCH_FLAG_IPA = 1;
const SEARCH_FLAG_VI_DEFINITION = 2;
const SEARCH_FLAG_HAN_NOM = 4;
const SEARCH_SCORES = [210, 200, 140, 130, 120, 90] as const;

function noTone(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "")
    .normalize("NFC")
    .toLowerCase();
}

function number(value: number | undefined) {
  return (value ?? 0).toLocaleString("vi-VN");
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function readStoredNumber(key: string, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function appBasePath() {
  if (typeof window === "undefined") return "/";
  const base = document.querySelector("base")?.getAttribute("href") ?? "/";
  return new URL(base, window.location.origin).pathname;
}

function appUrl(path: string) {
  const base = appBasePath();
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function apiUrl(path: string) {
  return appUrl(path);
}

function searchShardKey(value: string) {
  return noTone(value).match(/[a-z]/)?.[0] ?? "other";
}

function routeInitialId() {
  if (typeof window === "undefined") return undefined;
  const routePrefix = appUrl("tu/");
  if (!window.location.pathname.startsWith(routePrefix)) return undefined;
  const encodedId = window.location.pathname.slice(routePrefix.length).split("/")[0];
  return encodedId ? decodeURIComponent(encodedId) : undefined;
}

function hasSearchFlag(entry: SearchEntry, flag: number) {
  return (entry.f & flag) !== 0;
}

function matchesSearchFilters(entry: SearchEntry, filter: SearchFilter, letter: string | null) {
  if (letter && entry.b !== letter) return false;
  if (filter === "ipa" && !hasSearchFlag(entry, SEARCH_FLAG_IPA)) return false;
  if (filter === "han" && !hasSearchFlag(entry, SEARCH_FLAG_HAN_NOM)) return false;
  if (filter === "vi" && !hasSearchFlag(entry, SEARCH_FLAG_VI_DEFINITION)) return false;
  return true;
}

function scoreEntry(entry: SearchEntry, queryLower: string, normalized: string) {
  if (entry.n === normalized) {
    return entry.w.toLocaleLowerCase("vi") === queryLower ? 210 : 200;
  }
  if (entry.n.startsWith(normalized)) return 140;

  const tokenNeedle = `|${normalized}`;
  if (entry.t.includes(`${tokenNeedle}|`)) return 130;
  if (entry.t.includes(tokenNeedle)) return 120;
  if (entry.n.includes(normalized)) return 90;
  return 0;
}

function topSearchResults(
  index: SearchEntry[],
  query: string,
  normalized: string,
  filter: SearchFilter,
  letter: string | null
) {
  if (!query) {
    const rows: SearchEntry[] = [];
    for (const entry of index) {
      if (!matchesSearchFilters(entry, filter, letter)) continue;
      rows.push(entry);
      if (rows.length === 80) break;
    }
    return rows;
  }

  const groups = new Map<number, SearchEntry[]>(SEARCH_SCORES.map((score) => [score, []]));
  const queryLower = query.toLocaleLowerCase("vi");
  for (const entry of index) {
    if (!matchesSearchFilters(entry, filter, letter)) continue;
    const score = scoreEntry(entry, queryLower, normalized);
    const group = groups.get(score);
    if (group && group.length < 80) group.push(entry);
  }

  return SEARCH_SCORES.flatMap((score) => groups.get(score) ?? []).slice(0, 80);
}

export default function DictionaryApp({ initialId }: DictionaryAppProps) {
  const [routeId] = useState(() => initialId ?? routeInitialId());
  const [loadedSearchShard, setLoadedSearchShard] = useState<{ key: string; rows: SearchEntry[] } | null>(null);
  const searchShardCache = useRef(new Map<string, Promise<SearchEntry[]>>());
  const [knownEntries, setKnownEntries] = useState(() => new Map<string, SearchEntry>());
  const routeLoadStarted = useRef(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hanIndex, setHanIndex] = useState<HanEntry[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [selected, setSelected] = useState<WordEntry | null>(null);
  const [selectedHan, setSelectedHan] = useState<HanEntry | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readStoredJson("tdtv:favorites", []));
  const [history, setHistory] = useState<string[]>(() => readStoredJson("tdtv:history", []));
  const [fontScale, setFontScale] = useState(() => readStoredNumber("tdtv:fontScale", 1, 0.9, 1.25));
  const [letter, setLetter] = useState<string | null>(null);

  const loadSearchShard = useCallback((key: string) => {
    const cached = searchShardCache.current.get(key);
    if (cached) return cached;

    const request = fetch(apiUrl(`api/search/${key}.json`))
      .then((response) => {
        if (!response.ok) throw new Error(`Không thể tải chỉ mục ${key}`);
        return response.json() as Promise<SearchEntry[]>;
      })
      .then((rows) => {
        setKnownEntries((current) => {
          const next = new Map(current);
          for (const entry of rows) next.set(entry.i, entry);
          return next;
        });
        return rows;
      });
    searchShardCache.current.set(key, request);
    void request.catch(() => searchShardCache.current.delete(key));
    return request;
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(apiUrl("api/stats.json")).then((response) => response.json()),
      fetch(apiUrl("api/han-index.json")).then((response) => response.json()),
    ]).then(([statsData, hanRows]) => {
      setStats(statsData);
      setHanIndex(hanRows);
    });
  }, []);

  const activeShardKey = useMemo(() => {
    const q = deferredQuery.trim();
    return q ? searchShardKey(q) : letter;
  }, [deferredQuery, letter]);

  useEffect(() => {
    let cancelled = false;
    if (!activeShardKey) return;

    void loadSearchShard(activeShardKey)
      .then((rows) => {
        if (!cancelled) setLoadedSearchShard({ key: activeShardKey, rows });
      })
      .catch(() => {
        if (!cancelled) setLoadedSearchShard({ key: activeShardKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [activeShardKey, loadSearchShard]);

  const searchRows = useMemo(
    () => (loadedSearchShard?.key === activeShardKey ? loadedSearchShard.rows : []),
    [activeShardKey, loadedSearchShard]
  );
  const searchLoading = Boolean(activeShardKey && loadedSearchShard?.key !== activeShardKey);

  useEffect(() => {
    localStorage.setItem("tdtv:favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("tdtv:history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("tdtv:fontScale", String(fontScale));
  }, [fontScale]);

  const resolveSearchEntry = useCallback(
    async (id: string) => {
      const cached = knownEntries.get(id);
      if (cached) return cached;

      const key = searchShardKey(id);
      const primaryRows = await loadSearchShard(key);
      const primaryMatch = primaryRows.find((entry) => entry.i === id);
      if (primaryMatch || key === "other") return primaryMatch;
      return (await loadSearchShard("other")).find((entry) => entry.i === id);
    },
    [knownEntries, loadSearchShard]
  );

  const loadWord = useCallback(
    async (entryOrId: SearchEntry | string, pushUrl = true) => {
      const entry = typeof entryOrId === "string" ? await resolveSearchEntry(entryOrId) : entryOrId;
      if (!entry) return;
      setLoadingDetail(true);
      const rows: WordEntry[] = await fetch(apiUrl(`api/words/${entry.b}.json`)).then((response) =>
        response.json()
      );
      const detail = rows.find((row) => row.id === entry.i) ?? null;
      setSelected(detail);
      setSelectedHan(null);
      setHistory((current) => [entry.i, ...current.filter((id) => id !== entry.i)].slice(0, 10));
      if (pushUrl) window.history.replaceState(null, "", appUrl(`tu/${encodeURIComponent(entry.i)}`));
      setLoadingDetail(false);
    },
    [resolveSearchEntry]
  );

  useEffect(() => {
    if (routeId && !routeLoadStarted.current) {
      routeLoadStarted.current = true;
      const timer = window.setTimeout(() => void loadWord(routeId, false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [routeId, loadWord]);

  const results = useMemo(() => {
    const q = deferredQuery.trim();
    const normalized = noTone(q);
    return topSearchResults(searchRows, q, normalized, filter, letter);
  }, [searchRows, deferredQuery, filter, letter]);

  const hanResults = useMemo(() => {
    const q = deferredQuery.trim();
    const normalized = noTone(q);
    return hanIndex
      .filter((entry) => {
        if (!normalized) return entry.strokes <= 4;
        return (
          entry.char.includes(q) ||
          noTone(entry.readings.join(" ")).includes(normalized) ||
          noTone(entry.meaning).includes(normalized) ||
          entry.radical.includes(q)
        );
      })
      .slice(0, 80);
  }, [hanIndex, deferredQuery]);

  const randomWord = async () => {
    const letterCounts = stats?.letterCounts;
    if (!letterCounts) return;

    const buckets = Object.entries(letterCounts);
    const total = buckets.reduce((sum, [, count]) => sum + count, 0);
    let target = Math.floor(Math.random() * total);
    let bucket = "other";
    for (const [key, count] of buckets) {
      if (target < count) {
        bucket = key;
        break;
      }
      target -= count;
    }

    const candidates = (await loadSearchShard(bucket)).filter((entry) => entry.b === bucket);
    const entry = candidates[Math.floor(Math.random() * candidates.length)];
    if (entry) await loadWord(entry);
  };

  const toggleFavorite = () => {
    if (!selected) return;
    setFavorites((current) =>
      current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [selected.id, ...current]
    );
  };

  const copyLink = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(new URL(appUrl(`tu/${selected.id}`), window.location.origin).toString());
  };

  const speak = () => {
    if (!selected || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(selected.word);
    utterance.lang = "vi-VN";
    window.speechSynthesis.speak(utterance);
  };

  const favoriteEntries = useMemo(
    () =>
      favorites
        .map((id) => knownEntries.get(id))
        .filter((entry): entry is SearchEntry => Boolean(entry))
        .slice(0, 6),
    [favorites, knownEntries]
  );
  const historyEntries = useMemo(
    () =>
      history
        .map((id) => knownEntries.get(id))
        .filter((entry): entry is SearchEntry => Boolean(entry))
        .slice(0, 6),
    [history, knownEntries]
  );

  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#18211f]">
      <div className="border-b border-[#d9dfd9] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4f6f64]">Từ điển</p>
            <h1 className="text-2xl font-semibold tracking-normal text-[#18211f]">Tiếng Việt chuyên sâu</h1>
          </div>
          <div className="hidden items-center gap-2 text-sm text-[#5c6763] md:flex">
            <span>{number(stats?.counts.words)} mục từ</span>
            <span className="h-1 w-1 rounded-full bg-[#8ba39a]" />
            <span>{number(stats?.counts.definitions)} nghĩa</span>
            <span className="h-1 w-1 rounded-full bg-[#8ba39a]" />
            <span>build {stats?.buildId ?? "..."}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <section className="mb-4 overflow-hidden rounded-lg border border-[#d9dfd9] bg-[#edf4f0]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex gap-3 overflow-hidden font-serif text-3xl leading-none text-[#29594e]">
              {glyphs.map((glyph) => (
                <span key={glyph} className="min-w-fit">
                  {glyph}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={randomWord}
              className="h-10 rounded-md border border-[#b8cbc2] bg-white px-3 text-sm font-medium text-[#214d44] hover:bg-[#f6fbf8]"
            >
              Từ ngẫu nhiên
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-lg border border-[#d9dfd9] bg-white p-3">
              <label className="mb-2 block text-sm font-semibold text-[#273a35]" htmlFor="search">
                Tra cứu
              </label>
              <input
                id="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="hạnh phúc, hanh phuc, 幸..."
                className="h-12 w-full rounded-md border border-[#b8cbc2] bg-white px-3 text-base outline-none ring-[#2d6b5f] focus:ring-2"
              />
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[
                  ["all", "Tất cả"],
                  ["vi", "Việt"],
                  ["ipa", "IPA"],
                  ["han", "Hán/Nôm"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as typeof filter)}
                    className={`h-9 rounded-md border text-sm ${
                      filter === value
                        ? "border-[#2d6b5f] bg-[#2d6b5f] text-white"
                        : "border-[#d9dfd9] bg-[#f9faf8] text-[#40524c]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#d9dfd9] bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#273a35]">Bảng chữ cái</h2>
                <button
                  type="button"
                  onClick={() => setLetter(null)}
                  className="rounded-md px-2 py-1 text-xs text-[#4f6f64] hover:bg-[#edf4f0]"
                >
                  tất cả
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {alphabet.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setLetter(item)}
                    className={`h-9 rounded-md border text-sm uppercase ${
                      letter === item
                        ? "border-[#2d6b5f] bg-[#2d6b5f] text-white"
                        : "border-[#e2e7e2] bg-[#fbfcfb] text-[#344842]"
                    }`}
                    title={`${number(stats?.letterCounts[item])} mục`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#d9dfd9] bg-white">
              <div className="flex items-center justify-between border-b border-[#e3e8e3] px-3 py-2">
                <h2 className="text-sm font-semibold text-[#273a35]">Kết quả</h2>
                <span className="text-xs text-[#64726d]" aria-live="polite">
                  {query !== deferredQuery || searchLoading
                    ? "Đang tìm..."
                    : !deferredQuery.trim() && !letter
                      ? "Nhập từ để tra"
                      : `${results.length} kết quả`}
                </span>
              </div>
              <div className="max-h-[460px] overflow-auto">
                {!deferredQuery.trim() && !letter ? (
                  <p className="px-3 py-5 text-sm leading-6 text-[#69746f]">Nhập một mục từ để bắt đầu tra cứu.</p>
                ) : (
                  results.map((entry) => (
                    <button
                      key={entry.i}
                      type="button"
                      onClick={() => loadWord(entry)}
                      className={`block w-full border-b border-[#eef1ee] px-3 py-3 text-left hover:bg-[#f5faf7] ${
                        selected?.id === entry.i ? "bg-[#edf4f0]" : ""
                      }`}
                    >
                      <span className="block text-base font-semibold text-[#18211f]">{entry.w}</span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[#5a6662]">{entry.d}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Metric label="Mục từ" value={stats?.counts.words} />
              <Metric label="Nghĩa" value={stats?.counts.definitions} />
              <Metric label="Hán-Việt" value={stats?.counts.hanViet} />
              <Metric label="Nôm" value={stats?.counts.nom} />
            </div>

            <article className="min-h-[420px] rounded-lg border border-[#d9dfd9] bg-white">
              {loadingDetail ? (
                <div className="p-6 text-[#5a6662]">Đang tải...</div>
              ) : selected ? (
                <WordDetail
                  entry={selected}
                  fontScale={fontScale}
                  favorite={favorites.includes(selected.id)}
                  onFavorite={toggleFavorite}
                  onCopy={copyLink}
                  onSpeak={speak}
                  onFontDown={() => setFontScale((value) => Math.max(0.9, Number((value - 0.05).toFixed(2))))}
                  onFontUp={() => setFontScale((value) => Math.min(1.25, Number((value + 0.05).toFixed(2))))}
                />
              ) : selectedHan ? (
                <HanDetail entry={selectedHan} />
              ) : (
                <div className="p-6">
                  <h2 className="text-2xl font-semibold">Tra cứu từ điển</h2>
                  <p className="mt-3 max-w-2xl text-base leading-8 text-[#5a6662]">
                    {stats
                      ? `${number(stats.counts.words)} mục từ, ${number(stats.counts.definitions)} định nghĩa, ${number(
                          stats.counts.hanViet
                        )} chữ Hán-Việt.`
                      : "Đang nạp dữ liệu..."}
                  </p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <QuickList title="Yêu thích" rows={favoriteEntries} loadWord={loadWord} />
                    <QuickList title="Lịch sử" rows={historyEntries} loadWord={loadWord} />
                  </div>
                </div>
              )}
            </article>

            <section className="rounded-lg border border-[#d9dfd9] bg-white">
              <div className="flex items-center justify-between border-b border-[#e3e8e3] px-3 py-2">
                <h2 className="text-sm font-semibold text-[#273a35]">Hán-Việt / Bộ thủ</h2>
                <span className="text-xs text-[#64726d]">{number(hanIndex.length)} chữ</span>
              </div>
              <div className="grid max-h-[360px] gap-0 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
                {hanResults.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setSelectedHan(entry);
                    }}
                    className="grid grid-cols-[52px_1fr] gap-3 border-b border-r border-[#eef1ee] p-3 text-left hover:bg-[#f5faf7]"
                  >
                    <span className="font-serif text-4xl leading-none text-[#244c45]">{entry.char}</span>
                    <span>
                      <span className="block text-sm font-semibold text-[#18211f]">{entry.readings.join(", ") || "..."}</span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[#5a6662]">{entry.meaning}</span>
                      <span className="mt-1 block text-xs text-[#7a8782]">
                        Bộ {entry.radical}, {entry.strokes ?? "?"} nét
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-[#d9dfd9] bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#60726c]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[#18211f]">{number(value)}</div>
    </div>
  );
}

function QuickList({
  title,
  rows,
  loadWord,
}: {
  title: string;
  rows: SearchEntry[];
  loadWord: (entry: SearchEntry) => void | Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-[#e0e6e0]">
      <h3 className="border-b border-[#e8ece8] px-3 py-2 text-sm font-semibold">{title}</h3>
      <div>
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-sm text-[#69746f]">...</p>
        ) : (
          rows.map((row) => (
            <button
              key={row.i}
              type="button"
              onClick={() => loadWord(row)}
              className="block w-full border-b border-[#eef1ee] px-3 py-2 text-left text-sm hover:bg-[#f5faf7]"
            >
              {row.w}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function WordDetail({
  entry,
  fontScale,
  favorite,
  onFavorite,
  onCopy,
  onSpeak,
  onFontDown,
  onFontUp,
}: {
  entry: WordEntry;
  fontScale: number;
  favorite: boolean;
  onFavorite: () => void;
  onCopy: () => void;
  onSpeak: () => void;
  onFontDown: () => void;
  onFontUp: () => void;
}) {
  const viDefinitions = entry.definitions.filter((definition) => definition.language === "vi");
  const referenceDefinitions = entry.definitions.filter((definition) => definition.language !== "vi");
  return (
    <div className="p-5 sm:p-6" style={{ fontSize: `${fontScale}rem` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-4xl font-semibold tracking-normal text-[#18211f]">{entry.word}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {entry.pronunciation_ipa && <Pill>{entry.pronunciation_ipa}</Pill>}
            {entry.part_of_speech?.map((pos) => <Pill key={pos}>{pos}</Pill>)}
            {entry.origin && <Pill>{entry.origin}</Pill>}
          </div>
        </div>
        <div className="flex gap-2">
          <IconButton label={favorite ? "Bỏ yêu thích" : "Yêu thích"} onClick={onFavorite}>
            {favorite ? "★" : "☆"}
          </IconButton>
          <IconButton label="Sao chép link" onClick={onCopy}>
            ⧉
          </IconButton>
          <IconButton label="Đọc" onClick={onSpeak}>
            ▶
          </IconButton>
          <IconButton label="Giảm cỡ chữ" onClick={onFontDown}>
            A-
          </IconButton>
          <IconButton label="Tăng cỡ chữ" onClick={onFontUp}>
            A+
          </IconButton>
        </div>
      </div>

      {entry.han_nom_forms?.length > 0 && (
        <section className="mt-5 rounded-lg border border-[#d9dfd9] bg-[#fbfcfb] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#4f6f64]">Hán/Nôm</h3>
          <div className="mt-2 font-serif text-4xl text-[#244c45]">{entry.han_nom_forms.join(" ")}</div>
        </section>
      )}

      <section className="mt-6">
        <h3 className="text-lg font-semibold">Nghĩa tiếng Việt</h3>
        <ol className="mt-3 space-y-4">
          {(viDefinitions.length > 0 ? viDefinitions : entry.definitions.slice(0, 6)).map((definition, index) => (
            <li key={`${definition.source}-${index}`} className="rounded-lg border border-[#e2e7e2] p-4">
              <p className="leading-8 text-[#22312d]">{definition.meaning}</p>
              {definition.examples.length > 0 && (
                <ul className="mt-3 space-y-2 border-l-2 border-[#c6d8d0] pl-3 text-[#53615c]">
                  {definition.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#64726d]">
                <span>Nguồn: {definition.source}</span>
                {definition.labels.slice(0, 3).map((label) => (
                  <span key={label}>· {label}</span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {referenceDefinitions.length > 0 && (
        <section className="mt-6">
          <h3 className="text-lg font-semibold">Tham chiếu không phải tiếng Việt</h3>
          <div className="mt-3 space-y-3">
            {referenceDefinitions.slice(0, 4).map((definition, index) => (
              <p key={`${definition.source}-${index}`} className="rounded-lg border border-[#e2e7e2] p-3 leading-7 text-[#5a6662]">
                {definition.meaning}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function HanDetail({ entry }: { entry: HanEntry }) {
  return (
    <div className="p-6">
      <div className="flex items-start gap-5">
        <div className="font-serif text-7xl leading-none text-[#244c45]">{entry.char}</div>
        <div>
          <h2 className="text-3xl font-semibold">{entry.readings.join(", ") || entry.char}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill>Bộ {entry.radical}</Pill>
            <Pill>{entry.strokes ?? "?"} nét</Pill>
          </div>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-lg leading-8 text-[#344842]">{entry.meaning}</p>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-[#edf4f0] px-2 py-1 text-sm text-[#29594e]">{children}</span>;
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-10 min-w-10 rounded-md border border-[#c7d4ce] bg-white px-2 text-sm font-semibold text-[#244c45] hover:bg-[#edf4f0]"
    >
      {children}
    </button>
  );
}
