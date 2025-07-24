const Axios = require('axios');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');
const dotenv = require('dotenv');
const polyCustom = require('./poly-custom');
const { API_KEY, API_BASE_URL } = require('./constants');

dotenv.config();

const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || process.env.npm_config_proxy;
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.npm_config_https_proxy;
const nodeEnv = process.env.NODE_ENV;
const isDevEnv = nodeEnv === 'development';

let baseURL = API_BASE_URL;
if (!isDevEnv) {
  baseURL = baseURL.replace(/^http:/, 'https:');
}

const axios = Axios.create({
  baseURL,
  httpAgent: httpProxy
    ? new HttpProxyAgent(httpProxy)
    : undefined,
  httpsAgent: httpsProxy
    ? new HttpsProxyAgent(httpsProxy, {
      rejectUnauthorized: !isDevEnv,
    })
    : isDevEnv
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
  proxy: false,
});
axios.interceptors.request.use(
  config => {
    config.headers['Authorization'] = `Bearer ${polyCustom.executionApiKey || API_KEY}`;
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);


const scrub = (data) => {
  if (!data || typeof data !== 'object' ) return data;
  const secrets = ["x_api_key", "x-api-key", "access_token", "access-token", "authorization", "api_key", "api-key", "apikey", "accesstoken", "token", "password", "key"];
  if (Array.isArray(data)) {
    return data.map(item => scrub(item))
  }
  else {
    const temp = {};
    for (const key of Object.keys(data)) {
      if (typeof data[key] === 'object') {
        temp[key] = scrub(data[key]);
      } else if (secrets.includes(key.toLowerCase())) {
        temp[key] = "********";
      } else {
        temp[key] = data[key];
      }
    }
    return temp
  }
}


const scrubKeys = (err) => {
  if (!err.request || typeof err.request.headers !== 'object') throw err
  const temp = scrub(err.request.headers)
  if (err.request.headers.Authorization) {
    // Scrub any credentials in the authorization header
    const [type, ...rest] = err.request.headers.Authorization.split(' ');
    temp.Authorization = rest.length && type
      ? `${type} ********`
      : `********`;
  }
  err.request.headers = temp
  throw err;
};

module.exports = {
  axios,
  scrubKeys,
  scrub
};
