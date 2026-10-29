# riven-pipes-3d

Live 3D pipe linework (Three.js) for the "Our pipe" Zoom stage on the Riven home page.
It replaces the flat line-drawing image with a 3D drawing of the same pipe run, fitted to the
image's camera, so it stays crisp at every zoom and the highlight spots stay aligned.

![Zoom alignment test](docs/preview-zoom-alignment.png)

## Install (Bricks)

Bricks > Settings > Custom code > Body (footer) scripts:

```html
<script src="https://cdn.jsdelivr.net/gh/ljoshuat/riven-pipes-3d@main/loader.min.js" defer></script>
```

The script finds `.flow-illustration.zoom`, loads three.js r147 from jsDelivr when the section is near
the viewport, and keeps the original image as the fallback.

## Behaviour

- Mirrors the existing CSS hover zoom (01 / 02 / 03) through the camera's view offset.
- Hover: a slight camera swing while zooming and a pointer tilt over the drawing.
- Renders only while something moves; pauses off screen; respects `prefers-reduced-motion`.

## Fine-tuning

Open the page with `?pipes-tune`, adjust the sliders, then **Copy as Bricks attributes** and add them
to the zoom frame element: in Bricks, the Div directly above "Zoom stage" (classes `flow-illustration` and `zoom`) > Style > Attributes.

Hovering 01/02/03 highlights the matching weld ring on the 3D drawing in the site blue; the CSS arc and dot are hidden while the 3D view is active.

| Attribute | Default | |
|---|---|---|
| `data-pipe-lines` | 24 | lines around each pipe |
| `data-pipe-rings` | 1.5 | cross-section ring spacing, 0 = off |
| `data-pipe-bolts` | 8 | bolts per flange |
| `data-pipe-smooth` | 96 | surface smoothness |
| `data-pipe-outline` | 1.4 | outline weight (px) |
| `data-pipe-detail` | 0.7 | detail line weight (px) |
| `data-pipe-detail-opacity` | 0.6 | detail brightness |
| `data-pipe-ring-opacity` | 0.38 | ring brightness |
| `data-pipe-hidden` | 0.14 | dashed lines seen through pipes, 0 = off |
| `data-pipe-swing` | 1 | camera swing while zooming, 0 = off |
| `data-pipe-tilt` | 1 | pointer tilt, 0 = off |
| `data-pipe-color` | | line colour; blank = section text colour |
| `data-pipe-highlight` | 3 | weld highlight width (px), 0 = off |
| `data-pipe-glow` | 0.6 | soft glow around highlights, 0 = off |
| `data-pipe-glow-size` | 1 | glow spread |
| `data-pipe-highlight-color` | | highlight colour; blank = site blue (`--zoom-accent` / `--color-blue`) |
| `data-pipe-rest-zoom` | 1 | resting zoom |
| `data-pipe-rest-x` / `data-pipe-rest-y` | 0.547 / 0.5 | resting focus point (0–1) |
| `data-pipe-zoom1` / `zoom2` / `zoom3` | 3.2 / 3.84 / 3.4 | how far each 01/02/03 hover zooms in |
| `data-pipe-zoom-time` | 0.9 | zoom duration (seconds) |
| `data-pipe-zoom1-x` / `-y` (and 2, 3) | 01: 0.376 / 0.105 | focus point of each stop (0–1 across the drawing) |

![Tuning panel](docs/preview-tuning-panel.png)

## Releasing

Edit `src/`, run `python3 build.py`, commit and push to `main`. The site loads `loader.js`, which looks up
the latest commit on `main` (GitHub API, cached 5 minutes per visitor; always fresh with `?pipes-tune`) and
loads the script pinned to that commit, so updates are live on the next page load. As a backup, the
"Refresh jsDelivr cache" GitHub Action purges jsDelivr on every push, so changes go live in a minute or two
with no edit in Bricks. Visitors' browsers may keep the previous copy for up to about 12 hours.

To freeze a known-good version instead, point the Bricks line at a commit ID or tag
(`@<commit>` / `@v1.2.0`).

## Stainless + x-ray mode

At rest the pipe renders as polished stainless steel; hovering a stop (or the drawing) fades the steel to a ghost and the linework shows through like an x-ray.

- Preview just for you: add `?pipes-stainless` to the page URL (add `&pipes-tune` for the controls).
- Make it live for everyone: add `data-pipe-mode = stainless` to the Div with the other attributes. `?pipes-lines` forces the plain line version.

| Attribute | Default | What it does |
|---|---|---|
| data-pipe-metalness | 1 | How metallic the steel reads |
| data-pipe-roughness | 0.3 | Low = mirror polish, high = brushed |
| data-pipe-reflections | 1.1 | Strength of the studio reflections |
| data-pipe-exposure | 1 | Overall brightness |
| data-pipe-steel | #cfd4d9 | Steel tint |
| data-pipe-xray | 0.12 | Steel opacity while x-raying |
| data-pipe-rest-lines | 0 | Linework visible over the steel at rest |
| data-pipe-xray-hidden | 0.35 | Dashed hidden lines while x-raying |
| data-pipe-xray-speed | 0.6 | Fade time in seconds |
| data-pipe-xray-on-hover | 1 | 1 = x-ray when hovering the drawing itself, 0 = only the 01/02/03 stops |
