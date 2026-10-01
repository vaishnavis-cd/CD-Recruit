// Enforce test database usage and set test timeout
if (typeof jest !== 'undefined') {
  jest.setTimeout(60000);
}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit_test?schema=public';
process.env.DATABASE_URL = dbUrl;

try {
  const parsedUrl = new URL(dbUrl.replace(/^postgresql:\/\//, 'http://'));
  const dbName = parsedUrl.pathname.replace(/^\//, '').split('?')[0];

  if (!dbName.endsWith('_test')) {
    throw new Error(
      `CRITICAL: Test suite is configured to refuse running against non-test databases. ` +
      `Database name must end with '_test'. Current database: '${dbName}' (URL: ${dbUrl})`
    );
  }
} catch (err: any) {
  if (err.message.includes('CRITICAL:')) {
    throw err;
  }
  // Fallback simple check
  if (!dbUrl.includes('_test')) {
    throw new Error(
      `CRITICAL: Test suite refused to run because DATABASE_URL does not contain '_test'. Current URL: ${dbUrl}`
    );
  }
}
