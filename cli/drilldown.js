/* eslint-disable no-console */

var inquirer = require('inquirer');
var Table = require('easy-table');
var Task = require('../lib/Task');
var formatting = require('./formatting');
module.exports = drilldown;

function drilldown(cluster) {
  return inquirer.prompt(cluster.taskStarterPrompt())
    .then(answers => cluster.tasks.filter(task => task.startedBy === answers.taskStarter))
    .then(tasks => tasks.sort(Task.sortByRecency))
    .then(tasks => inquirer.prompt(Task.selectionPrompt(tasks)))
    .then(answers => {
      const data = answers.task.basics();

      const containers = data.containers.map(container =>  {
        const environment = formatting.lpad(Table.print(container.environment), 2);
        const name = container.name;
        container.environment = '';
        delete container.name;
        return formatting.lpad(`${formatting.underline(name)}\n${Table.print(container)}${environment}`, 2);
      });

      data.containers = '\n';

      console.log(formatting.lpad(Table.print(data) + `${containers.join('\n')}`, 2));
    });
}
