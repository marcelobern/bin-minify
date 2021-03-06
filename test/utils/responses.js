/* eslint-env mocha */
'use strict';

var escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

var responses = {
  responses: {},
};

responses.add = (response) => {
  responses.responses = response;
  return response;
};

responses.sanitize = (replacements) => {
  var content = JSON.stringify(responses.responses, null, ' ');
  for (var replacement in replacements) {
    content = content.replace(new RegExp(escapeRegExp(replacements[replacement]), 'g'), replacement);
  }
  responses.responses = JSON.parse(content.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'TIMESTAMP'));
};

responses.persist = (file) => {
  const fs = require('fs');
  fs.writeFile(file, JSON.stringify(responses.responses, null, ' '), {mode: 0o600}, function(err) {
    if (err) {
      return console.error(err); // eslint-disable-line no-console
    }
    console.log(`File ${file} was updated!`); // eslint-disable-line no-console
    return 0;
  });
};

module.exports = responses;
