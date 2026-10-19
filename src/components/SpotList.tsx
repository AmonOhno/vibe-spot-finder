import type { SpotMatch } from '../analysis/matcher';
import { VIBE_LABELS } from '../analysis/types';

export function SpotList({ matches }: { matches: SpotMatch[] }) {
  if (matches.length === 0) {
    return (
      <p className="warning" data-testid="no-spots">
        このエリアには雰囲気の近いスポットが見つかりませんでした。エリアを変更してください。
      </p>
    );
  }
  return (
    <ol className="spots" data-testid="spot-list">
      {matches.map(({ spot, score, reasons, mapsUrl }) => (
        <li key={spot.id} className="spot" data-testid="spot-item" data-spot-id={spot.id}>
          <div className="spot-head">
            <h3>{spot.name}</h3>
            <span className="score" aria-label="一致度">
              {Math.round(score * 100)}%
            </span>
          </div>
          <p className="spot-area">
            {spot.prefecture}（{spot.region}）
          </p>
          <p>{spot.description}</p>
          <p className="reasons">一致した雰囲気: {reasons.map((r) => VIBE_LABELS[r]).join(' / ')}</p>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="map-link">
            Google マップで開く
          </a>
        </li>
      ))}
    </ol>
  );
}
