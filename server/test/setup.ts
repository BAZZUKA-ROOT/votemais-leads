process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/votemais_leads_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1';
process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.QUEUE_PREFIX = 'vml-test';
process.env.APP_URL = 'http://localhost:3000';
process.env.ANALYSIS_DEBOUNCE_MS = '100';
process.env.VML_API_TOKEN = 'test-token-0123456789-abcdefghijklmnop';
