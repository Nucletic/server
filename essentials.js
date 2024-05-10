const crypto = require('crypto-js');

exports.encryptData = function (data, secretKey) {
  const iv = crypto.lib.WordArray.random(128 / 8); // Generate IV
  const cipherParams = crypto.AES.encrypt(data, secretKey, { iv });
  const cipherText = cipherParams.toString();
  return cipherParams.iv.toString(crypto.enc.Base64) + ':' + cipherText; // Combine IV and ciphertext
}

exports.decryptData = function (combinedData, secretKey) {
  const [ivString, cipherText] = combinedData.split(':');
  const iv = Buffer.from(ivString, 'base64');
  const cipherParams = crypto.AES.decrypt(cipherText, secretKey, { iv });
  const decrypted = cipherParams.toString(crypto.enc.Utf8);
  return decrypted;
}