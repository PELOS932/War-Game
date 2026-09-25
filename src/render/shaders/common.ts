/** GLSL helpers shared by the terrain, water, sky and object shaders. */
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
// Cellular noise: returns (distance to nearest feature, cell id hash).
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

/** Exact twins of src/render/procedural.ts. */
export const PROC_GLSL = /* glsl */ `
uint pcgh(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hashI(ivec2 p, uint seed) {
  return float(pcgh(uint(p.x) ^ pcgh(uint(p.y) + seed))) * (1.0 / 4294967296.0);
}
float vnoise(vec2 p, uint seed) {
  vec2 i = floor(p); vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 ii = ivec2(i);
  float a = hashI(ii, seed), b = hashI(ii + ivec2(1, 0), seed);
  float c = hashI(ii + ivec2(0, 1), seed), d = hashI(ii + ivec2(1, 1), seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float cityDensity(vec2 p, vec2 c, float r, float seed) {
  float d = length(p - c) / r;
  if (d > 1.6) return 0.0;
  float n = vnoise(vec2(p.x * 4.0 + seed * 0.37, p.y * 4.0 - seed * 0.21), 7u) * 2.0 - 1.0;
  float n2 = vnoise(p * 13.0, 9u) * 2.0 - 1.0;
  d *= 1.0 + 0.32 * n + 0.12 * n2;
  return 1.0 - smoothstep(0.25, 1.0, d);
}
`;

export const DAYLIGHT_GLSL = /* glsl */ `
uniform float uSunLon;
uniform float uSunDecl;
uniform float uDayNight;
uniform vec3 uNightAmbient;
uniform vec2 uWorldSize;
uniform vec2 uLatRange; // (north, south) degrees
uniform vec2 uLonRange; // (west, east) degrees
uniform float uTime;
uniform float uCamDist;
uniform vec3 uSunDir;
uniform float uDayOfYear;
float latAt(float z) { return uLatRange.x - (z / uWorldSize.y) * (uLatRange.x - uLatRange.y); }
float sunAltitude(vec3 wp) {
  float lon = radians(uLonRange.x + (wp.x / uWorldSize.x) * (uLonRange.y - uLonRange.x));
  float lat = radians(latAt(wp.z));
  return sin(lat) * sin(uSunDecl) + cos(lat) * cos(uSunDecl) * cos(lon - uSunLon);
}
float daylightFactor(vec3 wp) {
  return mix(1.0, smoothstep(-0.09, 0.14, sunAltitude(wp)), uDayNight);
}
// 0 at day, 1 deep night (city lights).
float nightFactor(vec3 wp) {
  return uDayNight * smoothstep(0.02, -0.12, sunAltitude(wp));
}
vec3 sunTint(vec3 wp) {
  float a = sunAltitude(wp);
  return mix(vec3(1.0, 0.55, 0.32), vec3(1.0), mix(1.0, smoothstep(0.0, 0.32, a), uDayNight));
}
`;

export const CLOUD_GLSL = /* glsl */ `
uniform float uCloudTime;
uniform float uCloudCover;
uniform float uCloudShadow;
uniform float uCloudsOn;
// Latitude-dependent cloud coverage: ITCZ, dry subtropics, stormy mid-latitudes.
float cloudCoverAt(float lat) {
  float a = abs(lat);
  float itcz = exp(-pow((lat - 4.0) / 8.0, 2.0)) * 0.14;
  float sub = exp(-pow((a - 24.0) / 9.0, 2.0)) * 0.16;
  float mid = smoothstep(35.0, 55.0, a) * 0.12;
  return clamp(uCloudCover + itcz - sub + mid, 0.0, 1.0);
}
float cloudDensity(vec2 xz, float lat, bool cheap) {
  vec2 p = xz * 0.03;
  float t = uCloudTime;
  // Westerlies at mid-latitudes, trade winds (easterly) in the tropics.
  float dir = abs(lat) > 28.0 ? 1.0 : -0.7;
  vec2 q = p + vec2(t * 0.003 * dir, t * 0.0005);
  vec2 w = vec2(fbm2(q * 0.6 + 5.2), fbm2(q * 0.6 - 3.7)) * 0.5;
  float base = fbm4(q + w) * 0.5 + 0.5;
  float cover = cloudCoverAt(lat);
  float th = 1.0 - cover;
  float shape = smoothstep(th - 0.1, th + 0.2, base);
  if (!cheap && shape > 0.0) {
    float det = fbm4(q * 5.5 + w * 3.0);
    shape = clamp(shape * smoothstep(-0.6, 0.3, det + (shape - 0.5) * 0.9) * 1.15, 0.0, 1.0);
  }
  return shape;
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
  [name: string]: { value: unknown };
}
