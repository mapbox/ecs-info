module.exports = (cluster, args, callback) => {
  let id;
  try {
    validate(args.args);
    let ip = args.args.match(/^ip=(.*)$/)[1];
    if (ip.split(':').length) ip = ip.split(':')[0];

    id = cluster.instances.filter(instance => {
      return instance.ec2Info.PrivateIpAddress === ip;
    })[0].ec2Info.InstanceId;

    return callback(null, id);

  } catch (e) {
    return callback(e);
  }
};

function validate(args) {
  if (!args.match(/ip=*/)) throw new Error('No IP!');
}