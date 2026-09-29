import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Security & JS Serialization Defense (CWE-94 / CWE-116)', () => {
  const maliciousPayloads = [
    `'; alert('xss'); '`,
    `"); process.exit(1); ("`,
    `\` + console.log('injection') + \``,
    `\n\r\t/* malicious comment */`,
    `\u0000\u001f\u2028\u2029`,
    `{"$where": "sleep(5000)"}`,
    `Robert'); DROP TABLE Students;--`,
    `\${global.process.mainModule.require('child_process').execSync('id')}`,
    `' OR '1'='1`,
    `\\'; alert(String.fromCharCode(88,83,83))//`,
    `\${7*7}`,
    `"}}; alert(1); var x = {a: {"`,
  ];

  it('safely serializes dangerous input into evaluate arguments using JSON.stringify', () => {
    for (const payload of maliciousPayloads) {
      const serialized = JSON.stringify(payload);
      // Construct sample JS expression as done in core modules
      const jsSnippet = `(function() { var symbol = ${serialized}; return symbol; })()`;

      // Verify that eval/new Function parses and returns the identical raw payload without executing injected code
      const result = new Function(`return ${jsSnippet}`)();
      assert.strictEqual(result, payload, `Payload failed roundtrip safe evaluation: ${payload}`);
    }
  });

  it('safely embeds complex nested objects without script escape vulnerability', () => {
    const complexInputs = {
      length: 14,
      source: `close'); alert(1); ('`,
      nested: {
        payload: `</script><script>alert(1)</script>`,
        symbols: [`BTC'USDT`, `"ETH"`, `SOL\\USD\n`],
      },
    };

    const serialized = JSON.stringify(complexInputs);
    const jsSnippet = `(function() { var overrides = ${serialized}; return overrides; })()`;
    const result = new Function(`return ${jsSnippet}`)();
    assert.deepEqual(result, complexInputs);
  });

  it('safely serializes domain-specific inputs: symbols, indicators, drawing text, alerts, Pine code, IDs, and labels', () => {
    const domainFields = {
      symbol: `BTC/USD' "BINANCE" \${evil} \`pwd\` \n\r \u00A9`,
      indicatorName: `Relative Strength Index"); break; ("`,
      drawingText: `Target Level: \$100,000 & \`alert(1)\` <svg onload=alert(1)>`,
      alertMessage: `Crossing level '50000' \${process.exit()} "critical"`,
      pineCode: `//@version=6\nindicator("Test\\"); malicious() //")\nplot(close)`,
      entityId: `study_123'; drop_cache(); '`,
      label: `Support: \${price} & \n\t "test"`,
    };

    for (const [field, rawVal] of Object.entries(domainFields)) {
      const serialized = JSON.stringify(rawVal);
      const jsSnippet = `(function() { var val = ${serialized}; return val; })()`;
      const evaluated = new Function(`return ${jsSnippet}`)();
      assert.strictEqual(evaluated, rawVal, `Domain field "${field}" failed safe serialization roundtrip`);
    }
  });
});
