<p align="center">
  <img src="docs/preview.svg" alt="Matrix Block Canvas preview" width="100%">
</p>

<h1 align="center">Matrix Block Canvas</h1>

[![CI](https://github.com/light-suzuki/matrix-block-canvas/actions/workflows/ci.yml/badge.svg)](https://github.com/light-suzuki/matrix-block-canvas/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://light-suzuki.github.io/matrix-block-canvas/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<p align="center">
  日本語UIで、TSVやカテゴリ行列から発表・論文向けのブロック図を作るブラウザツール。<br>
  Windowsでは、開発環境なしで持ち運べる単一HTML版も生成できます。
</p>

---

## まず使う

### 1. インストール不要: Web版

GitHub Pagesでそのまま使えます。

https://light-suzuki.github.io/matrix-block-canvas/

通常の編集処理はブラウザ内で行われ、入力した行列データをアプリのサーバーへ送信する仕組みはありません。

### 2. 別のWindows PCへ持っていく: 単一HTML版

このリポジトリは、Viteの本番ビルドからJS/CSSを1ファイルに埋め込んだ
`MatrixBlockCanvas-portable.html` を生成できます。

```powershell
npm ci
npm run portable
```

生成物:

```text
dist\MatrixBlockCanvas-portable.html
```

このHTMLファイルだけをUSBメモリ、共有フォルダ、クラウドストレージ等で別PCへコピーし、
Edge / Chrome / Firefoxで開けます。配布先PCにはNode.jsやnpmは不要です。

GitHub Pagesのデプロイでも同じportable HTMLを生成するため、mainへの反映後は次のURLからも開けます。

https://light-suzuki.github.io/matrix-block-canvas/MatrixBlockCanvas-portable.html

portable版ではビルド時に外部Webフォントの `@import` を除去するため、起動自体にネット接続は不要です。
フォントはWindows/ブラウザのシステムフォントへフォールバックします。

### 3. ソースからWindows PCへセットアップ: ダブルクリック

リポジトリをcloneまたはZIP展開した後、ルートにある次のファイルを実行します。

```text
SETUP_WINDOWS.cmd
```

このスクリプトは次を自動実行します。

1. Node.js 20.19+ があるか確認
2. なければ `winget` でNode.js LTSをインストール
3. `npm ci` でlockfileどおりに依存関係を再現
4. TypeScript typecheck
5. Vite production build
6. portable単一HTMLを生成
7. portable HTMLを既定ブラウザで開く

一度セットアップ済みなら `RUN_WINDOWS.cmd` でportable版を開けます。

> Windows上では、プロジェクトのフォルダ名または親パスに `&` を含めないでください。
> npm/ViteのWindows command shimで問題になることがあるため、セットアップスクリプトでも検出して停止します。

---

## 何ができる？

Matrix Block Canvasは、TSVやカテゴリ行列から、見栄えのするブロック図を作るGUIツールです。
PowerPointやExcelでセルを手作業で塗って整える作業を、ブラウザ上で完結させることを目指しています。

表を貼り付けて、色、ラベル、注釈、領域、凡例を画面で調整し、SVGまたはJPEGとして書き出せます。
グラフィカル遺伝子型風の図にも使えますが、特定の生物種やデータセットには依存していません。

### 主な機能

| 機能 | 内容 |
| --- | --- |
| GUI編集 | 色、ラベル、注釈、領域、凡例、オーバーレイを画面上で調整 |
| TSV入力 | 表計算ソフトやテキストから貼り付けて図に変換 |
| 手動ビルダー | ブラウザ上で行や値を作成 |
| Flapjack風入力 | MAP + GENOTYPE形式のテキストを読み込み |
| 書き出し | SVG / JPEG |
| ローカル処理 | 通常の図作成処理はブラウザ内で完結 |
| Windows portable | JS/CSS込みの単一HTMLを生成し、Nodeなしの別PCへコピー可能 |
| 再現性 | `package-lock.json` + `npm ci`、Linux/Windows CIで検証 |

### 入力例

```tsv
sample	c01	c02	c03
group	1	1	2
pos	1	2	3
row_01	A	A	B
row_02	B	B	B
row_03	A	H	B
row_04	B	A	-
```

値はカテゴリとして扱われ、色に対応づけられます。Flapjack風のMAP + GENOTYPEテキストも読み込めます。

---

## Windowsでの開発

### 必要環境

- Windows 10 / 11
- Node.js 20.19+（現行LTS推奨）
- npm
- Edge / Chrome / Firefoxの現行版

### cloneして起動

```powershell
git clone https://github.com/light-suzuki/matrix-block-canvas.git
cd matrix-block-canvas
npm ci
npm run dev
```

Viteが表示するローカルURLを開いてください。既定では通常 `http://127.0.0.1:5173/` です。
5173番ポートが使用中の場合は別ポートになることがあります。

LAN内の別端末から開発サーバーへ接続したい場合だけ、次を使います。

```powershell
npm run dev:lan
```

Windows Firewallの許可が必要になる場合があります。通常利用では `npm run dev` を推奨します。

### 検証

```powershell
npm run check
```

`check` は以下をまとめて実行します。

- `npm run typecheck`
- `npm run build`
- portable単一HTML生成と残存ローカルasset参照の検査

GitHub ActionsでもUbuntuとWindowsの両方で同じ検証を実行します。

### 個別コマンド

```powershell
npm run typecheck
npm run build
npm run portable
npm run preview
```

---

## PC間で引き継がれるもの / 引き継がれないもの

portable HTMLそのものは1ファイルで移動できます。一方、ブラウザの `localStorage` に保存された作業中設定は
ブラウザ・端末ごとの保存領域なので、HTMLファイルをコピーしただけでは別PCへ移りません。

TSVなどの元データ、書き出したSVG/JPEGは通常のファイルとして移動できます。
重要な作業については元TSVと出力ファイルを別途保存してください。

---

## CI / 配布

- `.github/workflows/ci.yml`: Ubuntu + Windowsで `npm ci` と `npm run check`
- `.github/workflows/pages.yml`: GitHub Pages用ビルドとportable HTML生成
- Pages workflowでは `MatrixBlockCanvas-portable.html` もworkflow artifactとして保存

これにより、開発PC固有の `node_modules` や絶対パスを持ち込まず、別Windows PCでも同じlockfileから再現できます。

---

## クレジット

アイデア、方向性、ユースケース設計:

- light-suzuki

コード実装はOpenAI CodexおよびGPT系coding modelの支援を受けて進めました。

## 引用

研究・論文・発表で使った場合は、このリポジトリを引用してもらえると嬉しいです。
`CITATION.cff` を含めているため、GitHub上で「Cite this repository」が利用できます。

## ライセンス

MIT Licenseです。ライセンス条件に従う限り、利用、コピー、改変、公開、配布、
サブライセンス、販売が可能です。

---

## English quick start

Matrix Block Canvas is a Japanese-first browser GUI for turning TSV or categorical matrices into clean block figures.

- Online app: https://light-suzuki.github.io/matrix-block-canvas/
- Windows/source setup: double-click `SETUP_WINDOWS.cmd`
- Development: `npm ci` then `npm run dev`
- Validation: `npm run check`
- Portable build: `npm run portable`
- Portable output: `dist\MatrixBlockCanvas-portable.html`

The portable file contains the built JavaScript and CSS and can be copied to another Windows PC and opened in a modern browser without Node.js. Remote CSS font imports are removed from the portable build so startup does not require network access.

Draft settings stored in browser `localStorage` are device/browser-local and are not transferred merely by copying the portable HTML file.
