/**
 * Skill validator — enforce the skill contract at load time.
 * Returns { ok, errors: string[] }.
 */

const REQUIRED_FIELDS = ['name', 'description', 'parameters', 'readOnly', 'run'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isValidJsonSchema(schema) {
  if (!isPlainObject(schema)) return false;
  // Minimal check: `type` must be a string, and if properties exist it is an object.
  if (schema.type !== undefined && typeof schema.type !== 'string') return false;
  if (schema.properties !== undefined && !isPlainObject(schema.properties)) return false;
  return true;
}

export function validateSkill(skill, { index = null } = {}) {
  const errors = [];
  const where = index === null ? '' : `[skill #${index}] `;

  if (!skill || typeof skill !== 'object') {
    return { ok: false, errors: [`${where}skill must be an object`] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (skill[field] === undefined) errors.push(`${where}missing required field "${field}"`);
  }

  if (skill.name !== undefined && (typeof skill.name !== 'string' || skill.name.trim() === '')) {
    errors.push(`${where}"name" must be a non-empty string`);
  }

  if (skill.description !== undefined && typeof skill.description !== 'string') {
    errors.push(`${where}"description" must be a string`);
  }

  if (skill.parameters !== undefined && !isValidJsonSchema(skill.parameters)) {
    errors.push(`${where}"parameters" must be a valid JSON Schema object`);
  }

  if (skill.readOnly !== undefined && typeof skill.readOnly !== 'boolean') {
    errors.push(`${where}"readOnly" must be a boolean`);
  }

  if (skill.run !== undefined && typeof skill.run !== 'function') {
    errors.push(`${where}"run" must be a function`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate arguments against a skill's JSON Schema (shallow, type-level).
 * Supports `type`, `required`, `properties`, and `enum`.
 */
export function validateArgs(schema, args) {
  const errors = [];
  if (!schema || !isPlainObject(schema)) return { ok: true, errors };

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (args[key] === undefined) errors.push(`missing required argument "${key}"`);
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const value = args[key];
    if (value === undefined) continue;

    if (propSchema.type === 'string' && typeof value !== 'string') {
      errors.push(`"${key}" must be a string`);
    } else if (propSchema.type === 'number' && typeof value !== 'number') {
      errors.push(`"${key}" must be a number`);
    } else if (propSchema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`"${key}" must be a boolean`);
    } else if (propSchema.type === 'integer' && !Number.isInteger(value)) {
      errors.push(`"${key}" must be an integer`);
    } else if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
      errors.push(`"${key}" must be one of ${JSON.stringify(propSchema.enum)}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
