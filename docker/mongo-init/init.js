// Initialize MongoDB with application user
db = db.getSiblingDB('admin');

db.createUser({
  user: 'cdrecruit_app',
  pwd: 'apppassword123',
  roles: [
    { role: 'readWriteAnyDatabase', db: 'admin' },
    { role: 'dbAdminAnyDatabase', db: 'admin' },
    { role: 'userAdminAnyDatabase', db: 'admin' }
  ]
});

print('✅ cdrecruit_app user created successfully with necessary administrative roles.');
