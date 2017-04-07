#!/usr/bin/env node

/* eslint-disable no-console */

let ecs = require('..');

module.exports = function(slackArgs, callback) {
  //error handling happens in slack-commands
  ecs.Cluster.byName(slackArgs.cluster, slackArgs.region)
    .then(cluster => require(`${slackArgs.component/slackArgs.command}`)(cluster, slackArgs, callback))
    .catch(err => console.error(err.stack));
};


