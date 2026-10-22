const iconNames = [
  'bienestar-mental',
  'brazos-piernas',
  'calor-repentino',
  'calor-termometro',
  'cambios-animo',
  'cara-cuello',
  'concentracion',
  'continuar-abajo',
  'grupo-mujeres',
  'imagen',
  'inicio',
  'listo',
  'pecho-espalda',
  'repetir',
  'sofoco',
  'sudoracion-nocturna',
  'todo-cuerpo',
];
export const staticAssets = Object.fromEntries([
  ...iconNames.map((name) => [name, `/assets/iconos/${name}.webp`]),
  ['logo', '/assets/logos/astellas-blanco.webp'],
  ['logoColor', '/assets/logos/astellas-color.webp'],
  ['background', '/assets/fondos/inicio.webp'],
  ['qr', '/assets/qr/menopausia-figma.svg'],
]);

export const visionAssets = {
  model: '/models/pose_landmarker_lite.task',
  loader: '/mediapipe/vision_wasm_internal.js',
  wasm: '/mediapipe/vision_wasm_internal.wasm',
  loaderFallback: '/mediapipe/vision_wasm_nosimd_internal.js',
  wasmFallback: '/mediapipe/vision_wasm_nosimd_internal.wasm',
};
