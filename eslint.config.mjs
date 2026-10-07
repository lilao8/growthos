import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next v16 ships flat configs directly, so no FlatCompat bridge.
 */

/**
 * The layering in CLAUDE.md, as a check rather than a promise.
 *
 * `app → services → repositories → fixtures`, with `domain` depending on
 * nothing. Thirteen dispatches kept this clean by hand; these rules are what
 * keeps it clean when nobody is watching. Each zone lists only the layers it
 * must not reach, so a new import in the wrong direction fails `npm run lint`
 * instead of being found later by reading the tree.
 */
const forbid = (layers, message) => ({
  patterns: [{ group: layers.map((l) => `@/${l}/*`), message }],
});

const layerBoundaries = [
  {
    // The core. It is pure by design: injectable time, data and rule versions,
    // no reach into storage or rendering. Nothing outward, with no exception —
    // this is the rule most worth having, because everything else leans on it.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        forbid(
          ['app', 'components', 'services', 'repositories', 'fixtures'],
          'domain depends on nothing. Take the value as an argument instead.',
        ),
      ],
    },
  },
  {
    files: ['src/repositories/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        forbid(
          ['app', 'components', 'services'],
          'repositories sit below services and render nothing.',
        ),
      ],
    },
  },
  {
    files: ['src/fixtures/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/components/*', '@/services/*'],
              message: 'fixtures are data. They sit at the bottom of the chain.',
            },
            {
              // Narrow exception: demo-seed.ts reads the stored shape from
              // `repositories/types` so the seed cannot drift from the schema
              // it has to satisfy. That one module is a contract, not a
              // repository; the rest of the layer stays out of reach.
              group: ['@/repositories/*', '!@/repositories/types'],
              message:
                'fixtures may import repositories/types (the storage contract) and nothing else from that layer.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/services/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        forbid(
          ['app', 'components'],
          'services hold the business rules and never reach into rendering.',
        ),
      ],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*'],
              message:
                'components are reusable. Routes compose them, not the other way round.',
            },
            {
              // Type-only is allowed on purpose: a view declares the repository
              // it expects to be handed, which is the injection seam working as
              // intended. Importing the implementation would make the component
              // reach for its own data, which is the thing being prevented.
              group: ['@/repositories/*'],
              allowTypeImports: true,
              message:
                'components take repositories as injected values. Import the type, never the implementation.',
            },
          ],
        },
      ],
    },
  },
];

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react's automatic version detection uses an ESLint 9 API
    // that was removed in ESLint 10. Declaring the version skips that path.
    settings: { react: { version: '19.3' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  ...layerBoundaries,
  {
    /**
     * The demo data is reproducible, and that is a claim made in public.
     *
     * The README says the deployed figures match a local run digit for digit,
     * and the whole data contract in CLAUDE.md rests on a fixed seed. Both
     * `fixtures/demo-traffic.ts` and `domain/seed.ts` promise determinism in
     * prose; this is the same promise where a later edit cannot quietly break
     * it. Generators take an explicit seed and stay pure.
     */
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Seeded data only: take a seed and use the project PRNG (src/domain/seed.ts), so a run is reproducible.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'crypto',
          message:
            'Seeded data only: random ids make a run unreproducible. Derive the id from the data instead (see fnv1a).',
        },
      ],
    },
  },
];

export default config;
