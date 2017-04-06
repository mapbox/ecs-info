module.exports = (cluster, args) => {
  if (args.ip.split(':').length) args.ip = args.ip.split(':')[0];
  return cluster.instances.filter(instance => {
    return instance.ec2Info.PrivateIpAddress === args.ip;
  });
};