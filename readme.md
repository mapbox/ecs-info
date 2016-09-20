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

The basic structure of this circular object is:

```
Cluster {
  tasks: [ ...Task {} ],
  instances: [ ...Instance {} ],
  services: [ ...Service {} ]
}
```

A `Cluster` is the [response from an ecs.describeClusters request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ECS.html#describeClusters-property) with additional properties:
- **tasks** an array of tasks running or stopped on the cluster
- **services** an array of services running on the cluster
- **instances** an array of instances in the cluster

A `Task` is the [response from an ecs.describeTasks request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ECS.html#describeTasks-property) with additional properties:
- **instance** the host instance
- **service** the service this task is a part of (or null)

A `Service` is the [response from an ecs.describeServices request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ECS.html#describeServices-property) with additional properties:
- **childTasks** an array of tasks that are part of the service

An `Instance` is the [response from an ecs.describeContainerInstances request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ECS.html#describeContainerInstances-property) with additional properties:
- **ec2Info** the [response from an ec2.describeInstances request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeInstances-property)
- **tasks** an array of tasks running on the instance

Futhermore, each of these classes have a set of prototype methods that they implement. These can be useful for formatting or resolving specific information about a cluster, task, service, or instance.
