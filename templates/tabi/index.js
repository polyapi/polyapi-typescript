const { http, scrubKeys } = require('../http');
const set = require('lodash/set');
const { tables } = require('./tables');


const executeQuery = (id, method, query, clientId, polyCustom) =>
  http.post(
    `/tables/${id}/${method}?clientId=${clientId}`,
    query,
    {
      headers: {
        'x-poly-execution-id': polyCustom.executionId,
      }
    }
  )
    .then(({ data }) => data)
    .catch(scrubKeys);

const firstResult = (rsp) => {
  if (Array.isArray(rsp.results)) {
    return rsp?.results.length ? rsp.results[0] : null;
  }
  // Else rsp is some kind of error
  return rsp;
}

const deleteOneResponse = (rsp) => {
  if (typeof rsp.deleted === 'number') {
    return { deleted: rsp.deleted > 0 };
  }
  // Else rsp is some kind of error
  return rsp;
}

class Table {
  constructor(id, clientId, polyCustom) {
    this.id = id;
    this.clientId = clientId;
    this.polyCustom = polyCustom;
  }

  count(query) {
    return executeQuery(this.id, 'count', query, this.clientId, this.polyCustom);
  }

  selectMany(query) {
    query.limit = query.limit || 1000;
    if (query.limit > 1000) throw Error(`Cannot select more than 1000 rows at a time.`);
    return executeQuery(this.id, 'select', query, this.clientId, this.polyCustom);
  }

  selectOne(query) {
    query.limit = 1;
    return executeQuery(this.id, 'select', query, this.clientId, this.polyCustom).then(firstResult);
  }

  insertMany(query) {
    if (query.data.length > 1000) throw Error(`Cannot insert more than 1000 rows at a time.`);
    return executeQuery(this.id, 'insert', query, this.clientId, this.polyCustom);
  }

  insertOne(query){
    query.data = [query.data];
    return executeQuery(this.id, 'insert', query, this.clientId, this.polyCustom).then(firstResult);
  }

  upsertMany(query) {
    if (query.data.length > 1000) throw Error(`Cannot upsert more than 1000 rows at a time.`);
    return executeQuery(this.id, 'upsert', query, this.clientId, this.polyCustom);
  }

  upsertOne(query) {
    query.data = [query.data];
    return executeQuery(this.id, 'upsert', query, this.clientId, this.polyCustom).then(firstResult);
  }

  updateMany(query) {
    return executeQuery(this.id, 'update', query, this.clientId, this.polyCustom);
  }

  updateOne(id, query) {
    if (!query.where) query.where = {};
    query.where.id = id;
    return executeQuery(this.id, 'update', query, this.clientId, this.polyCustom).then(firstResult);
  }

  deleteMany(query) {
    return executeQuery(this.id, 'delete', query, this.clientId, this.polyCustom);
  }

  deleteOne(id, query = {}) {
    if (!query.where) query.where = {};
    query.where.id = id;
    return executeQuery(this.id, 'delete', query, this.clientId, this.polyCustom).then(deleteOneResponse);
  }
}

module.exports = (clientId, polyCustom) => tables.reduce(
  (acc, [path, id]) => set(acc, path, new Table(id, clientId, polyCustom)),
  {}
);