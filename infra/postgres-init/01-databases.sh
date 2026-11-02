#!/bin/sh
set -eu
for service in identity personnel vacation contract payment; do
 upper=$(echo "$service" | tr '[:lower:]' '[:upper:]')
 eval "password=\${${upper}_DB_PASSWORD}"
 psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres --set=user="arca_$service" --set=pass="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'user', :'pass')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'user')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'user', :'user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'user')
\gexec
REVOKE CONNECT ON DATABASE :"user" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"user" TO :"user";
SQL
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
SQL
