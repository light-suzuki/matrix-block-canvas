# Matrix Block Canvas

Matrix Block Canvas is a browser-based tool for turning TSV or categorical
matrix data into clean block figures for presentations, reports, and papers.

The app runs entirely in the browser. Your data is not uploaded to a server.
Some UI settings and draft workspace data may be saved in your browser's
local storage on the same device.

## Features

- Build matrix rows manually in the browser.
- Paste TSV matrices and render them as publication-style block figures.
- Import Flapjack-like MAP + GENOTYPE text when needed.
- Edit labels, colors, regions, annotations, and overlays.
- Export SVG and JPEG images.
- Use generic numeric or categorical examples without bundled domain datasets.

## Input

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

Values are treated as categories and mapped to colors. The tool is useful for
genotype-style matrices, quality flags, state blocks, or any compact
row-by-column categorical figure.

## Develop

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run typecheck
npm run build
```

## Citation

If you use Matrix Block Canvas in academic work, please cite this repository.
GitHub should show a "Cite this repository" option when `CITATION.cff` is
present.

## License

MIT License.
