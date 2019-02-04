const AWS = require('aws-sdk');
const Plugin = require('./index')

const mockTracker = jest.fn();
const mockGetValue = jest.fn();
const mockWarn = jest.fn();
const mockQuery = jest.fn();

AWS.DynamoDB.DocumentClient.mockImplementation(function() {
  return { query: mockQuery };
});

const PluginFactory = (plugin, stage) => {
  stage = stage || 'dev'

  const serverless = {
    cli: {
      log: console.log
    },
    classes: { Error: Error },
    service: {
      custom: plugin,
      getServiceName: () => this.service,
      provider: {
        name: 'aws',
        compiledCloudFormationTemplate: {
          Resources: {}
        }
      },
      service: 'fooservice'
    },
    variables: {
      getValueFromSource: mockGetValue,
      warnIfNotFound: mockWarn,
      tracker: { add: mockTracker }
    },
    getProvider: () => {
      return {
        getRegion: () => 'fooregion',
        getStage: () => stage,
      }
    },
  }

  return new Plugin(serverless, stage)
}

describe('#ServerlessDynamodbParameters', () => {

  it('should have correct config', () => {
    const config = { 'serverless-dynamodb-parameters':  { tableName: 'some-table' } };
    const plugin = PluginFactory(config);

    expect(plugin.getTableName()).toEqual('some-table');
  });

  describe('when config is invalid', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should throw an error', () => {
      const config = {};

      try {
        PluginFactory(config);
      } catch(error) {
        expect(error.message).toEqual('Table name must be specified under custom.serverless-dynamodb-parameters.tableName');
      }
    });
  });

  describe('when variable is matched', () => {
    let plugin;

    beforeEach(() => {
      jest.clearAllMocks();
      const config = { 'serverless-dynamodb-parameters':  { tableName: 'some-table' } };
      plugin = PluginFactory(config)
    });

    it('should set the variables from dynamodb in the template', () => {
      mockQuery.mockImplementation(() => ({
        promise: () => Promise.resolve({
          Items: [{
            value: 'some-value',
            name: 'some-name',
            version: 'some-version'
          }]
        })
      }));

      mockTracker.mockImplementation((variableString, promise) => promise);

      return plugin.serverless.variables
        .getValueFromSource('${ddb:my-variable}', 'property')
        .then(result => {
          expect(result).toEqual('some-value');

          expect(mockTracker).toHaveBeenCalled();
          expect(mockQuery).toHaveBeenCalled();

          expect(mockQuery.mock.calls[0][0]).toEqual({
            Limit: 1,
            ScanIndexForward: false,
            KeyConditionExpression: '#name = :name',
            ExpressionAttributeNames: {
              '#name': 'name'
            },
            ExpressionAttributeValues: {
              ':name': 'my-variable'
            }
          });

          expect(mockTracker.mock.calls[0][0]).toEqual('${ddb:my-variable}');
          expect(mockTracker.mock.calls[0][2]).toEqual('property');
        });
    });

    it('should throw error if the parameter has no value', () => {
      mockQuery.mockImplementation(() => ({
        promise: () => Promise.resolve({ Items: [] })
      }));

      mockTracker.mockImplementation((variableString, promise) => promise);

      return expect(plugin.serverless.variables.getValueFromSource('${ddb:my-variable}', 'property'))
        .rejects.toEqual(new Error("Value for '${ddb:my-variable}' could not be found in the Dynamo table 'some-table'"));

    });

    it('should reject if there is error fetching parameter', () => {
      const error = new Error('some error');
      error.statusCode = 400;

      mockQuery.mockImplementation(() => ({ promise: () => Promise.reject(error)}));

      mockTracker.mockImplementation((variableString, promise) => promise);

      return expect(plugin.serverless.variables.getValueFromSource('${ddb:my-variable}', 'property'))
        .rejects.toEqual(new Error("Value for '${ddb:my-variable}' could not be found in the Dynamo table 'some-table'"));
    });
  });

  describe('when variable is not matched', () => {
    let plugin;

    beforeEach(() => {
      const config = { 'serverless-dynamodb-parameters':  { tableName: 'some-table' } };
      plugin = PluginFactory(config)
      jest.clearAllMocks();
    });

    it('should return the unchanged variable if it does not match regex', () => {

      mockGetValue.mockImplementation(() => 'result');

      const expected = plugin.serverless.variables
        .getValueFromSource('my-variable', 'property');

      expect(expected).toEqual('result');
      expect(mockGetValue).toHaveBeenCalledWith('my-variable', 'property');

      expect(mockTracker).not.toHaveBeenCalled();
    });
  });
})
