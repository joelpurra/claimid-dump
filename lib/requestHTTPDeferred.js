var request = require("request"),
    Deferred = require('Deferred'),

    requestHTTPDeferred = function(url) {
        var deferred = new Deferred();

        request(url, function(error, response, body) {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(response, body);
            }
        });

        return deferred.promise();
    },

    api = requestHTTPDeferred;

module.exports = api;