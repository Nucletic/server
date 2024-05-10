const admin = require('firebase-admin');
const serviceAccount = require('./timecapsulemessenger-firebase-adminsdk-ox7y8-b1a0b76c50.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'gs://timecapsulemessenger.appspot.com',
});

module.exports = admin;