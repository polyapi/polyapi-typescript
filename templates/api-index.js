const { axios, scrub } = require('../axios');
const set = require('lodash/set');
const https = require('https');
const fs = require('fs');
const { env, functions } = require('./functions');


// Create MTLS agent if paths are provided
let httpsAgent = undefined;
const getHttpsAgent = () => {
  if (httpsAgent) {
    return httpsAgent;
  }

  const { mtls } = env;
  if (!mtls.certPath || !mtls.keyPath || !mtls.caPath) {
    return undefined;
  }

  httpsAgent = new https.Agent({
    cert: fs.readFileSync(mtls.certPath),
    key: fs.readFileSync(mtls.keyPath),
    ca: fs.readFileSync(mtls.caPath),
    rejectUnauthorized: mtls.rejectUnauthorized,
  });

  return httpsAgent;
};


const handleError = (err) => {
  if (err.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    return {
      data: err.response.data,
      status: err.response.status,
      headers: { ...err.response.headers },
      metrics: {},
    };
  }
  // Either the request was made but no response was received
  // Or something happened in setting up the request that triggered an Error
  return {
    data: err.message,
    status: err.request ? 500 : 400,
    headers: {},
    metrics: {},
  };
}


const executeApiFunction = (id, clientID, polyCustom, requestArgs) => {
  const requestServerStartTime = Date.now();

  // Check if direct execution is enabled
  const { directExecute } = env;
        
  if (directExecute === true) {
    // Make direct API call

    let polyHeaders;
    let serverPreperationTimeMs;
    let roundTripServerNetworkLatencyMs;
    let requestApiStartTime;

    return axios.post(
      `/functions/api/${id}/direct-execute?clientId=${clientID}`,
      requestArgs,
      {
        headers: {
          'x-poly-execution-id': polyCustom.executionId,
        }
      }
    ).then(({ headers, data }) => {
      polyHeaders = headers;
      if (data && (data.status < 200 || data.status >= 300) && process.env.LOGS_ENABLED) {
        let responseData = data.data;
        try {
          responseData = JSON.stringify(data.data);
        } catch (err) {
        requestArgs = scrub(requestArgs)
        console.error('Error executing api function with id:', id, 'Status code:', data.status, 'Request data:', scrubbedArgs, 'Response data:', responseData);
      }

      serverPreperationTimeMs = Number(polyHeaders['x-poly-execution-duration']);
      roundTripServerNetworkLatencyMs = Date.now() - requestServerStartTime - serverPreperationTimeMs;

      requestApiStartTime = Date.now();
      const httpsAgent = getHttpsAgent();

      return axios({
        ...data,
        headers: {
          ...data.headers,
        },
        httpsAgent,
      })
    }).then(({ headers, data, status }) => {
      if (status && (status < 200 || status >= 300) && process.env.LOGS_ENABLED) {
        requestArgs = scrub(requestArgs)
        console.error('Error direct executing api function with id:', id, 'Status code:', status, 'Request data:', requestArgs, 'Response data:', data.data);
      }
      const apiExecutionTimeMs = Date.now() - requestApiStartTime;
      return {
        data: data,
        status: status,
        headers: { ...headers },
        metrics: {
          roundTripServerNetworkLatencyMs,
          serverPreperationTimeMs,
          apiExecutionTimeMs,
        }
      };
    }).catch(handleError);
  }

  // default indirect execution
  return axios.post(
    `/functions/api/${id}/execute?clientId=${clientID}`,
    requestArgs,
    {
      headers: {
        'x-poly-execution-id': polyCustom.executionId,
      }
    }
  ).then(({ headers, data }) => {
    if (data && (data.status < 200 || data.status >= 300) && process.env.LOGS_ENABLED) {
      let responseData = data.data;
      try {
        responseData = JSON.stringify(data.data);
      } catch (err) {}
      requestArgs = scrub(requestArgs)
      console.error('Error executing api function with id:', id, 'Status code:', data.status, 'Request data:', requestArgs, 'Response data:', responseData);
    }
    const serverExecutionTimeMs = Number(headers['x-poly-execution-duration']);
    const roundTripNetworkLatencyMs = Date.now() - requestServerStartTime - serverExecutionTimeMs;
    return {
      ...data,
      metrics: {
        roundTripNetworkLatencyMs,
        serverExecutionTimeMs,
      }
    };
  }).catch(handleError);
}

module.exports = (clientID, polyCustom) => functions.reduce(
  (acc, [path, id, ...argKeys]) => set(
    acc,
    path,
    (...args) => {
      const requestArgs = argKeys.reduce((acc, key, index) => set(acc, key, args[index]), {});
      return executeApiFunction(id, clientID, polyCustom, requestArgs);
    }),
  {}
);