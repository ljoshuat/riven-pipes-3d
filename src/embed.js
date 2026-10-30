/* Riven: 3D pipe linework for the "Our pipe" Zoom stage.
   Replaces the flat line-drawing image with a live Three.js line drawing of the same pipe run.
   - Mirrors the stage's CSS zoom every frame (camera view offset), so it stays crisp at any zoom
     and the blue highlight spots stay aligned.
   - On hover it moves like a 3D model: a slight swing while zooming, and a pointer tilt over the drawing.
   - Falls back to the original image if WebGL or the scripts are unavailable. */
(function () {
  "use strict";
  var CDN = "https://cdn.jsdelivr.net/npm/three@0.147.0/";
  // reflection maps (Poly Haven CC0 HDRIs) ship in this repo's env/ folder, next to this script
  var ME = document.currentScript && document.currentScript.src || "";
  var ASSETS = /\/riven-pipes-3d(\.min)?\.js/.test(ME) ? ME.replace(/[^\/]*$/, "") : "https://cdn.jsdelivr.net/gh/ljoshuat/riven-pipes-3d@main/";
  var ENVS = ["warehouse", "studio", "hall", "city"];
  var DEPS = ["build/three.min.js", "examples/js/lines/LineSegmentsGeometry.js",
              "examples/js/lines/LineMaterial.js", "examples/js/lines/LineSegments2.js"];
  // Defaults. Each can be overridden per element with a data attribute on the zoom frame,
  // e.g. data-pipe-lines="20" (set in Bricks: element > Attributes), or tuned live with ?pipes-tune
  var DEFAULTS = { lines: 20, rings: 1, bolts: 8, smooth: 104, outline: 0.6, detail: 0.7, detailOpacity: 0.6,
                   ringOpacity: 0.55, hidden: 0.32, swing: 2.5, tilt: 2, color: "", highlight: 2.5, highlightColor: "", glow: 0.25, glowSize: 0.6,
                   // stainless mode (data-pipe-mode="stainless", or preview with ?pipes-stainless)
                   mode: "stainless", metalness: 1, roughness: 0.32, reflections: 0.85, exposure: 0.8, steel: "#dfe2e4",
                   xray: 0.44, restLines: 0.62, xrayHidden: 0.38, xraySpeed: 0.6, xrayOnHover: 1,
                   envScene: 0, envRotate: 30, envBlur: 0.03, keyLight: 0.45,
                   // surface finish (like the reference photos): brushed grain along the pipes, turned rings on flanges
                   grain: 0.57, grainSize: 2.6, grainWarmth: 0.5, flangeTurn: 0.47, envSat: 0.2, coat: 0.9, shine: 1 };
  var MCTRL = [
    ["envScene", "Reflections: 0 warehouse, 1 studio, 2 hall, 3 city", 0, 3, 1],
    ["envRotate", "Turn the room (deg)", 0, 360, 5], ["envBlur", "Reflection blur", 0, 0.3, 0.01],
    ["keyLight", "Key light", 0, 3, 0.05], ["envSat", "Reflection colour (0 = neutral grey)", 0, 1, 0.02], ["coat", "Gloss coat", 0, 1, 0.02], ["shine", "Hot highlights (lower = tame the bright streaks)", 0, 1, 0.02],
    ["grain", "Brushed grain (pipes)", 0, 1, 0.01], ["flangeTurn", "Turned rings (flanges)", 0, 1, 0.01],
    ["grainSize", "Grain coarseness", 0.3, 4, 0.05], ["grainWarmth", "Warm satin tint", 0, 1, 0.01],
    ["metalness", "Metalness", 0, 1, 0.02], ["roughness", "Roughness (0 = chrome, up = brushed)", 0, 1, 0.01],
    ["reflections", "Reflections", 0, 3, 0.05], ["exposure", "Brightness", 0.3, 2.5, 0.05],
    ["xray", "X-ray steel opacity", 0, 1, 0.02], ["restLines", "Lines at rest", 0, 1, 0.02],
    ["xrayHidden", "X-ray hidden lines", 0, 1, 0.02], ["xraySpeed", "X-ray fade s", 0.1, 2, 0.05],
    ["xrayOnHover", "X-ray on drawing hover (0/1)", 0, 1, 1]];
  // camera angle per zoom position (0 = rest, 1-3 = hover stops), in degrees
  var CAMCTRL = [];
  [0, 1, 2, 3].forEach(function (n) {
    var nm = n ? "0" + n : "Rest";
    [["Turn", "turn left/right", 40], ["Tilt", "tilt up/down", 30], ["Roll", "level / roll", 30]].forEach(function (a) {
      DEFAULTS["cam" + n + a[0]] = 0;
      CAMCTRL.push(["cam" + n + a[0], nm + " " + a[1] + " (deg)", -a[2], a[2], 0.5]);
    });
  });
  var CTRL = [
    ["lines", "Lines around pipe", 0, 48, 4], ["rings", "Ring spacing (0 = off)", 0, 4, 0.25],
    ["bolts", "Bolts per flange", 4, 12, 2], ["smooth", "Surface smoothness", 24, 160, 8],
    ["outline", "Outline weight px", 0.4, 4, 0.1], ["detail", "Detail weight px", 0.2, 2.5, 0.1],
    ["detailOpacity", "Detail brightness", 0.05, 1, 0.05], ["ringOpacity", "Ring brightness", 0, 1, 0.05],
    ["hidden", "Seen-through lines", 0, 0.6, 0.02], ["swing", "Zoom swing", 0, 3, 0.1], ["tilt", "Pointer tilt", 0, 3, 0.1],
    ["highlight", "Weld highlight px", 0, 8, 0.25], ["glow", "Highlight glow", 0, 1.5, 0.05], ["glowSize", "Glow size", 0.3, 3, 0.1]];
  var REBUILD = { lines: 1, rings: 1, bolts: 1, smooth: 1 };
  // Zoom controls drive the section's existing CSS zoom variables, so the highlight spots stay aligned.
  // [key, label, min, max, step, css variable, unit]
  var ZCTRL = [
    ["restZoom", "Resting zoom", 1, 2.5, 0.05, "--zoom-s", ""],
    ["restX", "Resting focus X", 0, 1, 0.005, "--zoom-x", ""],
    ["restY", "Resting focus Y", 0, 1, 0.005, "--zoom-y", ""],
    ["zoom1", "Zoom 01 amount", 1, 6, 0.05, "--zoom-1-s", ""],
    ["zoom2", "Zoom 02 amount", 1, 6, 0.05, "--zoom-2-s", ""],
    ["zoom3", "Zoom 03 amount", 1, 6, 0.05, "--zoom-3-s", ""],
    ["zoom1X", "Zoom 01 focus X", 0, 1, 0.005, "--zoom-1-x", ""], ["zoom1Y", "Zoom 01 focus Y", 0, 1, 0.005, "--zoom-1-y", ""],
    ["zoom2X", "Zoom 02 focus X", 0, 1, 0.005, "--zoom-2-x", ""], ["zoom2Y", "Zoom 02 focus Y", 0, 1, 0.005, "--zoom-2-y", ""],
    ["zoom3X", "Zoom 03 focus X", 0, 1, 0.005, "--zoom-3-x", ""], ["zoom3Y", "Zoom 03 focus Y", 0, 1, 0.005, "--zoom-3-y", ""],
    ["zoomTime", "Zoom duration s", 0.2, 2.5, 0.05, "--zoom-duration", "s"]];
  // built-in overrides of the section's CSS: 01 now centres on the top elbow it highlights
  var ZOOM_DEFAULTS = { restZoom: 1, restX: 0.585, restY: 0.475, zoom1X: 0.565, zoom1Y: 0.22, zoomTime: 1.75 };
  var attrName = function (k) { return "data-pipe-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }); };
  function readZoom(el) {
    var cs = getComputedStyle(el), Z = { set: {} };
    ZCTRL.forEach(function (c) {
      var a = el.getAttribute(attrName(c[0]));
      if (a !== null && a !== "") { Z[c[0]] = parseFloat(a); Z.set[c[0]] = true; }
      else if (ZOOM_DEFAULTS[c[0]] != null) { Z[c[0]] = ZOOM_DEFAULTS[c[0]]; Z.set[c[0]] = true; }
      else {
        var v = parseFloat(cs.getPropertyValue(c[5]));
        Z[c[0]] = isNaN(v) ? (c[0] === "restZoom" ? 1 : c[0] === "zoomTime" ? 0.9 : 0.5) : v;
      }
    });
    Z.base = Object.assign({}, Z); delete Z.base.set;
    return Z;
  }
  // Lower specificity than the hover rules, so 01/02/03 still take over on hover.
  function applyZoom(Z) {
    var css = ZCTRL.filter(function (c) { return Z.set[c[0]]; }).map(function (c) { return c[5] + ":" + Z[c[0]] + c[6]; }).join(";");
    var st = document.getElementById("pipes3d-zoom-vars");
    if (!st) { st = document.createElement("style"); st.id = "pipes3d-zoom-vars"; document.head.appendChild(st); }
    // The 3D view can show beyond the old image edges, so drop the CSS edge clamp and let every
    // stop centre on its focus point (the image and CSS spots are hidden while 3D runs).
    st.textContent = (css ? ".flow-illustration.zoom[data-pipes3d]{" + css + "}" : "") +
      '.flow-illustration.zoom[data-pipes3d="ready"] .zoom-stage{transform:translate(' +
      "calc(50cqw - var(--zoom-s,1) * var(--zoom-x,.5) * var(--zoom-w))," +
      "calc(50cqh - var(--zoom-s,1) * var(--zoom-y,.5) * var(--zoom-h))) scale(var(--zoom-s,1))}";
  }
  function readLook(el) {
    var L = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach(function (k) {
      var a = el.getAttribute("data-pipe-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }));
      if (a !== null && a !== "") L[k] = /color|mode|steel/i.test(k) ? a : parseFloat(a);
    });
    return L;
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error("load " + src)); };
      document.head.appendChild(s);
    });
  }
  function loadDeps(extra) {
    var list = DEPS.concat(extra || []);
    if (window.THREE && THREE.LineSegments2 && (!extra || (THREE.RoomEnvironment && THREE.RGBELoader))) return Promise.resolve();
    var p = Promise.resolve();
    list.forEach(function (d) {
      p = p.then(function () {
        if (d.indexOf("three.min") >= 0 && window.THREE) return;
        if (d.indexOf("RoomEnvironment") >= 0 && window.THREE && THREE.RoomEnvironment) return;
        if (d.indexOf("RGBELoader") >= 0 && window.THREE && THREE.RGBELoader) return;
        if (d.indexOf("/lines/") >= 0 && window.THREE && THREE.LineSegments2) return;
        return loadScript(CDN + d);
      });
    });
    return p;
  }

  function mount(frame) {
    var stage = frame.querySelector(".zoom-stage");
    var img = stage && stage.querySelector(".zoom-img");
    if (!stage || frame.dataset.pipes3d) return;
    frame.dataset.pipes3d = "loading";
    var LOOK = readLook(frame);
    var q = location.search;
    var STEEL = /[?&]pipes-stainless\b/.test(q) || (LOOK.mode === "stainless" && !/[?&]pipes-lines\b/.test(q));
    var ZOOM = readZoom(frame); applyZoom(ZOOM);
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;";
    stage.style.zIndex = "1";
    frame.insertBefore(canvas, frame.firstChild);

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) { canvas.remove(); frame.dataset.pipes3d = "failed"; return; }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (STEEL) {
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = LOOK.exposure;
    }

    var col = new THREE.Color(LOOK.color || getComputedStyle(frame).color || "#fff");
    var scene = new THREE.Scene();
    var steelMat = null, steelObj = null;
    if (STEEL) {
      var pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      var keyL = new THREE.DirectionalLight(0xffffff, LOOK.keyLight); keyL.position.set(-6, 14, 12); scene.add(keyL);
      // real reflections: an HDR photo of a warehouse (or studio/hall/city) wrapped round the pipe.
      // It goes on an inside-out sphere so it can be turned, then gets pre-blurred for the steel.
      var hdrCache = {}, envKey = "", envSphere = null, envSat = { value: 1 }, envClip = { value: 60 };
      var setEnv = function () {
        var name = ENVS[Math.round(LOOK.envScene)] || ENVS[0];
        var k = name + "|" + LOOK.envRotate + "|" + LOOK.envBlur + "|" + LOOK.envSat + "|" + LOOK.shine;
        if (k === envKey) return; envKey = k;
        (hdrCache[name] = hdrCache[name] || new Promise(function (res, rej) {
          new THREE.RGBELoader().setDataType(THREE.HalfFloatType).load(ASSETS + "env/" + name + ".hdr", res, undefined, rej);
        })).then(function (tex) {
          if (k !== envKey) return;
          if (!envSphere) {
            envSphere = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32),
              new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false }));
            envSphere.material.onBeforeCompile = function (sh) {
              sh.uniforms.uSat = envSat; sh.uniforms.uClip = envClip;
              sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uSat, uClip;")
                .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, uSat);\n" +
                  // soft-limit the brightest parts of the room (lights, windows) so streaks don't blow out
                  "diffuseColor.rgb = diffuseColor.rgb / (1.0 + diffuseColor.rgb / uClip);");
            };
          }
          envSat.value = LOOK.envSat; envClip.value = 0.6 + 60.0 * Math.pow(LOOK.shine, 3);
          envSphere.material.map = tex; envSphere.material.needsUpdate = true;
          envSphere.rotation.y = LOOK.envRotate * Math.PI / 180;
          var es = new THREE.Scene(); es.add(envSphere);
          var old = scene.environment;
          scene.environment = pm.fromScene(es, LOOK.envBlur, 0.1, 100).texture;
          if (old) old.dispose();
          es.remove(envSphere); wake();
        }).catch(function (e) { console.warn("pipes3d env", e); });
      };
      scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x0a0c0e, 0.35));
      steelMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(LOOK.steel), metalness: LOOK.metalness, roughness: LOOK.roughness,
        envMapIntensity: LOOK.reflections, clearcoat: LOOK.coat, clearcoatRoughness: 0.08,
        transparent: true, opacity: 1, depthWrite: true, side: THREE.DoubleSide });
      // brushed / lathe-turned finish: fine streaks that tilt the reflection across the grain,
      // so highlights smear along it like real satin stainless
      var GU = { uGrain: { value: 0 }, uTurn: { value: 0 }, uSize: { value: 1 }, uWarm: { value: 0 } };
      steelMat.onBeforeCompile = function (sh) {
        Object.assign(sh.uniforms, GU);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute vec3 aGrain;\nattribute vec3 aAcross;\nvarying vec3 vGrain;\nvarying vec3 vAcross;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGrain = aGrain;\nvAcross = normalize(normalMatrix * aAcross);");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uGrain, uTurn, uSize, uWarm;\nvarying vec3 vGrain;\nvarying vec3 vAcross;\n" +
            "float gh(float x){ return fract(sin(x * 127.1) * 43758.5453) * 2.0 - 1.0; }\n" +
            "float gn(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(gh(i), gh(i + 1.0), f); }\n" +
            // three octaves of streaks, each fading out once it gets finer than a pixel (no shimmer)
            "float grainAt(float x){ float s = 0.0, a = 0.55, fq = 1.0;\n" +
            "  for (int o = 0; o < 4; o++) { float w = fwidth(x * fq); s += a * gn(x * fq) * clamp(1.6 - w * 1.4, 0.0, 1.0); fq *= 3.7; a *= 0.62; }\n" +
            "  return s; }")
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" +
            "float gAmt = vGrain.z < 0.5 ? uGrain : (vGrain.z < 1.5 ? uTurn : 0.0);\n" +
            "float gx = (vGrain.z < 0.5 ? vGrain.y : vGrain.x) * 90.0 / uSize;\n" +
            "float gv = gAmt > 0.0 ? grainAt(gx) : 0.0;\n" +
            "float gLow = gAmt > 0.0 ? gn(gx * 0.045 + 3.1) : 0.0;\n" +
            "roughnessFactor = clamp(roughnessFactor * (1.0 + gAmt * (0.35 * gv + 0.25 * gLow)), 0.02, 1.0);")
          .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" +
            "normal = normalize(normal + vAcross * (gv * 0.16 + gLow * 0.05) * gAmt * (gl_FrontFacing ? 1.0 : -1.0));")
          .replace("#include <color_fragment>", "#include <color_fragment>\n" +
            "diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.975, 0.94), uWarm);");
      };
    }
    var P = G.PHOTO;
    var camera = new THREE.PerspectiveCamera(P.fov, 3164 / 1988, 0.1, 400);
    var baseEye = new THREE.Vector3().fromArray(P.eye), baseTgt = new THREE.Vector3().fromArray(P.target);

    function lineMat(o, biased) {
      var m = new THREE.LineMaterial(Object.assign({ color: col, transparent: true, depthWrite: false }, o));
      if (biased) {
        m.depthFunc = THREE.LessEqualDepth;
        m.onBeforeCompile = function (sh) {
          var re = /vec4 end = modelViewMatrix \* vec4\( instanceEnd, 1\.0 \);/;
          if (!re.test(sh.vertexShader)) return;
          sh.vertexShader = sh.vertexShader.replace(re, function (mm) {
            return mm + "\n{ float ds = -start.z, de = -end.z;" +
              " start.xyz *= max(0.0, 1.0 - (0.06 + 0.006 * ds) / max(ds, 1e-3));" +
              " end.xyz *= max(0.0, 1.0 - (0.06 + 0.006 * de) / max(de, 1e-3)); }";
          });
        };
        m.customProgramCacheKey = function () { return "riven-pipe-bias"; };
      }
      return m;
    }
    var M = {
      edge: lineMat({ linewidth: 1, opacity: 1 }, true),
      detail: lineMat({ linewidth: 1, opacity: 1 }, true),
      ring: lineMat({ linewidth: 1, opacity: 1 }, true),
      hidden: lineMat({ linewidth: 1, opacity: 1, dashed: true, dashSize: 0.14, gapSize: 0.1 }, false),
      hl: lineMat({ linewidth: 1, opacity: 0 }, true),
      hlLine: lineMat({ linewidth: 1, opacity: 0 }, true),
    };
    // soft outer glow: wider, faint, additive copies of the highlight lines (rings and thin lines)
    var GLOW = [[2.6, 0.30], [5, 0.14], [9, 0.06]];
    M.glowR = GLOW.map(function () { return lineMat({ linewidth: 1, opacity: 0, blending: THREE.AdditiveBlending }, true); });
    M.glowL = GLOW.map(function () { return lineMat({ linewidth: 1, opacity: 0, blending: THREE.AdditiveBlending }, true); });
    var fcs = getComputedStyle(frame);
    M.hlLine.color = M.hl.color = new THREE.Color(LOOK.highlightColor || (fcs.getPropertyValue("--zoom-accent") || fcs.getPropertyValue("--color-blue") || "#1463ff").trim());
    M.glowR.concat(M.glowL).forEach(function (m) { m.color = M.hl.color; });
    if (STEEL) {
      // the steel pass renders in linear space with tone mapping; keep the linework colours exact
      steelMat.color.convertSRGBToLinear();
      [M.edge, M.detail, M.ring, M.hidden, M.hl, M.hlLine].concat(M.glowR, M.glowL).forEach(function (m) {
        m.color = m.color.clone().convertSRGBToLinear(); m.toneMapped = false;
      });
    }
    function applyLook() {
      var pr = renderer.getPixelRatio();
      M.edge.linewidth = LOOK.outline * pr; M.detail.linewidth = LOOK.detail * pr;
      M.ring.linewidth = LOOK.detail * 0.85 * pr; M.hidden.linewidth = Math.max(0.6, LOOK.detail * 0.9 * pr);
      M.detail.opacity = LOOK.detailOpacity; M.ring.opacity = LOOK.ringOpacity; M.hidden.opacity = LOOK.hidden;
      M.hl.linewidth = LOOK.highlight * pr; M.hlLine.linewidth = Math.max(1, LOOK.highlight * 0.5) * pr;
      GLOW.forEach(function (g, i) {
        M.glowR[i].linewidth = M.hl.linewidth * (1 + (g[0] - 1) * LOOK.glowSize);
        M.glowL[i].linewidth = M.hlLine.linewidth * (1 + (g[0] - 1) * LOOK.glowSize);
      });
      if (steelMat) {
        steelMat.metalness = LOOK.metalness; steelMat.roughness = LOOK.roughness;
        steelMat.envMapIntensity = LOOK.reflections; renderer.toneMappingExposure = LOOK.exposure;
        keyL.intensity = LOOK.keyLight * (0.25 + 0.75 * LOOK.shine); setEnv();
        GU.uGrain.value = LOOK.grain; GU.uTurn.value = LOOK.flangeTurn;
        GU.uSize.value = LOOK.grainSize; GU.uWarm.value = LOOK.grainWarmth; steelMat.clearcoat = LOOK.coat;
      }
      applyXray();
    }
    // x-ray: 0 = solid stainless (rest), 1 = steel ghosted with the linework showing through
    var xa = 0;
    function applyXray() {
      var m = STEEL ? LOOK.restLines + (1 - LOOK.restLines) * xa : 1;
      M.edge.opacity = m; M.detail.opacity = LOOK.detailOpacity * m; M.ring.opacity = LOOK.ringOpacity * m;
      M.hidden.opacity = STEEL ? LOOK.xrayHidden * xa : LOOK.hidden;
      if (hidObj) hidObj.visible = M.hidden.opacity > 0.001;
      if (steelMat) { steelMat.opacity = 1 - (1 - LOOK.xray) * xa; steelMat.depthWrite = steelMat.opacity > 0.02; }
    }
    M.hidden.depthFunc = THREE.GreaterDepth;

    function segObj(arr, mat, order) {
      var g = new THREE.LineSegmentsGeometry();
      g.setPositions(arr.length ? arr : [0, 0, 0, 0, 0, 0]);
      var o = new THREE.LineSegments2(g, mat);
      o.renderOrder = order; o.frustumCulled = false;
      if (mat.dashed) o.computeLineDistances();
      return o;
    }

    var occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2 });
    var occ = null, detObj = null, ringObj = null, feature, featureBig, sil, hlObjs = {};
    var edgeObj = null, hidObj = null, lastEye = null;
    function drop(o) { if (o) { scene.remove(o); o.geometry.dispose(); } }
    function build() {
      var model = G.build({ nLines: LOOK.lines, ringGap: LOOK.rings, nBolts: LOOK.bolts, seg: LOOK.smooth, nutDetail: true });
      var mesh = G.meshArrays(model.parts);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(mesh.pos, 3));
      geo.setIndex(mesh.idx);
      drop(occ); drop(detObj); drop(ringObj);
      for (var hk in hlObjs) hlObjs[hk].forEach(drop);
      hlObjs = {};
      Object.keys(model.highlights).forEach(function (n) {
        var h = model.highlights[n], objs = [];
        if (h.rings.length) {
          var ro = segObj(G.polylinesToSegments(h.rings), M.hl, 5); objs.push(ro);
          M.glowR.forEach(function (gm) { var o = new THREE.LineSegments2(ro.geometry, gm); o.renderOrder = 3; o.frustumCulled = false; objs.push(o); });
        }
        if (h.lines.length) {
          var lo = segObj(G.polylinesToSegments(h.lines), M.hlLine, 4); objs.push(lo);
          M.glowL.forEach(function (gm) { var o = new THREE.LineSegments2(lo.geometry, gm); o.renderOrder = 3; o.frustumCulled = false; objs.push(o); });
        }
        objs.forEach(function (o) { o.visible = false; scene.add(o); });
        hlObjs[n] = objs;
      });
      occ = new THREE.Mesh(geo, occMat); occ.renderOrder = 0; scene.add(occ);
      if (STEEL) {
        if (steelObj) { scene.remove(steelObj); steelObj.geometry.dispose(); }
        steelObj = new THREE.Mesh(shadedGeometry(model.parts), steelMat);
        steelObj.renderOrder = 0.5; steelObj.frustumCulled = false; scene.add(steelObj);
      }
      var saddle = G.polylinesToSegments(model.saddles);
      feature = G.featureSegments(model.parts).concat(saddle);
      featureBig = G.featureSegments(model.parts, function (p) { return p.kind !== "bolt"; }).concat(saddle);
      detObj = segObj(G.polylinesToSegments(model.detail), M.detail, 2);
      ringObj = segObj(G.polylinesToSegments(model.rings), M.ring, 2);
      scene.add(detObj, ringObj);
      sil = G.prepSil(model.parts);
      lastEye = null;
    }
    // smooth around each pipe, crisp at flange steps and nut flats (crease angle 35 degrees)
    function shadedGeometry(parts) {
      var pos = [], nor = [], gr = [], ac = [], cosA = Math.cos(35 * Math.PI / 180);
      var sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
      var unit = function (a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      parts.forEach(function (p) {
        var adj = p.pos.map(function () { return []; });
        p.faces.forEach(function (f, fi) { f.v.forEach(function (v) { adj[v].push(fi); }); });
        var kind = p.kind === "pipe" ? 0 : p.kind === "flange" ? 1 : 2;
        p.faces.forEach(function (f) {
          // across-grain direction for this face: around the pipe for brushed pipe,
          // along the profile (radial on faces) for turned flanges
          var across = [0, 0, 0];
          if (f.v.length === 4) across = unit(kind === 0 ? sub(p.pos[f.v[3]], p.pos[f.v[0]]) : sub(p.pos[f.v[1]], p.pos[f.v[0]]));
          var corner = function (v) {
            var n = [0, 0, 0];
            adj[v].forEach(function (fj) {
              var m = p.faces[fj].n;
              if (m[0] * f.n[0] + m[1] * f.n[1] + m[2] * f.n[2] > cosA) { n[0] += m[0]; n[1] += m[1]; n[2] += m[2]; }
            });
            var l = Math.hypot(n[0], n[1], n[2]) || 1;
            pos.push(p.pos[v][0], p.pos[v][1], p.pos[v][2]); nor.push(n[0] / l, n[1] / l, n[2] / l);
            var g = p.grain && p.grain[v] || [0, 0];
            // around-the-pipe coordinate wraps at the seam; use the face's own copy so it stays continuous
            var gy = g[1];
            if (p.grain && f.v.length === 4 && gy < p.grain[f.v[0]][1] - 1e-6) gy += g[2] || 0;
            gr.push(g[0], gy, f.v.length === 4 ? kind : 2); ac.push(across[0], across[1], across[2]);
          };
          var v = f.v, tris = v.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
          tris.forEach(function (t) { corner(v[t[0]]); corner(v[t[1]]); corner(v[t[2]]); });
        });
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("aGrain", new THREE.Float32BufferAttribute(gr, 3));
      g.setAttribute("aAcross", new THREE.Float32BufferAttribute(ac, 3));
      return g;
    }
    build();
    function updateEdges() {
      var e = camera.position;
      if (lastEye && lastEye.distanceToSquared(e) < 1e-6) return;
      lastEye = e.clone();
      var s = G.silFast(sil, [e.x, e.y, e.z]);
      drop(edgeObj); drop(hidObj);
      edgeObj = segObj(feature.concat(s.all), M.edge, 3);
      hidObj = segObj(featureBig.concat(s.big), M.hidden, 1);
      hidObj.visible = LOOK.hidden > 0;
      scene.add(edgeObj, hidObj);
    }

    // ---- follow the CSS zoom: frame pixel = stage transform applied to the stage's photo-sized box ----
    function stageXform() {
      var t = getComputedStyle(stage).transform, s = 1, tx = 0, ty = 0;
      if (t && t !== "none") {
        var m = t.match(/matrix\(([^)]+)\)/);
        if (m) { var v = m[1].split(",").map(parseFloat); s = v[0]; tx = v[4]; ty = v[5]; }
      }
      return { s: s, tx: tx, ty: ty, w: stage.offsetWidth, h: stage.offsetHeight };
    }

    // ---- 3D motion: swing while zooming, tilt toward the pointer over the drawing ----
    var cam = [0, 0, 0], sLag = 1, yaw = 0, pitch = 0, ptr = { x: 0, y: 0, on: false };
    if (fine && !reduce) {
      frame.addEventListener("pointermove", function (ev) {
        var r = frame.getBoundingClientRect();
        ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1; ptr.y = ((ev.clientY - r.top) / r.height) * 2 - 1; ptr.on = true; wake();
      });
      frame.addEventListener("pointerleave", function () { ptr.on = false; wake(); });
    }
    var tmp = new THREE.Vector3(), piv = new THREE.Vector3();
    function placeCamera(X, dt) {
      var k = 1 - Math.exp(-dt * 3.2);
      sLag += (X.s - sLag) * k;
      var swing = reduce ? 0 : Math.max(-1, Math.min(1, (X.s - sLag) / 1.6));
      var tYaw = swing * 0.075 * LOOK.swing + (ptr.on ? ptr.x * 0.05 * LOOK.tilt : 0);
      var tPitch = (ptr.on ? ptr.y * 0.03 * LOOK.tilt : 0) + swing * 0.02 * LOOK.swing;
      var kk = 1 - Math.exp(-dt * 5);
      yaw += (tYaw - yaw) * kk; pitch += (tPitch - pitch) * kk;
      // per-stop camera angle, eased over about the zoom duration
      var st = activeStop(), D2R = Math.PI / 180;
      var cT = [LOOK["cam" + st + "Turn"] * D2R, LOOK["cam" + st + "Tilt"] * D2R, LOOK["cam" + st + "Roll"] * D2R];
      var zd = parseFloat(getComputedStyle(frame).getPropertyValue("--zoom-duration")) || 0.9;
      var kc = reduce ? 1 : 1 - Math.exp(-dt * 4 / zd);
      for (var ci = 0; ci < 3; ci++) cam[ci] += (cT[ci] - cam[ci]) * kc;
      var camMoving = Math.abs(cT[0] - cam[0]) + Math.abs(cT[1] - cam[1]) + Math.abs(cT[2] - cam[2]) > 1e-4;
      var Y = yaw + cam[0], Pt = pitch + cam[1];

      // base pose + exact CSS crop
      camera.position.copy(baseEye); camera.lookAt(baseTgt); camera.up.set(0, 1, 0);
      if (X.w > 0 && X.h > 0 && X.s > 0) {
        camera.setViewOffset(X.w, X.h, -X.tx / X.s, -X.ty / X.s, frame.clientWidth / X.s, frame.clientHeight / X.s);
      }
      camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      if (Math.abs(Y) > 1e-5 || Math.abs(Pt) > 1e-5 || Math.abs(cam[2]) > 1e-5) {
        // orbit about the point at the centre of the current crop, at the photo's focus distance
        tmp.set(0, 0, 0.5).unproject(camera).sub(camera.position).normalize();
        piv.copy(camera.position).addScaledVector(tmp, baseEye.distanceTo(baseTgt));
        var off = camera.position.clone().sub(piv);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), Y);
        var right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        off.applyAxisAngle(right, Pt);
        var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Y)
          .premultiply(new THREE.Quaternion().setFromAxisAngle(right, Pt));
        // roll: spin the view about the line to the crop centre (levels a sloping pipe)
        var fwd = piv.clone().sub(camera.position).normalize();
        off.applyAxisAngle(fwd, -cam[2]);
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(fwd, -cam[2]));
        camera.position.copy(piv).add(off);
        camera.quaternion.premultiply(q);
        camera.updateMatrixWorld();
      }
      return camMoving || Math.abs(X.s - sLag) > 1e-3 || Math.abs(tYaw - yaw) > 1e-4 || Math.abs(tPitch - pitch) > 1e-4;
    }

    var size = { w: 0, h: 0 };
    function resize() {
      var w = frame.clientWidth, h = frame.clientHeight;
      if (w === size.w && h === size.h) return;
      size.w = w; size.h = h;
      renderer.setSize(w, h, false);
      var pr = renderer.getPixelRatio(), res = new THREE.Vector2(w * pr, h * pr);
      for (var k in M) { [].concat(M[k]).forEach(function (m) { m.resolution.copy(res); }); }
      applyLook();
      wake();
    }

    // weld highlight follows the hovered 01/02/03 row, fading in once the zoom has mostly arrived
    var scopeEl = frame.closest(".zoom-scope") || document;
    var hl = { stop: 0, since: 0, a: 0 };
    function activeStop() {
      var sc = scopeEl.getAttribute && scopeEl.getAttribute("data-zoom-stop");
      if (sc !== null && sc !== undefined) return +sc;
      var ts = scopeEl.querySelectorAll(".zoom-trigger");
      for (var i = 0; i < ts.length; i++) if (ts[i].matches(":hover") || ts[i].matches(":focus-within")) return i + 1;
      return +frame.getAttribute("data-pipes3d-preview") || 0;
    }
    function updateHighlight(t) {
      var st = activeStop();
      if (st !== hl.stop) { hl.stop = st; hl.since = t; hl.a = 0; }
      var dur = (parseFloat(getComputedStyle(frame).getPropertyValue("--zoom-duration")) || 0.9) * 1000;
      var target = 0;
      if (hl.stop && hlObjs[hl.stop]) target = reduce ? 1 : Math.max(0, Math.min(1, (t - hl.since - dur * 0.6) / 300));
      hl.a = target;
      for (var n in hlObjs) hlObjs[n].forEach(function (o) { o.visible = +n === hl.stop && hl.a > 0; });
      M.hl.opacity = hl.a; M.hlLine.opacity = hl.a;
      GLOW.forEach(function (g, i) { M.glowR[i].opacity = M.glowL[i].opacity = hl.a * g[1] * LOOK.glow; });
      return hl.stop && hl.a < 1;
    }

    var raf = 0, visible = true, lastT = 0, lastKey = "";
    function frameLoop(t) {
      raf = 0;
      var dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016); lastT = t;
      resize();
      var X = stageXform();
      var moving = placeCamera(X, dt);
      if (updateHighlight(t)) moving = true;
      if (STEEL) {
        var want = (hl.stop || (LOOK.xrayOnHover && ptr.on) || frame.hasAttribute("data-pipes3d-xray")) ? 1 : 0;
        var step = dt / Math.max(0.05, LOOK.xraySpeed);
        var nx = want > xa ? Math.min(want, xa + step) : Math.max(want, xa - step);
        if (reduce) nx = want;
        if (nx !== xa) { xa = nx; applyXray(); moving = true; }
      }
      var key = X.s.toFixed(4) + "," + X.tx.toFixed(2) + "," + X.ty.toFixed(2);
      var cssMoving = key !== lastKey; lastKey = key;
      updateEdges();
      renderer.render(scene, camera);
      if (visible && (moving || cssMoving)) raf = requestAnimationFrame(frameLoop);
      else lastT = 0;
    }
    function wake() { if (!raf && visible) raf = requestAnimationFrame(frameLoop); }
    // the CSS zoom starts on hover/focus anywhere in the section, so listen there
    var scope = frame.closest(".zoom-scope") || frame.parentElement;
    ["pointerover", "pointerout", "focusin", "focusout", "transitionstart", "transitionrun"].forEach(function (ev) {
      scope.addEventListener(ev, wake, true);
    });
    stage.addEventListener("transitionend", wake);
    new ResizeObserver(function () { wake(); }).observe(frame);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) wake(); }).observe(frame);
    }
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault(); visible = false; if (img) img.style.opacity = ""; canvas.style.display = "none";
    });

    applyLook();
    frameLoop(performance.now());
    if (/[?&]pipes-tune\b/.test(location.search)) tunePanel(frame, LOOK, ZOOM, wake, STEEL, function (k) {
      if (REBUILD[k]) { clearTimeout(tunePanel.t); tunePanel.t = setTimeout(function () { build(); wake(); }, 150); }
      applyLook(); lastEye = null; wake();
    });
    if (img) { img.style.transition = "opacity .4s"; img.style.opacity = "0"; }
    // the 3D weld highlight replaces the CSS arc and dot
    if (!document.getElementById("pipes3d-hide-spots")) {
      var hs = document.createElement("style"); hs.id = "pipes3d-hide-spots";
      hs.textContent = '.flow-illustration.zoom[data-pipes3d="ready"] .zoom-spot,.flow-illustration.zoom[data-pipes3d="ready"] .zoom-dot{display:none!important}';
      document.head.appendChild(hs);
    }
    frame.dataset.pipes3d = "ready";
  }

  // Live tuning panel: add ?pipes-tune to the page URL. Copies values as Bricks attributes.
  function tunePanel(frame, LOOK, ZOOM, wake, STEEL, changed) {
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;right:16px;top:16px;bottom:16px;z-index:99999;width:260px;overflow-y:auto;" +
      "overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;" +
      "background:#111;color:#eee;font:12px/1.4 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #333;border-radius:8px";
    // keep wheel/touch scrolling inside the panel (smooth-scroll libraries otherwise take it)
    box.setAttribute("data-lenis-prevent", ""); box.setAttribute("data-scroll-ignore", "");
    ["wheel", "touchmove"].forEach(function (ev) { box.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    var hd = "display:block;margin:10px 0 4px;color:#9fd0e6;text-transform:uppercase;letter-spacing:.08em;font-size:11px";
    var btn = "flex:1;padding:4px 0;background:#222;color:#eee;border:1px solid #444;border-radius:4px;cursor:pointer";
    var html = "<b style='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px'>Pipe linework" +
      "<button type='button' data-min style='" + btn + ";flex:none;padding:2px 8px'>Hide</button></b><div data-body><span style='" + hd + "'>Zoom</span>" +
      "<div style='display:flex;gap:4px;margin-bottom:4px'>Preview:" +
      ["Rest", "01", "02", "03"].map(function (t, i) { return "<button type='button' data-pv='" + i + "' style='" + btn + "'>" + t + "</button>"; }).join("") + "</div>";
    ZCTRL.forEach(function (c) {
      html += "<label style='display:block;margin:6px 0'>" + c[1] + " <span data-zo='" + c[0] + "' style='float:right'>" + ZOOM[c[0]] + "</span>" +
        "<input data-z='" + c[0] + "' type='range' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + ZOOM[c[0]] + "' style='width:100%'></label>";
    });
    if (STEEL) {
      html += "<span style='" + hd + "'>Stainless + x-ray</span>";
      MCTRL.forEach(function (c) {
        html += "<label style='display:block;margin:6px 0'>" + c[1] + " <span data-o='" + c[0] + "' style='float:right'>" + LOOK[c[0]] + "</span>" +
          "<input data-k='" + c[0] + "' type='range' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + LOOK[c[0]] + "' style='width:100%'></label>";
      });
      html += "<label style='display:flex;justify-content:space-between;margin:6px 0'>Hold x-ray on <input data-hold type='checkbox'></label>";
    }
    html += "<span style='" + hd + "'>Camera per zoom position</span><div style='opacity:.7;font-size:11px'>Moving a slider previews that position.</div>";
    CAMCTRL.forEach(function (c) {
      html += "<label style='display:block;margin:6px 0'>" + c[1] + " <span data-o='" + c[0] + "' style='float:right'>" + LOOK[c[0]] + "</span>" +
        "<input data-k='" + c[0] + "' type='range' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + LOOK[c[0]] + "' style='width:100%'></label>";
    });
    html += "<span style='" + hd + "'>Lines</span>";
    CTRL.forEach(function (c) {
      html += "<label style='display:block;margin:6px 0'>" + c[1] + " <span data-o='" + c[0] + "' style='float:right'>" + LOOK[c[0]] + "</span>" +
        "<input data-k='" + c[0] + "' type='range' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + LOOK[c[0]] + "' style='width:100%'></label>";
    });
    html += "<button type='button' data-copy style='margin-top:8px;width:100%;padding:6px;background:#9fd0e6;color:#000;border:0;border-radius:4px'>Copy as Bricks attributes</button>" +
      "<textarea readonly style='margin-top:8px;width:100%;height:110px;background:#000;color:#9fd0e6;border:1px solid #333'></textarea></div>";
    box.innerHTML = html; document.body.appendChild(box);
    var ta = box.querySelector("textarea");
    function dump() {
      var z = ZCTRL.filter(function (c) { return ZOOM.set[c[0]] && ZOOM[c[0]] !== ZOOM_DEFAULTS[c[0]]; }).map(function (c) { return attrName(c[0]) + " = " + ZOOM[c[0]]; });
      var l = Object.keys(DEFAULTS).filter(function (k) { return !/^(color|mode|steel|highlightColor)$/.test(k) && LOOK[k] !== DEFAULTS[k]; }).map(function (k) {
        return attrName(k) + " = " + LOOK[k];
      });
      // stainless: list every steel/reflection/x-ray value (even defaults) so the look is pinned, plus the switch that makes it live
      if (STEEL) {
        var sk = MCTRL.map(function (c) { return c[0]; });
        l = l.filter(function (x) { return !sk.some(function (k) { return x.indexOf(attrName(k) + " ") === 0; }); });
        l = l.concat(["data-pipe-mode = stainless"], sk.map(function (k) { return attrName(k) + " = " + LOOK[k]; }));
      }
      ta.value = z.concat(l).join("\n") || "(all defaults)";
    }
    var preview = 0;
    function showPreview() {
      // force a zoom stop inline so it can be judged without hovering the list
      var keys = ["--zoom-s", "--zoom-x", "--zoom-y"];
      if (preview) frame.setAttribute("data-pipes3d-preview", preview); else frame.removeAttribute("data-pipes3d-preview");
      if (!preview) keys.forEach(function (v) { frame.style.removeProperty(v); });
      else {
        var cs = getComputedStyle(frame);
        frame.style.setProperty("--zoom-s", ZOOM["zoom" + preview]);
        frame.style.setProperty("--zoom-x", cs.getPropertyValue("--zoom-" + preview + "-x"));
        frame.style.setProperty("--zoom-y", cs.getPropertyValue("--zoom-" + preview + "-y"));
      }
      Array.prototype.forEach.call(box.querySelectorAll("[data-pv]"), function (b) {
        b.style.background = +b.getAttribute("data-pv") === preview ? "#9fd0e6" : "#222";
        b.style.color = +b.getAttribute("data-pv") === preview ? "#000" : "#eee";
      });
      wake();
    }
    box.addEventListener("change", function (e) {
      if (!e.target.hasAttribute("data-hold")) return;
      if (e.target.checked) frame.setAttribute("data-pipes3d-xray", ""); else frame.removeAttribute("data-pipes3d-xray");
      wake();
    });
    box.addEventListener("click", function (e) {
      var mn = e.target.closest("[data-min]");
      if (mn) {
        var body = box.querySelector("[data-body]"), hide = body.style.display !== "none";
        body.style.display = hide ? "none" : ""; mn.textContent = hide ? "Show" : "Hide";
        box.style.bottom = hide ? "auto" : "16px"; return;
      }
      var b = e.target.closest("[data-pv]"); if (!b) return;
      preview = +b.getAttribute("data-pv"); showPreview();
    });
    box.addEventListener("input", function (e) {
      var zk = e.target.getAttribute("data-z");
      if (zk) {
        ZOOM[zk] = parseFloat(e.target.value); ZOOM.set[zk] = true;
        box.querySelector("[data-zo='" + zk + "']").textContent = ZOOM[zk];
        applyZoom(ZOOM);
        var mm = zk.match(/^zoom(\d)/); if (mm) preview = +mm[1];
        if (/^rest/.test(zk)) preview = 0;
        showPreview(); dump(); return;
      }
      var k = e.target.getAttribute("data-k"); if (!k) return;
      LOOK[k] = parseFloat(e.target.value); box.querySelector("[data-o='" + k + "']").textContent = LOOK[k];
      var cm = k.match(/^cam(\d)/); if (cm && +cm[1] !== preview) { preview = +cm[1]; showPreview(); }
      dump(); changed(k);
    });
    box.querySelector("[data-copy]").addEventListener("click", function () {
      dump(); ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function () {});
    });
    dump();
  }

  // Touch screens have no hover, and on phones the drawing sits above the 01/02/03 list, so a
  // tapped row would zoom a drawing that is already off screen. There the zoom scope gets
  // data-zoom-scroll (the page's CSS pins the drawing to the top of the screen) and the row
  // scrolled past the middle of the space below the drawing picks the zoom stop.
  var SCROLL_MQ = "(hover: none) and (max-width: 991px)";
  function scrollStops(frame) {
    var scope = frame.closest(".zoom-scope");
    if (!scope || scope.hasAttribute("data-zoom-scroll-init")) return;
    var rows = [].slice.call(scope.querySelectorAll(".zoom-trigger"));
    if (!rows.length) return;
    scope.setAttribute("data-zoom-scroll-init", "");
    // While pinned the drawing is capped to about a third of the screen (full width, the zoom crops
    // top and bottom), and a fading band under it (a transparent border painted with a gradient) lets the rows fade out instead of being cut.
    // The border sits outside the clipped box; the negative margin keeps the layout unchanged.
    // !important beats the page's own sticky rule.
    if (!document.getElementById("pipes3d-scroll-css")) {
      var css = document.createElement("style"); css.id = "pipes3d-scroll-css";
      css.textContent = "@media " + SCROLL_MQ + "{.zoom-scope[data-zoom-scroll]>.flow-illustration.zoom{" +
        "box-sizing:content-box!important;width:100%!important;max-height:36svh!important;" +
        "border-bottom:3rem solid transparent!important;" +
        "background:linear-gradient(var(--surface-dark,#000),transparent) bottom/100% 3rem no-repeat border-box border-box," +
        "linear-gradient(var(--surface-dark,#000),var(--surface-dark,#000)) padding-box!important;" +
        "margin-bottom:calc(var(--zoom-release,0px) - 3rem)!important;top:var(--zoom-top,0.75rem)!important}" +
        // only while pinned, so the fill above never covers the heading before it
        ".zoom-scope[data-zoom-scroll][data-zoom-stuck]>.flow-illustration.zoom{" +
        "box-shadow:0 calc(-1 * var(--zoom-top,0.75rem)) 0 0 var(--surface-dark,#000)!important}}";
      document.head.appendChild(css);
    }
    var mq = matchMedia(SCROLL_MQ), stop = -1, ticking = false;
    function set(n) {
      if (n === stop) return;
      stop = n;
      scope.setAttribute("data-zoom-stop", n);
      rows.forEach(function (r, i) { r.classList.toggle("is-zoom-on", i + 1 === n); });
      // inline, so it wins over the hover rules (a tap leaves :hover stuck on touch screens)
      [["s", 1], ["x", 0.5], ["y", 0.5]].forEach(function (k) {
        if (n) frame.style.setProperty("--zoom-" + k[0], "var(--zoom-" + n + "-" + k[0] + ", " + k[1] + ")");
        else frame.style.removeProperty("--zoom-" + k[0]);
      });
    }
    // The site header slides back in on scroll up; the pinned drawing moves down below it
    // (following its slide frame by frame) and back up when it hides.
    var header = document.getElementById("brx-header"), top = -1, follow = 0;
    function update() {
      ticking = false;
      var hb = header ? header.getBoundingClientRect().bottom : 0;
      var t = Math.round(Math.max(12, hb + 12));
      if (t !== top) {
        top = t;
        scope.style.setProperty("--zoom-top", t + "px");
      }
      // keep following for a moment after the last scroll, while the header finishes sliding
      if (performance.now() < follow) { ticking = true; requestAnimationFrame(update); }
      var fr = frame.getBoundingClientRect();
      scope.toggleAttribute("data-zoom-stuck", Math.abs(fr.top - top) < 1);
      var line = frame.getBoundingClientRect().bottom;
      line += (innerHeight - line) * 0.45;
      var n = 0;
      rows.forEach(function (r, i) { if (r.getBoundingClientRect().top <= line) n = i + 1; });
      set(n);
    }
    // The drawing lets go once the last row sits just below it, so whatever follows the list
    // (the button) scrolls normally. The page CSS turns this into a bottom margin on the drawing.
    var last = rows[rows.length - 1];
    function release() {
      if (!scope.hasAttribute("data-zoom-scroll")) return;
      var m = scope.getBoundingClientRect().bottom - parseFloat(getComputedStyle(scope).paddingBottom) - last.getBoundingClientRect().top + 56;
      scope.style.setProperty("--zoom-release", Math.max(0, Math.round(m)) + "px");
    }
    var ro = "ResizeObserver" in window ? new ResizeObserver(release) : null;
    function onScroll() {
      follow = performance.now() + 700;
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    function toggle() {
      if (mq.matches) {
        scope.setAttribute("data-zoom-scroll", "");
        addEventListener("scroll", onScroll, { passive: true });
        addEventListener("resize", onScroll);
        if (ro) ro.observe(scope);
        release(); update();
      } else {
        removeEventListener("scroll", onScroll);
        removeEventListener("resize", onScroll);
        if (ro) ro.disconnect();
        scope.style.removeProperty("--zoom-release");
        set(0); stop = -1;
        scope.removeAttribute("data-zoom-scroll");
        scope.removeAttribute("data-zoom-stop");
        scope.removeAttribute("data-zoom-stuck");
        scope.style.removeProperty("--zoom-top"); top = -1;
      }
    }
    if (mq.addEventListener) mq.addEventListener("change", toggle);
    toggle();
  }

  // With a mouse, the 01 row starts opened (blue title, text shown) while the drawing stays zoomed
  // out; the list returns to that whenever no row is hovered. Hovering a row (01 included)
  // zooms the drawing through the page's normal hover rules. Touch screens keep the scroll-driven stops.
  function defaultOpen(frame) {
    var scope = frame.closest(".zoom-scope");
    if (!scope || scope.hasAttribute("data-zoom-default-init")) return;
    var rows = [].slice.call(scope.querySelectorAll(".zoom-trigger"));
    if (!rows.length) return;
    scope.setAttribute("data-zoom-default-init", "");
    if (!document.getElementById("pipes3d-default-css")) {
      var css = document.createElement("style"); css.id = "pipes3d-default-css";
      // only while no row is hovered, decided by CSS so it is right even before the mouse moves
      var idle = ".zoom-scope:not(:has(.zoom-trigger:is(:hover,:focus-within))) .flow-item.is-zoom-default";
      css.textContent = idle + " .flow-title{background-color:var(--color-blue)}" +
        idle + " .flow-desc{max-height:12rem;opacity:1;" +
        "margin-top:clamp(0.6375rem,0.4879rem + 0.6385vw,1.254rem);margin-bottom:clamp(1.65rem,1.263rem + 1.653vw,3.246rem)}";
      document.head.appendChild(css);
    }
    var on = null;
    function apply() {
      var scroll = scope.hasAttribute("data-zoom-scroll");
      var want = !scroll;
      if (want === on) return;
      on = want;
      // text only: the drawing stays zoomed out until a row is actually hovered
      rows[0].classList.toggle("is-zoom-default", want);
    }
    rows.forEach(function (r) {
      r.addEventListener("mouseenter", apply); r.addEventListener("focusin", apply);
      r.addEventListener("mouseleave", function () { setTimeout(apply, 0); });
      r.addEventListener("focusout", function () { setTimeout(apply, 0); });
    });
    // the scroll mode switches on and off with the screen size
    new MutationObserver(function () { on = null; apply(); }).observe(scope, { attributes: true, attributeFilter: ["data-zoom-scroll"] });
    apply();
  }

  function init() {
    var frames = document.querySelectorAll(".flow-illustration.zoom, .flow-illustration .zoom");
    if (!frames.length) return;
    // runs without WebGL too: the flat image uses the same CSS zoom
    frames.forEach(scrollStops);
    frames.forEach(defaultOpen);
    try { var c = document.createElement("canvas"); if (!(c.getContext("webgl2") || c.getContext("webgl"))) return; } catch (e) { return; }
    var go = function () {
      var needSteel = /[?&]pipes-stainless\b/.test(location.search) ||
        (!/[?&]pipes-lines\b/.test(location.search) && Array.prototype.some.call(frames, function (f) { return (f.getAttribute("data-pipe-mode") || DEFAULTS.mode) === "stainless"; }));
      loadDeps(needSteel ? ["examples/js/environments/RoomEnvironment.js", "examples/js/loaders/RGBELoader.js"] : null).then(function () {
        if (!THREE.LineSegments2) return;
        frames.forEach(function (f) { try { mount(f); } catch (e) { console.warn("pipes3d", e); } });
      }).catch(function (e) { console.warn("pipes3d", e); });
    };
    // start loading when the section approaches the viewport
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); }
      }, { rootMargin: "600px 0px" });
      frames.forEach(function (f) { io.observe(f); });
    } else go();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
