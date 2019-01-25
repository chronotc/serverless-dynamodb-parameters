'use strict';

const get = require('lodash.get');

// const DDB_PREFIX = 'ddb';
const DDB_VARIABLE_STRING_REGEX = RegExp(/^(?:\${)?ddb:([a-zA-Z0-9_.\-/]+)/);

module.exports = class ServerlessDynamodbParameters {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws'); // only allow plugin to run on aws

    this.config = this.validateConfig();

    const originalGetValueFromSource = serverless.variables.getValueFromSource.bind(serverless.variables);
    const originalTrackerAdd = serverless.variables.tracker.add.bind(serverless.variables.tracker);
    const originalWarnIfNotFound = serverless.variables.warnIfNotFound.bind(serverless.variables);

    this.serverless.variables.getValueFromSource = (variableString, propertyString) => {
      if (variableString.match(DDB_VARIABLE_STRING_REGEX)) {
        const promise = this.getValueFromDdb(variableString);
        return originalTrackerAdd(variableString, promise, propertyString);
      }

      return originalGetValueFromSource(variableString, propertyString);
    }

    this.serverless.variables.warnIfNotFound = (variableString, valueToPopulate) => {
      if (variableString.match(DDB_VARIABLE_STRING_REGEX) && this.config.errorOnMissing) {
        const message = `Value for '${variableString}' could not be found in Dynamo table '${this.tableName}'.`;
        throw new this.serverless.classes.Error(message);
      }

      return originalWarnIfNotFound(variableString, valueToPopulate);
    }
  }

  validateConfig() {
    const config = get(this.serverless, 'service.custom.serverless-dynamodb-parameters') || {};

    this.tableName = get(config, 'tableName');

    if (!this.tableName) {
      throw new Error('Table name must be specified under custom.serverless-dynamodb-parameters.tableName')
    }

    return Object.assign({}, config, { errorOnMissing: get(config, 'errorOnMissing', true)});
  }

  getValueFromDdb(variableString) {

    const groups = variableString.match(DDB_VARIABLE_STRING_REGEX);
    const value = groups[1];
    return this.serverless.getProvider('aws').request(
      'DynamoDB',
      'getItem',
      {
        TableName : this.config.tableName,
        Key: {
          Name: {
            S: value
          }
        }
      },
      { useCache: true }) // Use request cache
      .then(response => get(response, 'Item.Value.S'))
      .catch((err) => {
        if (err.statusCode !== 400) {
          return Promise.reject(new this.serverless.classes.Error(err.message));
        }

        return Promise.resolve(undefined);
      });
  }
}
