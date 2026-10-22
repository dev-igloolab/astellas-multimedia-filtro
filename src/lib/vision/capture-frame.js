// Match the camera source to the portrait video element.
export function captureFrame(
  videoWidth,
  videoHeight,
  previewWidth,
  previewHeight,
) {
  const aspect = previewWidth / previewHeight;
  const width = Math.min(videoWidth, videoHeight * aspect);
  const height = width / aspect;
  return {
    x: (videoWidth - width) / 2,
    y: (videoHeight - height) / 2,
    width,
    height,
  };
}

// The camera UI shows only the upper part of that video element. Capture precisely
// that visible region so the saved photo matches what the person framed on screen.
export function visibleCaptureFrame(
  videoWidth,
  videoHeight,
  displayWidth,
  displayHeight,
  visibleHeight,
) {
  const frame = captureFrame(
    videoWidth,
    videoHeight,
    displayWidth,
    displayHeight,
  );
  const fraction = Math.max(0, Math.min(1, visibleHeight / displayHeight));
  return { ...frame, height: frame.height * fraction };
}
