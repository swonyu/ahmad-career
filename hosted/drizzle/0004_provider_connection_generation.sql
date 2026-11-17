ALTER TABLE `auth_identities` ADD `connection_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- An older worker may finish a callback after this schema upgrade. Its INSERT
-- omits connection_id, so assign a generation in the database before serving
-- that link to the new client. Metadata-only UPSERTs retain the existing ID.
CREATE TRIGGER `auth_identities_connection_generation`
AFTER INSERT ON `auth_identities`
FOR EACH ROW WHEN NEW.`connection_id` = ''
BEGIN
  UPDATE `auth_identities` SET `connection_id` = lower(hex(randomblob(32)))
  WHERE `provider` = NEW.`provider` AND `subject` = NEW.`subject` AND `connection_id` = '';
END;
--> statement-breakpoint
-- Install the insert trigger before backfilling so any old-worker insert in
-- the schema transition window is covered by either the trigger or this pass.
UPDATE `auth_identities` SET `connection_id` = lower(hex(randomblob(32))) WHERE `connection_id` = '';
