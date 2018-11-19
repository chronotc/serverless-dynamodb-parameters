'use strict';

const get = require('lodash.get');

const DDB_PREFIX = 'ddb';
const DDB_VARIABLE_STRING_REGEX = RegExp(/^(?:\${)?ddb:([a-zA-Z0-9_.\-/]+)/);

module.exports = class ServerlessDynamodbParameters {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws'); // only allow plugin to run on aws

    this.commands = {
      create_table: {
        usage: 'Creates a dynamodb table using the table name defined in serverless.yml',
        lifecycleEvents: [
          'create'
        ],
      },
      delete_table: {
        usage: 'Deletes a dynamodb table using the table name defined in serverless.yml',
        lifecycleEvents: [
          'delete'
        ],
      },
    };

    this.hooks = {
      'create_table:create': this.createTable.bind(this),
      'delete_table:delete': this.deleteTable.bind(this),
    };

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
        const message = `A valid DDB to satisfy the declaration '${variableString}' could not be found.`;
        throw new this.serverless.classes.Error(message);
      }

      return originalWarnIfNotFound(variableString, valueToPopulate);
    }
  }

  validateConfig() {
    const { tableName, ...rest } = get(this.serverless, 'service.custom.serverless-dynamodb-parameters') || {};

    if (!tableName) {
      throw new Error('Table name must be specified under custom.serverless-dynamodb-parameters.tableName')
    }

    return {
      tableName,
      ...rest
    };
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

  createTable() {
    this.serverless.cli.log('Creating DynamoDB table...');

    const params = JSON.parse(JSON.stringify({
      AttributeDefinitions: [
        {
          AttributeName: 'Name',
          AttributeType: 'S'
        }
      ],
      KeySchema: [
        {
          AttributeName: 'Name',
          KeyType: 'HASH'
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
      },
      TableName: this.config.tableName,
      SSESpecification: {
        Enabled: true ,
        KMSMasterKeyId: this.config.sseKmsKey,
        SSEType: 'KMS'
      },
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES'
      }
    }));

    return this.serverless.getProvider('aws').request(
      'DynamoDB',
      'createTable',
      params,
      { useCache: true }) // Use request cache
      .then(() => this.serverless.cli.log(`DynamoDB table ${this.config.tableName} created`))
      .catch((err) => {
        return Promise.reject(new this.serverless.classes.Error(err.message));
      });
  }

  deleteTable() {
    this.serverless.cli.log('Deleting DynamoDB table...');

    return this.serverless.getProvider('aws').request(
      'DynamoDB',
      'deleteTable',
      {
        TableName: this.config.tableName
      },
      { useCache: true }) // Use request cache
      .then(() => this.serverless.cli.log(`DynamoDB table ${this.config.tableName} deleted`))
      .catch((err) => {
        return Promise.reject(new this.serverless.classes.Error(err.message));
      });
  }
}
