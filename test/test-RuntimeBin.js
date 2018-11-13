/* eslint-env mocha */
'use strict';

const sinon = require('sinon');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const expect = chai.expect;
chai.config.includeStack = true;

const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const RuntimeBin = require('../lib/RuntimeBin');

const BIN_PATH = 'bin-minify';
const TARGET_PATH = path.resolve(__dirname, path.join('data', 'mock-bin'));
const MIN_PACK = require(`${TARGET_PATH}.json`);

describe('RuntimeBin', () => {
  var runtimeBin
    , originPath;

  beforeEach((done) => {
    runtimeBin = new RuntimeBin({
      useSymlinks: true,
      targetPath: TARGET_PATH,
      minPack: MIN_PACK,
    });
    tmp.dir({ unsafeCleanup: true }, (err, tmpBasePath) => {
      if (err) console.error(`Could not create temp dir: ${err}`); // eslint-disable-line no-console
      else originPath = path.join(tmpBasePath, BIN_PATH);
      done();
    });
  });

  describe('#constructor()', () => {
    it('runtimeBin should be an instance of RuntimeBin', () => {
      return expect(runtimeBin).to.be.instanceof(RuntimeBin);
    });

    it('runtimeBin with no options should be an instance of RuntimeBin', () => {
      return expect(new RuntimeBin()).to.be.instanceof(RuntimeBin);
    });
  });

  describe('#applyMinPack()', () => {
    it('successfully creates symlinks', () => {
      return expect(runtimeBin.applyMinPack(originPath)).to.eventually.eql({loaded: true});
    });

    it('successfully runs with default path', () => {
      return expect(runtimeBin.applyMinPack()).to.eventually.have.keys('loaded');
    });

    it('successfully creates hard links', (done) => {
      tmp.dir({ unsafeCleanup: true, dir: path.resolve(__dirname, 'data') }, (err, tmpBasePath) => {
        if (err) console.error(`Could not create temp dir: ${err}`); // eslint-disable-line no-console
        else originPath = path.join(tmpBasePath, BIN_PATH);
        runtimeBin = new RuntimeBin({
          useSymlinks: false,
          targetPath: TARGET_PATH,
          minPack: MIN_PACK,
        });
        expect(runtimeBin.applyMinPack(originPath)).to.eventually.eql({loaded: true}).notify(done);
      });
    });

    it('successfully creates symlinks and then skips re-creating them', () => {
      return expect(runtimeBin.applyMinPack(originPath)).to.eventually.eql({loaded: true})
        && expect(runtimeBin.applyMinPack(originPath)).to.eventually.eql({loaded: false});
    });

    it('rejects promise if fs.existsSync() throws', (done) => {
      const stub = sinon.stub(fs, 'existsSync').throws();
      expect(runtimeBin.applyMinPack(originPath)).to.be.rejected.notify(done);
      stub.restore();
    });
  });
});
