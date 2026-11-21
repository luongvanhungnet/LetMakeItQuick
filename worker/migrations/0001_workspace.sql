CREATE TABLE launchpad_documents (
  scope TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (scope, id)
);
