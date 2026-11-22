CREATE TABLE `launchpad_documents` (
	`scope` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`scope`, `id`),
	CONSTRAINT "valid_payload" CHECK(json_valid("launchpad_documents"."payload"))
);
