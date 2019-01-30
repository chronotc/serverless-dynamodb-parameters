// const _AWS = require('aws-sdk');

const DynamoDB = jest.fn(function() { });
DynamoDB.DocumentClient = jest.fn(function() { });

const AWS = {
  DynamoDB,
  config: { update: jest.fn() }
};

module.exports = AWS;
