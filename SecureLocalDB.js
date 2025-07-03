class SecureLocalDB {
  constructor(secret = 'my-secret', key = 'securelocaldb') {
    this.ls = new SecureLS({ encodingType: 'aes', isCompression: false, encryptionSecret: secret });
    this.key = key;
    const loaded = this._load();
    this.data = loaded.data;
    this.schemas = loaded.schemas;
  }

  _load() {
    try {
      const stored = this.ls.get(this.key) || {};
      return {
        data: stored.data || {},
        schemas: stored.schemas || {}
      };
    } catch {
      return { data: {}, schemas: {} };
    }
  }

  _save() {
    this.ls.set(this.key, {
      data: this.data,
      schemas: this.schemas,
    });
  }

  defineTable(table, schema = {}) {
    if (!this.data[table]) this.data[table] = [];
    this.schemas[table] = schema;
    this._save();
  }

  insert(table, obj) {
    const schema = this.schemas[table];
    if (schema) {
      for (const [key, type] of Object.entries(schema)) {
        if (!(key in obj)) throw new Error(`Missing field "${key}"`);
        if (typeof obj[key] !== type) throw new Error(`Field "${key}" must be type ${type}`);
      }
    }
    if (!obj.id) obj.id = crypto.randomUUID();
    if (!obj.createdAt) obj.createdAt = new Date().toISOString();
    this.data[table].push(obj);
    this._save();
  }

  update(table, whereFn, updates) {
    const schema = this.schemas[table];
    let count = 0;

    this.data[table] = this.data[table].map(row => {
      if (whereFn(row)) {
        const updated = { ...row, ...updates };
        if (schema) {
          for (const [key, type] of Object.entries(schema)) {
            if (!(key in updated)) throw new Error(`Missing field "${key}"`);
            if (typeof updated[key] !== type) throw new Error(`Field "${key}" must be type ${type}`);
          }
        }
        Object.assign(row, updates);
        count++;
      }
      return row;
    });

    this._save();
    return count;
  }

  delete(table, whereFn) {
    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(row => !whereFn(row));
    this._save();
    return before - this.data[table].length;
  }

  select(table, whereFn = () => true) {
    return this.data[table].filter(whereFn);
  }

  findOne(table, whereFn = () => true) {
    return this.data[table].find(whereFn) || null;
  }

  count(table, whereFn = () => true) {
    return this.select(table, whereFn).length;
  }

  export() {
    return JSON.stringify({
      data: this.data,
      schemas: this.schemas,
    }, null, 2);
  }

  import(jsonStr, overwrite = false) {
    const parsed = JSON.parse(jsonStr);
    const newData = parsed.data || {};
    const newSchemas = parsed.schemas || {};

    if (overwrite) {
      this.data = newData;
      this.schemas = newSchemas;
    } else {
      for (const table in newData) {
        this.data[table] = (this.data[table] || []).concat(newData[table]);
      }
      Object.assign(this.schemas, newSchemas);
    }

    this._save();
  }

  clear() {
    this.data = {};
    this.schemas = {};
    this._save();
  }

  _prefixKeys(obj, prefix) {
    const result = {};
    for (const key in obj) {
      result[`${prefix}.${key}`] = obj[key];
    }
    return result;
  }

  _nullObject(example = {}) {
    const obj = {};
    for (const key in example) {
      obj[key] = null;
    }
    return obj;
  }

  query(sql, params = []) {
    const select = /SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+(INNER|LEFT|RIGHT|FULL)?\s*JOIN\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+))?(?:\s+WHERE\s+(.*?))?(?:\s+GROUP\s+BY\s+(\w+))?(?:\s+HAVING\s+(.*?))?(?:\s+ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?/i;
    const insert = /INSERT INTO (\w+)$/i;
    const update = /UPDATE (\w+) SET (.+) WHERE (.+)/i;
    const del = /DELETE FROM (\w+)(?: WHERE (.+))?/i;

    const applyParams = (str) => {
      let i = 0;
      return str.replace(/\?/g, () => {
        const val = params[i++];
        return typeof val === 'string' ? `"${val}"` : val;
      });
    };

    let match;

    if ((match = sql.match(select))) {
      const [
        , fieldsRaw, tableA, joinTypeRaw, tableB, aAlias, aKey, bAlias, bKey,
        whereClause, groupBy, havingClause, orderBy, orderDir, limit
      ] = match;

      const selectedFields = fieldsRaw.split(',').map(f => f.trim());
      const parsedFields = selectedFields.map(f => {
        const match = f.match(/(.+?)\s+AS\s+(\w+)$/i);
        return match ? { expr: match[1].trim(), alias: match[2].trim() } : { expr: f, alias: f };
      });

      const joinType = (joinTypeRaw || 'INNER').toUpperCase();
      let rows;

      if (tableB) {
        const left = this.data[tableA] || [];
        const right = this.data[tableB] || [];

        const leftAlias = aAlias || tableA;
        const rightAlias = bAlias || tableB;

        const joined = [];
        const matchedRight = new Set();
        const matchedLeft = new Set();

        for (let i = 0; i < left.length; i++) {
          const aRow = left[i];
          let matchFound = false;

          for (let j = 0; j < right.length; j++) {
            const bRow = right[j];
            if (aRow[aKey] === bRow[bKey]) {
              matchFound = true;
              matchedRight.add(j);
              matchedLeft.add(i);

              joined.push({
                ...this._prefixKeys(aRow, leftAlias),
                ...this._prefixKeys(bRow, rightAlias)
              });
            }
          }

          if (!matchFound && (joinType === 'LEFT' || joinType === 'FULL')) {
            joined.push({
              ...this._prefixKeys(aRow, leftAlias),
              ...this._prefixKeys(this._nullObject(right[0]), rightAlias)
            });
          }
        }

        if (joinType === 'RIGHT' || joinType === 'FULL') {
          for (let j = 0; j < right.length; j++) {
            if (!matchedRight.has(j)) {
              const bRow = right[j];
              joined.push({
                ...this._prefixKeys(this._nullObject(left[0]), leftAlias),
                ...this._prefixKeys(bRow, rightAlias)
              });
            }
          }
        }

        rows = joined;
      } else {
        rows = this.select(tableA, whereClause ? this._parseWhere(applyParams(whereClause)) : undefined);
      }

      if (groupBy) {
        const groups = new Map();

        for (const row of rows) {
          const key = row[groupBy];
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }

        rows = Array.from(groups.entries()).map(([groupKey, groupRows]) => {
          const result = { [groupBy]: groupKey };

          for (const { expr, alias } of parsedFields) {
            if (expr === groupBy) continue;

            const aggMatch = expr.match(/(COUNT|SUM|AVG)\((.*?)\)/i);
            if (!aggMatch) continue;

            const [ , fn, argRaw ] = aggMatch;
            const arg = argRaw.trim();

            switch (fn.toUpperCase()) {
              case 'COUNT':
                result[alias] = groupRows.length;
                break;
              case 'SUM':
                result[alias] = groupRows.reduce((acc, r) => acc + (Number(r[arg]) || 0), 0);
                break;
              case 'AVG':
                result[alias] = groupRows.reduce((acc, r) => acc + (Number(r[arg]) || 0), 0) / groupRows.length;
                break;
            }
          }

          return result;
        });

        if (havingClause) {
          const havingFn = this._parseWhere(applyParams(havingClause));
          rows = rows.filter(havingFn);
        }
      }

      if (!groupBy) {
        rows = rows.map(row => {
          const projected = {};
          for (const { expr, alias } of parsedFields) {
            projected[alias] = row[expr];
          }
          return projected;
        });
      }

      if (orderBy) {
        const dir = (orderDir || 'ASC').toUpperCase();
        rows = rows.sort((a, b) =>
          dir === 'DESC' ? (a[orderBy] < b[orderBy] ? 1 : -1) : (a[orderBy] > b[orderBy] ? 1 : -1)
        );
      }

      if (limit) {
        rows = rows.slice(0, Number(limit));
      }

      return rows;
    }

    if ((match = sql.match(insert))) {
      const [, table] = match;
      const items = params[0];
      if (!items) throw new Error('Missing data for insert');
      const list = Array.isArray(items) ? items : [items];
      for (const item of list) this.insert(table, item);
      return list.length;
    }

    if ((match = sql.match(update))) {
      const [, table, setStr, whereStr] = match;
      const updates = this._parseAssignments(applyParams(setStr));
      const whereFn = this._parseWhere(applyParams(whereStr));
      return this.update(table, whereFn, updates);
    }

    if ((match = sql.match(del))) {
      const [, table, whereStr] = match;
      const whereFn = whereStr ? this._parseWhere(applyParams(whereStr)) : () => true;
      return this.delete(table, whereFn);
    }

    throw new Error('Invalid SQL command');
  }

  _parseAssignments(str) {
    return Object.fromEntries(
      str.split(',').map(p => {
        const [k, v] = p.split('=');
        return [k.trim(), this._parseValue(v.trim())];
      })
    );
  }

  _parseWhere(str) {
    const andParts = str.split(/\s+AND\s+/i);
    return (row) => andParts.every(cond => {
      const orParts = cond.split(/\s+OR\s+/i);
      return orParts.some(expr => this._evalCondition(row, expr.trim()));
    });
  }

  _evalCondition(row, cond) {
    // IN (SELECT ...) subquery support
    if (cond.includes(' IN (SELECT')) {
      const inMatch = cond.match(/^(\w+)\s+IN\s+\(SELECT\s+(\w+)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?\)$/i);
      if (!inMatch) return false;

      const [, field, subField, subTable, subWhere] = inMatch;
      const subData = this.select(subTable, subWhere ? this._parseWhere(subWhere) : undefined);
      const subValues = subData.map(r => r[subField]);

      return subValues.includes(row[field]);
    }

    const match = cond.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*["']?(.+?)["']?$/);
    if (!match) return false;
    const [, key, op, val] = match;
    const cmp = this._parseValue(val);
    const field = row[key];
    switch (op) {
      case '=': return field == cmp;
      case '!=': return field != cmp;
      case '<': return field < cmp;
      case '>': return field > cmp;
      case '<=': return field <= cmp;
      case '>=': return field >= cmp;
      default: return false;
    }
  }

  _parseValue(v) {
    if (!isNaN(v)) return Number(v);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v.replace(/^['"]|['"]$/g, '');
  }
}
