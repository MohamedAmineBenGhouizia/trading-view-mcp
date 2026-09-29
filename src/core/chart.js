/**
 * Core chart control logic.
 */
import { evaluate, withChartTransaction, getTargetInfo } from '../connection.js';
import { waitForChartReady, waitForCondition } from '../wait.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

import { chartStateManager } from './state-manager.js';

export async function getState() {
  const state = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var studies = [];
      try {
        var allStudies = chart.getAllStudies();
        studies = allStudies.map(function(s) {
          return { id: s.id, name: s.name || s.title || 'unknown' };
        });
      } catch(e) {}
      return {
        symbol: chart.symbol(),
        resolution: chart.resolution(),
        chartType: chart.chartType(),
        studies: studies,
      };
    })()
  `, { label: 'chart.getState' });

  chartStateManager.updateState({
    symbol: state?.symbol,
    timeframe: state?.resolution,
    resolution: state?.resolution,
  });

  return { success: true, ...state, generation: chartStateManager.getGeneration() };
}

/**
 * Returns an authoritative atomic snapshot of the current chart state
 * including targetId, symbol, timeframe, resolution, lastBarTime, barCount, dataReady, and generation.
 */
export async function getChartSnapshot() {
  const target = await getTargetInfo().catch(() => null);
  const raw = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var sym = typeof chart.symbol === 'function' ? chart.symbol() : '';
      var res = typeof chart.resolution === 'function' ? String(chart.resolution()) : '';
      var cType = typeof chart.chartType === 'function' ? chart.chartType() : null;

      var barCount = 0;
      var lastBarTime = null;
      var lastBarClose = null;

      try {
        var model = chart._chartWidget ? chart._chartWidget.model() : null;
        if (model && model.mainSeries) {
          var ms = model.mainSeries();
          var bars = ms.bars ? ms.bars() : null;
          if (bars && typeof bars.size === 'function') {
            barCount = bars.size();
            var lastIdx = typeof bars.lastIndex === 'function' ? bars.lastIndex() : -1;
            if (lastIdx >= 0) {
              var v = bars.valueAt(lastIdx);
              if (v) {
                lastBarTime = v[0];
                lastBarClose = v[4];
              }
            }
          }
        }
      } catch (e) {}

      return {
        symbol: sym,
        resolution: res,
        timeframe: res,
        chartType: cType,
        barCount: barCount,
        lastBarTime: lastBarTime,
        lastBarClose: lastBarClose,
        dataReady: barCount > 0,
      };
    })()
  `, { label: 'chart.getChartSnapshot' });

  chartStateManager.updateState({
    targetId: target?.id || null,
    symbol: raw?.symbol,
    timeframe: raw?.timeframe,
    resolution: raw?.resolution,
    barCount: raw?.barCount,
    lastBarTime: raw?.lastBarTime,
    dataReady: !!raw?.dataReady,
  });

  return {
    targetId: target?.id || null,
    symbol: raw?.symbol || '',
    timeframe: raw?.timeframe || '',
    resolution: raw?.resolution || '',
    lastBarTime: raw?.lastBarTime || null,
    barCount: raw?.barCount || 0,
    dataReady: !!raw?.dataReady,
    generation: chartStateManager.getGeneration(),
    timestamp: Date.now(),
    chartType: raw?.chartType,
    lastBarClose: raw?.lastBarClose,
  };
}

export async function setSymbol({ symbol }) {
  return withChartTransaction(`chart.setSymbol(${symbol})`, async () => {
    chartStateManager.bumpGeneration(`setSymbol: ${symbol}`, { symbol });

    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.setSymbol(${JSON.stringify(symbol)}, {});
      })()
    `, { label: `chart.setSymbol(${symbol})` });

    const ready = await waitForChartReady(symbol);
    const snapshot = ready ? await getChartSnapshot() : null;

    return {
      success: true,
      symbol,
      chart_ready: ready,
      generation: chartStateManager.getGeneration(),
      snapshot,
    };
  });
}

export async function setTimeframe({ timeframe }) {
  return withChartTransaction(`chart.setTimeframe(${timeframe})`, async () => {
    chartStateManager.bumpGeneration(`setTimeframe: ${timeframe}`, { timeframe, resolution: timeframe });

    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.setResolution(${JSON.stringify(timeframe)}, {});
      })()
    `, { label: `chart.setResolution(${timeframe})` });

    const ready = await waitForChartReady(null, timeframe);
    const snapshot = ready ? await getChartSnapshot() : null;

    return {
      success: true,
      timeframe,
      chart_ready: ready,
      generation: chartStateManager.getGeneration(),
      snapshot,
    };
  });
}

export async function setType({ chart_type }) {
  const typeMap = {
    'Bars': 0, 'Candles': 1, 'Line': 2, 'Area': 3,
    'Renko': 4, 'Kagi': 5, 'PointAndFigure': 6, 'LineBreak': 7,
    'HeikinAshi': 8, 'HollowCandles': 9,
  };
  const typeNum = typeMap[chart_type] ?? Number(chart_type);
  if (isNaN(typeNum)) {
    throw new Error(`Unknown chart type: ${chart_type}. Use a name (Candles, Line, etc.) or number (0-9).`);
  }
  return withChartTransaction(`chart.setType(${chart_type})`, async () => {
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.setChartType(${typeNum});
      })()
    `, { label: `chart.setType(${typeNum})` });
    return { success: true, chart_type, type_num: typeNum };
  });
}

export async function manageIndicator({ action, indicator, entity_id, inputs: inputsRaw }) {
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : undefined;

  return withChartTransaction(`chart.manageIndicator(${action}, ${indicator || entity_id})`, async () => {
    if (action === 'add') {
      const inputArr = inputs ? Object.entries(inputs).map(([k, v]) => ({ id: k, value: v })) : [];
      const before = (await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`, { label: 'getStudies.before' })) || [];

      await evaluate(`
        (function() {
          var chart = ${CHART_API};
          chart.createStudy(${JSON.stringify(indicator)}, false, false, ${JSON.stringify(inputArr)});
        })()
      `, { label: `chart.createStudy(${indicator})` });

      const newIds = await waitForCondition(async () => {
        const after = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`, { label: 'getStudies.diff' });
        const diff = (after || []).filter(id => !before.includes(id));
        return diff.length > 0 ? diff : false;
      }, { timeout: 3000, interval: 50, label: `waitForStudyAdded(${indicator})` });

      const studyIds = Array.isArray(newIds) ? newIds : [];
      return { success: studyIds.length > 0, action: 'add', indicator, entity_id: studyIds[0] || null, new_study_count: studyIds.length };
    } else if (action === 'remove') {
      if (!entity_id) throw new Error('entity_id required for remove action. Use chart_get_state to find study IDs.');
      await evaluate(`
        (function() {
          var chart = ${CHART_API};
          chart.removeEntity(${JSON.stringify(entity_id)});
        })()
      `, { label: `chart.removeEntity(${entity_id})` });
      return { success: true, action: 'remove', entity_id };
    } else {
      throw new Error('action must be "add" or "remove"');
    }
  });
}

export async function getVisibleRange() {
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      return { visible_range: chart.getVisibleRange(), bars_range: chart.getVisibleBarsRange() };
    })()
  `, { label: 'chart.getVisibleRange' });
  return { success: true, visible_range: result.visible_range, bars_range: result.bars_range };
}

export async function setVisibleRange({ from, to }) {
  return withChartTransaction(`chart.setVisibleRange(${from}, ${to})`, async () => {
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        var m = chart._chartWidget.model();
        var ts = m.timeScale();
        var bars = m.mainSeries().bars();
        var startIdx = bars.firstIndex();
        var endIdx = bars.lastIndex();
        var fromIdx = startIdx, toIdx = endIdx;
        for (var i = startIdx; i <= endIdx; i++) {
          var v = bars.valueAt(i);
          if (v && v[0] >= ${from} && fromIdx === startIdx) fromIdx = i;
          if (v && v[0] <= ${to}) toIdx = i;
        }
        ts.zoomToBarsRange(fromIdx, toIdx);
      })()
    `, { label: `chart.zoomToBarsRange(${from}, ${to})` });

    const actual = await waitForCondition(async () => {
      const r = await evaluate(`
        (function() {
          var chart = ${CHART_API};
          try { var range = chart.getVisibleRange(); return { from: range.from || 0, to: range.to || 0 }; }
          catch(e) { return null; }
        })()
      `, { label: 'checkVisibleRange' });
      return r && (r.from !== 0 || r.to !== 0) ? r : false;
    }, { timeout: 1000, interval: 50, label: 'waitForVisibleRangeUpdate' });

    return { success: true, requested: { from, to }, actual: actual || { from: 0, to: 0 } };
  });
}

export async function scrollToDate({ date }) {
  return withChartTransaction(`chart.scrollToDate(${date})`, async () => {
    let timestamp;
    if (/^\d+$/.test(date)) timestamp = Number(date);
    else timestamp = Math.floor(new Date(date).getTime() / 1000);
    if (isNaN(timestamp)) throw new Error(`Could not parse date: ${date}. Use ISO format (2024-01-15) or unix timestamp.`);

    const resolution = await evaluate(`${CHART_API}.resolution()`, { label: 'getResolution' });
    let secsPerBar = 60;
    const res = String(resolution);
    if (res === 'D' || res === '1D') secsPerBar = 86400;
    else if (res === 'W' || res === '1W') secsPerBar = 604800;
    else if (res === 'M' || res === '1M') secsPerBar = 2592000;
    else { const mins = parseInt(res, 10); if (!isNaN(mins)) secsPerBar = mins * 60; }

    const halfWindow = 25 * secsPerBar;
    const from = timestamp - halfWindow;
    const to = timestamp + halfWindow;

    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        var m = chart._chartWidget.model();
        var ts = m.timeScale();
        var bars = m.mainSeries().bars();
        var startIdx = bars.firstIndex();
        var endIdx = bars.lastIndex();
        var fromIdx = startIdx, toIdx = endIdx;
        for (var i = startIdx; i <= endIdx; i++) {
          var v = bars.valueAt(i);
          if (v && v[0] >= ${from} && fromIdx === startIdx) fromIdx = i;
          if (v && v[0] <= ${to}) toIdx = i;
        }
        ts.zoomToBarsRange(fromIdx, toIdx);
      })()
    `, { label: `chart.scrollToDate(${date})` });

    await waitForCondition(async () => {
      const r = await evaluate(`${CHART_API}.getVisibleRange()`, { label: 'checkVisibleRange' });
      return r != null ? r : false;
    }, { timeout: 1000, interval: 50, label: 'waitForScroll' });

    return { success: true, date, centered_on: timestamp, resolution, window: { from, to } };
  });
}

/**
 * Execute sequential, non-interfering multi-timeframe analysis for a symbol.
 * Atomically locks chart transaction so no concurrent operations can mix resolutions.
 */
export async function getMultiTimeframeData({ symbol, timeframes = ['D', '240', '60', '15', '5'], count = 100 } = {}) {
  const currentSymbol = symbol || (await getState()).symbol;
  return withChartTransaction(`chart.multiTimeframe(${currentSymbol})`, async () => {
    const results = [];
    for (const tf of timeframes) {
      await evaluate(`
        (function() {
          var chart = ${CHART_API};
          if (${JSON.stringify(currentSymbol)} && chart.symbol() !== ${JSON.stringify(currentSymbol)}) {
            chart.setSymbol(${JSON.stringify(currentSymbol)}, {});
          }
          chart.setResolution(${JSON.stringify(tf)}, {});
        })()
      `, { label: `mtf.set(${currentSymbol}, ${tf})` });

      const ready = await waitForChartReady(currentSymbol, tf);
      const snapshot = await getChartSnapshot();

      const barsData = await evaluate(`
        (function() {
          var chart = ${CHART_API};
          var bars = chart._chartWidget.model().mainSeries().bars();
          if (!bars || typeof bars.lastIndex !== 'function') return [];
          var res = [];
          var end = bars.lastIndex();
          var start = Math.max(bars.firstIndex(), end - ${Math.min(count, 500)} + 1);
          for (var i = start; i <= end; i++) {
            var v = bars.valueAt(i);
            if (v) res.push({ time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] || 0 });
          }
          return res;
        })()
      `, { label: `mtf.readBars(${tf})` });

      results.push({
        symbol: currentSymbol,
        timeframe: tf,
        resolution: snapshot.resolution,
        lastBarTime: snapshot.lastBarTime,
        bar_count: barsData.length,
        bars: barsData,
        chart_ready: ready,
      });
    }

    return {
      success: true,
      symbol: currentSymbol,
      timeframes_scanned: results.length,
      data: results,
    };
  });
}

export async function symbolInfo() {
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var info = chart.symbolExt();
      return {
        symbol: info.symbol, full_name: info.full_name, exchange: info.exchange,
        description: info.description, type: info.type, pro_name: info.pro_name,
        typespecs: info.typespecs, resolution: chart.resolution(), chart_type: chart.chartType()
      };
    })()
  `, { label: 'chart.symbolInfo' });
  return { success: true, ...result };
}

export async function symbolSearch({ query, type }) {
  const params = new URLSearchParams({
    text: query,
    hl: '1',
    exchange: '',
    lang: 'en',
    search_type: type || '',
    domain: 'production',
  });

  const resp = await fetch(`https://symbol-search.tradingview.com/symbol_search/v3/?${params}`, {
    headers: { 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/' },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`Symbol search API returned ${resp.status}`);
  const data = await resp.json();

  const strip = s => (s || '').replace(/<\/?em>/g, '');
  const results = (data.symbols || data || []).slice(0, 15).map(r => ({
    symbol: strip(r.symbol),
    description: strip(r.description),
    exchange: r.exchange || r.prefix || '',
    type: r.type || '',
    full_name: r.exchange ? `${r.exchange}:${strip(r.symbol)}` : strip(r.symbol),
  }));

  return { success: true, query, source: 'rest_api', results, count: results.length };
}
