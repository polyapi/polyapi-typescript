"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSnippet = void 0;
var fs_1 = require("fs");
var util_1 = require("util");
var chalk_1 = require("chalk");
var shelljs_1 = require("shelljs");
var api_1 = require("../api");
var utils_1 = require("../utils");
var readFile = (0, util_1.promisify)(fs_1.default.readFile);
var languageFormatMap = {
    javascript: ['js', 'ts', 'mjs'],
    java: ['java'],
    python: ['py'],
};
var addSnippet = function (polyPath, name, path, context, description) { return __awaiter(void 0, void 0, void 0, function () {
    var code, language, error_1, fileFormat, _i, _a, _b, currentLanguage, formats, response, error_2, httpStatusCode, errMessage, finalMessage, messages;
    var _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                code = '';
                language = '';
                _f.label = 1;
            case 1:
                _f.trys.push([1, 3, , 4]);
                return [4 /*yield*/, readFile(path, { encoding: 'utf-8' })];
            case 2:
                code = _f.sent();
                return [3 /*break*/, 4];
            case 3:
                error_1 = _f.sent();
                throw new Error('File does not exist.');
            case 4:
                fileFormat = path.split('.').pop();
                for (_i = 0, _a = Object.entries(languageFormatMap); _i < _a.length; _i++) {
                    _b = _a[_i], currentLanguage = _b[0], formats = _b[1];
                    if (formats.includes(fileFormat)) {
                        language = currentLanguage;
                        break;
                    }
                }
                _f.label = 5;
            case 5:
                _f.trys.push([5, 7, , 8]);
                shelljs_1.default.echo('Adding snippet...');
                return [4 /*yield*/, (0, api_1.upsertSnippet)({
                        name: name,
                        context: context,
                        description: description || undefined,
                        code: code,
                        language: language,
                    })];
            case 6:
                response = _f.sent();
                shelljs_1.default.echo("".concat(chalk_1.default.greenBright('Success:')), 'Snippet successfully added.');
                shelljs_1.default.echo("Snippet ID: ".concat(response.data.id));
                (0, utils_1.upsertResourceInSpec)(polyPath, {
                    updated: response.status === 200,
                    resourceId: response.data.id,
                    resourceName: 'snippet',
                });
                return [3 /*break*/, 8];
            case 7:
                error_2 = _f.sent();
                httpStatusCode = (_c = error_2.response) === null || _c === void 0 ? void 0 : _c.status;
                errMessage = (_e = (_d = error_2.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.message;
                finalMessage = '';
                if (httpStatusCode === 400) {
                    messages = Array.isArray(error_2.response.data.message) ? error_2.response.data.message : ["Failed with status code ".concat(chalk_1.default.redBright(400))];
                    finalMessage = messages[0];
                }
                else if (httpStatusCode) {
                    finalMessage = errMessage;
                }
                else {
                    finalMessage = error_2.message;
                }
                shelljs_1.default.echo("".concat(chalk_1.default.redBright('Error:')), finalMessage);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); };
exports.addSnippet = addSnippet;
