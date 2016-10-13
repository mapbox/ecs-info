module.exports.lpad = (str, spaces) =>
  (new Array(spaces)).fill(' ').join('') + str.split('\n').join('\n' + (new Array(spaces)).fill(' ').join(''));

module.exports.underline = str =>
  `${str}\n${(new Array(str.length)).fill('-').join('')}`;
