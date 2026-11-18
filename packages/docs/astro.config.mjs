import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
export default defineConfig({
  base: '/docs/',
  vite: {
    environments: {
      prerender: { resolve: { noExternal: ['@astrojs/starlight'] } },
    },
  },
  integrations: [
    starlight({
      title: 'Janotate',
      customCss: ['./src/theme.css'],
      sidebar: [
        { label: 'Start', items: [{ label: 'Quick start', slug: '' }] },
        {
          label: 'Interfaces',
          items: [{ autogenerate: { directory: 'interfaces' } }],
        },
        {
          label: 'Concepts',
          items: [{ autogenerate: { directory: 'concepts' } }],
        },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Agents', items: [{ autogenerate: { directory: 'agents' } }] },
        {
          label: 'Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
})
