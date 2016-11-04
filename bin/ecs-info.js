#!/usr/bin/env node

/* eslint-disable no-console */

var ecs = require('..');
var meow = require('meow');

var cli = meow(`
  USAGE: ecs-info [OPTIONS] <command> <cluster>

  <cluster> does not need to be an entire cluster's name. E.g. api-production would
    suffice for a cluster named ecs-cluster-api-production-ABCDEFG

  COMMANDS:
    overview: a summary of the cluster's state and resource availability
    drilldown: find details about tasks that were launched by a service or watchbot

  OPTIONS:
    -r, --region  the aws region (default us-east-1)
`, {
  alias: {
    r: 'region'
  }
});

var command = cli.input[0];
var name = cli.input[1];
var region = cli.flags.region || 'us-east-1';

if (!command) console.error('ERROR: no command specified');
if (!name) console.error('ERROR: no cluster name specified');
if (!name || !command) return cli.showHelp();

ecs.Cluster.byName(name, region)
  .then(cluster => require(`../cli/${command}`)(cluster, cli.input.slice(2)))
  .catch(err => console.error(err.stack));
