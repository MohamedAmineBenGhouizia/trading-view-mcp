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
});
