#!/usr/bin/env node
// FLOWSTATE IDE のビルドスクリプト。
// 収録する OSS のソースを「タグ固定」で取得して app.html に埋め込む。
// タグを固定するのは、ライセンス表記と収録内容を常に一致させ、再ビルドしても同じ成果物にするため。
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "oss");
const DIST = join(ROOT, "dist");
// 1 ファイルを丸ごと入れると巨大になる（sqlite の btree.c は 1 万行超）ため、先頭だけを無改変で抜粋する
const MAX_LINES = 320;

// license: true のファイルは「打鍵で書く」対象ではなく、プロジェクト作成時に最初から置かれる扱いにする
const PROJECTS = [
  { id: "sqlite", name: "SQLite", lang: "C", repo: "sqlite/sqlite", ref: "version-3.54.0", license: "Public Domain",
    licenseFiles: ["LICENSE.md"], files: ["src/hash.c", "src/random.c", "src/util.c", "src/date.c", "src/func.c"] },
  { id: "leveldb", name: "LevelDB", lang: "C++", repo: "google/leveldb", ref: "1.23", license: "BSD-3-Clause",
    licenseFiles: ["LICENSE"], files: ["util/arena.cc", "util/hash.cc", "util/coding.cc", "util/bloom.cc", "db/skiplist.h", "db/memtable.cc", "db/log_writer.cc", "db/write_batch.cc"] },
  { id: "newtonsoft-json", name: "Newtonsoft.Json", lang: "C#", repo: "JamesNK/Newtonsoft.Json", ref: "13.0.4", license: "MIT",
    licenseFiles: ["LICENSE.md"], files: ["Src/Newtonsoft.Json/JsonConvert.cs", "Src/Newtonsoft.Json/JsonReader.cs", "Src/Newtonsoft.Json/JsonWriter.cs", "Src/Newtonsoft.Json/JsonTextReader.cs"] },
  { id: "gson", name: "Gson", lang: "Java", repo: "google/gson", ref: "gson-parent-2.14.0", license: "Apache-2.0",
    licenseFiles: ["LICENSE"], files: ["JsonElement", "JsonObject", "JsonArray", "JsonParser", "TypeAdapter", "Gson"].map((n) => `gson/src/main/java/com/google/gson/${n}.java`) },
  { id: "express", name: "Express", lang: "JavaScript", repo: "expressjs/express", ref: "v5.3.0", license: "MIT",
    licenseFiles: ["LICENSE"], files: ["index.js", "lib/express.js", "lib/utils.js", "lib/view.js", "lib/application.js", "lib/request.js", "lib/response.js"] },
  { id: "ky", name: "Ky", lang: "TypeScript", repo: "sindresorhus/ky", ref: "v2.2.0", license: "MIT",
    licenseFiles: ["license"], files: ["source/index.ts", "source/utils/delay.ts", "source/utils/is.ts", "source/utils/timeout.ts", "source/utils/normalize.ts", "source/errors/HTTPError.ts", "source/core/constants.ts", "source/core/Ky.ts"] },
  { id: "flask", name: "Flask", lang: "Python", repo: "pallets/flask", ref: "3.1.3", license: "BSD-3-Clause",
    licenseFiles: ["LICENSE.txt"], files: ["__init__", "globals", "signals", "config", "ctx", "blueprints", "app"].map((n) => `src/flask/${n}.py`) },
  { id: "gin", name: "Gin", lang: "Go", repo: "gin-gonic/gin", ref: "v1.12.0", license: "MIT",
    licenseFiles: ["LICENSE"], files: ["utils.go", "response_writer.go", "recovery.go", "logger.go", "routergroup.go", "tree.go", "gin.go", "context.go"] },
  { id: "ripgrep", name: "ripgrep", lang: "Rust", repo: "BurntSushi/ripgrep", ref: "15.2.0", license: "Unlicense OR MIT",
    licenseFiles: ["COPYING", "UNLICENSE", "LICENSE-MIT"], files: ["crates/searcher/src/lib.rs", "crates/searcher/src/macros.rs", "crates/searcher/src/lines.rs", "crates/searcher/src/sink.rs", "crates/core/logger.rs", "crates/core/messages.rs", "crates/core/haystack.rs", "crates/core/search.rs", "crates/core/main.rs"] },
  { id: "sinatra", name: "Sinatra", lang: "Ruby", repo: "sinatra/sinatra", ref: "v4.2.1", license: "MIT",
    licenseFiles: ["LICENSE"], files: ["lib/sinatra.rb", "lib/sinatra/version.rb", "lib/sinatra/main.rb", "lib/sinatra/indifferent_hash.rb", "lib/sinatra/base.rb"] },
  { id: "slim", name: "Slim", lang: "PHP", repo: "slimphp/Slim", ref: "4.15.3", license: "MIT",
    licenseFiles: ["LICENSE.md"], files: ["Slim/App.php", "Slim/Routing/Route.php", "Slim/Routing/RouteCollector.php", "Slim/Routing/RouteParser.php", "Slim/Routing/RouteRunner.php", "Slim/MiddlewareDispatcher.php", "Slim/CallableResolver.php"] },
  { id: "alamofire", name: "Alamofire", lang: "Swift", repo: "Alamofire/Alamofire", ref: "5.12.2", license: "MIT",
    licenseFiles: ["LICENSE"], files: ["HTTPMethod", "HTTPHeaders", "Protected", "ParameterEncoding", "Response", "Request", "Session"].map((n) => `Source/Core/${n}.swift`) },
  { id: "okio", name: "Okio", lang: "Kotlin", repo: "square/okio", ref: "parent-3.18.2", license: "Apache-2.0",
    licenseFiles: ["LICENSE.txt"], files: ["Source", "Sink", "Timeout", "Segment", "SegmentPool", "ByteString", "BufferedSource", "Buffer"].map((n) => `okio/src/commonMain/kotlin/okio/${n}.kt`) },
  { id: "nvm", name: "nvm", lang: "Shell", repo: "nvm-sh/nvm", ref: "v0.40.8", license: "MIT",
    licenseFiles: ["LICENSE.md"], files: ["nvm-exec", "bash_completion", "install.sh", "nvm.sh"] },
];

const exists = (p) => access(p).then(() => true, () => false);

async function fetchFile(repo, ref, path) {
  const cached = join(CACHE, repo, ref, path);
  if (await exists(cached)) return readFile(cached, "utf8");
  const url = `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  await mkdir(dirname(cached), { recursive: true });
  await writeFile(cached, text);
  return text;
}

function excerpt(text) {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  return { text: lines.slice(0, MAX_LINES).join("\n") + "\n", truncated: lines.length > MAX_LINES, totalLines: lines.length };
}

const projects = [];
for (const p of PROJECTS) {
  const files = [];
  for (const path of p.licenseFiles) {
    const raw = await fetchFile(p.repo, p.ref, path);
    // ライセンス本文は抜粋すると条項を欠くので、必ず全文を収録する
    files.push({ path, text: raw.replace(/\r\n?/g, "\n"), license: true });
  }
  for (const path of p.files) {
    files.push({ path, ...excerpt(await fetchFile(p.repo, p.ref, path)) });
  }
  const { licenseFiles, files: _paths, ...meta } = p;
  projects.push({ ...meta, url: `https://github.com/${p.repo}/tree/${p.ref}`, files });
  console.log(`✓ ${p.name.padEnd(16)} ${p.lang.padEnd(11)} ${files.length} files`);
}

// JSON を <script> 内に置くので、"</script>" などで HTML パーサが脱出しないよう "<" をエスケープする
const json = JSON.stringify({ maxLines: MAX_LINES, projects }).replace(/</g, "\\u003c");
const app = await readFile(join(ROOT, "src", "app.html"), "utf8");
if (!app.includes("__OSS_SOURCES__")) throw new Error("src/app.html に __OSS_SOURCES__ プレースホルダがありません");
const fragment = app.replace("__OSS_SOURCES__", () => json);

const full = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${fragment}
</body>
</html>
`;

const notices = [
  "# Third-party notices",
  "",
  `FLOWSTATE IDE は以下のオープンソースソフトウェアのソースコードを収録しています。各ファイルは指定タグの先頭最大 ${MAX_LINES} 行を無改変で抜粋したものです。著作権は各プロジェクトの作者に帰属します。`,
  "",
  ...projects.flatMap((p) => [
    `## ${p.name} (${p.lang})`,
    "",
    `- Source: ${p.url}`,
    `- License: ${p.license}`,
    `- Files: ${p.files.filter((f) => !f.license).map((f) => "`" + f.path + "`").join(", ")}`,
    "",
    ...p.files.filter((f) => f.license).flatMap((f) => [`### ${f.path}`, "", "```", f.text.trimEnd(), "```", ""]),
  ]),
].join("\n");

await mkdir(DIST, { recursive: true });
await writeFile(join(DIST, "index.html"), full);
await writeFile(join(DIST, "fragment.html"), fragment);
await writeFile(join(ROOT, "THIRD_PARTY_NOTICES.md"), notices);
console.log(`\ndist/index.html ${(full.length / 1024).toFixed(0)} KB`);
