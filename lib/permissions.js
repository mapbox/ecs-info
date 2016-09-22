var cf = require('cloudfriend');

module.exports = function(clusterLogicalName) {
  var clusterArn = clusterLogicalName ?
    cf.join(['arn:aws:ecs:', cf.region, ':', cf.accountId, ':cluster/', cf.ref(clusterLogicalName)]) :
    '*';

  var clusterCondition = clusterLogicalName ?
    { StringEquals: { 'ecs:cluster': clusterArn } } : undefined;

  return [
    {
      Effect: 'Allow',
      Action: [
        'ecs:ListClusters',
        'ec2:DescribeInstances',
        'ecs:ListServices',
        'ecs:DescribeServices',
        'ecs:DescribeTaskDefinition',
        'elasticloadbalancing:DescribeInstanceHealth',
        'elasticloadbalancing:DescribeTargetHealth'
      ],
      Resource: '*'
    },
    {
      Effect: 'Allow',
      Action: [
        'ecs:DescribeClusters',
        'ecs:ListContainerInstances'
      ],
      Resource: clusterArn
    },
    {
      Effect: 'Allow',
      Action: [
        'ecs:DescribeContainerInstances',
        'ecs:ListTasks',
        'ecs:DescribeTasks'
      ],
      Resource: '*',
      Condition: clusterCondition
    }
  ];
};
