# Matrix Block Canvas

Matrix Block Canvas is a browser-based GUI tool for making clean block-matrix
figures from TSV or categorical data.

It is designed for people who would otherwise spend time drawing these figures
by hand in PowerPoint, Excel, Illustrator, or custom scripts. Paste a matrix,
adjust labels and colors in the GUI, then export a figure for slides, reports,
or papers.

The current UI is Japanese-first. The tool runs entirely in your browser; your
data is not uploaded to a server. Some UI settings and draft workspace data may
be saved in your browser's local storage on the same device.

## Why This Exists

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

## What You Can Make

- Genotype-style block figures.
- Row-by-column categorical heatmaps.
- Quality flag matrices.
- State transition or status block diagrams.
- Compact comparison figures for presentations and reports.

Values are treated as categories and mapped to colors. Labels, annotations,
regions, legends, and overlay objects can be adjusted from the GUI.

## Input Example

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

## Features

- Manual row builder in the browser.
- TSV paste/import workflow.
- Flapjack-like MAP + GENOTYPE import.
- GUI editing for labels, colors, regions, annotations, and overlays.
- Figure export as SVG and JPEG.
- Generic anonymized templates and example data.
- No backend server required for normal use.

## Development

```powershell
npm install
npm run dev
```

Open the local URL shown by Vite, usually:

```text
http://127.0.0.1:5174/
```

## Build

```powershell
npm run typecheck
npm run build
```

## Credits

Project idea, direction, and use-case design:

- light-suzuki

Code implementation was developed with AI assistance from OpenAI Codex using
GPT-5.5 / GPT-5.4-family models and related coding models during the extraction
and public-release preparation process.

Special thanks to the Codex team and the creators of Codex for making this kind
of small, practical research-tool development workflow possible.

## Citation

If you use Matrix Block Canvas in academic work, please cite this repository.
The repository includes `CITATION.cff`, so GitHub should show a "Cite this
repository" option.

## License

MIT License. You may use, copy, modify, publish, distribute, sublicense, and/or
sell copies of the software, subject to the license terms.
