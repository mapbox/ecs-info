const HttpsAgent = require('agentkeepalive').HttpsAgent;
const AWS = require('aws-sdk');
const Service = require('./Service');
const Instance = require('./Instance');
const Task = require('./Task');
const d3 = require('d3-queue');

function traceable(err, noPromise) {
  Error.captureStackTrace(err, arguments.callee);
  return noPromise ? err : Promise.reject(err);
}

module.exports = Cluster;

function Cluster(data) {
  data.tasks.forEach(task => { task.instance = task.usedInstances(data.instances); });
  data.tasks.forEach(task => { task.service = task.parentService(data.services); });
  data.services.forEach(service => { service.tasks = service.childTasks(data.tasks); });
  data.instances.forEach(instance => { instance.tasks = instance.hostedTasks(data.tasks); });
  Object.assign(this, data);
}

Cluster.describe = describeCluster;
Cluster.byName = byName;

Cluster.prototype.registeredResources = function() {
  const cpu = this.instances.reduce((cpu, instance) => {
    return cpu + instance.registeredCpu();
  }, 0);

  const mem = this.instances.reduce((mem, instance) => {
    return mem + instance.registeredMemory();
  }, 0);

  return { cpu, mem };
};

Cluster.prototype.availableResources = function() {
  const cpu = this.instances.reduce((cpu, instance) => {
    return cpu + instance.availableCpu();
  }, 0);

  const mem = this.instances.reduce((mem, instance) => {
    return mem + instance.availableMemory();
  }, 0);

  return { cpu, mem };
};

Cluster.prototype.instanceWithMostFreeCpu = function() {
  return this.instances.reduce((most, instance) => {
    if (!most) return instance;
    const cpu = instance.availableCpu();
    const max = most.availableCpu();
    return cpu > max ? instance : most;
  });
};

Cluster.prototype.instanceWithMostFreeMemory = function() {
  return this.instances.reduce((most, instance) => {
    if (!most) return instance;
    const mem = instance.availableMemory();
    const max = most.availableMemory();
    return mem > max ? instance : most;
  });
};

Cluster.prototype.serviceDeploymentIndex = function() {
  return this.services.reduce((index, service) => {
    service.deploymentIds().forEach(id => index[id] = service);
    return index;
  }, {});
};

Cluster.prototype.taskStarters = function() {
  const index = this.serviceDeploymentIndex();

  return this.tasks.reduce((starters, task) => {
    const starter = index[task.startedBy] ?
      `(service) ${index[task.startedBy].niceName()}` : task.startedBy;
    starters[starter] = task.startedBy;
    return starters;
  }, {});
};

Cluster.prototype.taskStarterPrompt = function() {
  return {
    type: 'list',
    name: 'taskStarter',
    message: 'Select a service or other task starter',
    choices: Object.keys(this.taskStarters()).sort(),
    filter: input => this.taskStarters()[input]
  };
};

Cluster.prototype.instanceIdForInstanceIp = function(ip) {
  return this.instances.filter(instance => instance.ec2Info.PrivateIpAddress === ip)[0].ec2Info.InstanceId;
};

function describeCluster(cluster, region) {
  const params = { cluster };
  const arn = cluster.split(':');
  if (!region && arn.length > 5) region = arn[3];

  const options = {
    region: region,
    httpOptions: {
      agent: new HttpsAgent({
        keepAlive: true,
        maxSockets: 128
      })
    }
  };

  const ecs = new AWS.ECS(options);
  const ec2 = new AWS.EC2(options);
  const elb = new AWS.ELB(options);
  const elbv2 = new AWS.ELBv2(options);
  const cw = new AWS.CloudWatch(options);

  var clusterData;

  return Promise.all([
    ecs.describeClusters({ clusters: [cluster] }).promise().catch(traceable),
    describeInstances(ecs, ec2, params)
      .then(instances => describeDockerStorage(cw, instances, cluster)),
    describeServices(ecs, params)
      .then(serviceData => describeLoadBalancerTargets(elb, elbv2, serviceData)),
  ])
  .then(results => Object.assign({
    tasks: results[1].map(data => new Task(data)),
    instances: results[2].map(data => new Instance(data)),
    services: results[3].map(data => new Service(data))
  }, results[0].clusters[0]))
  .then(data => {
    clusterData = data;
    clusterData.tasks.forEach(task => { task.instance = task.usedInstances(data.instances); });
    var deadInstances = data.tasks.reduce((deadInstances, task) => {
      if (!task.instance) deadInstances.push(task.containerInstanceArn);
      return deadInstances;
    }, []);
    return describeDeadInstances(deadInstances, cluster, ecs, ec2);
  })
  .then(deadInstances => {
    clusterData.instances =
      clusterData.instances.concat(deadInstances.map(data => new Instance(data)));
    return clusterData;
  })
  .then(data => new Cluster(data));
}

function describeTasks(client, params) {
  function describe(status) {
    return new Promise((resolve, reject) => {
      var tasks = [];
      var options = Object.assign({ desiredStatus: status }, params);

      client.listTasks(options).eachPage((err, data, done) => {
        if (err) return reject(traceable(err, true));
        if (!data) return resolve(tasks);
        if (!data.taskArns.length) return resolve(tasks);

        client.describeTasks({
          cluster: params.cluster,
          tasks: data.taskArns
        }).promise().catch(traceable)
          .then(data => { tasks = tasks.concat(data.tasks); })
          .then(done)
          .catch(reject);
      });
    });
  }

  function define(taskDef) {
    return client.describeTaskDefinition({ taskDefinition: taskDef })
      .promise().catch(traceable)
      .then(data => data.taskDefinition);
  }

  return Promise.all([describe('RUNNING'), describe('PENDING'), describe('STOPPED')])
    .then(data => data.reduce((all, tasks) => all.concat(tasks), []))
    .then(tasks => {
      const arns = tasks.reduce((arns, task) => {
        arns[task.taskDefinitionArn] = true;
        return arns;
      }, {});

      return Promise.all(Object.keys(arns).map(define))
        .then(taskDefs => {
          const indexed = taskDefs.reduce((indexed, taskDef) => {
            indexed[taskDef.taskDefinitionArn] = taskDef;
            return indexed;
          }, {});

          tasks.forEach(task => task.taskDefinition = indexed[task.taskDefinitionArn]);
          return tasks;
        });
    });
}

function describeInstances(ecs, ec2, params) {
  return new Promise((resolve, reject) => {
    var instances = [];

    function describeEc2s(instances) {
      const ids = instances.map(instance => instance.ec2InstanceId);

      return ec2.describeInstances({ InstanceIds: ids }).promise().catch(traceable)
        .then(data => {
          const ec2s = data.Reservations.reduce((ec2s, reservation) => {
            reservation.Instances.forEach(ec2 => {
              ec2s[ec2.InstanceId] = ec2;
            });
            return ec2s;
          }, {});

          instances.forEach(instance => {
            instance.ec2Info = ec2s[instance.ec2InstanceId];
          });

          return instances;
        });
    }

    ecs.listContainerInstances(params).eachPage((err, data, done) => {
      if (err) return reject(traceable(err, true));
      if (!data) return resolve(instances);
      if (!data.containerInstanceArns.length) return resolve(instances);

      ecs.describeContainerInstances({
        cluster: params.cluster,
        containerInstances: data.containerInstanceArns
      }).promise().catch(traceable)
        .then(data => describeEc2s(data.containerInstances))
        .then(data => { instances = instances.concat(data); })
        .then(done)
        .catch(reject);
    });
  });
}

function describeDeadInstances(instanceArns, cluster, ecs, ec2) {
  return new Promise((resolve, reject) => {
    var instances = [];

    function describeEc2s(instances) {
      const ids = instances.map(instance => instance.ec2InstanceId);

      return ec2.describeInstances({ InstanceIds: ids }).promise().catch(traceable)
        .then(data => {
          const ec2s = data.Reservations.reduce((ec2s, reservation) => {
            reservation.Instances.forEach(ec2 => {
              ec2s[ec2.InstanceId] = ec2;
            });
            return ec2s;
          }, {});

          instances.forEach(instance => {
            instance.ec2Info = ec2s[instance.ec2InstanceId];
          });

          return instances;
        });
    }

    (function describeContainerInstances() {
      var params = {
        cluster: cluster,
        containerInstances: instanceArns.splice(0, 100)
      };

      if (!params.containerInstances.length) return resolve(instances);

      ecs.describeContainerInstances(params).promise().catch(traceable)
        .then(data => describeEc2s(data.containerInstances))
        .then(data => { instances = instances.concat(data); })
        .then(() => describeContainerInstances())
        .catch(reject);
    })();
  });
}

function describeServices(client, params) {
  return new Promise((resolve, reject) => {
    var services = [];

    client.listServices(params).eachPage((err, data, done) => {
      if (err) return reject(traceable(err, true));
      if (!data) return resolve(services);
      if (!data.serviceArns.length) return resolve(services);

      client.describeServices({
        cluster: params.cluster,
        services: data.serviceArns
      }).promise().catch(traceable)
        .then(data => { services = services.concat(data.services); })
        .then(done)
        .catch(reject);
    });
  });
}

function describeLoadBalancerTargets(elb, elbv2, servicesData) {
  var promises = servicesData.reduce((promises, data) => {
    data.loadBalancers.forEach(loadBalancer => {
      var promise;

      if (loadBalancer.targetGroupArn) {
        promise = elbv2.describeTargetHealth({
          TargetGroupArn: loadBalancer.targetGroupArn
        }).promise().catch(traceable).then(data => {
          loadBalancer.targetHealthDescriptions = data.TargetHealthDescriptions;
        });
      } else {
        promise = elb.describeInstanceHealth({
          LoadBalancerName: loadBalancer.loadBalancerName
        }).promise().catch(traceable).then(data => {
          loadBalancer.instanceStates = data.InstanceStates;
        });
      }

      promises.push(promise);
    });
    return promises;
  }, []);

  return Promise.all(promises).then(() => servicesData);
}

function describeDockerStorage(cw, instances, cluster) {
  const queue = d3.queue(10);
  const region = cluster.split(':')[3];
  const now = Date.now();
  const name = cluster.split(':').pop()
    .replace(/^cluster\//, '')
    .replace(/-Cluster-.*$/, '');

  instances
    .forEach(instance => {
      // console.log({
      //   Namespace: 'System/Linux',
      //   MetricName: 'dockerDiskUtilization',
      //   Dimensions: [
      //     { Name: 'InstanceId', Value: `${instance.ec2InstanceId}-${name}-${region}` }
      //   ],
      //   Statistics: ['Maximum'],
      //   StartTime: (new Date(now - 5 * 60 * 1000)).toISOString(),
      //   EndTime: (new Date(now)).toISOString(),
      //   Period: 5 * 60
      // });
      queue.defer(next => cw.getMetricStatistics({
        Namespace: 'System/Linux',
        MetricName: 'dockerDiskUtilization',
        Dimensions: [
          { Name: 'InstanceId', Value: `${instance.ec2InstanceId}-${name}-${region}` }
        ],
        Statistics: ['Maximum'],
        StartTime: (new Date(now - 5 * 60 * 1000)).toISOString(),
        EndTime: (new Date(now)).toISOString(),
        Period: 5 * 60
      }, next));
    });

  return new Promise((resolve, reject) => {
    queue.awaitAll((err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  })
  .then(results => {
    results.forEach((metric, i) => {
      if (metric.Datapoints[0]) instances[i].dockerDiskUtilization = `${metric.Datapoints[0].Maximum}%`;
    });
    return instances;
  });
}

function byName(name, region) {
  const client = new AWS.ECS({ region });

  return listClusters(client)
    .then(arns => arns.find(arn => (new RegExp(name)).test(arn)))
    .then(arn => Cluster.describe(arn));
}

function listClusters(client) {
  return new Promise((resolve, reject) => {
    var clusters = [];

    client.listClusters().eachPage((err, data, done) => {
      if (err) return reject(traceable(err, true));
      if (!data) return resolve(clusters);
      if (!data.clusterArns.length) return resolve(clusters);

      clusters = clusters.concat(data.clusterArns);
      return done();
    });
  });
}
