/**
 * Core drawing logic.
 */
import { evaluate, getChartApi, withChartTransaction } from '../connection.js';
import { waitForCondition } from '../wait.js';

export async function drawShape({ shape, point, point2, overrides: overridesRaw, text }) {
  return withChartTransaction(`drawShape:${shape}`, async () => {
    const overrides = overridesRaw ? (typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw) : {};
    const apiPath = await getChartApi();
    const overridesStr = JSON.stringify(overrides || {});
    const textStr = JSON.stringify(text || '');
    const p1 = { time: Number(point.time), price: Number(point.price) };
    const p2 = point2 ? { time: Number(point2.time), price: Number(point2.price) } : null;

    const before = (await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`)) || [];

    if (p2) {
      await evaluate(`
        ${apiPath}.createMultipointShape(
          [${JSON.stringify(p1)}, ${JSON.stringify(p2)}],
          { shape: ${JSON.stringify(shape)}, overrides: ${overridesStr}, text: ${textStr} }
        )
      `);
    } else {
      await evaluate(`
        ${apiPath}.createShape(
          ${JSON.stringify(p1)},
          { shape: ${JSON.stringify(shape)}, overrides: ${overridesStr}, text: ${textStr} }
        )
      `);
    }

    const detectedId = await waitForCondition(async () => {
      const after = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);
      const found = (after || []).find(id => !before.includes(id));
      return found || false;
    }, { timeout: 2000, interval: 50, label: `drawShape(${shape})` });

    const result = { entity_id: detectedId || null };
    return { success: true, shape, entity_id: result?.entity_id };
  });
}

export async function listDrawings() {
  const apiPath = await getChartApi();
  const shapes = await evaluate(`
    (function() {
      var api = ${apiPath};
      var all = api.getAllShapes();
      return all.map(function(s) { return { id: s.id, name: s.name }; });
    })()
  `);
  return { success: true, count: shapes?.length || 0, shapes: shapes || [] };
}

export async function getProperties({ entity_id }) {
  const apiPath = await getChartApi();
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${JSON.stringify(entity_id)};
      var props = { entity_id: eid };
      var shape = api.getShapeById(eid);
      if (!shape) return { error: 'Shape not found: ' + eid };
      var methods = [];
      try { for (var key in shape) { if (typeof shape[key] === 'function') methods.push(key); } props.available_methods = methods; } catch(e) {}
      try { var pts = shape.getPoints(); if (pts) props.points = pts; } catch(e) { props.points_error = e.message; }
      try { var ovr = shape.getProperties(); if (ovr) props.properties = ovr; } catch(e) {
        try { var ovr2 = shape.properties(); if (ovr2) props.properties = ovr2; } catch(e2) { props.properties_error = e2.message; }
      }
      try { props.visible = shape.isVisible(); } catch(e) {}
      try { props.locked = shape.isLocked(); } catch(e) {}
      try { props.selectable = shape.isSelectionEnabled(); } catch(e) {}
      try {
        var all = api.getAllShapes();
        for (var i = 0; i < all.length; i++) { if (all[i].id === eid) { props.name = all[i].name; break; } }
      } catch(e) {}
      return props;
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, ...result };
}

export async function removeOne({ entity_id }) {
  return withChartTransaction(`removeShape:${entity_id}`, async () => {
    const apiPath = await getChartApi();
    const result = await evaluate(`
      (function() {
        var api = ${apiPath};
        var eid = ${JSON.stringify(entity_id)};
        var before = api.getAllShapes();
        var found = false;
        for (var i = 0; i < before.length; i++) { if (before[i].id === eid) { found = true; break; } }
        if (!found) return { removed: false, error: 'Shape not found: ' + eid, available: before.map(function(s) { return s.id; }) };
        api.removeEntity(eid);
        var after = api.getAllShapes();
        var stillExists = false;
        for (var j = 0; j < after.length; j++) { if (after[j].id === eid) { stillExists = true; break; } }
        return { removed: !stillExists, entity_id: eid, remaining_shapes: after.length };
      })()
    `);
    if (result?.error) throw new Error(result.error);
    return { success: true, entity_id: result?.entity_id, removed: result?.removed, remaining_shapes: result?.remaining_shapes };
  });
}

export async function clearAll() {
  return withChartTransaction('clearAllShapes', async () => {
    const apiPath = await getChartApi();
    await evaluate(`${apiPath}.removeAllShapes()`);
    return { success: true, action: 'all_shapes_removed' };
  });
}
