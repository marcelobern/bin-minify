/* eslint-env mocha */
'use strict';

const fs = require('fs');
const path = require('path');
const tmp = require('tmp');

const prepareFs = require('./utils/fsUtils').prepareFs;
var responses = require('./utils/responses');
const RESULTS_PATH = path.resolve(__dirname, 'data', 'mock-bin.json');
const RESULTS = require(RESULTS_PATH);

var shouldCapture = (testType) => ['capture'].includes(testType);
var shouldMock = (testType) => ['unit'].includes(testType);

/*
 * Configurable test suite parameters
 */
const TEST_TYPE = ['unit', 'integration', 'capture'].includes(process.env.TEST_TYPE) ? process.env.TEST_TYPE : 'integration';
// TEST_TYPE = 'unit' will run unit tests locally (completes in milliseconds). This is the default value.
// TEST_TYPE = 'integration' will run integration tests against local filesystem (completes in milliseconds).
// TEST_TYPE = 'capture' same as integration plus will capture the responses for future unit tests.

const sinon = require('sinon');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const expect = chai.expect;
chai.config.includeStack = true;

const StagingBin = require('../index').StagingBin;
const RuntimeBin = require('../index').RuntimeBin;

const BIN_PATH = 'bin-minify';
const TARGET_PATH = path.resolve(__dirname, path.join('data', 'mock-bin'));
const MIN_PACK = require(`${TARGET_PATH}.json`);

describe('StagingBin', () => {
  var stagingBin;

  beforeEach(() => {
    stagingBin = new StagingBin({
      targetPath: TARGET_PATH,
      relativeSymlinks: true,
      minPack: MIN_PACK,
    });
  });

  describe('#constructor()', () => {
    it('stagingBin should be an instance of StagingBin', () => {
      return expect(stagingBin).to.be.instanceof(StagingBin);
    });

    it('stagingBin with no options should be an instance of StagingBin', () => {
      return expect(new StagingBin()).to.be.instanceof(StagingBin);
    });
  });

  context('#private methods', () => {
    describe('#collectLinks()', () => {
      it('finds soft link and does not add it again', () => {
        const ID = '/softlink.txt';
        const PACK = { [ID]: [] };
        const stub = sinon.stub(fs, 'lstatSync').callsFake(() => {
          stagingBin.relativeSymlinks = false;
          stagingBin.minPack.pack = JSON.parse(JSON.stringify(PACK));
          return {
            isDirectory: () => false,
            isSymbolicLink: () => true,
          };
        });
        stagingBin.collectLinks(path.resolve(__dirname, path.join('data', 'mock-bin', ID)));
        expect(stagingBin.minPack.pack).to.eql(PACK);
        expect(stagingBin.symlinks).to.have.length(1);
        stub.restore();
      });

      it('finds entry and does not add it again', () => {
        const ID = 'dummy';
        const stub = sinon.stub(fs, 'lstatSync').callsFake(() => {
          stagingBin.minPack.pack = { [ID]: [] };
          return {
            isDirectory: () => false,
            isSymbolicLink: () => false,
          };
        });
        stagingBin.collectLinks(ID);
        expect(stagingBin.minPack.pack).to.eql({ [ID]: [] });
        expect(stagingBin.tasks).to.have.length(1);
        stub.restore();
      });
    });

    describe('#consolidateLinks()', () => {
      it('finds a removed key', () => {
        stagingBin.minPack.pack = [];
        stagingBin.removed = {'dummy': 'dummy2'};
        expect(stagingBin.consolidateLinks(['dummy'], 'dummy')).to.eql(['dummy', 'dummy2']);
      });

      it('adds entry to notFound', () => {
        stagingBin.consolidateLinks(['dummy'], 'dummy');
        expect(stagingBin.minPack.notFound).to.eql([ 'dummy' ]);
      });
    });
  });

  describe('#createMinPack()', () => {
    it('successfully creates a minPack', () => {
      if (shouldCapture(TEST_TYPE)) stagingBin.createMinPack().then(response => {
        responses.add(response);
        responses.persist(RESULTS_PATH);
      }, error => {
        console.error(`createMinPack() failed: ${error}`); // eslint-disable-line no-console
      });
      return expect(stagingBin.createMinPack()).to.eventually.eql(RESULTS);
    });

    it('Promise rejects when folder is empty', (done) => {
      const stub = sinon.stub(stagingBin, 'collectLinks').callsFake(() => {
        stagingBin.tasks = [];
      });
      expect(stagingBin.createMinPack()).to.eventually.be.rejected.notify(done);
      stub.restore();
    });

    it('responds with empty minPack when tasks are missing stat', (done) => {
      const stub = sinon.stub(stagingBin, 'collectLinks').callsFake(() => {
        stagingBin.tasks = [['dummy']];
      });
      expect(stagingBin.createMinPack()).to.eventually.eql({
        folders: [],
        pack: {},
        notFound: [],
      }).notify(done);
      stub.restore();
    });

    it('responds with non-empty minPack when folder has no duplicates', (done) => {
      const linkName = 'dummy';
      const stub = sinon.stub(stagingBin, 'collectLinks').callsFake(() => {
        stagingBin.minPack.pack[linkName] = [];
        stagingBin.tasks = [[
          linkName,
          { Stats: {
            size: 123,
          }}
        ]];
      });
      expect(stagingBin.createMinPack()).to.eventually.be.rejected.notify(done);
      stub.restore();
    });
  });

  describe('#checkMinPack()', () => {
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

    it('contents of bin path and links path match', (done) => {
      runtimeBin.applyMinPack(originPath).then( () => {
        expect(stagingBin.checkMinPack(originPath)).to.eventually.eql([]).notify(done);
      });
    });

    it('contents of bin path and default links path match', (done) => {
      runtimeBin.applyMinPack().then( (result) => {
        if (!result.loaded) console.warn('Comparing to existing default folder'); // eslint-disable-line no-console
        expect(stagingBin.checkMinPack()).to.eventually.eql([]).notify(done);
      });
    });
  });

  describe('#minifyBin()', () => {
    prepareFs(shouldMock(TEST_TYPE), TARGET_PATH);

    it('successfully removes the original files', () => {
      return expect(stagingBin.minifyBin(false)).to.eventually.eql({
        delCount: 4,
        files: [
          [
            path.join(TARGET_PATH, 'hardlink2.txt'),
            path.join(TARGET_PATH, 'hardlink.txt'),
            path.join(TARGET_PATH, 'regular_file.txt'),
            path.join(TARGET_PATH, 'softlink.txt'),
          ],
          [],
        ]
      });
    });

    it('successfully send the original files to the trash', () => {
      return expect(stagingBin.minifyBin(true)).to.eventually.have.property('delCount', 4);
    });

    it('successfully runs with default value for sendToTrash', () => {
      return expect(stagingBin.minifyBin()).to.eventually.eql({
        delCount: 4,
        files: [
          [
            path.join(TARGET_PATH, 'hardlink2.txt'),
            path.join(TARGET_PATH, 'hardlink.txt'),
            path.join(TARGET_PATH, 'regular_file.txt'),
            path.join(TARGET_PATH, 'softlink.txt'),
          ],
          [],
        ]
      });
    });

    it('rejects promise if Promise.all() rejects', (done) => {
      const stub = sinon.stub(Promise, 'all').rejects();
      expect(stagingBin.minifyBin(true)).to.be.rejected.notify(done);
      stub.restore();
    });
  });
});
