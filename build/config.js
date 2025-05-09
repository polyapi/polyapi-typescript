"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveConfig = exports.loadConfig = void 0;
var fs_1 = require("fs");
var dotenv_1 = require("dotenv");
var getPolyConfigDirPath = function (polyPath) {
    // If path does not start with `./` or `/` then we adjust!
    return /^\.?\/.*/.test(polyPath) ? polyPath : "".concat(__dirname, "/../../../../../").concat(polyPath);
};
var getPolyConfigFilePath = function (polyPath) {
    return "".concat(getPolyConfigDirPath(polyPath), "/.config.env");
};
var loadConfig = function (polyPath) {
    var configFilePath = getPolyConfigFilePath(polyPath);
    if (fs_1.default.existsSync(configFilePath)) {
        dotenv_1.default.config({ path: configFilePath, override: process.env.CONFIG_ENV_PATH_PRIORITY === 'true' });
    }
};
exports.loadConfig = loadConfig;
var saveConfig = function (polyPath, config) {
    fs_1.default.mkdirSync(getPolyConfigDirPath(polyPath), { recursive: true });
    fs_1.default.writeFileSync(getPolyConfigFilePath(polyPath), Object.entries(config)
        .map(function (_a) {
        var key = _a[0], value = _a[1];
        return "".concat(key, "=").concat(value);
    })
        .join('\n'));
};
exports.saveConfig = saveConfig;
