import { definePluginConfig } from '@editful/plugin-tools';

export default definePluginConfig({
  id: 'editful:unsplash',
  name: 'Unsplash',
  description: 'Search and place Unsplash photos on the canvas.',
  version: '0.1.3',
  entry: './src/index.ts',
  sdkVersion: '0.14.0',
  minAppVersion: '0.12.0',
  maxAppVersion: '0.13.0',
  capabilities: [
    'node-kinds',
    'commands',
    'editor-ui',
    'importers',
    'network',
    'remote-media',
    'interaction-regions',
    'agent-actions',
  ],
  network: [
    {
      origin: 'https://assets-canvas.sam.ink',
      methods: ['GET', 'POST'],
      purpose: 'Browse Unsplash and report photo selections through Editful.',
    },
    {
      origin: 'https://images.unsplash.com',
      methods: ['GET'],
      purpose: 'Fetch a small preview after an agent selects a photo.',
    },
  ],
  remoteMedia: [
    {
      origin: 'https://images.unsplash.com',
      mediaTypes: ['image/avif', 'image/jpeg', 'image/webp'],
      purpose: 'Render the exact image selected by the user.',
    },
  ],
  settings: [],
  secrets: [],
  author: 'Editful',
  homepage: 'https://github.com/editful/editful-unsplash',
  assets: { icons: ['./assets/unsplash.svg'] },
});
