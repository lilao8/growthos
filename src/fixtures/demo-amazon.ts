import type { AmazonListing } from '@/domain/types';

/**
 * Amazon listings for the demo catalogue.
 *
 * One listing per storefront SKU, because the demo brand sells the same
 * products on both channels — which is what a real multi-channel seller does.
 *
 * The quality spread is authored, not random. Each listing carries a specific,
 * defensible problem so the audit has something true to find:
 *
 * - Two variation families (Ridgeline tents, Summit bags) where the members
 *   are listed standalone, which is the single most common structural mistake
 *   in a growing catalogue.
 * - One suppressed listing with a non-compliant main image — the most urgent
 *   state a listing can be in, and the case that must NOT be demoted the way
 *   an unpublished storefront draft is.
 * - Two listings where the main image compliance was never recorded, so the
 *   audit has to report Unknown rather than assume.
 * - One backend search-term field that is over the byte limit only because of
 *   accented characters; its character count looks fine.
 * - A rating below the floor on a large sample (act on it) and a lower rating
 *   on six reviews (do not act on it yet).
 *
 * None of this is fetched. This project never calls SP-API and never crawls.
 */

const M = 'ATVPDKIKX0DER' as const;

interface Seed {
  productId: string;
  asin: string;
  title: string;
  bullets: string[];
  aPlus: string[];
  backend: string;
  images: number;
  white: AmazonListing['mainImageWhiteBackground'];
  video: boolean;
  node: string | null;
  registered: boolean;
  parent: string | null;
  siblings: string[];
  reviews: number;
  rating: number | null;
  buyBox: number | null;
  fulfilment: AmazonListing['fulfilment'];
  status: AmazonListing['status'];
}

function bullet(text: string): string {
  return text;
}

const SEEDS: readonly Seed[] = [
  {
    productId: 'prd_ridgeline_2p_tent',
    asin: 'B0RDG2TENT',
    title:
      'Ridgeline 2P Backpacking Tent, 3-Season Freestanding Shelter for Two, 4.2 lb Packed Weight, Dual Vestibules, 20D Ripstop Fly',
    bullets: [
      bullet(
        'SLEEPS TWO COMFORTABLY: 32 square feet of floor area with a 42-inch peak height, so two adults on 20-inch pads can sit up without touching the walls.',
      ),
      bullet(
        'CARRY 4.2 LB: Freestanding two-pole architecture packs to 18 x 6 inches, splitting to roughly 2.1 lb each when two people share the load.',
      ),
      bullet(
        'STAY DRY: 20D ripstop fly with 1500mm coating and fully taped seams, paired with a 5000mm bathtub floor that rises 6 inches up the walls.',
      ),
      bullet(
        'TWO DOORS, TWO VESTIBULES: 9 square feet of covered storage per side means nobody climbs over anybody to reach a pack at 2am.',
      ),
      bullet(
        'WHAT IS INCLUDED: Tent body, fly, two DAC-style aluminium poles, 12 stakes, guylines, repair sleeve and footprint, with a 3-year warranty.',
      ),
    ],
    aPlus: ['Comparison chart', 'Feature callouts', 'Brand story'],
    backend: 'two man tent ultralight shelter trekking hiking camping 2 season waterproof bivvy freestanding backpack tent lightweight',
    images: 7,
    white: 'yes',
    video: true,
    node: '3400371',
    registered: true,
    parent: null,
    // Listed standalone although the 3P is the same family.
    siblings: ['B0RDG3TENT'],
    reviews: 412,
    rating: 4.5,
    buyBox: 0.97,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_ridgeline_3p_tent',
    asin: 'B0RDG3TENT',
    title:
      'Ridgeline 3P Backpacking Tent, 3-Season Freestanding Shelter for Three, 5.4 lb Packed Weight, Dual Vestibules',
    bullets: [
      bullet(
        'SLEEPS THREE: 44 square feet of floor with a 45-inch peak height, sized for three 20-inch pads laid flat with no overlap.',
      ),
      bullet(
        'CARRY 5.4 LB: Splits to under 2 lb each across three packs, or 2.7 lb each between two.',
      ),
      bullet(
        'STAY DRY: 20D ripstop fly at 1500mm with taped seams over a 5000mm bathtub floor.',
      ),
      bullet('Two doors.'),
      bullet(
        'WHAT IS INCLUDED: Tent body, fly, three poles, 14 stakes, guylines, repair sleeve and footprint, 3-year warranty.',
      ),
    ],
    aPlus: ['Comparison chart', 'Feature callouts'],
    backend: 'three man tent 3 person shelter family camping hiking backpacking waterproof freestanding trekking tent',
    images: 6,
    white: 'yes',
    video: false,
    node: '3400371',
    registered: true,
    parent: null,
    siblings: ['B0RDG2TENT'],
    reviews: 188,
    rating: 4.4,
    buyBox: 0.95,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_basecamp_tarp',
    asin: 'B0BSCMTARP',
    title: 'Basecamp Ultralight Tarp Shelter',
    bullets: [
      bullet(
        'PACKS TO 11 OZ: A 9 x 9 foot silnylon tarp that stuffs to the size of a water bottle and shelters two with packs.',
      ),
      bullet(
        'NINE TIE-OUTS: Pitch it as an A-frame, a lean-to or a flying diamond without carrying a single extra part.',
      ),
      bullet(
        'NO POLES NEEDED: Rigs from trekking poles or trees, with reinforced ridgeline seams rated to hold in sustained wind.',
      ),
    ],
    aPlus: [],
    backend: 'tarp shelter ultralight silnylon rain fly hammock tarp bushcraft camping shelter lightweight backpacking tarp',
    images: 4,
    white: 'unknown',
    video: false,
    node: '3400381',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 64,
    rating: 4.2,
    buyBox: 0.91,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_summit_20_bag',
    asin: 'B0SMT20BAG',
    title: 'Sleeping Bag',
    bullets: [],
    aPlus: [],
    backend: '',
    images: 2,
    white: 'unknown',
    video: false,
    node: null,
    registered: true,
    parent: null,
    siblings: ['B0SMT00BAG'],
    reviews: 27,
    rating: 3.6,
    buyBox: 0.62,
    fulfilment: 'FBM',
    status: 'active',
  },
  {
    productId: 'prd_summit_0_bag',
    asin: 'B0SMT00BAG',
    title:
      'Summit 0 Expedition Sleeping Bag, 800-Fill Down, 0F Comfort Rating, Mummy Cut with Draft Collar, 2.9 lb',
    bullets: [
      bullet(
        'RATED TO 0F COMFORT: 800-fill responsibly sourced down with 2.5 inches of loft, tested to ISO comfort rather than survival limit.',
      ),
      bullet(
        'WEIGHS 2.9 LB: Compresses to 9 x 15 inches in the included compression sack, so it still fits a 55L pack with room left.',
      ),
      bullet(
        'NO COLD SPOTS: Trapezoidal baffles stop down migration, and a full draft collar plus draft tube seal the zip line.',
      ),
      bullet(
        'FITS TO 6 FEET 2: Mummy cut with a 62-inch shoulder girth, roomy enough for a base layer without dead air to heat.',
      ),
      bullet(
        'INCLUDES: Compression sack for the trail and a cotton storage sack, because storing down compressed destroys loft.',
      ),
    ],
    aPlus: ['Temperature guide', 'Fill power explainer', 'Care instructions'],
    backend: 'winter sleeping bag expedition mummy bag cold weather down bag 0 degree alpine camping bag',
    images: 8,
    white: 'yes',
    video: true,
    node: '3400411',
    registered: true,
    parent: null,
    siblings: ['B0SMT20BAG'],
    reviews: 96,
    rating: 4.7,
    buyBox: 0.99,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_cloudbed_pad',
    asin: 'B0CLDBEDPD',
    title:
      'Cloudbed Insulated Sleeping Pad, R-Value 4.5, 3-Inch Thickness, 15 oz, Includes Pump Sack and Patch Kit',
    bullets: [
      bullet(
        'R-VALUE 4.5: Tested to ASTM F3340, which is the standard that makes R-values comparable between brands at all.',
      ),
      bullet(
        'THREE INCHES THICK: Side sleepers do not bottom out, with a 20 x 72 inch sleeping surface.',
      ),
      bullet(
        'WEIGHS 15 OZ: Packs to 4 x 9 inches, roughly the size of a 1L bottle.',
      ),
      bullet(
        'INFLATES IN 90 SECONDS: The included pump sack fills it in 12 to 15 squeezes and keeps moist breath out of the insulation.',
      ),
      bullet(
        'INCLUDES: Pump sack, stuff sack, and a patch kit with two adhesive patches and a valve tool.',
      ),
    ],
    aPlus: ['R-value guide', 'Comparison chart'],
    backend: 'sleeping pad insulated camping mat inflatable pad r value 4 backpacking mattress ultralight pad',
    images: 7,
    white: 'yes',
    video: true,
    node: '3400421',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 233,
    rating: 4.6,
    buyBox: 0.98,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_traverse_55',
    asin: 'B0TRVRS55L',
    title:
      'Traverse 55L Backpacking Pack, Adjustable Torso, 45 lb Comfortable Load, Ventilated Back Panel, Rain Cover Included',
    bullets: [
      bullet(
        'CARRIES 45 LB COMFORTABLY: A load-transferring hipbelt and internal frame sheet move weight to the hips rather than the shoulders.',
      ),
      bullet(
        'ADJUSTS 16 TO 21 INCHES: One pack fits a range of torso lengths, so it still fits after a growth spurt or a different wearer.',
      ),
      bullet(
        'VENTILATED BACK PANEL: A suspended mesh panel keeps a gap between your back and the pack body on long climbs.',
      ),
      bullet(
        'ORGANISED, NOT COMPLICATED: Top lid pocket, two stretch side pockets, a sleeping-bag compartment and dual ice-axe loops.',
      ),
      bullet(
        'INCLUDES A RAIN COVER: Stowed in its own base pocket, sized to cover the pack fully loaded.',
      ),
    ],
    aPlus: ['Fit guide', 'Feature callouts', 'Size chart'],
    backend: 'hiking backpack 55l trekking rucksack multi day pack internal frame backpacking bag travel pack',
    images: 9,
    white: 'yes',
    video: true,
    node: '3400451',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 341,
    rating: 4.5,
    buyBox: 0.96,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_traverse_35',
    asin: 'B0TRVRS35L',
    title:
      'BEST SELLER Traverse 35L Daypack - TOP QUALITY Hiking Backpack - AMAZING Comfort - FREE SHIPPING',
    bullets: [
      bullet(
        'THIRTY-FIVE LITRES: Enough for a full day out with layers, lunch and 2L of water, without the bulk of an overnight pack.',
      ),
      bullet(
        'CARRIES 25 LB: A lighter version of the Traverse 55 suspension, with the same hipbelt geometry.',
      ),
      bullet(
        'HYDRATION READY: Internal sleeve fits a 3L reservoir with a port on each shoulder strap.',
      ),
      bullet(
        'POCKETS THAT WORK: Two stretch side pockets reachable while wearing the pack, plus a fleece-lined sunglasses pocket.',
      ),
      bullet(
        'INCLUDES: Rain cover in the base pocket and a 3-year warranty on stitching and hardware.',
      ),
    ],
    aPlus: ['Feature callouts'],
    backend: 'daypack hiking backpack 35l day hike bag traverse daypack school backpack outdoor pack',
    images: 6,
    white: 'yes',
    video: false,
    node: '3400451',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 158,
    rating: 4.3,
    buyBox: 0.93,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_summit_runner_vest',
    asin: 'B0SMTRNVST',
    title:
      'Summit Runner 18L Vest Pack, Bounce-Free Fit, Two 500ml Soft Flasks Included, 11 oz, Sizes XS to XL',
    bullets: [
      bullet(
        'DOES NOT BOUNCE: A vest cut with four adjustment points holds 18L against the body rather than swinging from the shoulders.',
      ),
      bullet(
        'FLASKS INCLUDED: Two 500ml soft flasks sit in front pockets reachable without breaking stride.',
      ),
      bullet(
        'WEIGHS 11 OZ EMPTY: Light enough for a fast day, big enough for a mandatory kit list.',
      ),
      bullet(
        'FIVE SIZES: XS to XL fitted to chest circumference, not a one-size compromise.',
      ),
    ],
    aPlus: ['Size chart', 'Feature callouts'],
    backend: 'running vest hydration pack trail running vest 18l race vest ultra running pack soft flask vest',
    images: 7,
    white: 'yes',
    video: true,
    node: '3400451',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 6,
    rating: 3.5,
    buyBox: 0.94,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_emberlite_stove',
    asin: 'B0EMBRSTOV',
    title:
      'Emberlite Canister Stove, Boils 1L in 3 Minutes 20 Seconds, 2.6 oz, Piezo Ignition, Fits Standard Threaded Canisters',
    bullets: [
      bullet(
        'BOILS 1L IN 3:20: Measured at 70F with a full canister and no wind; cold and wind both slow it, as with every canister stove.',
      ),
      bullet(
        'WEIGHS 2.6 OZ: Folds to 2 x 3 inches and fits inside most 750ml pots alongside a small canister.',
      ),
      bullet(
        'LIGHTS WITHOUT A MATCH: Piezo ignition, with a recessed burner that still lights from a spark if the piezo ever fails.',
      ),
      bullet(
        'SIMMERS PROPERLY: A needle valve holds a low flame, so this cooks rather than only boiling.',
      ),
      bullet(
        'FITS STANDARD CANISTERS: Any EN417 threaded canister. Fuel is not included and cannot be shipped by air.',
      ),
    ],
    aPlus: ['Boil-time comparison', 'Safety notes'],
    backend: 'camping stove backpacking stove canister stove ultralight cooker hiking stove gas burner portable stove',
    images: 8,
    white: 'yes',
    video: true,
    node: '3400471',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 402,
    rating: 4.6,
    buyBox: 0.98,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_emberlite_cookset',
    asin: 'B0EMBRCOOK',
    title:
      'Emberlite 2P Cook Set, Hard-Anodised Aluminium, 750ml and 550ml Pots, Folding Handles, Nests Around a Canister',
    bullets: [
      bullet(
        'TWO POTS: 750ml and 550ml hard-anodised aluminium, sized for two people eating one-pot meals.',
      ),
      bullet(
        'NESTS AROUND A CANISTER: Both pots and a 110g canister pack inside the larger pot.',
      ),
      bullet(
        'HANDLES STAY COOL: Folding silicone-wrapped handles lock in place and fold flat for packing.',
      ),
      bullet(
        'INCLUDES: Two pots, two lids with strainer holes, two folding sporks and a mesh stuff sack.',
      ),
      bullet(
        'CARE: Hard-anodised, not non-stick. Do not use metal utensils, and hand wash.',
      ),
    ],
    aPlus: ['Nesting diagram'],
    backend: 'camping cookware mess kit backpacking pot set aluminium cook set hiking pots outdoor cooking',
    images: 6,
    white: 'yes',
    video: false,
    node: '3400471',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 119,
    rating: 4.4,
    buyBox: 0.97,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_trailcell_lantern',
    asin: 'B0TRLCELL1',
    title: 'TrailCell Rechargeable Lantern 400 Lumens USB-C Camping Light',
    bullets: [
      bullet('400 lumens on high, 30 on low.'),
      bullet('Recharges over USB-C in about 3 hours.'),
    ],
    aPlus: [],
    backend: 'camping lantern rechargeable light usb lantern tent light led lantern portable lamp camping lantern rechargeable light',
    images: 3,
    white: 'no',
    video: false,
    node: '3400491',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 0,
    rating: null,
    buyBox: null,
    fulfilment: 'FBM',
    status: 'suppressed',
  },
  {
    productId: 'prd_beacon_headlamp',
    asin: 'B0BCN400HL',
    title:
      'Beacon 400 Rechargeable Headlamp, 400 Lumens, 60m Beam, 2.4 oz, IPX6 Rated, Red Night Mode, USB-C',
    bullets: [
      bullet(
        'FOUR HUNDRED LUMENS, 60M BEAM: Enough to pick a line on technical ground, not only to read a map.',
      ),
      bullet(
        'RUNS 6 HOURS ON HIGH: And 40 hours on the 30-lumen setting, from a 1200mAh cell that recharges over USB-C.',
      ),
      bullet(
        'WEIGHS 2.4 OZ: Light enough that the headband does not need tightening to stop it sliding.',
      ),
      bullet(
        'RED NIGHT MODE: Preserves dark adaptation and does not wake a tent-mate. Remembers the last mode used.',
      ),
      bullet(
        'IPX6 RATED: Handles sustained rain. Not rated for submersion.',
      ),
    ],
    aPlus: ['Beam comparison', 'Runtime chart'],
    backend: 'headlamp rechargeable head torch running headlamp camping light usb c headlamp hiking head lamp',
    images: 7,
    white: 'yes',
    video: false,
    node: '3400491',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 274,
    rating: 4.5,
    buyBox: 0.96,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_ridgeline_rain_shell',
    asin: 'B0RDGRAINS',
    title:
      'Ridgeline Rain Shell, 20,000mm Waterproof, 20,000g Breathability, Pit Zips, Helmet-Compatible Hood, 11 oz',
    bullets: [
      bullet(
        'WATERPROOF TO 20,000MM: With fully taped seams and a storm flap over the main zip.',
      ),
      bullet(
        'BREATHES AT 20,000G: Paired with full-length pit zips for when the membrane alone cannot keep up on a climb.',
      ),
      bullet(
        'WEIGHS 11 OZ: Packs into its own chest pocket, to the size of a grapefruit.',
      ),
      bullet(
        'HOOD FITS OVER A HELMET: Three-point adjustment with a wired brim that holds its shape in wind.',
      ),
      bullet(
        'CARE: Wash and reproof with a technical wash. Fabric softener destroys the DWR permanently.',
      ),
    ],
    aPlus: ['Fabric explainer', 'Size chart', 'Care guide'],
    // 246 characters but 261 bytes: this is over Amazon's 250-byte limit
    // while its character count still looks safe. Exactly the case the
    // byte-length rule exists for — a character-based check would pass it and
    // the overflow would be discarded silently.
    backend:
      'chaqueta impermeable montaña senderismo cortavientos montañismo excursión impermeável técnica respirável capucha ajustável costuras seladas à prova d água corta-vento montanhismo caminhada trilha leve señora niño pequeño árbol otoño verão inverno',
    images: 8,
    white: 'yes',
    video: true,
    node: '3400511',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 187,
    rating: 4.4,
    buyBox: 0.95,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_alpine_base_layer',
    asin: 'B0ALPMERIN',
    title:
      'Alpine Merino Base Layer, 180gsm 17.5 Micron Merino Wool, Flatlock Seams, Sizes XS to XXL',
    bullets: [
      bullet(
        'SEVENTEEN AND A HALF MICRON MERINO: Fine enough not to itch, at 180gsm for three-season use.',
      ),
      bullet(
        'STAYS WARM WHEN DAMP: Merino holds warmth wet, which is the difference that matters on a cold day out.',
      ),
      bullet(
        'FLATLOCK SEAMS: Offset from the shoulder so a pack strap never rides on a seam.',
      ),
      bullet(
        'RESISTS ODOUR: Wearable for several days between washes, which is why it belongs on a multi-day trip.',
      ),
      bullet(
        'CARE: Wool cycle at 30C, dry flat. Do not tumble dry.',
      ),
    ],
    aPlus: ['Fabric explainer', 'Size chart'],
    backend: 'merino wool base layer thermal top long sleeve underwear wool shirt hiking thermal ski base layer',
    images: 6,
    white: 'yes',
    video: false,
    node: '3400511',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 143,
    rating: 3.8,
    buyBox: 0.92,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_waypoint_compass',
    asin: 'B0WYPTCMPS',
    title:
      'Waypoint Baseplate Compass, Declination Adjustment, Sighting Mirror, Global Needle, Luminous Bezel',
    bullets: [
      bullet(
        'ADJUSTABLE DECLINATION: Set it once for your area and stop doing the arithmetic in the field.',
      ),
      bullet(
        'SIGHTING MIRROR: Takes bearings accurate to about 1 degree, and doubles as a signal mirror.',
      ),
      bullet(
        'GLOBAL NEEDLE: Works in both hemispheres without the needle dragging on the capsule.',
      ),
      bullet(
        'READS IN THE DARK: Luminous bezel and index line charge from a headlamp.',
      ),
      bullet(
        'INCLUDES: Lanyard, 1:24,000 and 1:25,000 romer scales printed on the baseplate.',
      ),
    ],
    aPlus: ['How to take a bearing'],
    backend: 'compass hiking navigation orienteering baseplate compass mirror compass map compass survival',
    images: 5,
    white: 'yes',
    video: false,
    node: '3400531',
    registered: true,
    parent: null,
    siblings: [],
    reviews: 88,
    rating: 4.6,
    buyBox: 0.99,
    fulfilment: 'FBA',
    status: 'active',
  },
  {
    productId: 'prd_trailhead_1p_tent',
    asin: 'B0THD1TENT',
    title:
      'Trailhead 1P Tent, Solo Backpacking Shelter, 3.1 lb Packed, Single Door and Vestibule, 3-Season',
    bullets: [
      bullet(
        'BUILT FOR ONE: 20 square feet of floor with a 38-inch peak, sized for one person and a pack inside.',
      ),
      bullet(
        'CARRIES 3.1 LB: Packs to 16 x 5 inches, small enough to sit inside a 35L pack.',
      ),
      bullet(
        'STAY DRY: 20D fly at 1500mm with taped seams over a 3000mm floor.',
      ),
      bullet(
        'ONE DOOR, ONE VESTIBULE: 7 square feet of covered storage for a pack and boots.',
      ),
      bullet(
        'INCLUDES: Tent, fly, poles, 10 stakes, guylines and a repair sleeve. Footprint sold separately.',
      ),
    ],
    aPlus: [],
    backend: 'one man tent solo tent 1 person backpacking shelter lightweight hiking tent bivy',
    images: 5,
    white: 'yes',
    video: false,
    node: '3400371',
    registered: false,
    parent: null,
    siblings: [],
    reviews: 41,
    rating: 4.1,
    buyBox: 0.9,
    fulfilment: 'FBM',
    status: 'inactive',
  },
];

export function buildDemoAmazonListings(): AmazonListing[] {
  return SEEDS.map((seed) => ({
    id: `lst_${seed.productId.replace(/^prd_/, '')}`,
    productId: seed.productId,
    asin: seed.asin,
    marketplace: M,
    title: seed.title,
    bullets: [...seed.bullets],
    aPlusModules: [...seed.aPlus],
    backendSearchTerms: seed.backend,
    imageCount: seed.images,
    mainImageWhiteBackground: seed.white,
    hasVideo: seed.video,
    browseNode: seed.node,
    brandRegistered: seed.registered,
    variationParentAsin: seed.parent,
    expectedVariationSiblings: [...seed.siblings],
    reviewCount: seed.reviews,
    averageRating: seed.rating,
    buyBoxPercentage: seed.buyBox,
    fulfilment: seed.fulfilment,
    status: seed.status,
  }));
}
