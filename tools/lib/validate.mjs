// Dependency-free validator for a practical subset of JSON Schema (draft-07):
// required, type, enum, const, maxLength/minLength, minItems/maxItems, $ref/$defs,
// properties, items. Enough to give the LLM real, actionable feedback on whether
// its output conforms to schemas/*.schema.json. For production-grade validation,
// swap in `ajv` — the schema files are standard draft-07.

function resolveRef(ref, rootSchema) {
  // only supports local refs like "#/$defs/foo"
  if (!ref.startsWith("#/")) return null;
  const path = ref.slice(2).split("/");
  let node = rootSchema;
  for (const seg of path) {
    node = node?.[seg];
    if (node === undefined) return null;
  }
  return node;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value; // string | number | boolean | object
}

function typeMatches(expected, value) {
  const t = typeOf(value);
  if (expected === "number") return t === "number" || t === "integer";
  if (expected === "integer") return t === "integer";
  return t === expected;
}

function validateNode(schema, value, rootSchema, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, rootSchema);
    if (resolved) validateNode(resolved, value, rootSchema, path, errors);
    return;
  }

  // anyOf / oneOf — for our discriminated unions, pick the branch whose `kind` matches and
  // validate against it; otherwise pass if the value satisfies any branch.
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const branches = schema.anyOf || schema.oneOf;
    let candidates = branches;
    if (value && typeof value === "object" && value.kind != null) {
      const matched = branches.filter((b) => {
        const k = b.properties && b.properties.kind;
        if (!k) return false;
        if (k.const !== undefined) return k.const === value.kind;
        return Array.isArray(k.enum) && k.enum.includes(value.kind);
      });
      if (matched.length) candidates = matched;
    }
    let best = null;
    for (const b of candidates) {
      const errs = [];
      validateNode(b, value, rootSchema, path, errs);
      if (errs.length === 0) return; // satisfied a branch
      if (!best || errs.length < best.length) best = errs;
    }
    errors.push(...(best || [`${path}: matches no union branch`]));
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)} (got ${JSON.stringify(value)})`);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, value))) {
      errors.push(`${path}: expected type ${types.join("|")} (got ${typeOf(value)})`);
      return; // type mismatch — deeper checks are noise
    }
  }

  if (typeof value === "string") {
    if (schema.maxLength != null && value.length > schema.maxLength)
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    if (schema.minLength != null && value.length < schema.minLength)
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems)
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems)
      errors.push(`${path}: more than maxItems ${schema.maxItems}`);
    if (schema.items)
      value.forEach((item, i) => validateNode(schema.items, item, rootSchema, `${path}[${i}]`, errors));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) errors.push(`${path}: missing required property "${key}"`);
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) validateNode(propSchema, value[key], rootSchema, `${path}.${key}`, errors);
      }
    }
  }
}

export function validate(schema, value) {
  const errors = [];
  validateNode(schema, value, schema, "$", errors);
  return { valid: errors.length === 0, errors };
}
