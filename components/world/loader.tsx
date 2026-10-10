"use client";

import { useEffect, useRef } from "react";
import styles from "./world.module.css";

/** Shared clock, so consecutive loaders (connecting → save → world) read as one continuous animation. */
const START = typeof performance === "undefined" ? 0 : performance.now();

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 R;
uniform float T;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 ring(vec2 q, float front, inout float a) {
  float c = cos(-0.22), s = sin(-0.22);
  q = mat2(c, -s, s, c) * q;
  if ((q.y < 0.0) != (front > 0.5)) return vec3(0.0);
  vec2 e = q / vec2(0.34, 0.075);
  float d = abs(length(e) - 1.0) * 0.075;
  float ang = atan(e.y, e.x) / 6.2831853;
  float k = fract(ang * 36.0 - T * 0.35);
  float dots = smoothstep(0.0055, 0.0015, d) * smoothstep(0.14, 0.0, abs(k - 0.5));
  a = max(a, smoothstep(0.004, 0.0, d));
  return vec3(0.25, 0.6, 1.0) * exp(-d * 420.0) * 0.5 + vec3(0.7, 0.9, 1.0) * dots * 1.3;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * R) / R.y;
  float hz = -0.14;
  vec3 col = mix(vec3(0.015, 0.03, 0.11), vec3(0.03, 0.09, 0.3), smoothstep(0.55, hz, uv.y));

  if (uv.y > hz) {
    vec2 g = uv * 55.0;
    vec2 id = floor(g);
    float h = hash(id);
    if (h > 0.962) {
      vec2 f = fract(g) - 0.5 - (vec2(hash(id + 1.0), hash(id + 2.0)) - 0.5) * 0.6;
      float tw = 0.45 + 0.55 * sin(T * (1.5 + h * 3.0) + h * 40.0);
      col += smoothstep(0.09, 0.0, length(f)) * tw * vec3(0.6, 0.8, 1.0) * smoothstep(hz, hz + 0.35, uv.y);
    }
  } else {
    float d = hz - uv.y;
    float z = 0.22 / d;
    vec2 p = vec2(uv.x * z * 2.2, z + T * 0.9);
    vec2 f = min(fract(p), 1.0 - fract(p));
    float w = 0.018 * z;
    float line = max(smoothstep(w, 0.0, f.x), smoothstep(w * 1.6, 0.0, f.y));
    col += vec3(0.12, 0.42, 1.0) * line * exp(-z * 0.11) * 1.3;
    col += vec3(0.0, 0.18, 0.75) * exp(-d * 10.0) * 0.55;
  }
  col += vec3(0.25, 0.55, 1.0) * exp(-abs(uv.y - hz) * 70.0) * 0.9;

  vec2 c = vec2(0.0, 0.07 + 0.012 * sin(T * 1.2));
  vec2 q = uv - c;
  float r = 0.16;
  float l = length(q);
  float a = 0.0;

  col += ring(q, 0.0, a);

  col += vec3(0.08, 0.35, 1.0) * exp(-max(l - r, 0.0) * 8.0) * 0.45;
  float disk = smoothstep(r, r - 0.0025, l);
  if (disk > 0.0) {
    vec2 n2 = q / r;
    vec3 n = vec3(n2, sqrt(max(0.0, 1.0 - dot(n2, n2))));
    vec3 L = normalize(vec3(-0.55 + 0.25 * sin(T * 0.4), 0.55, 0.75));
    float diff = max(dot(n, L), 0.0);
    float rim = pow(1.0 - n.z, 2.6);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    float bands = 0.04 * sin(n.y * 18.0 + T * 0.8);
    vec3 orb = vec3(0.0, 0.3, 1.0) * (0.28 + 0.9 * diff + bands) + vec3(0.35, 0.75, 1.0) * rim * 0.9 + spec * 0.55;
    col = mix(col, orb, disk);
  }

  col += ring(q, 1.0, a);

  vec2 v = uv * vec2(0.75, 1.0);
  col *= 1.0 - 0.55 * dot(v, v);
  col += (hash(gl_FragCoord.xy + fract(T)) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("Loader shader:", gl.getShaderInfoLog(shader));
  return null;
}

/** Wordless loading scene in raw WebGL, so it paints before three.js and the game have downloaded. */
export function Loader({ label = "Loading Base World" }: { label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!canvas || !gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "p");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(program, "R");
    const uT = gl.getUniformLocation(program, "T");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const frame = (now: number) => {
      const dpr = Math.min(devicePixelRatio, 1.5);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, still ? 6 : (now - START) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.on = "";
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className={styles.loading} role="progressbar" aria-label={label}>
      <canvas ref={ref} className={styles.loader} />
    </div>
  );
}
