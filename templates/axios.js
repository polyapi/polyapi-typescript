const Axios = require('axios');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');
const dotenv = require('dotenv');
const polyCustom = require('./poly-custom');
const { API_KEY, API_BASE_URL } = require('./constants');
import { scrub } from './api-index.js'

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

const scrubKeys = (err) => {
  if (err.request && typeof err.request.headers === 'object' && err.request.headers.Authorization) {
    // Scrub any credentials in the authorization header
    const [type, ...rest] = err.request.headers.Authorization.split(' ');
    err.request.headers.Authorization = rest.length && type
      ? `${type} ********`
      : `********`;
    err.request.headers = scrub(err.request.headers)
  }
  throw err;
};

module.exports = {
  axios,
  scrubKeys
};
