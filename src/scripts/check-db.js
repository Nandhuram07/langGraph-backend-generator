const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('checkpoints.sqlite');

db.serialize(() => {
  db.all("SELECT * FROM checkpoints LIMIT 5", (err, rows) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log("Checkpoints rows:", rows.length);
      rows.forEach(r => console.log(r.thread_id, r.checkpoint_id));
    }
    db.close();
  });
});
