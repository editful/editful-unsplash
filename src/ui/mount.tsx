import { createRoot } from 'react-dom/client';
import type {
  PluginActionContext,
  PluginEditorInstance,
} from '@editful/canvas-sdk';
import type { DiscoveryCacheEntry } from '../domain.js';
import { ChangePhotoEditor } from './ChangePhotoEditor.js';
import { UnsplashBrowser } from './UnsplashBrowser.js';

export function mountChangePhotoEditor(
  container: HTMLElement,
  initialAction: PluginActionContext,
): PluginEditorInstance {
  let action = initialAction;
  const root = createRoot(container);
  const render = () => root.render(<ChangePhotoEditor action={action} />);
  render();

  return {
    update(nextAction) {
      action = nextAction;
      render();
    },
    dispose() {
      root.unmount();
    },
  };
}

export function mountUnsplashBrowser(
  container: HTMLElement,
  initialAction: PluginActionContext,
  discoveryCache: Map<string, DiscoveryCacheEntry>,
): PluginEditorInstance {
  let action = initialAction;
  const root = createRoot(container);
  const render = () =>
    root.render(
      <UnsplashBrowser action={action} discoveryCache={discoveryCache} />,
    );
  render();

  return {
    update(nextAction) {
      action = nextAction;
      render();
    },
    dispose() {
      root.unmount();
    },
  };
}
