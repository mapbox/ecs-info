module.exports = instances;

function instances(cluster) {
  cluster.instances.forEach(instance => console.log(`${instance.ec2InstanceId}: ${instance.dockerDiskUtilization}`));
}
