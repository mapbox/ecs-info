module.exports = Task;

function Task(data) {
  const cloned = JSON.parse(JSON.stringify(data));
  Object.keys(cloned).forEach(key => { this[key] = cloned[key]; });
}

Task.sortByHost = function(a, b) {
  var hostA = a.instance ? a.instance.ec2Info.PublicDnsName : null;
  var hostB = b.instance ? b.instance.ec2Info.PublicDnsName : null;
  if (!hostA && !hostB) return 0;
  if (!hostA) return 1;
  if (!hostB) return -1;
  if (hostA < hostB) return -1;
  if (hostA > hostB) return 1;
  return 0;
};

Task.sortByRecency = function(a, b) {
  const timestampA = +a.lastUpdateTime();
  const timestampB = +b.lastUpdateTime();
  return timestampB - timestampA;
};

Task.selectionPrompt = function(tasks) {
  const index = tasks.reduce((index, task) => {
    index[`${task.lastStatus} at ${task.lastUpdateTime().toISOString()}`] = task;
    return index;
  }, {});

  return {
    type: 'list',
    name: 'task',
    message: 'Select a task',
    choices: Object.keys(index),
    filter: input => index[input]
  };
};

Task.failedWatchbotWorkers = function(stackName, tasks) {
  return tasks
    .filter(task => task.startedBy === stackName && task.lastStatus === 'STOPPED')
    .map(task => task.watchbotInfo())
    .filter(task => task['exit code'] !== 0);
};

Task.prototype.usedInstances = function(instances) {
  return instances
    .find(instance => instance.containerInstanceArn === this.containerInstanceArn);
};

Task.prototype.parentService = function(services) {
  return services
    .find(service => {
      return !!service.deployments.find(deployment => deployment.id === this.startedBy);
    });
};

Task.prototype.uptime = function() {
  if (!this.startedAt) return 0;
  const started = +new Date(this.startedAt);
  const stopped = this.stoppedAt ? +new Date(this.stoppedAt) : Date.now();
  return stopped - started;
};

Task.prototype.boottime = function() {
  const created = +new Date(this.createdAt);
  const started = this.startedAt ? +new Date(this.startedAt) : Date.now();
  return started - created;
};

Task.prototype.lastUpdateTime = function() {
  const created = +new Date(this.createdAt);
  const started = this.startedAt ? +new Date(this.startedAt) : 0;
  const stopped = this.stoppedAt ? +new Date(this.stoppedAt) : 0;
  return new Date(Math.max(created, started, stopped));
};

Task.prototype.containerEnvironments = function() {
  return this.containers.reduce((envs, container) => {
    const env = {};
    const name = container.name;
    const def = this.taskDefinition.containerDefinitions.find(def => def.name === name);
    const override = this.overrides.containerOverrides.find(override => override.name === name);

    def.environment.forEach(e => { env[e.name] = e.value; });
    if (override.environment) override.environment.forEach(e => { env[e.name] = e.value; });

    envs[name] = env;
    return envs;
  }, {});
};

Task.prototype.hostInfo = function() {
  return {
    'host id': this.instance ? this.instance.ec2InstanceId : null,
    'host dns': this.instance && this.instance.ec2Info ? this.instance.ec2Info.PublicDnsName : null,
    'host tasks': this.instance ? this.instance.liveTasks().length : null,
    'host cpu': this.instance ? this.instance.cpuUsage() : null,
    'host memory': this.instance ? this.instance.memoryUsage() : null
  };
};

Task.prototype.watchbotInfo = function() {
  var environments = this.containerEnvironments();
  var env = environments[Object.keys(environments)[0]];
  var uptime = this.uptime();

  return {
    'message id': env.MessageId,
    status: this.lastStatus,
    subject: env.Subject,
    message: env.Message,
    lastUpdate: this.lastUpdateTime(),
    'exit code': this.containers[0].exitCode,
    'exit reason': this.containers[0].reason,
    uptime: `${Math.floor(uptime / 60 / 1000)}m${((uptime / 1000) % 60).toFixed(2)}s`,
    host: this.instance ? this.instance.ec2Info.PublicDnsName : null,
    'host tasks': this.instance ? this.instance.liveTasks().length : null,
    'host cpu': this.instance ? this.instance.cpuUsage() : null,
    'host memory': this.instance ? this.instance.memoryUsage() : null
  };
};

Task.prototype.serviceInfo = function() {
  var uptime = this.uptime();
  return {
    status: this.lastStatus,
    uptime: `${Math.floor(uptime / 60 / 1000)}m${((uptime / 1000) % 60).toFixed(2)}s`,
    service: this.service ? this.service.serviceName : null,
    host: this.instance ? this.instance.ec2Info.PublicDnsName : null,
    'host tasks': this.instance ? this.instance.liveTasks().length : null,
    'host cpu': this.instance ? this.instance.cpuUsage() : null,
    'host memory': this.instance ? this.instance.memoryUsage() : null
  };
};

Task.prototype.basics = function() {
  const uptime = this.uptime();
  const envs = this.containerEnvironments();

  const data = Object.assign({
    status: this.lastStatus,
    uptime: `${Math.floor(uptime / 60 / 1000)}m${((uptime / 1000) % 60).toFixed(2)}s`,
    'started by': this.service ? this.service.serviceName : this.startedBy,
  }, this.hostInfo());

  if (data.status === 'STOPPED') data['stopped because'] = this.stoppedReason;
  data.containers = this.containers.map(container => {
    const data = {
      name: container.name,
      status: container.lastStatus,
    };

    if (container.lastStatus === 'STOPPED') data['exit code'] = container.exitCode;
    if (container.reason) data.reason = container.reason;
    data.environment = envs[container.name];

    return data;
  });

  return data;
};
