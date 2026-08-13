# Unsplash for Editful

Search Unsplash, place remote photos, and keep photographer attribution on the
canvas. Requests use Editful's authenticated proxy; the plugin contains no
Unsplash credential.

## Install

Editful installs the compiled package from its trusted plugin marketplace. A
tagged release publishes `@editful/plugin-unsplash` to GitHub Packages and
attaches the identical npm tarball to the public GitHub release so desktop
installs need no registry credentials or developer tools.

## Develop

Requires Node.js 26+ and pnpm.

```bash
pnpm install
pnpm verify
```

For live reload, select a **Plugins folder** in Editful, then run:

```bash
pnpm dev --root "$HOME/Documents/Editful Plugins"
```

`pnpm build` writes the unpacked plugin to `dist/editful-unsplash/`.
`pnpm run pack` creates an installable `.editful-plugin` file.
