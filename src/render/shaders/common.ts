/** GLSL helpers shared by the terrain, water and object shaders. */
export const NOISE_GLSL = /* glsl */ `
vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute3(vec3 x) { return mod289v3(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute3(permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm2(vec2 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1); }
float fbm3(vec2 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1) + 0.125 * snoise(p * 4.01 - 9.3); }
float fbm4(vec2 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1) + 0.125 * snoise(p * 4.01 - 9.3) + 0.0625 * snoise(p * 8.05 + 3.7); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// Cellular noise: returns (distance to nearest, cell id hash).
vec2 cellular(vec2 p) {
  vec2 ip = floor(p); vec2 fp = fract(p);
  float best = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(ip + g);
    vec2 r = g + o - fp;
    float d = dot(r, r);
    if (d < best) { best = d; id = hash12(ip + g); }
  }
  return vec2(sqrt(best), id);
}
`;

export const DAYLIGHT_GLSL = /* glsl */ `
uniform float uSunLon;
uniform float uSunDecl;
uniform float uDayNight;
uniform float uNightAmbient;
uniform vec2 uWorldSize;
uniform vec2 uLatRange; // (north, south) degrees
uniform vec2 uLonRange; // (west, east) degrees
float sunAltitude(vec3 wp) {
  float lon = radians(uLonRange.x + (wp.x / uWorldSize.x) * (uLonRange.y - uLonRange.x));
  float lat = radians(uLatRange.x - (wp.z / uWorldSize.y) * (uLatRange.x - uLatRange.y));
  return sin(lat) * sin(uSunDecl) + cos(lat) * cos(uSunDecl) * cos(lon - uSunLon);
}
float daylightFactor(vec3 wp) {
  return mix(1.0, smoothstep(-0.1, 0.16, sunAltitude(wp)), uDayNight);
}
vec3 sunTint(vec3 wp) {
  float a = sunAltitude(wp);
  return mix(vec3(1.0, 0.62, 0.38), vec3(1.0), mix(1.0, smoothstep(0.02, 0.3, a), uDayNight));
}
`;

export const HEX_GLSL = /* glsl */ `
const float SQRT3 = 1.7320508;
ivec2 hexAxial(vec2 p) {
  vec2 q = p - vec2(SQRT3 * 0.5, 1.0);
  float qf = SQRT3 / 3.0 * q.x - q.y / 3.0;
  float rf = 2.0 / 3.0 * q.y;
  float sf = -qf - rf;
  float rq = floor(qf + 0.5), rr = floor(rf + 0.5), rs = floor(sf + 0.5);
  float dq = abs(rq - qf), dr = abs(rr - rf), ds = abs(rs - sf);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return ivec2(int(rq), int(rr));
}
ivec2 axialToOffset(ivec2 a) { int r = a.y; return ivec2(a.x + (r - (r & 1)) / 2, r); }
vec2 axialCenter(ivec2 a) { return vec2(SQRT3 * (float(a.x) + float(a.y) * 0.5), 1.5 * float(a.y)) + vec2(SQRT3 * 0.5, 1.0); }
const ivec2 HEX_DIRS[6] = ivec2[6](ivec2(1, 0), ivec2(0, 1), ivec2(-1, 1), ivec2(-1, 0), ivec2(0, -1), ivec2(1, -1));
const vec2 HEX_NORMALS[6] = vec2[6](vec2(1.0, 0.0), vec2(0.5, 0.8660254), vec2(-0.5, 0.8660254), vec2(-1.0, 0.0), vec2(-0.5, -0.8660254), vec2(0.5, -0.8660254));
`;

/** Shared uniform objects. Assign these objects (not copies) into shader uniforms. */
export interface SharedUniforms {
  uSunLon: { value: number };
  uSunDecl: { value: number };
  uDayNight: { value: number };
  uNightAmbient: { value: number };
  uWorldSize: { value: { x: number; y: number } };
  uLatRange: { value: { x: number; y: number } };
  uLonRange: { value: { x: number; y: number } };
  uTime: { value: number };
}
