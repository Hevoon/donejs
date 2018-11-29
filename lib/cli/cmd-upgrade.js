var utils = require("../utils");
var spawn = require('cross-spawn-async');
var donejsVersion = require('../../package.json').version;
var path = require("path");

// Maps donejs versions to canjs versions
var canjsVersionMap = {
  "2": "4",
  "3": "5"
};

module.exports = function(version, options) {
  var requestedVersion = version || utils.versionRange(donejsVersion);

  var packageJsonPromise = rootPackageJson();
  var donejscliPackageJsonPromise = getDonejsCliPackageForRange(requestedVersion);

  return Promise.all([ donejscliPackageJsonPromise, packageJsonPromise ])
  .then(function(results){
    var cliPkg = results[0];
    var handle = results[1];

    var donejs = cliPkg.donejs;
    var projectRoot = handle.root;

    var pkg = handle.get();

    Object.assign(pkg.dependencies, donejs.dependencies);
    Object.assign(pkg.devDependencies, donejs.devDependencies);

    handle.write(pkg);

    // Run npm install to get the newest versions
    return utils.spawn("npm", ["install"]).then(function(){
      return projectRoot;
    });
  })
  .then(function(projectRoot){
    if(options.canmigrate) {
      return installCanMigrate()
      .then(function(){
        return runCanMigrate(projectRoot, requestedVersion);
      });
    }
  });
};

function rootPackageJson() {
  return utils.projectRoot().then(function(root){
    var packagePath = path.join(root, "package.json");
    return {
      root: root,
      get: function(){
        return require(packagePath);
      },
      write: function(newPackage){
        var json = JSON.stringify(newPackage, null, " ");
        require("fs").writeFileSync(packagePath, json, "utf8");
      }
    };
  });
}

function getDonejsCliPackageForRange(versionRange) {
  return new Promise(function(resolve, reject){
    var child = spawn("npm", ["info", "--json", "donejs-cli@" + versionRange]);
    var json = "";
    child.stdout.on("data", function(data){
      json += data.toString();
    });
    child.on("exit", function(status){
      if(status === 1) {
        reject();
      } else {
        try {
          var data = JSON.parse(json);
          resolve(data[data.length - 1] || data);
        } catch(err) {
          reject(err);
        }
      }
    });
  });
}

function installCanMigrate() {
  return utils.spawn("npm", ["install", "--no-save", "can-migrate"]);
}

function runCanMigrate(projectRoot, requestedDonejsVersion) {
  var donejsMajor = getMajorVersion(requestedDonejsVersion) ||
    getMajorVersion(donejsVersion);
  var canjsVersion = canjsVersionMap[donejsMajor];
  if(canjsVersion) {
    var canMigratePath = path.join(projectRoot, 'node_modules', '.bin', "can-migrate");
    var args = [canMigratePath, "**/*.*", "--apply", "--can-version",
      canjsVersion.toString(), "--force"];
    return utils.spawn("node", args);
  }
  return Promise.resolve();
}

function getMajorVersion(versionRange) {
  var index = 0, len = versionRange.length;
  var numExp = /[1-9]/;
  var vers = "";
  while(index < len) {
    var char = versionRange[index];
    if(numExp.test(char)) {
      vers += char;
    }
    // Break the first time we get a non-number after having gotten at least one
    else if(vers.length) {
      break;
    }
    index++;
  }
  return vers;
}
