const Plugin = require('./index')

const mockRequest = jest.fn();
const mockTracker = jest.fn();
const mockGetValue = jest.fn();
const mockWarn = jest.fn();

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
        request: mockRequest,
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

    expect(plugin.config).toEqual({ 'tableName': 'some-table', errorOnMissing: true });
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
      const config = { 'serverless-dynamodb-parameters':  { tableName: 'some-table' } };
      plugin = PluginFactory(config)
      jest.clearAllMocks();
    });

    fit('should set the variables from dynamodb in the template', () => {
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

    it('should throw error if there is error fetching parameter', () => {
      mockRequest.mockImplementation(() => Promise.reject(new Error('some error occured')));
      mockTracker.mockImplementation((variableString, promise) => promise);

      return plugin.serverless.variables
        .getValueFromSource('${ddb:my-variable}', 'property')
        .then(() => expect(true).toEqual(false))
        .catch(error => expect(error.message).toEqual('some error occured'));
    });

    it('should return undefined if error statuscode is 400', () => {
      const error = new Error('some error');
      error.statusCode = 400;

      mockRequest.mockImplementation(() => Promise.reject(error));
      mockTracker.mockImplementation((variableString, promise) => promise);

      return plugin.serverless.variables
        .getValueFromSource('${ddb:my-variable}', 'property')
        .then(result => expect(result).toEqual(undefined));
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
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  describe('#warnIfNotFound', () => {
    let plugin;

    beforeEach(() => {
      const config = { 'serverless-dynamodb-parameters':  { tableName: 'some-table' } };
      plugin = PluginFactory(config)
      jest.clearAllMocks();
    });

    it('should call original warn if not found when variable does not match regex', () => {
       plugin.serverless.variables.warnIfNotFound('variable', 'value');

      expect(mockWarn).toHaveBeenCalledWith('variable', 'value');
    });

    it('should throw error if variable is missing', () => {
      const variable = '${ddb:my-variable}';
      try {
        plugin.serverless.variables.warnIfNotFound(variable, 'value');
        expect(true).toEqual(false);
      } catch(error) {
        expect(error.message).toEqual(`Value for '${variable}' could not be found in Dynamo table 'some-table'.`);
      }
    });
  });
})
