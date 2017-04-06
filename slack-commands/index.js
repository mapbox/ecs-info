#!/usr/bin/env node

/* eslint-disable no-console */

let ecs = require('..');

module.exports = function(slackArgs, callback) {
  let err;
  if (!slackArgs.command) err = 'ERROR: no command specified';
  if (!slackArgs.cluster) err = 'ERROR: no cluster name specified';
  if (!slackArgs.region) err = 'ERROR: no region specified';
  if (err) return callback(err);

  ecs.Cluster.byName(slackArgs.cluster, slackArgs.region)
    .then(cluster => require(`${slackArgs.command}`)(cluster, slackArgs, callback))
    .catch(err => console.error(err.stack));
};


