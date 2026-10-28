import type { Frame } from './modelFeatures';

/** 入力ファイルの受け付け条件。docs/SPEC.md §4.1 と一致させること。 */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
/** 動画から抽出するフレーム数。 */
export const VIDEO_FRAME_COUNT = 5;
/** 解析時の縮小サイズ（長辺 px）。解析コストを一定にするため。 */
export const ANALYSIS_SIZE = 96;

export type MediaKind = 'image' | 'video';

export type ValidationResult = { ok: true; kind: MediaKind } | { ok: false; error: string };

export function validateFile(file: Pick<File, 'type' | 'size'>): ValidationResult {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: '画像ファイルは 20MB 以下にしてください' };
    return { ok: true, kind: 'image' };
  }
  if (ACCEPTED_VIDEO_TYPES.includes(file.type)) {
    if (file.size > MAX_VIDEO_BYTES) return { ok: false, error: '動画ファイルは 200MB 以下にしてください' };
    return { ok: true, kind: 'video' };
  }
  return { ok: false, error: '対応していないファイル形式です（JPEG / PNG / WebP / GIF / MP4 / WebM / MOV）' };
}

export interface ExtractedFrames {
  /** 解析用の縮小 RGBA ピクセル列（幅・高さ付き）。 */
  pixels: Frame[];
  /** 画面表示用のサムネイル（data URL）。 */
  thumbnails: string[];
}

function drawToPixels(source: CanvasImageSource, width: number, height: number) {
  const scale = ANALYSIS_SIZE / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas を初期化できませんでした');
  ctx.drawImage(source, 0, 0, w, h);
  return { pixels: ctx.getImageData(0, 0, w, h), thumbnail: canvas.toDataURL('image/jpeg', 0.8) };
}

async function extractFromImage(url: string): Promise<ExtractedFrames> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error('画像を読み込めませんでした');
  }
  const { pixels, thumbnail } = drawToPixels(img, img.naturalWidth, img.naturalHeight);
  return { pixels: [pixels], thumbnails: [thumbnail] };
}

function once(target: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      target.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      target.removeEventListener(event, onOk);
      reject(new Error('動画を読み込めませんでした'));
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

async function extractFromVideo(url: string): Promise<ExtractedFrames> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const loaded = once(video, 'loadeddata');
  video.src = url;
  await loaded;

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const result: ExtractedFrames = { pixels: [], thumbnails: [] };
  for (let i = 0; i < VIDEO_FRAME_COUNT; i++) {
    // 先頭・末尾の暗転を避けるため、両端を除いた等間隔の位置を取る
    const t = (duration * (i + 1)) / (VIDEO_FRAME_COUNT + 1);
    const seeked = once(video, 'seeked');
    video.currentTime = t;
    await seeked;
    const { pixels, thumbnail } = drawToPixels(video, video.videoWidth, video.videoHeight);
    result.pixels.push(pixels);
    result.thumbnails.push(thumbnail);
  }
  return result;
}

/** ファイルを解析用フレームに変換する。ファイルは端末外に送信しない。 */
export async function extractFrames(file: File, kind: MediaKind): Promise<ExtractedFrames> {
  const url = URL.createObjectURL(file);
  try {
    return kind === 'image' ? await extractFromImage(url) : await extractFromVideo(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
