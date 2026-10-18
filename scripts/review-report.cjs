const path = require('node:path');
const {reviewRunReport} = require('../dist/report');
const relative = process.argv[2];
if (process.argv.length !== 3 || typeof relative !== 'string') {
  process.stdout.write(JSON.stringify({status:'BLOCKED',reason:'REPORT_PATH_UNSAFE'})+'\n');
  process.exitCode = 2;
} else {
  reviewRunReport(path.resolve(__dirname,'..'),relative).then(result => {
    process.stdout.write(JSON.stringify(result)+'\n');
  }, () => {
    process.stdout.write(JSON.stringify({status:'BLOCKED',reason:'REPORT_RESULT_INVALID'})+'\n');
    process.exitCode = 2;
  });
}
