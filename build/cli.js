#!/usr/bin/env node
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
/* tslint:disable:no-shadowed-variable */
var yargs_1 = require("yargs");
var shelljs_1 = require("shelljs");
var chalk_1 = require("chalk");
var uuid_1 = require("uuid");
var config_1 = require("./config");
var constants_1 = require("./constants");
var utils_1 = require("./utils");
if (process.env.NO_COLOR) {
    // Support NO_COLOR env variable https://no-color.org/
    chalk_1.default.level = 0;
}
var checkPolyConfig = function (polyPath) {
    (0, config_1.loadConfig)(polyPath);
    if (!process.env.POLY_API_KEY) {
        return false;
    }
    return true;
};
void yargs_1.default
    .usage('$0 <cmd> [args]')
    .command('setup [baseUrl] [apiKey]', 'Setups your Poly connection', function (yargs) {
    return yargs
        .positional('baseUrl', {
        describe: 'The base URL for the Poly connection',
        type: 'string',
    })
        .positional('apiKey', {
        describe: 'Your Poly API key for authentication',
        type: 'string',
    })
        .option('apiVersion', {
        describe: 'The version of the API to use.',
        type: 'string',
        choices: ['1', '2'],
        default: '1',
    });
}, function (argv) { return __awaiter(void 0, void 0, void 0, function () {
    var setup;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/setup'); })];
            case 1:
                setup = (_a.sent()).default;
                return [4 /*yield*/, setup(constants_1.DEFAULT_POLY_PATH, argv.baseUrl, argv.apiKey, argv.apiVersion)];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); })
    .command('generate [options]', 'Generates Poly library', function (yargs) {
    return yargs.parserConfiguration({ 'boolean-negation': false }).options({
        contexts: {
            describe: 'Contexts to generate',
            demandOption: false,
            type: 'string',
        },
        names: {
            describe: 'Names to generate',
            demandOption: false,
            type: 'string',
        },
        functionIds: {
            describe: 'Function IDs to generate',
            demandOption: false,
            type: 'string',
        },
        customPath: {
            describe: 'Custom path to .poly directory (internal use only)',
            demandOption: false,
            type: 'string',
        },
        noTypes: {
            describe: 'Skip generating type definitions',
            demandOption: false,
            type: 'boolean',
            alias: 'no-types',
        },
    });
}, function (_a) {
    var exitWhenNoConfig = _a.exitWhenNoConfig, contexts = _a.contexts, names = _a.names, functionIds = _a.functionIds, _b = _a.customPath, customPath = _b === void 0 ? constants_1.DEFAULT_POLY_PATH : _b, _c = _a.noTypes, noTypes = _c === void 0 ? false : _c;
    return __awaiter(void 0, void 0, void 0, function () {
        var setup, generate;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!!checkPolyConfig(customPath)) return [3 /*break*/, 3];
                    if (exitWhenNoConfig) {
                        shelljs_1.default.echo('Poly is not configured. Please run `poly generate` manually.');
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/setup'); })];
                case 1:
                    setup = (_d.sent()).default;
                    return [4 /*yield*/, setup(customPath)];
                case 2:
                    _d.sent();
                    _d.label = 3;
                case 3: return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/generate'); })];
                case 4:
                    generate = (_d.sent()).generate;
                    return [4 /*yield*/, generate({
                            polyPath: customPath,
                            contexts: contexts === null || contexts === void 0 ? void 0 : contexts.split(','),
                            names: names === null || names === void 0 ? void 0 : names.split(','),
                            functionIds: functionIds === null || functionIds === void 0 ? void 0 : functionIds.split(','),
                            noTypes: noTypes,
                        })];
                case 5:
                    _d.sent();
                    return [2 /*return*/];
            }
        });
    });
})
    .command('prepare [options]', 'Find and prepare all Poly deployables', function (yargs) {
    return yargs
        .usage('$0 prepare [options]')
        .option('lazy', {
        describe: 'Skip prepare work if the cache is up to date. (Relies on `git`)',
        type: 'boolean',
        default: false,
    })
        .option('disable-docs', {
        describe: 'Don\'t write any JSDocs into the deployable files.',
        type: 'boolean',
        default: false,
    })
        .option('disable-ai', {
        describe: 'Don\'t use AI to fill in any missing descriptions.',
        type: 'boolean',
        default: false,
    });
}, function (_a) {
    var disableDocs = _a.disableDocs, disableAi = _a.disableAi, lazy = _a.lazy;
    return __awaiter(void 0, void 0, void 0, function () {
        var prepareDeployables;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!checkPolyConfig(constants_1.DEFAULT_POLY_PATH)) {
                        return [2 /*return*/, shelljs_1.default.echo('Poly is not configured. Please run `poly setup` to configure it.')];
                    }
                    disableAi = disableAi || process.env.DISABLE_AI === 'true';
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/prepare'); })];
                case 1:
                    prepareDeployables = (_b.sent()).prepareDeployables;
                    return [4 /*yield*/, prepareDeployables(lazy, disableDocs, disableAi)];
                case 2:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    });
})
    .command('sync [options]', 'Find and sync all Poly deployables', function (yargs) {
    return yargs
        .usage('$0 sync [options]')
        .option('dry-run', {
        describe: 'Run through sync steps with logging but don\'t make any changes.',
        type: 'boolean',
        default: false,
    })
        .option('custom-path', {
        describe: 'Custom path to .poly directory (internal use only)',
        default: constants_1.DEFAULT_POLY_PATH,
        type: 'string',
    });
}, function (_a) {
    var dryRun = _a.dryRun, _b = _a.customPath, customPath = _b === void 0 ? constants_1.DEFAULT_POLY_PATH : _b;
    return __awaiter(void 0, void 0, void 0, function () {
        var prepareDeployables, syncDeployables;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!checkPolyConfig(customPath)) {
                        return [2 /*return*/, shelljs_1.default.echo('Poly is not configured. Please run `poly setup` to configure it.')];
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/prepare'); })];
                case 1:
                    prepareDeployables = (_c.sent()).prepareDeployables;
                    // At this point everything should already be prepared
                    // So we're not going to add anything other than deployment receipts
                    return [4 /*yield*/, prepareDeployables(true, // lazy!
                        true, // don't write JSDocs
                        true)];
                case 2:
                    // At this point everything should already be prepared
                    // So we're not going to add anything other than deployment receipts
                    _c.sent();
                    shelljs_1.default.echo('Syncing Poly deployments...');
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/sync'); })];
                case 3:
                    syncDeployables = (_c.sent()).syncDeployables;
                    return [4 /*yield*/, syncDeployables(dryRun)];
                case 4:
                    _c.sent();
                    shelljs_1.default.echo('Poly deployments synced.');
                    return [2 /*return*/];
            }
        });
    });
})
    .command('function <command>', 'Manages functions', function (yargs) {
    yargs.command('add <name> <file> [options]', 'Adds a custom function', function (yargs) {
        return yargs
            .usage('$0 function add <name> <file> (--server | --client) [options]')
            .default('context', '')
            .positional('name', {
            describe: 'Name of the function',
            type: 'string',
        })
            .positional('file', {
            describe: 'Path to the function TS file',
            type: 'string',
        })
            .option('context', {
            describe: 'Context of the function',
            type: 'string',
        })
            .option('description', {
            describe: 'Description of the function',
            type: 'string',
        })
            .option('client', {
            describe: 'Marks the function as a client function',
            type: 'boolean',
        })
            .option('server', {
            describe: 'Marks the function as a server function',
            type: 'boolean',
        })
            .option('logs', {
            describe: 'Server function only - `--logs=enabled` or `--logs=disabled` to enable to disable logging respectively',
            type: 'string',
        })
            .option('generateContexts', {
            describe: 'Server function only - only include certain contexts to speed up function execution',
            type: 'string',
        })
            .option('execution-api-key', {
            describe: 'Optional API key for server functions',
            type: 'string',
        });
    }, function (_a) {
        var name = _a.name, description = _a.description, file = _a.file, context = _a.context, client = _a.client, server = _a.server, logs = _a.logs, generateContexts = _a.generateContexts, executionApiKey = _a.executionApiKey;
        return __awaiter(void 0, void 0, void 0, function () {
            var logsEnabled, err, addOrUpdateCustomFunction;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        logsEnabled = logs === 'enabled' ? true : logs === 'disabled' ? false : undefined;
                        err = !name
                            ? 'Missing function name.'
                            : !file
                                ? 'Missing function file path.'
                                : (!client && !server)
                                    ? 'You must specify `--server` or `--client`.`'
                                    : (client && server)
                                        ? 'Specify either `--server` or `--client`. Found both.'
                                        : (generateContexts && !server)
                                            ? 'Option `generateContexts` is only for server functions (--server).'
                                            : (logs && !server)
                                                ? 'Option `logs` is only for server functions (--server).'
                                                : (logs && logsEnabled === undefined)
                                                    ? 'Invalid value for `logs` option.'
                                                    : (executionApiKey && !(0, uuid_1.validate)(executionApiKey))
                                                        ? 'Invalid value for `execution-api-key`. Must be a valid PolyAPI Key.'
                                                        : '';
                        if (err) {
                            shelljs_1.default.echo(chalk_1.default.redBright('ERROR:'), err);
                            yargs.showHelp();
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/function'); })];
                    case 1:
                        addOrUpdateCustomFunction = (_b.sent()).addOrUpdateCustomFunction;
                        return [4 /*yield*/, addOrUpdateCustomFunction(constants_1.DEFAULT_POLY_PATH, context, name, description, file, server, logsEnabled, generateContexts, executionApiKey)];
                    case 2:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    });
})
    .command('tenant <command>', 'Manages tenants', function (yargs) {
    yargs.command('create [options]', 'Creates a new tenant', {
        instance: {
            describe: 'Instance where you want to create tenant (develop | na1 | local)',
            demandOption: false,
            type: 'string',
        },
    }, function (_a) {
        var _b = _a.instance, instance = _b === void 0 ? 'na1' : _b;
        return __awaiter(void 0, void 0, void 0, function () {
            var create;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/tenant'); })];
                    case 1:
                        create = (_c.sent()).create;
                        return [4 /*yield*/, create(instance)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        });
    });
})
    .command('model <command>', 'Manages models.', function (yargs) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        yargs.command('generate <path> [destination] [options]', 'Generates a new model.', function (yargs) { return yargs.positional('path', {
            type: 'string',
            demandOption: true,
            describe: 'Path to open api specification file.',
        }).positional('destination', {
            type: 'string',
            describe: 'Path to destination poly schema file.',
            demandOption: false,
        }).option('context', {
            describe: 'Context for all api functions.',
            type: 'string',
        }).option('hostUrl', {
            describe: 'Hardcode the hostUrl to use for all api functions. Leave undefined to use the server url specified in the specification file, if one is specified.',
            type: 'string',
        }).option('hostUrlAsArgument', {
            describe: 'Require the host url as an argument to be passed in when calling an api function. Value passed in will be used as the argument name, or if left empty will default to "hostUrl".',
            type: 'string',
        }).options('disable-ai', {
            describe: 'Disable ai generation.',
            boolean: true,
        })
            .options('rename', {
            describe: 'List of name mappings, ex. `--rename foo:bar "Old key:New key"` would rename all instances of "foo" with "bar" and "Old key" with "New key".',
            type: 'array',
        }); }, function (_a) {
            var path = _a.path, destination = _a.destination, context = _a.context, hostUrl = _a.hostUrl, hostUrlAsArgument = _a.hostUrlAsArgument, disableAi = _a.disableAi, _b = _a.rename, rename = _b === void 0 ? [] : _b;
            return __awaiter(void 0, void 0, void 0, function () {
                var preparedRenames, _i, rename_1, mappings, _c, _d, prevName, _e, newName, generateModel;
                return __generator(this, function (_f) {
                    switch (_f.label) {
                        case 0:
                            if (!checkPolyConfig(constants_1.DEFAULT_POLY_PATH)) {
                                return [2 /*return*/, shelljs_1.default.echo('Poly is not configured. Please run `poly setup` to configure it.')];
                            }
                            if (!path) {
                                yargs.showHelp();
                                return [2 /*return*/];
                            }
                            if (hostUrl && !(0, utils_1.isValidHttpUrl)(hostUrl)) {
                                return [2 /*return*/, shelljs_1.default.echo("".concat(hostUrl, " is not a valid url"))];
                            }
                            preparedRenames = [];
                            for (_i = 0, rename_1 = rename; _i < rename_1.length; _i++) {
                                mappings = rename_1[_i];
                                _c = "".concat(mappings).split(':'), _d = _c[0], prevName = _d === void 0 ? '' : _d, _e = _c[1], newName = _e === void 0 ? '' : _e;
                                if (!prevName || !newName) {
                                    shelljs_1.default.echo(chalk_1.default.redBright('ERROR:'), "Invalid rename mapping from \"".concat(prevName, "\" to \"").concat(newName, "\"."));
                                    yargs.showHelp();
                                    return [2 /*return*/];
                                }
                                preparedRenames.push([prevName, newName]);
                            }
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/model'); })];
                        case 1:
                            generateModel = (_f.sent()).generateModel;
                            return [4 /*yield*/, generateModel(path, destination, context, hostUrl, hostUrlAsArgument, !!disableAi, preparedRenames)];
                        case 2:
                            _f.sent();
                            return [2 /*return*/];
                    }
                });
            });
        }).command('validate <path>', 'Validates a Poly model', {
            path: {
                type: 'string',
                demandOption: true,
                describe: 'Path to Poly model file.',
            },
        }, function (_a) {
            var path = _a.path;
            return __awaiter(void 0, void 0, void 0, function () {
                var validateModel;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!checkPolyConfig(constants_1.DEFAULT_POLY_PATH)) {
                                return [2 /*return*/, shelljs_1.default.echo('Poly is not configured. Please run `poly setup` to configure it.')];
                            }
                            if (!path) {
                                yargs.showHelp();
                                return [2 /*return*/];
                            }
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/model'); })];
                        case 1:
                            validateModel = (_b.sent()).validateModel;
                            validateModel(path);
                            return [2 /*return*/];
                    }
                });
            });
        }).command('train <path>', 'Train generated Poly model.', {
            path: {
                type: 'string',
                demandOption: true,
                describe: 'Path to Poly model file.',
            },
        }, function (_a) {
            var path = _a.path;
            return __awaiter(void 0, void 0, void 0, function () {
                var train;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!checkPolyConfig(constants_1.DEFAULT_POLY_PATH)) {
                                return [2 /*return*/, shelljs_1.default.echo('Poly is not configured. Please run `poly setup` to configure it.')];
                            }
                            if (!path) {
                                yargs.showHelp();
                                return [2 /*return*/];
                            }
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/model'); })];
                        case 1:
                            train = (_b.sent()).train;
                            return [4 /*yield*/, train(constants_1.DEFAULT_POLY_PATH, path)];
                        case 2:
                            _b.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        return [2 /*return*/];
    });
}); })
    .command('snippet <command>', 'Manage snippets.', function (yargs) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        yargs.command('add <name> <path> [options]', 'Adds a new snippet.', function (yargs) { return yargs.positional('name', {
            type: 'string',
            demandOption: true,
            describe: 'Snippet name.',
        }).positional('path', {
            type: 'string',
            demandOption: true,
            describe: 'Path to destination that contains snippet.',
        }).option('context', {
            type: 'string',
            describe: 'Assign a context to this snippet',
        }).option('description', {
            type: 'string',
            describe: 'Assign a description to this snippet',
        }); }, function (_a) {
            var name = _a.name, path = _a.path, context = _a.context, description = _a.description;
            return __awaiter(void 0, void 0, void 0, function () {
                var addSnippet;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!checkPolyConfig(constants_1.DEFAULT_POLY_PATH)) {
                                return [2 /*return*/, shelljs_1.default.echo('Poly is not configured. Please run `poly setup` to configure it.')];
                            }
                            if (!path) {
                                yargs.showHelp();
                                return [2 /*return*/];
                            }
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('./commands/snippet'); })];
                        case 1:
                            addSnippet = (_b.sent()).addSnippet;
                            return [4 /*yield*/, addSnippet(constants_1.DEFAULT_POLY_PATH, name, path, context || '', description || '')];
                        case 2:
                            _b.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        return [2 /*return*/];
    });
}); })
    // Use strict parsing so unrecognized commands or options will raise an error rather than fail silently
    .strict(true)
    .showHelpOnFail(true, 'Specify --help for available commands and options.')
    .help(true).argv;
