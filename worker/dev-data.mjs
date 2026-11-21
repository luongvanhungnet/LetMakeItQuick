import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";

export function localData(filename = ":memory:") {
  const database = new DatabaseSync(filename);
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("CREATE TABLE IF NOT EXISTS launchpad_migrations (name TEXT PRIMARY KEY)");
  const name = "0001_workspace.sql";
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!database.prepare("SELECT name FROM launchpad_migrations WHERE name=?").get(name)) {
      database.exec(readFileSync(new URL("./migrations/"+name,import.meta.url),"utf8"));
      database.prepare("INSERT INTO launchpad_migrations VALUES (?)").run(name);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    database.close();
    throw error;
  }
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      function bind(...args) {
        return {
          bind,
          first: async () => statement.get(...args) || null,
          all: async () => ({results:statement.all(...args)}),
          run: async () => ({meta:{changes:Number(statement.run(...args).changes)}})
        };
      }
      return bind();
    },
    close: () => database.close()
  };
}
