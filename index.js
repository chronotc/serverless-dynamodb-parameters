'use strict';

const get = require('lodash.get');
const AWS = require('aws-sdk');

// const DDB_PREFIX = 'ddb';
const DDB_VARIABLE_STRING_REGEX = RegExp(/^(?:\${)?ddb:([a-zA-Z0-9_.\-/]+)/);

module.exports = class ServerlessDynamodbParameters {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws'); // only allow plugin to run on aws

    this.config = this.validateConfig();

    AWS.config.update({ region: this.provider.getRegion() });
    this.documentClient = new AWS.DynamoDB.DocumentClient({
      params: {
        TableName: this.config.tableName
      },
      convertEmptyValue: true
    });

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
        const message = `Value for '${variableString}' could not be found in Dynamo table '${this.config.tableName}'.`;
        throw new this.serverless.classes.Error(message);
      }

      return originalWarnIfNotFound(variableString, valueToPopulate);
    }
  }

  validateConfig() {
    const config = get(this.serverless, 'service.custom.serverless-dynamodb-parameters') || {};
    const tableName = get(config, 'tableName');

    if (!tableName) {
      throw new Error('Table name must be specified under custom.serverless-dynamodb-parameters.tableName')
    }

    return Object.assign({}, config, { errorOnMissing: get(config, 'errorOnMissing', true)});
  }

  getValueFromDdb(variableString) {

    const groups = variableString.match(DDB_VARIABLE_STRING_REGEX);
    const parameterName = groups[1];

    return this.documentClient.query({
      Limit: 1,
      ScanIndexForward: false,
      KeyConditionExpression: '#name = :name',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':name': parameterName
      }
    })
    .promise()
    .then(res => {
      const Item = get(res, 'Items.0');

      if (!Item) {
        throw new this.serverless.classes.Error('Query did not return a result', 400);
      }

      return Item;
    })
    .catch((err) => {
      if (err.statusCode !== 400) {
        return Promise.reject(new this.serverless.classes.Error(err.message));
      }

      return Promise.resolve(undefined);
    });
  }
}
