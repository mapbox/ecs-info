module.exports = Service;

function Service(data) {
  const cloned = JSON.parse(JSON.stringify(data));
  Object.keys(cloned).forEach(key => { this[key] = cloned[key]; });
}

Service.prototype.childTasks = function(tasks) {
  return tasks
    .filter(task => {
      return !!this.deployments.find(deployment => deployment.id === task.startedBy);
    });
};

Service.prototype.formattedEvents = function() {
  return this.events
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map(event => `${event.createdAt}    ${event.message.trim().replace(/^\(.*?\)/, '')}`)
    .join('\n');
};
