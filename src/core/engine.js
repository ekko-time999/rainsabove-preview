import * as THREE from 'three';

function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uBottom: { value: new THREE.Color(0x120a06) },
        uMid: { value: new THREE.Color(0x8f5a2c) },
        uTop: { value: new THREE.Color(0x080606) }
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBottom;
        uniform vec3 uMid;
        uniform vec3 uTop;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(uBottom, uMid, smoothstep(0.05, 0.52, h));
          c = mix(c, uTop, smoothstep(0.55, 1.0, h));
          float glow = smoothstep(0.62, 0.18, abs(vDir.y - 0.02));
          c += vec3(0.24, 0.12, 0.05) * glow;
          gl_FragColor = vec4(c, 1.0);
        }
      `
    })
  );
  envScene.add(dome);

  const panel = (color, intensity, w, h, pos, rotY, rotX = 0) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...pos);
    mesh.rotation.set(rotX, rotY, 0);
    envScene.add(mesh);
  };

  panel(0xffb46a, 4.2, 16, 7, [0, 2.5, -11], 0);
  panel(0xffc98f, 2.6, 8, 5, [-12, 3, 3], Math.PI / 2);
  panel(0xffd3a1, 2.2, 8, 5, [12, 3, 3], -Math.PI / 2);
  panel(0x7ea6c8, 0.45, 12, 6, [0, 1.5, 13], Math.PI);

  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.38).multiplyScalar(14) })
  );
  spark.position.set(0, 3.4, -2.5);
  envScene.add(spark);

  const target = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();
  envScene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return target;
}

export function createEngine(quality) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070504);
  scene.fog = new THREE.FogExp2(0x090605, 0.014);
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.08, 140);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false
  });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const container = document.getElementById('scene');
  container.appendChild(renderer.domElement);

  const envTarget = buildEnvironment(renderer);
  scene.environment = envTarget.texture;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    camera.aspect = aspect;
    // 竖屏：加大垂直视场角换回一点横向视野，避免只剩一条夹缝；横屏维持 58°
    camera.fov = aspect < 0.78 ? 78 : 58;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, render, resize, envTarget };
}
