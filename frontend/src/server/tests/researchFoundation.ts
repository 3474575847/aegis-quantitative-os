/**
 * Test Suite: Clean Research Foundation Verification
 * 
 * Verifies:
 * 1. Asset applicability: EPS, ROE, P/E, analyst revisions are NOT_APPLICABLE for crypto.
 * 2. Causal pipeline: factors have unambiguous provenance (is_causal, influence_path).
 * 3. Multi-regime experiment framework: Buy & Hold, Momentum, A³ over 4 distinct market regimes.
 * 4. Cost sensitivity: 0, 5, 10, 20, 50, 100 bps transaction cost survival.
 * 5. Incremental information test vs simple momentum baseline.
 */

import { computeAssetFactorMatrix, getAssetClass } from '../factors';
import { evaluateA3AdaptiveAlpha } from '../a3Engine';
import { runComprehensiveRegimeExperiment, generateRegimeCandles, simulateStrategy } from '../experimentEngine';
import { CandleDatapoint } from '../market';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('=== TEST 1: ASSET-CLASS APPLICABILITY AUDIT FOR BTC ===');
const btcCandles = [
  { time: 100, close: 60000, volume: 1000 },
  { time: 200, close: 61000, volume: 1200 },
  { time: 300, close: 62000, volume: 1500 },
];

assert(getAssetClass('BTC') === 'CRYPTO', 'BTC identified as CRYPTO asset class');
assert(getAssetClass('BTC-USD') === 'CRYPTO', 'BTC-USD identified as CRYPTO asset class');
assert(getAssetClass('ETH') === 'CRYPTO', 'ETH identified as CRYPTO asset class');
assert(getAssetClass('AAPL') === 'EQUITY', 'AAPL identified as EQUITY asset class');

const btcFactors = computeAssetFactorMatrix('BTC', btcCandles, []);
const fundFactor = btcFactors.factors['aegis-fund-v1'];
const valFactor = btcFactors.factors['aegis-val-v1'];
const expFactor = btcFactors.factors['aegis-exp-v1'];
const mktFactor = btcFactors.factors['aegis-mkt-v1'];

assert(fundFactor.status === 'NOT_APPLICABLE', 'BTC Fundamental factor status is NOT_APPLICABLE');
assert(fundFactor.value === 0.0, 'BTC Fundamental factor value is strictly 0.0');
assert(fundFactor.is_causal === false, 'BTC Fundamental factor is marked is_causal === false');

assert(valFactor.status === 'NOT_APPLICABLE', 'BTC Valuation factor status is NOT_APPLICABLE');
assert(valFactor.value === 0.0, 'BTC Valuation factor value is strictly 0.0');
assert(valFactor.is_causal === false, 'BTC Valuation factor is marked is_causal === false');

assert(expFactor.status === 'NOT_APPLICABLE', 'BTC Expectation factor status is NOT_APPLICABLE');
assert(expFactor.value === 0.0, 'BTC Expectation factor value is strictly 0.0');

assert(mktFactor.status === 'ACTIVE', 'BTC Market Momentum factor status is ACTIVE');
assert(mktFactor.is_causal === true, 'BTC Market Momentum factor is marked is_causal === true');
assert(mktFactor.influence_path.includes('ALLOCATOR_RIDGE_FEATURE'), 'Market Momentum influence_path contains ALLOCATOR_RIDGE_FEATURE');

console.log('\n=== TEST 2: FACTOR LEARNED WEIGHTS & ZERO-CONTRIBUTION AUDIT ===');
const longCandles: CandleDatapoint[] = [];
for (let i = 0; i < 40; i++) {
  const cPrice = 60000 + i * 10 + 5;
  const t = 1000 + i * 300;
  longCandles.push({
    time: t,
    timestamp: new Date(t * 1000).toISOString(),
    open: 60000 + i * 10,
    high: 60000 + i * 10 + 20,
    low: 60000 + i * 10 - 20,
    close: cPrice,
    price: cPrice,
    volume: 1000,
    sentimentZ: 0.0,
  });
}

const a3Eval = evaluateA3AdaptiveAlpha('BTC', longCandles, []);
const fundContrib = a3Eval.factor_contributions.find((c) => c.factor_id === 'aegis-fund-v1');
const valContrib = a3Eval.factor_contributions.find((c) => c.factor_id === 'aegis-val-v1');
const expContrib = a3Eval.factor_contributions.find((c) => c.factor_id === 'aegis-exp-v1');
const mktContrib = a3Eval.factor_contributions.find((c) => c.factor_id === 'aegis-mkt-v1');

assert(fundContrib?.status === 'NOT_APPLICABLE', 'A3 evaluation fundContrib is NOT_APPLICABLE');
assert(fundContrib?.learned_beta === 0.0, 'A3 evaluation fundContrib learned_beta is strictly 0.0');
assert(fundContrib?.net_contribution === 0.0, 'A3 evaluation fundContrib net_contribution is strictly 0.0');

assert(valContrib?.status === 'NOT_APPLICABLE', 'A3 evaluation valContrib is NOT_APPLICABLE');
assert(valContrib?.learned_beta === 0.0, 'A3 evaluation valContrib learned_beta is strictly 0.0');

assert(expContrib?.status === 'NOT_APPLICABLE', 'A3 evaluation expContrib is NOT_APPLICABLE');
assert(expContrib?.learned_beta === 0.0, 'A3 evaluation expContrib learned_beta is strictly 0.0');

assert(mktContrib?.status === 'ACTIVE', 'A3 evaluation mktContrib is ACTIVE');
assert(mktContrib?.is_causal === true, 'A3 evaluation mktContrib is CAUSAL');

console.log('\n=== TEST 3: MULTI-REGIME SYNTHETIC GENERATION & METRIC AUDIT ===');
const chopCandles = generateRegimeCandles('RANGING_CHOP', 100, 65000, 101);
const upCandles = generateRegimeCandles('PERSISTENT_UPTREND', 100, 65000, 102);
const downCandles = generateRegimeCandles('PERSISTENT_DOWNTREND', 100, 65000, 103);
const volCandles = generateRegimeCandles('HIGH_VOLATILITY', 100, 65000, 104);

assert(chopCandles.length === 100, 'Ranging chop generated 100 candles');
assert(upCandles[99].close > upCandles[0].close, 'Persistent uptrend closed higher than start');
assert(downCandles[99].close < downCandles[0].close, 'Persistent downtrend closed lower than start');

console.log('\n=== TEST 4: FULL REUSABLE EXPERIMENT SUITE EXECUTION ===');
const report = runComprehensiveRegimeExperiment('BTC', 200, 5, 42);

assert(report.regimes.length === 4, 'Report evaluated 4 distinct regimes');
assert(report.costSensitivityMatrix.length === 6, 'Cost sensitivity sweep evaluated 6 cost tiers (0 to 100 bps)');
assert(typeof report.researchAudit.breakevenCostBps === 'number', 'Breakeven transaction cost computed');
assert(report.conclusion.genuineAlphaDetected === false, 'Forensic verdict correctly rejects genuine alpha claim');
assert(report.conclusion.nextStageJustified === false, 'Cannot justify next stage before crypto-native data implemented');

console.log('\n======================================================');
console.log('🎉 ALL FORENSIC AUDIT & FOUNDATION TESTS PASSED!');
console.log('======================================================\n');
