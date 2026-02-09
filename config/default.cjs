const dotenv = require('dotenv');
dotenv.config();
module.exports = {
  env: process.env.NODE_ENV || 'development',
  profile: process.env.AWS_PROFILE || 'xuniv',
  websocketUri: process.env.WEBSOCKET_URI || 'https://bakxvyaigl.execute-api.us-east-1.amazonaws.com/production',
};
