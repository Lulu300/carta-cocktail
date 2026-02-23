// Set env vars BEFORE any app imports
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'testpass123';
process.env.PORT = '0';
process.env.NODE_ENV = 'test';
