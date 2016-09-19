#!/usr/bin/env node

/* eslint-disable no-console */

var ecs = require('..');
var Table = require('easy-table');

var name = process.argv[2];
var region = process.argv[3] || 'us-east-1';

ecs.Cluster.byName(name, region)
  .then(cluster => {
    const workers = cluster.tasks.sort(ecs.Task.sortByHost)
      .filter(task => task.lastStatus === 'RUNNING' || task.lastStatus === 'PENDING')
      .map(task => task.serviceInfo());

    console.log(Table.print(workers));
  })
  .catch(err => console.error(err.stack));
