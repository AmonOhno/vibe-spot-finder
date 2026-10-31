import { useEffect, useMemo, useRef, useState } from 'react';
import { matchSpots } from './analysis/matcher';
import { extractFrames, validateFile, type MediaKind } from './analysis/media';
import type { AnalysisResult } from './analysis/types';
import { analyzeFrames } from './analysis/vibeAnalyzer';
import { REGIONS, SPOTS, type Region } from './data/spots';
import { UploadArea } from './components/UploadArea';
import { VibeSummary } from './components/VibeSummary';
import { SpotList } from './components/SpotList';

interface Selected {
  file: File;
  kind: MediaKind;
  previewUrl: string;
}

type Status = 'idle' | 'ready' | 'analyzing' | 'done';

export function App() {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [region, setRegion] = useState<Region | 'all'>('all');
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!selected) return;
    return () => URL.revokeObjectURL(selected.previewUrl);
  }, [selected]);

  // 解析が終わったら結果まで自動スクロールする
  useEffect(() => {
    if (status === 'done') resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [status]);

  const matches = useMemo(
    () => (result && result.dominant.length > 0 ? matchSpots(result.profile, SPOTS, { region }) : []),
    [result, region],
  );

  const reset = () => {
    setSelected(null);
    setStatus('idle');
    setError(null);
    setResult(null);
    setThumbnails([]);
    setRegion('all');
  };

  const handleFile = (file: File) => {
    const v = validateFile(file);
    reset();
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setSelected({ file, kind: v.kind, previewUrl: URL.createObjectURL(file) });
    setStatus('ready');
  };

  const analyze = async () => {
    if (!selected) return;
    setStatus('analyzing');
    setError(null);
    try {
      const frames = await extractFrames(selected.file, selected.kind);
      setThumbnails(frames.thumbnails);
      setResult(analyzeFrames(frames.pixels));
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析に失敗しました');
      setStatus('ready');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Vibe Spot Finder</h1>
        <p>写真や動画の「雰囲気」から、似たスポットを Google マップで提案します。</p>
      </header>

      <main>
        <section className="card" aria-labelledby="upload-heading">
          <h2 id="upload-heading">1. 写真・動画を選ぶ</h2>
          <UploadArea onFile={handleFile} disabled={status === 'analyzing'} />
          <p className="note">ファイルはブラウザ内だけで解析され、サーバーには送信されません。</p>

          {error && (
            <p role="alert" className="error" data-testid="error-message">
              {error}
            </p>
          )}

          {selected && (
            <div className="preview" data-testid="preview">
              {selected.kind === 'image' ? (
                <img src={selected.previewUrl} alt="選択した画像のプレビュー" />
              ) : (
                <video src={selected.previewUrl} controls muted aria-label="選択した動画のプレビュー" />
              )}
              <div className="preview-meta">
                <span data-testid="file-name">{selected.file.name}</span>
                <span className="badge">{selected.kind === 'image' ? '画像' : '動画'}</span>
              </div>
              <div className="actions">
                <button type="button" className="primary" onClick={analyze} disabled={status === 'analyzing'}>
                  {status === 'analyzing' ? '解析中…' : '雰囲気を解析する'}
                </button>
                <button type="button" onClick={reset} disabled={status === 'analyzing'}>
                  クリア
                </button>
              </div>
            </div>
          )}
        </section>

        {result && (
          <section ref={resultRef} className="card" aria-labelledby="vibe-heading" data-testid="vibe-result">
            <h2 id="vibe-heading">2. 解析された雰囲気</h2>
            <VibeSummary result={result} thumbnails={thumbnails} />
          </section>
        )}

        {result && result.dominant.length > 0 && (
          <section className="card" aria-labelledby="spots-heading" data-testid="spot-section">
            <div className="section-head">
              <h2 id="spots-heading">3. 雰囲気が近いスポット</h2>
              <label className="region">
                エリア
                <select value={region} onChange={(e) => setRegion(e.target.value as Region | 'all')}>
                  <option value="all">すべて</option>
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <SpotList matches={matches} />
          </section>
        )}
      </main>
      <footer className="attribution">
        関東のスポットデータ: ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap contributors
        </a>
        （Overture Maps Foundation 経由、ODbL）
      </footer>
    </div>
  );
}
