import type { CSSProperties } from 'react';
import type { Photo } from '../domain.js';

export function PhotoCard({
  photo,
  disabled,
  selected,
  onChoose,
}: {
  readonly photo: Photo;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly onChoose: (photo: Photo) => Promise<void>;
}) {
  const label = photo.altDescription || `Photo by ${photo.photographerName}`;
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      style={{
        ...CARD_STYLE,
        outline: selected ? '2px solid #e1bf5c' : undefined,
      }}
      onClick={() => void onChoose(photo)}
    >
      <img
        src={photo.previewUrl}
        alt={label}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={PHOTO_STYLE}
      />
      <span style={BYLINE_STYLE}>By {photo.photographerName}</span>
    </button>
  );
}

const CARD_STYLE: CSSProperties = {
  minWidth: '0',
  padding: '0',
  overflow: 'hidden',
  border: '0',
  borderRadius: '6px',
  color: '#f4f1ea',
  background: 'rgba(255, 255, 255, 0.035)',
  textAlign: 'left',
  cursor: 'pointer',
};
const PHOTO_STYLE: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '86px',
  objectFit: 'cover',
  background: '#1c1e23',
};
const BYLINE_STYLE: CSSProperties = {
  display: 'block',
  padding: '6px 7px 7px',
  overflow: 'hidden',
  color: 'rgba(244, 241, 234, 0.68)',
  font: '8px/1.2 "IBM Plex Mono", ui-monospace, monospace',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
