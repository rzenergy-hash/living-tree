/* =====================================================================
   Living Tree — interactive generative artwork
   =====================================================================

   The base painting (tree.png) is drawn, untouched, on the back canvas.
   We sample its pixels to find the dark branch/trunk regions, then scatter
   thousands of invisible "leaf anchors" along those dark pixels.

   Mouse PROXIMITY drives growth — a small, local patch under the cursor
   blooms (anchors ease 0 -> 1).
   Mouse VELOCITY drives wind (leaves flutter, particles streak).
   DWELL: at first only the center blooms; the longer the cursor lingers, the
   more it fills outward until the whole growth radius is covered.
   Each leaf is a small SPRIG — a twig of several tiny leaflets in varied
   organic shapes (almond / round / teardrop / ovate), like real foliage.
   A constant gentle BREEZE keeps the whole scene drifting like moving air
   (swaying leaves, drifting dust, sideways air-current wisps).
   MICROPHONE (opt-in) drives extra motion only, never leaf creation.
   AMBIENT SOUND (opt-in) is a calm meditation bed — a warm drone, soft
   singing-bowl tones, a faint breath of air, and sparse birdsong.

   The painting is scaled to CONTAIN the viewport so the WHOLE tree is always
   visible (never cropped). The page background is matched to the painting's
   paper tone so any margin blends in and the art appears to fill the screen.

   Everything animates on a single requestAnimationFrame loop.

   ---------------------------------------------------------------------
   REPLACING THE TREE IMAGE
   ---------------------------------------------------------------------
   Just drop your own picture into this folder and name it `tree.png`
   (see IMAGE_SRC below to point at a different filename). A high-contrast
   image with dark branches on a light background works best, because leaf
   anchors are placed on the DARK pixels. After swapping the file, refresh.
   ===================================================================== */

(() => {
  'use strict';

  // ---- Configuration --------------------------------------------------
  const IMAGE_SRC = 'tree.png';   // <-- replace this file to use your own art

  const CONFIG = {
    maxLeaves:        8500,   // cap on individual leaves (smaller leaves -> use more)
    darkThreshold:    185,    // catches faint twigs; edge test below rejects smudges
    topBias:          1.05,   // gentle bias toward the upper canopy when seeding
    clusterMin:       5,      // leaves in a small cluster
    clusterMax:       18,     // leaves in a medium cluster
    // Growth radius as a FRACTION of the displayed tree's short side, so it
    // covers the same proportion of the artwork on any screen size.
    growthRadiusMoveFrac: 0.22,   // while the mouse is moving
    growthRadiusStayFrac: 0.375,  // grows to this as the mouse rests in place
    growthEase:       0.05,   // slow, gentle growth toward each leaf's target
    decayEase:        0.04,   // slower fade-out for a graceful return to dormancy
    detachChance:     0.01,   // per-frame chance a decaying full leaf detaches & falls
    parallax:         { bg: 5, leaf: 12, particle: 22, fog: 30 }, // px of drift
    particleCount:    110,    // floating dust motes (visible air movement)
    fogBlobs:         13,     // rising smoke clouds
    wisps:            7,      // drifting air-current bands
    butterflies:      3,      // butterflies fluttering around the cursor while hovering
    spriteVariants:   18,     // distinct leaf silhouettes in the pre-rendered library
    spriteColorsEach: 4,      // colour variations rendered per silhouette
  };

  // Ginkgo palette from the reference: olive, grey-green, yellow-green, golden.
  // `w` is the relative chance of a leaf taking that colour (golden is rare).
  const PALETTE = [
    { h: 96,  s: 46, l: 42, w: 1.3 },  // leaf green
    { h: 88,  s: 44, l: 40, w: 1.2 },  // sage green
    { h: 82,  s: 48, l: 41, w: 1.1 },  // olive green
    { h: 104, s: 38, l: 45, w: 0.9 },  // cool green
    { h: 70,  s: 50, l: 46, w: 0.6 },  // yellow-green (less)
    { h: 48,  s: 56, l: 54, w: 0.12 }, // muted golden (rare)
  ];

  // ---- Canvas / layer setup ------------------------------------------
  const bgCanvas   = document.getElementById('bg-canvas');
  const leafCanvas = document.getElementById('leaf-canvas');
  const partCanvas = document.getElementById('particle-canvas');
  const fogCanvas  = document.getElementById('fog-canvas');

  const bgCtx   = bgCanvas.getContext('2d');
  const leafCtx = leafCanvas.getContext('2d');
  const partCtx = partCanvas.getContext('2d');
  const fogCtx  = fogCanvas.getContext('2d');

  const allCanvases = [bgCanvas, leafCanvas, partCanvas, fogCanvas];

  // ---- State ----------------------------------------------------------
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let viewW = 0, viewH = 0;                 // CSS pixel size of the viewport

  // The painting is fit "contain" inside the viewport. These describe where.
  let img = null;
  let fit = { x: 0, y: 0, w: 0, h: 0 };     // destination rect of the image (CSS px)

  let leaves = [];                          // individual leaf objects (placed in clusters)
  let fallers = [];                         // detached, falling leaves
  let particles = [];                       // ambient dust
  let fogs = [];                            // soft mist blobs
  let wisps = [];                           // drifting horizontal air currents
  let butterfliesV = [];                    // butterflies that flutter around while hovering
  let butterflySprite = null;               // preprocessed butterfly.png (alpha-keyed), or null

  // Pre-rendered art (built once, reused every frame for performance).
  let leafSprites = [];                     // [{canvas, ar}] varied leaf silhouettes + colours
  let leafSpritesDark = [];                 // darker copies (same index) for "back" leaves
  let flowerSprite = null;                  // cached white flower (front)
  let flowerSpriteDark = null;              // dimmer flower for "back" depth

  // Pointer + motion
  const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, inside: false, speed: 0 };
  let wind = 0;                             // smoothed mouse-driven wind
  let breeze = 0;                           // gentle, ever-present ambient air flow
  let flowX = 0;                            // current horizontal drift of the air
  let dwell = 0;                            // 0..1: how long the cursor has lingered in place
  let bloom = 0;                            // 0..1: flower-bloom progress (rises once leaves are full)
  let time = 0;                             // global clock (seconds-ish)

  // Audio — microphone (drives motion only)
  let audioLevel = 0;                       // smoothed loudness 0..1
  let audioAnalyser = null;
  let audioData = null;
  let micActive = false;

  // Audio — synthesized ambient soundscape (background sound output)
  // Defaults to ON, but browsers won't let audio play until the first user
  // gesture, so it actually starts on the first click/key/tap (see boot).
  let soundOn = true;
  let soundStarted = false;
  let soundCtx = null;
  let soundNodes = null;

  // User-tunable settings (bound to sliders)
  const settings = { growthSens: 0.65, audioSens: 1, windStr: 1 };

  // ---- Utility --------------------------------------------------------
  const rand  = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const randi = (n) => Math.floor(Math.random() * n);

  // Pick a palette colour by weight (golden is rare).
  function pickPalette() {
    let total = 0;
    for (const c of PALETTE) total += c.w;
    let r = Math.random() * total;
    for (const c of PALETTE) { r -= c.w; if (r <= 0) return c; }
    return PALETTE[0];
  }

  // ---- Leaf sprite library (pre-rendered once, reused every frame) ----
  /*
    Each sprite is a small offscreen canvas holding ONE leaf silhouette, drawn
    pointing "up" (base at bottom-centre, tip at top) with a soft watercolour
    fill — a base colour, a tip-to-base gradient, and a couple of translucent
    patches. No veins, no shadows, no filters. At draw time we just transform
    and drawImage the cached canvas, so thousands of leaves stay cheap.
  */
  function buildLeafSprites() {
    leafSprites = [];
    leafSpritesDark = [];                // parallel darker copies for "back" leaves (depth)
    const SH = 80;                       // sprite render height (px) — downscaled when drawn
    for (let s = 0; s < CONFIG.spriteVariants; s++) {
      // GINKGO fan parameters: a circular-sector blade (rounded arc top, a
      // central cleft, gently scalloped edge) tapering to a thin stalk. Not a
      // triangle. (No veins — kept lightweight.)
      const shape = {
        spread:  rand(0.55, 0.92),       // narrow fan -> slender ginkgo blade
        cleft:   Math.random() < 0.72 ? rand(0.14, 0.34) : 0.04,  // central notch depth
        scallop: Math.round(rand(5, 11)),// number of soft scallops along the arc
        scaleA:  rand(0.025, 0.06),      // scallop amplitude
        lean:    rand(-0.12, 0.12),      // slight sideways lean
      };
      for (let cI = 0; cI < CONFIG.spriteColorsEach; cI++) {
        const pal = pickPalette();
        const col = { h: pal.h + rand(-7, 7), s: pal.s + rand(-8, 8), l: pal.l + rand(-7, 9) };
        leafSprites.push(renderLeafSprite(SH, shape, col));
        // a darker, slightly cooler copy for leaves that sit "behind"
        leafSpritesDark.push(renderLeafSprite(SH, shape, { h: col.h + 4, s: col.s + 4, l: col.l - 16 }));
      }
    }
  }

  // Geometry of a ginkgo blade for a given sprite height: apex (where the stalk
  // meets the blade) and the fan radius. Shared by the outline and the stalk.
  function ginkgoGeom(H, sh) {
    const ay = H * 0.76;                 // apex lower -> longer stalk, more slender leaf
    const r = ay - H * 0.06;             // blade radius (arc reaches near the top)
    const halfW = r * Math.sin(Math.min(sh.spread, Math.PI / 2 + 0.2));
    return { ay, r, halfW };
  }

  // Build a GINKGO blade outline (a scalloped circular sector) into ctx. The
  // apex is at (W/2 + lean, ay); the arc fans upward; two straight-ish radii
  // come back to the apex. A dip at the centre makes the characteristic cleft.
  function leafOutline(ctx, W, H, sh) {
    const { ay, r } = ginkgoGeom(H, sh);
    const ax = W / 2 + sh.lean * W * 0.16;
    const N = 16;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const ang = -Math.PI / 2 - sh.spread + 2 * sh.spread * f;   // sweep over the top
      let rr = r * (1 + sh.scaleA * Math.sin(f * Math.PI * sh.scallop));  // scalloped edge
      const dc = Math.abs(f - 0.5);
      if (dc < 0.06) rr -= sh.cleft * r * (1 - dc / 0.06);         // central cleft
      ctx.lineTo(ax + rr * Math.cos(ang), ay + rr * Math.sin(ang));
    }
    ctx.closePath();   // straight radius from the last arc point back to the apex
  }

  function renderLeafSprite(SH, sh, col) {
    const H = SH;
    const { ay, r, halfW } = ginkgoGeom(H, sh);
    const W = Math.round(halfW * 2 + H * 0.14);     // canvas wide enough for the fan
    const ar = W / H;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const hsl  = (h, s, l) => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    const hsla = (h, s, l, a) => `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;

    // soft watercolour fill, clipped to the leaf outline
    leafOutline(x, W, H, sh);
    x.save();
    x.clip();
    x.fillStyle = hsl(col.h, col.s, col.l);
    x.fillRect(0, 0, W, H);
    // tip-to-base gradient (lighter toward the tip)
    const g = x.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, hsla(col.h, col.s, Math.max(18, col.l - 8), 0.5));
    g.addColorStop(1, hsla(col.h + 6, col.s, Math.min(78, col.l + 14), 0.45));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // a couple of translucent watercolour patches for texture
    for (let i = 0; i < 2; i++) {
      const px = rand(W * 0.25, W * 0.75), py = rand(H * 0.2, H * 0.85), pr = rand(W * 0.2, W * 0.5);
      const rg = x.createRadialGradient(px, py, 0, px, py, pr);
      const dl = clamp(i === 0 ? col.l + 16 : col.l - 12, 12, 82);
      rg.addColorStop(0, hsla(col.h, col.s, dl, 0.28));
      rg.addColorStop(1, hsla(col.h, col.s, dl, 0));
      x.fillStyle = rg;
      x.fillRect(0, 0, W, H);
    }
    x.restore();

    // the thin stalk (petiole): from the bottom up to the blade apex
    const ax = W / 2 + sh.lean * W * 0.16;
    x.strokeStyle = hsla(col.h, Math.max(12, col.s - 16), Math.max(16, col.l - 22), 0.85);
    x.lineCap = 'round';
    x.lineWidth = Math.max(1.2, W * 0.045);
    x.beginPath();
    x.moveTo(W / 2, H - 1);
    x.quadraticCurveTo((W / 2 + ax) / 2, (H + ay) / 2, ax, ay);
    x.stroke();

    return { canvas: c, ar: W / H };
  }

  // Cached flower sprites: a bright front one and a dimmer "back" one, so the
  // blossoms have the same front/back depth as the leaves.
  function buildFlowerSprite() {
    flowerSprite = renderFlowerSprite('rgba(255,255,255,0.97)', 'rgba(243,206,112,0.96)', 0.16);
    flowerSpriteDark = renderFlowerSprite('rgba(214,218,205,0.95)', 'rgba(196,168,96,0.92)', 0.22);
  }

  function renderFlowerSprite(petal, centre, haloA) {
    const S = 64, c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const cx = S / 2, cy = S / 2, petals = 5, R = S * 0.3;
    // soft halo so the flower lifts off the paper / sits behind front leaves
    const halo = x.createRadialGradient(cx, cy, 0, cx, cy, S * 0.5);
    halo.addColorStop(0, `rgba(90,95,78,${haloA})`);
    halo.addColorStop(1, 'rgba(90,95,78,0)');
    x.fillStyle = halo; x.fillRect(0, 0, S, S);
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
      x.fillStyle = petal;
      x.beginPath();
      x.ellipse(px, py, R * 0.66, R * 0.42, a, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = centre;
    x.beginPath(); x.arc(cx, cy, R * 0.44, 0, Math.PI * 2); x.fill();
    return c;
  }

  // ---- Image load + branch detection ---------------------------------
  function loadImage() {
    img = new Image();
    img.onload = () => {
      document.getElementById('missing').classList.add('hidden');
      resize();
      sampleBranchAnchors();
    };
    img.onerror = () => {
      // No image: show the friendly notice but keep ambient layers running.
      document.getElementById('missing').classList.remove('hidden');
    };
    img.src = IMAGE_SRC;
  }

  // Optional: a real butterfly image (`butterfly.png`). The image's background
  // is made transparent automatically: we look at the corners to decide whether
  // the background is light or dark, then key it out (alpha from luminance, or
  // its inverse). Dark line-art on white keeps its lines; bright art on black
  // keeps its glow. If the file is missing, butterflies are drawn procedurally.
  function loadButterfly() {
    const bi = new Image();
    bi.onload = () => {
      const c = document.createElement('canvas');
      c.width = bi.width; c.height = bi.height;
      const x = c.getContext('2d');
      x.drawImage(bi, 0, 0);
      const im = x.getImageData(0, 0, c.width, c.height);
      const d = im.data, W = c.width, H = c.height;
      const lumAt = (px, py) => { const i = (py * W + px) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
      const cornerLum = (lumAt(0, 0) + lumAt(W - 1, 0) + lumAt(0, H - 1) + lumAt(W - 1, H - 1)) / 4;
      const lightBg = cornerLum > 128;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lightBg) {
          // dark drawing on light paper: white -> transparent, keep dark lines
          d[i + 3] = Math.min(255, (255 - lum) * 1.25);
          // nudge toward the artwork's ink so it sits in the painting
          d[i] = Math.min(d[i], 70); d[i + 1] = Math.min(d[i + 1], 72); d[i + 2] = Math.min(d[i + 2], 68);
        } else {
          // bright drawing on dark bg: black -> transparent, soft charcoal tint
          d[i] = 64; d[i + 1] = 66; d[i + 2] = 62;
          d[i + 3] = Math.min(255, lum * 1.15);
        }
      }
      x.putImageData(im, 0, 0);
      butterflySprite = c;
    };
    bi.onerror = () => { butterflySprite = null; };  // fall back to procedural
    bi.src = 'butterfly.png';
  }

  /*
    Scan the painting at high resolution, find dark pixels (the branches, twigs,
    trunk and roots), and scatter leaf anchors onto them. Sampling at high
    resolution is what lets the thin edge twigs be detected — at low resolution
    they get averaged into the pale background and disappear.
  */
  function sampleBranchAnchors() {
    if (!img) return;

    // Render the image large enough that 1px-wide twigs survive as dark pixels.
    const SAMPLE_W = Math.min(900, img.width);
    const SAMPLE_H = Math.max(1, Math.round(SAMPLE_W * (img.height / img.width)));
    const tmp = document.createElement('canvas');
    tmp.width = SAMPLE_W; tmp.height = SAMPLE_H;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
    const data = tctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;

    // Match the page background to the painting's paper so margins disappear.
    setPaperBg(data, SAMPLE_W, SAMPLE_H);

    // Precompute luminance (transparent pixels count as bright paper).
    const N = SAMPLE_W * SAMPLE_H;
    const lumA = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      lumA[p] = data[i + 3] < 40 ? 255
        : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // Anchor leaves ONLY on actual branch strokes/twigs — a dark pixel that has
    // bright paper close by (so it sits on a thin dark line or a branch edge).
    // This is the key fix: the soft grey watercolour smudges are dark too, but
    // their interiors have no bright neighbour, so they're skipped and leaves
    // land on the branches themselves, including the fine edge twigs.
    const DARK = CONFIG.darkThreshold;     // pixel counts as "ink"
    const BRIGHT = 196;                     // neighbour counts as "paper"
    const off = Math.max(2, Math.round(SAMPLE_W / 260));   // neighbour distance (px)
    const dirs = [[off, 0], [-off, 0], [0, off], [0, -off],
                  [off, off], [-off, -off], [off, -off], [-off, off]];
    const candidates = [];
    for (let y = 0; y < SAMPLE_H; y++) {
      const vy = y / SAMPLE_H;                       // 0 top -> 1 bottom
      // Keep leaves full through the top, then start thinning around the middle
      // of the trunk so the main foliage stays up top and tapers off going down.
      const topWeight = vy < 0.30 ? 1 : clamp(1 - (vy - 0.30) / 0.34, 0.03, 1);
      for (let x = 0; x < SAMPLE_W; x++) {
        const p = y * SAMPLE_W + x;
        if (lumA[p] >= DARK) continue;                // not ink
        // Count how many neighbours are bright paper. A thin twig or a branch
        // TIP is surrounded by paper on almost all sides -> high count; the
        // interior of a thick mass/smudge has none.
        let bright = 0;
        for (let k = 0; k < dirs.length; k++) {
          const nx = x + dirs[k][0], ny = y + dirs[k][1];
          if (nx < 0 || ny < 0 || nx >= SAMPLE_W || ny >= SAMPLE_H || lumA[ny * SAMPLE_W + nx] > BRIGHT) bright++;
        }
        if (bright === 0) continue;                   // interior of a mass -> skip
        // Bias strongly toward thin structures and tips so leaves cover the
        // very ends of the twigs, not just the thicker branches.
        const thinness = bright / dirs.length;        // 0..1 (1 = isolated/tip)
        const prob = topWeight * (0.3 + thinness * 1.1);
        if (Math.random() < prob) candidates.push(x / SAMPLE_W, y / SAMPLE_H);
      }
    }

    // Estimate the local branch direction at a sample pixel using a small
    // structure tensor over the surrounding dark pixels. Returns the branch
    // orientation (radians) and a 0..1 strength (how line-like it is; low at
    // tips/blobs where there's no clear direction).
    const WIN = Math.max(3, Math.round(SAMPLE_W / 150));
    function branchDirAt(px, py) {
      let jxx = 0, jxy = 0, jyy = 0, n = 0;
      for (let dy = -WIN; dy <= WIN; dy++) {
        const yy = py + dy; if (yy < 0 || yy >= SAMPLE_H) continue;
        for (let dx = -WIN; dx <= WIN; dx++) {
          const xx = px + dx; if (xx < 0 || xx >= SAMPLE_W) continue;
          if (lumA[yy * SAMPLE_W + xx] < DARK) { jxx += dx * dx; jxy += dx * dy; jyy += dy * dy; n++; }
        }
      }
      if (n < 3) return { ang: rand(0, Math.PI * 2), strength: 0 };
      const ang = 0.5 * Math.atan2(2 * jxy, jxx - jyy);        // orientation of elongation
      const tr = jxx + jyy, det = jxx * jyy - jxy * jxy;
      const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
      const strength = l1 > 0 ? clamp((l1 - l2) / l1, 0, 1) : 0;
      return { ang, strength };
    }

    // Place leaves in natural CLUSTERS around chosen seed pixels (favouring the
    // thin twigs/tips from `candidates`). Each cluster runs a little along the
    // branch, and its leaves fan OUTWARD to both sides — never straight along it.
    leaves = [];
    const seedCount = candidates.length / 2;
    // shuffle seed order so clusters are spread, then consume until the cap
    const order = [];
    for (let i = 0; i < seedCount; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = randi(i + 1); const t = order[i]; order[i] = order[j]; order[j] = t; }

    for (let oi = 0; oi < order.length && leaves.length < CONFIG.maxLeaves; oi++) {
      const k = order[oi] * 2;
      const snx = candidates[k], sny = candidates[k + 1];
      const spx = snx * SAMPLE_W, spy = sny * SAMPLE_H;
      const dir = branchDirAt(spx | 0, spy | 0);
      // smaller, tip-like spots get tighter clusters; richer branches get more
      const size = CONFIG.clusterMin + randi(CONFIG.clusterMax - CONFIG.clusterMin + 1);
      const along = dir.ang;                       // unit step along the branch
      const ax = Math.cos(along), ay = Math.sin(along);
      // Compact clump: a small reach along the branch + a little perpendicular,
      // so each cluster reads as a tight clump with gaps between clusters.
      const reach = 0.016 + dir.strength * 0.022;  // normalized cluster radius

      for (let c = 0; c < size && leaves.length < CONFIG.maxLeaves; c++) {
        const t = rand(-1, 1);
        const perp = rand(-0.55, 0.55);
        const nx = clamp(snx + ax * t * reach + (-ay) * perp * reach * 0.7, 0, 1) + rand(-0.0015, 0.0015);
        const ny = clamp(sny + ay * t * reach + ax * perp * reach * 0.7, 0, 1) + rand(-0.0015, 0.0015);
        // outward angle: perpendicular to the branch, either side, plus spread.
        // At tips (low strength) fan in any direction instead.
        let angle;
        if (dir.strength < 0.25) {
          angle = rand(0, Math.PI * 2);
        } else {
          const side = Math.random() < 0.5 ? 1 : -1;
          angle = along + side * (Math.PI / 2) + rand(-0.6, 0.6);   // outward ± ~35°
        }
        leaves.push(makeLeaf(nx, ny, angle));
      }
    }
  }

  // One individual leaf. Position is normalized image space; `angle` is the
  // outward growth direction. Sprite/size/motion are all unique per leaf.
  function makeLeaf(nx, ny, angle) {
    const big = Math.random() < 0.22;
    return {
      nx, ny,
      angle,                                       // outward growth direction (radians)
      sprite: randi(leafSprites.length || 1),      // cached silhouette+colour
      back: Math.random() < 0.42,                  // a "behind" leaf — drawn darker & first
      size: big ? rand(15, 23) : rand(8, 15),      // smaller leaves
      growth: 0, target: 0,
      flutter: rand(0, Math.PI * 2),               // unique phase offset
      flutterSpd: rand(0.55, 1.5),                 // unique sway speed
      swayAmt: rand(0.04, 0.16),                   // unique sway amount
      unfurl: rand(-0.5, 0.5),                     // rotation offset that resolves as it grows
      maxOpacity: rand(0.85, 1.0),
      // White flower borne on a subset of leaves; opens after the leaves fill.
      hasFlower: Math.random() < 0.2,
      bloomThresh: Math.random(),
      flower: 0,
      flowerSize: rand(5, 9),
      foff: rand(0.35, 0.7),                       // where along the leaf the flower sits
      flowerPhase: rand(0, Math.PI * 2),
    };
  }

  // ---- Layout / resize ------------------------------------------------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;

    for (const c of allCanvases) {
      c.width  = Math.round(viewW * DPR);
      c.height = Math.round(viewH * DPR);
      c.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    // Fit the painting to "contain" — the WHOLE tree is always visible, top to
    // bottom, never cropped. It's scaled as large as the viewport allows. The
    // page background is matched to the painting's paper tone (see setPaperBg)
    // so any leftover margin blends in and the art appears to fill the screen.
    if (img && img.width) {
      const scale = Math.min(viewW / img.width, viewH / img.height);
      fit.w = img.width * scale;
      fit.h = img.height * scale;
      fit.x = (viewW - fit.w) / 2;
      fit.y = (viewH - fit.h) / 2;
    }
  }

  // Sample the painting's corners and tint the page background to match, so the
  // contained image blends seamlessly into the surrounding viewport.
  function setPaperBg(data, w, h) {
    const pts = [0, (w - 1), (h - 1) * w, (h * w - 1)];   // 4 corners
    let r = 0, g = 0, b = 0;
    for (const px of pts) { const i = px * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    r = Math.round(r / 4); g = Math.round(g / 4); b = Math.round(b / 4);
    const css = `rgb(${r}, ${g}, ${b})`;
    document.documentElement.style.setProperty('--bg', css);
    document.body.style.background = css;
  }

  // Map a normalized image coord (0..1) to current screen CSS px.
  const toScreenX = (nx) => fit.x + nx * fit.w;
  const toScreenY = (ny) => fit.y + ny * fit.h;

  // ---- Ambient elements (particles + fog) ----------------------------
  function initAmbient() {
    particles = [];
    for (let i = 0; i < CONFIG.particleCount; i++) particles.push(makeParticle(true));
    // Soft smoke clouds that slowly rise from the bottom and drift sideways.
    fogs = [];
    for (let i = 0; i < CONFIG.fogBlobs; i++) fogs.push(makeFog(true));
    // Elongated, slowly drifting bands that read as currents of moving air.
    wisps = [];
    for (let i = 0; i < CONFIG.wisps; i++) {
      wisps.push({
        x: rand(-0.3, 1.3), y: rand(0.08, 0.92),
        w: rand(0.35, 0.8),                  // half-width as a fraction of viewport
        h: rand(0.03, 0.1),                  // half-height fraction
        spd: rand(0.02, 0.05),               // a touch faster so the drift reads
        dir: Math.random() < 0.5 ? 1 : -1,
        phase: rand(0, Math.PI * 2),
        op: rand(0.06, 0.13),                // soft grey haze, gently visible
      });
    }
  }

  // A butterfly that drifts in from one side and then flutters around the cursor.
  function spawnButterfly() {
    const cx = mouse.inside ? mouse.x : viewW * 0.5;
    const cy = mouse.inside ? mouse.y : viewH * 0.3;
    const a = rand(0, Math.PI * 2), r = rand(160, 320);
    butterfliesV.push({
      x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
      vx: 0, vy: 0,
      wing: rand(0, Math.PI * 2),
      wingSpd: rand(22, 36),              // fast wing-flap speed
      size: Math.random() < 0.35 ? rand(20, 30) : rand(9, 18),   // smaller, varied wingspans
      orbitR: rand(70, 170),
      spd: rand(0.3, 0.7) * (Math.random() < 0.5 ? 1 : -1),
      seed: rand(0, Math.PI * 2),
      bob: rand(0, Math.PI * 2),
      leaving: false,
      dir: Math.random() < 0.5 ? 1 : -1,
    });
  }

  // A rising smoke cloud. On first seed it's scattered up the frame; otherwise
  // it starts just below the bottom edge and slowly floats upward while drifting
  // to the side, fading in low and dissipating near the top.
  function makeFog(seed) {
    return {
      x: rand(-0.15, 1.15),
      y: seed ? rand(0.1, 1.1) : rand(1.05, 1.25),
      vy: rand(0.02, 0.045),               // upward speed (fraction of height / sec)
      vx: rand(-0.012, 0.012),             // gentle sideways drift
      r: rand(0.24, 0.55),
      phase: rand(0, Math.PI * 2),
      op: rand(0.07, 0.14),
    };
  }

  function makeParticle(seed) {
    return {
      x: rand(0, viewW || window.innerWidth),
      y: seed ? rand(0, viewH || window.innerHeight) : -10,
      vy: rand(4, 16),                 // slow downward/float drift (px/sec-ish)
      vx: rand(-6, 6),
      r: rand(0.7, 2.6),
      op: rand(0.18, 0.5),
      phase: rand(0, Math.PI * 2),
    };
  }

  // ---- Audio (microphone) --------------------------------------------
  async function enableMic() {
    if (micActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      audioAnalyser = ctx.createAnalyser();
      audioAnalyser.fftSize = 512;
      audioAnalyser.smoothingTimeConstant = 0.82;
      audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
      src.connect(audioAnalyser);
      micActive = true;
      const btn = document.getElementById('micBtn');
      btn.textContent = 'Microphone On';
      btn.classList.add('active');
    } catch (err) {
      const btn = document.getElementById('micBtn');
      btn.textContent = 'Mic Denied';
      console.warn('Microphone unavailable:', err);
    }
  }

  function readAudio() {
    if (!micActive || !audioAnalyser) { audioLevel = lerp(audioLevel, 0, 0.05); return; }
    audioAnalyser.getByteFrequencyData(audioData);
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) sum += audioData[i];
    const avg = sum / audioData.length / 255;          // 0..1 loudness
    audioLevel = lerp(audioLevel, avg, 0.2);
  }

  // ---- Ambient soundscape — meditation bed (synthesized, no audio files) ---
  /*
    A calm meditation bed built entirely with the Web Audio API:
      • a warm, slowly-swelling drone pad (a soft sustained chord)
      • singing-bowl tones: soft, inharmonic bell strikes with long decay
      • a barely-there breath of filtered air that tracks the on-screen flow
      • occasional, sparse, soft birdsong
    Must be started by a user gesture (the Ambient Sound button).
  */
  const BOWL_SCALE = [261.63, 293.66, 329.63, 392.0, 440.0];   // C major pentatonic
  function startSound() {
    const AC = window.AudioContext || window.webkitAudioContext;
    soundCtx = new AC();

    const master = soundCtx.createGain();
    master.gain.value = 0.0001;
    master.connect(soundCtx.destination);

    // --- Soft breath of air: white noise, band-limited and quiet ---
    // High-pass removes the low rumble that made it feel ominous; the lowpass
    // keeps it gentle and airy rather than hissy.
    const len = 2 * soundCtx.sampleRate;
    const buf = soundCtx.createBuffer(1, len, soundCtx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const noise = soundCtx.createBufferSource();
    noise.buffer = buf; noise.loop = true;

    const hp = soundCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 240;     // strip the scary rumble
    const lp = soundCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 0.35;
    const windGain = soundCtx.createGain(); windGain.gain.value = 0.03;   // barely there
    noise.connect(hp); hp.connect(lp); lp.connect(windGain); windGain.connect(master);

    // very slow LFO on the cutoff — a soft, far-off breeze, no hard gusts
    const lfo = soundCtx.createOscillator(); lfo.frequency.value = 0.04;
    const lfoGain = soundCtx.createGain(); lfoGain.gain.value = 90;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);

    // --- Warm drone pad: a calm chord with a low root for warmth (E3–A3–C#4–E4) ---
    const padGain = soundCtx.createGain(); padGain.gain.value = 0.016;
    const padLp = soundCtx.createBiquadFilter();
    padLp.type = 'lowpass'; padLp.frequency.value = 760;   // round off any edge
    padGain.connect(padLp); padLp.connect(master);
    const freqs = [164.81, 220, 277.18, 329.63];
    const oscs = freqs.map((f) => {
      const o = soundCtx.createOscillator();
      o.type = 'sine'; o.frequency.value = f; o.detune.value = rand(-4, 4);
      o.connect(padGain); o.start();
      return o;
    });
    // very slow swell so the pad breathes in and out
    const swell = soundCtx.createOscillator(); swell.frequency.value = 0.03;
    const swellGain = soundCtx.createGain(); swellGain.gain.value = 0.008;
    swell.connect(swellGain); swellGain.connect(padGain.gain);

    // --- Singing-bowl bus: soft bell tones, low-passed so they stay mellow ---
    const bowlBus = soundCtx.createGain(); bowlBus.gain.value = 0.5;
    const bowlLp = soundCtx.createBiquadFilter();
    bowlLp.type = 'lowpass'; bowlLp.frequency.value = 2400;
    bowlBus.connect(bowlLp); bowlLp.connect(master);

    // --- Birdsong bus: the foreground of the nature bed, clearly present ---
    const birdBus = soundCtx.createGain(); birdBus.gain.value = 1.6;
    const birdLp = soundCtx.createBiquadFilter();
    birdLp.type = 'lowpass'; birdLp.frequency.value = 7800;
    birdBus.connect(birdLp); birdLp.connect(master);

    noise.start(); lfo.start(); swell.start();
    master.gain.setTargetAtTime(0.62, soundCtx.currentTime, 2.4);   // slow, soft fade-in

    soundNodes = { master, windGain, lp, padGain, oscs, bowlBus, birdBus,
                   bowlAt: soundCtx.currentTime + rand(3, 6),
                   birdAt: soundCtx.currentTime + rand(1.5, 4) };
  }

  // A soft singing-bowl strike: inharmonic sine partials with a gentle attack
  // and a long, slow decay — the heart of the meditation bed.
  function triggerBowl() {
    const t = soundCtx.currentTime + 0.02;
    const f = BOWL_SCALE[Math.floor(Math.random() * BOWL_SCALE.length)] * (Math.random() < 0.5 ? 0.5 : 1);
    const partials = [1, 2.76, 5.40];     // classic inharmonic bowl ratios
    const peak = rand(0.03, 0.05);        // soft, a gentle accent under the birds
    const dur = rand(5, 8);
    partials.forEach((mult, idx) => {
      const o = soundCtx.createOscillator();
      o.type = 'sine'; o.frequency.value = f * mult;
      const g = soundCtx.createGain();
      const a = peak * (idx === 0 ? 1 : 0.3 / idx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(soundNodes.bowlBus);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }

  // One little chirp: a sine that sweeps up then settles, with a soft envelope.
  // `dest` lets several chirps share a stereo position so a call sounds like a
  // single bird off to one side.
  function chirp(dest, f0, when, peak, dur) {
    const o = soundCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f0 * rand(1.2, 1.7), when + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * rand(0.82, 1.0), when + dur * 0.8);
    const g = soundCtx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + dur + 0.05);
  }

  // A bird call placed at a random point in the stereo field (so birds feel like
  // they surround you). Three call shapes keep it lively: a quick trill, a
  // two-note coo, and a single warble.
  function triggerBird() {
    const t0 = soundCtx.currentTime + 0.02;
    // stereo position for this whole call
    let dest = soundNodes.birdBus;
    if (soundCtx.createStereoPanner) {
      const pan = soundCtx.createStereoPanner();
      pan.pan.value = rand(-0.85, 0.85);
      pan.connect(soundNodes.birdBus);
      dest = pan;
    }
    const peak = rand(0.09, 0.16);
    const kind = Math.random();
    if (kind < 0.5) {
      // quick trill
      const notes = 3 + Math.floor(Math.random() * 4);
      const base = rand(2200, 3400);
      let when = t0;
      for (let i = 0; i < notes; i++) {
        chirp(dest, base * rand(0.95, 1.18), when, peak, rand(0.1, 0.16));
        when += rand(0.06, 0.12);
      }
    } else if (kind < 0.82) {
      // two-note coo
      const base = rand(1500, 2300);
      chirp(dest, base, t0, peak, 0.24);
      chirp(dest, base * rand(1.08, 1.25), t0 + rand(0.22, 0.32), peak * 0.9, 0.24);
    } else {
      // single warble
      chirp(dest, rand(2000, 3000), t0, peak, rand(0.28, 0.4));
    }
  }

  // Start the soundscape if it's armed-on but hasn't begun yet. Safe to call
  // from any user gesture; does nothing once already started or if turned off.
  function ensureSound() {
    if (!soundOn || soundStarted) return;
    startSound();
    soundStarted = true;
    const btn = document.getElementById('soundBtn');
    if (btn) { btn.textContent = 'Sound On'; btn.classList.add('active'); }
  }

  function toggleSound() {
    const btn = document.getElementById('soundBtn');
    if (!soundOn) {
      soundOn = true;
      if (!soundCtx) startSound();
      else { soundCtx.resume(); soundNodes.master.gain.setTargetAtTime(0.6, soundCtx.currentTime, 1.5); }
      soundStarted = true;
      btn.textContent = 'Sound On'; btn.classList.add('active');
    } else {
      if (soundNodes) soundNodes.master.gain.setTargetAtTime(0.0001, soundCtx.currentTime, 0.8);
      soundOn = false;
      btn.textContent = 'Ambient Sound'; btn.classList.remove('active');
    }
  }

  // Let the sound breathe with the visible air flow each frame — kept subtle
  // and quiet so it stays calm.
  function updateSound() {
    if (!soundOn || !soundNodes) return;
    const t = soundCtx.currentTime;
    soundNodes.windGain.gain.setTargetAtTime(0.025 + breeze * 0.03 + Math.min(0.04, wind * 0.08), t, 0.7);
    soundNodes.lp.frequency.setTargetAtTime(300 + breeze * 100 + wind * 120, t, 0.7);
    // occasional soft singing-bowl tone (a gentle accent, kept sparse)
    if (t >= soundNodes.bowlAt) {
      triggerBowl();
      soundNodes.bowlAt = t + rand(16, 28);
    }
    // frequent, lively birdsong — the foreground of the nature bed
    if (t >= soundNodes.birdAt) {
      triggerBird();
      soundNodes.birdAt = t + rand(1.6, 4);
    }
  }

  // ---- Pointer handling ----------------------------------------------
  function onPointerMove(clientX, clientY) {
    mouse.px = mouse.x; mouse.py = mouse.y;
    mouse.x = clientX;  mouse.y = clientY;
    mouse.inside = true;
    const dx = mouse.x - mouse.px;
    const dy = mouse.y - mouse.py;
    const sp = Math.hypot(dx, dy);
    // Smooth the speed so wind feels weighty, not jittery.
    mouse.speed = lerp(mouse.speed, sp, 0.4);
  }

  window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('touchmove', (e) => {
    if (e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchend', () => { mouse.inside = false; });

  // ---- Update step ----------------------------------------------------
  let lastT = performance.now();

  function update(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);   // clamp big gaps
    lastT = now;
    time += dt;

    readAudio();

    // Decay mouse speed when idle; fold into smoothed wind.
    mouse.speed = lerp(mouse.speed, 0, 0.08);
    const windTarget = (mouse.speed * 0.06 + audioLevel * 0.8) * settings.windStr;
    wind = lerp(wind, windTarget, 0.1);

    // Ever-present air flow, independent of the mouse, so the scene always
    // feels like it's breathing in a light breeze.
    breeze = (0.32 + 0.22 * Math.sin(time * 0.32) + 0.12 * Math.sin(time * 0.71 + 1.3)) * settings.windStr;
    flowX = Math.sin(time * 0.2) * 30 * settings.windStr + breeze * 22;
    updateSound();

    // Dwell grows slowly while the cursor lingers (moving slowly); it drives a
    // growth "front" that spreads outward from the cursor. Moving fast or
    // leaving lets the front recede.
    if (mouse.inside && mouse.speed < 7) dwell = clamp(dwell + dt * 0.13, 0, 1);
    else dwell = clamp(dwell - dt * (mouse.inside ? 0.4 : 1.2), 0, 1);

    // Bloom: flowers open only once the leaves are (nearly) fully grown AND the
    // cursor is resting. Moving to a new area collapses the bloom so the old
    // flowers fade; the leaves then refill at the new spot and, once full, the
    // flowers bloom there. So flowers always follow where you settle.
    const moving = mouse.speed > 6;
    const leavesFull = mouse.inside && !moving && dwell > 0.7;   // flowers start a touch sooner
    bloom = clamp(bloom + (leavesFull ? dt * 0.16 : -dt * (moving ? 1.6 : 0.5)), 0, 1);

    // --- Leaves: the growth radius shrinks while moving, grows while still ---
    // Moving the mouse -> ~160px; resting in place gradually grows it to ~270px
    // (dwell rises while still, falls while moving).
    // Scale the radius to the displayed tree (its short side), falling back to
    // the viewport if the image hasn't loaded yet. Keeps the same proportion at
    // any screen size and updates live on resize.
    const ref = fit.h ? Math.min(fit.w, fit.h) : Math.min(viewW, viewH);
    const fillR = lerp(CONFIG.growthRadiusMoveFrac, CONFIG.growthRadiusStayFrac, dwell) * ref * settings.growthSens;
    const soft = fillR * 0.28;                  // soft fade at the edge of the bloom
    for (const lf of leaves) {
      let target = 0;
      if (mouse.inside) {
        const sx = toScreenX(lf.nx), sy = toScreenY(lf.ny);
        const d = Math.hypot(mouse.x - sx, mouse.y - sy);
        if (d < fillR + soft) {
          // full inside the radius, fading out at the edge
          target = clamp((fillR - d) / soft, 0, 1);
        }
      }
      lf.target = target;

      // Ease toward target — slower when decaying for a graceful retreat.
      const growing = lf.target > lf.growth;
      const ease = growing ? CONFIG.growthEase : CONFIG.decayEase;
      const prev = lf.growth;
      lf.growth = lerp(lf.growth, lf.target, ease);

      // When a near-full leaf is decaying, it may detach and drift down.
      if (!growing && prev > 0.55 && Math.random() < CONFIG.detachChance) {
        spawnFaller(lf);
        lf.growth *= 0.3;   // the anchor itself empties out
      }

      // Flower: opens once this leaf is grown AND the overall bloom has passed
      // this flower's stagger threshold, so blossoms appear progressively.
      if (lf.hasFlower) {
        const ft = (lf.growth > 0.6 && bloom > lf.bloomThresh) ? 1 : 0;
        lf.flower = lerp(lf.flower, ft, ft > lf.flower ? 0.05 : 0.08);
      }
    }

    // --- Falling leaves ---
    for (let i = fallers.length - 1; i >= 0; i--) {
      const f = fallers[i];
      f.life -= dt;
      f.vy += 16 * dt;                          // gravity
      f.x += (f.vx + Math.sin(time * 2 + f.seed) * (8 + wind * 30)) * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt + wind * 0.04;
      f.op = clamp(f.life / f.maxLife, 0, 1) * f.baseOp;
      if (f.life <= 0 || f.y > viewH + 40) fallers.splice(i, 1);
    }

    // --- Particles ---
    const W = viewW, H = viewH;
    for (const p of particles) {
      // dust rides the ambient air flow plus any mouse-driven wind
      p.x += (p.vx + Math.sin(time * 0.5 + p.phase) * 6 + wind * 40 + flowX) * dt;
      p.y += (p.vy + audioLevel * 30) * dt;
      if (p.y > H + 6 || p.x < -14 || p.x > W + 14) {
        Object.assign(p, makeParticle(false));
        p.x = rand(0, W);
      }
    }

    // --- Smoke drift: slowly rises from the bottom and drifts to the side ---
    for (const fg of fogs) {
      fg.y -= fg.vy * (0.6 + breeze) * dt;
      fg.x += (fg.vx + Math.sin(time * 0.2 + fg.phase) * 0.012) * (0.6 + breeze) * dt;
      fg.phase += dt * 0.25;
      if (fg.y < -0.2) Object.assign(fg, makeFog(false));   // respawn at the bottom
      if (fg.x > 1.3) fg.x = -0.3;
      if (fg.x < -0.3) fg.x = 1.3;
    }

    // --- Air-current wisps drift horizontally ---
    for (const ws of wisps) {
      ws.x += ws.dir * ws.spd * (0.4 + breeze) * dt;
      ws.phase += dt * 0.4;
      if (ws.x > 1.5) ws.x = -0.5;
      if (ws.x < -0.5) ws.x = 1.5;
    }

    // --- Butterflies: appear and flutter around the cursor while hovering ---
    const activeBtf = butterfliesV.reduce((n, b) => n + (b.leaving ? 0 : 1), 0);
    if (mouse.inside && activeBtf < CONFIG.butterflies && Math.random() < 0.04) {
      spawnButterfly();
    }
    for (let i = butterfliesV.length - 1; i >= 0; i--) {
      const b = butterfliesV[i];
      let tx, ty;
      if (mouse.inside && !b.leaving) {
        // wander in a slow, bobbing circle around the cursor
        tx = mouse.x + Math.cos(time * b.spd + b.seed) * b.orbitR;
        ty = mouse.y + Math.sin(time * b.spd * 1.3 + b.seed) * b.orbitR * 0.55 - 24
             + Math.sin(time * 2.2 + b.bob) * 8;          // flutter bob
      } else {
        b.leaving = true;                         // hover ended -> drift away up and out
        tx = b.x + b.dir * 500;
        ty = b.y - 260;
      }
      b.vx += (tx - b.x) * 1.3 * dt;
      b.vy += (ty - b.y) * 1.3 * dt;
      const damp = Math.pow(0.88, dt * 60);
      b.vx *= damp; b.vy *= damp;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.wing += dt * b.wingSpd;
      if (b.leaving && (b.x < -120 || b.x > viewW + 120 || b.y < -120)) butterfliesV.splice(i, 1);
    }
  }

  function spawnFaller(lf) {
    // The leaf detaches and drifts down, keeping its sprite, rotating as it falls.
    fallers.push({
      x: toScreenX(lf.nx), y: toScreenY(lf.ny),
      vx: rand(-14, 14), vy: rand(2, 12),
      rot: lf.angle + Math.PI / 2, vr: rand(-2, 2),
      size: lf.size * rand(0.85, 1.05),
      sprite: lf.sprite,
      life: rand(2.4, 4.2), maxLife: 4.2, baseOp: lf.maxOpacity,
      op: lf.maxOpacity, seed: rand(0, 10),
    });
  }

  // ---- Drawing --------------------------------------------------------

  // Tiny parallax offset for a layer, based on cursor distance from center.
  function parallax(px) {
    if (!mouse.inside) return { x: 0, y: 0 };
    const cx = (mouse.x - viewW / 2) / (viewW / 2);   // -1..1
    const cy = (mouse.y - viewH / 2) / (viewH / 2);
    return { x: -cx * px, y: -cy * px };
  }

  function drawBackground() {
    bgCtx.clearRect(0, 0, viewW, viewH);
    if (!img || !img.width) return;

    // The background does NOT react to the mouse — it just plays its own gentle
    // breathing + branch sway. (No parallax here.)
    const breathe = 1 + Math.sin(time * 0.5) * 0.0035;
    const w = fit.w * breathe, h = fit.h * breathe;
    const baseX = fit.x - (w - fit.w) / 2 + Math.sin(time * 0.22) * 2;
    const baseY = fit.y - (h - fit.h) / 2;

    // Branch sway: draw the painting in horizontal strips, each nudged
    // sideways by a travelling sine wave that is strongest at the top and
    // fades to zero at the base — so the canopy sways while the trunk and
    // roots stay anchored, like a real tree breathing in the wind. The
    // amount responds to the ambient breeze and any mouse-driven wind.
    const amp = 3 + breeze * 7;                    // px of sway at the very top (breeze only)
    const STRIPS = 44;
    for (let i = 0; i < STRIPS; i++) {
      const f = i / STRIPS;                        // 0 top .. 1 bottom
      const sy = f * img.height;
      const sh = img.height / STRIPS;
      const dy = baseY + f * h;
      const dh = h / STRIPS + 1;                   // overlap by 1px to hide seams
      const top = 1 - f;                           // 1 at top, 0 at the base
      const sway = Math.sin(time * 0.9 + top * 3.0) * amp * top * top;
      bgCtx.drawImage(img, 0, sy, img.width, sh, baseX + sway, dy, w, dh);
    }
  }

  function drawLeaves() {
    const ctx = leafCtx;
    ctx.clearRect(0, 0, viewW, viewH);
    const p = parallax(CONFIG.parallax.leaf);
    const breath = 0.5 + 0.5 * Math.sin(time * 0.8);       // canopy breathing 0..1
    // Scale leaves/flowers to the displayed tree so coverage looks the same at
    // any window size (sizes are authored relative to a 720px-short-side tree).
    const treeScale = (fit.h ? Math.min(fit.w, fit.h) : Math.min(viewW, viewH)) / 720;
    // Shared motion influences (mouse velocity, audio, ambient wind).
    const motion = breeze * 0.5 + wind * 0.8 + audioLevel * 0.5;
    if (!leafSprites.length) { /* nothing to draw yet */ }

    // Draw one leaf. `back` leaves use the darker sprite, sit a touch smaller and
    // dimmer, and are drawn in the first pass so the brighter front leaves layer
    // over them — giving the canopy front/back depth.
    const drawLeaf = (lf) => {
      if (lf.growth < 0.02) return;
      const g = lf.growth;
      const sx = toScreenX(lf.nx) + p.x;
      const sy = toScreenY(lf.ny) + p.y;
      const spr = (lf.back ? leafSpritesDark : leafSprites)[lf.sprite];
      if (!spr) return;
      const scale = lerp(0.12, 1, g) * (lf.back ? 0.9 : 1);
      const len = lf.size * scale * treeScale;
      const w = len * spr.ar;
      const sway = Math.sin(time * lf.flutterSpd + lf.flutter) * (lf.swayAmt + motion * 0.5);
      const unfurl = (1 - g) * lf.unfurl;
      const pulse = 0.9 + 0.1 * Math.sin(time * 1.2 + lf.flutter) * (0.4 + breath * 0.6);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(lf.angle + Math.PI / 2 + sway + unfurl);   // base on branch, tip outward
      ctx.globalAlpha = lf.maxOpacity * g * pulse * (lf.back ? 0.85 : 1);
      ctx.drawImage(spr.canvas, -w / 2, -len, w, len);
      ctx.restore();
    };

    // Pass 1: back leaves (behind). Pass 2: front leaves (on top).
    for (const lf of leaves) if (lf.back) drawLeaf(lf);
    for (const lf of leaves) if (!lf.back) drawLeaf(lf);

    // Pass 3: flowers — back ones (dimmer) first, then front ones, so the
    // blossoms carry the same front/back depth as the leaves.
    const drawFlower = (lf) => {
      if (lf.flower < 0.02) return;
      const g = lf.growth;
      const len = lf.size * lerp(0.12, 1, g) * treeScale * (lf.back ? 0.9 : 1);
      const sx = toScreenX(lf.nx) + p.x, sy = toScreenY(lf.ny) + p.y;
      const ox = Math.cos(lf.angle), oy = Math.sin(lf.angle);
      const fx = sx + ox * len * lf.foff, fy = sy + oy * len * lf.foff;
      const fr = lf.flowerSize * (0.5 + 0.5 * lf.flower) * treeScale * (lf.back ? 0.88 : 1) *
                 (1 + 0.05 * Math.sin(time * 1.5 + lf.flowerPhase));
      ctx.globalAlpha = lf.flower * (lf.back ? 0.9 : 1);
      ctx.drawImage(lf.back ? flowerSpriteDark : flowerSprite, fx - fr, fy - fr, fr * 2, fr * 2);
    };
    if (flowerSprite) {
      for (const lf of leaves) if (lf.back) drawFlower(lf);
      for (const lf of leaves) if (!lf.back) drawFlower(lf);
    }

    // Detached, falling leaves keep their sprite, rotating and fading as they go.
    for (const f of fallers) {
      const spr = leafSprites[f.sprite] || leafSprites[0];
      if (!spr) break;
      const h = f.size * treeScale, w = h * spr.ar;
      ctx.save();
      ctx.translate(f.x + p.x, f.y + p.y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = f.op;
      ctx.drawImage(spr.canvas, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    partCtx.clearRect(0, 0, viewW, viewH);
    const p = parallax(CONFIG.parallax.particle);
    // Soft grey motes so the drifting dust is visible against pale paper.
    partCtx.fillStyle = 'rgba(108, 112, 102, 1)';
    for (const pt of particles) {
      const tw = 0.6 + 0.4 * Math.sin(time * 2 + pt.phase);  // twinkle
      partCtx.globalAlpha = pt.op * tw;
      partCtx.beginPath();
      partCtx.arc(pt.x + p.x, pt.y + p.y, pt.r, 0, Math.PI * 2);
      partCtx.fill();
    }
    partCtx.globalAlpha = 1;
  }

  function drawFog() {
    fogCtx.clearRect(0, 0, viewW, viewH);
    // Smoke/haze plays as a background animation only — no mouse parallax.

    // Drifting air-current wisps: elongated soft bands moving sideways. Drawn
    // by scaling a unit radial gradient into a wide, short ellipse.
    for (const ws of wisps) {
      const cx = ws.x * viewW;
      const cy = (ws.y + Math.sin(ws.phase) * 0.02) * viewH;
      const a = ws.op * (0.6 + 0.4 * Math.sin(ws.phase));
      fogCtx.save();
      fogCtx.translate(cx, cy);
      fogCtx.scale(ws.w * viewW, ws.h * viewH);
      const g = fogCtx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(196, 202, 205, ${a})`);   // faint cool haze, drifting
      g.addColorStop(1, 'rgba(196, 202, 205, 0)');
      fogCtx.fillStyle = g;
      fogCtx.beginPath();
      fogCtx.arc(0, 0, 1, 0, Math.PI * 2);
      fogCtx.fill();
      fogCtx.restore();
    }

    // Rising smoke clouds: soft grey radial blobs that float up from the bottom,
    // billow (scale pulse), and fade in low / dissipate near the top.
    for (const fg of fogs) {
      const billow = 1 + 0.14 * Math.sin(fg.phase * 0.8);
      const x = fg.x * viewW;
      const y = fg.y * viewH + Math.sin(fg.phase) * 14;
      const r = fg.r * Math.max(viewW, viewH) * billow;
      // soft fade: appears as it rises past the bottom, dissipates toward the top
      const edgeFade = clamp(Math.min((1.15 - fg.y) / 0.3, (fg.y + 0.2) / 0.35), 0, 1);
      const a = fg.op * edgeFade * (0.7 + 0.3 * Math.sin(fg.phase));
      const grad = fogCtx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(172, 174, 171, ${a})`);   // soft grey smoke
      grad.addColorStop(1, 'rgba(172, 174, 171, 0)');
      fogCtx.fillStyle = grad;
      fogCtx.beginPath();
      fogCtx.arc(x, y, r, 0, Math.PI * 2);
      fogCtx.fill();
    }

    // Faint organic energy trace following the cursor.
    if (mouse.inside) {
      const r = 90 + wind * 120 + audioLevel * 60;
      const grad = fogCtx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, r);
      grad.addColorStop(0, 'rgba(150,170,120,0.10)');
      grad.addColorStop(0.5, 'rgba(150,170,120,0.04)');
      grad.addColorStop(1, 'rgba(150,170,120,0)');
      fogCtx.fillStyle = grad;
      fogCtx.beginPath();
      fogCtx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2);
      fogCtx.fill();
    }

    // Butterflies fluttering around the cursor (drawn on top of everything).
    for (const b of butterfliesV) drawButterfly(b);
  }

  // Draw a butterfly. The wings FOLD from the middle (a hinge at the body axis):
  // the left and right halves each squash toward the centre and open back out,
  // so it looks like it's beating its wings to fly. The body stays put.
  function drawButterfly(b) {
    // |sin| closes the wings fully each half-beat (doubles the apparent rate)
    // and the wide 0.06..1 range makes the fold dramatic.
    const fold = 0.06 + 0.94 * Math.abs(Math.sin(b.wing));      // wing openness 0.06..1
    fogCtx.save();
    fogCtx.translate(b.x, b.y);
    fogCtx.rotate(clamp(b.vx * 0.002, -0.4, 0.4));    // bank slightly with horizontal motion

    if (butterflySprite) {
      const sw = butterflySprite.width, sh = butterflySprite.height;
      const w = b.size * 2, h = w * (sh / sw);
      const half = w / 2;
      fogCtx.globalAlpha = 0.92;
      // left wing: source left half, folded toward the centre line (x = 0)
      fogCtx.drawImage(butterflySprite, 0, 0, sw / 2, sh, -half * fold, -h / 2, half * fold, h);
      // right wing: source right half, folded toward the centre line
      fogCtx.drawImage(butterflySprite, sw / 2, 0, sw / 2, sh, 0, -h / 2, half * fold, h);
    } else {
      drawProcButterfly(b.size, fold);
    }
    fogCtx.globalAlpha = 1;
    fogCtx.restore();
  }

  // Fallback butterfly drawn from curves (charcoal, soft) — used until/unless a
  // butterfly.png is provided.
  function drawProcButterfly(size, fold = 1) {
    const ctx = fogCtx;
    const s = size;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * fold, 1);   // fold each wing toward the body axis
      ctx.fillStyle = 'rgba(58, 60, 56, 0.82)';
      // forewing
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.05);
      ctx.bezierCurveTo(s * 0.25, -s * 0.85, s * 1.0, -s * 0.7, s * 0.85, -s * 0.12);
      ctx.bezierCurveTo(s * 0.75, s * 0.05, s * 0.3, s * 0.0, 0, -s * 0.05);
      ctx.fill();
      // hindwing
      ctx.beginPath();
      ctx.moveTo(0, s * 0.02);
      ctx.bezierCurveTo(s * 0.2, s * 0.25, s * 0.75, s * 0.5, s * 0.55, s * 0.8);
      ctx.bezierCurveTo(s * 0.42, s * 0.95, s * 0.08, s * 0.4, 0, s * 0.02);
      ctx.fill();
      ctx.restore();
    }
    // body
    ctx.fillStyle = 'rgba(38, 38, 36, 0.92)';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.05, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // antennae
    ctx.strokeStyle = 'rgba(38, 38, 36, 0.8)';
    ctx.lineWidth = Math.max(0.6, s * 0.02);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.38); ctx.quadraticCurveTo(s * 0.16, -s * 0.62, s * 0.24, -s * 0.64);
    ctx.moveTo(0, -s * 0.38); ctx.quadraticCurveTo(-s * 0.16, -s * 0.62, -s * 0.24, -s * 0.64);
    ctx.stroke();
  }

  // ---- Main loop ------------------------------------------------------
  function frame(now) {
    update(now);
    drawBackground();
    drawLeaves();
    drawParticles();
    drawFog();
    requestAnimationFrame(frame);
  }

  // Toggle browser fullscreen (F key). Resize is handled by the resize listener.
  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    }
  }

  // ---- Controls / UI --------------------------------------------------
  function bindUI() {
    const panel = document.getElementById('panel');
    const toggle = document.getElementById('panel-toggle');
    const showPanel = () => { panel.classList.remove('hidden'); panel.setAttribute('aria-hidden', 'false'); };
    const hidePanel = () => { panel.classList.add('hidden'); panel.setAttribute('aria-hidden', 'true'); };
    const togglePanel = () => panel.classList.contains('hidden') ? showPanel() : hidePanel();

    toggle.addEventListener('click', togglePanel);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') togglePanel();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });

    const bind = (id, key) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => { settings[key] = parseFloat(el.value); });
    };
    bind('growthSens', 'growthSens');
    bind('audioSens',  'audioSens');   // scales perceived loudness below
    bind('windStr',    'windStr');

    // First click on the button starts the (armed-on) sound; later clicks toggle.
    document.getElementById('soundBtn').addEventListener('click', () => {
      if (soundOn && !soundStarted) ensureSound();
      else toggleSound();
    });
    document.getElementById('micBtn').addEventListener('click', enableMic);

    document.getElementById('resetBtn').addEventListener('click', () => {
      for (const lf of leaves) { lf.growth = 0; lf.target = 0; lf.flower = 0; }
      fallers = [];
      dwell = 0; bloom = 0;
    });

    document.getElementById('saveBtn').addEventListener('click', savePNG);
  }

  // Apply audio sensitivity to the smoothed level each read.
  const _readAudio = readAudio;
  readAudio = function () {
    _readAudio();
    audioLevel = clamp(audioLevel * settings.audioSens, 0, 1.5);
  };

  // Flatten all four layers (plus a paper background) into one downloadable PNG.
  function savePNG() {
    const out = document.createElement('canvas');
    out.width = bgCanvas.width;
    out.height = bgCanvas.height;
    const octx = out.getContext('2d');
    octx.fillStyle = getComputedStyle(document.body).backgroundColor || '#f4f1ea';
    octx.fillRect(0, 0, out.width, out.height);
    for (const c of allCanvases) octx.drawImage(c, 0, 0);
    const link = document.createElement('a');
    link.download = 'living-tree.png';
    link.href = out.toDataURL('image/png');
    link.click();
  }

  // ---- Boot -----------------------------------------------------------
  window.addEventListener('resize', () => {
    resize();
    // Particles use viewport coords, so reseed any now off-screen.
    for (const p of particles) { p.x = clamp(p.x, 0, viewW); p.y = clamp(p.y, 0, viewH); }
  });

  resize();
  buildLeafSprites();      // pre-render the leaf silhouette/colour library once
  buildFlowerSprite();     // pre-render the white flower once
  initAmbient();
  bindUI();
  loadImage();
  loadButterfly();
  requestAnimationFrame(frame);

  // Ambient sound is ON by default. Browsers block audio until a user gesture,
  // so reflect the armed state on the button and start the soundscape on the
  // first click/key/tap anywhere (gestures that don't target the sound button,
  // which manages its own start/toggle).
  {
    const sb = document.getElementById('soundBtn');
    if (sb) { sb.textContent = 'Sound On'; sb.classList.add('active'); }
    const starter = (e) => {
      if (e.target && e.target.id === 'soundBtn') return;   // button handles itself
      ensureSound();
      if (soundStarted) {
        window.removeEventListener('pointerdown', starter);
        window.removeEventListener('keydown', starter);
        window.removeEventListener('touchstart', starter);
      }
    };
    window.addEventListener('pointerdown', starter);
    window.addEventListener('keydown', starter);
    window.addEventListener('touchstart', starter);
  }
})();
