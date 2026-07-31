import {
  Primitive,
  TextFont,
  TextVerticalAlign,
  definePlugin,
} from '@editful/canvas-sdk';
import {
  BROWSER_EDITOR,
  CHANGE_PHOTO_EDITOR,
  KIND,
  MAX_PREVIEW_BYTES,
  assertActive,
  boundedInteractionLabel,
  boundedText,
  encodeBase64,
  finite,
  importedUrl,
  normalizedQuery,
  photoIdFromUrl,
  place,
  placedSize,
  previewMimeType,
  record,
  referral,
  search,
  trackAndPlace,
  type DiscoveryCacheEntry,
  type Photo,
} from './domain.js';
import {
  mountChangePhotoEditor,
  mountUnsplashBrowser,
} from './ui/mount.js';

const SEARCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description: 'The Unsplash search query.',
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          photo_id: { type: 'string', minLength: 1, maxLength: 128 },
          width: { type: 'integer', minimum: 1 },
          height: { type: 'integer', minimum: 1 },
          alt_text: { type: 'string', maxLength: 4096 },
        },
        required: [
          'photo_id',
          'width',
          'height',
          'alt_text',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

const PLACE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    photo_id: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      description: 'An Unsplash photo_id returned by search_unsplash.',
    },
    x: {
      type: 'number',
      description: 'Document-space horizontal center for the photo.',
    },
    y: {
      type: 'number',
      description: 'Document-space vertical center for the photo.',
    },
    width: {
      type: 'number',
      minimum: 1,
      maximum: 10_000,
      description: 'Placed width in document-space units.',
    },
    height: {
      type: 'number',
      minimum: 1,
      maximum: 10_000,
      description: 'Placed height in document-space units.',
    },
  },
  required: ['photo_id', 'x', 'y', 'width', 'height'],
  additionalProperties: false,
} as const;

const PLACE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    photo_id: { type: 'string', minLength: 1, maxLength: 128 },
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number', minimum: 1 },
    height: { type: 'number', minimum: 1 },
  },
  required: ['photo_id', 'x', 'y', 'width', 'height'],
  additionalProperties: false,
} as const;

const PREVIEW_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    photo_id: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      description: 'An Unsplash photo_id returned by search_unsplash.',
    },
  },
  required: ['photo_id'],
  additionalProperties: false,
} as const;

const PREVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    image: {
      type: 'object',
      properties: {
        mime_type: { type: 'string', enum: ['image/jpeg', 'image/webp', 'image/avif'] },
        data: { type: 'string', minLength: 1, maxLength: 699_052 },
      },
      required: ['mime_type', 'data'],
      additionalProperties: false,
    },
  },
  required: ['image'],
  additionalProperties: false,
} as const;

export default definePlugin({
  register(context) {
    const agentResults = new Map<string, Photo>();
    const discoveryCache = new Map<string, DiscoveryCacheEntry>();
    const kind = context.kind(KIND);
    const remoteUrl = kind.field.string('remote-url');
    const photoId = kind.field.string('photo-id');
    const photoPageUrl = kind.field.string('photo-page-url');
    const photographerName = kind.field.string('photographer-name');
    const photographerProfileUrl = kind.field.string('photographer-profile-url');
    const altDescription = kind.field.string('alt-description');

    kind.agent({
      name: 'remote_photo',
      description: 'A hotlinked remote image placed by the human Unsplash workflow.',
    });
    kind.interaction({
      id: 'editful:unsplash-open-photographer',
      label: 'Open photographer profile',
      cursor: 'pointer',
      async activate(node, action) {
        const url = node.field<string>('photographer-profile-url');
        if (url !== undefined && url !== '') await action.openExternal(url);
      },
    });
    kind.interaction({
      id: 'editful:unsplash-open-source',
      label: 'Open photo on Unsplash',
      cursor: 'pointer',
      async activate(node, action) {
        const url = node.field<string>('photo-page-url');
        if (url !== undefined && url !== '') await action.openExternal(url);
      },
    });
    kind.pack((node, services, out) => {
      const url = node.get(remoteUrl);
      const photographer = node.get(photographerName);
      const photoPage = node.get(photoPageUrl);
      const profile = node.get(photographerProfileUrl);
      out.quad(
        node.x,
        node.y,
        node.halfW,
        node.halfH,
        node.rotation,
        node.cornerRadius,
        node.strokeWidth,
        Primitive.RoundRect,
        0xff1c1e23,
        node.stroke,
      );
      if (url !== '') {
        out.imageQuad(
          { url },
          node.x,
          node.y,
          node.halfW,
          node.halfH,
          node.rotation,
        );
      }
      const credit =
        photographer === ''
          ? 'Photo on Unsplash'
          : `Photo by ${photographer} on Unsplash`;
      const availableChipWidth = Math.max(1, node.halfW * 2 - 16);
      const naturalChipWidth = Math.max(
        132,
        credit.length * 12 * 0.7 + 20,
      );
      const chipScale = Math.max(
        1 / 3,
        Math.min(1, availableChipWidth / naturalChipWidth),
      );
      const chipWidth = Math.min(
        availableChipWidth,
        naturalChipWidth * chipScale,
      );
      const chipHorizontalPadding = 10 * chipScale;
      const chipHeight = 28;
      const chipX = node.x + node.halfW - chipWidth / 2 - 8;
      const chipY = node.y + node.halfH - chipHeight / 2 - 8;
      const chipTextSize = 12 * chipScale;
      out.textBlock({
        x: chipX,
        y: chipY,
        halfW: chipWidth / 2,
        halfH: chipHeight / 2,
        text: credit,
        style: {
          ...services.text.sharedTextStyle,
          size: chipTextSize,
          align: 'center',
          color: 0xffffffff,
        },
        font: TextFont.Sans,
        wrapWidth: Math.max(1, chipWidth - chipHorizontalPadding * 2),
        padding: chipHorizontalPadding,
        verticalPadding: 0,
        verticalAlign: TextVerticalAlign.Middle,
        background: {
          fill: 0xd9000000,
          cornerRadius: chipHeight / 2,
        },
      });
      if (profile !== '') {
        out.interactionRegion(
          'editful:unsplash-open-photographer',
          chipX - chipWidth * 0.18,
          chipY,
          chipWidth * 0.64,
          chipHeight,
          {
            role: 'link',
            label: boundedInteractionLabel(
              `Open ${photographer}'s profile`,
            ),
          },
        );
      }
      if (photoPage !== '') {
        out.interactionRegion(
          'editful:unsplash-open-source',
          profile === '' ? chipX : chipX + chipWidth * 0.32,
          chipY,
          profile === '' ? chipWidth : chipWidth * 0.36,
          chipHeight,
          { role: 'link', label: 'Open photo on Unsplash' },
        );
      }
      // Reading all six handles here keeps their document projection covered.
      void node.get(photoId);
      void node.get(altDescription);
    });

    context.editor({
      id: BROWSER_EDITOR,
      label: 'Unsplash',
      surface: 'right-sidebar',
      activation: 'manual',
      order: 20,
      mount(container, action) {
        return mountUnsplashBrowser(container, action, discoveryCache);
      },
    });

    context.editor({
      id: CHANGE_PHOTO_EDITOR,
      label: 'Unsplash photo',
      surface: 'toolbar',
      order: 20,
      selection: {
        minimum: 1,
        maximum: 1,
        kinds: [KIND],
      },
      mount: mountChangePhotoEditor,
    });

    context.command({
      id: 'editful:unsplash-search',
      label: 'Search Unsplash',
      description: 'Search and place a remote photo with attribution.',
      shortcut: 'mod+shift+u',
      toolbar: {
        label: 'Unsplash',
        icon: './assets/unsplash.svg',
        order: 40,
        activeEditor: BROWSER_EDITOR,
      },
      async run(action) {
        action.editors.open(BROWSER_EDITOR, {
          mode: 'create',
        });
      },
    });

    context.action({
      id: 'editful:unsplash-search-action',
      name: 'search_unsplash',
      description:
        'Search Unsplash for up to 30 photos and return bounded result metadata for a later placement.',
      inputSchema: SEARCH_INPUT_SCHEMA,
      outputSchema: SEARCH_OUTPUT_SCHEMA,
      requiresConfirmation: true,
      async run(input, action) {
        const query = normalizedQuery(record(input).query);
        const photos = await search(query, action);
        assertActive(action);
        agentResults.clear();
        return {
          results: photos.map((photo) => {
            agentResults.set(photo.id, photo);
            return {
              photo_id: photo.id,
              width: photo.width,
              height: photo.height,
              alt_text: photo.altDescription,
            };
          }),
        };
      },
    });

    context.action({
      id: 'editful:unsplash-preview-action',
      name: 'preview_unsplash',
      description:
        'Return a small image preview for an Unsplash photo_id from the most recent search.',
      inputSchema: PREVIEW_INPUT_SCHEMA,
      outputSchema: PREVIEW_OUTPUT_SCHEMA,
      requiresConfirmation: false,
      async run(input, action) {
        const photoId = boundedText(record(input).photo_id, 128);
        const photo = agentResults.get(photoId);
        if (photo === undefined) {
          throw new Error(
            'Unsplash photo is unavailable; run search_unsplash again',
          );
        }
        const response = await action.network.request({
          url: photo.previewUrl,
          method: 'GET',
          response: 'bytes',
        });
        if (
          response.status < 200 ||
          response.status >= 300 ||
          !(response.body instanceof Uint8Array) ||
          response.body.byteLength > MAX_PREVIEW_BYTES
        ) {
          throw new Error('Unsplash preview failed');
        }
        const mimeType = previewMimeType(response.headers['content-type']);
        return {
          image: {
            mime_type: mimeType,
            data: encodeBase64(response.body),
          },
        };
      },
    });

    context.action({
      id: 'editful:unsplash-place-action',
      name: 'place_unsplash_photo',
      description:
        'Track and place one photo returned by the most recent search_unsplash action.',
      inputSchema: PLACE_INPUT_SCHEMA,
      outputSchema: PLACE_OUTPUT_SCHEMA,
      requiresConfirmation: true,
      async run(input, action) {
        const object = record(input);
        const photoId = boundedText(object.photo_id, 128);
        const photo = agentResults.get(photoId);
        if (photo === undefined) {
          throw new Error(
            'Unsplash result is unavailable; run search_unsplash again',
          );
        }
        const point = {
          x: finite(object.x),
          y: finite(object.y),
        };
        const size = {
          width: placedSize(object.width),
          height: placedSize(object.height),
        };
        await trackAndPlace(photo, point, action, size);
        agentResults.delete(photoId);
        return {
          photo_id: photo.id,
          x: point.x,
          y: point.y,
          width: size.width,
          height: size.height,
        };
      },
    });

    context.importer({
      id: 'editful:unsplash-import-url',
      label: 'Import Unsplash image URL',
      priority: 20,
      match: {
        urlSchemes: ['https'],
        urlHosts: ['images.unsplash.com'],
      },
      async import(input, action) {
        const url = importedUrl(input);
        if (url === null) return 'rejected';
        const dimensions = await action.remoteMedia.probe(url);
        assertActive(action);
        place(
          {
            id: photoIdFromUrl(url),
            width: dimensions.width,
            height: dimensions.height,
            url,
            previewUrl: url,
            downloadLocation: '',
            photoPage: referral('https://unsplash.com'),
            photographerName: '',
            photographerProfile: '',
            altDescription: 'Unsplash photo',
          },
          input.point,
          action,
        );
        return 'handled';
      },
    });
  },
});
