-- Reverse of 0006_ip_block_list.up.sql.
--
-- Drops the index before the table so partial rollback works on
-- older PostgreSQL releases that do not implicitly drop indexes
-- with their parent table in every error path.

DROP INDEX IF EXISTS ip_block_list_banned_until_idx;

DROP TABLE IF EXISTS ip_block_list;
