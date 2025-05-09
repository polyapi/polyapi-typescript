"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDeployable = exports.parseDeployComment = exports.generateTypeSchemas = exports.getDependencies = exports.getTSBaseUrl = exports.getTSConfig = void 0;
var fs_1 = require("fs");
var chalk_1 = require("chalk");
var shelljs_1 = require("shelljs");
var typescript_1 = require("typescript");
var TJS = require("typescript-json-schema");
var transpiler_1 = require("@poly/common/transpiler");
var path_1 = require("path");
var deployables_1 = require("./deployables");
var os_1 = require("os");
var crypto_1 = require("crypto");
var getTSConfig = function () {
    var tsConfig = typescript_1.default.findConfigFile('./', typescript_1.default.sys.fileExists, 'tsconfig.json');
    if (tsConfig) {
        return typescript_1.default.readConfigFile(tsConfig, typescript_1.default.sys.readFile).config;
    }
    return {};
};
exports.getTSConfig = getTSConfig;
var getTSBaseUrl = function (config) {
    var _a;
    if (config === void 0) { config = (0, exports.getTSConfig)(); }
    return ((_a = config.compilerOptions) === null || _a === void 0 ? void 0 : _a.baseUrl) || undefined;
};
exports.getTSBaseUrl = getTSBaseUrl;
var loadTsSourceFile = function (filePath) {
    var fileContent = fs_1.default.readFileSync(filePath, 'utf8');
    var sourceFile = typescript_1.default.createSourceFile(filePath, fileContent, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    return sourceFile;
};
var getDependencies = function (code, fileName, baseUrl) {
    var importedLibraries = new Set();
    var compilerOptions = {
        module: typescript_1.default.ModuleKind.CommonJS,
        esModuleInterop: true,
        noImplicitUseStrict: true,
        baseUrl: baseUrl,
    };
    var compilerHost = typescript_1.default.createCompilerHost(compilerOptions);
    typescript_1.default.transpileModule(code, {
        compilerOptions: compilerOptions,
        transformers: {
            before: [
                function (context) {
                    return function (sourceFile) {
                        var visitor = function (node) {
                            if (typescript_1.default.isImportDeclaration(node)) {
                                var moduleName = node.moduleSpecifier.text;
                                var resolvedModule = typescript_1.default.resolveModuleName(moduleName, fileName, compilerOptions, compilerHost);
                                if (resolvedModule.resolvedModule) {
                                    if (resolvedModule.resolvedModule.isExternalLibraryImport) {
                                        importedLibraries.add(moduleName);
                                    }
                                }
                                else {
                                    // Handle unresolved modules (fallback)
                                    if (!moduleName.startsWith('.')) {
                                        importedLibraries.add(moduleName);
                                    }
                                }
                            }
                            return node;
                        };
                        return typescript_1.default.visitEachChild(sourceFile, visitor, context);
                    };
                },
            ],
        },
    });
    var dependencies = Array.from(importedLibraries)
        .filter(function (library) { return !transpiler_1.EXCLUDED_REQUIREMENTS.includes(library); });
    if (dependencies.length) {
        var packageJson = fs_1.default.readFileSync(path_1.default.join(process.cwd(), 'package.json'), 'utf-8');
        try {
            packageJson = JSON.parse(packageJson);
        }
        catch (error) {
            shelljs_1.default.echo(chalk_1.default.yellow('\nWarning:'), 'Failed to parse package.json file in order to read dependencies, there could be issues with some dependencies at the time of deploying the server function.');
        }
        var packageJsonDependencies = packageJson.dependencies || {};
        var packageJsonDevDependencies = packageJson.devDependencies || {};
        var _loop_1 = function (dependency) {
            if (packageJsonDependencies[dependency] || packageJsonDevDependencies[dependency]) {
                return "continue";
            }
            var dependencyParts = dependency.split('/');
            while (dependencyParts.length > 0) {
                dependencyParts.pop();
                var newDependencyPath = dependencyParts.join('/');
                if (packageJsonDependencies[newDependencyPath] || packageJsonDevDependencies[newDependencyPath]) {
                    dependencies = dependencies.map(function (currentDependency) {
                        if (currentDependency === dependency) {
                            return dependencyParts.join('/');
                        }
                        return currentDependency;
                    });
                    break;
                }
            }
        };
        for (var _i = 0, dependencies_1 = dependencies; _i < dependencies_1.length; _i++) {
            var dependency = dependencies_1[_i];
            _loop_1(dependency);
        }
    }
    return dependencies;
};
exports.getDependencies = getDependencies;
var generateTypeSchemas = function (fileName, baseUrl, ignoredTypeNames) {
    var compilerOptions = {
        allowJs: true,
        lib: ['es2015'],
        baseUrl: baseUrl,
    };
    var sourceFile = loadTsSourceFile(fileName);
    var program = typescript_1.default.createProgram([fileName], compilerOptions);
    var schemaDefs = {};
    var settings = {
        required: true,
        noExtraProps: true,
        ignoreErrors: true,
        strictNullChecks: true,
    };
    var generator = TJS.buildGenerator(program, settings);
    /**
     * This functions looks for the type declaration by priority and replaces the data in generator,
     * so the correct schema is generated.
     *
     * @param typeName
     * @param symbolRefs
     */
    var consolidateGeneratorSymbolType = function (typeName, symbolRefs) {
        var tryConsolidationByFile = function (fileName) {
            var symbolRef = symbolRefs.find(function (symbolRef) {
                return symbolRef.symbol.declarations.some(function (declaration) { return declaration.getSourceFile().fileName.includes(fileName); });
            });
            if (symbolRef) {
                var declaredType = program.getTypeChecker().getDeclaredTypeOfSymbol(symbolRef.symbol);
                if (declaredType) {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore hack to replace the symbol with the preferred one
                    generator.allSymbols[typeName] = declaredType;
                    return true;
                }
            }
            return false;
        };
        if (tryConsolidationByFile(fileName)) {
            return;
        }
        tryConsolidationByFile('/node_modules/.poly/');
    };
    var isInnerFunctionNode = function (node) {
        var parent = node.parent;
        var insideBlock = false;
        while (parent) {
            if (parent.kind === typescript_1.default.SyntaxKind.Block) {
                insideBlock = true;
            }
            else if (parent.kind === typescript_1.default.SyntaxKind.FunctionDeclaration && insideBlock) {
                return true;
            }
            parent = parent.parent;
        }
        return false;
    };
    var visitor = function (node) {
        var _a, _b, _c;
        if (typescript_1.default.isUnionTypeNode(node) || typescript_1.default.isIntersectionTypeNode(node)) {
            // create a temporary combined type to get the schema for the union/intersection
            var combinedTypeName = 'CombinedTempType';
            var typeName = node.getText();
            if (ignoredTypeNames === null || ignoredTypeNames === void 0 ? void 0 : ignoredTypeNames.includes(typeName)) {
                return;
            }
            var tempSource = "type ".concat(combinedTypeName, " = ").concat(typeName, ";");
            var tempDir = os_1.default.tmpdir();
            var tempFilePath = path_1.default.join(tempDir, "".concat(crypto_1.default.randomBytes(16).toString('hex'), ".ts"));
            fs_1.default.writeFileSync(tempFilePath, tempSource);
            try {
                var tempCombinedTypeProgram = typescript_1.default.createProgram([fileName, tempFilePath], compilerOptions);
                var schema = TJS.generateSchema(tempCombinedTypeProgram, combinedTypeName, settings, undefined, TJS.buildGenerator(tempCombinedTypeProgram, settings));
                if (schema) {
                    var hasVoidType = node.types.some(function (type) { return type.getText() === 'void'; });
                    if (hasVoidType && typescript_1.default.isUnionTypeNode(node)) {
                        // Check if the union contains 'void' type and if so, add nullable type to the schema
                        if (schema.anyOf) {
                            schema.anyOf.push({ type: 'null' });
                        }
                        else {
                            schema = {
                                $schema: schema.$schema,
                                anyOf: [
                                    __assign(__assign({}, schema), { $schema: undefined }),
                                    { type: 'null' },
                                ],
                            };
                        }
                    }
                    schemaDefs[typeName] = {
                        schema: schema,
                        typeParameterVariations: [],
                    };
                }
            }
            finally {
                fs_1.default.unlinkSync(tempFilePath);
            }
        }
        if (typescript_1.default.isTypeReferenceNode(node) && !isInnerFunctionNode(node)) {
            var typeName = node.typeName.getText();
            if (ignoredTypeNames === null || ignoredTypeNames === void 0 ? void 0 : ignoredTypeNames.includes(typeName)) {
                return;
            }
            var symbolRefs = generator.getSymbols(typeName);
            var isGenericType = ((_a = node.typeArguments) === null || _a === void 0 ? void 0 : _a.length) > 0;
            if (!symbolRefs.length) {
                // not a reference to a type
                return;
            }
            consolidateGeneratorSymbolType(typeName, symbolRefs);
            var typeParameterVariations = ((_b = schemaDefs[typeName]) === null || _b === void 0 ? void 0 : _b.typeParameterVariations) || [];
            if (isGenericType) {
                var symbolRef = symbolRefs[0];
                var typeParameters_1 = [];
                if (typeParameters_1.length === 0 && symbolRef) {
                    // read type parameters from declaration
                    symbolRef.symbol.declarations.forEach(function (declaration) {
                        var _a;
                        if (typescript_1.default.isTypeAliasDeclaration(declaration) || typescript_1.default.isInterfaceDeclaration(declaration) || typescript_1.default.isClassDeclaration(declaration)) {
                            if (declaration.parent && typescript_1.default.isSourceFile(declaration.parent) && declaration.parent.hasNoDefaultLib) {
                                // skipping, this is a default lib
                                return;
                            }
                            typeParameters_1.push.apply(typeParameters_1, ((_a = declaration.typeParameters) === null || _a === void 0 ? void 0 : _a.map(function (typeParameter) { return typeParameter.name.text; })) || []);
                        }
                    });
                }
                if (typeParameters_1.length) {
                    var parameterSchemaTypes_1 = {};
                    typeParameters_1.forEach(function (typeParameter, index) {
                        var typeArgument = node.typeArguments[index];
                        if (typeArgument) {
                            parameterSchemaTypes_1[typeParameter] = typeArgument.getText();
                        }
                    });
                    typeParameterVariations.push(parameterSchemaTypes_1);
                }
            }
            var schema = ((_c = schemaDefs[typeName]) === null || _c === void 0 ? void 0 : _c.schema) || TJS.generateSchema(program, typeName, settings, undefined, generator);
            if (schema) {
                schemaDefs[typeName] = {
                    schema: schema,
                    typeParameterVariations: typeParameterVariations,
                };
            }
        }
        typescript_1.default.forEachChild(node, visitor);
    };
    typescript_1.default.forEachChild(sourceFile, visitor);
    enhanceWithParameterTypeSchemas(schemaDefs);
    return extractSchemas(schemaDefs);
};
exports.generateTypeSchemas = generateTypeSchemas;
var enhanceWithParameterTypeSchemas = function (schemaDefs) {
    Object.keys(schemaDefs)
        .forEach(function (typeName) {
        var schemaDef = schemaDefs[typeName];
        var typeVariations = schemaDef.typeParameterVariations;
        if (!typeVariations.length) {
            return;
        }
        typeVariations.forEach(function (typeVariation) {
            var typeParameters = Object.keys(typeVariation); // e.g. <T, S>
            if (!typeParameters.length) {
                return;
            }
            var parameterTypes = "".concat(Object.values(typeVariation).join(', '));
            var updatedDefinitions = __assign(__assign({}, schemaDef.schema.definitions), typeParameters.reduce(function (acc, typeParameter) {
                var _a;
                var typeParameterSchemaDef = schemaDefs[typeVariation[typeParameter]];
                return (__assign(__assign(__assign({}, acc), typeParameterSchemaDef === null || typeParameterSchemaDef === void 0 ? void 0 : typeParameterSchemaDef.schema.definitions), (_a = {}, _a[typeParameter] = __assign(__assign({}, typeParameterSchemaDef === null || typeParameterSchemaDef === void 0 ? void 0 : typeParameterSchemaDef.schema), { $schema: undefined, definitions: undefined }), _a)));
            }, {}));
            schemaDefs["".concat(typeName, "<").concat(parameterTypes, ">")] = {
                schema: __assign(__assign({}, schemaDef.schema), { definitions: updatedDefinitions }),
            };
        });
    });
};
var extractSchemas = function (schemaDefs) { return Object.keys(schemaDefs)
    .reduce(function (acc, typeName) {
    var _a;
    return __assign(__assign({}, acc), (_a = {}, _a[typeName] = schemaDefs[typeName].schema, _a));
}, {}); };
var parseDeployComment = function (comment) {
    // Poly deployed @ 2024-08-29T22:46:46.791Z - test.weeklyReport - https://develop-k8s.polyapi.io/canopy/polyui/collections/server-functions/f0630f95-eac8-4c7d-9d23-639d39034bb6 - e3b0c44
    var match = comment.match(/^\s*(?:\/\/\s*)*Poly deployed @ (\S+) - (\S+)\.([^.]+) - (https?:\/\/[^/]+)\/\S+\/(\S+)s\/(\S+) - (\S+)$/);
    if (!match)
        return null;
    var deployed = match[1], context = match[2], name = match[3], instance = match[4], type = match[5], id = match[6], fileRevision = match[7];
    return {
        name: name,
        context: context,
        type: type,
        id: id,
        deployed: deployed,
        fileRevision: fileRevision,
        // Local development puts canopy on a different port than the poly-server
        instance: instance.endsWith('localhost:3000') ? instance.replace(':3000', ':8000') : instance,
    };
};
exports.parseDeployComment = parseDeployComment;
// Function to extract leading comments from the source file
var getDeployComments = function (sourceFile) {
    var text = sourceFile.getFullText();
    var matches = [];
    var ranges = [];
    var leadingRanges = typescript_1.default.getLeadingCommentRanges(text, 0);
    if (leadingRanges) {
        for (var _i = 0, leadingRanges_1 = leadingRanges; _i < leadingRanges_1.length; _i++) {
            var range = leadingRanges_1[_i];
            var comment = text.substring(range.pos, range.end);
            var match = (0, exports.parseDeployComment)(comment.trim());
            if (match) {
                matches.push(match);
                ranges.push([range.pos, range.end + (range.hasTrailingNewLine ? 1 : 0)]);
            }
        }
    }
    return [matches, ranges];
};
// Function to extract the PolyServerFunction config
var getPolyConfig = function (types, sourceFile) {
    var config = null;
    var visit = function (node) {
        var _a;
        if (typescript_1.default.isVariableStatement(node)) {
            var declaration = node.declarationList.declarations[0];
            var name_1 = declaration.name.getText(sourceFile);
            var type_1 = (_a = declaration.type) === null || _a === void 0 ? void 0 : _a.getText(sourceFile);
            if (name_1 === 'polyConfig' && type_1 && types.includes(type_1)) {
                var initializer = node.declarationList.declarations[0].initializer;
                if (initializer && typescript_1.default.isObjectLiteralExpression(initializer)) {
                    // eval() is generally considered harmful
                    // but since we're running entirely client side on user-provided code
                    // and since these configs are type-safe we're going to allow it
                    // eslint-disable-next-line no-eval
                    config = eval("(".concat(initializer.getText(), ")"));
                    config.type = type_1;
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(sourceFile);
    var name = config.name, context = config.context, type = config.type, description = config.description, other = __rest(config, ["name", "context", "type", "description"]);
    if (!name)
        throw new Error("polyConfig is missing 'name'.");
    if (!context)
        throw new Error("polyConfig is missing 'context'.");
    return { name: name, context: context, type: type, description: description, config: other };
};
// Helper function to parse JSDoc tags into an object
var parseJSDoc = function (node) {
    var _a;
    var jsDocTags = null;
    var jsDoc = node.getChildren().filter(typescript_1.default.isJSDoc);
    if (jsDoc.length > 0) {
        jsDocTags = {
            description: '',
            params: [],
            returns: {
                type: 'void',
                description: '',
            },
        };
        var firstJsDoc = jsDoc[0];
        jsDocTags.description = firstJsDoc.comment ? typescript_1.default.getTextOfJSDocComment(firstJsDoc.comment) : '';
        (_a = firstJsDoc.tags) === null || _a === void 0 ? void 0 : _a.forEach(function (tag) {
            var _a, _b;
            var tagName = tag.tagName.text;
            var tagComment = typescript_1.default.getTextOfJSDocComment(tag.comment) || '';
            if (tagName === 'param' && typescript_1.default.isJSDocParameterTag(tag)) {
                var paramDetails = tagComment.split(/[\s-]+/);
                var paramName = tag.name.getText();
                var paramType = ((_a = tag.typeExpression) === null || _a === void 0 ? void 0 : _a.getText().replace(/^{|}$/g, '')) || '';
                var paramDescription = paramDetails.join(' ').trim();
                jsDocTags.params.push({
                    name: paramName,
                    type: paramType,
                    description: paramDescription,
                });
            }
            else if (tagName === 'returns' && typescript_1.default.isJSDocReturnTag(tag)) {
                jsDocTags.returns = {
                    type: ((_b = tag.typeExpression) === null || _b === void 0 ? void 0 : _b.getText().replace(/^{|}$/g, '')) || '',
                    description: tagComment.trim(),
                };
            }
            else {
                jsDocTags[tagName] = tagComment.trim();
            }
        });
    }
    return jsDocTags;
};
var parseTSTypes = function (node, sourceFile) {
    var _a;
    var params = node.parameters.map(function (param) {
        var _a;
        var name = param.name.getText(sourceFile);
        var type = (_a = param.type) === null || _a === void 0 ? void 0 : _a.getText(sourceFile);
        if (!type)
            throw new Error("Missing type for function argument '".concat(name, "' in file '").concat(sourceFile.fileName, "'."));
        return {
            name: name,
            type: type,
            description: '',
        };
    });
    var type = (_a = node.type) === null || _a === void 0 ? void 0 : _a.getText(sourceFile);
    if (!type)
        throw new Error("Missing return type for function in file '".concat(sourceFile.fileName, "'. Use 'void' if no return type."));
    var returns = {
        type: type,
        description: '',
    };
    return {
        params: params,
        returns: returns,
        description: '',
    };
};
// Function to extract function details including JSDoc, arguments, and return type
var getFunctionDetails = function (sourceFile, functionName) {
    var functionDetails = null;
    var dirty = false; // Dirty means that something needs fixed in the file
    var visit = function (node) {
        var _a;
        if (typescript_1.default.isFunctionDeclaration(node) && ((_a = node.name) === null || _a === void 0 ? void 0 : _a.getText(sourceFile)) === functionName) {
            var jsDoc_1 = parseJSDoc(node);
            var types_1 = parseTSTypes(node, sourceFile);
            if (jsDoc_1 &&
                types_1.params.every(function (p, i) { return p.type === jsDoc_1.params[i].type && p.name === jsDoc_1.params[i].name; }) &&
                types_1.returns.type === jsDoc_1.returns.type) {
                // Try to preserve JSDoc descriptions if things haven't changed
                jsDoc_1.params.forEach(function (p, i) {
                    types_1.params[i].description = p.description;
                });
                types_1.returns.description = jsDoc_1.returns.description;
                types_1.description = jsDoc_1.description;
                dirty = types_1.params.some(function (p, i) { return p.type !== jsDoc_1.params[i].type || p.name !== jsDoc_1.params[i].name; });
            }
            else {
                dirty = true;
            }
            var docStartIndex = node.getStart(sourceFile, true);
            var docEndIndex = node.getStart(sourceFile, false);
            functionDetails = {
                types: types_1,
                docStartIndex: docStartIndex,
                docEndIndex: docEndIndex,
                dirty: dirty,
            };
        }
        else {
            typescript_1.default.forEachChild(node, visit);
        }
    };
    visit(sourceFile);
    if (!functionDetails)
        throw new Error("Failed to find a function named '".concat(functionName, "' within file '").concat(sourceFile.fileName, "'. Verify that your polyConfig name matches a valid function declared within the same file."));
    return functionDetails;
};
var parseDeployableFunction = function (sourceFile, polyConfig, baseUrl, fileRevision, gitRevision) {
    var _a = getDeployComments(sourceFile), deployments = _a[0], deploymentCommentRanges = _a[1];
    var functionDetails = getFunctionDetails(sourceFile, polyConfig.name);
    var dependencies = (0, exports.getDependencies)(sourceFile.getFullText(), sourceFile.fileName, baseUrl);
    var typeSchemas = (0, exports.generateTypeSchemas)(sourceFile.fileName, baseUrl, deployables_1.DeployableTypeEntries.map(function (d) { return d[0]; }));
    return __assign(__assign(__assign({}, polyConfig), functionDetails), { deployments: deployments, deploymentCommentRanges: deploymentCommentRanges, dependencies: dependencies, typeSchemas: typeSchemas, fileRevision: fileRevision, gitRevision: gitRevision, file: sourceFile.fileName });
};
var parseWebhook = function (sourceFile, polyConfig, baseUrl, fileRevision, gitRevision) {
    var deployments = getDeployComments(sourceFile)[0];
    return __assign(__assign({}, polyConfig), { deployments: deployments, fileRevision: fileRevision, gitRevision: gitRevision, file: sourceFile.fileName });
};
var parseDeployable = function (filePath, baseUrl, gitRevision) { return __awaiter(void 0, void 0, void 0, function () {
    var sourceFile, polyConfig, fileContents, fileRevision;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, loadTsSourceFile(filePath)];
            case 1:
                sourceFile = _a.sent();
                polyConfig = getPolyConfig(deployables_1.DeployableTypeEntries.map(function (e) { return e[0]; }), sourceFile);
                polyConfig.type = deployables_1.DeployableTsTypeToName[polyConfig.type];
                fileContents = sourceFile.getFullText();
                fileRevision = (0, deployables_1.getDeployableFileRevision)(fileContents);
                try {
                    switch (polyConfig.type) {
                        case 'server-function':
                        case 'client-function':
                            return [2 /*return*/, [parseDeployableFunction(sourceFile, polyConfig, baseUrl, fileRevision, gitRevision), fileContents]];
                        case 'webhook':
                            return [2 /*return*/, [parseWebhook(sourceFile, polyConfig, baseUrl, fileRevision, gitRevision), fileContents]];
                    }
                    throw new Error('Invalid Poly deployment with unsupported type');
                }
                catch (err) {
                    console.error("Prepared ".concat(polyConfig.type.replaceAll('-', ' '), " ").concat(polyConfig.context, ".").concat(polyConfig.name, ": ERROR"));
                    console.error(err);
                }
                return [2 /*return*/];
        }
    });
}); };
exports.parseDeployable = parseDeployable;
