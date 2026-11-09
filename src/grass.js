import * as THREE from 'three';

const vertexShader = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uVan;
uniform float uArea;
uniform float uTime;
uniform float uWorld;
uniform float uGridN;
uniform sampler2D tHeight;
uniform sampler2D tSplat;
attribute vec3 aOffset;
varying float vT;
varying float vRand;
#include <fog_pars_vertex>

float hAt(vec2 p) {
  vec2 g = clamp((p / uWorld + 0.5) * (uGridN - 1.0), vec2(0.0), vec2(uGridN - 1.001));
  vec2 i = floor(g);
  vec2 f = g - i;
  float a = texture2D(tHeight, (i + vec2(0.5, 0.5)) / uGridN).r;
  float b = texture2D(tHeight, (i + vec2(1.5, 0.5)) / uGridN).r;
  float c = texture2D(tHeight, (i + vec2(0.5, 1.5)) / uGridN).r;
  float d = texture2D(tHeight, (i + vec2(1.5, 1.5)) / uGridN).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  // Each blade wraps around a square that follows the camera, so the field is infinite.
  vec2 p = aOffset.xy * uArea;
  p -= uArea * floor((p - uCenter.xz) / uArea + 0.5);
  float r = aOffset.z;

  vec4 sp = texture2D(tSplat, p / uWorld + 0.5);
  float grassy = (1.0 - sp.r) * (1.0 - sp.g) * (1.0 - sp.b) * (1.0 - sp.a);
  float h = hAt(p);
  float fade = 1.0 - smoothstep(uArea * 0.32, uArea * 0.5, length(p - uCenter.xz));
  float scale = (0.35 + r * 0.55) * smoothstep(0.4, 0.85, grassy) * fade * step(2.2, h);

  float t = position.y;
  vec3 pos = position;
  pos.x *= 0.7 + fract(r * 13.7) * 0.8;
  float ang = r * 43.0;
  float c = cos(ang), s = sin(ang);
  pos.xz = mat2(c, -s, s, c) * pos.xz;
  pos *= scale;

  float gust = sin(uTime * 1.7 + p.x * 0.07 + p.y * 0.05) * 0.5 + 0.5;
  float sway = sin(uTime * 3.0 + p.x * 0.6 + p.y * 0.4 + r * 6.0) * 0.35 + gust * 0.6;
  vec2 bend = vec2(0.8, 0.45) * sway * t * t * scale;

  vec2 dv = p - uVan.xz;
  float dl = length(dv);
  float push = (1.0 - smoothstep(1.4, 3.4, dl)) * step(abs(uVan.y - h), 2.5);
  bend += (dv / max(dl, 0.001)) * push * t * scale * 1.1;
  pos.y *= 1.0 - push * 0.6;

  vec3 world = vec3(p.x + pos.x + bend.x, h - 0.05 + pos.y, p.y + pos.z + bend.y);
  vT = t;
  vRand = r;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uTip;
uniform vec3 uLight;
varying float vT;
varying float vRand;
#include <fog_pars_fragment>
void main() {
  vec3 col = mix(uBase, uTip, vT) * (0.8 + vRand * 0.4);
  gl_FragColor = vec4(col * uLight, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createGrass({ heightTex, splatTex, gridN, worldSize, count = 70000, area = 70 }) {
  // A tapered blade: 3 segments plus tip, y runs 0..1.
  const blade = new THREE.BufferGeometry();
  const w = 0.07;
  const verts = [
    -w, 0, 0, w, 0, 0,
    -w * 0.8, 0.33, 0, w * 0.8, 0.33, 0,
    -w * 0.5, 0.66, 0, w * 0.5, 0.66, 0,
    0, 1, 0,
  ];
  blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index;
  geo.attributes.position = blade.attributes.position;
  const offsets = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    offsets[i * 3] = Math.random();
    offsets[i * 3 + 1] = Math.random();
    offsets[i * 3 + 2] = Math.random();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geo.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uCenter: { value: new THREE.Vector3() },
        uVan: { value: new THREE.Vector3(0, -999, 0) },
        uArea: { value: area },
        uTime: { value: 0 },
        uWorld: { value: worldSize },
        uGridN: { value: gridN },
        tHeight: { value: null },
        tSplat: { value: null },
        uBase: { value: new THREE.Color('#2f4a12') },
        uTip: { value: new THREE.Color('#9cb84a') },
        uLight: { value: new THREE.Color(1, 1, 1) },
      },
    ]),
  });
  // Textures must be assigned after merge, which clones uniform values.
  material.uniforms.tHeight.value = heightTex;
  material.uniforms.tSplat.value = splatTex;

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    update(time, center, vanPos, light) {
      const u = material.uniforms;
      u.uTime.value = time;
      u.uCenter.value.copy(center);
      u.uVan.value.copy(vanPos);
      u.uLight.value.copy(light);
    },
  };
}
