const { axios, scrubKeys } = require('../axios');
const set = require('lodash/set');
const { functions } = require('./functions');

module.exports = (clientID, polyCustom) => functions.reduce(
  (acc, [path, id, ...argKeys]) => set(
    acc,
    path,
    (...args) => axios.post(
      `/functions/server/${id}/execute?clientId=${clientID}`,
      argKeys.reduce((acc, key, index) => set(acc, key, args[index]), {}),
      {
        headers: {
          'x-poly-execution-id': polyCustom.executionId,
        }
      }
    ).then(({ data }) => data).catch(scrubKeys)),
  {}
);
