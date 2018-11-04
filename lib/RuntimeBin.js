/* eslint-env node */
'use strict';

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

class RuntimeBin {
  constructor (options) {
    options = undefined !== options ? options : {};
    this.useSymlinks = undefined !== options.useSymlinks ? options.useSymlinks : true;
    this.targetPath = options.targetPath || path.resolve(__dirname, path.join('bin', 'bin-minify'));
    this.minPack = undefined !== options.minPack ? JSON.parse(JSON.stringify(options.minPack)) : {};
  }

  applyMinPack (fromBase) {
    fromBase = fromBase || path.join('/', 'tmp', 'bin-minify');
    const myPromise = (resolve, reject) => {
      try {
        if (fs.existsSync(fromBase)) {
          resolve({loaded: false});
        } else {
          if (this.useSymlinks) {
            for (const link in this.minPack.pack) {
              fse.ensureDirSync(fromBase + path.dirname(link));
              fs.symlinkSync(path.join(this.targetPath, link), path.join(fromBase, link));
              for (const from of this.minPack.pack[link]) {
                fse.ensureDirSync(fromBase + path.dirname(from));
                fs.symlinkSync(path.join(this.targetPath, link), path.join(fromBase, from));
              }
            }
          } else {
            for (const link in this.minPack.pack) {
              fse.ensureDirSync(fromBase + path.dirname(link));
              fs.linkSync(path.join(this.targetPath, link), path.join(fromBase, link));
              for (const from of this.minPack.pack[link]) {
                fse.ensureDirSync(fromBase + path.dirname(from));
                fs.linkSync(path.join(this.targetPath, link), path.join(fromBase, from));
              }
            }
          }
          resolve({loaded: true});
        }
      } catch (error) {
        reject({error});
      }
    };
    return new Promise(myPromise);
  }
}

module.exports = RuntimeBin;
