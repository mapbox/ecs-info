module.exports = Instance;

function Instance(data) {
  const cloned = JSON.parse(JSON.stringify(data));
  Object.keys(cloned).forEach(key => { this[key] = cloned[key]; });
}

Instance.prototype.hostedTasks = function(tasks) {
  return tasks
    .filter(task => task.containerInstanceArn === this.containerInstanceArn);
};

Instance.prototype.cpuUsage = function() {
  const remaining = this.remainingResources.find(res => res.name === 'CPU').integerValue;
  const registered = this.registeredResources.find(res => res.name === 'CPU').integerValue;
  return `${remaining}/${registered}`;
};

Instance.prototype.memoryUsage = function() {
  const remaining = this.remainingResources.find(res => res.name === 'MEMORY').integerValue;
  const registered = this.registeredResources.find(res => res.name === 'MEMORY').integerValue;
  return `${remaining}/${registered}`;
};

Instance.prototype.liveTasks = function() {
  return this.tasks.filter(task => task.lastStatus === 'RUNNING');
};

Instance.prototype.runningServices = function() {
  const indexed = this.liveTasks().reduce((indexed, task) => {
    indexed[task.service.serviceArn] = task.service;
    return indexed;
  }, {});

  return Object.keys(indexed).map(key => indexed[key]);
};

Instance.prototype.loadBalancersInUse = function() {
  return this.runningServices().reduce((loadBalancers, service) => {
    return loadBalancers.concat(service.loadBalancers || []);
  }, []);
};
