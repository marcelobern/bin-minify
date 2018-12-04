# bin-minify
[![NPM Version](https://img.shields.io/npm/v/bin-minify.svg)](https://www.npmjs.com/package/bin-minify)
[![Build Status](https://travis-ci.org/botbits/bin-minify.svg?branch=master)](https://travis-ci.org/botbits/bin-minify)
[![Coverage Status](https://coveralls.io/repos/github/botbits/bin-minify/badge.svg?branch=master)](https://coveralls.io/github/botbits/bin-minify?branch=master)
[![Known Vulnerabilities](https://snyk.io/test/github/botbits/bin-minify/badge.svg?targetFile=package.json)](https://snyk.io/test/github/botbits/bin-minify?targetFile=package.json)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fmarcelobern%2Fbin-minify.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fmarcelobern%2Fbin-minify?ref=badge_shield)

> Add non-standard binaries to your projects.


## Stable Release

You are reading the documentation for the stable release of bin-minify, 0.1.0. Please see [CHANGELOG](CHANGELOG.md) and make sure to read [UPGRADING](UPGRADING.md) when upgrading from a previous version.


## Overview

This module reduces the size of binaries by removing hard/soft links and duplicate files, in a step called *staging*. Once the binaries are *staged* they are packed (e.g. npm module, AWS Lambda) and deployed. At *run-time* links are created to rebuild the file system structure before the binaries are used.

This is specially important when needing to *zip* your files, as hard/soft links are not preserved (but replicated) by zipping them.


## Other Uses

While bin-minify was originally created to address use cases involving binaries, its current implementation allows it to be used to solve other use cases (e.g. photo management).

[Please open an issue](https://github.com/botbits/bin-minify/issues) with suggestions on how to use bin-minify to address additional use cases.


## Install

```
$ npm install --save bin-minify
```


## Usage

### Streamlined Staging

It is typically preferred to use the streamlined staging in conjunction with `gulp` or `grunt`.

The following `gulp` task will analyze all binaries under `./bin/my-bin`, save the resulting ***minPack*** to `./.bin-minify/my-bin.json`, and remove any redundant binaries from `./bin/my-bin`.

```js
const gulp = require('gulp');
const file = require('gulp-file');
const path = require('path');
const stagingWorkflow = require('bin-minify').stagingWorkflow;

gulp.task('default', async (done) => {
  stagingWorkflow(path.resolve(__dirname, path.join('bin', 'my-bin'))).then(minPack => {
    file('my-bin.json', JSON.stringify(minPack, null, ' '), {src: true})
      .pipe(gulp.dest('.bin-minify'));
    done();
  }, error => {
    console.error(`Could not create minPack: ${error}`);
    done();
  });
});
```

### Staging

Before using bin-minify the binaries (e.g. from a tar file or a build from source (maybe from [`bin-build`](https://www.npmjs.com/package/bin-build)) should be placed in the desired destination (typically `vendor` or `bin` folders).

With the binaries in place, they now should be analyzed, creating their *minimal* link representation (a.k.a. ***minPack***) for future use (at *run-time*).

```js
const path = require('path');
const StagingBin = require('bin-minify').StagingBin;
const BIN_PATH = path.resolve(__dirname, path.join('bin', 'bin-minify'));

var stagingBin = new StagingBin({
    targetPath: BIN_PATH,
});

stagingBin.createMinPack().then(result => {
  // result should be persisted in a source controlled file for future use
}, error => {
  // something went wrong
});
```

Before removing the "*extra baggage*" from the binaries analyzed, it is recommended to check that the link representation provided correctly rebuilds the original file system structure of the binaries.

```js
const RuntimeBin = require('bin-minify').RuntimeBin;

const fromBase = path.join('/', 'tmp', 'bin-minify');

var runtimeBin = new RuntimeBin({
  targetPath: BIN_PATH,
  minPack: require('MY_MIN_PACK_FILE'),
  useSymlinks: true,
});

runtimeBin.applyMinPack(fromBase).then(result => {
  // link structure was created or fromBase already exists will "diff" both
  stagingBin.checkMinPack(fromBase).then(result => {
    if (result.length > 0) // folders are different, check the original binaries for empty folders
    else // folders match, it is safe to clean up the original binaries
  }, error => {
    // checkMinPack() failed
  });
}, error => {
  // applyMinPack() failed
});
```

Once all looks good (folders match) it is time to remove all unnecessary files from the original binary folder.

```js
const sendToTrash = false;
stagingBin.minifyBin(sendToTrash).then(result => {
  // redundant files were removed from the original binary folder
}, error => {
  // minifyBin() failed
});
```

**Note**: If you plan to create a npm package, [avoid packaging undesired files](https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish) (e.g. tar/zip files) by using `files` section in your `package.json`.

The sample `files` section below assumes your links representation is stored in the `.bin-minify` folder and you binaries and in the `bin` folder.

```json
"files": [
  "/.bin-minify",
  "/bin",
  "other source code locations"
],
```

### Run-time

Use the link representation generated during *staging* to rebuild the file system structure before invoking the binaries.

```js
const RuntimeBin = require('bin-minify').RuntimeBin;

const fromBase = path.join('/', 'tmp', 'bin-minify');

var runtimeBin = new RuntimeBin({
  targetPath: BIN_PATH,
  minPack: require('MY_MIN_PACK_FILE'),
  useSymlinks: true,
});

runtimeBin.applyMinPack(fromBase).then(result => {
  // link structure is ready or fromBase already exists
  // Time to configure PATH and any other environment variables
}, error => {
  // applyMinPack() failed
});
```

Consider using [lambda-bin](https://www.npmjs.com/package/lambda-bin) for a smaller module footprint and environment variable helper functions.


## API

## StagingBin

### constructor (options)
```javascript
Object new StagingBin( Object )
```

#### options

- Type: `Object`
- Optional

The following are supported keys in the `options` JSON object. Any other keys are ignored.

##### targetPath

- Type: `string`
- Default: `./bin/bin-minify`

Location of the actual binaries.

**Note**: Typically the binaries under `targetPath` are source controlled (and should be included in the npm module or Lambda package).

##### relativeSymlinks

- Type: `boolean`
- Default: `true`

If `true`, the symlinks found will be interpreted as relative to their current location.

If `false` the symlinks found will be interpreted as absolute paths.

##### minPack

- Type: `Object`
- Default: `{}`

Used to *load* a previously created ***minPack***.

**Note**: `minPack` is particularly useful for integrating the various *staging* steps into your workflow (e.g. using gulp or grunt) and for internal bin-minify testing.

### Promise stagingBin.createMinPack ()

Analyzes all files under `stagingBin.targetPath` to create their ***minPack***.

#### returns Promise

Resolved Promise: ***minPack*** JSON.

**Note**: It is recommended to store this ***minPack*** JSON to a source controlled file for future use.

Rejected Promise: `{ error }`.

### Promise stagingBin.checkMinPack (linksPath)

#### linksPath

- Type: `string`
- Default: `/tmp/bin-minify`

Compares the files under `linksPath` to the ones under `stagingBin.targetPath`.

**Note**: To check if the ***minPack*** is correct, the files under `linksPath` should be created by invoking `runtimeBin.applyMinPack(linksPath)` before `stagingBin.checkMinPack()`.

#### returns Promise

Resolved Promise: `Array` compliant with the [`fs-tree-diff.calculatePatch()` format](https://www.npmjs.com/package/fs-tree-diff).

Rejected Promise: `{ error }`.

### Promise stagingBin.minifyBin (sendToTrash)

#### sendToTrash

- Type: `boolean`
- Default: `false`

If `true`, all redundant files under `stagingBin.targetPath` will be removed by sending them to the trash.

If `false`, all redundant files under `stagingBin.targetPath` will be permanently removed.

#### returns Promise

Resolved Promise: `Object` as follows:

```json
{
  "delCount": "number of files removed",
  "files": [
    [
      "full path of file removed",
      "full path of file removed",
    ],
    []
  ]
}
```

Rejected Promise: `{ error }`.

## RuntimeBin

### constructor (options)
```javascript
Object new RuntimeBin( Object )
```

#### options

- Type: `Object`
- Optional

The following are supported keys in the `options` JSON object. Any other keys are ignored.

##### targetPath

- Type: `string`
- Default: `./bin/bin-minify`

Location of the actual binaries.

**Note**: Typically the binaries under `targetPath` are source controlled (and should be included in the npm module or Lambda package).

##### useSymlinks

- Type: `boolean`
- Default: `true`

If `true`, invoking `runtimeBin.applyMinPack()` will create symlinks (a.k.a. soft links).

If `false`, invoking `runtimeBin.applyMinPack()` will create hard links.

##### minPack

- Type: `Object`
- Default: `{}`

Used to *load* a previously created ***minPack***.

### Promise runtimeBin.applyMinPack (fromBase)

#### fromBase

- Type: `string`
- Required

Base path where the original file structure of the binaries will be recreated.

#### returns Promise

Resolved Promise: `{ loaded: true or false }`. `loaded` will be:
- `true` if the file structure was successfully created.
- `false` if the `fromBase` path already existed.

Rejected Promise: `{ error }`.

## Promise stagingWorkflow (targetPath, minifyBinOptions)

### targetPath

- Type: `string`
- Default: `./bin/bin-minify`

Location of the actual binaries.

**Note**: Typically the binaries under `targetPath` are source controlled (and should be included in the npm module or Lambda package).

### minifyBinOptions

- Type: `Object`
- Optional

The following are supported keys in the `minifyBinOptions` JSON object. Any other keys are ignored.

#### dryRun

- Type: `boolean`
- Default: `false`

If `true`, will not remove redundant files under `targetPath`.

If `false`, redundant files under `targetPath` will be handled according to `minifyBinOptions.sendToTrash`.

#### strict

- Type: `boolean`
- Default: `false`

If `true`, will only remove redundant files under `targetPath` if no difference exists between original and reconstructed binaries.

If `false`, will only remove redundant files under `targetPath` if only difference between original and reconstructed binaries are empty folders.

#### sendToTrash

- Type: `boolean`
- Default: `false`

If `true`, all redundant files under `targetPath` will be removed by sending them to the trash.

If `false`, all redundant files under `targetPath` will be permanently removed.

### returns Promise

Resolved Promise: ***minPack*** JSON.

**Note**: It is recommended to store this ***minPack*** JSON to a source controlled file for future use.

Rejected Promise: `{ error }`.


## Performance

The *run-time* code has been tuned to speed up its operation.

Check out this [sample](https://github.com/botbits/lambda-bin-perf#readme) (uses [serverless](https://www.npmjs.com/package/serverless) & [artillery](https://www.npmjs.com/package/artillery)) if you are interested in checking the bin-minify & lambda-bin performance impact to your code.


## License

MIT © [BotBits<sup>SM</sup>](https://github.com/botbits)


[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fmarcelobern%2Fbin-minify.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fmarcelobern%2Fbin-minify?ref=badge_large)