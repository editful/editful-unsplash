import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { PluginActionContext } from '@editful/canvas-sdk';
import {
  BROWSER_EDITOR,
  KIND,
  assertActive,
  browserMode,
  browserModeKey,
  normalizedQuery,
  randomPhotos,
  replacePhoto,
  requiredBoardId,
  search,
  track,
  trackAndPlace,
  type DiscoveryCacheEntry,
  type Photo,
} from '../domain.js';
import { PhotoCard } from './PhotoCard.js';

export function UnsplashBrowser({
  action,
  discoveryCache,
}: {
  readonly action: PluginActionContext;
  readonly discoveryCache: Map<string, DiscoveryCacheEntry>;
}) {
  const actionRef = useRef(action);
  actionRef.current = action;
  const mode = browserMode(action);
  const modeKey = browserModeKey(mode);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const previousModeKey = useRef(modeKey);
  const requestSequence = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const selectingRef = useRef(false);
  const queryInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [photos, setPhotos] = useState<readonly Photo[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    queryInput.current?.focus();
    const sequence = ++requestSequence.current;
    setStatus('Loading photos…');
    void randomPhotos(actionRef.current, discoveryCache).then(
      (nextPhotos) => {
        if (
          !mounted.current ||
          sequence !== requestSequence.current ||
          actionRef.current.signal.aborted
        ) return;
        setPhotos(nextPhotos);
        setStatus('');
      },
      (cause: unknown) => {
        if (
          !mounted.current ||
          sequence !== requestSequence.current ||
          actionRef.current.signal.aborted
        ) return;
        setStatus(
          cause instanceof Error ? cause.message : 'Unsplash photos failed',
        );
      },
    );
    return () => {
      mounted.current = false;
      requestSequence.current++;
      clearTimeout(searchTimer.current);
    };
  }, [discoveryCache]);

  useEffect(() => {
    if (previousModeKey.current === modeKey) return;
    previousModeKey.current = modeKey;
    requestSequence.current++;
    clearTimeout(searchTimer.current);
    setPhotos([]);
    setStatus('');
    setSelectedPhotoId(null);
  }, [modeKey]);

  const runSearch = async (value: string): Promise<void> => {
    if (selectingRef.current || value.trim() === '') return;
    const sequence = ++requestSequence.current;
    setStatus('Searching Unsplash…');
    setPhotos([]);
    try {
      const nextPhotos = await search(normalizedQuery(value), actionRef.current);
      if (
        !mounted.current ||
        sequence !== requestSequence.current ||
        actionRef.current.signal.aborted
      ) return;
      setPhotos(nextPhotos);
      setStatus(
        nextPhotos.length === 0 ? 'No photos matched that search.' : '',
      );
    } catch (cause) {
      if (
        !mounted.current ||
        sequence !== requestSequence.current ||
        actionRef.current.signal.aborted
      ) return;
      setStatus(
        cause instanceof Error ? cause.message : 'Unsplash search failed',
      );
    }
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    requestSequence.current++;
    clearTimeout(searchTimer.current);
    if (value.trim() === '') {
      setStatus('');
      setPhotos([]);
      return;
    }
    searchTimer.current = setTimeout(() => void runSearch(value), 350);
  };

  const choosePhoto = async (photo: Photo): Promise<void> => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    setSelecting(true);
    setSelectedPhotoId(photo.id);
    const currentMode = modeRef.current;
    setStatus(
      currentMode.mode === 'replace' ? 'Changing photo…' : 'Adding photo…',
    );
    try {
      const currentAction = actionRef.current;
      assertActive(currentAction);
      if (currentMode.mode === 'replace') {
        const snapshot = currentAction.document.inspect([currentMode.nodeId])[0];
        if (snapshot?.kind !== KIND) {
          throw new Error('The selected Unsplash photo is no longer available.');
        }
        await track(photo, requiredBoardId(currentAction), currentAction);
        assertActive(currentAction);
        replacePhoto(photo, currentMode.nodeId, currentAction);
      } else {
        await trackAndPlace(photo, { x: 0, y: 0 }, currentAction);
      }
      currentAction.ui.notify({
        title: currentMode.mode === 'replace' ? 'Photo changed' : 'Photo added',
        message: `Photo by ${photo.photographerName} on Unsplash`,
        tone: 'success',
      });
      currentAction.editors.close(BROWSER_EDITOR);
    } catch (cause) {
      if (mounted.current && !actionRef.current.signal.aborted) {
        setStatus(
          cause instanceof Error ? cause.message : 'Could not use that photo',
        );
        setSelectedPhotoId(null);
      }
    } finally {
      selectingRef.current = false;
      if (mounted.current) setSelecting(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearTimeout(searchTimer.current);
    void runSearch(query);
  };

  const close = () => {
    requestSequence.current++;
    clearTimeout(searchTimer.current);
    actionRef.current.editors.close(BROWSER_EDITOR);
  };

  return (
    <div style={BROWSER_STYLE}>
      <form style={SEARCH_FORM_STYLE} onSubmit={submit}>
        <input
          ref={queryInput}
          type="search"
          required
          maxLength={200}
          placeholder="Search Unsplash"
          aria-label="Search Unsplash photos"
          value={query}
          disabled={selecting}
          style={SEARCH_INPUT_STYLE}
          onChange={(event) => updateQuery(event.currentTarget.value)}
        />
        <button
          type="button"
          title="Close Unsplash"
          aria-label="Close Unsplash"
          style={CLOSE_BUTTON_STYLE}
          onClick={close}
        >
          ×
        </button>
      </form>
      <div role="status" aria-live="polite" style={STATUS_STYLE}>
        {status}
      </div>
      <div aria-label="Unsplash search results" style={RESULTS_STYLE}>
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            disabled={selecting}
            selected={selectedPhotoId === photo.id}
            onChoose={choosePhoto}
          />
        ))}
      </div>
    </div>
  );
}

const BROWSER_STYLE: CSSProperties = {
  display: 'grid',
  marginTop: '-10px',
  color: '#f4f1ea',
  font: '10px/1.35 "IBM Plex Mono", ui-monospace, monospace',
};
const SEARCH_FORM_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 24px',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 0',
  position: 'sticky',
  top: '0',
  zIndex: '3',
  background: '#15161a',
};
const SEARCH_INPUT_STYLE: CSSProperties = {
  minWidth: '0',
  height: '30px',
  padding: '0 9px',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '6px',
  outline: 'none',
  color: '#f4f1ea',
  background: 'rgba(0, 0, 0, 0.22)',
  font: '10px/1 "IBM Plex Mono", ui-monospace, monospace',
};
const CLOSE_BUTTON_STYLE: CSSProperties = {
  width: '24px',
  height: '24px',
  padding: '0',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '5px',
  color: 'rgba(244, 241, 234, 0.72)',
  background: 'rgba(255, 255, 255, 0.04)',
  font: '18px/20px ui-sans-serif, sans-serif',
  cursor: 'pointer',
};
const STATUS_STYLE: CSSProperties = {
  color: 'rgba(244, 241, 234, 0.56)',
  fontSize: '9px',
};
const RESULTS_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '8px',
};
