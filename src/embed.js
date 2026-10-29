/* Riven: 3D pipe linework for the "Our pipe" Zoom stage.
   Replaces the flat line-drawing image with a live Three.js line drawing of the same pipe run.
   - Mirrors the stage's CSS zoom every frame (camera view offset), so it stays crisp at any zoom
     and the blue highlight spots stay aligned.
   - On hover it moves like a 3D model: a slight swing while zooming, and a pointer tilt over the drawing.
   - Falls back to the original image if WebGL or the scripts are unavailable. */
(function () {
  "use strict";
  var CDN = "https://cdn.jsdelivr.net/npm/three@0.147.0/";
  var DEPS = ["build/three.min.js", "examples/js/lines/LineSegmentsGeometry.js",
              "examples/js/lines/LineMaterial.js", "examples/js/lines/LineSegments2.js"];
  // Defaults. Each can be overridden per element with a data attribute on the zoom frame,
  // e.g. data-pipe-lines="20" (set in Bricks: element > Attributes), or tuned live with ?pipes-tune
  var DEFAULTS = { lines: 24, rings: 1.5, bolts: 8, smooth: 96, outline: 1.4, detail: 0.7, detailOpacity: 0.6,
                   ringOpacity: 0.38, hidden: 0.14, swing: 1, tilt: 1, color: "" };
  var CTRL = [
    ["lines", "Lines around pipe", 0, 48, 4], ["rings", "Ring spacing (0 = off)", 0, 4, 0.25],
    ["bolts", "Bolts per flange", 4, 12, 2], ["smooth", "Surface smoothness", 24, 160, 8],
    ["outline", "Outline weight px", 0.4, 4, 0.1], ["detail", "Detail weight px", 0.2, 2.5, 0.1],
    ["detailOpacity", "Detail brightness", 0.05, 1, 0.05], ["ringOpacity", "Ring brightness", 0, 1, 0.05],
    ["hidden", "Seen-through lines", 0, 0.6, 0.02], ["swing", "Zoom swing", 0, 3, 0.1], ["tilt", "Pointer tilt", 0, 3, 0.1]];
  var REBUILD = { lines: 1, rings: 1, bolts: 1, smooth: 1 };
  function readLook(el) {
    var L = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach(function (k) {
      var a = el.getAttribute("data-pipe-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }));
      if (a !== null && a !== "") L[k] = k === "color" ? a : parseFloat(a);
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
  function loadDeps() {
    if (window.THREE && THREE.LineSegments2) return Promise.resolve();
    var p = Promise.resolve();
    DEPS.forEach(function (d) {
      p = p.then(function () {
        if (d.indexOf("three.min") >= 0 && window.THREE) return;
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

    var col = new THREE.Color(LOOK.color || getComputedStyle(frame).color || "#fff");
    var scene = new THREE.Scene();
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
    };
    function applyLook() {
      var pr = renderer.getPixelRatio();
      M.edge.linewidth = LOOK.outline * pr; M.detail.linewidth = LOOK.detail * pr;
      M.ring.linewidth = LOOK.detail * 0.85 * pr; M.hidden.linewidth = Math.max(0.6, LOOK.detail * 0.9 * pr);
      M.detail.opacity = LOOK.detailOpacity; M.ring.opacity = LOOK.ringOpacity; M.hidden.opacity = LOOK.hidden;
      if (hidObj) hidObj.visible = LOOK.hidden > 0;
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
    var occ = null, detObj = null, ringObj = null, feature, featureBig, sil;
    var edgeObj = null, hidObj = null, lastEye = null;
    function drop(o) { if (o) { scene.remove(o); o.geometry.dispose(); } }
    function build() {
      var model = G.build({ nLines: LOOK.lines, ringGap: LOOK.rings, nBolts: LOOK.bolts, seg: LOOK.smooth, nutDetail: true });
      var mesh = G.meshArrays(model.parts);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(mesh.pos, 3));
      geo.setIndex(mesh.idx);
      drop(occ); drop(detObj); drop(ringObj);
      occ = new THREE.Mesh(geo, occMat); occ.renderOrder = 0; scene.add(occ);
      var saddle = G.polylinesToSegments(model.saddles);
      feature = G.featureSegments(model.parts).concat(saddle);
      featureBig = G.featureSegments(model.parts, function (p) { return p.kind !== "bolt"; }).concat(saddle);
      detObj = segObj(G.polylinesToSegments(model.detail), M.detail, 2);
      ringObj = segObj(G.polylinesToSegments(model.rings), M.ring, 2);
      scene.add(detObj, ringObj);
      sil = G.prepSil(model.parts);
      lastEye = null;
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
    var sLag = 1, yaw = 0, pitch = 0, ptr = { x: 0, y: 0, on: false };
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

      // base pose + exact CSS crop
      camera.position.copy(baseEye); camera.lookAt(baseTgt); camera.up.set(0, 1, 0);
      if (X.w > 0 && X.h > 0 && X.s > 0) {
        camera.setViewOffset(X.w, X.h, -X.tx / X.s, -X.ty / X.s, frame.clientWidth / X.s, frame.clientHeight / X.s);
      }
      camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      if (Math.abs(yaw) > 1e-5 || Math.abs(pitch) > 1e-5) {
        // orbit about the point at the centre of the current crop, at the photo's focus distance
        tmp.set(0, 0, 0.5).unproject(camera).sub(camera.position).normalize();
        piv.copy(camera.position).addScaledVector(tmp, baseEye.distanceTo(baseTgt));
        var off = camera.position.clone().sub(piv);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        var right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        off.applyAxisAngle(right, pitch);
        var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
          .premultiply(new THREE.Quaternion().setFromAxisAngle(right, pitch));
        camera.position.copy(piv).add(off);
        camera.quaternion.premultiply(q);
        camera.updateMatrixWorld();
      }
      return Math.abs(X.s - sLag) > 1e-3 || Math.abs(tYaw - yaw) > 1e-4 || Math.abs(tPitch - pitch) > 1e-4;
    }

    var size = { w: 0, h: 0 };
    function resize() {
      var w = frame.clientWidth, h = frame.clientHeight;
      if (w === size.w && h === size.h) return;
      size.w = w; size.h = h;
      renderer.setSize(w, h, false);
      var pr = renderer.getPixelRatio(), res = new THREE.Vector2(w * pr, h * pr);
      for (var k in M) { M[k].resolution.copy(res); }
      applyLook();
      wake();
    }

    var raf = 0, visible = true, lastT = 0, lastKey = "";
    function frameLoop(t) {
      raf = 0;
      var dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016); lastT = t;
      resize();
      var X = stageXform();
      var moving = placeCamera(X, dt);
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
    if (/[?&]pipes-tune\b/.test(location.search)) tunePanel(frame, LOOK, function (k) {
      if (REBUILD[k]) { clearTimeout(tunePanel.t); tunePanel.t = setTimeout(function () { build(); wake(); }, 150); }
      applyLook(); lastEye = null; wake();
    });
    if (img) { img.style.transition = "opacity .4s"; img.style.opacity = "0"; }
    frame.dataset.pipes3d = "ready";
  }

  // Live tuning panel: add ?pipes-tune to the page URL. Copies values as Bricks attributes.
  function tunePanel(frame, LOOK, changed) {
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;width:260px;max-height:80vh;overflow:auto;" +
      "background:#111;color:#eee;font:12px/1.4 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #333;border-radius:8px";
    var html = "<b style='display:block;margin-bottom:8px'>Pipe linework</b>";
    CTRL.forEach(function (c) {
      html += "<label style='display:block;margin:6px 0'>" + c[1] + " <span data-o='" + c[0] + "' style='float:right'>" + LOOK[c[0]] + "</span>" +
        "<input data-k='" + c[0] + "' type='range' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + LOOK[c[0]] + "' style='width:100%'></label>";
    });
    html += "<button type='button' data-copy style='margin-top:8px;width:100%;padding:6px;background:#9fd0e6;color:#000;border:0;border-radius:4px'>Copy as Bricks attributes</button>" +
      "<textarea readonly style='margin-top:8px;width:100%;height:110px;background:#000;color:#9fd0e6;border:1px solid #333'></textarea>";
    box.innerHTML = html; document.body.appendChild(box);
    var ta = box.querySelector("textarea");
    function dump() {
      ta.value = Object.keys(DEFAULTS).filter(function (k) { return k !== "color" && LOOK[k] !== DEFAULTS[k]; }).map(function (k) {
        return "data-pipe-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }) + " = " + LOOK[k];
      }).join("\n") || "(all defaults)";
    }
    box.addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-k"); if (!k) return;
      LOOK[k] = parseFloat(e.target.value); box.querySelector("[data-o='" + k + "']").textContent = LOOK[k];
      dump(); changed(k);
    });
    box.querySelector("[data-copy]").addEventListener("click", function () {
      dump(); ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function () {});
    });
    dump();
  }

  function init() {
    var frames = document.querySelectorAll(".flow-illustration.zoom, .flow-illustration .zoom");
    if (!frames.length) return;
    try { var c = document.createElement("canvas"); if (!(c.getContext("webgl2") || c.getContext("webgl"))) return; } catch (e) { return; }
    var go = function () {
      loadDeps().then(function () {
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
