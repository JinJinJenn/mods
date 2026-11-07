/*
 * JinJinJenn garden overlay. Dependency-free WebGL 1, with no external assets.
 *
 * const gpu = new JinGardenGPU({canvas, hero, anchors: [orangeAnchor, purpleAnchor],
 *   reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
 *   onState: ({available}) => showPngJewels(!available)});
 *
 * burst(x, y) accepts CLIENT viewport coordinates (event.clientX/clientY).
 * The anchor elements must retain their layout boxes when PNG fallbacks are hidden.
 * setPaused(true) freezes the GPU scene; setEnabled(false) requests PNG fallback.
 * This file owns only its canvas, its GL resources, and window.__jinGPUStats.
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const RADIUS = 0.58;
  const HALF_HEIGHT = 1.18;
  const AMBIENT_MAX = 24;
  const BURST_MAX = 32;
  const PARTICLE_STRIDE = 10;
  const PALETTES = [
    [[1.0, 0.34, 0.035], [0.04, 0.95, 0.78]],
    [[0.65, 0.055, 1.0], [0.08, 0.80, 1.0]]
  ];

  const JEWEL_VS = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute float aFacet;
    uniform mat4 uMVP;
    uniform mat4 uModel;
    varying mediump vec3 vNormal;
    varying mediump vec3 vLocal;
    varying mediump float vFacet;
    void main() {
      vNormal = mat3(uModel) * aNormal;
      vLocal = aPosition;
      vFacet = aFacet;
      gl_Position = uMVP * vec4(aPosition, 1.0);
    }`;

  const JEWEL_FS = `
    precision mediump float;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uEdge;
    uniform float uNight;
    varying mediump vec3 vNormal;
    varying mediump vec3 vLocal;
    varying mediump float vFacet;
    void main() {
      if (uEdge > 0.5) {
        float alpha = 0.38 + 0.10 * uNight;
        vec3 color = mix(uColorA, uColorB, 0.48) * 0.65 + vec3(0.35);
        gl_FragColor = vec4(color * alpha, alpha);
        return;
      }
      vec3 n = normalize(vNormal);
      vec3 light = normalize(vec3(-0.55, 0.80, 1.0));
      float diffuse = 0.25 + 0.75 * max(dot(n, light), 0.0);
      float facet = 0.5 + 0.5 * sin(vFacet * 1.71 + vLocal.y * 3.6 + vLocal.x * 2.0);
      vec3 base = mix(uColorA, uColorB, smoothstep(0.20, 0.96, facet) * 0.68);
      float rim = pow(1.0 - abs(n.z), 2.0);
      float specular = pow(max(dot(n, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 28.0);
      vec3 color = base * (diffuse + 0.16 + uNight * 0.04)
                 + uColorB * rim * 0.26 + vec3(specular * 0.60);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }`;

  const HALO_VS = `
    attribute vec2 aPosition;
    varying mediump vec2 vUv;
    void main() { vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const HALO_FS = `
    precision mediump float;
    uniform vec3 uColor;
    uniform float uIntensity;
    varying mediump vec2 vUv;
    void main() {
      vec2 d = (vUv - 0.5) * vec2(2.0, 1.35);
      float glow = max(0.0, 1.0 - dot(d, d));
      float edge = (1.0 - smoothstep(0.25, 0.5, abs(vUv.x - 0.5)))
                 * (1.0 - smoothstep(0.28, 0.5, abs(vUv.y - 0.5)));
      float alpha = glow * glow * glow * edge * uIntensity;
      gl_FragColor = vec4(uColor * alpha, alpha);
    }`;

  const PARTICLE_VS = `
    attribute vec4 aSeed;
    attribute vec4 aMotion;
    attribute float aKind;
    attribute float aHue;
    uniform float uTime;
    uniform float uDpr;
    uniform float uGravity;
    uniform float uAmbient;
    varying mediump float vAlpha;
    varying mediump float vHue;
    void main() {
      vec2 p;
      float size;
      if (aKind < 0.5) {
        float pulse = 0.5 + 0.5 * sin(uTime * 0.85 + aSeed.z);
        p = aSeed.xy + vec2(sin(uTime * aMotion.x + aSeed.z) * 0.013,
                           cos(uTime * aMotion.y + aSeed.z * 0.8) * 0.018);
        vAlpha = (0.10 + 0.42 * pulse * pulse) * uAmbient;
        size = aSeed.w + pulse * 0.35;
      } else {
        float age = max(0.0, uTime - aMotion.z);
        float life = clamp(age / max(aMotion.w, 0.01), 0.0, 1.0);
        p = aSeed.xy + aMotion.xy * age + vec2(0.0, uGravity * age * age);
        vAlpha = (1.0 - life) * (1.0 - life) * 0.80;
        size = aSeed.w * (1.0 - life * 0.35);
      }
      vHue = aHue;
      gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
      gl_PointSize = max(1.0, size * uDpr);
    }`;

  const PARTICLE_FS = `
    precision mediump float;
    varying mediump float vAlpha;
    varying mediump float vHue;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float radius = length(p);
      float glow = 1.0 - smoothstep(0.10, 1.0, radius);
      float core = 1.0 - smoothstep(0.02, 0.32, radius);
      float alpha = (glow * glow * 0.65 + core * 0.35) * vAlpha;
      vec3 color = mix(vec3(1.0, 0.80, 0.38), vec3(0.50, 1.0, 0.88), vHue);
      gl_FragColor = vec4(color * alpha, alpha);
    }`;

  function multiply(out, a, b) {
    for (let column = 0; column < 4; column++) {
      const c = column * 4;
      for (let row = 0; row < 4; row++) {
        out[c + row] = a[row] * b[c] + a[4 + row] * b[c + 1]
                     + a[8 + row] * b[c + 2] + a[12 + row] * b[c + 3];
      }
    }
  }

  function perspective(out, aspect, distance) {
    const f = 1 / Math.tan(Math.PI / 10); // 36-degree vertical field of view.
    const near = 0.1, far = distance + 8;
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) / (near - far); out[11] = -1;
    out[14] = 2 * far * near / (near - far);
  }

  function modelMatrix(out, x, y, z, bob) {
    const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y);
    const sz = Math.sin(z), cz = Math.cos(z);
    out[0] = cz * cy - sz * sx * sy; out[1] = sz * cy + cz * sx * sy; out[2] = -cx * sy; out[3] = 0;
    out[4] = -sz * cx; out[5] = cz * cx; out[6] = sx; out[7] = 0;
    out[8] = cz * sy + sz * sx * cy; out[9] = sz * sy - cz * sx * cy; out[10] = cx * cy; out[11] = 0;
    out[12] = 0; out[13] = bob; out[14] = 0; out[15] = 1;
  }

  function jewelGeometry() {
    const vertices = [], lines = [], ring = [];
    const top = [0, HALF_HEIGHT, 0], bottom = [0, -HALF_HEIGHT, 0];
    for (let i = 0; i < 8; i++) ring.push([Math.cos(i * TAU / 8) * RADIUS, 0, Math.sin(i * TAU / 8) * RADIUS]);
    function triangle(a, b, c, facet) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz); nx /= length; ny /= length; nz /= length;
      for (const p of [a, b, c]) vertices.push(p[0], p[1], p[2], nx, ny, nz, facet);
    }
    for (let i = 0; i < 8; i++) {
      const next = ring[(i + 1) % 8];
      triangle(top, next, ring[i], i);
      triangle(bottom, ring[i], next, i + 8);
      lines.push(...top, ...ring[i], ...bottom, ...ring[i], ...ring[i], ...next);
    }
    return {vertices: new Float32Array(vertices), lines: new Float32Array(lines)};
  }

  class JinGardenGPU {
    constructor(options) {
      options = options || {};
      this.canvas = options.canvas;
      this.hero = options.hero || (this.canvas && this.canvas.parentElement);
      this.anchors = Array.from(options.anchors || []).slice(0, 2);
      this.onState = typeof options.onState === 'function' ? options.onState : function () {};
      this._enabled = true; this._paused = false; this._night = true;
      this._destroyed = false; this._lost = false; this._contextAvailable = false;
      this._inView = true; this._documentHidden = !!document.hidden;
      this._raf = 0; this._lastDraw = 0; this._time = 0; this._forceDraw = true;
      this._cleanups = []; this._resources = []; this._bursts = [];
      this._forcedReducedMotion = !!options.reducedMotion;
      this._motionQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
      this._coarseQuery = global.matchMedia ? global.matchMedia('(pointer: coarse)') : null;
      this._reducedMotion = this._forcedReducedMotion || !!(this._motionQuery && this._motionQuery.matches);
      this._mobile = false; this._dpr = 1; this._cssWidth = 1; this._cssHeight = 1;
      this._model = new Float32Array(16); this._viewModel = new Float32Array(16);
      this._projection = new Float32Array(16); this._mvp = new Float32Array(16);
      this._particleData = new Float32Array((AMBIENT_MAX + BURST_MAX) * PARTICLE_STRIDE);
      this._ambientSeeds = [];
      let seed = 172903;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < AMBIENT_MAX; i++) this._ambientSeeds.push([
        0.07 + random() * 0.86, 0.33 + random() * 0.53, random() * TAU,
        1.4 + random() * 1.5, 0.25 + random() * 0.35, 0.25 + random() * 0.30, random() * 0.55
      ]);
      this.stats = global.__jinGPUStats = {
        available: false, supported: false, enabled: true, paused: false,
        reducedMotion: this._reducedMotion, mobile: false, dpr: 1, frameCap: 60,
        frames: 0, drawCalls: 0, drawCallsTotal: 0, particles: 0, jewels: 0,
        contextLosses: 0, lastError: null, offscreen: false, renderer: 'WebGL 1'
      };
      this._frame = this._frame.bind(this);
      if (!this.canvas || !this.hero || typeof this.canvas.getContext !== 'function'
          || typeof this.hero.getBoundingClientRect !== 'function' || this.anchors.length !== 2
          || this.anchors.some(anchor => !anchor || typeof anchor.getBoundingClientRect !== 'function')) {
        this._fail('A canvas, hero, and two persistent anchor elements are required.');
        return;
      }
      Object.assign(this.canvas.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        pointerEvents: 'none', visibility: 'hidden'
      });
      this.canvas.setAttribute('aria-hidden', 'true');
      this._listen(this.canvas, 'webglcontextlost', event => {
        event.preventDefault(); this._lost = true; this._contextAvailable = false;
        this.stats.contextLosses++; this._cancel(); this._notify('context-lost');
      });
      this._listen(this.canvas, 'webglcontextrestored', () => {
        if (this._destroyed) return;
        this._lost = false; this._resources = [];
        this._initialize(); this.resize();
      });
      this._listen(document, 'visibilitychange', () => {
        this._documentHidden = !!document.hidden; this._lastDraw = 0;
        this._forceDraw = true; this._sync();
      });
      this._listen(global, 'resize', () => this.resize(), {passive: true});
      this._listen(global, 'scroll', () => {
        const wasInView = this._inView;
        if (!this._intersectionObserver) this._inView = this._isInViewport();
        if (this._paused || this._reducedMotion || !this._inView || wasInView !== this._inView) this.resize();
      }, {passive: true, capture: true});
      if (this._motionQuery) {
        const updateMotion = () => {
          this._reducedMotion = this._forcedReducedMotion || this._motionQuery.matches;
          this._lastDraw = 0; this._forceDraw = true;
          this._notify('motion-preference'); this._sync();
        };
        if (this._motionQuery.addEventListener) this._listen(this._motionQuery, 'change', updateMotion);
        else { this._motionQuery.addListener(updateMotion); this._cleanups.push(() => this._motionQuery.removeListener(updateMotion)); }
      }
      if (global.ResizeObserver) {
        this._resizeObserver = new ResizeObserver(() => this.resize());
        this._resizeObserver.observe(this.hero);
        for (const anchor of this.anchors) this._resizeObserver.observe(anchor);
      }
      if (global.IntersectionObserver) {
        this._intersectionObserver = new IntersectionObserver(entries => {
          this._inView = entries[0].isIntersecting;
          this._lastDraw = 0; this._forceDraw = true; this._sync();
        }, {threshold: 0});
        this._intersectionObserver.observe(this.hero);
      } else this._inView = this._isInViewport();
      this._initialize();
      this.resize();
    }

    _listen(target, event, callback, options) {
      target.addEventListener(event, callback, options);
      this._cleanups.push(() => target.removeEventListener(event, callback, options));
    }

    _isInViewport() {
      const r = this.hero.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.top < global.innerHeight && r.left < global.innerWidth;
    }

    _program(vertexSource, fragmentSource, attributes, uniforms) {
      const gl = this.gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Cannot allocate a WebGL shader.');
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed.';
          gl.deleteShader(shader); throw new Error(message);
        }
        return shader;
      };
      let vertex = null, fragment = null, program = null;
      try {
        vertex = compile(gl.VERTEX_SHADER, vertexSource);
        fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
        program = gl.createProgram();
        if (!program) throw new Error('Cannot allocate a WebGL program.');
        gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed.');
        const result = {handle: program};
        for (const name of attributes) result[name] = gl.getAttribLocation(program, name);
        for (const name of uniforms) result[name] = gl.getUniformLocation(program, name);
        this._resources.push(['program', program]);
        return result;
      } catch (error) {
        if (program) gl.deleteProgram(program);
        throw error;
      } finally {
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
      }
    }

    _buffer(data, usage) {
      const gl = this.gl, buffer = gl.createBuffer();
      if (!buffer) throw new Error('Cannot allocate a WebGL buffer.');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
      this._resources.push(['buffer', buffer]);
      return buffer;
    }

    _initialize() {
      if (this._destroyed) return;
      try {
        const settings = {alpha: true, premultipliedAlpha: true, antialias: true, depth: true,
          stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power'};
        this.gl = this.canvas.getContext('webgl', settings) || this.canvas.getContext('experimental-webgl', settings);
        if (!this.gl) throw new Error('WebGL is unavailable.');
        const gl = this.gl;
        this._maxSize = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
        this._jewel = this._program(JEWEL_VS, JEWEL_FS,
          ['aPosition', 'aNormal', 'aFacet'], ['uMVP', 'uModel', 'uColorA', 'uColorB', 'uEdge', 'uNight']);
        this._halo = this._program(HALO_VS, HALO_FS, ['aPosition'], ['uColor', 'uIntensity']);
        this._particle = this._program(PARTICLE_VS, PARTICLE_FS,
          ['aSeed', 'aMotion', 'aKind', 'aHue'], ['uTime', 'uDpr', 'uGravity', 'uAmbient']);
        this._attributeLocations = Array.from(new Set([
          this._jewel.aPosition, this._jewel.aNormal, this._jewel.aFacet, this._halo.aPosition,
          this._particle.aSeed, this._particle.aMotion, this._particle.aKind, this._particle.aHue
        ].filter(location => location >= 0)));
        const geometry = jewelGeometry();
        this._jewelBuffer = this._buffer(geometry.vertices); this._jewelCount = geometry.vertices.length / 7;
        this._lineBuffer = this._buffer(geometry.lines); this._lineCount = geometry.lines.length / 3;
        this._quadBuffer = this._buffer(new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]));
        this._particleBuffer = this._buffer(this._particleData.byteLength, gl.DYNAMIC_DRAW);
        gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.depthFunc(gl.LEQUAL);
        gl.frontFace(gl.CCW); gl.cullFace(gl.BACK);
        this._contextAvailable = true; this.stats.lastError = null;
        this._notify('ready');
      } catch (error) { this._fail(error && error.message || String(error)); }
    }

    _notify(reason) {
      const available = this._contextAvailable && this._enabled && !this._lost && !this._destroyed;
      Object.assign(this.stats, {available, supported: this._contextAvailable, enabled: this._enabled,
        paused: this._paused, reducedMotion: this._reducedMotion, reason});
      if (this.canvas && this.canvas.style) this.canvas.style.visibility = available ? 'visible' : 'hidden';
      try { this.onState({available, supported: this._contextAvailable, enabled: this._enabled,
        paused: this._paused, reducedMotion: this._reducedMotion, reason}); } catch (_) { /* UI callbacks cannot break GL cleanup. */ }
    }

    _fail(message) {
      this._contextAvailable = false; this.stats.lastError = message;
      this._cancel(); this._notify('unavailable');
    }

    _cancel() {
      if (this._raf) global.cancelAnimationFrame(this._raf);
      this._raf = 0; this._lastDraw = 0;
    }

    _canDraw() {
      return !this._destroyed && !this._lost && this._contextAvailable && this._enabled && this._inView && !this._documentHidden;
    }

    _sync() {
      this.stats.offscreen = !this._inView;
      this.stats.documentHidden = this._documentHidden;
      if (!this._canDraw()) { this._cancel(); return; }
      if (!this._raf) this._raf = global.requestAnimationFrame(this._frame);
    }

    _measure() {
      const rect = this.canvas.getBoundingClientRect();
      this._canvasRect = rect;
      if (rect.width <= 0 || rect.height <= 0) return false;
      this._cssWidth = rect.width; this._cssHeight = rect.height;
      // Compact-preview widths are independent of the browser's physical viewport.
      const heroWidth = this.hero.clientWidth || this.hero.getBoundingClientRect().width;
      this._mobile = heroWidth < 700 || !!(this._coarseQuery && this._coarseQuery.matches);
      const cap = this._mobile ? 1.25 : 1.5;
      const requestedDpr = Math.min(global.devicePixelRatio || 1, cap);
      this._dpr = Math.min(requestedDpr, this._maxSize / rect.width, this._maxSize / rect.height);
      const width = Math.max(1, Math.round(rect.width * this._dpr));
      const height = Math.max(1, Math.round(rect.height * this._dpr));
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      Object.assign(this.stats, {mobile: this._mobile, dpr: this._dpr, frameCap: this._mobile ? 30 : 60,
        cssWidth: rect.width, cssHeight: rect.height, bufferWidth: width, bufferHeight: height});
      return true;
    }

    _frame(now) {
      this._raf = 0;
      if (!this._canDraw()) return;
      const animate = !this._paused && !this._reducedMotion;
      const interval = 1000 / (this._mobile ? 30 : 60);
      if (this._forceDraw || !this._lastDraw || now - this._lastDraw >= interval - 0.5) {
        if (animate && this._lastDraw) this._time += Math.min(0.1, (now - this._lastDraw) / 1000);
        this._lastDraw = now; this._forceDraw = false;
        try { this._render(); } catch (error) { this._fail(error && error.message || String(error)); }
      }
      if (animate) this._sync();
    }

    _attribute(location, size, stride, offset) {
      if (location < 0) return;
      const gl = this.gl;
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
    }

    _disableAttributes() {
      // Programs use at most four attributes, but locations need not be consecutive.
      const gl = this.gl;
      for (const location of this._attributeLocations) gl.disableVertexAttribArray(location);
    }

    _drawJewel(anchor, index) {
      const gl = this.gl, rect = anchor.getBoundingClientRect(), canvasRect = this._canvasRect;
      if (rect.width < 2 || rect.height < 2) return;
      const sx = this.canvas.width / canvasRect.width, sy = this.canvas.height / canvasRect.height;
      const x = Math.round((rect.left - canvasRect.left) * sx);
      const y = Math.round((canvasRect.bottom - rect.bottom) * sy);
      const width = Math.max(1, Math.round(rect.width * sx)), height = Math.max(1, Math.round(rect.height * sy));
      const clipX = Math.max(0, x), clipY = Math.max(0, y);
      const clipRight = Math.min(this.canvas.width, x + width), clipTop = Math.min(this.canvas.height, y + height);
      if (clipRight <= clipX || clipTop <= clipY) return;
      gl.viewport(x, y, width, height); // Keep the full viewport even if the anchor is partly clipped.
      gl.enable(gl.SCISSOR_TEST); gl.scissor(clipX, clipY, clipRight - clipX, clipTop - clipY);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this._disableAttributes();
      const halo = this._halo, palette = PALETTES[index];
      gl.useProgram(halo.handle); gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
      this._attribute(halo.aPosition, 2, 0, 0);
      gl.uniform3fv(halo.uColor, palette[1]); gl.uniform1f(halo.uIntensity, this._night ? 0.18 : 0.10);
      gl.drawArrays(gl.TRIANGLES, 0, 6); this.stats.drawCalls++;

      const aspect = width / height, tanV = Math.tan(Math.PI / 10), padding = 0.93;
      // Bound the tilted tips and the rotating equatorial ring separately. The
      // distance depends only on the anchor aspect, so rotation never changes size.
      const tipDistance = 0.16 + Math.max(0.08 / (tanV * aspect), 1.215 / tanV) / padding;
      const ringDistance = RADIUS + Math.max(RADIUS / (tanV * aspect), (RADIUS + 0.035) / tanV) / padding;
      const distance = Math.max(tipDistance, ringDistance) + 0.05;
      const phase = index * 1.7, t = this._time;
      modelMatrix(this._model, 0.10 + Math.sin(t * 0.65 + phase) * 0.035,
        t * (index ? -0.36 : 0.32) + phase + 0.32,
        Math.sin(t * 0.48 + phase) * 0.065, Math.sin(t * 1.35 + phase) * 0.035);
      this._viewModel.set(this._model); this._viewModel[14] -= distance;
      perspective(this._projection, aspect, distance); multiply(this._mvp, this._projection, this._viewModel);
      const jewel = this._jewel;
      this._disableAttributes(); gl.useProgram(jewel.handle);
      gl.uniformMatrix4fv(jewel.uMVP, false, this._mvp); gl.uniformMatrix4fv(jewel.uModel, false, this._model);
      gl.uniform3fv(jewel.uColorA, palette[0]); gl.uniform3fv(jewel.uColorB, palette[1]);
      gl.uniform1f(jewel.uNight, this._night ? 1 : 0); gl.uniform1f(jewel.uEdge, 0);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._jewelBuffer);
      this._attribute(jewel.aPosition, 3, 28, 0); this._attribute(jewel.aNormal, 3, 28, 12); this._attribute(jewel.aFacet, 1, 28, 24);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, this._jewelCount); this.stats.drawCalls++;
      gl.disable(gl.POLYGON_OFFSET_FILL);

      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(jewel.uEdge, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._lineBuffer); this._attribute(jewel.aPosition, 3, 0, 0);
      gl.disableVertexAttribArray(jewel.aNormal); gl.vertexAttrib3f(jewel.aNormal, 0, 0, 1);
      gl.disableVertexAttribArray(jewel.aFacet); gl.vertexAttrib1f(jewel.aFacet, 0); gl.lineWidth(1);
      gl.drawArrays(gl.LINES, 0, this._lineCount); this.stats.drawCalls++; this.stats.jewels++;
    }

    _drawParticles() {
      const gl = this.gl, program = this._particle, data = this._particleData;
      const ambientCount = this._mobile ? 14 : AMBIENT_MAX;
      let count = 0;
      for (let i = 0; i < ambientCount; i++) {
        const s = this._ambientSeeds[i], offset = count++ * PARTICLE_STRIDE;
        data[offset] = s[0]; data[offset+1] = s[1]; data[offset+2] = s[2]; data[offset+3] = s[3];
        data[offset+4] = s[4]; data[offset+5] = s[5]; data[offset+6] = 0; data[offset+7] = 1;
        data[offset+8] = 0; data[offset+9] = s[6];
      }
      let live = 0;
      for (let i = 0; i < this._bursts.length; i++) {
        const b = this._bursts[i];
        if (this._time - b.birth >= b.duration) continue;
        this._bursts[live++] = b;
        const offset = count++ * PARTICLE_STRIDE;
        data[offset] = b.x; data[offset+1] = b.y; data[offset+2] = 0; data[offset+3] = b.size;
        data[offset+4] = b.vx; data[offset+5] = b.vy; data[offset+6] = b.birth; data[offset+7] = b.duration;
        data[offset+8] = 1; data[offset+9] = b.hue;
      }
      this._bursts.length = live;
      this._disableAttributes(); gl.useProgram(program.handle);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._particleBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * PARTICLE_STRIDE));
      this._attribute(program.aSeed, 4, 40, 0); this._attribute(program.aMotion, 4, 40, 16);
      this._attribute(program.aKind, 1, 40, 32); this._attribute(program.aHue, 1, 40, 36);
      gl.uniform1f(program.uTime, this._time); gl.uniform1f(program.uDpr, this._dpr);
      gl.uniform1f(program.uGravity, 42 / this._cssHeight); gl.uniform1f(program.uAmbient, this._night ? 1 : 0.6);
      gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, count); this.stats.drawCalls++; this.stats.particles = count;
    }

    _render() {
      const started = global.performance.now();
      if (!this._measure()) return;
      const gl = this.gl;
      this.stats.drawCalls = 0; this.stats.jewels = 0;
      gl.disable(gl.SCISSOR_TEST); gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (let i = 0; i < this.anchors.length; i++) this._drawJewel(this.anchors[i], i);
      this._drawParticles();
      this.stats.frames++; this.stats.drawCallsTotal += this.stats.drawCalls;
      this.stats.cpuFrameMs = +(global.performance.now() - started).toFixed(3);
      this.stats.time = +this._time.toFixed(3);
    }

    setEnabled(value) {
      if (this._destroyed) return;
      this._enabled = !!value; this._lastDraw = 0; this._forceDraw = true;
      this._notify(this._enabled ? 'enabled' : 'disabled'); this._sync();
    }

    setPaused(value) {
      if (this._destroyed) return;
      this._paused = !!value; this._lastDraw = 0; this._forceDraw = true;
      this._notify(this._paused ? 'paused' : 'resumed'); this._sync();
    }

    setNight(value) {
      if (this._destroyed) return;
      this._night = !!value; this._forceDraw = true; this._sync();
    }

    resize() {
      if (this._destroyed) return;
      this._forceDraw = true; this._sync();
    }

    burst(clientX, clientY) {
      if (!this._canDraw() || this._paused || this._reducedMotion) return false;
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
      const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return false;
      const count = this._mobile ? 10 : 16;
      if (this._bursts.length + count > BURST_MAX) this._bursts.splice(0, this._bursts.length + count - BURST_MAX);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU + Math.random() * 0.3, speed = 22 + Math.random() * 42;
        this._bursts.push({x, y, vx: Math.cos(angle) * speed / rect.width,
          vy: (Math.sin(angle) * speed - 20) / rect.height, birth: this._time,
          duration: 0.55 + Math.random() * 0.55, size: 2.5 + Math.random() * 2.6, hue: Math.random() * 0.65});
      }
      this._forceDraw = true; this._sync();
      return true;
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true; this._cancel();
      if (this._resizeObserver) this._resizeObserver.disconnect();
      if (this._intersectionObserver) this._intersectionObserver.disconnect();
      for (const cleanup of this._cleanups) cleanup(); this._cleanups.length = 0;
      if (this.gl && !this._lost) {
        for (const [kind, resource] of this._resources) {
          if (kind === 'program') this.gl.deleteProgram(resource); else this.gl.deleteBuffer(resource);
        }
        const extension = this.gl.getExtension('WEBGL_lose_context');
        if (extension) extension.loseContext();
      }
      this._resources.length = 0; this._bursts.length = 0; this._contextAvailable = false;
      this._notify('destroyed'); this.gl = null;
    }
  }

  global.JinGardenGPU = JinGardenGPU;
})(window);
