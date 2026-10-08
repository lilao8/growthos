/**
 * Mutation testing, scoped to the pure core.
 *
 * The question this answers is the one the ordinary suite cannot: would the
 * tests notice if the code were wrong? This project has shipped four tests
 * that would have passed with the code they covered deleted — a fixture that
 * never crossed the byte limit it demonstrated, a counter-example that failed
 * an earlier condition and so never reached the branch under test, an
 * assertion on a field that was always true, and a tally test whose closed
 * finding was the wrong priority to tell the two rules apart. Each was caught
 * by hand, late. Stryker catches that class mechanically.
 *
 * Scoped to `src/domain` on purpose. That is where every one of those four
 * lived, it is pure by construction, and its unit suite runs in ~300ms, which
 * is what makes mutating it affordable at all. Mutating the React views would
 * cost far more and mostly report mutants no assertion was ever meant to
 * catch.
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',

  /**
   * The `command` runner, not `vitest`, on purpose.
   *
   * @stryker-mutator/vitest-runner@10 declares `vitest >=2.0.0`, an open range
   * written before Vitest 5 existed, and against Vitest 5 it drives nothing:
   * every run ended "Ran 0.00 tests per mutant on average" and reported every
   * mutant as survived. That reads as a catastrophic test suite rather than as
   * a broken runner, which is exactly the kind of number worth distrusting.
   * Checked by hand: flipping `denominator === 0` to `!== 0` in metrics.ts
   * fails 51 tests across 6 files, while the vitest runner scored that same
   * file 0% with 27 survived.
   *
   * The command runner shells out to the real `npm run test`, so it cannot
   * drift from what the suite actually does. The cost is no per-test coverage
   * mapping — every mutant runs the whole unit suite — which only works
   * because that suite finishes in ~300ms.
   */
  testRunner: 'command',
  commandRunner: { command: 'npm run test -- --run' },
  coverageAnalysis: 'off',

  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },

  mutate: [
    'src/domain/**/*.ts',
    // Type declarations hold no logic to mutate.
    '!src/domain/types.ts',
    // Config holds the rule weights and thresholds. Mutating a weight produces
    // a different-but-equally-arbitrary rule set, which no test should be
    // asserting on literally; the engines that consume them are mutated
    // instead, which is where a wrong number actually shows up.
    '!src/domain/**/config.ts',
  ],

  thresholds: {
    // `break` is the measured floor, not a target. The first honest run scored
    // 66.02%; after the tests that run prompted, 68.50% (2804 killed, 1292
    // survived, 6 timeouts). A run below 68 fails the command, so the score can
    // rise without anyone touching this and cannot quietly fall.
    //
    // Six timeouts are 0.15 points, which is the only nondeterminism here, so
    // 68 rather than 68.5 keeps a timeout flipping from failing a clean run.
    high: 80,
    low: 60,
    break: 68,
  },

  // The suite is fast, so the default of one worker per core is affordable.
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  disableTypeChecks: 'src/domain/**/*.ts',
};

export default config;
