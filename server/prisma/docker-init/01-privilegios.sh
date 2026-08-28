#!/bin/bash
# Principio de minimo privilegio (requisito 6 del brief).
#
# MySQL ya creo MYSQL_USER con todos los permisos sobre la base. Se los recortamos
# a solo DML y creamos un segundo usuario, exclusivo para migraciones, con DDL.
# Asi, si el proceso del servidor es comprometido, el atacante no puede hacer
# DROP TABLE ni alterar el esquema.
set -euo pipefail

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
REVOKE ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* FROM '${MYSQL_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';

CREATE USER IF NOT EXISTS '${MYSQL_MIGRATE_USER}'@'%' IDENTIFIED BY '${MYSQL_MIGRATE_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_MIGRATE_USER}'@'%';
-- Prisma Migrate necesita poder crear su base shadow para diffear el esquema.
GRANT CREATE, ALTER, DROP, REFERENCES ON *.* TO '${MYSQL_MIGRATE_USER}'@'%';

FLUSH PRIVILEGES;
SQL
