/* eslint-disable no-console */
var Table = require('easy-table');
var formatting = require('./formatting');

module.exports = taskInfo;

function taskInfo(cluster, taskArn) {
  const task = cluster.tasks.find(task => (new RegExp(`${taskArn}$`)).test(task.taskArn));
  if (!task) return console.log(`Task ${taskArn} not found on cluster ${cluster.clusterName}`);

  const data = task.basics();

  const containers = data.containers.map(container =>  {
    const environment = formatting.lpad(Table.print(container.environment), 2);
    const name = container.name;
    container.environment = '';
    delete container.name;
    return formatting.lpad(`${formatting.underline(name)}\n${Table.print(container)}${environment}`, 2);
  });

  data.containers = '\n';

  console.log(formatting.lpad(Table.print(data) + `${containers.join('\n')}`, 2));
}
