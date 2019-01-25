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
      const config = { tableName: 'some-table' };
      plugin = PluginFactory(config)
      jest.clearAllMocks();
    });

    it('should set the variables from dynamodb in the template', () => {
      mockRequest.mockImplementation(() => Promise.resolve({
        Item: { Value: { S: 'some-value' } }
      }));

      mockTracker.mockImplementation((variableString, promise) => promise);

      return plugin.serverless.variables
        .getValueFromSource('${ddb:my-variable}', 'property')
        .then(result => {
          expect(result).toEqual('some-value');

          expect(mockTracker).toHaveBeenCalled();
          expect(mockRequest).toHaveBeenCalled();

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
  });

  describe('when variable is not matched', () => {
    let plugin;

    beforeEach(() => {
      const config = { tableName: 'some-table' };
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
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

})
