const Plugin = require('./index')

const mockRequest = jest.fn();
const mockTracker = jest.fn();
const mockGetValue = jest.fn();

const PluginFactory = (plugin, stage) => {
  stage = stage || 'dev'

  const serverless = {
    cli: {
      log: console.log
    },
    service: {
      custom: { 'serverless-dynamodb-parameters': plugin },
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
      warnIfNotFound: jest.fn(),
      tracker: { add: mockTracker }
    },
    getProvider: () => {
      return {
        request: mockRequest,
        getRegion: () => 'fooregion',
        getStage: () => stage,
      }
    },
  }

  return new Plugin(serverless, stage)
}

describe('#ServerlessDynamodbParameters', () => {

  describe('when variable is matched', () => {
    it('should set the variables from dynamodb in the template', () => {
      const config = { tableName: 'some-table' };
      const plugin = PluginFactory(config)

      mockRequest.mockImplementation(() => Promise.resolve({
        Item: { Value: { S: 'some-value' } }
      }));

      mockTracker.mockImplementation((variableString, promise) => promise);

      return plugin.serverless.variables
        .getValueFromSource('${ddb:my-variable}', 'property')
        .then(result => {
          expect(result).toEqual('some-value');
          expect(mockTracker.mock.calls[0][0]).toEqual('${ddb:my-variable}');
          expect(mockTracker.mock.calls[0][2]).toEqual('property');

          expect(mockRequest.mock.calls[0]).toEqual([
            'DynamoDB',
            'getItem',
            {
              TableName: 'some-table',
              Key: { Name: { S: 'my-variable' } }
            },
            { useCache: true }
          ]);
        });
    });

    it('should throw an error if variable is missing in dynamodb', () => {

    });

  });

  describe('when variable is not matched', () => {
    it('should return the unchanged variable if it does not match regex', () => {

    });
  });

})
