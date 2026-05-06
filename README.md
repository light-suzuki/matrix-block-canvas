# Matrix Block Canvas

**日本語 UI のブラウザ型ブロック行列図作成ツール / Japanese-first browser GUI for block-matrix figures**

Matrix Block Canvas は、TSV やカテゴリ行列データから、発表・レポート・論文用の
ブロック行列図を GUI で簡単に作るためのツールです。

Matrix Block Canvas is a browser-based GUI tool for making clean block-matrix
figures from TSV or categorical data.

---

## 日本語

### これは何？

Matrix Block Canvas は、PowerPoint、Excel、Illustrator、または自作スクリプトで
手作業になりがちな「グラフィカル遺伝子型風のブロック図」や「カテゴリ行列図」を、
ブラウザ上の GUI で作るためのツールです。

表を貼り付け、ラベル・色・注釈・領域・凡例を画面上で調整し、SVG または JPEG として
書き出せます。

現在の UI は日本語を中心に作っています。通常利用ではバックエンドサーバーは不要で、
データは外部サーバーへアップロードされません。一部の UI 設定や作業中データは、
同じ端末のブラウザ localStorage に保存される場合があります。

### 作れるもの

- グラフィカル遺伝子型風のブロック図
- 行 x 列のカテゴリヒートマップ
- 品質フラグや状態フラグの一覧図
- 状態遷移・分類・比較用のブロック行列
- 発表スライド、ポスター、論文用の整った図

### 特徴

- GUI で直感的に編集できる
- TSV を貼り付けるだけで図を作れる
- 行・列・色・ラベル・注釈・領域・凡例を調整できる
- Flapjack 風の MAP + GENOTYPE テキストも読み込み可能
- SVG / JPEG で書き出し可能
- サンプルデータは匿名化された汎用的な数値・カテゴリ例
- 通常利用ではデータを外部に送信しない

### 入力例

一番簡単な入力は TSV です。

```tsv
sample	c01	c02	c03
group	1	1	2
pos	10	20	5
row_01	A	A	B
row_02	B	B	B
row_03	A	H	B
row_04	B	A	-
```

値はカテゴリとして扱われ、色に対応づけられます。遺伝子型風の図だけでなく、
品質フラグ、状態ブロック、分類行列などにも使えます。

### 開発

```powershell
npm install
npm run dev
```

Vite が表示するローカル URL を開きます。通常は次のようなURLです。

```text
http://127.0.0.1:5174/
```

### ビルド

```powershell
npm run typecheck
npm run build
```

### クレジット

アイデア、方向性、ユースケース設計:

- light-suzuki

コード実装は、OpenAI Codex と GPT-5.5 / GPT-5.4 系モデル、および関連する
coding model の支援を受けて進めました。

このような小さく実用的な研究支援ツールを作れる開発体験を提供してくれた
Codex チームと Codex の作成者に感謝します。

### 引用

研究・論文・発表で Matrix Block Canvas を使った場合は、このリポジトリを引用して
もらえると嬉しいです。`CITATION.cff` を含めているため、GitHub 上で
「Cite this repository」が表示されます。

### ライセンス

MIT License です。ライセンス条件に従う限り、利用・コピー・改変・公開・配布・
サブライセンス・販売が可能です。

---

## English

### What Is This?

Matrix Block Canvas is a browser-based GUI tool for making clean block-matrix
figures from TSV or categorical data.

It is designed for people who would otherwise spend time drawing these figures
by hand in PowerPoint, Excel, Illustrator, or custom scripts. Paste a matrix,
adjust labels and colors in the GUI, then export a figure for slides, reports,
or papers.

The current UI is Japanese-first. The tool runs entirely in your browser; your
data is not uploaded to a server. Some UI settings and draft workspace data may
be saved in your browser's local storage on the same device.

### Why This Exists

Graphical genotype-style block figures are common in genetics, breeding,
quality-control summaries, and state-matrix reports. Existing tools can be
powerful, but they are often analysis-heavy, script-heavy, or not convenient
when the goal is simply to make a readable publication-style figure.

Matrix Block Canvas focuses on:

- GUI-first editing instead of manual PowerPoint drawing.
- Simple TSV input instead of a complex project format.
- Japanese UI for researchers and students who prefer working in Japanese.
- Local browser execution with no data upload.
- SVG and JPEG export for papers, posters, and slides.
- Generic categorical matrices, not only one plant, species, or dataset.

### What You Can Make

- Genotype-style block figures.
- Row-by-column categorical heatmaps.
- Quality flag matrices.
- State transition or status block diagrams.
- Compact comparison figures for presentations and reports.

Values are treated as categories and mapped to colors. Labels, annotations,
regions, legends, and overlay objects can be adjusted from the GUI.

### Input Example

The simplest input is a TSV table:

```tsv
sample	c01	c02	c03
group	1	1	2
pos	10	20	5
row_01	A	A	B
row_02	B	B	B
row_03	A	H	B
row_04	B	A	-
```

The app also supports Flapjack-like MAP + GENOTYPE text for users who already
have that style of data.

### Features

- Manual row builder in the browser.
- TSV paste/import workflow.
- Flapjack-like MAP + GENOTYPE import.
- GUI editing for labels, colors, regions, annotations, and overlays.
- Figure export as SVG and JPEG.
- Generic anonymized templates and example data.
- No backend server required for normal use.

### Development

```powershell
npm install
npm run dev
```

Open the local URL shown by Vite, usually:

```text
http://127.0.0.1:5174/
```

### Build

```powershell
npm run typecheck
npm run build
```

### Credits

Project idea, direction, and use-case design:

- light-suzuki

Code implementation was developed with AI assistance from OpenAI Codex using
GPT-5.5 / GPT-5.4-family models and related coding models during the extraction
and public-release preparation process.

Special thanks to the Codex team and the creators of Codex for making this kind
of small, practical research-tool development workflow possible.

### Citation

If you use Matrix Block Canvas in academic work, please cite this repository.
The repository includes `CITATION.cff`, so GitHub should show a "Cite this
repository" option.

### License

MIT License. You may use, copy, modify, publish, distribute, sublicense, and/or
sell copies of the software, subject to the license terms.
