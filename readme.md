# ecs-info

Library for querying the state of an AWS::ECS::Cluster

#### work in progress

```js
var ecs = require('ecs-info');
ecs.Cluster.describe('my-cluster', 'us-east-1')
  .then(clusterData => { ... });
```

The object that comes back has circular references that you can use to trace the
relationships between EC2 instances, ECS services, and ECS tasks that are part
of the cluster.
