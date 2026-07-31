import type { CSSProperties } from 'react';
import type { PluginActionContext } from '@editful/canvas-sdk';
import { BROWSER_EDITOR } from '../domain.js';

export function ChangePhotoEditor({
  action,
}: {
  readonly action: PluginActionContext;
}) {
  const changePhoto = () => {
    const nodeId = action.selection.nodeIds()[0];
    if (nodeId === undefined) return;
    action.editors.open(BROWSER_EDITOR, { mode: 'replace', nodeId });
  };

  return (
    <button
      type="button"
      aria-label="Change selected Unsplash photo"
      style={BUTTON_STYLE}
      onClick={changePhoto}
    >
      Change photo
    </button>
  );
}

const BUTTON_STYLE: CSSProperties = {
  height: '28px',
  padding: '0 11px',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  borderRadius: '6px',
  color: '#f4f1ea',
  background: 'rgba(255, 255, 255, 0.07)',
  font: '500 10px/1 "IBM Plex Mono", ui-monospace, monospace',
  letterSpacing: '0.01em',
  cursor: 'pointer',
};
