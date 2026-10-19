import { PoseLandmarker } from '@mediapipe/tasks-vision';

const files = {
  model: '/models/pose_landmarker_lite.task',
  loader: '/mediapipe/vision_wasm_internal.js',
  wasm: '/mediapipe/vision_wasm_internal.wasm',
  loaderFallback: '/mediapipe/vision_wasm_nosimd_internal.js',
  wasmFallback: '/mediapipe/vision_wasm_nosimd_internal.wasm',
};

let detectorPromise;
let analysisCache;

async function getBytes(name) {
  const response = await fetch(window.ASTELLAS_VISION_ASSETS?.[name] ?? files[name]);
  if (!response.ok) throw new Error(`No se pudo cargar el recurso de seguimiento: ${name}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function prepareTracking() {
  detectorPromise ??= (async () => {
    const assets = Object.fromEntries(await Promise.all(
      Object.keys(files).map(async name => [name, await getBytes(name)])
    ));
    const create = (loader, wasm) => PoseLandmarker.createFromOptions({
      wasmLoaderPath: URL.createObjectURL(new Blob([assets[loader]], { type: 'text/javascript' })),
      wasmBinaryPath: URL.createObjectURL(new Blob([assets[wasm]], { type: 'application/wasm' })),
    }, {
      baseOptions: { modelAssetBuffer: assets.model, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 1,
      outputSegmentationMasks: true,
    });
    try {
      return await create('loader', 'wasm');
    } catch (error) {
      console.warn('Se usará el runtime de visión sin SIMD.', error);
      return create('loaderFallback', 'wasmFallback');
    }
  })().catch(error => {
    detectorPromise = undefined;
    throw error;
  });
  return detectorPromise;
}

export function analyzePhoto(photo) {
  if (analysisCache?.photo === photo) return analysisCache.promise;
  const promise = (async () => {
    const detector = await prepareTracking();
    const image = new Image();
    image.src = photo;
    await image.decode();
    const result = detector.detect(image);
    try {
      const landmarks = result.landmarks[0];
      const mask = result.segmentationMasks?.[0];
      if (!landmarks?.length || !mask) {
        throw new Error('No pudimos ubicar tu cuerpo en la foto. Repite la toma de frente y con buena luz.');
      }
      return {
        image,
        landmarks: landmarks.map(({ x, y, visibility, presence }) => ({ x, y, visibility, presence })),
        mask: {
          width: mask.width,
          height: mask.height,
          values: Float32Array.from(mask.getAsFloat32Array()),
        },
      };
    } finally {
      result.close();
    }
  })();
  analysisCache = { photo, promise };
  return promise;
}
