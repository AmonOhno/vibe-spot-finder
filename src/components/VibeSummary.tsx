import { VIBE_IDS, VIBE_LABELS, type AnalysisResult } from '../analysis/types';

interface Props {
  result: AnalysisResult;
  thumbnails: string[];
}

export function VibeSummary({ result, thumbnails }: Props) {
  const { profile, dominant, features, frameCount } = result;
  return (
    <div className="vibe-summary">
      {dominant.length > 0 ? (
        <ul className="tags" aria-label="主な雰囲気" data-testid="dominant-vibes">
          {dominant.map((id) => (
            <li key={id} className={`tag tag-${id}`} data-vibe={id}>
              {VIBE_LABELS[id]}
            </li>
          ))}
        </ul>
      ) : (
        <p className="warning" data-testid="no-vibe">
          はっきりした雰囲気を判定できませんでした。風景や色味がわかる別の写真・動画をお試しください。
        </p>
      )}

      <dl className="bars" data-testid="vibe-scores">
        {VIBE_IDS.map((id) => (
          <div key={id} className="bar-row" data-vibe={id}>
            <dt>{VIBE_LABELS[id]}</dt>
            <dd>
              <span className="bar" style={{ width: `${Math.round(profile[id] * 100)}%` }} />
              <span className="bar-value">{Math.round(profile[id] * 100)}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="palette" aria-label="代表色" data-testid="palette">
        {features.palette.map((c) => (
          <span key={c} className="swatch" style={{ background: c }} title={c} />
        ))}
      </div>

      <div className="frames">
        <p className="note" data-testid="frame-count">
          解析フレーム数: {frameCount}
        </p>
        <div className="frame-list">
          {thumbnails.map((src, i) => (
            <img key={i} src={src} alt={`解析フレーム ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
