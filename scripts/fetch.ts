import { createReadStream, existsSync } from "node:fs";
import crypto from "node:crypto";
import { rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { ensureDir, RAW_DIR, writeJson, outputStream } from "./lib/paths.js";
import { COLLECTION_FROZEN } from "./lib/source-policy.js";
import { usedSources } from "./lib/sources.js";

interface FetchResult {
  source: string;
  file: string;
  url: string;
  status: "downloaded" | "skipped" | "failed";
  bytes?: number;
  records?: number;
  sha256?: string;
  error?: string;
}

const force = process.argv.includes("--force") || process.env.FORCE === "1";
const overrideFreeze = process.argv.includes("--override-freeze") || process.env.OVERRIDE_COLLECTION_FREEZE === "1";
const results: FetchResult[] = [];

if (COLLECTION_FROZEN && !overrideFreeze) {
  console.error(
    "[fetch] Collection is frozen during roadmap phases 0-2. Complete source dossiers and phase gates before using --override-freeze."
  );
  process.exit(2);
}

async function download(url: string, dest: string): Promise<number> {
  const tmp = `${dest}.tmp`;
  await rm(tmp, { force: true });
  const response = await fetch(url, { headers: { "user-agent": "VietnameseDictionaryPipeline/1.0" } });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]), outputStream(tmp));
  await rename(tmp, dest);
  const info = await stat(dest);
  return info.size;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 7): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, init);
    lastStatus = response.status;
    if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(30000, 1000 * 2 ** attempt);
    console.warn(`[fetch] retry HTTP ${response.status} in ${waitMs} ms`);
    await sleep(waitMs);
  }
  throw new Error(`HTTP ${lastStatus} after ${attempts} attempts`);
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

async function fetchMediaWikiPrefix(
  apiUrl: string,
  prefix: string,
  dest: string
): Promise<{ bytes: number; records: number }> {
  const pages: Array<{ pageid: number; title: string }> = [];
  let continuation: string | undefined;

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "allpages",
      apprefix: prefix,
      apnamespace: "0",
      aplimit: "max",
      format: "json",
      formatversion: "2"
    });
    if (continuation) params.set("apcontinue", continuation);
    const response = await fetchWithRetry(`${apiUrl}?${params}`, {
      headers: { "user-agent": "VietnameseDictionaryPipeline/1.0" }
    });
    if (!response.ok) throw new Error(`MediaWiki list HTTP ${response.status}`);
    const payload = (await response.json()) as {
      query?: { allpages?: Array<{ pageid: number; title: string }> };
      continue?: { apcontinue?: string };
    };
    pages.push(...(payload.query?.allpages ?? []));
    continuation = payload.continue?.apcontinue;
  } while (continuation);

  const snapshot: Array<{ pageid: number; title: string; revid: number; html: string }> = [];
  for (const [index, page] of pages.entries()) {
    const params = new URLSearchParams({
      action: "parse",
      pageid: String(page.pageid),
      prop: "text|revid",
      format: "json",
      formatversion: "2"
    });
    const response = await fetchWithRetry(`${apiUrl}?${params}`, {
      headers: { "user-agent": "VietnameseDictionaryPipeline/1.0" }
    });
    if (!response.ok) throw new Error(`MediaWiki parse HTTP ${response.status} for ${page.title}`);
    const payload = (await response.json()) as { parse?: { revid?: number; text?: string } };
    snapshot.push({
      pageid: page.pageid,
      title: page.title,
      revid: payload.parse?.revid ?? 0,
      html: payload.parse?.text ?? ""
    });
    await sleep(250);
    if ((index + 1) % 10 === 0) console.log(`[fetch] MediaWiki ${prefix}: ${index + 1}/${pages.length}`);
  }

  const tmp = `${dest}.tmp`;
  await rm(tmp, { force: true });
  await writeJson(tmp, {
    apiUrl,
    prefix,
    fetchedAt: new Date().toISOString(),
    pages: snapshot
  });
  await rename(tmp, dest);
  return { bytes: (await stat(dest)).size, records: snapshot.length };
}

for (const source of usedSources()) {
  const files = source.rawFiles ?? [];
  const sourceDir = path.join(RAW_DIR, source.key);
  await ensureDir(sourceDir);

  for (const rawFile of files) {
    const dest = path.join(sourceDir, rawFile.fileName);
    if (!force && existsSync(dest)) {
      const info = await stat(dest);
      results.push({
        source: source.key,
        file: rawFile.fileName,
        url: rawFile.url,
        status: "skipped",
        bytes: info.size,
        sha256: await sha256File(dest)
      });
      console.log(`[fetch] skip ${source.key}/${rawFile.fileName} (${info.size} bytes)`);
      continue;
    }

    try {
      console.log(`[fetch] download ${source.key}/${rawFile.fileName}`);
      const bytes = await download(rawFile.url, dest);
      results.push({
        source: source.key,
        file: rawFile.fileName,
        url: rawFile.url,
        status: "downloaded",
        bytes,
        sha256: await sha256File(dest)
      });
      console.log(`[fetch] ok ${source.key}/${rawFile.fileName} (${bytes} bytes)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        source: source.key,
        file: rawFile.fileName,
        url: rawFile.url,
        status: "failed",
        error: message
      });
      console.warn(`[fetch] failed ${source.key}/${rawFile.fileName}: ${message}`);
      if (rawFile.required) process.exitCode = 1;
    }
  }

  if (source.mediaWikiPrefix) {
    const { apiUrl, prefix, fileName } = source.mediaWikiPrefix;
    const dest = path.join(sourceDir, fileName);
    if (!force && existsSync(dest)) {
      const info = await stat(dest);
      results.push({
        source: source.key,
        file: fileName,
        url: apiUrl,
        status: "skipped",
        bytes: info.size,
        sha256: await sha256File(dest)
      });
      console.log(`[fetch] skip ${source.key}/${fileName} (${info.size} bytes)`);
    } else {
      try {
        console.log(`[fetch] snapshot MediaWiki prefix ${prefix}`);
        const info = await fetchMediaWikiPrefix(apiUrl, prefix, dest);
        results.push({
          source: source.key,
          file: fileName,
          url: apiUrl,
          status: "downloaded",
          bytes: info.bytes,
          records: info.records,
          sha256: await sha256File(dest)
        });
        console.log(`[fetch] ok ${source.key}/${fileName} (${info.records} pages, ${info.bytes} bytes)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ source: source.key, file: fileName, url: apiUrl, status: "failed", error: message });
        console.warn(`[fetch] failed ${source.key}/${fileName}: ${message}`);
        process.exitCode = 1;
      }
    }
  }
}

await writeJson(path.join(RAW_DIR, "fetch-manifest.json"), {
  generatedAt: new Date().toISOString(),
  force,
  results
});

if (process.exitCode) {
  console.error("[fetch] One or more required downloads failed.");
} else {
  console.log(`[fetch] Completed ${results.length} file checks/downloads.`);
}
