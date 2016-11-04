module.exports.lpad = (str, spaces) =>
  (new Array(spaces)).fill(' ').join('') + str
    .split('\n')
    .map(line => line.replace(/ *$/, ''))
    .join('\n' + (new Array(spaces)).fill(' ').join(''));

module.exports.underline = str =>
  `${str}\n${(new Array(str.length)).fill('-').join('')}`;

module.exports.memory = mb => `${(mb / 1024).toFixed(2)}`;
