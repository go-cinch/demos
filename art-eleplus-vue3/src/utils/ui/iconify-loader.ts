import { addCollection } from '@iconify/vue'
import remixIcons from '@/assets/icons/ri.json'
import lucideIcons from '@/assets/icons/lucide.json'
import lineIcons from '@/assets/icons/line-md.json'
import spinnerIcons from '@/assets/icons/svg-spinners.json'

// Bundled subsets from @iconify/json 2.2.520. Each collection retains its
// upstream author/license metadata. Core UI icons never depend on a CDN.
for (const collection of [remixIcons, lucideIcons, lineIcons, spinnerIcons]) {
  addCollection(collection)
}
