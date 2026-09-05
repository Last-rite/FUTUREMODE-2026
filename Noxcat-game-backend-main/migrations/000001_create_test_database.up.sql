SELECT 'CREATE DATABASE noxcat_test OWNER noxcat'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'noxcat_test'
) \gexec
