# serverless-dynamodb-parameters

Use parameters sourced from **DynamoDB** in `serverless.yml`


## IMPORTANT

This has only been tested with serverless `1.35.1`

## Example

### Syntax

`${ddb:<key>}`

### serverless.yml
```
custom:
  serverless-dynamodb-parameters:
    tableName: theTableName     # required
    errorOnMissing: false       # optional

functions:
  hello:
    handler: handler.hello
    environment:
      world: ${ddb:iamthekey}  # resolves as iamthevalue
```

### Options

#### `tableName (required)`

The name of the **DynamoDB** table where the parameters are read.

#### `errorOnMissing (optional)`

Default: `true`

An error will be thrown when a parameter is missing.

## Dynamodb

The only requirement is that the table is stored in the following structure

Partition Key: name
Sort Key: version


| name         | version              | value             |
|--------------|----------------------|-------------------|
| thisisthekey | 00000000000000000002 | thisisthenewvalue |
| thisisthekey | 00000000000000000001 | thisisthevalue    |
