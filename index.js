'use strict';

const get = require('lodash.get');
const AWS = require('aws-sdk');

const DDB_VARIABLE_STRING_REGEX = RegExp(/^(?:\${)?ddb:([a-zA-Z0-9_.\-/]+)/);

module.exports = class ServerlessDynamodbParameters {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws'); // only allow plugin to run on aws

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

  getDocumentClient() {
    AWS.config.update({ region: this.provider.getRegion() });
    return this.getTableName()
    .then(tableName => new AWS.DynamoDB.DocumentClient({
      params: {
        TableName: tableName
      },
      convertEmptyValue: true
    }));
  }

  getTableName() {
    const rawTableName = get(this.serverless, 'service.custom.serverless-dynamodb-parameters.tableName');
    return this.serverless.variables.getValueFromSource('opt:stage', rawTableName)
    .then(stage => {
      return rawTableName.replace(new RegExp('\\bopt:stage\\b'), stage);
    })
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

    return this.getDocumentClient()
    .then(documentClient => documentClient.query(params).promise())
    .then(res => {
      const value = get(res, 'Items.0.value');

      if (!value) {
        throw new this.serverless.classes.Error('Query did not return a result', 400);
      }

      return value;
    })
    .catch(() => {
      return Promise.reject(new this.serverless.classes.Error(`Value for '${variableString}' could not be found in the Dynamo table`));
    });
  }
}
