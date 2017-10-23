module.exports = {
  Cluster: require('./lib/Cluster'),
  Task: require('./lib/Task'),
  Instance: require('./lib/Instance'),
  Service: require('./lib/Service'),
  iamPermissions: require('./lib/permissions'),
  slackCommands: require('./slack-commands')
};
