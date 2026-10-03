const { version } = require('../package.json');

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!semverPattern.test(version)) {
  console.error(`Invalid Semantic Versioning value in package.json: ${version}`);
  process.exitCode = 1;
} else {
  console.log(`Valid release version: v${version}`);
}
