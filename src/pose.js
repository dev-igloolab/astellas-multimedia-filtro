import { PoseLandmarker } from '@mediapipe/tasks-vision';
import { visibleCaptureFrame } from './capture-frame.js';

import { visionAssets as files } from './asset-manifest.js';

let detectorPromise;
let analysisCache;
let detectorMode = 'IMAGE';
let modeQueue = Promise.resolve();

async function getBytes(name) {
  const response = await fetch(
    window.ASTELLAS_VISION_ASSETS?.[name] ?? files[name],
  );
  if (!response.ok)
    throw new Error(`No se pudo cargar el recurso de seguimiento: ${name}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function prepareTracking() {
  detectorPromise ??= (async () => {
    const assets = Object.fromEntries(
      await Promise.all(
        Object.keys(files).map(async (name) => [name, await getBytes(name)]),
      ),
    );
    const create = async (loader, wasm) => {
      const wasmLoaderPath = URL.createObjectURL(
        new Blob([assets[loader]], { type: 'text/javascript' }),
      );
      const wasmBinaryPath = URL.createObjectURL(
        new Blob([assets[wasm]], { type: 'application/wasm' }),
      );
      try {
        return await PoseLandmarker.createFromOptions(
          { wasmLoaderPath, wasmBinaryPath },
          {
            baseOptions: { modelAssetBuffer: assets.model, delegate: 'CPU' },
            runningMode: 'IMAGE',
            numPoses: 1,
            outputSegmentationMasks: true,
          },
        );
      } finally {
        URL.revokeObjectURL(wasmLoaderPath);
        URL.revokeObjectURL(wasmBinaryPath);
      }
    };
    try {
      return await create('loader', 'wasm');
    } catch (error) {
      console.warn('Se usará el runtime de visión sin SIMD.', error);
      return create('loaderFallback', 'wasmFallback');
    }
  })().catch((error) => {
    detectorPromise = undefined;
    throw error;
  });
  return detectorPromise;
}

function useDetector(mode, action) {
  const task = modeQueue
    .catch(() => {})
    .then(async () => {
      const detector = await prepareTracking();
      if (detectorMode !== mode) {
        await detector.setOptions({
          runningMode: mode,
          outputSegmentationMasks: mode === 'IMAGE',
        });
        detectorMode = mode;
      }
      return action(detector);
    });
  // La cola serializa el detector sin retener la foto y la máscara de la última tarea.
  modeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export function startLiveTracking(video, onFrame, onError) {
  let active = true;
  let frameId = 0;
  let lastSample = 0;
  let lastVideoTime = -1;
  const sample = document.createElement('canvas');
  sample.width = 360;
  sample.height = 640;
  const context = sample.getContext('2d', { alpha: false });
  const stop = () => {
    active = false;
    cancelAnimationFrame(frameId);
  };

  useDetector('VIDEO', (detector) => {
    if (!active) return;
    const tick = (time) => {
      if (!active) return;
      frameId = requestAnimationFrame(tick);
      if (
        document.hidden ||
        time - lastSample < 120 ||
        video.readyState < 2 ||
        !video.videoWidth ||
        video.currentTime === lastVideoTime
      )
        return;
      lastSample = time;
      lastVideoTime = video.currentTime;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const {
        x: cropLeft,
        y: cropTop,
        width: cropWidth,
        height: cropHeight,
      } = visibleCaptureFrame(
        videoWidth,
        videoHeight,
        video.clientWidth,
        video.clientHeight,
        video.parentElement.clientHeight,
      );
      const sampleHeight = Math.round((sample.width * cropHeight) / cropWidth);
      if (sample.height !== sampleHeight) sample.height = sampleHeight;
      try {
        context.drawImage(
          video,
          cropLeft,
          cropTop,
          cropWidth,
          cropHeight,
          0,
          0,
          sample.width,
          sample.height,
        );
        const result = detector.detectForVideo(sample, time);
        try {
          onFrame(result.landmarks[0] ?? [], {
            videoWidth,
            videoHeight,
            cropWidth,
            cropHeight,
            cropLeft,
            cropTop,
          });
        } finally {
          result.close();
        }
      } catch (error) {
        stop();
        onError?.(error);
      }
    };
    frameId = requestAnimationFrame(tick);
  }).catch((error) => {
    if (active) onError?.(error);
  });

  return stop;
}

export function analyzePhoto(photo) {
  if (analysisCache?.photo === photo) return analysisCache.promise;
  const promise = (async () => {
    const image = new Image();
    image.src = photo;
    await image.decode();
    return useDetector('IMAGE', (detector) => {
      const result = detector.detect(image);
      try {
        const landmarks = result.landmarks[0];
        const mask = result.segmentationMasks?.[0];
        if (!landmarks?.length || !mask) {
          throw new Error(
            'No pudimos ubicar tu cuerpo en la foto. Repite la toma de frente y con buena luz.',
          );
        }
        return {
          image,
          landmarks: landmarks.map(({ x, y, visibility, presence }) => ({
            x,
            y,
            visibility,
            presence,
          })),
          mask: {
            width: mask.width,
            height: mask.height,
            values: Float32Array.from(mask.getAsFloat32Array()),
          },
        };
      } finally {
        result.close();
      }
    });
  })();
  const entry = { photo, promise };
  analysisCache = entry;
  promise.catch(() => {
    if (analysisCache === entry) clearPhotoAnalysis();
  });
  return promise;
}

export function clearPhotoAnalysis() {
  analysisCache = undefined;
}
