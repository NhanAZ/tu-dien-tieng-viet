"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type SearchEntry = {
  id: string;
  word: string;
  noTone: string;
  bucket: string;
  syllables: number;
  ipa: string | null;
  pos: string[];
  origin: string | null;
  definition: string;
  definitionSearch: string;
  sources: string[];
  hasViDefinition: boolean;
  hasHanNom: boolean;
};

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

function scoreEntry(entry: SearchEntry, query: string, normalized: string) {
  const word = entry.word.toLowerCase();
  if (word === query.toLowerCase() || entry.noTone === normalized) return 200;
  if (word.startsWith(query.toLowerCase()) || entry.noTone.startsWith(normalized)) return 140;
  if (word.includes(query.toLowerCase()) || entry.noTone.includes(normalized)) return 90;
  if (entry.definitionSearch.includes(normalized)) return 45;
  if (entry.sources.some((source) => source.includes(normalized))) return 20;
  return 0;
}

export default function DictionaryApp({ initialId }: DictionaryAppProps) {
  const [index, setIndex] = useState<SearchEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hanIndex, setHanIndex] = useState<HanEntry[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "ipa" | "han" | "vi">("all");
  const [selected, setSelected] = useState<WordEntry | null>(null);
  const [selectedHan, setSelectedHan] = useState<HanEntry | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readStoredJson("tdtv:favorites", []));
  const [history, setHistory] = useState<string[]>(() => readStoredJson("tdtv:history", []));
  const [fontScale, setFontScale] = useState(() => readStoredNumber("tdtv:fontScale", 1, 0.9, 1.25));
  const [letter, setLetter] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/search-index.json").then((response) => response.json()),
      fetch("/api/stats.json").then((response) => response.json()),
      fetch("/api/han-index.json").then((response) => response.json()),
    ]).then(([searchRows, statsData, hanRows]) => {
      setIndex(searchRows);
      setStats(statsData);
      setHanIndex(hanRows);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem("tdtv:favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("tdtv:history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("tdtv:fontScale", String(fontScale));
  }, [fontScale]);

  const loadWord = useCallback(
    async (entryOrId: SearchEntry | string, pushUrl = true) => {
      const entry =
        typeof entryOrId === "string" ? index.find((row) => row.id === entryOrId) : entryOrId;
      if (!entry) return;
      setLoadingDetail(true);
      const rows: WordEntry[] = await fetch(`/api/words/${entry.bucket}.json`).then((response) => response.json());
      const detail = rows.find((row) => row.id === entry.id) ?? null;
      setSelected(detail);
      setSelectedHan(null);
      setHistory((current) => [entry.id, ...current.filter((id) => id !== entry.id)].slice(0, 10));
      if (pushUrl) window.history.replaceState(null, "", `/tu/${encodeURIComponent(entry.id)}`);
      setLoadingDetail(false);
    },
    [index]
  );

  useEffect(() => {
    if (initialId && index.length > 0 && !selected) {
      const timer = window.setTimeout(() => void loadWord(initialId, false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [initialId, index, selected, loadWord]);

  const results = useMemo(() => {
    const q = query.trim();
    const normalized = noTone(q);
    const rows = index.filter((entry) => {
      if (letter && entry.bucket !== letter) return false;
      if (filter === "ipa" && !entry.ipa) return false;
      if (filter === "han" && !entry.hasHanNom) return false;
      if (filter === "vi" && !entry.hasViDefinition) return false;
      if (!q) return true;
      return scoreEntry(entry, q, normalized) > 0;
    });
    return rows
      .map((entry) => ({ entry, score: q ? scoreEntry(entry, q, normalized) : 1 }))
      .sort((a, b) => b.score - a.score || a.entry.noTone.localeCompare(b.entry.noTone, "vi"))
      .slice(0, 80)
      .map((row) => row.entry);
  }, [index, query, filter, letter]);

  const hanResults = useMemo(() => {
    const normalized = noTone(query.trim());
    return hanIndex
      .filter((entry) => {
        if (!normalized) return entry.strokes <= 4;
        return (
          entry.char.includes(query.trim()) ||
          noTone(entry.readings.join(" ")).includes(normalized) ||
          noTone(entry.meaning).includes(normalized) ||
          entry.radical.includes(query.trim())
        );
      })
      .slice(0, 80);
  }, [hanIndex, query]);

  const randomWord = () => {
    if (index.length === 0) return;
    const entry = index[Math.floor(Math.random() * index.length)];
    if (entry) void loadWord(entry);
  };

  const toggleFavorite = () => {
    if (!selected) return;
    setFavorites((current) =>
      current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [selected.id, ...current]
    );
  };

  const copyLink = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(`${window.location.origin}/tu/${selected.id}`);
  };

  const speak = () => {
    if (!selected || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(selected.word);
    utterance.lang = "vi-VN";
    window.speechSynthesis.speak(utterance);
  };

  const favoriteEntries = favorites
    .map((id) => index.find((entry) => entry.id === id))
    .filter((entry): entry is SearchEntry => Boolean(entry))
    .slice(0, 6);
  const historyEntries = history
    .map((id) => index.find((entry) => entry.id === id))
    .filter((entry): entry is SearchEntry => Boolean(entry))
    .slice(0, 6);

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
              <div className="border-b border-[#e3e8e3] px-3 py-2">
                <h2 className="text-sm font-semibold text-[#273a35]">Kết quả</h2>
              </div>
              <div className="max-h-[460px] overflow-auto">
                {results.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => loadWord(entry)}
                    className={`block w-full border-b border-[#eef1ee] px-3 py-3 text-left hover:bg-[#f5faf7] ${
                      selected?.id === entry.id ? "bg-[#edf4f0]" : ""
                    }`}
                  >
                    <span className="block text-base font-semibold text-[#18211f]">{entry.word}</span>
                    <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[#5a6662]">{entry.definition}</span>
                  </button>
                ))}
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
              key={row.id}
              type="button"
              onClick={() => loadWord(row)}
              className="block w-full border-b border-[#eef1ee] px-3 py-2 text-left text-sm hover:bg-[#f5faf7]"
            >
              {row.word}
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
