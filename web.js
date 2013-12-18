"use strict";

/*jslint white: true, todo: true */
/*global require: true, process: true, __dirname: true, console: true, JoelPurra: true */

var express = require('express'),
    cheerio = require("cheerio"),
    extend = require("extend"),
    Deferred = require('Deferred'),
    app = express(),
    JoelPurra = JoelPurra || {},
    port = process.env.PORT || 5000,
    mongoUri = process.env.MONGOLAB_URI || 'mongodb://localhost/',
    mongoDbName = "claimid-dump",
    dumpedDataVersion = 0,
    toObjectID = (function(ObjectID) {
        function toObjectID(id) {
            if (!(id instanceof ObjectID)) {
                return new ObjectID(id);
            }

            return id;
        }

        return toObjectID;
    }(require('mongodb').ObjectID)),
    deepCleanKeysFromDots = function(obj) {
        function isObject(obj) {
            var result = (typeof obj === 'object' || typeof obj === 'function') && (obj !== null);

            return result;
        }

        if (isObject(obj)) {
            Object.keys(obj).forEach(function(key) {
                var clean = key.replace(/\./g, "___dot___");

                obj[clean] = deepCleanKeysFromDots(obj[key]);

                if (clean !== key) {
                    delete obj[key];
                }
            });
        }

        return obj;
    },
    callWithFirstInArray = function(fn, context) {
        context = context || null;
        var wrapped = function(array) {
            return fn.call(context, array[0]);
        }

        return wrapped;
    },
    getClaimIdUrl = function(username) {
        // This function is modified client side code, and should be rewritten to more of a server side format.
        var claimIdBaseUrl = "http://claimid.com/",
            claimIdUrl = claimIdBaseUrl + username;

        return claimIdUrl;
    },
    getClaimIdCacheUrl = function(username) {
        // This function is modified client side code, and should be rewritten to more of a server side format.
        var googleCacheBaseUrl = "http://webcache.googleusercontent.com/search?q=cache:",

            encodeUrl = function(url) {
                return encodeURI(url);
            },

            claimIdUrl = getClaimIdUrl(username),

            url = googleCacheBaseUrl + encodeUrl(claimIdUrl);

        return url;
    },
    requestHTTPDeferred = (function(request) {
        var wrappedRequest = function(url) {
            var deferred = new Deferred();

            request(url, function(error, response, body) {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve(response, body);
                }
            });

            return deferred;
        };

        return wrappedRequest;
    }(require("request"))),
    MongoDBManagment = (function(mongo) {
        function Server(uri) {
            this.uri = uri;

            return this;
        }

        function Database(server, name) {
            this.server = server;
            this.name = name;

            return this;
        }

        function Collection(database, name) {
            this.database = database;
            this.name = name;

            return this;
        }

        Server.prototype.with = function() {
            var deferred = new Deferred(),
                // TODO: Use configurabe mongodb:// uri
                mongoClient = new mongo.MongoClient(new mongo.Server("localhost", 27017));

            mongoClient.open(function(error, mongoClient) {
                if (error) {
                    deferred.reject(error);
                }

                // TODO: mongoClient.close();
                deferred.resolve(mongoClient);
            });

            return deferred.promise();
        };

        Server.prototype.getDatabase = function(name) {
            return new Database(this, name);
        };

        Database.prototype.with = function() {
            var deferred = new Deferred();

            this.server.with()
                .fail(deferred.reject)
                .done(function(mongoClient) {
                    var database = mongoClient.db(this.name);

                    deferred.resolve(database);
                }.bind(this));

            return deferred.promise();
        };

        Database.prototype.getCollection = function(name) {
            return new Collection(this, name);
        };

        Collection.prototype.with = function() {
            var deferred = new Deferred();

            this.database.with()
                .fail(deferred.reject)
                .done(function(database) {
                    database.collection(this.name, function(error, collection) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(collection);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.find = function(query, fields, options) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.findOne(query, fields, options, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.findOne = function(query, fields, options) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.findOne(query, fields, options, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.get = function(_id) {
            var deferred = new Deferred();

            this.findOne(toObjectID(_id))
                .fail(deferred.reject)
                .done(deferred.resolve);

            return deferred.promise();
        };

        Collection.prototype.insert = function(object) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.insert(object, {
                        safe: true
                    }, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.remove = function(_id) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.remove({
                        _id: toObjectID(_id)
                    }, {
                        safe: true
                    }, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.save = function(object) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.save(object, {
                        safe: true
                    }, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.getOrInsert = function(object) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.findOne(object._id, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        if (!result) {
                            this.insert(object)
                                .fail(deferred.reject)
                                .done(callWithFirstInArray(deferred.resolve));
                        } else {
                            deferred.resolve(result);
                        }
                    });
                }.bind(this));

            return deferred.promise();
        };

        var api = {
            Server: Server
        };

        return api;
    }(require('mongodb'))),
    DB = {
        Users: (function() {
            // TODO: class inheritance/aliasing, prototype chain stuffs
            var Users = new MongoDBManagment.Server(mongoUri).getDatabase(mongoDbName).getCollection("users");

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

                return deferred;
            }.bind(Users);

            return Users;
        }()),
        HttpCache: (function() {
            // TODO: class inheritance/aliasing, prototype chain stuffs
            var HttpCache = new MongoDBManagment.Server(mongoUri).getDatabase(mongoDbName).getCollection("http-cache");

            HttpCache.getLatestOne = function(url) {
                var deferred = new Deferred();

                this.findOne({
                    url: url
                }, undefined, {
                    sort: [
                        ["retrievedAt", "desc"]
                    ]
                })
                    .fail(deferred.reject)
                    .done(deferred.resolve);

                return deferred;
            }.bind(HttpCache);

            HttpCache.requestAndCache = function(url, acceptNotOnlyHttpStatus200) {
                var deferred = new Deferred();

                requestHTTPDeferred(url)
                    .fail(deferred.reject)
                    .done(function(response, body) {
                        var toCache;

                        acceptNotOnlyHttpStatus200 = acceptNotOnlyHttpStatus200 === true;

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

                return deferred;
            }.bind(HttpCache);

            HttpCache.getLatestOneOrRequestAndCache = function(url) {
                var deferred = new Deferred();

                this.getLatestOne(url)
                    .fail(deferred.reject)
                    .done(function(cached) {
                        if (!cached) {
                            this.requestAndCache(url)
                                .fail(deferred.reject)
                                .done(deferred.resolve);
                        } else {
                            deferred.resolve(cached);
                        }
                    }.bind(this));

                return deferred;
            }.bind(HttpCache);

            return HttpCache;
        }()),
        Dumped: (function() {
            // TODO: class inheritance/aliasing, prototype chain stuffs
            var Dumped = new MongoDBManagment.Server(mongoUri).getDatabase(mongoDbName).getCollection("dumped");

            Dumped.getLatestOne = function(user_id) {
                var deferred = new Deferred();

                this.findOne({
                    user_id: toObjectID(user_id)
                }, undefined, {
                    sort: [
                        ["generatedAt", "desc"]
                    ]
                })
                    .fail(deferred.reject)
                    .done(deferred.resolve);

                return deferred;
            }.bind(Dumped);

            return Dumped;
        }())
    };

app.use(express.logger());

(function(namespace, pluginName) {
    // This function quite obviously is a modified client side plugin, and should be rewritten to more of a server side format.
    var $,

        dateFormatRx = /\d{4}-\d{2}-\d{2}/,

        internal = {
            extractLink: function() {
                var $this = $(this),
                    $link = $this.find(".taggedlink"),
                    who = $this.find(".info_link").text().split("&nbsp;")[0].split("|").map(function(str) {
                        return str.trim().split("\n")[0].trim();
                    }),
                    result = {
                        url: $link.attr("href"),
                        title: $link.text().trim(),
                        tags: $this.find("[rel~=tag]").map(function() {
                            return $(this).text();
                        }),
                        description: $this.find(".public_description").first().text(),
                        added: $this.find(".date_added").text().match(dateFormatRx)[0],
                        date: $this.find(".date").text(),
                        about: who[0],
                        by: who[1],
                        color: $this.find("a").first().find("img").attr("alt").replace("Star_", "")
                    };

                return result;
            },

            extractGroup: function() {
                var $this = $(this),
                    titleHtml = $this.find(".group_header").first().html(),
                    result = {
                        title: titleHtml.substring(0, titleHtml.indexOf("<")).trim(),
                        description: $this.find(".group_description .text").text(),
                        links: $this.find(".xfolkentry").map(internal.extractLink)
                    };

                return result;
            },

            getCachedDate: function() {
                try {
                    var div = $("div div").first();
                    var text = div.text();
                    var gmtSplit = text.split("GMT");
                    console.log("gmtSplit", gmtSplit)
                    var appearSplit = gmtSplit[0].trim().split("appeared on");
                    var dateTimeUtcValue = new Date(appearSplit[1].trim() + " GMT").valueOf();

                    return dateTimeUtcValue;
                } catch (e) {
                    console.error("Could not parse the cache date.")
                }

                return undefined;
            },

            getCachedUrl: function() {
                try {
                    var url = $("div div").first().find("a").first().attr("href");

                    return url;
                } catch (e) {
                    console.error("Could not parse the cache date.")
                }

                return undefined;
            },

            dump: function($context) {
                var groups = $(".display_group", $context),
                    result = {
                        cachedUrl: internal.getCachedUrl(),
                        cachedAt: internal.getCachedDate(),
                        groups: groups.length === 0 ? undefined : groups.map(internal.extractGroup)
                    };

                return result;
            }
        },

        plugin = {
            dump: function(cheerio, $context) {
                $ = cheerio;
                return internal.dump($context);
            }
        },

        init = function() {
            namespace[pluginName] = plugin;
        };

    init();

}(JoelPurra, "claimIdDump"));

app.get("/dump/", function(request, response, next) {
    function checkAndClean(str, disallowedRx, allowedRx) {
        if (disallowedRx.test(str) || !allowedRx.test(str)) {
            response.send(422);
        }

        return str;
    }

    function checkAndCleanUsername(username) {
        var clean = checkAndClean(username, /[^a-z0-9\-]/i, /^[a-z0-9\-]{1,64}$/i);

        clean = clean.toLowerCase();

        return clean;
    }

    function handleError(error) {
        throw error;
    }

    var username = checkAndCleanUsername(request.query.username),
        url = getClaimIdCacheUrl(username);

    DB.Users.getOrCreate(username)
        .fail(handleError)
        .done(function(user) {
            // TODO DEBUG: currently forcing requests
            DB.HttpCache.getLatestOneOrRequestAndCache(url)
            //DB.HttpCache.requestAndCache(url)
            .fail(function(error, responseHttp) {
                if (typeof error === "number" && error >= 100 && error <= 999) {
                    response.send(error);
                } else {
                    handleError(error);
                }
            })
                .done(function(cachedRequest) {
                    DB.Dumped.getLatestOne(user._id)
                        .fail(handleError)
                        .done(function(cachedDump) {
                            function getResult(user, cachedRequest, generatedAt, dumped) {
                                var meta = {
                                    username: user.username,
                                    generatedAt: generatedAt,
                                    cacheUrl: cachedRequest.url
                                },
                                    result = extend({}, meta, dumped);

                                return result;
                            }

                            function send(result) {
                                response.json(result);
                            }

                            function handleCachedDump(fromCache) {
                                var result = fromCache.data;

                                send(result);
                            }

                            if (!cachedDump) {
                                var $ = cheerio.load(cachedRequest.body),
                                    dumped = JoelPurra.claimIdDump.dump($),
                                    generatedAt = new Date().valueOf(),
                                    result = getResult(user, cachedRequest, generatedAt, dumped),
                                    toCache = {
                                        user_id: user._id,
                                        httpCache_id: cachedRequest._id,
                                        generatedAt: generatedAt,
                                        version: dumpedDataVersion,
                                        data: result
                                    };

                                DB.Dumped.insert(toCache)
                                    .fail(handleError)
                                    .done(callWithFirstInArray(handleCachedDump));
                            } else {
                                handleCachedDump(cachedDump);
                            }
                        });
                });
        });
});

app.use(express.static(__dirname + '/public'));

app.listen(port, function() {
    console.log("Listening on " + port);
});