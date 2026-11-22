import {sqliteTable,text,primaryKey,check} from "drizzle-orm/sqlite-core";
import {sql} from "drizzle-orm";
export const documents=sqliteTable("launchpad_documents",{
  scope:text("scope").notNull(),id:text("id").notNull(),payload:text("payload").notNull()
},table=>[primaryKey({columns:[table.scope,table.id]}),check("valid_payload",sql`json_valid(${table.payload})`)]);
