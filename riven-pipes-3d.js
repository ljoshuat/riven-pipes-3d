/* Riven pipe linework (3D) - geometry fitted to the site's line drawing / stock photo camera */
(function(){
/* ---------- pure geometry for the full pipe network (no THREE needed) ---------- */
const G = (() => {
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const rot = (v, k, a) => { // Rodrigues: rotate v about unit axis k by a
    const c = Math.cos(a), s = Math.sin(a);
    return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
  };

  // ---------- path: straight runs joined by circular bends, parallel-transport frames ----------
  function makePath(pts, Rb, N0) {
    const segs = []; let s = 0;
    let d = norm(sub(pts[1], pts[0]));
    let N = N0 ? norm(N0) : norm(Math.abs(d[1]) < 0.9 ? cross([0, 1, 0], d) : cross([1, 0, 0], d));
    let cur = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const P = pts[i];
      if (i < pts.length - 1) {
        const d1 = norm(sub(pts[i + 1], P));
        const th = Math.acos(Math.max(-1, Math.min(1, dot(d, d1))));
        const t = Rb * Math.tan(th / 2);
        const a0 = sub(P, mul(d, t));
        const L = len(sub(a0, cur));
        segs.push({ type: "line", s0: s, s1: s + L, p0: cur, d, N }); s += L;
        const nIn = norm(sub(d1, mul(d, dot(d, d1))));
        const axis = norm(cross(d, nIn));
        const La = Rb * th;
        segs.push({ type: "arc", s0: s, s1: s + La, p0: a0, d0: d, nIn, axis, R: Rb, N });
        s += La;
        N = rot(N, axis, th); d = d1; cur = add(P, mul(d1, t));
      } else {
        const L = len(sub(P, cur));
        segs.push({ type: "line", s0: s, s1: s + L, p0: cur, d, N }); s += L;
      }
    }
    const length = s;
    function frame(s) {
      s = Math.max(0, Math.min(length, s));
      let g = segs[segs.length - 1];
      for (const q of segs) if (s <= q.s1) { g = q; break; }
      const u = s - g.s0;
      if (g.type === "line") {
        const T = g.d; return { c: add(g.p0, mul(T, u)), T, N: g.N, B: cross(T, g.N) };
      }
      const ph = u / g.R, c = Math.cos(ph), sn = Math.sin(ph);
      const T = add(mul(g.d0, c), mul(g.nIn, sn));
      const cc = add(g.p0, add(mul(g.nIn, g.R * (1 - c)), mul(g.d0, g.R * sn)));
      const Nn = rot(g.N, g.axis, ph);
      return { c: cc, T, N: Nn, B: cross(T, Nn) };
    }
    const curvedAt = (s) => segs.some((q) => q.type === "arc" && s > q.s0 + 1e-6 && s < q.s1 - 1e-6);
    const arcs = segs.filter((q) => q.type === "arc").map((q) => [q.s0, q.s1]);
    return { frame, length, curvedAt, arcs, segs };
  }

  // ---------- surface of revolution swept along a frame ----------
  function lathe({ profile, frameAt, M, phase = 0, cap0 = false, cap1 = false, curvedAt = () => false }) {
    const rings = [];
    for (let k = 0; k < profile.length - 1; k++) {
      const [s0, r0] = profile[k], [s1, r1] = profile[k + 1];
      if (k === 0) rings.push([s0, r0]);
      if (Math.abs(s1 - s0) < 1e-9) { rings.push([s1, r1]); continue; }
      const curved = curvedAt((s0 + s1) / 2);
      const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / (curved ? 0.06 : (r0 === r1 ? 2.0 : 0.12))));
      for (let i = 1; i <= n; i++) { const f = i / n; rings.push([s0 + (s1 - s0) * f, r0 + (r1 - r0) * f]); }
    }
    const pos = [], frames = [];
    for (const [s, r] of rings) {
      const F = frameAt(s); frames.push(F);
      for (let j = 0; j < M; j++) {
        const th = phase + 2 * Math.PI * j / M;
        pos.push(add(F.c, add(mul(F.N, r * Math.cos(th)), mul(F.B, r * Math.sin(th)))));
      }
    }
    const nR = rings.length, faces = [];
    for (let i = 0; i < nR - 1; i++) {
      const [s0, r0] = rings[i], [s1, r1] = rings[i + 1];
      const ds = s1 - s0, dr = r1 - r0;
      if (Math.abs(ds) < 1e-9 && Math.abs(dr) < 1e-9) continue;
      const Fm = frameAt((s0 + s1) / 2);
      for (let j = 0; j < M; j++) {
        const j1 = (j + 1) % M, thm = phase + 2 * Math.PI * (j + 0.5) / M;
        const radial = add(mul(Fm.N, Math.cos(thm)), mul(Fm.B, Math.sin(thm)));
        const n = norm(add(mul(Fm.T, -dr), mul(radial, ds)));
        faces.push({ v: [i * M + j, (i + 1) * M + j, (i + 1) * M + j1, i * M + j1], n });
      }
    }
    if (cap0) { const ci = pos.length; pos.push(frames[0].c); for (let j = 0; j < M; j++) faces.push({ v: [ci, (j + 1) % M, j], n: mul(frames[0].T, -1) }); }
    if (cap1) { const ci = pos.length; const b = (nR - 1) * M; pos.push(frames[nR - 1].c); for (let j = 0; j < M; j++) faces.push({ v: [ci, b + j, b + (j + 1) % M], n: frames[nR - 1].T }); }
    const vn = pos.map(() => [0, 0, 0]);
    for (const f of faces) for (const i of f.v) vn[i] = add(vn[i], f.n);
    return { pos, faces, vn: vn.map(norm) };
  }

  function buildEdges(part) {
    const map = new Map();
    part.faces.forEach((f, fi) => {
      const v = f.v;
      for (let k = 0; k < v.length; k++) {
        const a = v[k], b = v[(k + 1) % v.length];
        if (a === b) continue;
        const key = a < b ? a * 1e7 + b : b * 1e7 + a;
        let e = map.get(key);
        if (!e) { e = { a, b, f: [] }; map.set(key, e); }
        e.f.push(fi);
      }
    });
    const feature = [], smooth = [];
    for (const e of map.values()) {
      if (part.cut && part.cut(mul(add(part.pos[e.a], part.pos[e.b]), 0.5))) continue;
      if (e.f.length === 1) { feature.push(e); continue; }
      const n1 = part.faces[e.f[0]].n, n2 = part.faces[e.f[1]].n;
      if (dot(n1, n2) < Math.cos(28 * Math.PI / 180)) feature.push(e); else smooth.push(e);
    }
    part.featureEdges = feature; part.smoothEdges = smooth;
    return part;
  }

  // ---------- the network, fitted to the photo ----------
  // main pipe runs along X (r = 1); branches are vertical tees; upper runs leave at heading PSI
  const PSI = 0.6994, DIR = [Math.sin(PSI), 0, -Math.cos(PSI)];
  const NET = [
    { id: "main", r: 1.0, pts: [[-70, 0, 0], [34, 0, 0]], flangesX: [-8.377, 3.637], welds: [-2.044] },
    { id: "A", r: 0.88, x: 1.142, corner: 10.657, run: 40.90, riserFlanges: [3.013, 7.661], runFlanges: [] },
    { id: "B", r: 0.833, x: 6.097, corner: 5.748, run: 25.05, riserFlanges: [3.049], runFlanges: [14.683] },
    { id: "C", r: 0.511, x: 10.656, corner: 2.981, run: 9.40, riserFlanges: [], runFlanges: [], psi: 0.8458 },
    { id: "D1", r: 0.578, x: -3.244, down: 40, riserFlanges: [3.635] },
    { id: "D2", r: 0.578, x: 10.205, down: 40, riserFlanges: [3.268] },
  ];

  function pipesFromNet() {
    const out = [];
    const branches = NET.filter((p) => p.id !== "main");
    const m = NET[0];
    // main pipe: cut where branch mouths open
    const mainCut = (p) => branches.some((b) => {
      const dx = p[0] - b.x, dz = p[2];
      const side = b.down ? -1 : 1;
      return dx * dx + dz * dz < b.r * b.r * 0.995 && p[1] * side > 0 && Math.abs(p[1]) < 1.05;
    });
    const mp = makePath(m.pts, 1, [0, 1, 0]);
    out.push({ id: "main", r: m.r, path: mp, flanges: m.flangesX.map((x) => x - m.pts[0][0]),
      welds: m.welds.map((x) => x - m.pts[0][0]), cut: mainCut, tee: null });
    const inMain = (p) => p[1] * p[1] + p[2] * p[2] < 0.995;
    for (const b of branches) {
      const Rb = 1.5 * b.r;
      let pts, flanges = [...b.riserFlanges];
      if (b.down) pts = [[b.x, 0, 0], [b.x, -b.down, 0]];
      else {
        const c = [b.x, b.corner, 0];
        const dir = b.psi != null ? [Math.sin(b.psi), 0, -Math.cos(b.psi)] : DIR;
        pts = [[b.x, 0, 0], c, add(c, mul(dir, b.run))];
      }
      const path = makePath(pts, Rb, [1, 0, 0]);
      if (!b.down) {
        const arcEnd = path.arcs[0][1];
        flanges.push(arcEnd + 1.2 * b.r);                         // exit flange right after the elbow
        for (const d of b.runFlanges) flanges.push(arcEnd + (d - Rb));
      }
      out.push({ id: b.id, r: b.r, path, flanges, welds: [], cut: inMain, tee: { sign: b.down ? -1 : 1 } });
    }
    return out;
  }

  const FLD = (r) => ({ RF: 1.85 * r, RHUB: 1.24 * r, RRAISE: 1.36 * r, BC: 1.6 * r, hub: 0.78 * r, face: 0.4 * r, gap: 0.05 * r });

  function build(opts) {
    const { nLines = 24, ringGap = 1.5, nBolts = 8, seg = 96, nutDetail = true } = opts;
    const pipes = pipesFromNet();
    const parts = [], detail = [], rings = [], saddles = [];

    for (const P of pipes) {
      const { r, path } = P, D = FLD(r), Lp = path.length;
      const fA = (s) => path.frame(s);
      // tee start: where each generator leaves the main pipe (|y| = sqrt(1 - z^2) for vertical branches)
      const sStart = (th) => {
        if (!P.tee) return 0;
        const F = path.frame(0); const z = (F.N[2] * Math.cos(th) + F.B[2] * Math.sin(th)) * r;
        return Math.sqrt(Math.max(0, 1 - z * z));
      };
      const s0mesh = P.tee ? 0 : 0;

      // pipe pieces between flange pairs
      const cuts = [s0mesh];
      for (const sc of [...P.flanges].sort((a, b) => a - b)) cuts.push(sc - D.hub, sc + D.hub);
      cuts.push(Lp);
      for (let k = 0; k < cuts.length; k += 2) {
        const a = cuts[k], b = cuts[k + 1], prof = [[a, r]];
        for (const [x0, x1] of path.arcs) for (const s of [x0, x1]) if (s > a && s < b) prof.push([s, r]);
        prof.push([b, r]);
        const pp = buildEdges(Object.assign(lathe({ profile: prof, frameAt: fA, M: seg, curvedAt: path.curvedAt }), { cut: P.cut, kind: "pipe" }));
        parts.push(pp);
      }

      // flange pairs + bolts
      for (const sc of P.flanges) {
        const p = [
          [sc - D.hub, r], [sc - D.face, D.RHUB], [sc - D.face, D.RF], [sc - D.gap, D.RF], [sc - D.gap, D.RRAISE],
          [sc + D.gap, D.RRAISE], [sc + D.gap, D.RF], [sc + D.face, D.RF], [sc + D.face, D.RHUB], [sc + D.hub, r],
        ];
        parts.push(buildEdges(Object.assign(lathe({ profile: p, frameAt: fA, M: Math.max(seg, 72) }), { kind: "flange" })));
        const F = fA(sc);
        for (let i = 0; i < nBolts; i++) {
          const th = 2 * Math.PI * (i + 0.5) / nBolts;
          const c = add(F.c, add(mul(F.N, D.BC * Math.cos(th)), mul(F.B, D.BC * Math.sin(th))));
          const fa = (s) => ({ c: add(c, mul(F.T, s)), T: F.T, N: F.N, B: F.B });
          const sr = 0.105 * r, nr = 0.27 * r, nh = 0.3 * r;
          const stud = buildEdges(Object.assign(lathe({ profile: [[-D.face - nh - 0.1 * r, sr], [D.face + nh + 0.1 * r, sr]], frameAt: fa, M: 24, cap0: true, cap1: true }), { scale: 0.15 * r, kind: "bolt" }));
          const n1 = buildEdges(Object.assign(lathe({ profile: [[D.face, nr], [D.face + nh, nr]], frameAt: fa, M: 6, phase: th, cap0: true, cap1: true }), { scale: 0.3 * r, kind: "bolt" }));
          const n2 = buildEdges(Object.assign(lathe({ profile: [[-D.face - nh, nr], [-D.face, nr]], frameAt: fa, M: 6, phase: th, cap0: true, cap1: true }), { scale: 0.3 * r, kind: "bolt" }));
          parts.push(stud, n1, n2);
          if (nutDetail) for (const s of [D.face + nh, -D.face - nh]) {
            const cc = add(c, mul(F.T, s)), pts = [];
            for (let j = 0; j <= 20; j++) { const a = 2 * Math.PI * j / 20; pts.push(add(cc, add(mul(F.N, 0.22 * r * Math.cos(a)), mul(F.B, 0.22 * r * Math.sin(a))))); }
            rings.push(pts);
          }
        }
      }

      // longitudinal lines: continuous through bends and over hub cones, broken by flange discs
      const n = Math.max(8, Math.round(nLines * Math.min(1.1, Math.max(0.5, r / 0.9)) / 4) * 4);
      if (nLines > 0) {
        const radiusAt = (s) => {
          for (const sc of P.flanges) {
            const d = Math.abs(s - sc);
            if (d < D.face) return null;
            if (d < D.hub) return D.RHUB + (r - D.RHUB) * (d - D.face) / (D.hub - D.face);
          }
          return r;
        };
        // sample stations: coarse on plain straight pipe, fine in bends and near flanges
        const st = new Set();
        for (let s = 0; s <= Lp; s += 1.0) st.add(+s.toFixed(4));
        for (const [a, b] of path.arcs) for (let s = a; s <= b; s += 0.04) st.add(+s.toFixed(4));
        for (const sc of P.flanges) for (let s = sc - D.hub - 0.02; s <= sc + D.hub + 0.02; s += 0.04) st.add(+s.toFixed(4));
        for (const sc of P.flanges) { st.add(+(sc - D.face).toFixed(4)); st.add(+(sc + D.face).toFixed(4)); }
        st.add(+Lp.toFixed(4));
        const S = [...st].filter((s) => s >= 0 && s <= Lp).sort((a, b) => a - b);
        for (let k = 0; k < n; k++) {
          const th = 2 * Math.PI * k / n + Math.PI / n;
          const sa = sStart(th);
          let cur = [];
          const pt = (s, rr) => { const F = path.frame(s); return add(F.c, add(mul(F.N, rr * Math.cos(th)), mul(F.B, rr * Math.sin(th)))); };
          if (P.tee) cur.push(pt(sa, r));
          for (const s of S) {
            if (s <= sa) continue;
            const rr = radiusAt(s);
            if (rr === null) { if (cur.length > 1) detail.push(cur); cur = []; continue; }
            const q = pt(s, rr);
            if (P.cut && P.cut(q)) { if (cur.length > 1) detail.push(cur); cur = []; continue; }
            cur.push(q);
          }
          if (cur.length > 1) detail.push(cur);
        }
      }

      // tee saddle curve (where the branch meets the main pipe)
      if (P.tee) {
        const pts = [];
        for (let j = 0; j <= 96; j++) {
          const th = 2 * Math.PI * j / 96, F = path.frame(0), s = sStart(th);
          pts.push(add(add(F.c, mul(F.T, s)), add(mul(F.N, r * Math.cos(th)), mul(F.B, r * Math.sin(th)))));
        }
        saddles.push(pts);
      }

      // cross-section rings
      if (ringGap > 0) {
        const zones = P.flanges.map((sc) => [sc - D.hub - 0.2, sc + D.hub + 0.2]);
        const step = ringGap * Math.max(0.7, r);
        const first = P.tee ? 1.6 : 0;
        for (let s = first + step; s < Lp - 0.2; s += step) {
          if (zones.some(([a, b]) => s > a && s < b)) continue;
          const F = path.frame(s), pts = [];
          for (let j = 0; j <= 64; j++) { const t = 2 * Math.PI * j / 64; pts.push(add(F.c, add(mul(F.N, r * Math.cos(t)), mul(F.B, r * Math.sin(t))))); }
          if (P.cut && pts.some((q) => P.cut(q))) continue;
          rings.push(pts);
        }
      }
      // weld seams (always drawn as edges)
      for (const sw of P.welds) {
        const F = path.frame(sw), pts = [];
        for (let j = 0; j <= 96; j++) { const t = 2 * Math.PI * j / 96; pts.push(add(F.c, add(mul(F.N, r * 1.005 * Math.cos(t)), mul(F.B, r * 1.005 * Math.sin(t))))); }
        saddles.push(pts);
      }
    }
    return { parts, detail, rings, saddles };
  }

  function featureSegments(parts, filter = () => true) {
    const out = [];
    for (const p of parts) if (filter(p)) for (const e of p.featureEdges) out.push(...p.pos[e.a], ...p.pos[e.b]);
    return out;
  }
  function silhouetteSegments(parts, eye, filter = () => true) {
    const out = [];
    for (const p of parts) {
      if (!filter(p)) continue;
      for (const e of p.smoothEdges) {
        const A = p.pos[e.a], Bv = p.pos[e.b];
        const vx = eye[0] - (A[0] + Bv[0]) / 2, vy = eye[1] - (A[1] + Bv[1]) / 2, vz = eye[2] - (A[2] + Bv[2]) / 2;
        const n1 = p.faces[e.f[0]].n, n2 = p.faces[e.f[1]].n;
        const d1 = n1[0] * vx + n1[1] * vy + n1[2] * vz, d2 = n2[0] * vx + n2[1] * vy + n2[2] * vz;
        if ((d1 > 0) !== (d2 > 0)) out.push(A[0], A[1], A[2], Bv[0], Bv[1], Bv[2]);
      }
    }
    return out;
  }
  function polylinesToSegments(lines) {
    const out = [];
    for (const L of lines) for (let i = 0; i < L.length - 1; i++) out.push(...L[i], ...L[i + 1]);
    return out;
  }
  function meshArrays(parts, inset = 0.03) {
    const pos = [], idx = [];
    for (const p of parts) {
      const base = pos.length / 3, k = inset * (p.scale || 1);
      p.pos.forEach((v, i) => { const n = p.vn[i]; pos.push(v[0] - n[0] * k, v[1] - n[1] * k, v[2] - n[2] * k); });
      for (const f of p.faces) {
        const v = f.v.map((i) => i + base);
        idx.push(v[0], v[1], v[2]);
        if (v.length === 4) idx.push(v[0], v[2], v[3]);
      }
    }
    return { pos, idx };
  }
  // fast silhouettes: decide front/back once per FACE (from its own centre), then mark every
  // edge whose two faces disagree. Neighbouring silhouette edges share faces, so the outline
  // comes out as one connected chain instead of separate pieces.
  function prepSil(parts) {
    let nf = 0, ne = 0;
    for (const p of parts) { nf += p.faces.length; ne += p.smoothEdges.length; }
    const FC = new Float32Array(nf * 3), FN = new Float32Array(nf * 3);
    const E = new Float32Array(ne * 6), EF = new Uint32Array(ne * 2), big = new Uint8Array(ne);
    let fo = 0, i = 0;
    for (const p of parts) {
      p.faces.forEach((f, k) => {
        let cx = 0, cy = 0, cz = 0;
        for (const v of f.v) { cx += p.pos[v][0]; cy += p.pos[v][1]; cz += p.pos[v][2]; }
        const n = f.v.length, o = (fo + k) * 3;
        FC[o] = cx / n; FC[o + 1] = cy / n; FC[o + 2] = cz / n;
        FN[o] = f.n[0]; FN[o + 1] = f.n[1]; FN[o + 2] = f.n[2];
      });
      const b = p.kind !== "bolt" ? 1 : 0;
      for (const e of p.smoothEdges) {
        const A = p.pos[e.a], B = p.pos[e.b], o = i * 6;
        E[o] = A[0]; E[o + 1] = A[1]; E[o + 2] = A[2]; E[o + 3] = B[0]; E[o + 4] = B[1]; E[o + 5] = B[2];
        EF[i * 2] = fo + e.f[0]; EF[i * 2 + 1] = fo + e.f[1];
        big[i++] = b;
      }
      fo += p.faces.length;
    }
    return { FC, FN, E, EF, big, nf, n: ne, facing: new Uint8Array(nf) };
  }
  function silFast(S, eye) {
    const { FC, FN, E, EF, facing } = S;
    for (let f = 0; f < S.nf; f++) {
      const o = f * 3;
      facing[f] = (FN[o] * (eye[0] - FC[o]) + FN[o + 1] * (eye[1] - FC[o + 1]) + FN[o + 2] * (eye[2] - FC[o + 2])) > 0 ? 1 : 0;
    }
    const all = [], big = [];
    for (let i = 0; i < S.n; i++) {
      if (facing[EF[i * 2]] !== facing[EF[i * 2 + 1]]) {
        const o = i * 6;
        all.push(E[o], E[o + 1], E[o + 2], E[o + 3], E[o + 4], E[o + 5]);
        if (S.big[i]) big.push(E[o], E[o + 1], E[o + 2], E[o + 3], E[o + 4], E[o + 5]);
      }
    }
    return { all, big };
  }
  // camera fitted to the photo (2000 x 1258, vertical fov 70.85)
  const PHOTO = { eye: [7.6125, 5.2219, 11.1812], target: [2.0140, 1.3088, -13.3690], fov: 72.966, aspect: 2000 / 1258 };
  return { build, featureSegments, silhouetteSegments, polylinesToSegments, meshArrays, prepSil, silFast, PHOTO };
})();

window.RivenPipesG = G;
})();
/* Riven: 3D pipe linework for the "Our pipe" Zoom stage.
   Replaces the flat line-drawing image with a live Three.js line drawing of the same pipe run.
   - Mirrors the stage's CSS zoom every frame (camera view offset), so it stays crisp at any zoom
     and the blue highlight spots stay aligned.
   - On hover it moves like a 3D model: a slight swing while zooming, and a pointer tilt over the drawing.
   - Falls back to the original image if WebGL or the scripts are unavailable. */
(function () {
  "use strict";
  var G = window.RivenPipesG;
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
