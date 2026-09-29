/**
 * Centralized Chart State Manager with Generation Tracking and Operation Contexts.
 * Provides a single source of truth for TradingView chart state, tracks mutations,
 * and detects stale operations.
 */
import { ErrorCode, TradingViewError } from './errors.js';
import { logDebug } from '../connection.js';

let opCounter = 0;

export class OperationContext {
  /**
   * @param {object} params
   * @param {string} params.label
   * @param {number} params.generation
   * @param {string|null} params.symbol
   * @param {string|null} params.timeframe
   * @param {string|null} params.targetId
   * @param {ChartStateManager} params.stateManager
   */
  constructor({ label, generation, symbol, timeframe, targetId, stateManager }) {
    this.operationId = `op_${Date.now()}_${++opCounter}_${Math.random().toString(36).slice(2, 7)}`;
    this.label = label;
    this.generation = generation;
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.targetId = targetId;
    this.startedAt = Date.now();
    this._stateManager = stateManager;
    Object.freeze(this);
  }

  isStale() {
    return this._stateManager.getGeneration() !== this.generation;
  }

  assertNotStale() {
    const currentGen = this._stateManager.getGeneration();
    if (currentGen !== this.generation) {
      throw new TradingViewError(
        ErrorCode.STALE_CHART_STATE,
        `Operation "${this.label}" invalidated: chart state changed (started at gen ${this.generation}, current gen ${currentGen})`,
        {
          retryable: true,
          operationId: this.operationId,
          context: {
            operationSymbol: this.symbol,
            operationTf: this.timeframe,
            startedGeneration: this.generation,
            currentGeneration: currentGen,
          },
        }
      );
    }
  }

  toJSON() {
    return {
      operationId: this.operationId,
      label: this.label,
      symbol: this.symbol,
      timeframe: this.timeframe,
      targetId: this.targetId,
      generation: this.generation,
      startedAt: this.startedAt,
    };
  }
}

export class ChartStateManager {
  constructor() {
    this._generation = 1;
    this._state = {
      targetId: null,
      chartId: null,
      paneId: null,
      tabId: null,
      symbol: null,
      timeframe: null,
      resolution: null,
      lastBarTime: null,
      barCount: 0,
      dataReady: false,
      updatedAt: Date.now(),
      generation: 1,
    };
    this._listeners = new Set();
  }

  getGeneration() {
    return this._generation;
  }

  /**
   * Monotonically increments the generation ID and updates state.
   * Call when an authoritative mutation (setSymbol, setTimeframe, layout change) occurs.
   * @param {string} reason
   * @param {object} [partialUpdate]
   * @returns {number} The new generation ID
   */
  bumpGeneration(reason = 'mutation', partialUpdate = {}) {
    this._generation++;
    this._state = {
      ...this._state,
      ...partialUpdate,
      generation: this._generation,
      updatedAt: Date.now(),
    };
    logDebug('STATE', `Generation bumped to ${this._generation} (reason: ${reason})`);
    this._notifyListeners('generation', this._generation);
    return this._generation;
  }

  /**
   * Updates state fields without necessarily bumping generation unless symbol/tf changes.
   * @param {object} partial
   */
  updateState(partial = {}) {
    const symbolChanged = partial.symbol && partial.symbol !== this._state.symbol;
    const tfChanged = partial.timeframe && partial.timeframe !== this._state.timeframe;

    if (symbolChanged || tfChanged) {
      return this.bumpGeneration(`symbol/tf change (${partial.symbol || this._state.symbol}, ${partial.timeframe || this._state.timeframe})`, partial);
    }

    this._state = {
      ...this._state,
      ...partial,
      generation: this._generation,
      updatedAt: Date.now(),
    };
    this._notifyListeners('update', this._state);
    return this._generation;
  }

  /**
   * Returns an immutable snapshot of current chart state.
   * Conforms to the standard ChartSnapshot format.
   */
  getSnapshot() {
    return {
      targetId: this._state.targetId,
      chartId: this._state.chartId,
      paneId: this._state.paneId,
      tabId: this._state.tabId,
      symbol: this._state.symbol,
      timeframe: this._state.timeframe,
      resolution: this._state.resolution || this._state.timeframe,
      lastBarTime: this._state.lastBarTime,
      barCount: this._state.barCount,
      dataReady: this._state.dataReady,
      generation: this._generation,
      timestamp: Date.now(),
      updatedAt: this._state.updatedAt,
    };
  }

  /**
   * Creates an immutable OperationContext bound to the current generation.
   * @param {string} label Name of operation
   * @returns {OperationContext}
   */
  createOperationContext(label = 'operation') {
    return new OperationContext({
      label,
      generation: this._generation,
      symbol: this._state.symbol,
      timeframe: this._state.timeframe,
      targetId: this._state.targetId,
      stateManager: this,
    });
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notifyListeners(event, data) {
    for (const fn of this._listeners) {
      try {
        fn(event, data);
      } catch (err) {
        logDebug('STATE', `Listener error: ${err.message}`);
      }
    }
  }

  reset() {
    this._generation = 1;
    this._state = {
      targetId: null,
      chartId: null,
      paneId: null,
      tabId: null,
      symbol: null,
      timeframe: null,
      resolution: null,
      lastBarTime: null,
      barCount: 0,
      dataReady: false,
      updatedAt: Date.now(),
      generation: 1,
    };
    this._listeners.clear();
  }
}

export const chartStateManager = new ChartStateManager();
