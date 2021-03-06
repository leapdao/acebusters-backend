
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the GNU Affero General Public License,
 * version 3, found in the LICENSE file in the root directory of this source 
 * tree.
 */

function Lambda(lambda, funcName) {
  this.lambda = lambda;
  this.funcName = funcName;
}

Lambda.prototype.invoke = function invoke(event) {
  return new Promise((fulfill, reject) => {
    this.lambda.invoke({
      FunctionName: this.funcName,
      Payload: JSON.stringify(event),
      InvocationType: 'Event',
    }, (error, data) => {
      if (error) {
        return reject(error);
      }
      return fulfill(data.Payload);
    });
  });
};

Lambda.prototype.timeout = function timeout(tableAddr) {
  return this.invoke({
    params: {
      path: {
        tableAddr,
      },
    },
    context: {
      'resource-path': 'timeout',
    },
  });
};

Lambda.prototype.lineup = function lineup(tableAddr) {
  return this.invoke({
    params: {
      path: {
        tableAddr,
      },
    },
    context: {
      'resource-path': 'lineup',
    },
  });
};

module.exports = Lambda;
