/* eslint-env mocha */
'use strict';

const path = require('path');

exports.prepareFs = (shouldMock, myPath) => {
  if (shouldMock) {
    const mockFs = require('mock-fs');

    beforeEach(() => {
      mockFs({
        [myPath]: {
          'duplicate.txt': 'abc',
          'hardlink.txt': 'abc',
          'hardlink2.txt': 'abc',
          'regular_file.txt': 'abc',
          'softlink.txt': mockFs.symlink({
            path: 'regular_file.txt'
          }),
          'folder': {
            'unique.txt': 'xyz',
          },
        },
      });
    });

    after(() => {
      mockFs.restore();
    });
  } else {
    beforeEach((done) => {
      const fs = require('fs');
      const fse = require('fs-extra');
      const tar = require('tar-fs');

      const TAR_FILENAME = path.resolve(__dirname, '..', 'data', 'mock-bin.tar');

      fse.ensureDirSync(myPath);

      fs.createReadStream(TAR_FILENAME)
        .pipe(tar.extract(myPath))
        .on('finish', done);
    });
  }
};
