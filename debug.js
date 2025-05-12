const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

console.log('Auth routes type:', typeof authRoutes);
console.log('API routes type:', typeof apiRoutes);

if (typeof authRoutes === 'object' && !authRoutes.handle) {
    console.log('authRoutes is not a valid router!');
    console.log(authRoutes);
}

if (typeof apiRoutes === 'object' && !apiRoutes.handle) {
    console.log('apiRoutes is not a valid router!');
    console.log(apiRoutes);
}
