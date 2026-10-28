# Bundled icons

These subsets are extracted from `@iconify/json` 2.2.520 and registered by
`src/utils/ui/iconify-loader.ts` before the application starts. They cover the
Iconify names used by this template, so its core controls work without the
Iconify API or a CDN. Dynamic/custom names retain Iconify's normal loading.

Each JSON retains its upstream author and license metadata. Full notices are
in `licenses/`: Remix Icon (Apache-2.0), Lucide (ISC), Material Line Icons (MIT),
and SVG Spinners (MIT). When adding a static icon, include its data and any
alias parent in the corresponding collection rather than relying on a remote
request for a core control.
