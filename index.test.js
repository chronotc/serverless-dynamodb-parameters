const Plugin = require('./index')

const PluginFactory = (plugin, stage) => {
  stage = stage || 'dev'

  const serverless = {
    cli: {
      log: console.log
    },
    service: {
      custom: { plugin },
      getServiceName: () => this.service,
      provider: {
        name: 'aws',
        compiledCloudFormationTemplate: {
          Resources: {}
        }
      },
      service: 'fooservice'
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

  it('should set the variables from dynamodb in the template', () => {
    const config = {}
    const plugin = PluginFactory(config)

    expect(plugin.defaults(config)).toEqual({

    })
  })
})
