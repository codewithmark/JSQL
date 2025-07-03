class JSQL {
  constructor() {
    this.data = {};
    this.schemas = {};
  }

  defineTable(table, schema = {}) {
    if (!this.data[table]) this.data[table] = [];
    this.schemas[table] = schema;
  }

  insert(table, obj) {
    const list = Array.isArray(obj) ? obj : [obj];

    if (!this.data[table]) {
      const inferredSchema = {};
      for (const [key, value] of Object.entries(list[0])) {
        inferredSchema[key] = typeof value;
      }
      this.defineTable(table, inferredSchema);
    }

    const schema = this.schemas[table];
    for (const item of list) {
      for (const [key, type] of Object.entries(schema)) {
        if (!(key in item)) throw new Error(`Missing field "${key}"`);
        if (typeof item[key] !== type) throw new Error(`Field "${key}" must be type ${type}`);
      }

      if (!item.id) item.id = this._generateId();
      if (!item.createdAt) item.createdAt = new Date().toISOString();

      this.data[table].push(item);
    }
  }

  select(table, whereFn = () => true) {
    return this.data[table]?.filter(whereFn) || [];
  }

  findOne(table, whereFn = () => true) {
    return this.select(table, whereFn)[0] || null;
  }

  update(table, updates, whereObj = null) {
    const schema = this.schemas[table];
    const whereFn = whereObj
      ? (row) => Object.entries(whereObj).every(([k, v]) => row[k] === v)
      : (row) => updates.id ? row.id === updates.id : true;

    const list = Array.isArray(updates) ? updates : [updates];
    let count = 0;

    this.data[table] = this.data[table].map(row => {
      const match = list.find(item => item.id === row.id) || (whereObj && whereFn(row) ? updates : null);
      if (match) {
        const updated = { ...row, ...match };
        for (const [key, type] of Object.entries(schema)) {
          if (!(key in updated)) throw new Error(`Missing field "${key}"`);
          if (typeof updated[key] !== type) throw new Error(`Field "${key}" must be type ${type}`);
        }
        Object.assign(row, match);
        count++;
      }
      return row;
    });

    return count;
  }

  delete(table, whereObj) {
    const whereFn = whereObj
      ? (row) => Object.entries(whereObj).every(([k, v]) => row[k] === v)
      : () => true;

    const before = this.data[table]?.length || 0;
    this.data[table] = this.data[table]?.filter(row => !whereFn(row)) || [];
    return before - this.data[table].length;
  }

  count(table, whereFn = () => true) {
    return this.select(table, whereFn).length;
  }

  clear() {
    this.data = {};
    this.schemas = {};
  }

  query(sql, params = []) {
    const insert = /INSERT INTO (\w+)(?:\s+VALUES\s+\?)?/i;
    const update = /UPDATE (\w+) SET \?(?:\s+WHERE\s+\?)?/i;
    const del = /DELETE FROM (\w+)(?:\s+WHERE\s+\?)?/i;

    let match;

    if ((match = sql.match(insert))) {
      const [, table] = match;
      const items = params[0];
      const list = Array.isArray(items) ? items : [items];
      this.insert(table, list);
      return list.length;
    }

    if ((match = sql.match(update))) {
      const [, table] = match;
      const updates = params[0];
      const where = params[1] || null;
      return this.update(table, updates, where);
    }

    if ((match = sql.match(del))) {
      const [, table] = match;
      const where = params[0] || null;
      return this.delete(table, where);
    }

    throw new Error('Only INSERT, UPDATE, DELETE supported in query');
  }

  _evalCondition(row, cond) {
    const notInMatch = cond.match(/^(\w+)\s+NOT\s+IN\s+\(([^)]+)\)$/i);
    if (notInMatch) {
      const [, key, values] = notInMatch;
      const valList = values.split(',').map(v => this._parseValue(v.trim()));
      return !valList.includes(row[key]);
    }

    const inMatch = cond.match(/^(\w+)\s+IN\s+\(([^)]+)\)$/i);
    if (inMatch) {
      const [, key, values] = inMatch;
      const valList = values.split(',').map(v => this._parseValue(v.trim()));
      return valList.includes(row[key]);
    }

    const notLikeMatch = cond.match(/^(\w+)\s+NOT\s+LIKE\s+['"](.+?)['"]$/i);
    if (notLikeMatch) {
      const [, key, pattern] = notLikeMatch;
      const regex = new RegExp('^' + pattern.replace(/%/g, '.*') + '$', 'i');
      return !regex.test(row[key]);
    }

    const likeMatch = cond.match(/^(\w+)\s+LIKE\s+['"](.+?)['"]$/i);
    if (likeMatch) {
      const [, key, pattern] = likeMatch;
      const regex = new RegExp('^' + pattern.replace(/%/g, '.*') + '$', 'i');
      return regex.test(row[key]);
    }

    const betweenMatch = cond.match(/^(\w+)\s+BETWEEN\s+(\S+)\s+AND\s+(\S+)$/i);
    if (betweenMatch) {
      const [, key, val1, val2] = betweenMatch;
      const a = this._parseValue(val1);
      const b = this._parseValue(val2);
      return row[key] >= a && row[key] <= b;
    }

    const notBetweenMatch = cond.match(/^(\w+)\s+NOT\s+BETWEEN\s+(\S+)\s+AND\s+(\S+)$/i);
    if (notBetweenMatch) {
      const [, key, val1, val2] = notBetweenMatch;
      const a = this._parseValue(val1);
      const b = this._parseValue(val2);
      return row[key] < a || row[key] > b;
    }

    const isNullMatch = cond.match(/^(\w+)\s+IS\s+NULL$/i);
    if (isNullMatch) {
      const [, key] = isNullMatch;
      return row[key] === null || row[key] === undefined;
    }

    const isNotNullMatch = cond.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      const [, key] = isNotNullMatch;
      return row[key] !== null && row[key] !== undefined;
    }

    const match = cond.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*["']?(.+?)["']?$/);
    if (!match) return false;
    const [, key, op, rawVal] = match;
    const val = this._parseValue(rawVal);
    const field = row[key];
    switch (op) {
      case '=': return field == val;
      case '!=': return field != val;
      case '<': return field < val;
      case '>': return field > val;
      case '<=': return field <= val;
      case '>=': return field >= val;
      default: return false;
    }
  }

  _parseValue(v) {
    if (!isNaN(v)) return Number(v);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v.replace(/^['"]|['"]$/g, '');
  }

  _generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).substring(2);
  }
}

// Export for Node.js or expose to browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JSQL;
} else {
  window.JSQL = JSQL;
}
