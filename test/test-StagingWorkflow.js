/* eslint-env mocha */
'use strict';

const path = require('path');
const tmp = require('tmp');

const prepareFs = require('./utils/fsUtils').prepareFs;
const RESULTS_PATH = path.resolve(__dirname, path.join('data', 'mock-bin.json'));
const RESULTS = require(RESULTS_PATH);

var shouldMock = (testType) => ['unit'].includes(testType);

/*
 * Configurable test suite parameters
 */
const TEST_TYPE = ['unit', 'integration', 'capture'].includes(process.env.TEST_TYPE) ? process.env.TEST_TYPE : 'integration';

const sinon = require('sinon');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const expect = chai.expect;
chai.config.includeStack = true;

const StagingBin = require('../index').StagingBin;
const RuntimeBin = require('../index').RuntimeBin;
const stagingWorkflow = require('../index').stagingWorkflow;

const TARGET_PATH = path.resolve(__dirname, path.join('data', 'mock-bin'));

describe('stagingWorkflow', () => {
  prepareFs(shouldMock(TEST_TYPE), TARGET_PATH);

  describe('works with', () => {
    prepareFs(shouldMock(TEST_TYPE), path.resolve(__dirname, '..', 'bin', 'bin-minify'));

    it('default values', () => {
      return expect(stagingWorkflow()).to.eventually.eql(RESULTS);
    });
  });

  it('works when all options are false', () => {
    const options = {
      sendToTrash: false,
      dryRun: false,
      strict: false,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  it('works when strict is true', () => {
    const options = {
      sendToTrash: false,
      dryRun: false,
      strict: true,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  it('works when dryRun is true', () => {
    const options = {
      sendToTrash: false,
      dryRun: true,
      strict: false,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  it('works when dryRun & strict are true', () => {
    const options = {
      sendToTrash: false,
      dryRun: true,
      strict: true,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  it('works when sendToTrash is true', () => {
    const options = {
      sendToTrash: true,
      dryRun: false,
      strict: false,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  it('works when sendToTrash & strict are true', () => {
    const options = {
      sendToTrash: true,
      dryRun: false,
      strict: true,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  it('works when sendToTrash & dryRun are true', () => {
    const options = {
      sendToTrash: true,
      dryRun: true,
      strict: false,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  it('works when all options are true', () => {
    const options = {
      sendToTrash: true,
      dryRun: true,
      strict: true,
    };
    return expect(stagingWorkflow(TARGET_PATH, options)).to.eventually.eql(RESULTS);
  });

  describe('# test exception scenarios', () => {
    var stub;

    afterEach(() => {
      stub.restore();
    });

    it('is rejected if tmp.dir() errs', (done) => {
      stub = sinon.stub(tmp, 'dir').callsArgWith(1, new Error('dummy'));
      expect(stagingWorkflow(TARGET_PATH)).to.eventually.be.rejected.notify(done);
    });

    it('is rejected when when applyMinPack() resolves to { loaded: false }', (done) => {
      stub = sinon.stub(RuntimeBin.prototype, 'applyMinPack').resolves({ loaded: false });
      expect(stagingWorkflow(TARGET_PATH)).to.eventually.be.rejected.notify(done);
    });

    it('is rejected when when checkMinPack() resolves to non-empty Array', (done) => {
      stub = sinon.stub(StagingBin.prototype, 'checkMinPack').resolves([['dummy']]);
      expect(stagingWorkflow(TARGET_PATH)).to.eventually.be.rejected.notify(done);
    });

    it('works when checkMinPack() resolves to non-empty Array (dirs only)', (done) => {
      stub = sinon.stub(StagingBin.prototype, 'checkMinPack').resolves([['mkdir'], ['rmdir']]);
      expect(stagingWorkflow(TARGET_PATH)).to.eventually.eql(RESULTS).notify(done);
    });
  });

  describe('# test reject scenarios', () => {
    var stub;

    afterEach(() => {
      stub.restore();
    });

    it('is rejected when createMinPack() rejects', () => {
      stub = sinon.stub(StagingBin.prototype, 'createMinPack').rejects({});
      return expect(stagingWorkflow(TARGET_PATH)).to.eventually.be.rejected;
    });

    it('is rejected when applyMinPack() rejects', () => {
      stub = sinon.stub(RuntimeBin.prototype, 'applyMinPack').rejects({});
      return expect(stagingWorkflow(TARGET_PATH)).to.eventually.be.rejected;
    });

    it('is rejected when checkMinPack() rejects', () => {
      stub = sinon.stub(StagingBin.prototype, 'checkMinPack').rejects({});
      return expect(stagingWorkflow(TARGET_PATH)).to.eventually.be.rejected;
    });

    it('is rejected when minifyBin() rejects', () => {
      stub = sinon.stub(StagingBin.prototype, 'minifyBin').rejects({});
      return expect(stagingWorkflow(TARGET_PATH)).to.eventually.be.rejected;
    });
  });
});
