import { DEMO_AS_OF } from '@/domain/demo-window';
import type {
  Indexability,
  PageSnapshot,
  Product,
  SnapshotEvidence,
  SnapshotFact,
  SnapshotFaqEntry,
  SnapshotHeading,
  SnapshotImage,
  SnapshotInternalLink,
} from '@/domain/types';

/**
 * NorthTrail Outdoor demo catalogue.
 *
 * 17 SKUs across seven categories: 15 active, 1 draft and 1 archived, so status
 * filtering has something real to filter. Prices, costs, inventory and keywords
 * are related the way a small outdoor DTC brand's would be — roughly 55–65%
 * gross margin, deeper stock on cheap fast-moving items, thinner stock on
 * expensive seasonal ones, and one keyword per product that matches what the
 * page is actually about.
 *
 * Each product also carries a page snapshot. The snapshots are deliberately
 * uneven in quality: some are complete, others are missing an H1, a canonical,
 * alt text, internal links or structured data, and a few are marketing fluff
 * with no extractable facts. That unevenness is the raw material the SEO audit
 * (Dispatch 3) and GEO audit (Dispatch 4) will grade — the gaps are authored on
 * purpose, not accidents.
 */

export const DEMO_BRAND = 'NorthTrail Outdoor';
export const DEMO_MARKET = 'North America';
export const DEMO_SITE_ORIGIN = 'https://northtrail.example.com';

type FaqPair = readonly [question: string, answer: string];
type FactPair = readonly [label: string, value: string];
type EvidencePair = readonly [label: string, url: string | null];
type LinkPair = readonly [href: string, anchorText: string];

interface ImageAuthoring {
  alt: string | null;
  decorative?: boolean;
}

interface PageAuthoring {
  /** Body copy as it appears on the page. */
  body: string;
  /** null means the page genuinely has no H1. Omit to use the product title. */
  h1?: string | null;
  /** H2 section headings. Omit for a page with no section structure. */
  sections?: readonly string[];
  /** A sentence that answers the page's core question outright. */
  directAnswer?: string | null;
  faq?: readonly FaqPair[];
  facts?: readonly FactPair[];
  evidence?: readonly EvidencePair[];
  originality?: string | null;
  /** 'self' points at the page itself; a string points elsewhere; null is absent. */
  canonical?: 'self' | string | null;
  indexability?: Indexability;
  images?: readonly ImageAuthoring[];
  links?: readonly LinkPair[];
  /** Whether the page emits Product structured data. */
  structuredData?: boolean;
  /** Page metadata when it differs from the product record. */
  metaTitle?: string | null;
  metaDescription?: string | null;
}

interface CatalogueEntry {
  product: Product;
  /**
   * Relative search demand, used by the traffic generator. Cheap, broadly
   * searched items pull more sessions than expensive niche ones.
   */
  demandWeight: number;
  page: PageAuthoring;
}

const DEFAULT_IMAGES: readonly ImageAuthoring[] = [];

const CATALOGUE: readonly CatalogueEntry[] = [
  {
    product: {
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
    demandWeight: 16,
    page: {
      body: 'The Ridgeline 2P is a freestanding two-person backpacking tent weighing 3.9 lb packed. It sets up in under four minutes with two aluminium poles and sleeps two adults on 20 inch pads.',
      sections: ['Who this tent is for', 'Specifications', 'Frequently asked questions'],
      directAnswer:
        'The Ridgeline 2P weighs 3.9 lb packed, sleeps two adults, and is rated for three-season use.',
      faq: [
        ['How much does the Ridgeline 2P weigh?', '3.9 lb (1.77 kg) packed, including poles, stakes and fly.'],
        ['Is it freestanding?', 'Yes. It pitches without stakes, though staking the vestibules is recommended in wind.'],
      ],
      facts: [
        ['Packed weight', '3.9 lb / 1.77 kg'],
        ['Floor area', '29 sq ft'],
        ['Fly waterproof rating', '1800 mm'],
        ['Season rating', '3-season'],
      ],
      evidence: [
        ['In-house field test, 14 nights, Cascades 2026', `${DEMO_SITE_ORIGIN}/journal/ridgeline-field-test`],
      ],
      originality:
        'Weights and pack sizes measured in-house on a calibrated scale; field notes from a 14-night test.',
      images: [
        { alt: 'Ridgeline 2P tent pitched on an alpine ridge at dusk' },
        { alt: '', decorative: true },
      ],
      links: [
        ['/collections/tents', 'All NorthTrail tents'],
        ['/guides/how-to-choose-a-backpacking-tent', 'How to choose a backpacking tent'],
      ],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_ridgeline_3p_tent',
      sku: 'NT-TENT-RDG3',
      slug: 'ridgeline-3p-backpacking-tent',
      title: 'Ridgeline 3P Backpacking Tent',
      category: 'Tents & Shelters',
      priceCents: 42900,
      costCents: 18600,
      inventory: 37,
      status: 'active',
      primaryKeyword: '3 person backpacking tent',
      metaTitle: 'Ridgeline 3P Backpacking Tent — 5.2 lb, 3-Season | NorthTrail',
      metaDescription:
        'A 5.2 lb freestanding three-person tent with 41 sq ft of floor area and two vestibules, for small groups on three-season trips.',
      productDescription:
        'The three-person Ridgeline shares the 2P geometry with a wider floor: 41 sq ft, 5.2 lb packed, two doors and two vestibules.',
    },
    demandWeight: 9,
    page: {
      body: 'The Ridgeline 3P adds a third sleeping position without a redesign: same pole architecture, same 1800 mm fly, 41 sq ft of floor and 5.2 lb packed weight. Two doors mean nobody climbs over anybody at 2am.',
      sections: ['Who this tent is for', 'Specifications', 'Frequently asked questions'],
      directAnswer:
        'The Ridgeline 3P weighs 5.2 lb packed and sleeps three adults on 20 inch pads with 41 sq ft of floor area.',
      faq: [
        ['Does it really sleep three?', 'Three 20 inch pads fit side by side with no gap. Two people plus gear is more comfortable.'],
        ['How does it differ from the 2P?', 'Same poles and fly material, 12 sq ft more floor and 1.3 lb more weight.'],
      ],
      facts: [
        ['Packed weight', '5.2 lb / 2.36 kg'],
        ['Floor area', '41 sq ft'],
        ['Fly waterproof rating', '1800 mm'],
        ['Doors', '2'],
      ],
      evidence: [['In-house field test, 9 nights, Sierra 2026', null]],
      originality: 'Floor area measured in-house; weight verified on a calibrated scale.',
      images: [{ alt: 'Ridgeline 3P tent with both vestibules open on a forest site' }],
      links: [
        ['/collections/tents', 'All NorthTrail tents'],
        ['/products/ridgeline-2p-backpacking-tent', 'Compare with the Ridgeline 2P'],
      ],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_basecamp_tarp',
      sku: 'NT-TENT-TARP1',
      slug: 'basecamp-ultralight-tarp-shelter',
      title: 'Basecamp Ultralight Tarp Shelter',
      category: 'Tents & Shelters',
      priceCents: 14900,
      costCents: 5800,
      inventory: 120,
      status: 'active',
      primaryKeyword: 'ultralight tarp shelter',
      metaTitle: 'Basecamp Ultralight Tarp Shelter',
      metaDescription: 'A 14 oz silnylon tarp for minimalist shelter setups.',
      productDescription:
        'A 14 oz silnylon tarp with eight tie-out points. Pitches with trekking poles in half a dozen configurations.',
    },
    demandWeight: 11,
    page: {
      // Gap profile: no H1, no section headings, no structured data, thin facts.
      h1: null,
      body: 'A 14 oz silnylon tarp with eight reinforced tie-outs. Pitch it as an A-frame, a lean-to or a flat roof depending on the weather. Trekking poles not included.',
      facts: [
        ['Packed weight', '14 oz / 397 g'],
        ['Material', '20D silnylon'],
      ],
      images: [{ alt: 'Basecamp tarp pitched as an A-frame over a sleeping pad' }],
      links: [['/collections/tents', 'All shelters']],
      structuredData: false,
    },
  },
  {
    product: {
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
    demandWeight: 14,
    page: {
      // Gap profile: the worst page in the catalogue — no H1, no canonical,
      // unknown robots state, missing alt, no links, marketing copy, no facts.
      h1: null,
      body: 'Our best sleeping bag ever. Incredible warmth, amazing value, you will love it on every adventure. Nothing else comes close.',
      sections: [],
      canonical: null,
      indexability: 'unknown',
      images: [{ alt: null }],
      links: [],
      structuredData: false,
    },
  },
  {
    product: {
      id: 'prd_summit_0_bag',
      sku: 'NT-BAG-SMT00',
      slug: 'summit-0-expedition-sleeping-bag',
      title: 'Summit 0 Expedition Sleeping Bag',
      category: 'Sleeping',
      priceCents: 39900,
      costCents: 17400,
      inventory: 18,
      status: 'active',
      primaryKeyword: '0 degree sleeping bag',
      metaTitle: 'Summit 0 Expedition Sleeping Bag — 800 Fill Down | NorthTrail',
      metaDescription:
        'An 800 fill-power down bag comfort rated to 0°F, with a draft collar and full-length baffles for winter and shoulder-season expeditions.',
      productDescription:
        '800 fill-power down, comfort rated to 0°F, 3.1 lb packed. Continuous baffles let you shift loft where you need it.',
    },
    demandWeight: 6,
    page: {
      body: 'The Summit 0 is built for cold nights above treeline: 800 fill-power down, a shaped draft collar, and continuous horizontal baffles that let you move loft to the top on the coldest nights.',
      sections: ['Temperature rating explained', 'Specifications', 'Care and storage'],
      directAnswer:
        'The Summit 0 is comfort rated to 0°F, weighs 3.1 lb, and uses 800 fill-power down.',
      faq: [['What does "comfort rated" mean?', 'The lowest temperature at which a cold sleeper should remain comfortable, per EN/ISO 23537 testing conventions.']],
      facts: [
        ['Comfort rating', '0°F / -18°C'],
        ['Fill power', '800'],
        ['Packed weight', '3.1 lb / 1.41 kg'],
        ['Shell', '15D ripstop nylon'],
      ],
      evidence: [['Third-party EN/ISO 23537 test summary', `${DEMO_SITE_ORIGIN}/docs/summit-0-test-summary`]],
      originality: 'Loft measurements taken in-house after 30 nights of field use.',
      images: [{ alt: 'Summit 0 sleeping bag lofted on a snow platform' }],
      links: [
        ['/collections/sleeping', 'All sleeping bags'],
        ['/guides/sleeping-bag-temperature-ratings', 'Understanding temperature ratings'],
      ],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_cloudbed_pad',
      sku: 'NT-PAD-CLD1',
      slug: 'cloudbed-insulated-sleeping-pad',
      title: 'Cloudbed Insulated Sleeping Pad',
      category: 'Sleeping',
      priceCents: 13900,
      costCents: 5200,
      inventory: 96,
      status: 'active',
      primaryKeyword: 'insulated sleeping pad',
      metaTitle: 'Cloudbed Insulated Sleeping Pad — R-Value 4.5 | NorthTrail',
      metaDescription:
        'An R-4.5 insulated air pad weighing 18 oz, 2.5 inches thick, with a built-in inflation sack for three-season comfort.',
      productDescription:
        'R-4.5 insulated air pad, 2.5 inches thick, 18 oz. Comes with an inflation sack so you are not blowing it up by mouth at altitude.',
    },
    demandWeight: 13,
    page: {
      body: 'An R-4.5 pad at 18 oz is a reasonable three-season compromise: warm enough for frosty ground, light enough to carry. The 2.5 inch loft keeps side sleepers off the dirt.',
      sections: ['What R-value means', 'Specifications'],
      directAnswer: 'The Cloudbed has an R-value of 4.5, weighs 18 oz and is 2.5 inches thick.',
      facts: [
        ['R-value', '4.5'],
        ['Weight', '18 oz / 510 g'],
        ['Thickness', '2.5 in'],
      ],
      images: [{ alt: 'Cloudbed sleeping pad inflated inside a tent' }],
      links: [['/collections/sleeping', 'All sleeping gear']],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_traverse_55',
      sku: 'NT-PACK-TRV55',
      slug: 'traverse-55l-backpacking-pack',
      title: 'Traverse 55L Backpacking Pack',
      category: 'Backpacks',
      priceCents: 24900,
      costCents: 10400,
      inventory: 63,
      status: 'active',
      primaryKeyword: '55l backpacking backpack',
      metaTitle: 'Traverse 55L Backpacking Pack — 3.4 lb | NorthTrail Outdoor',
      metaDescription:
        'A 55 litre internal-frame pack weighing 3.4 lb, rated to 40 lb loads, with an adjustable torso and a removable lid.',
      productDescription:
        '55 litres, 3.4 lb, an aluminium perimeter frame rated to 40 lb, and a torso adjustment range of 16–21 inches.',
    },
    demandWeight: 15,
    page: {
      body: 'The Traverse 55 carries a 40 lb load without the frame flexing. The torso adjusts between 16 and 21 inches, the lid comes off for fast-and-light days, and the hipbelt pockets take a phone the size of a brick.',
      sections: ['Fit and sizing', 'Specifications', 'Frequently asked questions'],
      directAnswer:
        'The Traverse 55L weighs 3.4 lb, holds 55 litres, and is rated to carry up to 40 lb.',
      faq: [
        ['How do I measure my torso length?', 'Measure from the C7 vertebra to the top of your iliac crest. 16–18 in is the short frame, 18–21 in the regular.'],
        ['Is the lid removable?', 'Yes, and the pack has a built-in flap so you can leave it at home.'],
      ],
      facts: [
        ['Volume', '55 L'],
        ['Weight', '3.4 lb / 1.54 kg'],
        ['Max recommended load', '40 lb / 18 kg'],
        ['Torso range', '16–21 in'],
      ],
      evidence: [['Load-carry testing notes, 12 trips', `${DEMO_SITE_ORIGIN}/journal/traverse-load-testing`]],
      originality: 'Frame deflection measured in-house under 40 lb static load.',
      images: [{ alt: 'Traverse 55L pack loaded on a hiker climbing a scree slope' }],
      links: [
        ['/collections/backpacks', 'All backpacks'],
        ['/guides/how-to-fit-a-backpack', 'How to fit a backpack'],
        ['/products/traverse-35l-daypack', 'Compare with the Traverse 35L'],
      ],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_traverse_35',
      sku: 'NT-PACK-TRV35',
      slug: 'traverse-35l-daypack',
      title: 'Traverse 35L Daypack',
      category: 'Backpacks',
      priceCents: 15900,
      costCents: 6200,
      inventory: 110,
      status: 'active',
      primaryKeyword: '35l hiking daypack',
      metaTitle:
        'Traverse 35L Daypack — The Best Lightweight Hiking Daypack For Every Trail Adventure You Will Ever Take',
      metaDescription:
        'A 35 litre daypack weighing 2.1 lb with a ventilated back panel, ice axe loop and hydration sleeve.',
      productDescription:
        '35 litres at 2.1 lb, with a ventilated back panel and a hydration sleeve that takes a 3 L reservoir.',
    },
    demandWeight: 17,
    page: {
      // Gap profile: meta title far over the recommended length.
      body: 'A day pack that holds a jacket, lunch, two litres of water and a first aid kit without sagging. The ventilated back panel keeps your shirt from soaking through on climbs.',
      sections: ['Specifications'],
      directAnswer: 'The Traverse 35L holds 35 litres and weighs 2.1 lb.',
      facts: [
        ['Volume', '35 L'],
        ['Weight', '2.1 lb / 953 g'],
        ['Hydration sleeve', 'Fits 3 L reservoir'],
      ],
      images: [{ alt: 'Traverse 35L daypack on a rock at a trail junction' }],
      links: [['/collections/backpacks', 'All backpacks']],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_summit_runner_vest',
      sku: 'NT-PACK-SRV18',
      slug: 'summit-runner-18l-vest-pack',
      title: 'Summit Runner 18L Vest Pack',
      category: 'Backpacks',
      priceCents: 11900,
      costCents: 4400,
      inventory: 74,
      status: 'active',
      primaryKeyword: 'trail running vest pack',
      metaTitle: 'Summit Runner 18L Vest Pack | NorthTrail Outdoor',
      metaDescription:
        'An 18 litre running vest weighing 11 oz, with two 500 ml soft flasks included and a bounce-free harness.',
      productDescription:
        '18 litres, 11 oz, two 500 ml soft flasks included. Sized S–L so it actually sits still while you run.',
    },
    demandWeight: 8,
    page: {
      body: 'A vest that does not bounce is mostly a question of fit, so this one comes in three sizes rather than one adjustable compromise. Two 500 ml flasks ride on the chest; the rear pocket takes a shell and 1.5 L bladder.',
      sections: ['Sizing', 'Specifications'],
      directAnswer: 'The Summit Runner holds 18 litres, weighs 11 oz, and includes two 500 ml soft flasks.',
      facts: [
        ['Volume', '18 L'],
        ['Weight', '11 oz / 312 g'],
        ['Sizes', 'S, M, L'],
      ],
      images: [{ alt: 'Runner wearing the Summit Runner vest on a ridgeline trail' }],
      links: [['/collections/backpacks', 'All packs']],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_emberlite_stove',
      sku: 'NT-COOK-EMB1',
      slug: 'emberlite-canister-stove',
      title: 'Emberlite Canister Stove',
      category: 'Cooking',
      priceCents: 6900,
      costCents: 2300,
      inventory: 180,
      status: 'active',
      primaryKeyword: 'backpacking canister stove',
      metaTitle: 'Emberlite Canister Stove — 2.6 oz, Boils 1 L in 3:20',
      metaDescription:
        'A 2.6 oz screw-on canister stove that boils one litre in 3 minutes 20 seconds, with a simmer-capable valve.',
      productDescription:
        '2.6 oz, boils 1 L in about 3:20 in still air, and the valve actually simmers rather than only running wide open.',
    },
    demandWeight: 19,
    page: {
      body: 'At 2.6 oz this is the stove you forget you packed. It boils a litre in roughly three and a half minutes in still air, and unlike most canister stoves in this weight class the valve gives you usable control at low output.',
      sections: ['Boil times', 'Specifications', 'Frequently asked questions'],
      directAnswer:
        'The Emberlite weighs 2.6 oz and boils one litre of water in about 3 minutes 20 seconds in still air.',
      faq: [
        ['Does it work in the cold?', 'Down to roughly 20°F with an isobutane mix. Below that, use an inverted liquid-feed stove instead.'],
        ['Can it simmer?', 'Yes. The needle valve holds a low flame without cutting out.'],
      ],
      facts: [
        ['Weight', '2.6 oz / 74 g'],
        ['Boil time, 1 L', '3:20 in still air at 70°F'],
        ['Fuel', 'Screw-on isobutane canister'],
      ],
      evidence: [['Boil-time tests, 20 runs, in-house', `${DEMO_SITE_ORIGIN}/journal/stove-boil-tests`]],
      originality: 'Boil times measured in-house across 20 runs at 70°F with a windscreen.',
      images: [{ alt: 'Emberlite stove burning under a pot on a rock' }],
      links: [
        ['/collections/cooking', 'All cooking gear'],
        ['/products/emberlite-2p-cook-set', 'Pairs with the Emberlite 2P cook set'],
      ],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_emberlite_cookset',
      sku: 'NT-COOK-EMB2',
      slug: 'emberlite-2p-cook-set',
      title: 'Emberlite 2P Cook Set',
      category: 'Cooking',
      priceCents: 8900,
      costCents: 3100,
      inventory: 132,
      status: 'active',
      primaryKeyword: 'backpacking cook set',
      metaTitle: 'Emberlite 2P Cook Set | NorthTrail Outdoor',
      metaDescription:
        'A two-person hard-anodised cook set: 1.3 L pot, lid, and two insulated mugs at 11 oz total.',
      productDescription:
        'A 1.3 L hard-anodised pot with a strainer lid and two insulated mugs. 11 oz for the set; the stove and a 100 g canister nest inside.',
    },
    demandWeight: 10,
    page: {
      // Gap profile: canonical points at a different page.
      body: 'A 1.3 L pot is the right size for two people eating rehydrated meals. The strainer lid means you can cook pasta without a separate colander, and the stove nests inside with a 100 g canister.',
      sections: ['Whats included', 'Specifications'],
      canonical: `${DEMO_SITE_ORIGIN}/collections/cooking`,
      directAnswer: 'The Emberlite 2P cook set weighs 11 oz and includes a 1.3 L pot, a strainer lid and two mugs.',
      facts: [
        ['Set weight', '11 oz / 312 g'],
        ['Pot volume', '1.3 L'],
        ['Material', 'Hard-anodised aluminium'],
      ],
      images: [{ alt: 'Emberlite cook set nested with a fuel canister' }],
      links: [['/collections/cooking', 'All cooking gear']],
      structuredData: true,
    },
  },
  {
    product: {
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
    demandWeight: 4,
    page: {
      // Gap profile: unpublished draft — no metadata at all, noindex.
      body: 'A 400-lumen USB-C rechargeable lantern with a 40-hour runtime on low.',
      metaTitle: null,
      metaDescription: null,
      indexability: 'noindex',
      canonical: null,
      sections: [],
      images: [{ alt: null }],
      links: [],
      structuredData: false,
    },
  },
  {
    product: {
      id: 'prd_beacon_headlamp',
      sku: 'NT-LGT-BCN4',
      slug: 'beacon-400-rechargeable-headlamp',
      title: 'Beacon 400 Rechargeable Headlamp',
      category: 'Lighting',
      priceCents: 4500,
      costCents: 1500,
      inventory: 210,
      status: 'active',
      primaryKeyword: 'rechargeable headlamp',
      metaTitle: 'Beacon 400 Rechargeable Headlamp — 400 Lumens, 60h Runtime',
      metaDescription:
        'A 400 lumen USB-C headlamp weighing 2.4 oz, with a 60 hour low-mode runtime and a red night-vision mode.',
      productDescription:
        '400 lumens on high, 60 hours on low, 2.4 oz with the battery. USB-C charging and a red mode that will not wake your tent partner.',
    },
    demandWeight: 20,
    page: {
      body: 'Four hundred lumens is enough to hike by; the useful number is the 60 hour low-mode runtime, which covers a week of camp chores on one charge. Red mode is a separate press rather than a cycle through white.',
      sections: ['Runtime by mode', 'Specifications'],
      directAnswer:
        'The Beacon 400 puts out 400 lumens on high, runs 60 hours on low, and weighs 2.4 oz.',
      faq: [['How long does it take to charge?', 'About 2 hours from empty over USB-C.']],
      facts: [
        ['Max output', '400 lumens'],
        ['Low-mode runtime', '60 hours'],
        ['Weight', '2.4 oz / 68 g'],
        ['Charging', 'USB-C'],
      ],
      images: [{ alt: 'Beacon 400 headlamp worn at a camp kitchen after dark' }],
      links: [['/collections/lighting', 'All lighting']],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_ridgeline_rain_shell',
      sku: 'NT-APP-RSH1',
      slug: 'ridgeline-rain-shell',
      title: 'Ridgeline Rain Shell',
      category: 'Apparel',
      priceCents: 19900,
      costCents: 7800,
      inventory: 58,
      status: 'active',
      primaryKeyword: 'lightweight rain jacket',
      metaTitle: 'Ridgeline Rain Shell — 9 oz Waterproof Jacket | NorthTrail',
      metaDescription:
        'A 9 oz three-layer waterproof shell with pit zips and a helmet-compatible hood, rated 20,000 mm.',
      productDescription:
        'A 9 oz three-layer shell rated 20,000 mm waterproof and 20,000 g/m² breathable, with pit zips and a helmet-compatible hood.',
    },
    demandWeight: 12,
    page: {
      // Gap profile: no internal links at all.
      body: 'Nine ounces for a three-layer shell is light without being disposable. Pit zips do more for comfort on climbs than any membrane spec, and the hood fits over a climbing helmet.',
      sections: ['Waterproof ratings explained', 'Specifications'],
      directAnswer:
        'The Ridgeline Rain Shell weighs 9 oz and is rated to 20,000 mm waterproof.',
      facts: [
        ['Weight', '9 oz / 255 g'],
        ['Waterproof rating', '20,000 mm'],
        ['Breathability', '20,000 g/m²/24h'],
        ['Construction', '3-layer'],
      ],
      images: [{ alt: 'Ridgeline rain shell worn in steady rain on a ridge' }],
      links: [],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_alpine_base_layer',
      sku: 'NT-APP-MBL1',
      slug: 'alpine-merino-base-layer',
      title: 'Alpine Merino Base Layer',
      category: 'Apparel',
      priceCents: 8900,
      costCents: 3200,
      inventory: 145,
      status: 'active',
      primaryKeyword: 'merino wool base layer',
      metaTitle: 'Alpine Merino Base Layer — 190 gsm | NorthTrail Outdoor',
      metaDescription:
        'A 190 gsm merino wool base layer with flatlock seams, for cool-weather hiking and multi-day trips.',
      productDescription:
        '190 gsm merino with flatlock seams and an offset shoulder seam so a pack strap does not sit on it.',
    },
    demandWeight: 14,
    page: {
      body: '190 gsm is the weight that works across the widest range: warm enough at a frosty trailhead, not stifling once you are moving. Flatlock seams and an offset shoulder seam keep pack straps off the stitching.',
      sections: ['Specifications', 'Care'],
      directAnswer: 'The Alpine base layer is 190 gsm merino wool with flatlock seams.',
      facts: [
        ['Fabric weight', '190 gsm'],
        ['Material', '100% merino wool'],
        ['Seams', 'Flatlock, offset shoulder'],
      ],
      images: [{ alt: 'Alpine merino base layer laid flat showing the shoulder seam' }],
      links: [['/collections/apparel', 'All apparel']],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_waypoint_compass',
      sku: 'NT-NAV-WPT1',
      slug: 'waypoint-baseplate-compass',
      title: 'Waypoint Baseplate Compass',
      category: 'Navigation',
      priceCents: 7900,
      costCents: 2800,
      inventory: 66,
      status: 'active',
      primaryKeyword: 'baseplate compass',
      metaTitle: 'Waypoint Baseplate Compass | NorthTrail Outdoor',
      metaDescription:
        'A mirrored baseplate compass with adjustable declination, a sighting notch and 1:24,000 and 1:50,000 scales.',
      productDescription:
        'Mirrored baseplate compass with adjustable declination, a sighting notch, and both 1:24,000 and 1:50,000 map scales.',
    },
    demandWeight: 7,
    page: {
      body: 'Adjustable declination is the feature worth paying for: set it once for your region and stop doing arithmetic in the wind. The mirror doubles as a signalling device and lets you sight a bearing accurately.',
      sections: ['Why adjustable declination matters', 'Specifications'],
      directAnswer:
        'The Waypoint is a mirrored baseplate compass with adjustable declination and 1:24,000 and 1:50,000 scales.',
      facts: [
        ['Declination', 'Adjustable, tool-free'],
        ['Scales', '1:24,000 and 1:50,000'],
        ['Weight', '2.1 oz / 60 g'],
      ],
      images: [{ alt: 'Waypoint compass on a topographic map with a bearing set' }],
      links: [
        ['/collections/navigation', 'All navigation'],
        ['/guides/how-to-take-a-bearing', 'How to take a bearing'],
      ],
      structuredData: true,
    },
  },
  {
    product: {
      id: 'prd_trailhead_1p_tent',
      sku: 'NT-TENT-THD1',
      slug: 'trailhead-1p-tent',
      title: 'Trailhead 1P Tent',
      category: 'Tents & Shelters',
      priceCents: 21900,
      costCents: 9600,
      inventory: 0,
      status: 'archived',
      primaryKeyword: '1 person tent',
      metaTitle: 'Trailhead 1P Tent | NorthTrail Outdoor',
      metaDescription:
        'A discontinued 2.9 lb solo tent. Replaced by the Ridgeline 2P for solo use with more room.',
      productDescription:
        'Discontinued solo tent, 2.9 lb packed. Kept in the catalogue for historical reporting; replaced by the Ridgeline 2P.',
    },
    demandWeight: 2,
    page: {
      body: 'The Trailhead 1P has been discontinued. Solo hikers who want more room should look at the Ridgeline 2P, which is 1 lb heavier with roughly twice the floor area.',
      sections: ['Replacement'],
      indexability: 'noindex',
      directAnswer: 'The Trailhead 1P is discontinued and replaced by the Ridgeline 2P.',
      facts: [['Status', 'Discontinued']],
      images: [{ alt: 'Trailhead 1P tent pitched at a forest campsite' }],
      links: [['/products/ridgeline-2p-backpacking-tent', 'See the Ridgeline 2P instead']],
      structuredData: false,
    },
  },
];

function buildHeadings(
  entry: CatalogueEntry,
  h1: string | null,
): SnapshotHeading[] {
  const headings: SnapshotHeading[] = [];
  if (h1 !== null) headings.push({ level: 1, text: h1 });
  for (const section of entry.page.sections ?? ['Specifications']) {
    headings.push({ level: 2, text: section });
  }
  return headings;
}

function buildImages(entry: CatalogueEntry): SnapshotImage[] {
  const authored = entry.page.images ?? DEFAULT_IMAGES;
  return authored.map((image, index) => ({
    src:
      image.decorative === true
        ? '/images/divider.svg'
        : `/images/${entry.product.slug}-${index + 1}.jpg`,
    alt: image.alt,
    decorative: image.decorative ?? false,
  }));
}

function buildStructuredData(entry: CatalogueEntry): unknown[] {
  if (entry.page.structuredData !== true) return [];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: entry.product.title,
      sku: entry.product.sku,
      offers: {
        '@type': 'Offer',
        price: (entry.product.priceCents / 100).toFixed(2),
        priceCurrency: 'USD',
        availability:
          entry.product.inventory > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
      },
    },
  ];
}

function buildSnapshot(entry: CatalogueEntry): PageSnapshot {
  const { product, page } = entry;
  const url = `${DEMO_SITE_ORIGIN}/products/${product.slug}`;
  const h1 = page.h1 === undefined ? product.title : page.h1;

  const canonical =
    page.canonical === undefined || page.canonical === 'self'
      ? url
      : page.canonical;

  const faq: SnapshotFaqEntry[] = (page.faq ?? []).map(([question, answer]) => ({
    question,
    answer,
  }));
  const facts: SnapshotFact[] = (page.facts ?? []).map(([label, value]) => ({
    label,
    value,
  }));
  const evidence: SnapshotEvidence[] = (page.evidence ?? []).map(
    ([label, evidenceUrl]) => ({ label, url: evidenceUrl }),
  );
  const internalLinks: SnapshotInternalLink[] = (page.links ?? []).map(
    ([href, anchorText]) => ({ href, anchorText }),
  );

  return {
    id: snapshotIdFor(product.id),
    productId: product.id,
    url,
    metaTitle:
      page.metaTitle === undefined ? product.metaTitle : page.metaTitle,
    metaDescription:
      page.metaDescription === undefined
        ? product.metaDescription
        : page.metaDescription,
    h1,
    headings: buildHeadings(entry, h1),
    bodyText: page.body,
    images: buildImages(entry),
    internalLinks,
    canonical,
    indexability: page.indexability ?? 'index',
    structuredData: buildStructuredData(entry),
    directAnswer: page.directAnswer ?? null,
    faq,
    facts,
    evidence,
    originalityClaim: page.originality ?? null,
    capturedAt: DEMO_AS_OF,
  };
}

/** Deterministic snapshot id derived from the product id. */
export function snapshotIdFor(productId: string): string {
  return productId.replace(/^prd_/, 'snap_');
}

export function buildCatalogueProducts(): Product[] {
  return CATALOGUE.map((entry) => structuredClone(entry.product));
}

export function buildCatalogueSnapshots(): PageSnapshot[] {
  return CATALOGUE.map(buildSnapshot);
}

/** Relative search demand per product, consumed by the traffic generator. */
export function catalogueDemandWeights(): { productId: string; weight: number }[] {
  return CATALOGUE.map((entry) => ({
    productId: entry.product.id,
    weight: entry.demandWeight,
  }));
}
