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

  exportToCSV(table) {
    const rows = this.data[table] || [];
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')];
    for (const row of rows) {
      csv.push(headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    }
    return csv.join('\n');
  }

  importFromCSV(table, csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const items = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.replace(/^"(.*)"$/, '$1'));
      const obj = {};
      headers.forEach((h, i) => obj[h.trim()] = isNaN(values[i]) ? values[i] : Number(values[i]));
      return obj;
    });
    this.insert(table, items);
  }

  query(sql, params = []) {
    const insert = /INSERT INTO (\w+)(?:\s+\?)?/i;
    const update = /UPDATE (\w+) SET \?(?:\s+WHERE\s+\?)?/i;
    const del = /DELETE FROM (\w+)(?:\s+WHERE\s+\?)?/i;
    const select = /SELECT \* FROM (\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?/i;

    let match;

    if ((match = sql.match(insert))) {
      const [, table] = match;
      const items = params[0];
      this.insert(table, items);
      return items.length;
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

    if ((match = sql.match(select))) {
      const [, table, whereClause, orderBy, orderDir, limit] = match;
      let rows = [...(this.data[table] || [])];

      if (whereClause) {
        rows = rows.filter(row => {
          return Object.entries(this._parseWhereObject(whereClause)).every(([key, val]) => row[key] == val);
        });
      }

      if (orderBy) {
        rows.sort((a, b) => {
          if (orderDir?.toUpperCase() === 'DESC') return a[orderBy] < b[orderBy] ? 1 : -1;
          return a[orderBy] > b[orderBy] ? 1 : -1;
        });
      }

      if (limit) {
        rows = rows.slice(0, Number(limit));
      }

      return rows;
    }

    throw new Error('Invalid SQL query');
  }

  _parseWhereObject(str) {
    const obj = {};
    const parts = str.split(/AND/i);
    for (const part of parts) {
      const [key, val] = part.trim().split('=');
      obj[key.trim()] = val?.replace(/^["']|["']$/g, '').trim();
    }
    return obj;
  }

  _generateId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 10);
  }
}

// Export for Node.js or Browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JSQL;
} else {
  window.JSQL = JSQL;
}
