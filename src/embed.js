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
                   ringOpacity: 0.38, hidden: 0.14, swing: 1, tilt: 1, color: "", highlight: 3, highlightColor: "" };
  var CTRL = [
    ["lines", "Lines around pipe", 0, 48, 4], ["rings", "Ring spacing (0 = off)", 0, 4, 0.25],
    ["bolts", "Bolts per flange", 4, 12, 2], ["smooth", "Surface smoothness", 24, 160, 8],
    ["outline", "Outline weight px", 0.4, 4, 0.1], ["detail", "Detail weight px", 0.2, 2.5, 0.1],
    ["detailOpacity", "Detail brightness", 0.05, 1, 0.05], ["ringOpacity", "Ring brightness", 0, 1, 0.05],
    ["hidden", "Seen-through lines", 0, 0.6, 0.02], ["swing", "Zoom swing", 0, 3, 0.1], ["tilt", "Pointer tilt", 0, 3, 0.1],
    ["highlight", "Weld highlight px", 0, 8, 0.25]];
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
    ["zoomTime", "Zoom duration s", 0.2, 2.5, 0.05, "--zoom-duration", "s"]];
  var attrName = function (k) { return "data-pipe-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }); };
  function readZoom(el) {
    var cs = getComputedStyle(el), Z = { set: {} };
    ZCTRL.forEach(function (c) {
      var a = el.getAttribute(attrName(c[0]));
      if (a !== null && a !== "") { Z[c[0]] = parseFloat(a); Z.set[c[0]] = true; }
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
    st.textContent = css ? ".flow-illustration.zoom[data-pipes3d]{" + css + "}" : "";
  }
  function readLook(el) {
    var L = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach(function (k) {
      var a = el.getAttribute("data-pipe-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }));
      if (a !== null && a !== "") L[k] = /color/i.test(k) ? a : parseFloat(a);
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
      hl: lineMat({ linewidth: 1, opacity: 0 }, true),
      hlLine: lineMat({ linewidth: 1, opacity: 0 }, true),
    };
    var fcs = getComputedStyle(frame);
    M.hlLine.color = M.hl.color = new THREE.Color(LOOK.highlightColor || (fcs.getPropertyValue("--zoom-accent") || fcs.getPropertyValue("--color-blue") || "#1463ff").trim());
    function applyLook() {
      var pr = renderer.getPixelRatio();
      M.edge.linewidth = LOOK.outline * pr; M.detail.linewidth = LOOK.detail * pr;
      M.ring.linewidth = LOOK.detail * 0.85 * pr; M.hidden.linewidth = Math.max(0.6, LOOK.detail * 0.9 * pr);
      M.detail.opacity = LOOK.detailOpacity; M.ring.opacity = LOOK.ringOpacity; M.hidden.opacity = LOOK.hidden;
      M.hl.linewidth = LOOK.highlight * pr; M.hlLine.linewidth = Math.max(1, LOOK.highlight * 0.5) * pr;
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
        if (h.rings.length) objs.push(segObj(G.polylinesToSegments(h.rings), M.hl, 5));
        if (h.lines.length) objs.push(segObj(G.polylinesToSegments(h.lines), M.hlLine, 4));
        objs.forEach(function (o) { o.visible = false; scene.add(o); });
        hlObjs[n] = objs;
      });
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

    // weld highlight follows the hovered 01/02/03 row, fading in once the zoom has mostly arrived
    var scopeEl = frame.closest(".zoom-scope") || document;
    var hl = { stop: 0, since: 0, a: 0 };
    function activeStop() {
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
    if (/[?&]pipes-tune\b/.test(location.search)) tunePanel(frame, LOOK, ZOOM, wake, function (k) {
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
  function tunePanel(frame, LOOK, ZOOM, wake, changed) {
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;width:260px;max-height:80vh;overflow:auto;" +
      "background:#111;color:#eee;font:12px/1.4 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #333;border-radius:8px";
    var hd = "display:block;margin:10px 0 4px;color:#9fd0e6;text-transform:uppercase;letter-spacing:.08em;font-size:11px";
    var btn = "flex:1;padding:4px 0;background:#222;color:#eee;border:1px solid #444;border-radius:4px;cursor:pointer";
    var html = "<b style='display:block;margin-bottom:4px'>Pipe linework</b><span style='" + hd + "'>Zoom</span>" +
      "<div style='display:flex;gap:4px;margin-bottom:4px'>Preview:" +
      ["Rest", "01", "02", "03"].map(function (t, i) { return "<button type='button' data-pv='" + i + "' style='" + btn + "'>" + t + "</button>"; }).join("") + "</div>";
    ZCTRL.forEach(function (c) {
      html += "<label style='display:block;margin:6px 0'>" + c[1] + " <span data-zo='" + c[0] + "' style='float:right'>" + ZOOM[c[0]] + "</span>" +
        "<input data-z='" + c[0] + "' type='range' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + ZOOM[c[0]] + "' style='width:100%'></label>";
    });
    html += "<span style='" + hd + "'>Lines</span>";
    CTRL.forEach(function (c) {
      html += "<label style='display:block;margin:6px 0'>" + c[1] + " <span data-o='" + c[0] + "' style='float:right'>" + LOOK[c[0]] + "</span>" +
        "<input data-k='" + c[0] + "' type='range' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + LOOK[c[0]] + "' style='width:100%'></label>";
    });
    html += "<button type='button' data-copy style='margin-top:8px;width:100%;padding:6px;background:#9fd0e6;color:#000;border:0;border-radius:4px'>Copy as Bricks attributes</button>" +
      "<textarea readonly style='margin-top:8px;width:100%;height:110px;background:#000;color:#9fd0e6;border:1px solid #333'></textarea>";
    box.innerHTML = html; document.body.appendChild(box);
    var ta = box.querySelector("textarea");
    function dump() {
      var z = ZCTRL.filter(function (c) { return ZOOM.set[c[0]]; }).map(function (c) { return attrName(c[0]) + " = " + ZOOM[c[0]]; });
      var l = Object.keys(DEFAULTS).filter(function (k) { return k !== "color" && LOOK[k] !== DEFAULTS[k]; }).map(function (k) {
        return attrName(k) + " = " + LOOK[k];
      });
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
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-pv]"); if (!b) return;
      preview = +b.getAttribute("data-pv"); showPreview();
    });
    box.addEventListener("input", function (e) {
      var zk = e.target.getAttribute("data-z");
      if (zk) {
        ZOOM[zk] = parseFloat(e.target.value); ZOOM.set[zk] = true;
        box.querySelector("[data-zo='" + zk + "']").textContent = ZOOM[zk];
        applyZoom(ZOOM);
        if (/^zoom\d$/.test(zk) && preview !== +zk.slice(4)) preview = +zk.slice(4);
        if (/^rest/.test(zk)) preview = 0;
        showPreview(); dump(); return;
      }
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
