'use strict';

const get = require('lodash.get');
const AWS = require('aws-sdk');

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

    this.serverless.variables.getValueFromSource = (variableString, propertyString) => {
      if (variableString.match(DDB_VARIABLE_STRING_REGEX)) {
        const promise = this.getValueFromDdb(variableString);
        return originalTrackerAdd(variableString, promise, propertyString);
      }

      return originalGetValueFromSource(variableString, propertyString);
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

    const params = {
      Limit: 1,
      ScanIndexForward: false,
      KeyConditionExpression: '#name = :name',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':name': parameterName
      }
    };

    return this.documentClient.query(params)
    .promise()
    .then(res => {
      const value = get(res, 'Items.0.value');

      if (!value) {
        throw new this.serverless.classes.Error('Query did not return a result', 400);
      }

      return value;
    })
    .catch(() => {
      return Promise.reject(new this.serverless.classes.Error(`Value for '${variableString}' could not be found in Dynamo table '${this.config.tableName}`));
    });
  }
}
