/* 3D iPhone-style calculator. DOM + Three.js only; math stays in calculator.js. */
(function () {
  'use strict';

  var PHONE = { w: 2.56, h: 5.22, d: 0.2, r: 0.5 };
  var KEY_DEPTH = 0.112;
  var KEY_TRAVEL = 0.078;
  var PALETTE = {
    fn: { bg: '#a5a5a5', fg: '#1c1c1e', down: '#d4d4d4', side: 0x7c7c81 },
    num: { bg: '#333333', fg: '#ffffff', down: '#737373', side: 0x222224 },
    op: {
      bg: '#ff9f0a', fg: '#ffffff', down: '#fcc88e', side: 0xb56e06,
      on: '#ffffff', onFg: '#ff9f0a', onDown: '#f1e1cc'
    }
  };
  var ROWS = [
    [
      { id: 'clear', label: 'AC', kind: 'fn' },
      { id: 'sign', label: '+/−', kind: 'fn' },
      { id: '%', label: '%', kind: 'fn' },
      { id: '/', label: '÷', kind: 'op' }
    ],
    [
      { id: '7', label: '7', kind: 'num' },
      { id: '8', label: '8', kind: 'num' },
      { id: '9', label: '9', kind: 'num' },
      { id: '*', label: '×', kind: 'op' }
    ],
    [
      { id: '4', label: '4', kind: 'num' },
      { id: '5', label: '5', kind: 'num' },
      { id: '6', label: '6', kind: 'num' },
      { id: '-', label: '−', kind: 'op' }
    ],
    [
      { id: '1', label: '1', kind: 'num' },
      { id: '2', label: '2', kind: 'num' },
      { id: '3', label: '3', kind: 'num' },
      { id: '+', label: '+', kind: 'op' }
    ],
    [
      { id: '0', label: '0', kind: 'num', wide: true },
      { id: '.', label: '.', kind: 'num' },
      { id: '=', label: '=', kind: 'op' }
    ]
  ];
  var KEYMAP = {
    Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear',
    '+': '+', '-': '-', '*': '*', x: '*', X: '*', '/': '/', '.': '.', ',': '.', '%': '%'
  };

  var calc = createCalculator();
  var keys = [];
  var keyById = {};
  var pickables = [];
  var maxAniso = 8;
  var screen = null;
  var deviceRig = null;
  var renderer, scene, camera, clock;
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var targetRotX = 0.28;
  var targetRotY = -0.62;
  var rotX = 0.28;
  var rotY = -0.62;
  var velX = 0;
  var velY = 0;
  var userMoved = false;
  var mouseNX = 0;
  var mouseNY = 0;
  var mouseTilt = false;
  var tiltX = 0;
  var tiltY = 0;
  var pointers = {};
  var hoverKey = null;
  var running = true;
  var hintTimer = 0;

  function showFallback() {
    var el = document.getElementById('fallback');
    if (el) el.hidden = false;
    var hint = document.getElementById('hint');
    if (hint) hint.classList.add('is-gone');
  }

  function roundedRectShape(w, h, r) {
    var x = -w / 2;
    var y = -h / 2;
    var s = new THREE.Shape();
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }

  function centerGeometry(geom) {
    geom.computeBoundingBox();
    var c = geom.boundingBox.getCenter(new THREE.Vector3());
    geom.translate(-c.x, -c.y, -c.z);
    geom.computeBoundingBox();
    return geom;
  }

  function tuneTexture(tex, crisp) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    if (crisp) {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
    }
    tex.needsUpdate = true;
    return tex;
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    function ch(v) { return Math.max(0, Math.min(255, Math.round(v + amt * 255))); }
    return 'rgb(' + ch(r) + ',' + ch(g) + ',' + ch(b) + ')';
  }

  function paintFace(canvas, text, fg, bg, opts) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, shade(bg, 0.07));
    grad.addColorStop(0.42, bg);
    grad.addColorStop(1, shade(bg, -0.06));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    var glow = ctx.createRadialGradient(w * 0.5, h * 0.32, w * 0.04, w * 0.5, h * 0.45, w * 0.62);
    glow.addColorStop(0, 'rgba(255,255,255,0.16)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var size = opts.size;
    var family = opts.weight + ' ' + size + 'px Inter, "Noto Sans", sans-serif';
    ctx.font = family;
    var maxW = opts.maxW || w * 0.82;
    while (ctx.measureText(text).width > maxW && size > 24) {
      size -= 2;
      ctx.font = opts.weight + ' ' + size + 'px Inter, "Noto Sans", sans-serif';
    }
    var x = opts.xFrac != null ? opts.xFrac * w : w / 2;
    ctx.fillText(text, x, h / 2 + size * 0.03);
  }

  function makeCanvasTexture(canvas) {
    var tex = new THREE.CanvasTexture(canvas);
    return tuneTexture(tex, true);
  }

  function labelSize(spec) {
    if (spec.label === '+/−') return 62;
    if (spec.kind === 'op') return 124;
    if (spec.kind === 'fn') return 84;
    if (spec.label === '.') return 130;
    return 116;
  }

  function labelWeight(spec) {
    if (spec.kind === 'fn') return '500';
    if (spec.kind === 'op') return '400';
    return '400';
  }

  function faceCanvases(spec, wide, aspect) {
    var canvasH = 256;
    var canvasW = wide ? Math.max(256, Math.round(256 * (aspect || 2))) : 256;
    var pal = PALETTE[spec.kind];
    var opts = {
      size: labelSize(spec) * (wide ? 1 : 1),
      weight: labelWeight(spec),
      xFrac: wide ? spec.xFrac : null,
      maxW: wide ? canvasW * 0.42 : canvasW * 0.8
    };
    function make(bg, fg) {
      var c = document.createElement('canvas');
      c.width = canvasW;
      c.height = canvasH;
      paintFace(c, spec.label, fg, bg, opts);
      return c;
    }
    var faces = {
      up: make(pal.bg, pal.fg),
      down: make(pal.down, pal.fg)
    };
    if (spec.kind === 'op') {
      faces.active = make(pal.on, pal.onFg);
      faces.activeDown = make(pal.onDown, pal.onFg);
    }
    return { canvases: faces, opts: opts, pal: pal };
  }

  function defaultPose() {
    var portrait = window.innerWidth < window.innerHeight;
    return {
      x: portrait ? 0.24 : 0.36,
      y: portrait ? -0.4 : -0.58
    };
  }

  function applyPose(pose, immediate) {
    targetRotX = pose.x;
    targetRotY = pose.y;
    if (immediate) {
      rotX = pose.x;
      rotY = pose.y;
    }
  }

  function makeEnv() {
    var c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#3c4150');
    g.addColorStop(0.38, '#16181e');
    g.addColorStop(0.62, '#0c0d12');
    g.addColorStop(1, '#07080a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);
    function blob(x, y, r, inner) {
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, inner);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, 1024, 512);
    }
    blob(240, 30, 260, 'rgba(255,248,236,0.95)');
    blob(820, 90, 220, 'rgba(150,176,255,0.42)');
    blob(480, 430, 280, 'rgba(255,150,60,0.07)');
    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildLights() {
    scene.add(new THREE.HemisphereLight(0xc5cad6, 0x1a1b20, 0.42));
    var key = new THREE.DirectionalLight(0xfff6ea, 2.7);
    key.position.set(-3.4, 7.2, 4.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 24;
    var s = 5.2;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    scene.add(key.target);

    var fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(2.4, 1.4, 6.2);
    scene.add(fill);

    var rim = new THREE.DirectionalLight(0x9eb6ff, 1.15);
    rim.position.set(5.2, 3.2, -4.2);
    scene.add(rim);

    var warm = new THREE.DirectionalLight(0xffb27a, 0.28);
    warm.position.set(-5, 0.4, -2);
    scene.add(warm);
  }

  var mirrorState = null;

  function syncNode(src, dst) {
    dst.position.copy(src.position);
    dst.quaternion.copy(src.quaternion);
    dst.scale.copy(src.scale);
    var n = Math.min(src.children.length, dst.children.length);
    for (var i = 0; i < n; i++) syncNode(src.children[i], dst.children[i]);
    if (src.isMesh && dst.isMesh && src.material && dst.material && src.material.map !== dst.material.map) {
      dst.material.map = src.material.map;
    }
  }

  function syncMirror() {
    if (!mirrorState) return;
    var src = deviceRig;
    var dst = mirrorState.root;
    dst.quaternion.copy(src.quaternion);
    dst.scale.copy(src.scale);
    dst.position.copy(src.position);
    dst.position.y = src.position.y - mirrorState.floorY;
    var n = Math.min(src.children.length, dst.children.length);
    for (var i = 0; i < n; i++) syncNode(src.children[i], dst.children[i]);
  }

  function buildFloor(floorY) {
    var pivot = new THREE.Group();
    pivot.position.y = floorY;
    pivot.scale.y = -1;
    var mirror = deviceRig.clone(true);
    pivot.add(mirror);
    mirror.traverse(function (obj) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
      if (!obj.isMesh || !obj.material) return;
      var src = obj.material;
      obj.material = new THREE.MeshBasicMaterial({
        map: src.map || null,
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        transparent: true,
        opacity: src.map ? 0.72 : 0.34,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });
    });
    scene.add(pivot);
    mirrorState = { root: mirror, floorY: floorY };
    syncMirror();

    var fadeCanvas = document.createElement('canvas');
    fadeCanvas.width = 512;
    fadeCanvas.height = 512;
    var fctx = fadeCanvas.getContext('2d');
    var fade = fctx.createRadialGradient(256, 256, 30, 256, 256, 230);
    fade.addColorStop(0, 'rgba(8,9,12,0)');
    fade.addColorStop(0.34, 'rgba(8,9,12,0)');
    fade.addColorStop(0.62, 'rgba(8,9,12,0.72)');
    fade.addColorStop(0.84, 'rgba(8,9,12,1)');
    fade.addColorStop(1, 'rgba(8,9,12,1)');
    fctx.fillStyle = fade;
    fctx.fillRect(0, 0, 512, 512);
    var fadeTex = new THREE.CanvasTexture(fadeCanvas);
    var fadePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 22),
      new THREE.MeshBasicMaterial({ map: fadeTex, transparent: true, depthWrite: false, toneMapped: false })
    );
    fadePlane.rotation.x = -Math.PI / 2;
    fadePlane.position.y = floorY + 0.02;
    fadePlane.renderOrder = 2;
    scene.add(fadePlane);

    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.45 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = floorY + 0.03;
    shadow.receiveShadow = true;
    shadow.renderOrder = 3;
    scene.add(shadow);

    var blobCanvas = document.createElement('canvas');
    blobCanvas.width = 256;
    blobCanvas.height = 256;
    var bctx = blobCanvas.getContext('2d');
    var rg = bctx.createRadialGradient(128, 128, 16, 128, 128, 128);
    rg.addColorStop(0, 'rgba(0,0,0,0.5)');
    rg.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    bctx.fillStyle = rg;
    bctx.fillRect(0, 0, 256, 256);
    var blob = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), transparent: true, depthWrite: false, toneMapped: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = floorY + 0.04;
    blob.scale.set(1.15, 0.7, 1);
    blob.renderOrder = 4;
    scene.add(blob);
  }

  function addSideButtons(parent, halfW, halfH) {
    var mat = new THREE.MeshPhysicalMaterial({
      color: 0x2c2e36,
      metalness: 0.88,
      roughness: 0.24,
      clearcoat: 0.45,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.1
    });
    function pill(sign, y, length) {
      var radius = 0.048;
      var geom = new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, 12);
      geom.scale(0.72, 1, 0.82);
      var mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(sign * (halfW + 0.018), y, 0.01);
      mesh.castShadow = true;
      parent.add(mesh);
    }
    pill(-1, halfH * 0.48, 0.18);
    pill(-1, halfH * 0.27, 0.42);
    pill(-1, halfH * 0.05, 0.42);
    pill(1, halfH * 0.32, 0.7);
  }

  function addBackCamera(parent, backZ, halfW, halfH) {
    var iw = halfW * 0.86;
    var ih = halfW * 0.86;
    var depth = 0.07;
    var geom = new THREE.ExtrudeGeometry(roundedRectShape(iw, ih, iw * 0.22), {
      depth: depth,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 10
    });
    geom.computeBoundingBox();
    geom.translate(0, 0, -geom.boundingBox.max.z);
    var island = new THREE.Mesh(geom, new THREE.MeshPhysicalMaterial({
      color: 0x101114,
      metalness: 0.62,
      roughness: 0.32,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.9
    }));
    island.position.set(halfW * 0.36, halfH * 0.5, backZ - 0.004);
    island.castShadow = true;
    parent.add(island);

    var ringMat = new THREE.MeshStandardMaterial({ color: 0x3a3c44, metalness: 0.92, roughness: 0.22 });
    var glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x07111c,
      metalness: 0.15,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.6
    });
    function lens(x, y) {
      var group = new THREE.Group();
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 12, 28), ringMat);
      var glass = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), glassMat);
      glass.position.z = -0.02;
      var spec = new THREE.Mesh(
        new THREE.CircleGeometry(0.022, 14),
        new THREE.MeshBasicMaterial({ color: 0xe7eeff, toneMapped: false })
      );
      spec.position.set(-0.034, 0.032, -0.024);
      group.add(ring, glass, spec);
      glass.rotation.y = Math.PI;
      spec.rotation.y = Math.PI;
      group.position.set(x, y, -depth - 0.012);
      island.add(group);
    }
    lens(-iw * 0.18, ih * 0.16);
    lens(iw * 0.18, -ih * 0.16);
    var flash = new THREE.Mesh(
      new THREE.CircleGeometry(0.038, 18),
      new THREE.MeshStandardMaterial({
        color: 0xfff6d8,
        emissive: 0xffe2a4,
        emissiveIntensity: 0.65,
        roughness: 0.35
      })
    );
    flash.rotation.y = Math.PI;
    flash.position.set(iw * 0.24, ih * 0.3, -depth - 0.02);
    island.add(flash);
    var mic = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.4, roughness: 0.45 })
    );
    mic.rotation.y = Math.PI;
    mic.position.set(-iw * 0.24, -ih * 0.3, -depth - 0.02);
    island.add(mic);
  }

  function buildDevice() {
    var bevelSize = 0.036;
    var bodyGeom = new THREE.ExtrudeGeometry(
      roundedRectShape(PHONE.w - bevelSize * 2, PHONE.h - bevelSize * 2, PHONE.r - bevelSize),
      {
        depth: PHONE.d,
        bevelEnabled: true,
        bevelThickness: 0.022,
        bevelSize: bevelSize,
        bevelSegments: 6,
        curveSegments: 26
      }
    );
    centerGeometry(bodyGeom);
    var bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a2d36,
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.15
    });
    var body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;

    var bb = bodyGeom.boundingBox;
    var halfW = Math.max(Math.abs(bb.max.x), Math.abs(bb.min.x));
    var halfH = Math.max(Math.abs(bb.max.y), Math.abs(bb.min.y));
    var frontZ = bb.max.z;
    var backZ = bb.min.z;

    var bezel = 0.055;
    var glassW = halfW * 2 - bezel * 2;
    var glassH = halfH * 2 - bezel * 2;
    var glassGeom = new THREE.ShapeGeometry(roundedRectShape(glassW, glassH, Math.max(0.08, PHONE.r - bezel - 0.02)), 24);
    var glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x050506,
      metalness: 0.2,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.65
    });
    var glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.z = frontZ + 0.004;
    var backGlass = new THREE.Mesh(glassGeom, glassMat);
    backGlass.position.z = backZ - 0.004;
    backGlass.rotation.y = Math.PI;

    deviceRig = new THREE.Group();
    deviceRig.add(body, glass, backGlass);
    addSideButtons(deviceRig, halfW, halfH);
    addBackCamera(deviceRig, backZ, halfW, halfH);

    var canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.max(2, Math.round(1024 * (glassH / glassW)));
    var tex = makeCanvasTexture(canvas);
    var display = new THREE.Mesh(
      new THREE.PlaneGeometry(glassW, glassH),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
    );
    display.position.z = frontZ + 0.01;
    deviceRig.add(display);

    var sheenCanvas = document.createElement('canvas');
    sheenCanvas.width = 512;
    sheenCanvas.height = 512;
    var sctx = sheenCanvas.getContext('2d');
    var sg = sctx.createLinearGradient(0, 0, 420, 512);
    sg.addColorStop(0, 'rgba(255,255,255,0.20)');
    sg.addColorStop(0.28, 'rgba(255,255,255,0.05)');
    sg.addColorStop(0.62, 'rgba(255,255,255,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 512, 512);
    sctx.save();
    sctx.translate(40, 30);
    sctx.rotate(-0.55);
    var streak = sctx.createLinearGradient(0, 0, 0, 54);
    streak.addColorStop(0, 'rgba(255,255,255,0)');
    streak.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    streak.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = streak;
    sctx.fillRect(0, 0, 360, 54);
    sctx.restore();
    var sheenTex = makeCanvasTexture(sheenCanvas);
    var sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(glassW * 0.92, glassH * 0.22),
      new THREE.MeshBasicMaterial({
        map: sheenTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    sheen.position.set(0, halfH * 0.68, frontZ + 0.008);
    deviceRig.add(sheen);

    var islandW = glassW * 0.31;
    var islandH = glassH * 0.038;
    var islandGeom = new THREE.ExtrudeGeometry(roundedRectShape(islandW, islandH, islandH / 2), {
      depth: 0.028,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 12
    });
    islandGeom.computeBoundingBox();
    islandGeom.translate(0, 0, -islandGeom.boundingBox.min.z);
    var island = new THREE.Mesh(islandGeom, new THREE.MeshPhysicalMaterial({
      color: 0x010101,
      metalness: 0.15,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.12
    }));
    var islandY = halfH - glassH * 0.075;
    island.position.set(0, islandY, frontZ + 0.012);
    deviceRig.add(island);

    var marginX = halfW * 0.085;
    var inner = halfW * 2 - marginX * 2;
    var key = inner / (4 + 0.17 * 3);
    var gap = key * 0.17;
    var homeY = -halfH + Math.min(0.2, halfH * 0.07);
    var keysBottom = homeY + key * 0.42;
    var rowStep = key + gap;
    var row0 = keysBottom + key / 2;

    var barGeom = new THREE.CapsuleGeometry(0.016, 0.92, 4, 10);
    barGeom.rotateZ(Math.PI / 2);
    var bar = new THREE.Mesh(barGeom, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    bar.position.set(0, homeY, frontZ + 0.012);
    deviceRig.add(bar);

    var socketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    var shadowGeo = new THREE.CircleGeometry(key * 0.54, 32);

    function columnX(col) {
      return -halfW + marginX + key / 2 + col * rowStep;
    }

    ROWS.forEach(function (row, rowFromTop) {
      var rowIndex = 4 - rowFromTop;
      var y = row0 + rowIndex * rowStep;
      var col = 0;
      row.forEach(function (spec) {
        var wide = !!spec.wide;
        var span = wide ? 2 : 1;
        var w = wide ? key * 2 + gap : key;
        var x = wide ? (columnX(col) + columnX(col + 1)) / 2 : columnX(col);
        spec.xFrac = wide ? (key / 2) / w : null;
        var built = faceCanvases(spec, wide, wide ? w / key : 1);
        var textures = {};
        Object.keys(built.canvases).forEach(function (name) {
          textures[name] = makeCanvasTexture(built.canvases[name]);
        });
        var topMat = new THREE.MeshPhysicalMaterial({
          map: textures.up,
          color: 0xffffff,
          roughness: 0.4,
          metalness: 0.02,
          clearcoat: 0.42,
          clearcoatRoughness: 0.32,
          envMapIntensity: 0.35
        });
        var sideMat = new THREE.MeshStandardMaterial({
          color: PALETTE[spec.kind].side,
          roughness: 0.62,
          metalness: 0.08
        });
        var group = new THREE.Group();
        var restZ = frontZ + 0.016;
        if (wide) {
          var bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(w, key, key / 2), {
            depth: KEY_DEPTH,
            bevelEnabled: true,
            bevelThickness: 0.01,
            bevelSize: 0.008,
            bevelSegments: 2,
            curveSegments: 16
          });
          bodyGeo.computeBoundingBox();
          bodyGeo.translate(0, 0, -bodyGeo.boundingBox.min.z);
          bodyGeo.computeBoundingBox();
          var shell = new THREE.Mesh(bodyGeo, sideMat);
          var cap = new THREE.ShapeGeometry(roundedRectShape(w * 0.985, key * 0.985, key / 2), 16);
          var pos = cap.attributes.position;
          var uvs = new Float32Array(pos.count * 2);
          for (var i = 0; i < pos.count; i++) {
            uvs[i * 2] = pos.getX(i) / w + 0.5;
            uvs[i * 2 + 1] = pos.getY(i) / key + 0.5;
          }
          cap.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          var capMesh = new THREE.Mesh(cap, topMat);
          capMesh.position.z = bodyGeo.boundingBox.max.z + 0.003;
          group.add(shell, capMesh);
          pickables.push(shell, capMesh);
          var bezelMesh = new THREE.Mesh(
            new THREE.ShapeGeometry(roundedRectShape(w + 0.03, key + 0.03, key / 2 + 0.015)),
            socketMat
          );
          bezelMesh.position.set(x, y, frontZ + 0.008);
          deviceRig.add(bezelMesh);
        } else {
          var radius = key / 2;
          var sideGeo = new THREE.CylinderGeometry(radius, radius * 0.975, KEY_DEPTH, 40, 1, true);
          sideGeo.rotateX(Math.PI / 2);
          sideGeo.translate(0, 0, KEY_DEPTH / 2);
          var topGeo = new THREE.CircleGeometry(radius * 0.998, 40);
          topGeo.translate(0, 0, KEY_DEPTH);
          var sideMesh = new THREE.Mesh(sideGeo, sideMat);
          var topMesh = new THREE.Mesh(topGeo, topMat);
          group.add(sideMesh, topMesh);
          pickables.push(sideMesh, topMesh);
          var socket = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 1.045, 36), socketMat);
          socket.position.set(x, y, frontZ + 0.008);
          deviceRig.add(socket);
        }

        var shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          toneMapped: false
        }));
        shadow.position.set(x, y, frontZ + 0.009);
        shadow.renderOrder = 2;
        var shadowBaseX = wide ? (w / key) * 0.98 : 1;
        shadow.scale.set(shadowBaseX, 1, 1);
        deviceRig.add(shadow);

        group.position.set(x, y, restZ);
        deviceRig.add(group);
        var button = {
          id: spec.id,
          kind: spec.kind,
          label: spec.label,
          x: x,
          y: y,
          group: group,
          restZ: restZ,
          topMat: topMat,
          textures: textures,
          canvases: built.canvases,
          paintOpts: built.opts,
          pal: built.pal,
          shadow: shadow,
          shadowBaseX: shadowBaseX,
          down: false,
          hover: false,
          active: false,
          press: 0
        };
        button.paintFaces = function (label) {
          var text = label || button.label;
          button.label = text;
          paintFace(button.canvases.up, text, button.pal.fg, button.pal.bg, button.paintOpts);
          paintFace(button.canvases.down, text, button.pal.fg, button.pal.down, button.paintOpts);
          if (button.canvases.active) {
            paintFace(button.canvases.active, text, button.pal.onFg, button.pal.on, button.paintOpts);
            paintFace(button.canvases.activeDown, text, button.pal.onFg, button.pal.onDown, button.paintOpts);
          }
          Object.keys(button.textures).forEach(function (name) {
            button.textures[name].needsUpdate = true;
          });
        };
        button.currentTexture = function () {
          if (button.active && button.down) return button.textures.activeDown;
          if (button.active) return button.textures.active;
          if (button.down) return button.textures.down;
          return button.textures.up;
        };
        pickables.forEach(function (mesh) {
          if (mesh.parent === group) mesh.userData.keyId = spec.id;
        });
        keys.push(button);
        keyById[spec.id] = button;
        col += span;
      });
    });

    screen = {
      canvas: canvas,
      ctx: canvas.getContext('2d'),
      tex: tex,
      w: glassW,
      h: glassH,
      halfW: halfW,
      halfH: halfH,
      islandY: islandY,
      islandW: islandW,
      keysTop: row0 + 4 * rowStep + key / 2
    };
    scene.add(deviceRig);
    return { halfH: halfH };
  }

  function worldToPx(x, y) {
    var u = x / screen.w + 0.5;
    var v = y / screen.h + 0.5;
    return {
      x: u * screen.canvas.width,
      y: (1 - v) * screen.canvas.height
    };
  }

  function clockString() {
    var d = new Date();
    return (d.getHours() % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function drawScreen() {
    if (!screen) return;
    var ctx = screen.ctx;
    var w = screen.canvas.width;
    var h = screen.canvas.height;
    ctx.clearRect(0, 0, w, h);
    var timePt = worldToPx(-screen.halfW + 0.2, screen.islandY);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 ' + Math.round(h * 0.028) + 'px Inter, "Noto Sans", sans-serif';
    ctx.fillText(clockString(), Math.max(28, timePt.x), timePt.y);

    var iconY = timePt.y;
    var right = worldToPx(screen.halfW - 0.2, screen.islandY).x;
    drawStatusIcons(ctx, right, iconY, h * 0.022);

    var text = calc.display().replace(/^-/, '\u2212');
    var base = worldToPx(screen.halfW - 0.16, screen.keysTop + 0.1);
    var leftLimit = worldToPx(-screen.halfW + 0.16, 0).x;
    var maxWidth = base.x - leftLimit;
    var size = Math.round(h * 0.145);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = '400 ' + size + 'px Inter, "Noto Sans", sans-serif';
    while (ctx.measureText(text).width > maxWidth && size > 28) {
      size -= 4;
      ctx.font = '400 ' + size + 'px Inter, "Noto Sans", sans-serif';
    }
    var maxTop = worldToPx(0, screen.islandY).y + h * 0.06;
    if (base.y - size < maxTop) {
      size = Math.max(28, base.y - maxTop);
      ctx.font = '400 ' + size + 'px Inter, "Noto Sans", sans-serif';
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, base.x, base.y);
    screen.tex.needsUpdate = true;
    var live = document.getElementById('live');
    if (live && live.textContent !== text) live.textContent = text;
  }

  function drawStatusIcons(ctx, right, y, s) {
    ctx.save();
    ctx.translate(right, y);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    var x = -s * 6.4;
    ctx.globalAlpha = 1;
    for (var i = 0; i < 4; i++) {
      var bh = s * (0.35 + i * 0.22);
      ctx.globalAlpha = i === 3 ? 0.35 : 1;
      roundFill(ctx, x + i * s * 0.42, -bh / 2, s * 0.26, bh, s * 0.08);
    }
    ctx.globalAlpha = 1;
    var wx = -s * 3.5;
    ctx.beginPath();
    ctx.arc(wx, 0, s * 0.72, Math.PI * 1.15, Math.PI * 1.85, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, s * 0.15, s * 0.4, Math.PI * 1.2, Math.PI * 1.8, false);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, s * 0.28, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    var bx = -s * 1.55;
    ctx.lineWidth = Math.max(1.25, s * 0.09);
    ctx.strokeRect(bx, -s * 0.42, s * 1.35, s * 0.84);
    ctx.fillRect(bx + s * 0.12, -s * 0.28, s * 0.95, s * 0.56);
    ctx.beginPath();
    ctx.moveTo(bx + s * 1.4, -s * 0.16);
    ctx.lineTo(bx + s * 1.58, 0);
    ctx.lineTo(bx + s * 1.4, s * 0.16);
    ctx.fill();
    ctx.restore();
  }

  function roundFill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function syncFromCalc() {
    var label = calc.clearLabel();
    var clearKey = keyById.clear;
    if (clearKey && clearKey.label !== label) {
      clearKey.paintFaces(label);
    }
    var active = calc.activeOp();
    keys.forEach(function (b) {
      b.active = b.kind === 'op' && b.id === active;
    });
    drawScreen();
  }

  function pressKey(id, fromPointer) {
    calc.press(id);
    syncFromCalc();
    if (!fromPointer && keyById[id]) flashKey(keyById[id]);
    dismissHint();
  }

  function flashKey(button) {
    button.down = true;
    window.setTimeout(function () { button.down = false; }, 120);
  }

  function dismissHint() {
    var hint = document.getElementById('hint');
    if (hint) hint.classList.add('is-gone');
  }

  function fitCamera() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var aspect = w / Math.max(1, h);
    var portrait = aspect < 0.9;
    var fov = portrait ? 40 : 33;
    camera.fov = fov;
    camera.aspect = aspect;
    var margin = portrait ? 1.04 : 1.08;
    var halfV = PHONE.h * 0.5 + (portrait ? 0.22 : 0.42);
    var distV = (halfV * margin) / Math.tan(THREE.MathUtils.degToRad(fov * 0.5));
    var halfW = PHONE.w * 0.62;
    var distH = halfW / (Math.tan(THREE.MathUtils.degToRad(fov * 0.5)) * aspect);
    var dist = Math.max(distV, distH);
    camera.position.set(0, portrait ? 0.28 : 0.48, dist);
    camera.lookAt(0, portrait ? 0.02 : -0.08, 0);
    camera.updateProjectionMatrix();
    var cap = portrait ? 1.75 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(w, h, true);
    if (!userMoved) applyPose(defaultPose(), false);
  }

  function pickKey(clientX, clientY) {
    var rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (deviceRig) deviceRig.updateMatrixWorld(true);
    var hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length || !hits[0].object.userData.keyId) return null;
    return keyById[hits[0].object.userData.keyId] || null;
  }

  function anyDrag() {
    var id;
    for (id in pointers) {
      if (pointers[id].moved) return true;
    }
    return false;
  }

  function updateCursor() {
    var el = renderer.domElement;
    if (anyDrag()) el.style.cursor = 'grabbing';
    else if (hoverKey) el.style.cursor = 'pointer';
    else el.style.cursor = 'grab';
  }

  function bindInput() {
    var dom = renderer.domElement;
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    dom.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dom.setPointerCapture(e.pointerId);
      var hit = pickKey(e.clientX, e.clientY);
      pointers[e.pointerId] = {
        x: e.clientX,
        y: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        moved: false,
        key: hit || null,
        type: e.pointerType
      };
      if (hit) hit.down = true;
      updateCursor();
    });
    dom.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse') {
        mouseTilt = true;
        mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
      }
      var p = pointers[e.pointerId];
      if (!p) {
        var hit = pickKey(e.clientX, e.clientY);
        if (hoverKey && hoverKey !== hit) hoverKey.hover = false;
        hoverKey = hit || null;
        if (hoverKey) hoverKey.hover = true;
        updateCursor();
        return;
      }
      var dx = e.clientX - p.lx;
      var dy = e.clientY - p.ly;
      p.lx = e.clientX;
      p.ly = e.clientY;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
        p.moved = true;
        userMoved = true;
        if (p.key) {
          p.key.down = false;
          p.key = null;
        }
        dismissHint();
      }
      if (p.moved) {
        var sens = 0.0072;
        targetRotY += dx * sens;
        targetRotX += dy * sens;
        targetRotX = THREE.MathUtils.clamp(targetRotX, -0.95, 1.05);
        velY = THREE.MathUtils.clamp(dx * sens * 0.55, -0.06, 0.06);
        velX = THREE.MathUtils.clamp(dy * sens * 0.55, -0.06, 0.06);
      }
      updateCursor();
    });
    function endPointer(e, cancel) {
      var p = pointers[e.pointerId];
      if (!p) return;
      if (p.key) {
        var tapped = p.key;
        if (!cancel && !p.moved) {
          tapped.down = true;
          pressKey(tapped.id, true);
          window.setTimeout(function () { tapped.down = false; }, 130);
        } else {
          tapped.down = false;
        }
      }
      delete pointers[e.pointerId];
      updateCursor();
    }
    dom.addEventListener('pointerup', function (e) { endPointer(e, false); });
    dom.addEventListener('pointercancel', function (e) { endPointer(e, true); });
    dom.addEventListener('pointerleave', function () {
      mouseTilt = false;
      if (hoverKey) hoverKey.hover = false;
      hoverKey = null;
      updateCursor();
    });
    dom.addEventListener('dblclick', function (e) {
      if (pickKey(e.clientX, e.clientY)) return;
      userMoved = false;
      velX = 0;
      velY = 0;
      applyPose(defaultPose(), false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && e.target.closest && e.target.closest('a, button, input, textarea')) return;
      var k = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key];
      if (!k) return;
      e.preventDefault();
      pressKey(k, false);
    });

    document.addEventListener('touchmove', function (e) {
      if (e.target === dom) e.preventDefault();
    }, { passive: false });

    window.addEventListener('resize', fitCamera);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitCamera);
  }

  function updateKeys(dt) {
    keys.forEach(function (b) {
      var goal = b.down ? 1 : 0;
      b.press = THREE.MathUtils.damp(b.press, goal, b.down ? 26 : 11, dt);
      var lift = b.hover && !b.down ? 0.014 : 0;
      b.group.position.z = b.restZ - b.press * KEY_TRAVEL + lift * (1 - b.press);
      b.group.scale.z = 1 - b.press * 0.2;
      var tex = b.currentTexture();
      if (b.topMat.map !== tex) b.topMat.map = tex;
      if (b.shadow) {
        var k = 1 - b.press;
        b.shadow.position.x = b.x + 0.024 * k;
        b.shadow.position.y = b.y - 0.03 * k;
        var spread = 1 + 0.1 * k;
        b.shadow.scale.set(b.shadowBaseX * spread, spread, 1);
        b.shadow.material.opacity = 0.14 + 0.22 * k;
      }
    });
  }

  function updateMotion(dt) {
    var dragging = anyDrag();
    if (!dragging) {
      targetRotY += velY;
      targetRotX += velX;
      targetRotX = THREE.MathUtils.clamp(targetRotX, -0.95, 1.05);
      var damp = Math.pow(0.86, dt * 60);
      velX *= damp;
      velY *= damp;
    }
    rotX = THREE.MathUtils.damp(rotX, targetRotX, 10, dt);
    rotY = THREE.MathUtils.damp(rotY, targetRotY, 10, dt);
    var wantX = 0;
    var wantY = 0;
    if (mouseTilt && !dragging) {
      wantX = -mouseNY * 0.12;
      wantY = -mouseNX * 0.16;
    }
    tiltX = THREE.MathUtils.damp(tiltX, wantX, 4.5, dt);
    tiltY = THREE.MathUtils.damp(tiltY, wantY, 4.5, dt);
    var t = clock.elapsedTime;
    var calm = reduceMotion ? 0 : (dragging ? 0.3 : 1);
    var bob = Math.sin(t * 1.05) * 0.07 * calm;
    var sway = Math.sin(t * 0.48) * 0.07 * calm;
    var nod = Math.cos(t * 0.62) * 0.035 * calm;
    deviceRig.position.y = bob;
    deviceRig.rotation.x = rotX + tiltX + nod;
    deviceRig.rotation.y = rotY + tiltY + sway;
    deviceRig.rotation.order = 'YXZ';
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, clock.getDelta());
    updateMotion(dt);
    updateKeys(dt);
    syncMirror();
    renderer.render(scene, camera);
    hintTimer += dt;
    if (hintTimer > 6.5) dismissHint();
  }

  function boot() {
    if (!window.THREE || !window.createCalculator) {
      showFallback();
      return;
    }
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!renderer.getContext()) {
      showFallback();
      return;
    }
    renderer.domElement.className = 'view';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80);
    clock = new THREE.Clock();
    var env = makeEnv();
    scene.background = env;
    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(env).texture;
      pmrem.dispose();
    } catch (err) {
      scene.environment = env;
    }
    buildLights();
    var metrics = buildDevice();
    buildFloor(-metrics.halfH - 0.2);
    applyPose(defaultPose(), true);
    fitCamera();
    bindInput();
    syncFromCalc();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        keys.forEach(function (b) { b.paintFaces(b.label); });
        drawScreen();
      });
    }
    window.setInterval(drawScreen, 15000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else if (!running) {
        running = true;
        clock.getDelta();
        requestAnimationFrame(loop);
      }
    });
    window.calculator = {
      press: function (id) { pressKey(id, false); return calc; },
      display: function () { return calc.display(); },
      state: calc
    };
    loop();
  }

  try {
    boot();
  } catch (err) {
    console.error(err);
    showFallback();
  }
})();
