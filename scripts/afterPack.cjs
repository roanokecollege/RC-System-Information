const { execSync } = require("child_process");

exports.default = async ({ appOutDir }) => {
  console.log("Stripping xattrs from", appOutDir);
  execSync(`xattr -cr "${appOutDir}"`);
};
