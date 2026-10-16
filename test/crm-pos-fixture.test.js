import test from 'node:test';
import assert from 'node:assert/strict';

import { SkillRegistry } from '../src/skills/registry.js';
import skill from '../examples/skill-fixtures/crm-pos-read-only.js';

const fixtureData = {
  crmPos: {
    orders: [
      { id: 'ord_fixture_001', customerId: 'cus_fixture_001', outletId: 'outlet_fixture_001', total: 125000, status: 'paid' },
      { id: 'ord_fixture_002', customerId: 'cus_fixture_001', outletId: 'outlet_fixture_002', total: 50000, status: 'pending' },
      { id: 'ord_fixture_003', customerId: 'cus_fixture_002', outletId: 'outlet_fixture_001', total: 90000, status: 'paid' },
    ],
  },
};

test('CRM/POS fixture satisfies the read-only contract and returns bounded summary', async () => {
  const registry = new SkillRegistry({ skills: [skill] });
  assert.equal(registry.resolve(null, 'tolong beri ringkasan pesanan customer'), skill.name);

  const result = await registry.run(skill.name, { customerId: 'cus_fixture_001' }, { data: fixtureData });
  assert.deepEqual(result.data, {
    customerId: 'cus_fixture_001',
    totalOrders: 2,
    paidValue: 125000,
    orders: [
      { id: 'ord_fixture_001', outletId: 'outlet_fixture_001', total: 125000, status: 'paid' },
      { id: 'ord_fixture_002', outletId: 'outlet_fixture_002', total: 50000, status: 'pending' },
    ],
  });
  assert.deepEqual(result.sources, [{ label: 'synthetic CRM/POS fixture (ctx.data.crmPos)' }]);
});

test('CRM/POS fixture does not invent a source or write path', async () => {
  assert.equal(skill.readOnly, true);
  assert.ok(!JSON.stringify(skill).match(/https?:|sql|token|password|api[_-]?key/i));
  await assert.rejects(
    () => skill.run({ customerId: 'cus_fixture_001' }, {}),
    /fixture data is not configured/,
  );
});
