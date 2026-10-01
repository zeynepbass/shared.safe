// react-native-libsodium runs on JSI; in Node the same API comes from libsodium-wrappers.
const sodium = require('libsodium-wrappers-sumo');

module.exports = sodium;
module.exports.default = sodium;
