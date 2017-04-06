var Cluster = require('../../');

module.exports = (cluster, args) => {
  if (args.ip.split(':').length) args.ip = args.ip.split(':')[0];
  return new Cluster(cluster).instanceIdForInstanceIp(args.ip);
};