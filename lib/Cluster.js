const https = require('https');
const AWS = require('aws-sdk');
const Service = require('./Service');
const Instance = require('./Instance');
const Task = require('./Task');

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

function describeCluster(cluster, region) {
  const params = { cluster };
  const arn = cluster.split(':');
  if (!region && arn.length > 5) region = arn[3];

  const options = {
    region: region,
    httpOptions: {
      agent: new https.Agent({ keepAlive: true })
    }
  };

  const ecs = new AWS.ECS(options);
  const ec2 = new AWS.EC2(options);
  const elb = new AWS.ELB(options);
  const elbv2 = new AWS.ELBv2(options);

  return Promise.all([
    ecs.describeClusters({ clusters: [cluster] }).promise(),
    describeTasks(ecs, params),
    describeInstances(ecs, ec2, params),
    describeServices(ecs, params)
      .then(serviceData => describeLoadBalancerTargets(elb, elbv2, serviceData)),
  ])
  .then(results => Object.assign({
    tasks: results[1].map(data => new Task(data)),
    instances: results[2].map(data => new Instance(data)),
    services: results[3].map(data => new Service(data))
  }, results[0].clusters[0]))
  .then(data => new Cluster(data));
}

function describeTasks(client, params) {
  function describe(status) {
    return new Promise((resolve, reject) => {
      var tasks = [];
      var options = Object.assign({ desiredStatus: status }, params);

      client.listTasks(options).eachPage((err, data, done) => {
        if (err) return reject(err);
        if (!data) return resolve(tasks);
        if (!data.taskArns.length) return resolve(tasks);

        client.describeTasks({
          cluster: params.cluster,
          tasks: data.taskArns
        }).promise()
          .then(data => { tasks = tasks.concat(data.tasks); })
          .then(done)
          .catch(reject);
      });
    });
  }

  function define(taskDef) {
    return client.describeTaskDefinition({ taskDefinition: taskDef })
      .promise()
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

      return ec2.describeInstances({ InstanceIds: ids }).promise()
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
      if (err) return reject(err);
      if (!data) return resolve(instances);
      if (!data.containerInstanceArns.length) return resolve(instances);

      ecs.describeContainerInstances({
        cluster: params.cluster,
        containerInstances: data.containerInstanceArns
      }).promise()
        .then(data => describeEc2s(data.containerInstances))
        .then(data => { instances = instances.concat(data); })
        .then(done)
        .catch(reject);
    });
  });
}

function describeServices(client, params) {
  return new Promise((resolve, reject) => {
    var services = [];

    client.listServices(params).eachPage((err, data, done) => {
      if (err) return reject(err);
      if (!data) return resolve(services);
      if (!data.serviceArns.length) return resolve(services);

      client.describeServices({
        cluster: params.cluster,
        services: data.serviceArns
      }).promise()
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
        }).promise().then(data => {
          loadBalancer.targetHealthDescriptions = data.TargetHealthDescriptions;
        });
      } else {
        promise = elb.describeInstanceHealth({
          LoadBalancerName: loadBalancer.loadBalancerName
        }).promise().then(data => {
          loadBalancer.instanceStates = data.InstanceStates;
        });
      }

      promises.push(promise);
    });
    return promises;
  }, []);

  return Promise.all(promises).then(() => servicesData);
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
      if (err) return reject(err);
      if (!data) return resolve(clusters);
      if (!data.clusterArns.length) return resolve(clusters);

      clusters = clusters.concat(data.clusterArns);
      return done();
    });
  });
}
