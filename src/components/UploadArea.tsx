import { useRef, useState, type DragEvent } from 'react';
import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from '../analysis/media';

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadArea({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}`}
      data-testid="dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <p>ここに画像・動画をドラッグ＆ドロップ</p>
      <p className="or">または</p>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}>
        ファイルを選択
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        aria-label="画像または動画ファイル"
        accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <p className="note">JPEG / PNG / WebP / GIF（20MB まで）・MP4 / WebM / MOV（200MB まで）</p>
    </div>
  );
}
