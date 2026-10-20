// Fill the result frame without borders; crop evenly around the center when needed.
export function coverPhoto(imageWidth, imageHeight, frameWidth, frameHeight) {
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    scale,
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
    width,
    height,
  };
}
