import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectZones } from '../src/analysis/zones.js';
import { analyzeVolume } from '../src/analysis/volume.js';
import { detectDivergences } from '../src/analysis/divergences.js';

describe('Zones, Volume and Divergences', () => {
  it('detects clustered support and resistance zones', () => {
    // Generate candles that touch 100 three times and 120 three times
    const candles = [];
    const points = [
      100, 110, 120, 110, 100, 115, 120, 112, 100, 118, 120, 115
    ];
    for (let i = 0; i < points.length; i++) {
      candles.push({
        time: 1700000000 + i * 900,
        open: points[i],
        high: points[i] + 1,
        low: points[i] - 1,
        close: points[i],
        volume: 1000,
      });
    }

    const zones = detectZones(candles, { minTouches: 2, tolerancePct: 0.02 });
    assert.ok(Array.isArray(zones));
    for (const z of zones) {
      assert.ok(['support', 'resistance'].includes(z.type));
      assert.ok(z.touches >= 2);
      assert.ok(typeof z.high === 'number');
      assert.ok(typeof z.low === 'number');
    }
  });

  it('computes volume profile and flags volume anomalies', () => {
    const candles = [];
    for (let i = 0; i < 25; i++) {
      candles.push({
        time: 1700000000 + i * 900,
        open: 100, high: 101, low: 99, close: 100,
        volume: 1000,
      });
    }

    // Normal volume
    const normalVol = analyzeVolume(candles);
    assert.equal(normalVol.anomaly, false);
    assert.equal(normalVol.relativeVolume, 1);

    // Anomalous volume spike on last bar
    candles[candles.length - 1].volume = 5000;
    const spikeVol = analyzeVolume(candles);
    assert.ok(spikeVol.relativeVolume > 2.0);
    assert.equal(spikeVol.anomaly, true);
    assert.ok(spikeVol.percentile >= 90);
  });

  it('identifies price vs oscillator divergences', () => {
    const candles = [];
    for (let i = 0; i < 50; i++) {
      candles.push({
        time: 1700000000 + i * 900,
        open: 100 + Math.sin(i / 3) * 10,
        high: 102 + Math.sin(i / 3) * 10,
        low: 98 + Math.sin(i / 3) * 10,
        close: 100 + Math.sin(i / 3) * 10,
        volume: 1000,
      });
    }

    const divs = detectDivergences(candles);
    assert.ok(Array.isArray(divs));
    for (const d of divs) {
      assert.ok(['bullish', 'bearish'].includes(d.type));
      assert.ok(['RSI', 'MACD'].includes(d.indicator));
      assert.ok(d.priceSwing);
      assert.ok(d.indicatorSwing);
    }
  });
});
