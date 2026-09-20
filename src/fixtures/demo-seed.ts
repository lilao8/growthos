import type { PageSnapshot, Product } from '@/domain/types';
import type { DemoState } from '@/repositories/types';
import { demoStateSchema, SCHEMA_VERSION } from '@/repositories/types';
import { DEMO_AS_OF } from '@/domain/demo-window';

/**
 * Dispatch 0 fixture — deliberately tiny.
 *
 * Three SKUs and two page snapshots, enough to prove the storage contract and
 * give later dispatches a shape to extend. The full 15+ SKU catalogue and the
 * 90-day session/order data set are built in Dispatch 2 and Dispatch 6.
 *
 * All of this is clearly-labelled demo data for a fictional brand.
 */

export const DEMO_BRAND = 'NorthTrail Outdoor';
export const DEMO_MARKET = 'North America';
export const DEMO_SITE_ORIGIN = 'https://northtrail.example.com';

const products: Product[] = [
  {
    id: 'prd_ridgeline_2p_tent',
    sku: 'NT-TENT-RDG2',
    slug: 'ridgeline-2p-backpacking-tent',
    title: 'Ridgeline 2P Backpacking Tent',
    category: 'Tents & Shelters',
    priceCents: 32900,
    costCents: 14200,
    inventory: 84,
    status: 'active',
    primaryKeyword: '2 person backpacking tent',
    metaTitle: 'Ridgeline 2P Backpacking Tent | NorthTrail Outdoor',
    metaDescription:
      'A 3.9 lb freestanding two-person tent with a full-coverage rainfly, built for three-season backcountry trips.',
    productDescription:
      'The Ridgeline 2P is a freestanding two-person shelter weighing 3.9 lb packed. Aluminium poles, a 20D ripstop fly rated to 1800 mm, and two vestibules for gear storage.',
  },
  {
    id: 'prd_summit_20_bag',
    sku: 'NT-BAG-SMT20',
    slug: 'summit-20-down-sleeping-bag',
    title: 'Summit 20 Down Sleeping Bag',
    category: 'Sleeping',
    priceCents: 27500,
    costCents: 11800,
    inventory: 42,
    status: 'active',
    primaryKeyword: '20 degree down sleeping bag',
    metaTitle: 'Summit 20 Down Sleeping Bag',
    metaDescription: 'A 20°F down bag for three-season use.',
    productDescription:
      'Filled with 650 fill-power responsibly sourced down. Comfort rated to 20°F, packed weight 2.1 lb, includes a compression sack and a cotton storage sack.',
  },
  {
    id: 'prd_trailcell_lantern',
    sku: 'NT-LGT-TCL1',
    slug: 'trailcell-rechargeable-lantern',
    title: 'TrailCell Rechargeable Lantern',
    category: 'Lighting',
    priceCents: 5900,
    costCents: 2100,
    inventory: 0,
    status: 'draft',
    primaryKeyword: '',
    metaTitle: '',
    metaDescription: '',
    productDescription:
      'A 400-lumen USB-C rechargeable lantern with a 40-hour low-mode runtime.',
  },
];

const pageSnapshots: PageSnapshot[] = [
  {
    id: 'snap_ridgeline_2p_tent',
    productId: 'prd_ridgeline_2p_tent',
    url: `${DEMO_SITE_ORIGIN}/products/ridgeline-2p-backpacking-tent`,
    metaTitle: 'Ridgeline 2P Backpacking Tent | NorthTrail Outdoor',
    metaDescription:
      'A 3.9 lb freestanding two-person tent with a full-coverage rainfly, built for three-season backcountry trips.',
    h1: 'Ridgeline 2P Backpacking Tent',
    headings: [
      { level: 1, text: 'Ridgeline 2P Backpacking Tent' },
      { level: 2, text: 'Who this tent is for' },
      { level: 2, text: 'Specifications' },
      { level: 2, text: 'Frequently asked questions' },
    ],
    bodyText:
      'The Ridgeline 2P is a freestanding two-person backpacking tent weighing 3.9 lb packed. It sets up in under four minutes with two aluminium poles and sleeps two adults on 20 inch pads.',
    images: [
      {
        src: '/images/ridgeline-2p-pitched.jpg',
        alt: 'Ridgeline 2P tent pitched on an alpine ridge at dusk',
        decorative: false,
      },
      { src: '/images/divider.svg', alt: '', decorative: true },
    ],
    internalLinks: [
      {
        href: '/collections/tents',
        anchorText: 'All NorthTrail tents',
      },
      {
        href: '/guides/how-to-choose-a-backpacking-tent',
        anchorText: 'How to choose a backpacking tent',
      },
    ],
    canonical: `${DEMO_SITE_ORIGIN}/products/ridgeline-2p-backpacking-tent`,
    indexability: 'index',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Ridgeline 2P Backpacking Tent',
        sku: 'NT-TENT-RDG2',
        offers: {
          '@type': 'Offer',
          price: '329.00',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
    directAnswer:
      'The Ridgeline 2P weighs 3.9 lb packed, sleeps two adults, and is rated for three-season use.',
    faq: [
      {
        question: 'How much does the Ridgeline 2P weigh?',
        answer: '3.9 lb (1.77 kg) packed, including poles, stakes and fly.',
      },
      {
        question: 'Is it freestanding?',
        answer:
          'Yes. It pitches without stakes, though staking the vestibules is recommended in wind.',
      },
    ],
    facts: [
      { label: 'Packed weight', value: '3.9 lb / 1.77 kg' },
      { label: 'Floor area', value: '29 sq ft' },
      { label: 'Fly waterproof rating', value: '1800 mm' },
      { label: 'Season rating', value: '3-season' },
    ],
    evidence: [
      {
        label: 'In-house field test, 14 nights, Cascades 2026',
        url: `${DEMO_SITE_ORIGIN}/journal/ridgeline-field-test`,
      },
    ],
    originalityClaim:
      'Weights and pack sizes measured in-house on a calibrated scale; field notes from a 14-night test.',
    capturedAt: DEMO_AS_OF,
  },
  {
    // Deliberately incomplete: exercises "missing" and "unknown" handling in the
    // audit engines built in Dispatch 3 and 4. Absent data must never score as a pass.
    id: 'snap_summit_20_bag',
    productId: 'prd_summit_20_bag',
    url: `${DEMO_SITE_ORIGIN}/products/summit-20-down-sleeping-bag`,
    metaTitle: 'Summit 20 Down Sleeping Bag',
    metaDescription: 'A 20°F down bag for three-season use.',
    h1: null,
    headings: [{ level: 2, text: 'Summit 20 Down Sleeping Bag' }],
    bodyText:
      'Our best sleeping bag ever. Incredible warmth, amazing value, you will love it on every adventure.',
    images: [
      { src: '/images/summit-20-hero.jpg', alt: null, decorative: false },
    ],
    internalLinks: [],
    canonical: null,
    indexability: 'unknown',
    structuredData: [],
    directAnswer: null,
    faq: [],
    facts: [],
    evidence: [],
    originalityClaim: null,
    capturedAt: DEMO_AS_OF,
  },
];

/**
 * Returns a fresh, validated copy of the seed state. Callers may mutate the
 * result freely; the fixture itself is never handed out by reference.
 */
export function buildDemoSeedState(): DemoState {
  const candidate: DemoState = {
    schemaVersion: SCHEMA_VERSION,
    products: structuredClone(products),
    pageSnapshots: structuredClone(pageSnapshots),
  };

  // The fixture is parsed like any other boundary input: a bad fixture should
  // fail loudly in tests rather than flow into the domain.
  const parsed = demoStateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new TypeError(
      `Demo seed fixture is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}
