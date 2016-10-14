/* eslint-disable no-console */

var Table = require('easy-table');
var formatting = require('./formatting');

module.exports = overview;

function overview(cluster) {
  const serviceData = cluster.services.map(service => ({
    Service: service.niceName(),
    'Running Tasks': service.tasks.length
  })).sort((a, b) => a.Service > b.Service ? 1 : -1);

  const freeMemory = cluster.instanceWithMostFreeMemory();
  const freeCpu = cluster.instanceWithMostFreeCpu();

  const resourceData = {
    EC2s: cluster.registeredContainerInstancesCount,
    'Memory (available/registered)': `${cluster.availableResources().mem}/${cluster.registeredResources().mem}`,
    'CPU (available/registered)': `${cluster.availableResources().cpu}/${cluster.registeredResources().cpu}`,
    'Most free memory': `${freeMemory.availableMemory()} (${freeMemory.ec2InstanceId})`,
    'Most free CPU': `${freeCpu.availableCpu()} (${freeCpu.ec2InstanceId})`,
    'Total running tasks': cluster.runningTasksCount
  };

  const distribution = cluster.instances.reduce((distribution, instance) => {
    const type = instance.ec2Info.InstanceType;
    const az = instance.ec2Info.Placement.AvailabilityZone;
    distribution[type] = distribution[type] || {};
    distribution[type][az] = distribution[type][az] || 0;
    distribution[type].total = distribution[type].total || 0;
    distribution[type][az]++;
    distribution[type].total++;
    return distribution;
  }, {});

  const asRows = Object.keys(distribution).map(type => {
    return Object.assign({ type }, distribution[type]);
  });

  const instanceDistribution = Table.print(asRows, (item, cell) => {
    cell('Instance Type', item.type);
    Object.keys(item).forEach(prop => {
      if (prop !== 'type' && prop !== 'total') cell(prop, item[prop]);
    });
    cell('total', item.total);
  });

  var output =`
${formatting.lpad(formatting.underline(cluster.clusterArn), 2)}

${formatting.lpad(Table.print(resourceData), 2)}

${formatting.lpad(instanceDistribution, 2)}

${formatting.lpad(Table.print(serviceData), 2)}
  `;

  return console.log(output);
}
