/* eslint-env node */
'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const Dedupe = require('file-dedupe');
const parallel = require('miniq');
const naturalSort = require('javascript-natural-sort');
const FSTree = require('fs-tree-diff');
const walkSync = require('walk-sync');
const fc = require('filecompare');
const del = require('del');
const trash = require('trash');

class StagingBin {
  constructor (options) {
    this.init();
    options = undefined !== options ? options : {};
    this.targetPath = options.targetPath || path.resolve(__dirname, path.join('bin', 'bin-minify'));
    this.relativeSymlinks = undefined !== options.relativeSymlinks ? options.relativeSymlinks : true;
    this.minPack = undefined !== options.minPack ? JSON.parse(JSON.stringify(options.minPack)) : {};
  }

  init () {
    this.stats = {
      dupCount: 0,
      delCount: 0,
      emptyCount: 0,
      uniqueCount: 0,
    };
    this.minPack = {
      folders: [],
      pack: {},
      notFound: [],
    };
    this.removed = {};
    this.symlinks = [];
    this.tasks = [];
  }

  //private
  stripBasePath (path) {
    return path.replace(this.targetPath, '');
  }

  //private
  collectLinks (dir) {
    var stat = fs.lstatSync(dir);
    const shortFilename = this.stripBasePath(dir);
    if (stat.isDirectory()) {
      if (shortFilename.length > 0) this.minPack.folders.push(shortFilename);
      for (var entry of fs.readdirSync(dir)) {
        this.collectLinks(path.join(dir, entry));
      }
    } else {
      if (stat.isSymbolicLink()) {
        var link = fs.readlinkSync(dir);
        if (this.relativeSymlinks) {
          const fromDir = path.dirname(shortFilename);
          link = path.resolve(path.join(fromDir, link));
        }
        if (!(shortFilename in this.minPack.pack)) this.minPack.pack[link] = [shortFilename];
        this.symlinks.push(shortFilename);
      } else {
        if (!(shortFilename in this.minPack.pack)) this.minPack.pack[shortFilename] = [];
        this.tasks.push([dir, stat]);
      }
    }
  }

  //private
  consolidateLinks (entry, parent) {
    var newLinks = [];
    for (var element of entry) {
      if (element in this.minPack.pack) {
        newLinks = newLinks.concat(this.consolidateLinks(this.minPack.pack[element], element));
        this.removed[element] = parent;
        delete this.minPack.pack[element];
      } else if (element in this.removed) {
        newLinks = newLinks.concat(this.removed[element]);
        delete this.minPack.pack[this.removed[element]];
      } else if (!(element in this.removed) && !(this.symlinks.includes(element))) {
        this.minPack.notFound.push(element);
      }
    }
    return entry.concat(newLinks);
  }

  //private
  findDuplicates (callback) {
    const self = this;
    // sync FS access is actually faster in cases where you don't need to perform
    // parallel access - and globs are significantly slower, see https://github.com/isaacs/node-glob/issues/78

    // eliminate length-0
    if (!this.tasks.length) {
      callback(new Error('The folder is empty.'));
      return;
    }
    if (this.tasks[0][1]) {
      this.stats.emptyCount = this.tasks.length;
      this.tasks = this.tasks.filter(function(item) { return item[1].size > 0; });
      this.stats.emptyCount -= this.tasks.length;
      // filter by size
      var countBySize = {};
      this.stats.uniqueCount = this.tasks.length;
      this.tasks.forEach(function(task) {
        if (!countBySize[task[1].size]) {
          countBySize[task[1].size] = 1;
        } else {
          countBySize[task[1].size]++;
        }
      });
      this.tasks = this.tasks.filter(function(task) {
        return (countBySize[task[1].size] > 1);
      });
      this.stats.uniqueCount -= this.tasks.length;
      countBySize = null;
    }
    if (!this.tasks.length) {
      callback(new Error('No duplicate files were found.'));
      return;
    }

    var dedupe = new Dedupe({ async: false })
      , queue = parallel(32);

    var dups = {}
      , dupCount = 0;

    queue
      .once('err', function(err) {
        /* istanbul ignore next */
        throw err;
      })
      .once('empty', function () {
        self.stats.dupCount = dupCount;
        var clusters = [];
        var result = {};

        Object.keys(dups).forEach(function(key) {
          clusters.push([key].concat(dups[key]).map(function (entry) {
            return self.stripBasePath(entry);
          }));
        });

        // sort by file path
        clusters.forEach(function(cluster) {
          cluster.sort(naturalSort);
          result[cluster[0]] = cluster.slice(1);
        });

        callback(null, result);
      })
      .exec(self.tasks.map(function(items) {
        return function(done) {
          var name = items[0];
          dedupe.find(name, items[1], function(err, result/*, stat*/) {
            if (result !== false) {
              dupCount++;
              if (!dups[result]) {
                dups[result] = [ path.normalize(name) ];
              } else {
                dups[result].push(path.normalize(name));
              }
            }
            done();
          });
        };
      }));
  }

  //public
  createMinPack () {
    const myPromise = (resolve, reject) => {
      this.init();
      this.collectLinks(this.targetPath);
      this.findDuplicates((error, clusters) => {
        if (error) {
          reject(error);
        } else {
          for (var cluster in clusters) {
            this.minPack.pack[cluster] = this.consolidateLinks(clusters[cluster], cluster);
          }
        }
        this.minPack.folders = _.uniq(this.minPack.folders);
        resolve(this.minPack);
      });
    };

    return new Promise(myPromise);
  }

  //public
  checkMinPack (linksPath) {
    linksPath = linksPath || path.join('/', 'tmp', 'bin-minify');
    const binPath = this.targetPath;
    const myPromise = (resolve/*, reject*/) => {
      var binEntries = new FSTree({
        entries: walkSync.entries(binPath),
      });
      var linksEntries = new FSTree({
        entries: walkSync.entries(linksPath),
      });

      resolve(binEntries.calculatePatch(linksEntries, (a, b) => {
        return isEqual(a, b);
      }));
      async function isEqual(a, b) {
        var result = false;
        await fc(
          path.join(a.basePath , a.relativePath),
          path.join(b.basePath , b.relativePath),
          (isEqual) => {result = isEqual;}
        );
        return result;
      }
    };
    return new Promise(myPromise);
  }

  //public
  minifyBin (sendToTrash) {
    sendToTrash = undefined !== sendToTrash ? sendToTrash : false;
    const self = this;
    return new Promise((resolve, reject) => {
      var delCount = 0;
      Promise
        .all(Object.keys(self.minPack.pack).map(function(key) {
          const cluster = self.minPack.pack[key].map(item => path.join(self.targetPath, item));
          delCount += cluster.length;
          return sendToTrash
            ? trash(cluster)
            : del(cluster);
          //fs.unlinkSync(dir);
        }))
        .then(files => {
          self.stats.delCount = delCount;
          resolve({ delCount, files });
        }, error => {
          reject(new Error(`Could not remove files: ${error}`));
        });
    });
  }
}

module.exports = StagingBin;
