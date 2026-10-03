# Duotone Images

An Obsidian plugin that shows your images as a duotone. Black maps to one color you pick. White maps to another. Greys fall between them.

It works on screen only. Your image files are never changed, and no new files are written.

## Use

* **Settings → Duotone Images:** pick the two default colors, and choose whether to recolor all images.
* **Open an image in its own tab:** a bar appears above it with controls for that one image. Changes show up everywhere the image appears in your notes, right away.

| Control | What it does |
|---|---|
| Recolor this image | Turns the effect on or off for this image |
| Exposure | Darker or brighter |
| Contrast | Flatter or harsher |
| Balance | Gives the dark or the light color more of the picture |
| Color mix | From the original picture to full duotone |
| Invert | Swaps which color black and white land on |
| Black / White colors | Colors for this image only |

Per-image settings are saved by file path in the plugin's `data.json`, and follow the file if you rename it.

## How it works

Each image gets an SVG filter. A color matrix turns pixels into grey (with contrast and exposure folded in), then a lookup table maps grey to your two colors. The plugin watches the page for `<img>` tags, matches their URLs to your vault's image files, and sets `style.filter` on them.

## Limits

* It overwrites an inline `filter` that another plugin put on the same image.
* SVG files are skipped.
* Grey uses simple luma weights on raw sRGB values. It's a stylized look, not a color-accurate conversion.

## Develop

```
npm install
npm run dev     # rebuild on save
npm run build   # type check + production build
npm test        # tests for the color math
```

Link the folder into `<vault>/.obsidian/plugins/duotone-images` and enable it in Community plugins.

## License

MIT
