import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { NAV_ITEMS } from '@/components/layout/nav-items';
import {
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { DEMO_WINDOW } from '@/domain/demo-window';
import { formatDateRange } from '@/domain/format';
import { SEO_RULE_VERSION } from '@/domain/seo-audit/config';
import { GEO_RULE_VERSION } from '@/domain/geo-audit/config';
import { RECOMMENDATION_RULE_VERSION } from '@/domain/recommendations/config';
import { AMAZON_RULE_VERSION } from '@/domain/amazon/config';
import { DEMO_BRAND, DEMO_MARKET } from '@/fixtures/demo-seed';

/**
 * Project explainer.
 *
 * Static prose, deliberately: this page describes the project rather than
 * reporting on data, so it must not depend on a loaded repository. The few
 * values it does show — the window, the rule versions, the module list — are
 * imported from the same constants the modules use, so they cannot drift.
 */

const DEMO_PATH = [
  {
    step: 'Dashboard',
    href: '/dashboard' as const,
    what: 'Open with the headline numbers and the metric definitions table. Point out that every ratio has one definition, shared by every module.',
    seconds: 40,
  },
  {
    step: 'Products → one SKU',
    href: '/products' as const,
    what: 'Edit a title or meta description. Save, reload, show the edit survived. Note the audit for that page is now marked stale.',
    seconds: 60,
  },
  {
    step: 'SEO Audit → re-run',
    href: '/seo' as const,
    what: 'Re-run the audit for that page. Walk through one failing check and its evidence — not a score, a reason.',
    seconds: 50,
  },
  {
    step: 'GEO Audit',
    href: '/geo' as const,
    what: 'Show the readiness bands and say plainly that this measures page structure, not any real AI ranking.',
    seconds: 40,
  },
  {
    step: 'Analytics → Funnel',
    href: '/analytics' as const,
    what: 'Channel table with CAC and ROAS, then the funnel. Show the largest drop-off and why it is not automatically the biggest problem.',
    seconds: 60,
  },
  {
    step: 'Amazon',
    href: '/amazon' as const,
    what: 'Run the listing audit. Open the suppressed ASIN and show why its non-compliant main image outranks every copy improvement on it. Say plainly that Amazon numbers are never added to the storefront’s.',
    seconds: 60,
  },
  {
    step: 'Amazon Ads',
    href: '/amazon/advertising' as const,
    what: 'Show the search term table: what a shopper typed versus what we bid on are two columns, not one. Then a harvest candidate and a negation candidate, and say that both are suggestions the project will never act on itself.',
    seconds: 60,
  },
  {
    step: 'Recommendations',
    href: '/recommendations' as const,
    what: 'The whole project lands here: one prioritised list with evidence and a deep link back to each finding. Mark one done, reload, show it stuck.',
    seconds: 70,
  },
];

const LIMITATIONS = [
  {
    heading: 'The data is generated, and says so',
    body: 'Every session, order and unit of ad spend comes from a seeded generator with a fixed end date. Reloading gives the same numbers. Nothing here is a real business result, and no claim in this project should be read as one.',
  },
  {
    heading: 'The scores are this project’s rules, not anyone’s algorithm',
    body: `SEO (${SEO_RULE_VERSION}) and GEO (${GEO_RULE_VERSION}) are rule sets written for this project: each check, weight and rounding step is in the repository and can be argued with. They are not Google’s ranking algorithm, and a high score is not a ranking promise. The Amazon listing rules (${AMAZON_RULE_VERSION}) work the same way and are not Amazon’s published requirements — real category rules vary by browse node.`,
  },
  {
    heading: 'GEO does not measure AI behaviour',
    body: 'No AI API is called anywhere in this project. The GEO audit checks whether a page is structured so an answer could be extracted from it — direct answers, facts, sources, schema. It cannot observe whether any assistant actually cites the page, and it never claims to.',
  },
  {
    heading: 'Attribution is last-touch and single-channel',
    body: 'Each session carries exactly one channel. Real multi-touch attribution would distribute the same revenue differently, so channel ROAS here is the simplest possible reading, not the fairest one.',
  },
  {
    heading: 'Revenue is narrow, and refunds are not modelled',
    body: 'Revenue is paid item value minus discounts. Tax, shipping and refunds are excluded, and the MVP has no refund concept at all, so anything downstream of revenue is optimistic by an unmodelled amount.',
  },
  {
    heading: 'Impact and effort are estimates',
    body: `Recommendation priorities (${RECOMMENDATION_RULE_VERSION}) come from per-rule 1–5 estimates with written reasons, nudged one step up or down by how busy the page is relative to the rest of the catalogue. One step, not a multiplier: traffic decides which of two comparable findings to do first, it does not decide whether a finding is serious. They order the work; they are not forecasts, and no figure in this project should be quoted as expected revenue.`,
  },
  {
    heading: 'Organic acquisition looks free because its cost is not modelled',
    body: 'Organic Search shows a CAC of $0.00 because no spend is attributed to it. That is arithmetic, not a finding — content, SEO and brand labour are real costs this demo does not carry.',
  },
  {
    heading: 'The two channels are never added together',
    body: 'The storefront and Amazon share this catalogue, but an Amazon session and a storefront session are counted differently and mean different things. Nothing in this project adds them, and ACOS is never silently converted into ROAS for a side-by-side comparison — the attribution windows do not match, and ACOS covers only advertising-attributed sales. Conversion rate is the sharpest case: on Amazon it is orders ÷ clicks, on the storefront it is purchasing sessions ÷ sessions. Two honest numbers side by side beat one misleading total.',
  },
  {
    heading: 'The target ACOS is a choice, not a benchmark',
    body: 'A brand buying market share runs a deliberately high ACOS; one funding itself from cashflow runs a low one. This project picks a figure so the rules have something to compare against and says so on screen. Harvest and negation candidates are suggestions to test — nothing here changes a bid, a budget or a negative keyword list.',
  },
  {
    heading: 'Accessibility is checked, not certified',
    body: 'Every route is scanned with axe-core against WCAG 2.1 A and AA on three browser engines, and the accessibility tree is asserted directly: one main landmark and one h1 per page, named navigation regions, captioned tables, charts that are never the only route to a number, and keyboard operation throughout. What has not happened is a person using this with VoiceOver or NVDA. Automated rules catch roughly a third of real barriers, so this project claims those specific properties hold — not that the experience is good.',
  },
  {
    heading: 'It is a workbench, not a store',
    body: 'There is no storefront, no checkout, no login, no multi-tenancy and no background job. Nothing connects to Shopify, Amazon, GA4 or an ad platform — in particular this project never calls SP-API, which would need a real seller account — and no page is ever crawled.',
  },
];

export function AboutView() {
  const totalSeconds = DEMO_PATH.reduce((sum, step) => sum + step.seconds, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Why this project exists" />
        <CardBody className="flex max-w-3xl flex-col gap-3 text-sm">
          <p>
            Running a direct-to-consumer store means answering the same question
            every week with evidence from tools that do not talk to each other:
            search console says one thing, the analytics suite another, the ad
            platform a third, and the product catalogue sits somewhere else
            entirely. Each tool is internally consistent and none of them agree,
            so the weekly decision usually gets made on whichever number was
            easiest to find.
          </p>
          <p>
            GrowthOS is an attempt at the opposite. It is a decision workbench
            for a fictional outdoor brand, {DEMO_BRAND} ({DEMO_MARKET}, USD),
            built so that every number on every screen comes from one definition
            and one calculation, and so that every recommendation can be traced
            back to the rule and the evidence that produced it.
          </p>
          <p>
            It was built as a portfolio piece: the interesting part is not that
            it renders charts, but that it is opinionated about metric
            definitions, honest about what a heuristic can and cannot know, and
            willing to show a finding it cannot explain rather than round it
            away.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="The problem it is modelled on"
          description="Four failure modes that this project is deliberately built against."
        />
        <CardBody>
          <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="font-medium">The same word means two things</dt>
              <dd className="mt-1 text-[var(--color-ink-muted)]">
                &ldquo;Conversion rate&rdquo; can be per session, per user or per
                visit; &ldquo;revenue&rdquo; can include tax and shipping or not.
                Two dashboards disagree and nobody can say which is wrong. Here
                every ratio is defined once, in one module, and every screen
                imports it.
              </dd>
            </div>
            <div>
              <dt className="font-medium">A score with no argument behind it</dt>
              <dd className="mt-1 text-[var(--color-ink-muted)]">
                A tool says a page scores 62 and offers no way to disagree.
                Every score here decomposes into named checks with a pass, a
                warning or a failure, the evidence that decided it, and a rule
                version.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Findings that go nowhere</dt>
              <dd className="mt-1 text-[var(--color-ink-muted)]">
                Audits produce lists; lists produce nothing. Every finding in
                this project becomes a task with a priority, an estimate and a
                link back to the page it is about — and a completion that
                survives a reload.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Correlation dressed as cause</dt>
              <dd className="mt-1 text-[var(--color-ink-muted)]">
                The funnel can say where sessions are lost. It cannot say why,
                and this project never pretends otherwise: its advice is phrased
                as a hypothesis with a suggested way to test it.
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="How the modules fit together"
          description="Each module answers one question. Recommendations is where they converge."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Each module, the sales line it reports on, and the question it answers">
              <THead>
                <TR>
                  <TH>Module</TH>
                  <TH>Reports on</TH>
                  <TH>The question it answers</TH>
                </TR>
              </THead>
              <TBody>
                {NAV_ITEMS.map((item) => (
                  <TR key={item.href}>
                    <TH scope="row">
                      <Link
                        href={item.href}
                        className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        data-testid={`about-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {item.label}
                      </Link>
                    </TH>
                    <TD>{item.channel}</TD>
                    <TD>{item.question}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="The chain, end to end" />
        <CardBody className="flex max-w-3xl flex-col gap-3 text-sm">
          <p data-testid="about-chain">
            On the storefront: SEO, GEO and Content decide what exists and how
            findable it is → Analytics says which channels brought sessions and
            what they cost → the Funnel says where those sessions were lost. On
            Amazon, a separate chain: listing quality decides whether an ASIN is
            fit to sell at all. Both ends feed Recommendations, which turns
            everything into one ordered list of things to do.
          </p>
          <p className="text-[var(--color-ink-muted)]">
            The direction matters. Recommendations recalculates nothing: it
            calls each engine and merges the output. If the SEO audit changes
            its mind about a page, the task list changes with it on the next
            load. That is why only the &ldquo;done&rdquo; decision is stored —
            the findings themselves are always regenerated, so they cannot drift
            away from what the engines currently say.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Guided walkthrough"
          description={`About ${Math.round(totalSeconds / 60)} minutes end to end. The same path is in the README.`}
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="A demo path through the workbench, in order">
              <THead>
                <TR>
                  <TH>Step</TH>
                  <TH>What to show</TH>
                </TR>
              </THead>
              <TBody>
                {DEMO_PATH.map((step) => (
                  <TR key={step.step}>
                    <TH scope="row">
                      <Link
                        href={step.href}
                        className="whitespace-nowrap underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                      >
                        {step.step}
                      </Link>
                    </TH>
                    <TD>{step.what}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What this model cannot do"
          description="Stated here rather than buried, because a portfolio piece that overclaims is worse than one that does less."
        />
        <CardBody>
          <dl className="flex flex-col gap-4 text-sm" data-testid="about-limitations">
            {LIMITATIONS.map((item) => (
              <div key={item.heading}>
                <dt className="font-medium">{item.heading}</dt>
                <dd className="mt-1 max-w-3xl text-[var(--color-ink-muted)]">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Data window and determinism" />
        <CardBody className="flex max-w-3xl flex-col gap-3 text-sm">
          <p>
            All modules read the same fixed window:{' '}
            <strong>{formatDateRange(DEMO_WINDOW.start, DEMO_WINDOW.end)}</strong>{' '}
            — {DEMO_WINDOW.days} days, inclusive of both ends, in UTC. The end
            date is a constant, not today, so the demo never pretends a seeded
            dataset is live.
          </p>
          <p className="text-[var(--color-ink-muted)]">
            Nothing is randomised at render time. The generator is seeded, so
            the same session counts, orders and scores appear on every machine
            and in every test run. Money is held as integer cents throughout and
            formatted only for display.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
