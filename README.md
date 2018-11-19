# serverless-dynamodb-parameters

Use parameters sourced from **DynamoDB** in `serverless.yml`

## Example

### Syntax

`${ddb:<key>}`

### serverless.yml
```
custom:
  serverless-dynamodb-parameters:
    tableName: theTableName     # required
    errorOnMissing: false       # optional
    sseKmsKey: arn:xxxxxx       # optional
    
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

An error will be thrown when a parameter is missing.

#### `sseKmsKey (optional)`

Provide a CMK (Customer Master Key) otherwise `alias/aws/dynamodb` will be used.

### Commands

#### `create_table`

Provision a **DynamoDB** table. This will utilize the `tableName` and `sseKmsKey (optional)` provided to create the table.

#### `delete_table`

Removes the **DynamoDB** table using the name specified in `tableName`

## Dynamodb

It is not required that the table is provisioned through the `create_table` command.
The only requirement is that the table is stored in the following structure

| Name         | Value          |
|--------------|----------------|
| thisisthekey | thisisthevalue |

