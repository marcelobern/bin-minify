/* eslint-env mocha */
'use strict';

const async = require('async');
const path = require('path');
const tmp = require('tmp');

const StagingBin = require('./StagingBin');
const RuntimeBin = require('./RuntimeBin');

const BIN_PATH = 'bin-minify';

const onlyFolders = (diffTreeResult) => {
  for (var entry of diffTreeResult) {
    if (!['mkdir', 'rmdir'].includes(entry[0])) return false;
  }
  return true;
};

exports.stagingWorkflow = function (targetPath, options) {
  return new Promise((resolve, reject) => {

    targetPath = targetPath || path.resolve(__dirname, '..', 'bin', 'bin-minify');
    options = undefined !== options ? options : {};
    const sendToTrash = options.sendToTrash || false;
    const dryRun = options.dryRun || false;
    const strict = options.strict || false;

    var stagingBin
      , runtimeBin
      , tmpFromBase;

    async.waterfall([
      (callback) => callback(null, new StagingBin({ targetPath })),
      (newStagingBin, callback) => {
        stagingBin = newStagingBin;
        return callback(null, stagingBin.createMinPack());
      },
      (createMinPackResult, callback) => {
        createMinPackResult.then(minPack => {
          runtimeBin = new RuntimeBin({
            targetPath,
            minPack,
          });

          tmp.dir({ unsafeCleanup: true }, (err, tmpBasePath) => {
            if (err) return callback(new Error(`Could not create temp dir: ${err}`));
            else {
              tmpFromBase = path.join(tmpBasePath, BIN_PATH);
              return callback(null, runtimeBin.applyMinPack(tmpFromBase));
            }
          });
        }, err => callback(new Error(`createMinPack() failed: ${err}`)));
      },
      (applyMinPackResult, callback) => {
        applyMinPackResult.then(result => {
          if (result.loaded) return callback(null, stagingBin.checkMinPack(tmpFromBase));
          else return callback(new Error(`Folder ${tmpFromBase} already exists`));
        }, err => callback(new Error(`applyMinPack() failed: ${err}`))
        );
      },
      (checkMinPackResult, callback) => {
        checkMinPackResult.then(result => {
          if (result.length > 0 && (strict || !onlyFolders(result))) {
            return callback(new Error(`Folders differ ${JSON.stringify(result, null, ' ')}`));
          }
          if (dryRun) return callback(null, new Promise(resolve => resolve({ delCount: 0 })));
          else return callback(null, stagingBin.minifyBin(sendToTrash));
        }, err => callback(new Error(`checkMinPack() failed: ${err}`))
        );
      },
    ], (err, minifyBinResult) => {
      if (err) reject(err);
      else minifyBinResult.then(
        () => resolve(stagingBin.minPack),
        err => reject(new Error(`minifyBin() failed: ${err}`))
      );
    });
  });
};
