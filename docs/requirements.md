# 要件定義書: komoriso.github.io リニューアル

## 1. プロジェクト概要

### 1.1 目的
新刊情報取得アプリケーション「komoriso.github.io」のデータ取得方式を、Webスクレイピングから Google Books API に全面移行する。

### 1.2 背景
- 現行システムはスクレイピングで各出版社サイトから新刊情報を取得しているが、サイト構造の変更に弱く保守コストが高い
- Google Books API を利用することで、安定したデータ取得と追加情報（表紙画像、ISBN等）の活用が可能になる

### 1.3 対象レーベル（現行と同一）

| # | レーベル名 | 出版社 |
|---|-----------|--------|
| 1 | 岩波新書 | 岩波書店 |
| 2 | 岩波文庫 | 岩波書店 |
| 3 | 岩波現代文庫 | 岩波書店 |
| 4 | 中公新書 | 中央公論新社 |
| 5 | ちくま新書 | 筑摩書房 |
| 6 | ちくま学芸文庫 | 筑摩書房 |
| 7 | 講談社現代新書 | 講談社 |
| 8 | 講談社学術文庫 | 講談社 |
| 9 | ブルーバックス | 講談社 |

---

## 2. システム構成

### 2.1 全体アーキテクチャ

```
GitHub Actions (週次)
  └─ generate-books-json.js
       └─ Google Books API で出版社ごとに検索
       └─ publishedDate で前後1か月にフィルタ
       └─ レーベル名でフィルタ
       └─ public/books.json に出力
       └─ git commit & push

GitHub Pages (静的サイト)
  └─ public/index.html   → books.json を読み込み表示
  └─ public/label.html   → レーベル別表示

Render (バックエンド)
  └─ server.js (Express + SQLite)
  └─ 管理画面 API
  └─ レーベル別 API
```

### 2.2 廃止する機能
- **Webスクレイピング** — axios + cheerio による各出版社サイトのスクレイピング処理をすべて廃止
- **メール通知** — cron.js + nodemailer による週次メール通知を廃止

### 2.3 維持する機能
- 管理画面（admin.html）— レーベルの追加・削除・有効/無効切替
- Render バックエンド（Express + SQLite）— API 提供
- GitHub Actions による週次自動更新
- GitHub Pages による静的サイトホスティング

---

## 3. データ取得仕様（Google Books API）

### 3.1 取得フロー

```
1. 基準日（実行日）を取得
2. 基準日 ± 1か月の日付範囲を算出
3. 出版社ごとに Google Books API を検索
4. 取得結果を publishedDate で日付範囲内にフィルタ
5. レーベル名でフィルタ（title, description, seriesInfo 等を照合）
6. 重複排除（ISBN or タイトル + レーベル名）
7. books.json に出力
```

### 3.2 API 呼び出し仕様

**エンドポイント:**
```
GET https://www.googleapis.com/books/v1/volumes
```

**検索クエリ構成（出版社ごと）:**

| 出版社 | クエリ例 |
|--------|---------|
| 岩波書店 | `q=inpublisher:岩波書店&orderBy=newest&maxResults=40&langRestrict=ja` |
| 中央公論新社 | `q=inpublisher:中央公論新社&orderBy=newest&maxResults=40&langRestrict=ja` |
| 筑摩書房 | `q=inpublisher:筑摩書房&orderBy=newest&maxResults=40&langRestrict=ja` |
| 講談社 | `q=inpublisher:講談社&orderBy=newest&maxResults=40&langRestrict=ja` |

**パラメータ:**
- `orderBy=newest` — 新しい順で取得
- `maxResults=40` — 1リクエストあたり最大40件（API上限）
- `langRestrict=ja` — 日本語書籍に限定
- `startIndex` — 40件を超える場合のページネーション
- `key` — API キー（環境変数 `GOOGLE_BOOKS_API_KEY` で管理）

### 3.3 レーベル判定ロジック

Google Books API のレスポンスにはレーベル名が明示的なフィールドとして存在しないため、以下のフィールドを複合的に照合してレーベルを判定する：

| 照合対象フィールド | パス |
|-------------------|------|
| タイトル | `volumeInfo.title` |
| サブタイトル | `volumeInfo.subtitle` |
| 説明文 | `volumeInfo.description` |
| カテゴリ | `volumeInfo.categories[]` |
| シリーズ情報 | `volumeInfo.seriesInfo` |
| 出版社名 | `volumeInfo.publisher` |

**判定ルール（例）：**
```
publisher が "岩波書店" かつ:
  - title/subtitle/description に "岩波新書" を含む → 岩波新書
  - title/subtitle/description に "岩波文庫" を含む → 岩波文庫
  - title/subtitle/description に "岩波現代文庫" を含む → 岩波現代文庫

publisher が "講談社" かつ:
  - "現代新書" を含む → 講談社現代新書
  - "学術文庫" を含む → 講談社学術文庫
  - "ブルーバックス" or "Blue Backs" を含む → ブルーバックス
```

> **注意:** レーベル判定の精度はAPIレスポンスの情報量に依存する。判定できない書籍は「未分類」として扱うか、除外する。

### 3.4 日付フィルタリング

```javascript
const today = new Date();
const start = new Date(today);
start.setMonth(start.getMonth() - 1);
const end = new Date(today);
end.setMonth(end.getMonth() + 1);

// publishedDate のフォーマットは "2026-03-13" or "2026-03" or "2026" の場合がある
// "2026-03" → "2026-03-01" として扱う
// "2026" → 除外（精度不足）
```

### 3.5 取得データ項目

| 項目 | Google Books API フィールド | 必須 |
|------|---------------------------|------|
| タイトル | `volumeInfo.title` | ○ |
| 著者 | `volumeInfo.authors[]` | ○ |
| 出版日 | `volumeInfo.publishedDate` | ○ |
| レーベル名 | （判定ロジックで決定） | ○ |
| 書籍URL | `volumeInfo.infoLink` | ○ |
| 表紙画像 | `volumeInfo.imageLinks.thumbnail` | △（任意） |
| ISBN | `volumeInfo.industryIdentifiers[]` | △（任意） |
| 説明文 | `volumeInfo.description` | △（任意） |
| ページ数 | `volumeInfo.pageCount` | △（任意） |

---

## 4. データ出力仕様

### 4.1 books.json フォーマット

```json
{
  "generated_at": "2026-03-13T00:00:00.000Z",
  "date_range": {
    "start": "2026-02-13",
    "end": "2026-04-13"
  },
  "books": [
    {
      "label_name": "岩波新書",
      "title": "書籍タイトル",
      "author": "著者名",
      "published_date": "2026-03-10",
      "url": "https://books.google.co.jp/books?id=XXXXX",
      "thumbnail": "https://books.google.com/books/content?id=XXXXX&...",
      "isbn": "9784004XXXXXX",
      "description": "書籍の説明文...",
      "page_count": 256
    }
  ]
}
```

### 4.2 現行フォーマットとの互換性

現行の `books.json` が持つフィールド（`label_name`, `title`, `author`, `published_date`, `url`）はすべて維持する。新規フィールド（`thumbnail`, `isbn`, `description`, `page_count`）を追加する。

---

## 5. フロントエンド仕様

### 5.1 index.html（メインページ）

**変更点：**
- 書籍カードに表紙画像（`thumbnail`）を表示（画像がない場合はプレースホルダー）
- ISBN の表示（任意）
- 書籍リンク先を Google Books の情報ページに変更

**維持する点：**
- レーベルバッジの表示
- 著者名・出版日の表示
- 前後1か月の日付範囲表示
- レスポンシブデザイン

### 5.2 label.html（レーベル別ページ）

- 現行と同様、特定レーベルの書籍一覧を表示
- バックエンド API からの取得を維持

### 5.3 admin.html（管理画面）

- 現行と同様の機能を維持
- レーベルの CRUD 操作
- レーベルの URL フィールドは残すが、スクレイピング用URLではなく参考URLとして扱う

---

## 6. バックエンド仕様（Render）

### 6.1 server.js

**変更点：**
- スクレイピング関連のインポート・処理を削除
- books テーブルに新規カラム追加（thumbnail, isbn, description, page_count）

**維持する API エンドポイント：**
```
GET    /api/books              — 日付範囲内の全書籍
GET    /api/labels/:id/books   — レーベル別書籍
GET    /api/labels             — 全レーベル一覧
GET    /api/labels/:id         — レーベル詳細
POST   /api/labels             — レーベル追加
PUT    /api/labels/:id         — レーベル更新
DELETE /api/labels/:id         — レーベル削除
```

### 6.2 db.js

**books テーブル変更：**
```sql
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    published_date DATE,
    url TEXT,
    thumbnail TEXT,          -- 追加
    isbn TEXT,               -- 追加
    description TEXT,        -- 追加
    page_count INTEGER,      -- 追加
    is_visible INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (label_id) REFERENCES labels(id),
    UNIQUE(label_id, title)
);
```

---

## 7. GitHub Actions 仕様

### 7.1 ワークフロー（scrape.yml → update-books.yml にリネーム）

```yaml
name: Update Books Data

on:
  schedule:
    - cron: '0 2 * * 1'   # 毎週月曜 UTC 2:00（JST 11:00）
  workflow_dispatch:        # 手動実行

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: node generate-books-json.js
        env:
          GOOGLE_BOOKS_API_KEY: ${{ secrets.GOOGLE_BOOKS_API_KEY }}
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/books.json
          git diff --staged --quiet || git commit -m "Update books data $(date +%Y-%m-%d) [skip ci]"
          git push
```

### 7.2 シークレット設定

| シークレット名 | 説明 |
|---------------|------|
| `GOOGLE_BOOKS_API_KEY` | Google Books API キー |

---

## 8. 廃止対象ファイル

| ファイル | 理由 |
|---------|------|
| `scraper.js` | スクレイピング処理の廃止 |
| `cron.js` | メール通知の廃止 |

**依存パッケージの削除：**
- `cheerio` — HTML パーサー（スクレイピング用）
- `nodemailer` — メール送信
- `node-cron` — スケジューラ（GitHub Actions に統一）

---

## 9. 環境変数

### 9.1 追加
| 変数名 | 説明 | 使用箇所 |
|--------|------|---------|
| `GOOGLE_BOOKS_API_KEY` | Google Books API キー | generate-books-json.js |

### 9.2 廃止
| 変数名 | 理由 |
|--------|------|
| `EMAIL_USER` | メール通知廃止 |
| `EMAIL_PASS` | メール通知廃止 |
| `EMAIL_SERVICE` | メール通知廃止 |

### 9.3 維持
| 変数名 | 説明 |
|--------|------|
| `APP_URL` | アプリケーション URL |
| `PORT` | サーバーポート |

---

## 10. リスクと対策

### 10.1 Google Books API の制約

| リスク | 影響 | 対策 |
|--------|------|------|
| レーベル判定精度 | APIレスポンスにレーベル名が含まれない書籍を取りこぼす | 複数フィールドの照合 + 判定ログ出力で精度をモニタリング |
| 新刊の登録遅延 | 出版社サイトより Google Books への登録が遅い場合がある | 週次更新で吸収。必要なら更新頻度を上げる |
| API レート制限 | 無料枠: 1日1,000リクエスト | 4出版社 × ページネーション数回程度のため十分 |
| publishedDate の粒度 | 年のみ（"2026"）や月のみ（"2026-03"）の場合がある | 年のみは除外、月のみは月初として扱う |
| 日本語書籍のカバレッジ | 一部の書籍がAPIに未登録の可能性 | 運用開始後にスクレイピング結果と比較し、カバレッジを評価 |

### 10.2 移行リスク

| リスク | 対策 |
|--------|------|
| 移行中のデータ空白 | 現行の books.json を維持したまま並行開発 |
| API キー漏洩 | GitHub Secrets で管理、コードにハードコードしない |

---

## 11. 実装フェーズ

### Phase 1: API 基盤構築
- Google Books API キーの取得・設定
- `generate-books-json.js` を Google Books API ベースに書き換え
- レーベル判定ロジックの実装
- books.json の出力確認

### Phase 2: フロントエンド更新
- 書籍カードに表紙画像を追加
- 新規フィールド（ISBN, 説明文等）の表示対応
- リンク先を Google Books に変更

### Phase 3: バックエンド更新
- DB スキーマの変更（新規カラム追加）
- server.js からスクレイピング関連コードを削除
- API レスポンスに新規フィールドを追加

### Phase 4: CI/CD・クリーンアップ
- GitHub Actions ワークフローの更新
- scraper.js, cron.js の削除
- 不要パッケージの削除
- 環境変数の整理

### Phase 5: 検証・運用開始
- API 取得結果の精度検証（現行スクレイピング結果との比較）
- レーベル判定ルールのチューニング
- 本番運用開始
