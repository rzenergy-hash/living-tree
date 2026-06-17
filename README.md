# Living Tree

A poetic, interactive generative artwork. A painted tree begins bare and
dormant; as a viewer's cursor approaches the branches it awakens and grows
leaves, breathes with surrounding sound, and slowly returns to bare branches
when left alone.

## Run it

It's plain HTML/CSS/JS — no build step. Because it loads an image, open it
through a local server (browsers block `file://` image sampling):

```bash
cd living-tree
python3 -m http.server 4180
# then open http://localhost:4180
```

## Files

| File                  | Purpose                                                        |
|-----------------------|----------------------------------------------------------------|
| `index.html`          | Layer stack + hidden control panel                             |
| `style.css`           | Gallery framing and panel styling                              |
| `script.js`           | All interaction, growth, audio, particles, fog, parallax       |
| `tree.png`            | The base painting (see below to replace)                       |
| `make_placeholder.py` | Generates the stand-in `tree.png` (stdlib only)                |

## Replacing the tree image

Drop your own picture into this folder and name it **`tree.png`**, then
refresh. (To use a different filename, change `IMAGE_SRC` near the top of
`script.js`.)

For best results use a **dark tree/branches on a light background** — leaf
anchors are scattered onto the *dark* pixels detected by luminance sampling,
weighted toward the upper canopy. The original image is never modified; all
animation is drawn on transparent canvases above it.

## Interaction

- **Mouse proximity** → leaf growth. The patch under the cursor blooms (on the
  dark branch pixels); the rest stays bare.
- **Dwell to fill the radius** → at first only the very center blooms. The
  longer the cursor lingers in one place, the more it fills outward until the
  whole growth radius is covered. Move on or pull away and it relaxes back.
- **Leaves are sprigs** → each grows as a small twig bearing several tiny
  leaflets in pairs, each leaflet one of four organic shapes (almond, round,
  teardrop, ovate), like the reference foliage.
- **Mouse velocity** → wind (faster movement = stronger flutter and drift).
- **Ambient air flow** → a constant gentle breeze drifts the whole scene
  (swaying leaves, floating grey dust, sideways air-current wisps and mist).
- **Ambient sound** (opt-in) → a calm meditation bed: a warm slow-swelling
  drone, soft singing-bowl tones with long decay, a barely-there breath of
  air, and sparse, gentle birdsong. No audio files; nothing plays until you
  press the button (browsers require a click).
- **Microphone** (opt-in) → extra motion only: quiet = calm, speech = more
  flutter, music = stronger sway and particle motion. Audio never creates leaves.
- **Move away** → leaves shrink, some detach and fall, and the tree returns to dormancy.

The painting is scaled to **cover** the browser window, so it fills the full
width. On very wide windows the top/bottom are cropped (biased to keep the
canopy) — adjust `coverAnchor` in `script.js` to shift what stays in frame.

## Controls

Press **`C`** (or click the small dot, lower-left) to toggle the panel:

- **Growth Sensitivity** — size of the bloom patch / how readily leaves grow
- **Audio Sensitivity** — how strongly the microphone drives motion
- **Wind Strength** — breeze + flutter/drift intensity
- **Ambient Sound** — start/stop the synthesized soundscape
- **Enable Microphone** — request mic permission (motion only)
- **Reset Tree** — return to bare branches instantly
- **Save PNG** — flatten all layers and download the current frame

## Notes

Rendered with Canvas 2D on a single `requestAnimationFrame` loop, targeting
60 FPS. Four stacked layers (image · leaves · particles · fog) drift with a
subtle 2.5D parallax. Responsive to any viewport; leaf anchors are stored in
normalized image space so they stay glued to their branches across resizes.
