/**
 * Core replay mode logic.
 */
import { evaluate, getReplayApi, withChartTransaction } from '../connection.js';
import { waitForCondition } from '../wait.js';

function wv(path) {
  return `(function(){ var v = ${path}; return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; })()`;
}

export async function start({ date } = {}) {
  return withChartTransaction('replay:start', async () => {
    const rp = await getReplayApi();
    const available = await evaluate(wv(`${rp}.isReplayAvailable()`));
    if (!available) throw new Error('Replay is not available for the current symbol/timeframe');

    await evaluate(`${rp}.showReplayToolbar()`);

    if (date) await evaluate(`${rp}.selectDate(new Date(${JSON.stringify(date)}))`);
    else await evaluate(`${rp}.selectFirstAvailableDate()`);

    // Reactively wait for replay to start or for an error toast
    const statusResult = await waitForCondition(async () => {
      const res = await evaluate(`
        (function() {
          var r = ${rp};
          function unwrap(v) { return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; }
          var started = unwrap(r.isReplayStarted());
          if (started) return { started: true };
          var toasts = document.querySelectorAll('[class*="toast"], [class*="notification"], [class*="banner"]');
          for (var i = 0; i < toasts.length; i++) {
            var text = toasts[i].textContent || '';
            if (/data point unavailable|not available for playback/i.test(text)) {
              return { error: text.trim().substring(0, 200) };
            }
          }
          return false;
        })()
      `);
      return res || false;
    }, { timeout: 3000, interval: 50, label: 'replay.start' });

    if (statusResult?.error) {
      try { await evaluate(`${rp}.stopReplay()`); } catch {}
      try { await evaluate(`${rp}.hideReplayToolbar()`); } catch {}
      throw new Error(`Replay date unavailable: "${statusResult.error}". The requested date has no data for this timeframe. Try a more recent date or switch to a higher timeframe (e.g., Daily).`);
    }

    const started = await evaluate(wv(`${rp}.isReplayStarted()`));
    const currentDate = await evaluate(wv(`${rp}.currentDate()`));
    return { success: true, replay_started: !!started, date: date || '(first available)', current_date: currentDate };
  });
}

export async function step() {
  return withChartTransaction('replay:step', async () => {
    const rp = await getReplayApi();
    const started = await evaluate(wv(`${rp}.isReplayStarted()`));
    if (!started) throw new Error('Replay is not started. Use replay_start first.');
    await evaluate(`${rp}.doStep()`);
    const currentDate = await evaluate(wv(`${rp}.currentDate()`));
    return { success: true, action: 'step', current_date: currentDate };
  });
}

export async function autoplay({ speed } = {}) {
  return withChartTransaction('replay:autoplay', async () => {
    const rp = await getReplayApi();
    const started = await evaluate(wv(`${rp}.isReplayStarted()`));
    if (!started) throw new Error('Replay is not started. Use replay_start first.');
    if (speed > 0) await evaluate(`${rp}.changeAutoplayDelay(${speed})`);
    await evaluate(`${rp}.toggleAutoplay()`);
    const isAutoplay = await evaluate(wv(`${rp}.isAutoplayStarted()`));
    const currentDelay = await evaluate(wv(`${rp}.autoplayDelay()`));
    return { success: true, autoplay_active: !!isAutoplay, delay_ms: currentDelay };
  });
}

export async function stop() {
  return withChartTransaction('replay:stop', async () => {
    const rp = await getReplayApi();
    const started = await evaluate(wv(`${rp}.isReplayStarted()`));
    if (!started) {
      // Try to hide toolbar even if not started
      try { await evaluate(`${rp}.hideReplayToolbar()`); } catch {}
      return { success: true, action: 'already_stopped' };
    }
    await evaluate(`${rp}.stopReplay()`);
    try { await evaluate(`${rp}.hideReplayToolbar()`); } catch {}
    return { success: true, action: 'replay_stopped' };
  });
}

export async function trade({ action }) {
  return withChartTransaction(`replay:trade:${action}`, async () => {
    const rp = await getReplayApi();
    const started = await evaluate(wv(`${rp}.isReplayStarted()`));
    if (!started) throw new Error('Replay is not started. Use replay_start first.');

    if (action === 'buy') await evaluate(`${rp}.buy()`);
    else if (action === 'sell') await evaluate(`${rp}.sell()`);
    else if (action === 'close') await evaluate(`${rp}.closePosition()`);
    else throw new Error('Invalid action. Use: buy, sell, or close');

    const position = await evaluate(wv(`${rp}.position()`));
    const pnl = await evaluate(wv(`${rp}.realizedPL()`));
    return { success: true, action, position, realized_pnl: pnl };
  });
}

export async function status() {
  const rp = await getReplayApi();
  const st = await evaluate(`
    (function() {
      var r = ${rp};
      function unwrap(v) { return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; }
      return {
        is_replay_available: unwrap(r.isReplayAvailable()),
        is_replay_started: unwrap(r.isReplayStarted()),
        is_autoplay_started: unwrap(r.isAutoplayStarted()),
        replay_mode: unwrap(r.replayMode()),
        current_date: unwrap(r.currentDate()),
        autoplay_delay: unwrap(r.autoplayDelay()),
      };
    })()
  `);
  const pos = await evaluate(wv(`${rp}.position()`));
  const pnl = await evaluate(wv(`${rp}.realizedPL()`));
  return { success: true, ...st, position: pos, realized_pnl: pnl };
}
