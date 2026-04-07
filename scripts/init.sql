-- TN Land Verification — PostgreSQL initialization
-- This runs once when the container first starts

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search on owner names

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE tnland TO tnland;
