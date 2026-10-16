# FLOWSTATE IDE

キーボードを叩くだけで、映画に出てくる凄腕プログラマーの気分を味わえるブラウザアプリ。
実在するオープンソースのコードが 1 ファイルずつ書き上がっていき、プロジェクトが組み上がっていきます。

**遊ぶ**: https://jumboly.github.io/best-programmer/

## ビルド

```sh
node tools/build.mjs   # Node 18 以上
open dist/index.html
```

`tools/build.mjs` は、収録する OSS のソースを GitHub からタグ固定で取得し（`.cache/` にキャッシュ）、`src/app.html` に埋め込んで次のファイルを生成します。

- `dist/index.html`: そのままブラウザで開ける完成版
- `dist/fragment.html`: claude.ai アーティファクト用（`<html>` などの外枠なし）
- `THIRD_PARTY_NOTICES.md`: 収録 OSS の出典とライセンス全文

main ブランチに push すると、GitHub Actions（`.github/workflows/pages.yml`）が同じビルドを実行して GitHub Pages に公開します。

## 収録しているオープンソース

| 言語 | プロジェクト | ライセンス |
| --- | --- | --- |
| C | SQLite | Public Domain |
| C++ | LevelDB | BSD-3-Clause |
| C# | Newtonsoft.Json | MIT |
| Java | Gson | Apache-2.0 |
| JavaScript | Express | MIT |
| TypeScript | Ky | MIT |
| Python | Flask | BSD-3-Clause |
| Go | Gin | MIT |
| Rust | ripgrep | Unlicense OR MIT |
| Ruby | Sinatra | MIT |
| PHP | Slim | MIT |
| Swift | Alamofire | MIT |
| Kotlin | Okio | Apache-2.0 |
| Shell | nvm | MIT |

各ファイルは指定タグ時点のものを先頭から最大 320 行まで無改変で抜粋しています。ライセンスファイルは全文を収録し、アプリ内の「ライセンス」（F7）と `THIRD_PARTY_NOTICES.md` で表示しています。プロジェクトやタグを変えるときは `tools/build.mjs` の `PROJECTS` を編集してください。
