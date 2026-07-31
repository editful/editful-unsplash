import {
  PluginActionCancelledError,
  type PluginActionContext,
  type PluginImporterInput,
} from '@editful/canvas-sdk';

export const KIND = 'editful:unsplash-photo';
export const BROWSER_EDITOR = 'editful:unsplash-browser';
export const CHANGE_PHOTO_EDITOR = 'editful:unsplash-change-photo';
export const MAX_PREVIEW_BYTES = 512 * 1024;

const SERVICE = 'https://assets-canvas.sam.ink';
const MAX_INTERACTION_LABEL = 200;
const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;

export interface Photo {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
  readonly previewUrl: string;
  readonly downloadLocation: string;
  readonly photoPage: string;
  readonly photographerName: string;
  readonly photographerProfile: string;
  readonly altDescription: string;
}

export interface DiscoveryCacheEntry {
  readonly expiresAt: number;
  readonly photos: readonly Photo[];
}

export type BrowserMode =
  | { readonly mode: 'create' }
  | { readonly mode: 'replace'; readonly nodeId: string };

export function boundedInteractionLabel(value: string): string {
  return value.length <= MAX_INTERACTION_LABEL
    ? value
    : `${value.slice(0, MAX_INTERACTION_LABEL - 1)}…`;
}

export function browserMode(action: PluginActionContext): BrowserMode {
  const value = action.editors.state(BROWSER_EDITOR);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { mode: 'create' };
  }
  const state = value as Readonly<Record<string, unknown>>;
  if (state.mode === 'replace' && typeof state.nodeId === 'string') {
    return { mode: 'replace', nodeId: state.nodeId };
  }
  return { mode: 'create' };
}

export function browserModeKey(mode: BrowserMode): string {
  return mode.mode === 'create' ? 'create' : `replace:${mode.nodeId}`;
}

export function requiredBoardId(action: PluginActionContext): string {
  if (action.boardId === undefined) throw new Error('Board identity is unavailable');
  return action.boardId;
}

export function assertActive(action: PluginActionContext): void {
  if (action.signal.aborted) throw new PluginActionCancelledError();
}

export async function search(
  query: string,
  action: PluginActionContext,
): Promise<Photo[]> {
  const boardId = requiredBoardId(action);
  const response = await action.network.request({
    url: `${SERVICE}/v1/boards/${encodeURIComponent(boardId)}/integrations/unsplash/search?query=${encodeURIComponent(query)}&per_page=30`,
    method: 'GET',
    response: 'json',
    auth: 'board',
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error('Unsplash search failed');
  }
  return parseSearch(response.body);
}

export async function randomPhotos(
  action: PluginActionContext,
  cache: Map<string, DiscoveryCacheEntry>,
): Promise<readonly Photo[]> {
  const boardId = requiredBoardId(action);
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  const cached = cache.get(boardId);
  if (cached !== undefined) return cached.photos;

  const response = await action.network.request({
    url: `${SERVICE}/v1/boards/${encodeURIComponent(boardId)}/integrations/unsplash/random?count=30`,
    method: 'GET',
    response: 'json',
    auth: 'board',
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error('Unsplash photos failed');
  }
  const photos = parseSearch(response.body);
  assertActive(action);
  cache.set(boardId, {
    expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
    photos,
  });
  return photos;
}

export async function trackAndPlace(
  photo: Photo,
  point: { readonly x: number; readonly y: number },
  action: PluginActionContext,
  size?: { readonly width: number; readonly height: number },
): Promise<void> {
  assertActive(action);
  await track(photo, requiredBoardId(action), action);
  assertActive(action);
  place(photo, point, action, size);
}

export async function track(
  photo: Photo,
  boardId: string,
  action: PluginActionContext,
): Promise<void> {
  if (photo.downloadLocation === '') return;
  const response = await action.network.request({
    url: `${SERVICE}/v1/boards/${encodeURIComponent(boardId)}/integrations/unsplash/downloads`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      photo_id: photo.id,
      download_location: photo.downloadLocation,
    }),
    response: 'json',
    auth: 'board',
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error('Unsplash download tracking failed');
  }
}

export function place(
  photo: Photo,
  point: { readonly x: number; readonly y: number },
  action: PluginActionContext,
  size?: { readonly width: number; readonly height: number },
): void {
  const ratio = Math.max(0.2, Math.min(5, photo.width / photo.height));
  const width = size?.width ?? Math.min(520, Math.max(240, 360 * ratio));
  const height = size?.height ?? width / ratio;
  const transaction = action.document.transaction('Add Unsplash photo');
  transaction.create({
    kind: KIND,
    x: point.x,
    y: point.y,
    width,
    height,
    fields: photoFields(photo),
  });
  transaction.commit();
}

export function replacePhoto(
  photo: Photo,
  nodeId: string,
  action: PluginActionContext,
): void {
  const transaction = action.document.transaction('Change Unsplash photo');
  transaction.update({
    id: nodeId,
    fields: photoFields(photo),
  });
  transaction.commit();
}

function photoFields(photo: Photo): Readonly<Record<string, string>> {
  return {
    'remote-url': photo.url,
    'photo-id': photo.id,
    'photo-page-url': referral(photo.photoPage),
    'photographer-name': photo.photographerName,
    'photographer-profile-url':
      photo.photographerProfile === ''
        ? ''
        : referral(photo.photographerProfile),
    'alt-description': photo.altDescription,
  };
}

function parseSearch(value: unknown): Photo[] {
  const object = record(value);
  if (!Array.isArray(object.results) || object.results.length > 30) {
    throw new Error('Unsplash search response is invalid');
  }
  return object.results.map(parsePhoto);
}

function parsePhoto(value: unknown): Photo {
  const object = record(value);
  const urls = record(object.urls);
  return {
    id: boundedText(object.id, 128),
    width: positive(object.width),
    height: positive(object.height),
    url: https(boundedText(urls.regular, 8192), 'images.unsplash.com'),
    previewUrl: https(boundedText(urls.thumb, 8192), 'images.unsplash.com'),
    downloadLocation: https(
      boundedText(object.download_location, 8192),
      'api.unsplash.com',
    ),
    photoPage: https(boundedText(object.photo_page, 8192)),
    photographerName: boundedText(object.photographer_name, 1024),
    photographerProfile: https(
      boundedText(object.photographer_profile, 8192),
    ),
    altDescription: optionalBoundedText(object.alt_description, 4096),
  };
}

export function importedUrl(input: PluginImporterInput): string | null {
  for (const candidate of [
    ...(input.uriList ?? []),
    ...(input.text === undefined ? [] : [input.text.trim()]),
  ]) {
    try {
      return https(candidate, 'images.unsplash.com');
    } catch {
      // Continue to the next candidate.
    }
  }
  return null;
}

export function photoIdFromUrl(value: string): string {
  const match = /\/photo-([A-Za-z0-9_-]+)/u.exec(new URL(value).pathname);
  return match?.[1] ?? 'imported';
}

export function referral(value: string): string {
  const url = new URL(https(value));
  url.searchParams.set('utm_source', 'editful');
  url.searchParams.set('utm_medium', 'referral');
  return https(url.toString());
}

function https(value: string, host?: string): string {
  if (value.length === 0 || value.length > 8192) {
    throw new Error('Remote URL is invalid');
  }
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (host !== undefined && url.hostname !== host)
  ) throw new Error('Remote URL is invalid');
  return value;
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Unsplash response is invalid');
  }
  return value as Record<string, unknown>;
}

export function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value === '' || value.length > maximum) {
    throw new Error('Unsplash response text is invalid');
  }
  return value;
}

function optionalBoundedText(value: unknown, maximum: number): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error('Unsplash response text is invalid');
  }
  return value;
}

function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('Unsplash response dimensions are invalid');
  }
  return value;
}

export function normalizedQuery(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Unsplash query is invalid');
  }
  const query = value.trim();
  if (query === '' || query.length > 200) {
    throw new Error('Unsplash query is invalid');
  }
  return query;
}

export function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Unsplash placement coordinate is invalid');
  }
  return value;
}

export function placedSize(value: unknown): number {
  const size = finite(value);
  if (size < 1 || size > 10_000) {
    throw new Error('Unsplash placement size is invalid');
  }
  return size;
}

export function previewMimeType(
  value: string | undefined,
): 'image/jpeg' | 'image/webp' | 'image/avif' {
  const mimeType = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (
    mimeType !== 'image/jpeg' &&
    mimeType !== 'image/webp' &&
    mimeType !== 'image/avif'
  ) {
    throw new Error('Unsplash preview returned an unsupported image type');
  }
  return mimeType;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
