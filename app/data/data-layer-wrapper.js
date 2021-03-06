"use strict";

/*jslint white: true, todo: true */
/*global require: true, module: true */

var Deferred = require('Deferred'),
    MongoDBManagment = require("../../lib/mongodb-deferred.js"),
    callWithFirstInArray = require("../../lib/callWithFirstInArray.js"),
    requestHTTPDeferred = require("../../lib/requestHTTPDeferred.js"),
    deepCleanKeysFromDots = require("../../lib/deepCleanKeysFromDots.js"),
    toObjectID = require("../../lib/toObjectID.js"),

    // TODO: simplify this code, to avoid generating functions?
    generate = function(options) {
        var generateUsers = function() {
            // TODO: class inheritance/aliasing, prototype chain stuffs
            var Users = new MongoDBManagment.Server(options.uri).getDatabase(options.databaseName).getCollection("users");

            Users.getOrCreate = function(username) {
                var deferred = new Deferred(),
                    userToFind = {
                        username: username
                    };

                this.findOne(userToFind)
                    .fail(deferred.reject)
                    .done(function(user) {
                        if (user) {
                            deferred.resolve(user);
                        } else {
                            this.insert(userToFind)
                                .fail(deferred.reject)
                                .done(callWithFirstInArray(deferred.resolve));
                        }
                    }.bind(this));

                return deferred.promise();
            }.bind(Users);

            return Users;
        },

            generateHttpCache = function() {
                // TODO: class inheritance/aliasing, prototype chain stuffs
                var HttpCache = new MongoDBManagment.Server(options.uri).getDatabase(options.databaseName).getCollection("http-cache");

                HttpCache.getLatestOne = function(url) {
                    var deferred = new Deferred();

                    this.findOne({
                        url: url
                    }, null, {
                        sort: [
                            ["retrievedAt", "desc"]
                        ]
                    })
                        .fail(deferred.reject)
                        .done(deferred.resolve);

                    return deferred.promise();
                }.bind(HttpCache);

                HttpCache.requestAndCache = function(url, acceptNotOnlyHttpStatus200) {
                    var deferred = new Deferred();

                    acceptNotOnlyHttpStatus200 = acceptNotOnlyHttpStatus200 === true;

                    requestHTTPDeferred(url)
                        .fail(deferred.reject)
                        .done(function(response, body) {
                            var toCache;

                            if (!acceptNotOnlyHttpStatus200 && response.statusCode !== 200) {
                                deferred.reject(response.statusCode, response);
                            } else {
                                toCache = {
                                    url: url,
                                    retrievedAt: new Date().valueOf(),
                                    response: deepCleanKeysFromDots(response.toJSON()),
                                    body: body.toString()
                                };

                                this.insert(toCache)
                                    .fail(deferred.reject)
                                    .done(callWithFirstInArray(deferred.resolve));
                            }
                        }.bind(this));

                    return deferred.promise();
                }.bind(HttpCache);

                HttpCache.getLatestOneOrRequestAndCache = function(url, acceptNotOnlyHttpStatus200) {
                    var deferred = new Deferred();

                    this.getLatestOne(url)
                        .fail(deferred.reject)
                        .done(function(cached) {
                            if (!cached) {
                                this.requestAndCache(url, acceptNotOnlyHttpStatus200)
                                    .fail(deferred.reject)
                                    .done(deferred.resolve);
                            } else {
                                deferred.resolve(cached);
                            }
                        }.bind(this));

                    return deferred.promise();
                }.bind(HttpCache);

                return HttpCache;
            },

            generateDumped = function() {
                // TODO: class inheritance/aliasing, prototype chain stuffs
                var Dumped = new MongoDBManagment.Server(options.uri).getDatabase(options.databaseName).getCollection("dumped");

                Dumped.getLatestOne = function(user_id) {
                    var deferred = new Deferred();

                    this.findOne({
                        user_id: toObjectID(user_id)
                    }, null, {
                        sort: [
                            ["generatedAt", "desc"]
                        ]
                    })
                        .fail(deferred.reject)
                        .done(deferred.resolve);

                    return deferred.promise();
                }.bind(Dumped);

                return Dumped;
            },

            extractDatabaseName = function(uri) {
                // TODO: replace with some uri library
                var uriParts = uri.split("/"),
                    dbName = uriParts[uriParts.length - 1].split("?")[0];

                return dbName;
            },

            prepareOptions = function() {
                options.databaseName = extractDatabaseName(options.uri);
            },

            generateApi = function() {
                var generatedApi = {
                    Users: generateUsers(),
                    HttpCache: generateHttpCache(),
                    Dumped: generateDumped()
                };

                return generatedApi;
            },

            init = function() {
                prepareOptions();
                api = generateApi();
            },

            api;

        init();

        return api;
    },

    api = generate;

module.exports = api;