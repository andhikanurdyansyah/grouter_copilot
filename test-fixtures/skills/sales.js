export default {
  name: 'sales-summary',
  description: 'Summarize total sales in a period',
  parameters: {
    type: 'object',
    properties: { period: { type: 'string', enum: ['7d', '30d'] } },
    required: ['period'],
  },
  readOnly: true,
  async run({ period, user }) {
    return { period, total: 999, ownerId: user?.id ?? null };
  },
};
