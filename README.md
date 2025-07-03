# JSQL: In-Memory SQL-Like JavaScript Database

**JSQL** is a beginner-friendly, JavaScript-based in-memory database that supports SQL-like operations using the `.query()` function. You can create tables, insert, update, delete, select, and even export/import to CSV—all in a familiar syntax.

---

## ✅ Features

* Insert, Update, Delete, and Select with SQL-like syntax
* Smart WHERE clauses
* Export to CSV with schema
* Import from CSV string or File object (in browser)
* Supports both browser and Node.js environments

---

## 📦 Setup

### In the Browser

```html
<script src="jsql.js"></script>
<script>
  const db = new JSQL();
</script>
```

### In Node.js

```bash
npm install jsql  # or use your local copy
```

```js
const JSQL = require('./jsql');
const db = new JSQL();
```

---

## 📘 Usage

### 1. INSERT

```js
const users = [
  { id: 'u1', name: 'Alice', age: 30 },
  { id: 'u2', name: 'Bob', age: 25 }
];

db.query('INSERT INTO users ?', [users]);
```

### 2. SELECT

```js
// Select all users
db.query('SELECT * FROM users');

// Select users with a condition
db.query('SELECT * FROM users WHERE age > 25');

// Select with ORDER and LIMIT
db.query('SELECT * FROM users ORDER BY age DESC LIMIT 1');
```

### 3. UPDATE

```js
// Update age of Bob to 35
db.query('UPDATE users SET ? WHERE ?', [{ age: 35 }, { name: 'Bob' }]);
```

### 4. DELETE

```js
// Delete user by condition
db.query('DELETE FROM users WHERE ?', [{ name: 'Alice' }]);
```

---

## 💾 Export to CSV

```js
// Automatically saves file: users_YYYY-MM-DD_HH-MM-SS.csv
db.exportToCSV('users');
```

* Includes schema in `#schema:` comment line
* In Node.js, also writes `users_schema.json`

---

## 📥 Import from CSV

### From a CSV string:

```js
const csv = `id,name,age\nu3,Charlie,28`;
db.importFromCSV('users', csv);
```

### From a File object (Browser):

```js
<input type="file" id="uploadCSV" accept=".csv" />
```

```js
document.getElementById('uploadCSV').addEventListener('change', (e) => {
  const file = e.target.files[0];
  db.importFromCSV('users', file);
});
```

---

## 💡 Advanced SQL Queries

### ✅ WHERE with `AND`

```js
db.query('SELECT * FROM users WHERE age > 20 AND name = "Alice"');
```

### ✅ WHERE with `OR` (use multiple queries or custom logic)

```js
db.query('SELECT * FROM users WHERE name = "Alice" OR name = "Bob"');
```

### ✅ LIKE (manual pattern match)

```js
// Equivalent WHERE obj: { name: 'LIKE "A%"' } not supported yet
// Use JS filter:
db.select('users', u => u.name.startsWith('A'));
```

### ✅ IN / NOT IN

```js
// Not native SQL yet, but you can do it in code:
db.select('users', u => ['Alice', 'Bob'].includes(u.name));
```

---

## ❓ FAQ

**Q: Is data saved permanently?**
No. It's stored in memory. Use `.exportToCSV()` and `.importFromCSV()` to persist it.

**Q: Can I use full SQL?**
Only basic SQL is supported via `.query()` — `INSERT`, `UPDATE`, `DELETE`, `SELECT` with optional `WHERE`, `ORDER BY`, `LIMIT`.

**Q: Does it work in both browser and Node.js?**
Yes!

---

## 📌 Summary Table

| Feature              | Status  |
| -------------------- | ------- |
| INSERT               | ✅       |
| SELECT               | ✅       |
| UPDATE               | ✅       |
| DELETE               | ✅       |
| WHERE clause         | ✅ Basic |
| ORDER BY / LIMIT     | ✅       |
| Export to CSV        | ✅       |
| Import from CSV      | ✅       |
| File Upload Support  | ✅       |
| Auto Schema Handling | ✅       |

---

## 🧠 Final Tip

Use `.query()` for everything! It's flexible, clean, and great for beginners to learn SQL-style logic in JavaScript.

Happy coding! 🎉
